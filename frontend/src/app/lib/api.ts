import { getCachedLocation } from "./location";

const API_BASE_URL = resolveApiBaseUrl();
const AUTH_STORAGE_KEY = "paydayops.auth.user";
const AUTH_REQUIRED_EVENT = "paydayops:auth-required";
const responseIdentities = new WeakMap<Response, string>();
async function apiFetch(input: RequestInfo | URL, options?: RequestInit): Promise<Response> {
  const identity = getAuthToken();
  const result = await fetch(input, options);
  responseIdentities.set(result, identity);
  return result;
}

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

export function getAuthToken(): string {
  if (typeof window === "undefined") return "";
  try {
    const isSuperadmin = localStorage.getItem("paydayops.auth.superadmin");
    const user = localStorage.getItem(AUTH_STORAGE_KEY);
    const rawUser = isSuperadmin || user;
    if (!rawUser) return "";
    const stored = JSON.parse(rawUser);
    return stored.token || "";
  } catch {
    return "";
  }
}

export function resolveBackendUploadBaseUrl() {
  const configuredUrl = trimTrailingSlash(String(import.meta.env.VITE_DOCUMENT_BASE_URL || ""));
  if (configuredUrl) return configuredUrl;

  const backendBaseUrl = resolveBackendBaseUrl();
  return backendBaseUrl ? `${backendBaseUrl}/uploads` : "/uploads";
}

export function getDocumentToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    const raw = localStorage.getItem('paydayops.auth.superadmin') || localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw).documentToken || '' : '';
  } catch { return ''; }
}
function isTrustedDocumentUrl(value: string) {
  if (!/^https?:\/\//i.test(value)) return value.startsWith('/') && !value.startsWith('//');
  try {
    const target = new URL(value);
    const bases = [API_BASE_URL, resolveBackendUploadBaseUrl(), window.location.origin || ('https://' + window.location.host)];
    return bases.some(base => target.origin === new URL(base, window.location.origin || ('https://' + window.location.host)).origin);
  } catch { return false; }
}

export function resolveBackendUploadUrl(path: string, options?: { authenticated?: boolean }) {
  const rawPath = String(path || "").trim();
  if (!rawPath) return "";

  let url = "";
  if (/^https?:\/\//i.test(rawPath)) {
    url = rawPath;
  } else {
    const cleanPath = rawPath.replace(/^\/+/, "").replace(/^uploads\//i, "");
    const uploadBaseUrl = resolveBackendUploadBaseUrl();
    url = cleanPath ? `${uploadBaseUrl}/${cleanPath}` : uploadBaseUrl;
  }

  if (options?.authenticated === false) return url;

  const isUpload = url.includes("/uploads/");
  if (!isUpload) return url;

  if (url.includes("token=")) return url;

  if (!isTrustedDocumentUrl(url)) return url;
  const token = getDocumentToken();
  if (!token) return url;

  let tenantSlug = typeof window !== "undefined" ? window.location.hostname.split(".")[0] : "";
  try {
    const stored = JSON.parse(localStorage.getItem('paydayops.auth.superadmin') || localStorage.getItem(AUTH_STORAGE_KEY) || '{}');
    if (stored.user?.tenant && stored.user.tenant !== 'platform') tenantSlug = stored.user.tenant;
  } catch { /* Use the current company hostname until login completes. */ }
  const separator = url.includes("?") ? "&" : "?";
  const tenantParam = tenantSlug && !url.includes("tenant=") ? `&tenant=${encodeURIComponent(tenantSlug)}` : "";
  return `${url}${separator}token=${encodeURIComponent(token)}${tenantParam}`;
}

export async function openSecureDocument(path: string): Promise<void> {
  if (!path) return;

  const authenticatedUrl = resolveBackendUploadUrl(path);
  const isUploadHref = authenticatedUrl.includes("/uploads/");
  if (!isUploadHref) {
    window.open(authenticatedUrl, "_blank", "noopener,noreferrer");
    return;
  }

  try {
    const blob = await apiGetBlob(path);
    const objectUrl = URL.createObjectURL(blob);
    window.open(objectUrl, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch (error) {
    console.warn("apiGetBlob failed, falling back to direct open:", error);
    window.open(authenticatedUrl, "_blank", "noopener,noreferrer");
  }
}

export type ApiResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
};

type ReadOptions = { timeoutMs?: number; preferSameOrigin?: boolean };

function readApiBase(path: string, options?: ReadOptions) {
  // Only these reads have a verified proxy on this managed production host.
  // Custom hosts, other endpoints and all writes keep their configured API.
  if (options?.preferSameOrigin
    && typeof window !== "undefined"
    && window.location.origin === "https://payday.waqtmoney.com"
    && trimTrailingSlash(API_BASE_URL) === "https://payday-api.waqtmoney.com/api"
    && /^\/leads\/telecaller-(?:workbench-v2|policy)(?:$|\?)/.test(path)) {
    return "/api";
  }
  return API_BASE_URL;
}

async function readWithDeadline<T>(read: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal, options: ReadOptions = {}): Promise<T> {
  signal?.throwIfAborted();
  const timeoutMs = options.timeoutMs ?? 60_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("Invalid read timeout");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const cancelled = new Promise<never>((_, reject) => {
    onAbort = () => {
      controller.abort(signal?.reason);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => {
      const error = new Error("Data request timed out. Please refresh and try again.");
      error.name = "TimeoutError";
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });
  try {
    const data = await Promise.race([read(controller.signal), cancelled]);
    controller.signal.throwIfAborted();
    return data;
  } finally {
    clearTimeout(timer);
    if (onAbort) signal?.removeEventListener("abort", onAbort);
  }
}

export async function apiGet<T>(path: string, signal?: AbortSignal, options?: ReadOptions): Promise<T> {
  const identity = getAuthToken();
  const separator = path.includes("?") ? "&" : "?";
  const url = `${readApiBase(path, options)}${path}${separator}_t=${Date.now()}`;
  return readWithDeadline(async requestSignal => {
    const response = await apiFetch(url, {
      headers: authHeaders(path), signal: requestSignal,
      ...(options?.preferSameOrigin ? { cache: "no-store" as RequestCache } : {}),
    });
    const result = await readApiResponse<T>(response, path);
    if (getAuthToken() !== identity) throw new Error('Session changed while loading data. Please reload.');
    return result;
  }, signal, options);
}

// These POST endpoints only read data. Financial writes keep their existing
// request behavior, since a client timeout cannot establish whether a write ran.
export async function apiPostRead<T>(path: "/collections/list" | "/collections/summary/fetch", body: unknown, signal?: AbortSignal, options?: ReadOptions): Promise<T> {
  return readWithDeadline(requestSignal => apiPost<T>(path, body, requestSignal), signal, options);
}

export type Pagination = { page: number; limit: number; total: number; totalPages: number };

// Complete lists for reports and existing aggregate views. Tables should use
// apiGet with a single server page instead.
export async function apiGetAll<T extends unknown[]>(path: string, signal?: AbortSignal): Promise<T> {
  // Every page must belong to the same effective request identity. Do not join
  // one user's/tenant's first page with pages fetched after a session switch.
  const identity = () => {
    const headers = authHeaders(path) as Record<string, string>;
    return JSON.stringify([headers.Authorization, headers["X-Tenant-Slug"], headers["X-User-Email"], headers["X-User-Name"], headers["X-User-Role"]]);
  };
  const initialIdentity = identity();
  const assertSameIdentity = () => {
    if (identity() !== initialIdentity) throw new Error("Session changed while exporting. Please start the export again.");
  };
  const readPage = async (url: string) => {
    assertSameIdentity();
    const rows = await apiGet<T>(url, signal);
    assertSameIdentity();
    return rows;
  };
  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.delete("pageSize");
  params.set("page", "1");
  params.set("limit", pathname === "/loans" ? "5000" : "500");
  const first = await readPage(`${pathname}?${params}`);
  if (!Array.isArray(first)) throw new Error("API returned an invalid list response");
  const meta = (first as T & { pagination?: Pagination }).pagination;
  if (!meta) return first;
  if (!Number.isSafeInteger(meta.totalPages) || meta.totalPages > 200 || !Number.isSafeInteger(meta.total) || meta.total < 0 || meta.total > 100_000) {
    throw new Error("Too many records to load. Please narrow the report filters.");
  }
  const pages: unknown[][] = [first];
  // At most two page requests at a time to limit pressure on the DB pool.
  for (let page = 2; page <= meta.totalPages; page += 2) {
    const batch = await Promise.all(Array.from({ length: Math.min(2, meta.totalPages - page + 1) }, (_, index) => {
      const nextParams = new URLSearchParams(params);
      nextParams.set("page", String(page + index));
      return readPage(`${pathname}?${nextParams}`);
    }));
    for (const rows of batch) {
      const pagination = (rows as T & { pagination?: Pagination }).pagination;
      if (!Array.isArray(rows) || !pagination || pagination.total !== meta.total) {
        throw new Error("The data changed while loading. Please refresh and try again.");
      }
      pages.push(rows);
    }
  }
  const result = pages.flat() as T;
  if (result.length !== meta.total) throw new Error("Incomplete data received. Please refresh and try again.");
  const ids = result.map((row: any) => row?.rawId ?? row?.id);
  if (ids.every(id => id !== undefined) && new Set(ids.map(String)).size !== result.length) {
    throw new Error("The data changed while loading. Please refresh and try again.");
  }
  const stats = (first as any).stats;
  if (stats) Object.defineProperty(result, 'stats', { value: stats });
  return result;
}

export async function apiPost<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await apiFetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { ...authHeaders(path), "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  return readApiResponse<T>(response, path);
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const response = await apiFetch(`${API_BASE_URL}${path}`, {
    method: "PATCH",
    headers: { ...authHeaders(path), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readApiResponse<T>(response, path);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const response = await apiFetch(`${API_BASE_URL}${path}`, {
    method: "DELETE",
    headers: authHeaders(path),
  });
  return readApiResponse<T>(response, path);
}

async function safeDocumentBlob(blob: Blob): Promise<Blob> {
  const head = new Uint8Array(await blob.slice(0, 64).arrayBuffer());
  const ascii = (from: number, to: number) => String.fromCharCode(...head.slice(from, to));
  let type = '';
  if (ascii(0, 5) === '%PDF-') type = 'application/pdf';
  else if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) type = 'image/jpeg';
  else if (ascii(1, 4) === 'PNG' && head[0] === 0x89 && head[4] === 0x0d && head[5] === 0x0a) type = 'image/png';
  else if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') type = 'image/webp';
  else if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) type = 'video/webm';
  else if (ascii(4, 8) === 'ftyp') type = ascii(8, 12) === 'qt  ' ? 'video/quicktime' : ascii(8, 10) === '3g' ? 'video/3gpp' : 'video/mp4';
  if (!type) throw new Error('This response is not a supported PDF, image or video document.');
  return blob.slice(0, blob.size, type);
}

export async function apiGetBlob(path: string): Promise<Blob> {
  const identity = getAuthToken();
  const requestUrl = resolveBlobUrl(path);
  if (/^(?:javascript|file|vbscript):/i.test(requestUrl) || requestUrl.startsWith('//')) throw new Error('Unsupported document URL.');
  const trusted = isTrustedDocumentUrl(requestUrl);
  const response = await apiFetch(requestUrl, trusted ? { headers: authHeaders(path), referrerPolicy: 'no-referrer' } : { credentials: 'omit', referrerPolicy: 'no-referrer' });
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

  const blob = await safeDocumentBlob(await response.blob());
  if (getAuthToken() !== identity) throw new Error('Session changed while loading document. Please reload.');
  return blob;
}

// Imported website documents must not receive CRM credentials. Local/GCS-mirror
// uploads continue through the authenticated download endpoint.
export async function apiGetDocumentBlob(path: string): Promise<Blob> {
  const identity = getAuthToken();
  const value = String(path || '').trim();
  if (extractUploadPath(value) || !/^(https?:\/\/|data:image\/)/i.test(value)) return apiGetBlob(value);
  const response = await apiFetch(value, { credentials: "omit", referrerPolicy: "no-referrer" });
  if (!response.ok) throw new Error(`Unable to load document (${response.status})`);
  const blob = await safeDocumentBlob(await response.blob());
  if (getAuthToken() !== identity) throw new Error('Session changed while loading document. Please reload.');
  return blob;
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
  if (value.startsWith("/uploads/")) return value.split("?")[0];
  if (value.startsWith("uploads/")) return `/${value}`.split("?")[0];

  if (!/^https?:\/\//i.test(value)) {
    const clean = value.replace(/^\/+/, "");
    if (
      clean.startsWith("payment-proofs/") ||
      clean.startsWith("lead-documents/") ||
      clean.startsWith("sanctions/") ||
      clean.startsWith("sanction-acceptance/") ||
      clean.startsWith("agreements/") ||
      clean.startsWith("cibil/")
    ) {
      return `/uploads/${clean}`.split("?")[0];
    }
    return "";
  }

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
  const response = await apiFetch(`${API_BASE_URL}${path}`, {
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
    const loginStep = /^\/(?:auth|superadmin)\/(?:login|verify-otp|resend-otp)(?:$|\?)/.test(path || '');
    const otpStep = /^\/(?:auth|superadmin)\/(?:verify-otp|resend-otp)(?:$|\?)/.test(path || '');
    const storageKey = isSuperadminPath ? "paydayops.auth.superadmin" : AUTH_STORAGE_KEY;
    let rawUser = loginStep ? null : localStorage.getItem(storageKey);

    if (!loginStep && !rawUser && !isSuperadminPath) {
      rawUser = localStorage.getItem("paydayops.auth.superadmin");
    }

    if (!loginStep && !rawUser && isSuperadminPath) {
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

    const hostSlug = window.location.hostname.split('.')[0];
    const centralHost = ['payday', 'payday-api', 'testing', 'testing-api', 'localhost', '127'].includes(hostSlug);
    const explicitTenant = path ? new URL(path, window.location.origin).searchParams.get('tenant') : '';
    const pendingTenant = otpStep ? sessionStorage.getItem('paydayops.auth.pendingTenant') : '';
    const tenantSlug = explicitTenant || pendingTenant || (loginStep && centralHost ? '' : hostSlug);
    const headers: Record<string, string> = tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {};

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

    const stored = JSON.parse(rawUser) as { token?: string; user?: { email?: string; name?: string; role?: string; tenant?: string } };
    if (!explicitTenant && stored.user?.tenant && stored.user.tenant !== 'platform') headers['X-Tenant-Slug'] = stored.user.tenant;
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
  const identity = responseIdentities.get(response);
  if (identity !== undefined && identity !== getAuthToken()) throw new Error('Session changed while the request was running. Refresh the record before retrying.');
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
    if (payload.stats && Array.isArray(payload.data)) {
      Object.defineProperty(payload.data, 'stats', {
        value: payload.stats,
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
  if (response.status !== 401 || /^\/(?:auth|superadmin)\/(?:login|verify-otp|resend-otp)(?:$|\?)/.test(path)) return;
  const identity = responseIdentities.get(response);
  if (identity !== undefined && identity !== getAuthToken()) return;
  if (/^https?:\/\//i.test(path) && !isTrustedDocumentUrl(path)) return;

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
