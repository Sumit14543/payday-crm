import { type FormEvent, useState, useEffect } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, LoaderCircle, Mail, Lock, ChevronDown, User, ShieldCheck, Briefcase, Calculator, ShieldAlert, Sparkles, KeyRound, ArrowLeft, RefreshCw, LockKeyhole, PhoneCall, CheckCircle2, ArrowRight, Shield, FileCheck, Check, Users, FileText, Zap, MapPin } from "lucide-react";
import { canRoleAccessPath, isCollectionAccount, roleDefaultEmails, roleHomeRoutes, roleLabels, type UserRole, useAuth } from "../lib/auth";
import { apiGet } from "../lib/api";
import { getTenantBranding } from "../lib/tenant";
import { setPublicFavicons } from "../lib/favicon";
import { detectExactLocation } from "../lib/location";

type LocationState = {
  from?: {
    pathname?: string;
  };
};

type BrandingData = {
  slug: string;
  name: string;
  logoUrl: string;
  themeColor: string;
  secondaryColor: string;
};

const roleIcons: Record<UserRole | "product-admin", any> = {
  telecaller: PhoneCall,
  "credit-manager": Briefcase,
  accountant: Calculator,
  collection: ShieldAlert,
  superadmin: ShieldCheck,
  "product-admin": Sparkles,
};

const extendedRoleLabels: Record<UserRole | "product-admin", string> = {
  telecaller: "Telecaller",
  "credit-manager": "Credit Manager (Shruti Singh)",
  accountant: "Accountant",
  collection: "Collection",
  superadmin: "Superadmin",
  "product-admin": "Product Admin",
};

export function Login() {
  const { isAuthenticated, login, verifyOtp, resendOtp, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [role, setRole] = useState<UserRole | "product-admin">("telecaller");
  const [email, setEmail] = useState(roleDefaultEmails.telecaller);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // OTP Step States
  const [step, setStep] = useState<"login" | "otp">("login");
  const [otpToken, setOtpToken] = useState("");
  const [otpEmail, setOtpEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSuccessMsg, setOtpSuccessMsg] = useState("");
  const [otpResendTimer, setOtpResendTimer] = useState(0);

  const [branding, setBranding] = useState<BrandingData>({
    slug: "waqtfinance",
    name: "Waqt Finance CRM",
    logoUrl: "/logo.webp",
    themeColor: "#2563eb",
    secondaryColor: "#0f172a",
  });
  const state = location.state as LocationState | null;
  const isGeetPay = branding.slug === "geetpay";

  useEffect(() => {
    if (otpResendTimer <= 0) return;
    const interval = setInterval(() => {
      setOtpResendTimer((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [otpResendTimer]);

  useEffect(() => {
    // Lock login page to fixed light mode for crisp UI controls
    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = "light";

    return () => {
      const storedTheme = localStorage.getItem("waqt-crm-theme");
      if (storedTheme === "dark") {
        document.documentElement.classList.add("dark");
        document.documentElement.style.colorScheme = "dark";
      } else {
        document.documentElement.classList.remove("dark");
        document.documentElement.style.colorScheme = "light";
      }
    };
  }, []);

  useEffect(() => {
    setPublicFavicons(isGeetPay ? "GeetPay CRM" : "PayDay Loan CRM - Sales Management System", isGeetPay ? "geetpay" : "default");
    apiGet<BrandingData>("/auth/branding")
      .then((data) => {
        const clientBranding = getTenantBranding();
        const tenantSlug = clientBranding.slug !== "waqtfinance" ? clientBranding.slug : data.slug;
        setBranding({
          ...data,
          slug: tenantSlug,
          logoUrl: clientBranding.logoUrl || data.logoUrl,
          name: clientBranding.name || data.name,
        });
        setPublicFavicons(tenantSlug === "geetpay" ? "GeetPay CRM" : "PayDay Loan CRM - Sales Management System", tenantSlug === "geetpay" ? "geetpay" : "default");

        const domain = tenantSlug === "waqtfinance" ? "waqtfinance.com" : `${tenantSlug}.com`;
        setEmail(`telecaller@${domain}`);
      })
      .catch((err) => {
        console.error("Failed to load branding, falling back to local tenant branding:", err);
        const clientBranding = getTenantBranding();
        setBranding({
          slug: clientBranding.slug,
          name: clientBranding.name || "Waqt Finance CRM",
          logoUrl: clientBranding.logoUrl || "/logo.webp",
          themeColor: clientBranding.themeColor || "#2563eb",
          secondaryColor: clientBranding.secondaryColor || "#0f172a",
        });
        setPublicFavicons(
          clientBranding.slug === "geetpay" ? "GeetPay CRM" : "PayDay Loan CRM - Sales Management System", 
          clientBranding.slug === "geetpay" ? "geetpay" : "default"
        );
        const domain = clientBranding.slug === "waqtfinance" ? "waqtfinance.com" : `${clientBranding.slug}.com`;
        setEmail(`telecaller@${domain}`);
      });
  }, []);

  if (isAuthenticated && user) {
    const intendedPath = state?.from?.pathname;
    const homePath = isCollectionAccount(user) ? "/collections" : roleHomeRoutes[user.role];
    const canUseIntendedPath =
      intendedPath &&
      intendedPath !== "/login" &&
      intendedPath !== "/unauthorized" &&
      intendedPath !== "/" &&
      canRoleAccessPath(user.role, intendedPath);

    return <Navigate replace to={canUseIntendedPath ? intendedPath : homePath} />;
  }

  const roleOptions: (UserRole | "product-admin")[] = isGeetPay
    ? ["telecaller", "credit-manager", "accountant", "collection", "product-admin"]
    : ["telecaller", "credit-manager", "accountant", "collection", "superadmin", "product-admin"];

  const changeRole = (nextRole: UserRole | "product-admin") => {
    setRole(nextRole);
    if (nextRole === "superadmin") {
      setEmail("admin@paydaycrm.com");
    } else if (nextRole === "product-admin") {
      const domain = branding.slug === "waqtfinance" ? "waqtfinance.com" : `${branding.slug}.com`;
      setEmail(domain === "waqtfinance.com" ? "support@waqtfinance.com" : "productadmin@paydaycrm.com");
    } else if (nextRole === "credit-manager") {
      setEmail("shruti@waqtmoney.in");
    } else {
      const domain = branding.slug === "waqtfinance" ? "waqtfinance.com" : `${branding.slug}.com`;
      const defaultEmailPrefix = nextRole === "collection" ? "prakash" : nextRole;
      setEmail(`${defaultEmailPrefix}@${domain}`);
    }
    setError("");
  };

  const [cachedCoords, setCachedCoords] = useState<{ latitude?: number; longitude?: number } | null>(null);
  const [liveAddress, setLiveAddress] = useState<string>("");
  const [isFetchingLocation, setIsFetchingLocation] = useState<boolean>(false);

  const handleRefreshLocation = async () => {
    setIsFetchingLocation(true);
    try {
      const info = await detectExactLocation(true);
      if (info && info.formattedLocation) {
        setLiveAddress(info.formattedLocation);
        if (info.latitude && info.longitude) {
          setCachedCoords({
            latitude: info.latitude,
            longitude: info.longitude,
          });
        }
      }
    } catch (err) {
      console.error("Failed to refresh exact location:", err);
    } finally {
      setIsFetchingLocation(false);
    }
  };

  useEffect(() => {
    setIsFetchingLocation(true);
    detectExactLocation(true).then((info) => {
      if (info && info.formattedLocation) {
        setLiveAddress(info.formattedLocation);
        if (info.latitude && info.longitude) {
          setCachedCoords({
            latitude: info.latitude,
            longitude: info.longitude,
          });
        }
      }
    }).catch(() => {})
      .finally(() => setIsFetchingLocation(false));
  }, []);

  const getBrowserLocation = async (): Promise<{ latitude?: number; longitude?: number }> => {
    if (cachedCoords?.latitude && cachedCoords?.longitude) {
      return cachedCoords;
    }
    try {
      const info = await detectExactLocation(true);
      if (info && info.latitude && info.longitude) {
        const coords = { latitude: info.latitude, longitude: info.longitude };
        setCachedCoords(coords);
        return coords;
      }
    } catch (err) {
      console.warn("Failed to get browser location during submit:", err);
    }
    return {};
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const cleanEmail = email.trim().toLowerCase();
    const ALLOWED_DOMAINS = ["@waqtmoney.in", "@waqtfinance.com", "@geetpay.com", "@loaninwallet.com", "@salarywaves.com"];
    const isAllowedDomain = ALLOWED_DOMAINS.some((d) => cleanEmail.endsWith(d));
    if (!isAllowedDomain && role !== "superadmin" && role !== "product-admin") {
      setError("Access Denied: Only authorized company email addresses (@waqtmoney.in, @waqtfinance.com, @geetpay.com, @loaninwallet.com) are permitted.");
      return;
    }

    if (role === "credit-manager" && cleanEmail !== "shruti@waqtmoney.in") {
      setError("Access Denied: Only Shruti Singh (shruti@waqtmoney.in) is authorized for Credit Panel.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError("");
      localStorage.setItem("paydayops.login_type", role);

      const coords = await getBrowserLocation();
      const result = await login({ email: cleanEmail, password, role, ...coords });

      if (result.requiresOtp) {
        setOtpToken(result.tempToken);
        setOtpEmail(result.email);
        setStep("otp");
        setOtpSuccessMsg(result.message || "A 6-digit security OTP has been sent to your email!");
        setOtpResendTimer(60);
        return;
      }

      const loggedInUser = result.user;
      const intendedPath = state?.from?.pathname;
      const homePath = isCollectionAccount(loggedInUser) ? "/collections" : roleHomeRoutes[loggedInUser.role];
      const canUseIntendedPath =
        intendedPath &&
        intendedPath !== "/login" &&
        intendedPath !== "/unauthorized" &&
        intendedPath !== "/" &&
        canRoleAccessPath(loggedInUser.role, intendedPath);

      navigate(canUseIntendedPath ? intendedPath : homePath, { replace: true });
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Unable to sign in.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOtpSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!otpCode || otpCode.trim().length !== 6) {
      setError("Please enter a valid 6-digit OTP code.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError("");
      const loggedInUser = await verifyOtp({ tempToken: otpToken, otp: otpCode.trim() });
      const intendedPath = state?.from?.pathname;
      const homePath = isCollectionAccount(loggedInUser) ? "/collections" : roleHomeRoutes[loggedInUser.role];
      const canUseIntendedPath =
        intendedPath &&
        intendedPath !== "/login" &&
        intendedPath !== "/unauthorized" &&
        intendedPath !== "/" &&
        canRoleAccessPath(loggedInUser.role, intendedPath);

      navigate(canUseIntendedPath ? intendedPath : homePath, { replace: true });
    } catch (otpErr) {
      setError(otpErr instanceof Error ? otpErr.message : "Invalid or expired OTP code.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendOtp = async () => {
    if (isSubmitting || otpResendTimer > 0) return;
    try {
      setIsSubmitting(true);
      setError("");
      setOtpSuccessMsg("");
      await resendOtp({ tempToken: otpToken });
      setOtpSuccessMsg(`A fresh OTP code has been sent to ${otpEmail}!`);
      setOtpResendTimer(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend OTP code.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="h-dvh w-full bg-white text-slate-900 font-sans flex flex-col justify-between selection:bg-blue-500 selection:text-white relative overflow-y-auto overflow-x-hidden" style={{ colorScheme: "light" }}>
      
      {/* 50/50 Dual-Tone Vertical Split Background Canvas (Silky Luxury Ambient Mesh Backdrop) */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 flex">
        
        {/* Left Half: Solid Pure White with Ultra-Soft Sky & Indigo Lighting Washes */}
        <div className="w-full lg:w-1/2 h-full bg-gradient-to-b from-white via-slate-50/40 to-blue-50/20 lg:bg-white relative overflow-hidden">
          {/* Top-Left Soft Sky Glow Wash */}
          <div className="absolute -top-24 -left-20 w-[340px] sm:w-[500px] h-[340px] sm:h-[500px] bg-gradient-to-br from-sky-200/40 via-blue-100/25 to-transparent blur-[80px] sm:blur-[110px] rounded-full pointer-events-none" />

          {/* Bottom-Left Soft Indigo Glow Wash */}
          <div className="absolute -bottom-24 -left-20 w-[340px] sm:w-[500px] h-[340px] sm:h-[500px] bg-gradient-to-tr from-indigo-200/35 via-blue-100/20 to-transparent blur-[85px] sm:blur-[115px] rounded-full pointer-events-none" />
        </div>

        {/* Right Half: Soft Pastel Ice Blue with Multi-Color Rose & Sky Ambient Aura */}
        <div className="hidden lg:block w-1/2 h-full bg-[#f0f6ff] relative overflow-hidden">
          {/* Top-Right Soft Sky Blue Lighting Glow */}
          <div className="absolute -top-20 -right-20 w-[520px] h-[520px] bg-gradient-to-bl from-blue-300/40 via-sky-200/25 to-transparent blur-[100px] rounded-full pointer-events-none" />

          {/* Bottom-Left Soft Indigo Lighting Glow */}
          <div className="absolute -bottom-20 -left-20 w-[520px] h-[520px] bg-gradient-to-tr from-indigo-300/40 via-blue-200/25 to-transparent blur-[105px] rounded-full pointer-events-none" />

          {/* Bottom-Right Soft Rose/Pink Pastel Lighting Wash */}
          <div className="absolute -bottom-16 -right-16 w-[420px] h-[420px] bg-gradient-to-tl from-rose-200/45 via-pink-100/30 to-transparent blur-[90px] rounded-full pointer-events-none" />
        </div>

      </div>

      {/* Main 2-Column Showcase Container */}
      <div className="relative z-10 w-full max-w-[1440px] mx-auto px-4 sm:px-6 md:px-8 lg:px-12 py-6 sm:py-8 lg:py-10 my-auto min-h-min">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 lg:gap-12 items-center relative">
          
          {/* Left Column: Pure Clean White Showcase Area (Responsive Scaling for Mobile/Tablet/Desktop) */}
          <div className="lg:col-span-7 space-y-3 sm:space-y-3.5 text-left pl-0 pr-0 lg:pr-4 relative">

            {/* WAQT FINANCE Brand Header - Direct Official Logo Emblem without White Box */}
            <div className="flex items-center gap-2.5 sm:gap-3 relative z-10">
              <img src="/screenshots/waqt_logo_emblem_transparent.png" alt="Waqt Finance Logo Emblem" className="h-9 sm:h-12 lg:h-13 w-auto object-contain shrink-0 drop-shadow-sm" />
              <div>
                <div className="flex items-center text-xl sm:text-3xl font-black tracking-tight leading-none text-slate-900">
                  <span className="text-red-600">WAQT</span>
                  <span className="text-blue-700 ml-1 sm:ml-1.5">FINANCE</span>
                </div>
                <p className="text-[8px] sm:text-[9px] md:text-[10px] font-extrabold tracking-[0.2em] sm:tracking-[0.25em] text-slate-400 uppercase mt-0.5">
                  LENDING SIMPLIFIED
                </p>
              </div>
            </div>

            {/* Headline & Subtitle Section - Clean & Elegant Typography */}
            <div className="space-y-1 sm:space-y-1.5 relative z-10 pt-0.5">
              <h1 className="text-xl sm:text-3xl lg:text-[2.2rem] font-extrabold text-slate-900 tracking-tight leading-[1.15]">
                Smarter lending.<br />
                Stronger operations<span className="text-red-600 font-black">.</span>
              </h1>
              
              <p className="text-xs sm:text-sm text-slate-500 font-medium leading-relaxed max-w-lg">
                Manage applications, credit underwriting, instant IMPS disbursals and overdue collections from one unified workspace.
              </p>
            </div>

            {/* User-Selected 3D Waqt Finance CRM Dashboard Graphic + 3D Floating Emoji Micro-Badges */}
            <div className="relative py-0.5 group">
              {/* Soft Ambient Glow */}
              <div className="absolute inset-0 bg-slate-200/20 blur-3xl rounded-full pointer-events-none" />

              {/* Master 3D Waqt Finance CRM Dashboard Graphic (Fully Responsive Viewport Scaling) */}
              <div className="relative overflow-visible">
                <img 
                  src="/screenshots/waqt_3d_dashboard_hero_transparent.png" 
                  alt="Waqt Finance 3D Loan CRM Dashboard Illustration" 
                  className="relative z-10 w-full max-w-xl h-auto max-h-[190px] sm:max-h-[280px] lg:max-h-[350px] xl:max-h-[365px] object-contain drop-shadow-[0_15px_35px_rgba(37,99,235,0.14)] opacity-98 group-hover:scale-[1.01] transition-transform duration-500 origin-left"
                />
              </div>
            </div>

            {/* Bottom 3 Feature Pills (Fully Responsive Columns for Mobile Screens) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 pt-0.5 max-w-xl">
              <div className="rounded-xl sm:rounded-2xl bg-white p-2 sm:p-2.5 border border-slate-200/80 shadow-sm flex items-center gap-2">
                <div className="flex h-6 sm:h-7 w-6 sm:w-7 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
                  <Shield className="h-3 sm:h-3.5 w-3 sm:w-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] sm:text-xs font-extrabold text-slate-900 leading-tight truncate">Secure</p>
                  <p className="text-[9px] sm:text-[10px] text-slate-500 leading-tight truncate">256-bit Encrypted</p>
                </div>
              </div>

              <div className="rounded-xl sm:rounded-2xl bg-white p-2 sm:p-2.5 border border-slate-200/80 shadow-sm flex items-center gap-2">
                <div className="flex h-6 sm:h-7 w-6 sm:w-7 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
                  <Users className="h-3 sm:h-3.5 w-3 sm:w-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] sm:text-xs font-extrabold text-slate-900 leading-tight truncate">Role-Based</p>
                  <p className="text-[9px] sm:text-[10px] text-slate-500 leading-tight truncate">Granular Scopes</p>
                </div>
              </div>

              <div className="rounded-xl sm:rounded-2xl bg-white p-2 sm:p-2.5 border border-slate-200/80 shadow-sm flex items-center gap-2">
                <div className="flex h-6 sm:h-7 w-6 sm:w-7 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
                  <FileText className="h-3 sm:h-3.5 w-3 sm:w-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] sm:text-xs font-extrabold text-slate-900 leading-tight truncate">Auditable</p>
                  <p className="text-[9px] sm:text-[10px] text-slate-500 leading-tight truncate">Complete Audit Trail</p>
                </div>
              </div>
            </div>

          </div>

          {/* Right Column: Sign In Form Container (Perfect Vertically Centered Alignment across all devices) */}
          <div className="lg:col-span-5 w-full flex justify-center lg:justify-end mt-2 lg:mt-0 relative z-20">
            
            {step === "otp" ? (
              /* OTP Step Card */
              <div className="w-full max-w-md rounded-3xl bg-white p-5 sm:p-7 md:p-9 shadow-[0_25px_60px_-15px_rgba(37,99,235,0.12)] border border-slate-200/80 relative z-10 overflow-hidden animate-in fade-in duration-200">
                <div className="mb-6 text-center pt-1">
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 border border-blue-100 shadow-sm">
                    <KeyRound className="h-7 w-7" />
                  </div>
                  <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Security OTP Code</h2>
                  <p className="mt-2 text-xs font-medium text-slate-500 leading-relaxed">
                    A 6-digit verification code has been sent to:
                  </p>
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 border border-blue-100 text-xs font-semibold text-blue-900">
                    <Mail className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                    <span>{otpEmail}</span>
                  </div>
                </div>

                <form onSubmit={handleOtpSubmit} className="space-y-4">
                  {otpSuccessMsg && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-medium text-emerald-800 flex items-center gap-2.5">
                      <ShieldCheck className="h-4.5 w-4.5 text-emerald-600 shrink-0" />
                      <span>{otpSuccessMsg}</span>
                    </div>
                  )}

                  {error && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs font-medium text-red-700 flex items-center gap-2.5">
                      <ShieldAlert className="h-4.5 w-4.5 text-red-600 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-center text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                      6-Digit Security OTP
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                      placeholder="123456"
                      autoFocus
                      style={{ colorScheme: "light", backgroundColor: "#ffffff", color: "#0f172a" }}
                      className="w-full h-13 text-center text-2xl font-mono tracking-[0.5em] font-extrabold rounded-xl border border-slate-300 bg-white outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100 text-slate-900 shadow-sm"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting || otpCode.length !== 6}
                    className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-extrabold shadow-md shadow-blue-600/25 transition-all flex items-center justify-center gap-2 cursor-pointer text-sm"
                  >
                    {isSubmitting ? (
                      <>
                        <LoaderCircle className="h-5 w-5 animate-spin" />
                        <span>Verifying...</span>
                      </>
                    ) : (
                      <>
                        <span>Verify & Sign In</span>
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>

                  <div className="flex items-center justify-between text-xs pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setStep("login");
                        setOtpCode("");
                        setError("");
                      }}
                      className="flex items-center gap-1.5 font-medium text-slate-500 hover:text-slate-900 transition cursor-pointer"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      Back to Login
                    </button>

                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={isSubmitting || otpResendTimer > 0}
                      className="flex items-center gap-1.5 font-semibold text-blue-600 hover:text-blue-700 disabled:text-slate-400 disabled:cursor-not-allowed transition cursor-pointer"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${isSubmitting ? "animate-spin" : ""}`} />
                      {otpResendTimer > 0 ? `Resend (${otpResendTimer}s)` : "Resend OTP"}
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              /* Main Sign In Floating Card (Pure Clean Top Border) */
              <div className="w-full max-w-md rounded-3xl bg-white p-5 sm:p-7 md:p-9 shadow-[0_25px_60px_-15px_rgba(37,99,235,0.12)] border border-slate-200/80 relative z-10 overflow-hidden animate-in fade-in duration-200">
                
                {/* Top Pill Tag */}
                <div className="mb-3 pt-1 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-[11px] font-extrabold text-blue-600 border border-blue-100 uppercase tracking-wider">
                    <LockKeyhole className="h-3 w-3 text-blue-600" />
                    WORKSPACE ACCESS
                  </span>
                  <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3 text-emerald-500 shrink-0" />
                    2FA Secured
                  </span>
                </div>

                {/* Title */}
                <h2 className="text-3xl font-black text-slate-900 tracking-tight mb-5">Sign in</h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                  
                  {/* Workspace Role Selector */}
                  <div className="relative">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                        WORKSPACE ROLE
                      </label>
                      <span className="text-[11px] text-blue-600 font-semibold">Switch Role</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDropdownOpen(!dropdownOpen)}
                      style={{ colorScheme: "light", backgroundColor: "#ffffff", color: "#0f172a" }}
                      className="w-full h-12 px-4 rounded-2xl border border-slate-200 bg-white flex items-center justify-between text-slate-900 outline-none transition hover:border-slate-300 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 cursor-pointer shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        {(() => {
                          const SelectedIcon = roleIcons[role];
                          return <SelectedIcon className="h-4.5 w-4.5 text-blue-600" />;
                        })()}
                        <span className="text-sm font-bold text-slate-900">{extendedRoleLabels[role]}</span>
                      </div>
                      <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${dropdownOpen ? "rotate-180" : ""}`} />
                    </button>

                    {dropdownOpen && (
                      <>
                        <div 
                          className="fixed inset-0 z-20 cursor-default" 
                          onClick={() => setDropdownOpen(false)} 
                        />
                        <div className="absolute left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl z-30 overflow-hidden py-1.5 animate-in fade-in duration-150">
                          {roleOptions.map((option) => {
                            const OptionIcon = roleIcons[option];
                            const isSelected = role === option;
                            return (
                              <button
                                key={option}
                                type="button"
                                onClick={() => {
                                  changeRole(option);
                                  setDropdownOpen(false);
                                }}
                                className={`w-full px-4 py-2.5 text-left text-sm flex items-center justify-between transition cursor-pointer ${
                                  isSelected 
                                    ? "bg-blue-50 text-blue-700 font-bold" 
                                    : "hover:bg-slate-50 text-slate-700 hover:text-slate-900 font-medium"
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <OptionIcon className={`h-4 w-4 shrink-0 ${isSelected ? "text-blue-600" : "text-slate-400"}`} />
                                  <span>{extendedRoleLabels[option]}</span>
                                </div>
                                {isSelected && <CheckCircle2 className="h-4 w-4 text-blue-600" />}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Email Input */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-extrabold uppercase tracking-wider text-slate-500 block">
                        EMAIL ADDRESS
                      </label>
                      {role === "credit-manager" && (
                        <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                          Official ID: Shruti Singh
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                        <Mail className="h-4 w-4" />
                      </span>
                      <input
                        type="email"
                        value={role === "credit-manager" ? "shruti@waqtmoney.in" : email}
                        onChange={(event) => {
                          if (role !== "credit-manager") {
                            setEmail(event.target.value);
                          }
                        }}
                        readOnly={role === "credit-manager"}
                        placeholder="name@company.com"
                        autoComplete="email"
                        style={{ colorScheme: "light", backgroundColor: role === "credit-manager" ? "#f8fafc" : "#ffffff", color: "#0f172a" }}
                        className={`h-12 w-full rounded-2xl border border-slate-200 pl-11 pr-4 text-sm font-medium outline-none transition placeholder:text-slate-400 text-slate-900 shadow-sm ${
                          role === "credit-manager"
                            ? "bg-slate-50 cursor-not-allowed font-semibold text-blue-900"
                            : "bg-white hover:border-slate-300 focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                        }`}
                        required
                      />
                    </div>
                  </div>

                  {/* Password Input */}
                  <div>
                    <label className="text-xs font-extrabold uppercase tracking-wider text-slate-500 block mb-1.5">
                      PASSWORD
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                        <Lock className="h-4 w-4" />
                      </span>
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="••••••••"
                        autoComplete="current-password"
                        style={{ colorScheme: "light", backgroundColor: "#ffffff", color: "#0f172a" }}
                        className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-11 text-sm font-medium outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-600 focus:ring-4 focus:ring-blue-100 text-slate-900 shadow-sm"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        className="absolute right-3.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none cursor-pointer"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-3.5 text-xs font-medium text-red-700 flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 text-red-600 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  {/* Main Sign In Button */}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-extrabold text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.98] transition-all disabled:cursor-not-allowed disabled:opacity-50 shadow-lg shadow-blue-500/25 cursor-pointer"
                  >
                    {isSubmitting ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <span>Sign In</span>
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </form>

              </div>
            )}
          </div>
        </div>
      </div>

    </main>
  );
}
