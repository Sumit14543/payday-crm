import { getCachedLocation } from "./location";

const API_BASE_URL = resolveApiBaseUrl();
const AUTH_STORAGE_KEY = "paydayops.auth.user";
const AUTH_REQUIRED_EVENT = "paydayops:auth-required";

function resolveApiBaseUrl() {
  const configuredUrl = import.meta.env.VITE_API_URL || "/api";
  const forceDirectApi = import.meta.env.VITE_FORCE_DIRECT_API === "true";

  if (typeof window === "undefined" || !configuredUrl.startsWith("http")) {
    return configuredUrl;
  }

  const currentHost = window.location.hostname;
  const isVercelFrontend = currentHost.endsWith(".vercel.app");
  if (isVercelFrontend && !forceDirectApi) {
    return "/api";
  }

  return configuredUrl;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/$/, "");
}

function resolveBackendBaseUrl() {
  const apiBaseUrl = trimTrailingSlash(API_BASE_URL);
  if (!apiBaseUrl || apiBaseUrl === "/api") return "";
  if (/^https?:\/\//i.test(apiBaseUrl)) return apiBaseUrl.replace(/\/api$/i, "");
  return apiBaseUrl.replace(/\/api$/i, "");
}

export function resolveBackendUploadBaseUrl() {
  const configuredUrl = trimTrailingSlash(String(import.meta.env.VITE_DOCUMENT_BASE_URL || ""));
  if (configuredUrl) return configuredUrl;

  const backendBaseUrl = resolveBackendBaseUrl();
  return backendBaseUrl ? `${backendBaseUrl}/uploads` : "/uploads";
}

export function resolveBackendUploadUrl(path: string) {
  const cleanPath = String(path || "").replace(/^\/+/, "").replace(/^uploads\//i, "");
  const uploadBaseUrl = resolveBackendUploadBaseUrl();
  return cleanPath ? `${uploadBaseUrl}/${cleanPath}` : uploadBaseUrl;
}

export type ApiResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
};

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const separator = path.includes("?") ? "&" : "?";
  const url = `${API_BASE_URL}${path}${separator}_t=${Date.now()}`;
  const response = await fetch(url, { headers: authHeaders(path), signal });
  return readApiResponse<T>(response, path);
}

export async function apiPost<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { ...authHeaders(path), "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  return readApiResponse<T>(response, path);
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "PATCH",
    headers: { ...authHeaders(path), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readApiResponse<T>(response, path);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "DELETE",
    headers: authHeaders(path),
  });
  return readApiResponse<T>(response, path);
}

export async function apiGetBlob(path: string): Promise<Blob> {
  const requestUrl = resolveBlobUrl(path);
  const response = await fetch(requestUrl, { headers: authHeaders(path) });
  if (!response.ok) {
    handleAuthenticationFailure(response, requestUrl);
    const text = await response.text();
    if (text) {
      try {
        const payload = JSON.parse(text) as { message?: string };
        throw new Error(payload.message || `Unable to download document (${response.status})`);
      } catch (error) {
        if (error instanceof Error && !error.message.startsWith('Unexpected token')) throw error;
      }
    }
    throw new Error(`Unable to download document (${response.status})`);
  }

  return response.blob();
}

function resolveBlobUrl(path: string) {
  const value = String(path || "").trim();
  if (!value) return value;

  const uploadPath = extractUploadPath(value);
  if (uploadPath) {
    return `${API_BASE_URL}/files/download?path=${encodeURIComponent(uploadPath)}`;
  }

  if (value.startsWith("/api/")) {
    return `${API_BASE_URL}${value.replace(/^\/api/, "")}`;
  }

  if (value.startsWith("/")) {
    return `${API_BASE_URL}${value}`;
  }

  return value;
}

function extractUploadPath(value: string) {
  if (value.startsWith("/uploads/")) return value;

  if (!/^https?:\/\//i.test(value)) return "";

  try {
    const url = new URL(value);
    const apiUrl = API_BASE_URL.startsWith("http") ? new URL(API_BASE_URL) : null;
    const documentBaseUrl = resolveBackendUploadBaseUrl();
    const documentUrl = documentBaseUrl.startsWith("http") ? new URL(documentBaseUrl) : null;
    const isCurrentApiHost = apiUrl ? url.host === apiUrl.host : url.host === window.location.host;
    const isDocumentHost = documentUrl ? url.host === documentUrl.host : false;
    return (isCurrentApiHost || isDocumentHost) && url.pathname.startsWith("/uploads/") ? url.pathname : "";
  } catch {
    return "";
  }
}

export async function apiPostForm<T>(path: string, body: FormData): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: authHeaders(path),
    body,
  });
  return readApiResponse<T>(response, path);
}

let cachedClientIp = "";
let clientIpFetching = false;

export function initClientIpDetection() {
  if (typeof window === "undefined" || cachedClientIp || clientIpFetching) return;
  clientIpFetching = true;
  
  fetch("https://api.ipify.org?format=json")
    .then((res) => res.json())
    .then((data) => {
      if (data && data.ip) {
        cachedClientIp = String(data.ip).trim();
      }
    })
    .catch(() => {
      fetch("https://ipwho.is/")
        .then((res) => res.json())
        .then((data) => {
          if (data && data.ip) {
            cachedClientIp = String(data.ip).trim();
          }
        })
        .catch(() => {});
    })
    .finally(() => {
      clientIpFetching = false;
    });
}

if (typeof window !== "undefined") {
  initClientIpDetection();
}

function isProductAdminPath(path: string): boolean {
  return path.startsWith("/superadmin") || path.startsWith("/dashboard") || path.startsWith("/product-admin");
}

function authHeaders(path?: string): HeadersInit {
  if (typeof window === "undefined") return {};

  try {
    const isSuperadminPath = path && path.startsWith("/superadmin");
    const storageKey = isSuperadminPath ? "paydayops.auth.superadmin" : AUTH_STORAGE_KEY;
    let rawUser = localStorage.getItem(storageKey);

    if (!rawUser && !isSuperadminPath) {
      rawUser = localStorage.getItem("paydayops.auth.superadmin");
    }

    if (!rawUser && isSuperadminPath) {
      const mainUser = localStorage.getItem(AUTH_STORAGE_KEY);
      if (mainUser) {
        try {
          const stored = JSON.parse(mainUser);
          if (stored.token && (stored.user?.role === "superadmin" || stored.user?.role === "product-admin")) {
            rawUser = mainUser;
          }
        } catch {
          // Ignore parse errors
        }
      }
    }

    const tenantSlug = typeof window !== 'undefined' ? window.location.hostname.split('.')[0] : '';
    const headers: Record<string, string> = {
      "X-Tenant-Slug": tenantSlug,
    };

    const loc = getCachedLocation();
    if (loc?.formattedLocation) {
      headers["X-Client-Location"] = loc.formattedLocation;
      headers["X-Client-City"] = loc.city || "";
      headers["X-Client-State"] = loc.region || "";
    }
    if (loc?.ip || cachedClientIp) {
      headers["X-Client-Ip"] = loc?.ip || cachedClientIp;
    }

    if (!rawUser) return headers;

    const stored = JSON.parse(rawUser) as { token?: string; user?: { email?: string; name?: string; role?: string } };
    if (stored.token) {
      return {
        ...headers,
        Authorization: `Bearer ${stored.token}`,
      };
    }

    const user = stored.user || stored as { email?: string; name?: string; role?: string };
    return {
      ...headers,
      "X-User-Email": user.email || "",
      "X-User-Name": user.name || "",
      "X-User-Role": user.role || "",
    };
  } catch {
    const tenantSlug = typeof window !== 'undefined' ? window.location.hostname.split('.')[0] : '';
    const headers: Record<string, string> = {
      "X-Tenant-Slug": tenantSlug,
    };
    const loc = getCachedLocation();
    if (loc?.formattedLocation) {
      headers["X-Client-Location"] = loc.formattedLocation;
    }
    if (loc?.ip || cachedClientIp) {
      headers["X-Client-Ip"] = loc?.ip || cachedClientIp;
    }
    return headers;
  }
}

async function readApiResponse<T>(response: Response, path: string): Promise<T> {
  const text = await response.text();
  let payload: any = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`API returned non-JSON response (${response.status})`);
    }
  }

  if (!payload) {
    if (!response.ok) {
      handleAuthenticationFailure(response, path);
      throw new Error(`API request failed (${response.status})`);
    }
    return {} as T;
  }

  if (!response.ok || (payload.success !== undefined && !payload.success)) {
    handleAuthenticationFailure(response, path);
    throw new Error(payload?.message || `API request failed (${response.status})`);
  }

  if (payload.data !== undefined) {
    if (payload.pagination && Array.isArray(payload.data)) {
      Object.defineProperty(payload.data, 'pagination', {
        value: payload.pagination,
        enumerable: false,
        writable: true,
        configurable: true,
      });
    }
    return payload.data as T;
  }

  return payload as T;
}

function handleAuthenticationFailure(response: Response, path: string) {
  if (response.status !== 401 || path === "/auth/login") return;

  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem("paydayops.auth.superadmin");
    localStorage.removeItem("paydayops.activeRole");
    window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
  } catch {
    // Ignore storage/event failures; the original API error is still thrown.
  }
}

export { AUTH_REQUIRED_EVENT, AUTH_STORAGE_KEY };
