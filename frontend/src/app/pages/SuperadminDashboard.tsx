import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { apiPost } from "../lib/api";
import { ShieldCheck, LoaderCircle } from "lucide-react";
import { getTenantBranding } from "../lib/tenant";

const SUPERADMIN_STORAGE_KEY = "paydayops.auth.superadmin";
const AUTH_STORAGE_KEY = "paydayops.auth";

export function SuperadminDashboard() {
  const branding = getTenantBranding();
  if (branding.slug === "geetpay") {
    return <Navigate to="/unauthorized" replace />;
  }

  const navigate = useNavigate();

  const getStoredSuperadmin = () => {
    try {
      const raw = localStorage.getItem(SUPERADMIN_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed.token && parsed.user?.role === "superadmin") return parsed;
      return null;
    } catch {
      return null;
    }
  };

  const [superadminSession] = useState(getStoredSuperadmin);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // If already logged in as superadmin, inject into main auth and redirect to dashboard
  useEffect(() => {
    if (superadminSession) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(superadminSession));
      navigate("/", { replace: true });
    }
  }, [superadminSession, navigate]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setIsLoggingIn(true);
    try {
      const res = await apiPost<{ token: string; user: { email: string; name: string; role: string } }>(
        "/superadmin/login",
        { email, password }
      );
      // Save in both superadmin and main auth storage
      localStorage.setItem(SUPERADMIN_STORAGE_KEY, JSON.stringify(res));
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(res));
      // Redirect to main dashboard where all tabs (Overview, Telecaller, Credit, Tenant Mgmt etc.) are available
      navigate("/", { replace: true });
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Invalid credentials.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <main
      style={{
        display: "flex",
        minHeight: "100dvh",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 16px",
        background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)",
      }}
    >
      {/* Background orbs */}
      <div style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div style={{
          position: "absolute", top: "20%", left: "10%", width: 300, height: 300,
          borderRadius: "50%", background: "rgba(99,102,241,0.08)", filter: "blur(60px)",
          animation: "pulse 4s ease-in-out infinite",
        }} />
        <div style={{
          position: "absolute", bottom: "20%", right: "10%", width: 250, height: 250,
          borderRadius: "50%", background: "rgba(59,130,246,0.06)", filter: "blur(60px)",
          animation: "pulse 5s ease-in-out infinite 1s",
        }} />
      </div>

      <form
        onSubmit={handleLogin}
        style={{
          width: "100%", maxWidth: 420, position: "relative",
          background: "rgba(15,23,42,0.85)", backdropFilter: "blur(20px)",
          border: "1px solid rgba(99,102,241,0.2)", borderRadius: 20,
          padding: 36, boxShadow: "0 25px 60px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 56, height: 56, borderRadius: 16,
            background: "linear-gradient(135deg, #4f46e5, #2563eb)",
            boxShadow: "0 8px 24px rgba(79,70,229,0.4)", marginBottom: 16,
          }}>
            <ShieldCheck size={28} color="white" />
          </div>
          <h1 style={{ color: "white", fontSize: 22, fontWeight: 800, margin: 0 }}>
            Superadmin Console
          </h1>
          <p style={{ color: "#94a3b8", fontSize: 13, marginTop: 6 }}>
            payday CRM — All controls in one panel
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ color: "#94a3b8", fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>
              EMAIL ADDRESS
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="superadmin@crm.com"
              required
              style={{
                width: "100%", height: 44, borderRadius: 10,
                border: "1px solid rgba(99,102,241,0.25)",
                background: "rgba(15,23,42,0.6)", color: "white", fontSize: 14,
                padding: "0 14px", boxSizing: "border-box", outline: "none",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#4f46e5")}
              onBlur={(e) => (e.target.style.borderColor = "rgba(99,102,241,0.25)")}
            />
          </div>
          <div>
            <label style={{ color: "#94a3b8", fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>
              PASSWORD
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                width: "100%", height: 44, borderRadius: 10,
                border: "1px solid rgba(99,102,241,0.25)",
                background: "rgba(15,23,42,0.6)", color: "white", fontSize: 14,
                padding: "0 14px", boxSizing: "border-box", outline: "none",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#4f46e5")}
              onBlur={(e) => (e.target.style.borderColor = "rgba(99,102,241,0.25)")}
            />
          </div>
        </div>

        {loginError && (
          <div style={{
            marginTop: 14, borderRadius: 10, background: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.3)", padding: "10px 14px",
            color: "#fca5a5", fontSize: 13,
          }}>
            {loginError}
          </div>
        )}

        <button
          type="submit"
          disabled={isLoggingIn}
          style={{
            marginTop: 24, width: "100%", height: 46, borderRadius: 10,
            background: isLoggingIn ? "rgba(79,70,229,0.5)" : "linear-gradient(135deg, #4f46e5, #2563eb)",
            color: "white", fontWeight: 700, fontSize: 14, border: "none",
            cursor: isLoggingIn ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            boxShadow: isLoggingIn ? "none" : "0 4px 20px rgba(79,70,229,0.4)",
            transition: "all 0.2s",
          }}
        >
          {isLoggingIn && <LoaderCircle size={16} style={{ animation: "spin 1s linear infinite" }} />}
          {isLoggingIn ? "Authenticating..." : "Login to Console"}
        </button>

        <p style={{ marginTop: 16, textAlign: "center", color: "#475569", fontSize: 12 }}>
          You will be redirected to the full Super Admin panel with all controls.
        </p>
      </form>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.6;transform:scale(1.05)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        * { box-sizing: border-box; }
      `}</style>
    </main>
  );
}
