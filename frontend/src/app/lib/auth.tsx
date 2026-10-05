import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { apiPost, AUTH_REQUIRED_EVENT, AUTH_STORAGE_KEY } from "./api";

export type UserRole = "telecaller" | "credit-manager" | "accountant" | "collection" | "superadmin" | "product-admin";

export type AuthUser = {
  email: string;
  name: string;
  role: UserRole;
};

type LoginInput = {
  email: string;
  password: string;
  role: UserRole;
  latitude?: number;
  longitude?: number;
};

export type LoginResult =
  | { requiresOtp: true; tempToken: string; email: string; message: string }
  | { requiresOtp?: false; user: AuthUser };

type AuthContextValue = {
  isAuthenticated: boolean;
  login: (input: LoginInput) => Promise<LoginResult>;
  verifyOtp: (input: { tempToken: string; otp: string }) => Promise<AuthUser>;
  resendOtp: (input: { tempToken: string }) => Promise<void>;
  logout: () => void;
  user: AuthUser | null;
  activeRole: UserRole | null;
  setActiveRole: (role: UserRole) => void;
};

type LoginResponse =
  | { requiresOtp: true; tempToken: string; email: string; message: string }
  | { requiresOtp?: false; token: string; user: AuthUser };

export const roleLabels: Record<UserRole, string> = {
  accountant: "Accountant",
  collection: "Collection",
  "credit-manager": "Credit Manager",
  telecaller: "Telecaller",
  superadmin: "Superadmin",
  "product-admin": "Product Admin",
};

export const roleHomeRoutes: Record<UserRole, string> = {
  accountant: "/accountant",
  collection: "/collections",
  "credit-manager": "/credit-manager",
  telecaller: "/leads",
  superadmin: "/", // Superadmin defaults to Dashboard
  "product-admin": "/",
};

export const roleDefaultEmails: Record<UserRole, string> = {
  accountant: "account@waqtfinance.com",
  collection: "prakash@waqtfinance.com",
  "credit-manager": "shruti@waqtmoney.in",
  telecaller: "telecaller@waqtfinance.com",
  superadmin: "admin@paydaycrm.com",
  "product-admin": "productadmin@paydaycrm.com",
};

export const COLLECTION_ACCOUNT_EMAIL = "prakash@waqtfinance.com";

export function isCollectionAccount(user?: AuthUser | null) {
  const email = String(user?.email || "").trim().toLowerCase();
  return user?.role === "collection" || email === "prakash@waqtfinance.com" || email === "collection@waqtfinance.com";
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const readStoredUser = () => {
  try {
    const rawSuper = localStorage.getItem("paydayops.auth.superadmin");
    if (rawSuper) {
      const storedSuper = JSON.parse(rawSuper) as { user?: AuthUser; token?: string };
      if (storedSuper.token && storedSuper.user?.role === 'superadmin') {
        return storedSuper.user;
      }
    }

    const rawUser = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!rawUser) return null;

    const stored = JSON.parse(rawUser) as { user?: AuthUser; token?: string };
    if (stored.token && stored.user) return stored.user;
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  } catch {
    return null;
  }
};

const getInitialActiveRole = (user: AuthUser | null): UserRole | null => {
  if (!user) return null;
  if (user.role === 'superadmin') {
    return 'superadmin';
  }
  if (user.role === 'product-admin') {
    return 'product-admin';
  }
  return user.role;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => readStoredUser());
  const [activeRole, setActiveRoleState] = useState<UserRole | null>(() => getInitialActiveRole(user));

  useEffect(() => {
    setActiveRoleState(getInitialActiveRole(user));
  }, [user]);

  useEffect(() => {
    const handleAuthRequired = () => {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.removeItem("paydayops.auth.superadmin");
      localStorage.removeItem("paydayops.activeRole");
      localStorage.removeItem("paydayops.login_type");
      setUser(null);
    };

    window.addEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired);
  }, []);

  const setActiveRole = (role: UserRole) => {
    if (user && user.role !== 'superadmin') {
      localStorage.setItem("paydayops.activeRole", role);
      setActiveRoleState(role);
    }
  };

  const value = useMemo<AuthContextValue>(() => ({
    isAuthenticated: Boolean(user),
    login: async ({ email, password, role, latitude, longitude }) => {
      const endpoint = role === "superadmin" || role === "product-admin" ? "/superadmin/login" : "/auth/login";
      const loginRole = role;
      const response = await apiPost<LoginResponse>(endpoint, { email, password, role: loginRole, latitude, longitude });
      
      if (response.requiresOtp) {
        return {
          requiresOtp: true,
          tempToken: response.tempToken,
          email: response.email,
          message: response.message,
        };
      }

      const nextUser = response.user;
      if (role === "product-admin") {
        nextUser.role = "product-admin";
      }

      localStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.removeItem("paydayops.auth.superadmin");
      localStorage.removeItem("paydayops.activeRole");

      const sessionPayload = {
        token: response.token,
        user: nextUser,
      };

      if (role === "superadmin") {
        localStorage.setItem("paydayops.auth.superadmin", JSON.stringify(sessionPayload));
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(sessionPayload));
      } else {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(sessionPayload));
      }
      setUser(nextUser);
      return { requiresOtp: false, user: nextUser };
    },
    verifyOtp: async ({ tempToken, otp }) => {
      const response = await apiPost<{ token: string; user: AuthUser }>("/auth/verify-otp", { tempToken, otp });
      const nextUser = response.user;

      localStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.removeItem("paydayops.auth.superadmin");
      localStorage.removeItem("paydayops.activeRole");

      const sessionPayload = {
        token: response.token,
        user: nextUser,
      };

      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(sessionPayload));
      setUser(nextUser);
      return nextUser;
    },
    resendOtp: async ({ tempToken }) => {
      await apiPost("/auth/resend-otp", { tempToken });
    },
    logout: () => {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.removeItem("paydayops.auth.superadmin");
      localStorage.removeItem("paydayops.activeRole");
      localStorage.removeItem("paydayops.login_type");
      setUser(null);
    },
    user,
    activeRole,
    setActiveRole,
  }), [user, activeRole]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}

export function RequireAuth() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate replace to="/login" state={{ from: location }} />;
  }

  return <Outlet />;
}

export function RequireRole({ roles }: { roles: UserRole[] }) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate replace to="/login" />;
  }

  // Superadmins can bypass all role checks and access any route
  if (user.role === 'superadmin') {
    return <Outlet />;
  }

  if (!roles.includes(user.role)) {
    return <Navigate replace to="/unauthorized" />;
  }

  return <Outlet />;
}

export function canRoleAccessPath(role: UserRole, path: string) {
  if (role === "product-admin") {
    return ["/", "/dashboard", "/leads", "/pipeline", "/customers", "/documents", "/reports", "/team", "/settings"].some(
      p => path === p || path.startsWith(p + "/")
    );
  }
  if (role === "superadmin") return true;
  if (path === "/" || path === "/dashboard") return true;
  if (role === "credit-manager") {
    if (path.startsWith("/leads/")) return true;
    return ["/", "/dashboard", "/credit-manager", "/credit-applications", "/pipeline", "/settings", "/documents", "/analytics"].some(
      p => path === p || path.startsWith(p + "/")
    );
  }
  if (path === "/leads") return role === "telecaller";
  if (path.startsWith("/leads/")) return role === "telecaller" || role === "accountant";
  if (path.startsWith("/pipeline")) return role === "telecaller" || role === "credit-manager";
  if (path.startsWith("/customers")) return false;
  if (path.startsWith("/documents")) return role === "telecaller" || role === "credit-manager";
  if (path.startsWith("/followups")) return role === "telecaller";
  if (path.startsWith("/credit-manager")) return false;
  if (path.startsWith("/credit-applications")) return false;
  if (path.startsWith("/loan-origination")) return false;
  if (path.startsWith("/loan-management")) return role === "accountant";
  if (path.startsWith("/collections")) return role === "collection";
  if (path.startsWith("/accountant")) return role === "accountant";
  if (path.startsWith("/commission")) return false;
  if (path.startsWith("/income")) return false;
  if (path.startsWith("/invoice")) return false;
  if (path.startsWith("/mis-reports")) return false;
  if (path.startsWith("/analytics")) return role === "telecaller" || role === "credit-manager";
  if (path.startsWith("/reports")) return role === "superadmin";
  if (path.startsWith("/settings")) return false;
  if (path.startsWith("/team")) return false;
  return true;
}
