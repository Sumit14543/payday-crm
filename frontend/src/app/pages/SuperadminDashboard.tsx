import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LoaderCircle, ShieldAlert, KeyRound, ArrowLeft } from "lucide-react";
import { apiPost, AUTH_STORAGE_KEY } from "../lib/api";

const SUPERADMIN_STORAGE_KEY = "paydayops.auth.superadmin";

export function SuperadminDashboard() {
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
  const [step, setStep] = useState<"login" | "otp">("login");
  const [tempToken, setTempToken] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpMessage, setOtpMessage] = useState("");
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
      const res = await apiPost<any>(
        "/superadmin/login",
        { email, password, role: "superadmin" }
      );

      if (res.requiresOtp) {
        setTempToken(res.tempToken);
        setOtpMessage(res.message || "An OTP security code has been sent to your email.");
        setStep("otp");
        return;
      }

      // Save in both superadmin and main auth storage
      localStorage.setItem(SUPERADMIN_STORAGE_KEY, JSON.stringify(res));
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(res));
      navigate("/", { replace: true });
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Invalid credentials.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleOtpVerify = async (e: FormEvent) => {
    e.preventDefault();
    if (!otpCode || otpCode.trim().length !== 6) {
      setLoginError("Please enter a valid 6-digit OTP code.");
      return;
    }

    setLoginError("");
    setIsLoggingIn(true);
    try {
      const res = await apiPost<any>(
        "/superadmin/verify-otp",
        { tempToken, otp: otpCode.trim() }
      );

      localStorage.setItem(SUPERADMIN_STORAGE_KEY, JSON.stringify(res));
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(res));
      navigate("/", { replace: true });
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Failed to verify OTP.");
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

      <div
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
            width: 52, height: 52, borderRadius: 16,
            background: "linear-gradient(135deg, #4f46e5, #06b6d4)",
            boxShadow: "0 8px 24px rgba(79,70,229,0.35)", marginBottom: 14,
          }}>
            <ShieldAlert size={26} color="white" />
          </div>
          <h1 style={{ color: "white", fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", margin: 0 }}>
            {step === "otp" ? "2FA Security Verification" : "Superadmin Console"}
          </h1>
          <p style={{ color: "#94a3b8", fontSize: 13, marginTop: 6 }}>
            {step === "otp" ? otpMessage : "payday CRM — All controls in one panel"}
          </p>
        </div>

        {step === "login" ? (
          <form onSubmit={handleLogin}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ color: "#94a3b8", fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>
                  EMAIL ADDRESS
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter official email"
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
              {isLoggingIn ? "Verifying..." : "Continue with 2FA"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleOtpVerify}>
            <div>
              <label style={{ color: "#94a3b8", fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>
                ENTER 6-DIGIT OTP
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  autoFocus
                  required
                  style={{
                    width: "100%", height: 48, borderRadius: 10,
                    border: "1px solid rgba(99,102,241,0.4)",
                    background: "rgba(15,23,42,0.8)", color: "white", fontSize: 22,
                    textAlign: "center", letterSpacing: "8px", fontWeight: 700,
                    boxSizing: "border-box", outline: "none",
                  }}
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
              disabled={isLoggingIn || otpCode.length !== 6}
              style={{
                marginTop: 24, width: "100%", height: 46, borderRadius: 10,
                background: isLoggingIn ? "rgba(79,70,229,0.5)" : "linear-gradient(135deg, #10b981, #059669)",
                color: "white", fontWeight: 700, fontSize: 14, border: "none",
                cursor: isLoggingIn || otpCode.length !== 6 ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                boxShadow: isLoggingIn ? "none" : "0 4px 20px rgba(16,185,129,0.4)",
                transition: "all 0.2s",
              }}
            >
              {isLoggingIn ? <LoaderCircle size={16} style={{ animation: "spin 1s linear infinite" }} /> : <KeyRound size={16} />}
              {isLoggingIn ? "Verifying OTP..." : "Verify & Login"}
            </button>

            <button
              type="button"
              onClick={() => { setStep("login"); setLoginError(""); }}
              style={{
                marginTop: 12, width: "100%", height: 36, background: "transparent",
                color: "#94a3b8", fontSize: 12, border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}
            >
              <ArrowLeft size={14} /> Back to email & password
            </button>
          </form>
        )}

        <p style={{ marginTop: 16, textAlign: "center", color: "#475569", fontSize: 12 }}>
          Security OTP verification is required for administrative logins.
        </p>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.6;transform:scale(1.05)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        * { box-sizing: border-box; }
      `}</style>
    </main>
  );
}
