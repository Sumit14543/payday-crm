import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Menu,
  PanelLeft,
  X,
  Search,
  Building2,
  Command,
  Activity,
  Download,
  Loader2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LogOut,
  UserCircle,
  BarChart3,
  FileText,
  WalletCards,
  Plus,
  CreditCard,
  ClipboardCheck,
  Gauge,
  FileSignature,
  Landmark,
  LineChart,
  ShieldCheck,
  PhoneCall,
  Receipt,
  ScrollText,
  Sliders,
  UserCog,
  Users,
  UsersRound,
  Mail,
  Briefcase,
  Calendar,
  Phone,
  Maximize2,
  Award,
  CheckCircle2,
  Building,
  Star,
  Sparkles,
  Clock,
} from "lucide-react";
import { exportRows, navigationItems, searchRecords, workspace } from "../data/crm";
import { getTenantBranding } from "../lib/tenant";
import { setPublicFavicons } from "../lib/favicon";
import { apiGet } from "../lib/api";
import { canRoleAccessPath, isCollectionAccount, roleLabels, useAuth, roleHomeRoutes, type UserRole } from "../lib/auth";
import { useSmartPolling } from "../lib/useSmartPolling";
import { ThemeToggle } from "./ThemeToggle";
import { ProductAdminLayout } from "./ProductAdminLayout";
import { AppTooltip } from "./ui/app-tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { PageLoading } from "./PageLoading";
import { ConfirmationModal } from "./ui/ConfirmationModal";

const LEAD_DISPOSITION_FILTERS = [
  "No Disposition",
  "Connected",
  "Not reachable",
  "Switched off",
  "Callback requested",
  "Interested",
  "Not interested",
  "Wrong number",
  "Duplicate",
  "Language issue",
];
const NO_DISPOSITION_VALUE = "__none__";
const COLLECTION_WORKSPACE_PATHS = new Set(["/collections", "/collections/my-collections", "/collections/log-payment", "/collections/log_payment"]);
const SIDEBAR_WIDTH = 288;
const SIDEBAR_COLLAPSED_WIDTH = 72;
const SIDEBAR_TRANSITION = { duration: 0.36, ease: [0.22, 1, 0.36, 1] } as const;
const commandActions = [
  { href: "/leads", icon: Search, label: "Search Lead", meta: "Open lead queue" },
  { href: "/leads", icon: Plus, label: "Create Lead", meta: "Start a new application" },
  { href: "/analytics", icon: BarChart3, label: "Analytics", meta: "Performance dashboard" },
  { href: "/reports", icon: FileText, label: "Reports", meta: "Operational reports" },
  { href: "/collections", icon: WalletCards, label: "Collections", meta: "Repayment workspace" },
  { href: "/accountant", icon: CreditCard, label: "Disbursement", meta: "Accountant queue" },
  { href: "/dashboard", icon: Activity, label: "Settings", meta: "Workspace preferences" },
];

const superadminGroups = [
  {
    title: "SYSTEM COMMAND",
    items: [
      { name: "Dashboard", href: "/?tab=overview", icon: Gauge },
      { name: "Extended Metrics", href: "/?tab=extended", icon: Sliders },
      { name: "Users", href: "/users", icon: Users },
      { name: "Roles & Permissions", href: "/roles", icon: UserCog },
      { name: "Audit Logs", href: "/reports?type=audit-log-report", icon: ScrollText },
    ]
  }
];



const emptyDispositionCounts = () => (
  LEAD_DISPOSITION_FILTERS.reduce<Record<string, number>>((counts, disposition) => {
    counts[disposition] = 0;
    return counts;
  }, {})
);

type TelecallerWorkbenchCountsResponse = {
  counts?: {
    disposition?: Record<string, number>;
    stats?: {
      totalLeads?: number;
    };
  };
  pagination?: {
    totalItems?: number;
  };
};

export function Layout() {
  const branding = useMemo(() => getTenantBranding(), []);
  const isGeetPay = branding.slug === "geetpay";
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setPublicFavicons(isGeetPay ? "GeetPay CRM" : "PayDay Loan CRM - Sales Management System", isGeetPay ? "geetpay" : "default");
  }, [isGeetPay]);
  const { logout, user, activeRole, setActiveRole } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [healthStatus, setHealthStatus] = useState<"checking" | "online" | "offline">("checking");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [fullImageModal, setFullImageModal] = useState<string | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [leadDispositionCounts, setLeadDispositionCounts] = useState<Record<string, number>>(emptyDispositionCounts);
  const [leadTotalCount, setLeadTotalCount] = useState(0);
  const searchContainerRef = useRef<HTMLLabelElement | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const role = activeRole || user?.role;
  const isShrutiUser = role === "credit-manager" || user?.role === "credit-manager" || String(user?.email || "").toLowerCase().startsWith("shruti@waqtmoney");
  const isNandiniUser = user?.email?.toLowerCase() === "nandini@waqtmoney.in" || user?.name?.toLowerCase().includes("nandini") || user?.name?.toLowerCase().includes("nandni");
  const isHimanshuUser = user?.email?.toLowerCase() === "himanshukumar@waqtfinance.com" || user?.name?.toLowerCase().includes("himanshu");
  const isKanhaiyaUser = user?.email?.toLowerCase() === "kanhiayakumar@waqtfinance.com" || user?.name?.toLowerCase().includes("kanhiya") || user?.name?.toLowerCase().includes("kanhaiya");

  if (role === "product-admin") {
    return <ProductAdminLayout />;
  }

  const collectionAccount = role === "collection" || isCollectionAccount(user);

  const handleRoleChange = (newRole: UserRole) => {
    setActiveRole(newRole);
    navigate(roleHomeRoutes[newRole]);
  };

  const visibleNavigationItems = useMemo(() => {
    if (!role) return [];
    if (collectionAccount) {
      return navigationItems.filter((item) => COLLECTION_WORKSPACE_PATHS.has(item.href));
    }
    return navigationItems.filter((item) => canRoleAccessPath(role, item.href));
  }, [collectionAccount, role]);

  const visibleSearchRecords = useMemo(() => {
    if (!role) return [];
    if (collectionAccount) {
      return searchRecords.filter((record) => COLLECTION_WORKSPACE_PATHS.has(record.href));
    }
    return searchRecords.filter((record) => canRoleAccessPath(role, record.href));
  }, [collectionAccount, role]);

  const visibleCommandActions = useMemo(() => {
    if (!role) return [];
    return commandActions.filter((action) => canRoleAccessPath(role, action.href));
  }, [role]);

  const searchResults = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return visibleSearchRecords.slice(0, 6);

    return visibleSearchRecords
      .filter((record) =>
        [record.title, record.subtitle, record.id, record.type]
          .join(" ")
          .toLowerCase()
          .includes(query)
      )
      .slice(0, 7);
  }, [searchTerm, visibleSearchRecords]);

  const searchPlaceholder = collectionAccount
    ? "Search collections, loans, reports..."
    : role === "telecaller"
    ? "Search leads, reports..."
    : role === "accountant"
      ? "Search payments, loans, reports..."
      : "Search credit queue, leads, reports...";

  const loadLeadDispositionCounts = useCallback(async (signal: AbortSignal) => {
    if (role !== "telecaller") return;
    const counts = emptyDispositionCounts();
    try {
      const payload = await apiGet<TelecallerWorkbenchCountsResponse>("/leads/telecaller-workbench-v2?page=1&pageSize=5", signal);
      Object.entries(payload.counts?.disposition || {}).forEach(([key, value]) => {
        const label = key === NO_DISPOSITION_VALUE ? "No Disposition" : key;
        if (counts[label] !== undefined) counts[label] = Number(value || 0);
      });
      setLeadDispositionCounts(counts);
      setLeadTotalCount(Number(payload.counts?.stats?.totalLeads ?? payload.pagination?.totalItems ?? 0));
    } catch {
      setLeadDispositionCounts(counts);
      setLeadTotalCount(0);
    }
  }, [role]);

  useSmartPolling(loadLeadDispositionCounts, {
    enabled: role === "telecaller",
    intervalMs: 60_000,
  });


  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/health", { signal: controller.signal })
      .then((response) => {
        setHealthStatus(response.ok ? "online" : "offline");
      })
      .catch(() => {
        setHealthStatus("offline");
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!searchFocused) return;

    const closeSearchOnOutsideClick = (event: PointerEvent) => {
      if (!searchContainerRef.current?.contains(event.target as Node)) {
        setSearchFocused(false);
      }
    };

    document.addEventListener("pointerdown", closeSearchOnOutsideClick);

    return () => {
      document.removeEventListener("pointerdown", closeSearchOnOutsideClick);
    };
  }, [searchFocused]);

  useEffect(() => {
    if (role !== "telecaller") {
      setLeadDispositionCounts(emptyDispositionCounts());
      setLeadTotalCount(0);
    }
  }, [role]);

  useEffect(() => {
    if (!userMenuOpen) return;

    const closeUserMenuOnOutsideClick = (event: PointerEvent) => {
      if (!userMenuRef.current?.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeUserMenuOnOutsideClick);

    return () => {
      document.removeEventListener("pointerdown", closeUserMenuOnOutsideClick);
    };
  }, [userMenuOpen]);

  useEffect(() => {
    const openCommandPalette = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
    };

    window.addEventListener("keydown", openCommandPalette);

    return () => {
      window.removeEventListener("keydown", openCommandPalette);
    };
  }, []);

  const isActive = (href: string) => {
    if (href === "/") {
      return location.pathname === "/";
    }
    if (href === "/collections") {
      return location.pathname === "/collections";
    }
    return location.pathname.startsWith(href);
  };
  const dispositionFilterValue = (value: string) => (
    value === "No Disposition" ? NO_DISPOSITION_VALUE : value
  );

  const isLeadFilterActive = (key: "disposition", value: string) => (
    location.pathname === "/leads" && new URLSearchParams(location.search).get(key) === dispositionFilterValue(value)
  );

  const leadFilterHref = (key: "disposition", value: string) => (
    `/leads?${key}=${encodeURIComponent(dispositionFilterValue(value))}`
  );

  const closeMobileMenu = () => setMobileMenuOpen(false);
  const openRecord = (href: string) => {
    setSearchTerm("");
    setSearchFocused(false);
    navigate(href);
  };
  const openCommand = (href: string) => {
    setCommandOpen(false);
    navigate(href);
  };

  const [showLogoutConfirmModal, setShowLogoutConfirmModal] = useState(false);

  const triggerLogoutConfirm = () => {
    setUserMenuOpen(false);
    setShowLogoutConfirmModal(true);
  };

  const handleLogout = () => {
    setShowLogoutConfirmModal(false);
    logout();
    navigate("/login", { replace: true });
  };

  const exportWorkspaceCsv = () => {
    const csv = exportRows
      .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `paydayops-workspace-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const refreshHealth = () => {
    setHealthStatus("checking");
    fetch("/api/health")
      .then((response) => setHealthStatus(response.ok ? "online" : "offline"))
      .catch(() => setHealthStatus("offline"));
  };

  const SidebarContent = ({ collapsed = false }: { collapsed?: boolean }) => (
    <>
      <div className={`flex items-center border-b border-sidebar-border ${isGeetPay && !collapsed ? "h-24" : "h-20"} ${collapsed ? "justify-center px-3" : "px-5"}`}>
        {user?.role === "superadmin" ? (
          <div className="flex min-w-0 items-center gap-3">
            {collapsed ? (
              <div className="flex h-11 w-11 items-center justify-center rounded-xl p-1 shadow-md border border-slate-200/60 shrink-0 hover:scale-105 transition-transform" style={{ backgroundColor: "#ffffff" }}>
                <img src={branding.logoUrl} alt="Waqt Finance Logo" className="h-full w-full object-contain" />
              </div>
            ) : (
              <>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl p-1 shadow-md border border-slate-200/60 shrink-0 hover:scale-105 transition-transform" style={{ backgroundColor: "#ffffff" }}>
                  <img src={branding.logoUrl} alt="Waqt Finance Logo" className="h-full w-full object-contain" />
                </div>
                <motion.div
                  className="min-w-0 overflow-hidden whitespace-nowrap"
                  animate={{ opacity: collapsed ? 0 : 1, width: collapsed ? 0 : 184 }}
                  initial={false}
                  transition={SIDEBAR_TRANSITION}
                  aria-hidden={collapsed}
                >
                  <div className="flex items-center text-base font-black tracking-tight leading-none text-white">
                    <span className="text-red-500">WAQT</span>
                    <span className="text-blue-400 ml-1">FINANCE</span>
                  </div>
                  <span className="block text-[10px] text-slate-400 font-extrabold tracking-wider uppercase mt-1">CRM Workspace</span>
                </motion.div>
              </>
            )}
          </div>
        ) : isGeetPay ? (
          <div className={`flex min-w-0 ${collapsed ? "items-center justify-center" : "flex-col items-start"}`}>
            {collapsed ? (
              <div className="flex h-10 w-10 items-center justify-center rounded-xl p-1" style={{ backgroundColor: "#ffffff" }}>
                <img src={branding.logoUrl} alt={branding.name} className="h-full w-full object-contain" />
              </div>
            ) : (
              <div className="flex h-14 w-[176px] items-center justify-center rounded-xl px-3 py-2" style={{ backgroundColor: "#ffffff" }}>
                <img src={branding.logoUrl} alt={branding.name} className="h-full w-full object-contain" />
              </div>
            )}
            <motion.div
              className="min-w-0 overflow-hidden whitespace-nowrap"
              animate={{ opacity: collapsed ? 0 : 1, width: collapsed ? 0 : 176 }}
              initial={false}
              transition={SIDEBAR_TRANSITION}
              aria-hidden={collapsed}
            >
              <span className="mt-1 block text-center text-[10px] font-medium text-sidebar-foreground/60">A Product of Waqt Finance</span>
            </motion.div>
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl p-1 shadow-md border border-slate-200/60 shrink-0 hover:scale-105 transition-transform" style={{ backgroundColor: "#ffffff" }}>
              <img src={branding.logoUrl} alt={branding.name} className="h-full w-full object-contain" />
            </div>
            <motion.div
              className="min-w-0 overflow-hidden whitespace-nowrap"
              animate={{ opacity: collapsed ? 0 : 1, width: collapsed ? 0 : 184 }}
              initial={false}
              transition={SIDEBAR_TRANSITION}
              aria-hidden={collapsed}
            >
              <div className="flex items-center text-base font-black tracking-tight leading-none text-white">
                <span className="text-red-500">WAQT</span>
                <span className="text-blue-400 ml-1">FINANCE</span>
              </div>
              <span className="block text-[10px] text-slate-400 font-extrabold tracking-wider uppercase mt-1">Lending Portal</span>
            </motion.div>
          </div>
        )}
      </div>

      {user?.role === "superadmin" && (
        <div className={`px-4 py-4 border-b border-sidebar-border ${collapsed ? "flex justify-center" : ""}`}>
          {collapsed ? (
            <div className="relative h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-black text-white shadow-md cursor-pointer shrink-0">
              {(user?.name || "SA").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
              <span className="absolute bottom-[-1px] right-[-1px] h-3 w-3 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900 animate-pulse" />
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-3 shadow-sm relative overflow-hidden group hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-300">
              <div className="relative h-10 w-10 rounded-xl bg-slate-800 dark:bg-slate-700 flex items-center justify-center font-bold text-white shrink-0 shadow-sm">
                {(user?.name || "SA").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                <span className="absolute bottom-[-1px] right-[-1px] h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900" />
              </div>
              <div className="flex-1 min-w-0 z-10">
                <div className="flex items-center gap-1">
                  <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{user?.name || "Super Admin"}</p>
                  <ShieldCheck className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[9px] bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider border border-slate-300/50 dark:border-slate-700/50">
                    Super Admin
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}


      <nav className={`flex-1 overflow-y-auto py-5 ${collapsed ? "px-2.5" : "px-4"}`}>
        {user?.role === "superadmin" ? (
          superadminGroups.map((group, gIndex) => (
            <div key={group.title} className={`mb-5 ${gIndex > 0 ? "pt-4 border-t border-slate-700/60" : ""}`}>
              <motion.div
                className="mb-2 overflow-hidden px-3 text-xs font-bold uppercase tracking-wider text-sidebar-foreground/45"
                animate={{ opacity: collapsed ? 0 : 1, height: collapsed ? 0 : 18 }}
                initial={false}
                transition={SIDEBAR_TRANSITION}
                aria-hidden={collapsed}
              >
                {group.title}
              </motion.div>
              <div className={collapsed ? "space-y-2" : "space-y-1.5"}>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <div key={item.name}>
                      <AppTooltip label={item.name} side="right">
                        <Link
                          to={item.href}
                          onClick={closeMobileMenu}
                          aria-current={active ? "page" : undefined}
                          className={`group relative flex items-center overflow-hidden text-sm font-semibold transition-all duration-200 ${
                            collapsed
                              ? "h-11 justify-center rounded-xl px-0"
                              : "rounded-xl px-3 py-2.5"
                          } ${
                            active
                              ? "bg-sidebar-primary/15 text-sidebar-primary"
                              : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                          }`}
                        >
                          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-200 ${
                            active
                              ? "bg-sidebar-primary/20 text-sidebar-primary"
                              : "text-sidebar-foreground/50 group-hover:bg-sidebar-accent group-hover:text-sidebar-accent-foreground"
                          }`}>
                            <Icon className="h-[18px] w-[18px]" />
                          </span>
                          <motion.span
                            className="overflow-hidden whitespace-nowrap"
                            animate={{ opacity: collapsed ? 0 : 1, width: collapsed ? 0 : 176, marginLeft: collapsed ? 0 : 12 }}
                            initial={false}
                            transition={SIDEBAR_TRANSITION}
                            aria-hidden={collapsed}
                          >
                            {item.name}
                          </motion.span>
                        </Link>
                      </AppTooltip>
                      {!collapsed && item.name === "Reports" && (location.pathname.startsWith("/reports") || location.pathname.startsWith("/product-admin/reports")) && (
                        <div className="ml-7 mt-2 space-y-1.5 border-l border-sidebar-border pl-3">
                          <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/45">Sub Reports</p>
                          {[
                            { label: "Lead Report", target: "lead-report" },
                            { label: "Application Report", target: "application-report" },
                            { label: "Loan Report", target: "loan-report" },
                            { label: "Disbursement Report", target: "disbursement-report" },
                            { label: "Collection Report", target: "collection-report" },
                            { label: "CIBIL Bureau Report", target: "cibil-report" },
                            { label: "Due Report", target: "due-report" },
                            { label: "DPD Bucket Report", target: "dpd-bucket-report" },
                            { label: "Interest Accrued Report", target: "interest-accrued-report" },
                            { label: "Outstanding Report", target: "outstanding-report" },
                            { label: "Payment Report", target: "payment-report" },
                            { label: "Employee Performance", target: "employee-performance" },
                            { label: "Customer Report", target: "customer-report" },
                            { label: "Recovery Report", target: "recovery-report" },
                            { label: "Dashboard Summary", target: "", href: "/" },
                            { label: "Audit Log Report", target: "audit-log-report" },
                          ].map((sub) => {
                            const basePath = location.pathname.startsWith("/product-admin") ? "/product-admin/reports" : "/reports";
                            const href = sub.href || `${basePath}?type=${sub.target}`;
                            return (
                              <Link
                                key={sub.label}
                                to={href}
                                onClick={closeMobileMenu}
                                className="block rounded-md px-2 py-1 text-xs font-semibold text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground truncate"
                              >
                                {sub.label}
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          <>
            <motion.div
              className="mb-3 overflow-hidden px-3 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/45"
              animate={{ opacity: collapsed ? 0 : 1, height: collapsed ? 0 : 18 }}
              initial={false}
              transition={SIDEBAR_TRANSITION}
              aria-hidden={collapsed}
            >
              Workspace
            </motion.div>
            <div className={collapsed ? "space-y-2" : "space-y-1.5"}>
              {visibleNavigationItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <div key={item.name}>
                    <AppTooltip label={item.name} side="right">
                      <Link
                        to={item.href}
                        onClick={closeMobileMenu}
                        aria-current={active ? "page" : undefined}
                        className={`group relative flex items-center overflow-hidden text-sm font-semibold transition-all duration-200 ${
                          collapsed
                            ? "h-11 justify-center rounded-xl px-0"
                            : "rounded-xl px-3 py-2.5"
                        } ${
                          active
                            ? "bg-sidebar-primary/15 text-sidebar-primary"
                            : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        }`}
                      >
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-200 ${
                          active
                            ? "bg-sidebar-primary/20 text-sidebar-primary"
                            : "text-sidebar-foreground/50 group-hover:bg-sidebar-accent group-hover:text-sidebar-accent-foreground"
                        }`}>
                          <Icon className="h-[18px] w-[18px]" />
                        </span>
                        <motion.span
                          className="overflow-hidden whitespace-nowrap"
                          animate={{ opacity: collapsed ? 0 : 1, width: collapsed ? 0 : 176, marginLeft: collapsed ? 0 : 12 }}
                          initial={false}
                          transition={SIDEBAR_TRANSITION}
                          aria-hidden={collapsed}
                        >
                          {item.name}
                        </motion.span>
                      </Link>
                    </AppTooltip>
                    {!collapsed && item.name === "Leads" && location.pathname.startsWith("/leads") && (
                      <div className="ml-7 mt-2 space-y-1.5 border-l border-sidebar-border pl-3">
                        {[
                          { label: "All Lead", filter: "all" },
                          { label: "Fresh Lead", filter: "New" },
                          { label: "Callback", filter: "Contacted" },
                          { label: "Document Collection", filter: "Document Collection" },
                          { label: "Documents Pending", filter: "Documents Pending" },
                          { label: "Qualified / Approved", filter: "Qualified" },
                          { label: "Converted / Disbursed", filter: "Converted" },
                          { label: "Lost / Rejected", filter: "Lost" }
                        ].map((sub) => {
                          const params = new URLSearchParams(location.search);
                          const currentStatus = params.get("status") || "all";
                          const isSubActive = currentStatus === sub.filter;
                          return (
                            <Link
                              key={sub.label}
                              to={`/leads?status=${encodeURIComponent(sub.filter)}`}
                              onClick={closeMobileMenu}
                              className={`block rounded-md px-2 py-1 text-xs font-semibold transition ${
                                isSubActive
                                  ? "bg-sidebar-primary/15 text-sidebar-primary"
                                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                              }`}
                            >
                              {sub.label}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </nav>
      <div className="border-t border-slate-700/80 bg-sidebar-accent/5 px-3 py-3 shrink-0">
        {!collapsed ? (
          <div className="flex items-center justify-between gap-2">
            <div 
              onClick={() => setShowProfileModal(true)} 
              className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer group rounded-xl p-1.5 hover:bg-sidebar-accent/60 border border-transparent hover:border-sidebar-border/40 transition duration-200"
              title="Click to view full profile details"
            >
              <div className="relative shrink-0">
                <div className="h-11 w-11 rounded-full overflow-hidden ring-2 ring-emerald-500/50 bg-emerald-500/10 flex items-center justify-center shadow-md group-hover:scale-105 transition duration-200">
                  {isKanhaiyaUser ? (
                    <img src="/kanhaiya.jpg" alt="Kanhiya Profile" className="h-full w-full object-cover scale-105" />
                  ) : isHimanshuUser ? (
                    <img src="/himanshu.jpg" alt="Himanshu Profile" className="h-full w-full object-cover scale-105" />
                  ) : isNandiniUser ? (
                    <img src="/nandini.jpg" alt="Nandini Profile" className="h-full w-full object-cover scale-105" />
                  ) : user?.name === "Kajal" ? (
                    <img src="/kajal-avatar.jpg" alt="Kajal Profile" className="h-full w-full object-cover scale-105" />
                  ) : user?.email?.toLowerCase() === "prakash@waqtfinance.com" ? (
                    <img src="/collection-agent-profile.jpg" alt="Prakash Profile" className="h-full w-full object-cover scale-105" />
                  ) : isShrutiUser ? (
                    <img src="/shruti-avatar.jpg" alt="Shruti Profile" className="h-full w-full object-cover scale-105" />
                  ) : (
                    <UserCircle className="h-7 w-7 text-emerald-400" />
                  )}
                </div>
                <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-sidebar shadow-sm animate-pulse" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-extrabold text-sidebar-foreground truncate leading-tight group-hover:text-emerald-400 transition">
                  {isKanhaiyaUser
                    ? "Kanhiya Kumar"
                    : isHimanshuUser
                    ? "Himanshu"
                    : user?.email?.toLowerCase() === "prakash@waqtfinance.com"
                    ? "Prakash"
                    : isShrutiUser
                    ? "Shruti Singh"
                    : user?.name || "User"}
                </h4>
                <p className="text-[10px] font-bold text-emerald-400 truncate mt-0.5">
                  {isKanhaiyaUser || isHimanshuUser
                    ? "Collection Executive"
                    : isShrutiUser
                    ? "Senior Credit Manager"
                    : collectionAccount
                    ? "Collection"
                    : role
                    ? roleLabels[role]
                    : "Telecaller"}
                </p>
                <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-sidebar-foreground/60 mt-0.5">
                  <span className="h-1 w-1 rounded-full bg-emerald-400" />
                  {isShrutiUser ? "1+ Yrs Exp • WaqtMoney" : "Active Duty"}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={triggerLogoutConfirm}
              title="Logout"
              className="h-9 w-9 shrink-0 flex items-center justify-center rounded-xl text-red-500 hover:bg-transparent focus:outline-none transition-none cursor-pointer"
            >
              <LogOut className="h-4.5 w-4.5 text-red-500" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <AppTooltip label={isKanhaiyaUser ? "Kanhiya Kumar Profile" : isHimanshuUser ? "Himanshu Profile" : isShrutiUser ? "Shruti Singh Profile" : "View Profile"} side="right">
              <button
                type="button"
                onClick={() => setShowProfileModal(true)}
                className="relative h-10 w-10 shrink-0 rounded-full overflow-hidden ring-2 ring-emerald-500/50 bg-emerald-500/10 flex items-center justify-center shadow-md hover:scale-105 transition"
              >
                {isKanhaiyaUser ? (
                  <img src="/kanhaiya.jpg" alt="Kanhiya Profile" className="h-full w-full object-cover scale-105" />
                ) : isHimanshuUser ? (
                  <img src="/himanshu.jpg" alt="Himanshu Profile" className="h-full w-full object-cover scale-105" />
                ) : isNandiniUser ? (
                  <img src="/nandini.jpg" alt="Nandini Profile" className="h-full w-full object-cover scale-105" />
                ) : user?.name === "Kajal" ? (
                  <img src="/kajal-avatar.jpg" alt="Kajal Profile" className="h-full w-full object-cover scale-105" />
                ) : user?.email?.toLowerCase() === "prakash@waqtfinance.com" ? (
                  <img src="/collection-agent-profile.jpg" alt="Prakash Profile" className="h-full w-full object-cover scale-105" />
                ) : isShrutiUser ? (
                  <img src="/shruti-avatar.jpg" alt="Shruti Profile" className="h-full w-full object-cover scale-105" />
                ) : (
                  <UserCircle className="h-6 w-6 text-emerald-400" />
                )}
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-sidebar" />
              </button>
            </AppTooltip>
            <button
              type="button"
              onClick={triggerLogoutConfirm}
              title="Logout"
              className="h-9 w-9 shrink-0 flex items-center justify-center rounded-xl text-red-500 hover:bg-transparent focus:outline-none transition-none cursor-pointer"
            >
              <LogOut className="h-4 w-4 text-red-500" />
            </button>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="app-shell flex h-dvh w-full overflow-hidden bg-background text-foreground">
      <motion.aside
        className="relative z-40 hidden shrink-0 bg-sidebar text-sidebar-foreground lg:flex lg:flex-col"
        animate={{ width: sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH }}
        initial={false}
        transition={SIDEBAR_TRANSITION}
      >
        <SidebarContent collapsed={sidebarCollapsed} />
        <AppTooltip label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} side="right">
          <button
            type="button"
            className="absolute right-[-13px] top-[4.35rem] z-50 inline-flex h-6 w-6 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-sm transition-colors duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus:outline-none focus:ring-2 focus:ring-sidebar-ring/40"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-pressed={sidebarCollapsed}
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          >
            {sidebarCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          </button>
        </AppTooltip>
      </motion.aside>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            className="fixed inset-0 z-50 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <button
              type="button"
              className="absolute inset-0 bg-slate-950/50"
              aria-label="Close navigation"
              onClick={closeMobileMenu}
            />
            <motion.aside
              className="relative flex h-full w-[min(20rem,86vw)] flex-col bg-sidebar text-sidebar-foreground shadow-2xl"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            >
              <button
                type="button"
                className="absolute right-3 top-3 rounded-md p-2 text-slate-400 hover:bg-slate-900 hover:text-white"
                aria-label="Close menu"
                onClick={closeMobileMenu}
              >
                <X className="h-5 w-5" />
              </button>
              <SidebarContent />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-card/95 px-3 py-3 backdrop-blur sm:px-5">
          <div className="flex items-center gap-3">
            <AppTooltip label="Open navigation">
              <button
                type="button"
                className="rounded-lg border border-slate-200 dark:border-slate-800 p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 lg:hidden shrink-0"
                aria-label="Open navigation"
                onClick={() => setMobileMenuOpen(true)}
              >
                <PanelLeft className="h-5 w-5 text-indigo-400" />
              </button>
            </AppTooltip>

            {/* Mobile Brand Logo Display */}
            <div className="flex lg:hidden items-center gap-2.5 mr-auto">
              <div className="h-9 w-9 rounded-xl p-1 flex items-center justify-center border border-slate-200/50 shadow-sm shrink-0" style={{ backgroundColor: "#ffffff" }}>
                <img src={branding.logoUrl} alt={branding.name} className="h-full w-full object-contain" />
              </div>
              <div className="flex items-center text-sm font-black tracking-tight leading-none text-slate-900 dark:text-white">
                <span className="text-red-600">WAQT</span>
                <span className="text-blue-600 dark:text-blue-400 ml-1">FINANCE</span>
              </div>
            </div>

            <div className="hidden min-w-0 items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600 md:flex">
              <Building2 className="h-4 w-4 text-emerald-600" />
              <span className="truncate font-medium text-slate-900">{branding.company}</span>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">{workspace.environment}</span>
            </div>



            {searchFocused && (
              <button
                type="button"
                className="fixed inset-0 z-20 cursor-default bg-slate-950/10 backdrop-blur-[1px]"
                aria-label="Close search"
                onClick={() => setSearchFocused(false)}
              />
            )}

            <label ref={searchContainerRef} className={`relative min-w-0 flex-1 ${searchFocused ? "z-40" : ""}`}>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <button
                type="button"
                onClick={() => setCommandOpen(true)}
                className="absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground transition hover:bg-card md:inline-flex"
                aria-label="Open command palette"
              >
                <Command className="h-3 w-3" />
                Ctrl K
              </button>
              <input
                type="search"
                placeholder={searchPlaceholder}
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                onFocus={() => setSearchFocused(true)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && searchResults[0]) {
                    event.preventDefault();
                    openRecord(searchResults[0].href);
                  }
                  if (event.key === "Escape") {
                    setSearchFocused(false);
                  }
                }}
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-24 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
              />
              {searchFocused && (
                <div className="absolute left-0 right-0 top-12 z-40 overflow-hidden rounded-md border border-slate-200 bg-white shadow-xl">
                  <div className="max-h-80 overflow-y-auto py-2">
                    {searchResults.map((record) => (
                      <button
                        key={record.id}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => openRecord(record.href)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-slate-50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-slate-950">{record.title}</span>
                          <span className="block truncate text-xs text-slate-500">{record.subtitle}</span>
                        </span>
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{record.type}</span>
                      </button>
                    ))}
                    {searchResults.length === 0 && (
                      <div className="px-4 py-6 text-center text-sm text-slate-500">No matching records found</div>
                    )}
                  </div>
                </div>
              )}
            </label>

            <div className="hidden items-center gap-2 xl:flex">
              {role !== "accountant" && role !== "collection" && (
                <AppTooltip label="Export workspace CSV">
                  <button type="button" onClick={exportWorkspaceCsv} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    <Download className="h-4 w-4" />
                    Export
                  </button>
                </AppTooltip>
              )}
              <AppTooltip label="Refresh server health">
                <button type="button" onClick={refreshHealth} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  {healthStatus === "checking" ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                  ) : (
                    <Activity className={`h-4 w-4 ${healthStatus === "online" ? "text-emerald-600" : "text-red-600"}`} />
                  )}
                  {healthStatus === "online" ? "Online" : healthStatus === "offline" ? "Offline" : "Checking"}
                </button>
              </AppTooltip>
            </div>

            <ThemeToggle />
            {user && (
              <div ref={userMenuRef} className="relative">
                <AppTooltip label="User account">
                  <button
                    type="button"
                    onClick={() => setUserMenuOpen((open) => !open)}
                    className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full overflow-hidden border border-border bg-card hover:ring-2 hover:ring-emerald-500/20 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 transition shadow-sm"
                    aria-label="Open user account menu"
                    aria-expanded={userMenuOpen}
                  >
                    {isKanhaiyaUser ? (
                      <img src="/kanhaiya.jpg" alt="Kanhiya Profile" className="h-full w-full object-cover scale-105" />
                    ) : isHimanshuUser ? (
                      <img src="/himanshu.jpg" alt="Himanshu Profile" className="h-full w-full object-cover scale-105" />
                    ) : isNandiniUser ? (
                      <img src="/nandini.jpg" alt="Nandini Profile" className="h-full w-full object-cover scale-105" />
                    ) : user?.name === "Kajal" ? (
                      <img src="/kajal-avatar.jpg" alt="Kajal Profile" className="h-full w-full object-cover scale-105" />
                    ) : user?.email?.toLowerCase() === "prakash@waqtfinance.com" ? (
                      <img src="/collection-agent-profile.jpg" alt="Prakash Profile" className="h-full w-full object-cover scale-105" />
                    ) : isShrutiUser ? (
                      <img src="/shruti-avatar.jpg" alt="Shruti Credit Manager" className="h-full w-full object-cover scale-105" />
                    ) : (
                      <UserCircle className="h-6 w-6 text-emerald-500" />
                    )}
                  </button>
                </AppTooltip>
                {userMenuOpen && (
                  <div className="absolute right-0 top-13 z-50 w-80 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl">
                    <div className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full overflow-hidden bg-emerald-500/12 text-emerald-500 ring-2 ring-emerald-500/15">
                          {isKanhaiyaUser ? (
                            <img src="/kanhaiya.jpg" alt="Kanhiya Profile" className="h-full w-full object-cover scale-105" />
                          ) : isHimanshuUser ? (
                            <img src="/himanshu.jpg" alt="Himanshu Profile" className="h-full w-full object-cover scale-105" />
                          ) : isNandiniUser ? (
                            <img src="/nandini.jpg" alt="Nandini Profile" className="h-full w-full object-cover scale-105" />
                          ) : user?.name === "Kajal" ? (
                            <img src="/kajal-avatar.jpg" alt="Kajal Profile" className="h-full w-full object-cover scale-105" />
                          ) : user?.email?.toLowerCase() === "prakash@waqtfinance.com" ? (
                            <img src="/collection-agent-profile.jpg" alt="Prakash Profile" className="h-full w-full object-cover scale-105" />
                          ) : isShrutiUser ? (
                            <img src="/shruti-avatar.jpg" alt="Shruti Credit Manager" className="h-full w-full object-cover scale-105" />
                          ) : (
                            <UserCircle className="h-9 w-9" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {isKanhaiyaUser
                              ? "Kanhiya Kumar"
                              : isHimanshuUser
                              ? "Himanshu"
                              : user?.email?.toLowerCase() === "prakash@waqtfinance.com"
                              ? "Prakash"
                              : isShrutiUser
                              ? "Shruti Singh"
                              : user?.name || "User"}
                          </p>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-500">
                              {roleLabels[user.role]}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 rounded-md border border-border bg-muted/50 px-3 py-3">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Email</p>
                        <p className="mt-1 break-all text-sm font-medium text-foreground">{user.email}</p>
                      </div>
                    </div>
                    <div className="border-t border-border p-2 space-y-1">
                      <button
                        type="button"
                        onClick={() => {
                          setUserMenuOpen(false);
                          setShowProfileModal(true);
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/10 transition"
                      >
                        <UserCircle className="h-4 w-4" />
                        View Profile Details
                      </button>
                      <button
                        type="button"
                        onClick={triggerLogoutConfirm}
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold text-red-500 transition hover:bg-red-500/10 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                      >
                        <LogOut className="h-4 w-4" />
                        Logout
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
          <Suspense fallback={<PageLoading label="Loading page..." />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <Dialog open={commandOpen} onOpenChange={setCommandOpen}>
        <DialogContent className="crm-command-dialog p-0 sm:max-w-xl">
          <DialogHeader className="border-b border-border px-5 py-4 text-left">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Command className="h-4 w-4 text-primary" />
              Command Center
            </DialogTitle>
            <DialogDescription>Jump to key CRM workflows.</DialogDescription>
          </DialogHeader>
          <div className="p-2">
            {visibleCommandActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => openCommand(action.href)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-muted focus:bg-muted focus:outline-none"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-foreground">{action.label}</span>
                    <span className="block text-xs text-muted-foreground">{action.meta}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
      {showProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xl">
            {/* Header Banner */}
            <div className="h-28 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-4 flex justify-between items-start relative border-b border-indigo-500/20">
              <div className="flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-md px-3 py-1 text-[11px] font-black text-indigo-300 border border-white/15">
                <Building className="h-3.5 w-3.5 text-indigo-400" />
                <span>{branding.company}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowProfileModal(false)}
                className="rounded-full bg-black/40 p-1.5 text-white/80 hover:bg-black/80 hover:text-white transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Avatar & Core Profile Info */}
            <div className="px-5 pb-5 pt-0">
              <div className="relative -mt-12 mb-3.5 flex items-end justify-between">
                <button
                  type="button"
                  onClick={() => {
                    const avatarSrc = isKanhaiyaUser
                      ? "/kanhaiya.jpg"
                      : isHimanshuUser
                      ? "/himanshu.jpg"
                      : isNandiniUser
                      ? "/nandini.jpg"
                      : isShrutiUser
                      ? "/shruti-avatar.jpg"
                      : user?.name === "Kajal"
                      ? "/kajal-avatar.jpg"
                      : user?.email?.toLowerCase() === "prakash@waqtfinance.com"
                      ? "/collection-agent-profile.jpg"
                      : null;
                    if (avatarSrc) setFullImageModal(avatarSrc);
                  }}
                  className="group relative h-24 w-24 rounded-2xl overflow-hidden ring-4 ring-white dark:ring-slate-900 bg-slate-800 shadow-xl flex items-center justify-center cursor-pointer transition transform hover:scale-105"
                  title="Click to view full portrait"
                >
                  {isKanhaiyaUser ? (
                    <img src="/kanhaiya.jpg" alt="Kanhiya Profile" className="h-full w-full object-cover scale-105" />
                  ) : isHimanshuUser ? (
                    <img src="/himanshu.jpg" alt="Himanshu Profile" className="h-full w-full object-cover scale-105" />
                  ) : isNandiniUser ? (
                    <img src="/nandini.jpg" alt="Nandini Profile" className="h-full w-full object-cover" />
                  ) : user?.name === "Kajal" ? (
                    <img src="/kajal-avatar.jpg" alt="Kajal Profile" className="h-full w-full object-cover" />
                  ) : user?.email?.toLowerCase() === "prakash@waqtfinance.com" ? (
                    <img src="/collection-agent-profile.jpg" alt="Prakash Profile" className="h-full w-full object-cover scale-105" />
                  ) : isShrutiUser ? (
                    <img src="/shruti-avatar.jpg" alt="Shruti Credit Manager" className="h-full w-full object-cover scale-105" />
                  ) : (
                    <UserCircle className="h-16 w-16 text-indigo-400" />
                  )}
                  <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white transition duration-200">
                    <Maximize2 className="h-5 w-5 text-indigo-300 mb-0.5" />
                    <span className="text-[9px] font-black uppercase tracking-wider">Expand</span>
                  </div>
                </button>

                <div className="flex flex-col items-end gap-1">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-0.5 text-[11px] font-black text-emerald-600 dark:text-emerald-400">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    On Duty Active
                  </span>
                  <span className="text-[10px] font-extrabold text-slate-400">
                    Shift: 10:00 AM - 06:30 PM
                  </span>
                </div>
              </div>

              {/* Title & Role */}
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-black text-slate-950 dark:text-white tracking-tight">
                    {isKanhaiyaUser
                      ? "Kanhiya Kumar"
                      : isHimanshuUser
                      ? "Himanshu"
                      : isNandiniUser
                      ? "Nandni Gupta"
                      : user?.email?.toLowerCase() === "prakash@waqtfinance.com"
                      ? "Prakash"
                      : isShrutiUser
                      ? "Shruti Singh"
                      : user?.name || "CRM User"}
                  </h3>
                  <CheckCircle2 className="h-4.5 w-4.5 text-indigo-500 shrink-0" />
                </div>
                <p className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mt-0.5">
                  {isKanhaiyaUser
                    ? "Collection Executive • Debt Recovery"
                    : isHimanshuUser
                    ? "Collection Executive • Debt Recovery"
                    : isNandiniUser
                    ? "Sales & Support Telecaller • Retail Lending"
                    : user?.email?.toLowerCase() === "prakash@waqtfinance.com"
                    ? "Collection Manager • Debt Recovery"
                    : isShrutiUser
                    ? "Senior Credit Manager • Risk & Underwriting"
                    : role ? roleLabels[role] : "CRM User"}
                </p>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                  {isKanhaiyaUser
                    ? `Collection Executive managing customer loan recovery, field collection followups, PTP tracking, and CRM collection workflows at ${branding.name}.`
                    : isNandiniUser
                    ? `Commerce Graduate with hands-on experience in loan sales, customer acquisition, lead qualification, and CRM documentation at ${branding.name}.`
                    : isShrutiUser
                    ? "Credit risk manager evaluating CAM sheets, CIBIL reports, bank statements, and instant loan approval compliance."
                    : "Managing customer accounts, loan operations, and CRM workflows."}
                </p>
              </div>

              {/* Official Employee Details Card */}
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-2.5">
                  <Mail className="h-4 w-4 text-indigo-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Official Email</p>
                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                      {isNandiniUser ? "nandini@waqtmoney.in" : isShrutiUser ? (user?.email || "shruti@waqtmoney.in") : user?.email}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-2.5">
                    <ShieldCheck className="h-4 w-4 text-indigo-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Employee ID</p>
                      <p className="text-xs font-black text-slate-900 dark:text-slate-100">
                        {isKanhaiyaUser
                          ? "WQTM-COL-109"
                          : isHimanshuUser
                          ? "WQTM-COL-108"
                          : isNandiniUser
                          ? "WQTM-TEL-201"
                          : user?.email?.toLowerCase() === "prakash@waqtfinance.com"
                          ? "COL-EMP-0402"
                          : isShrutiUser
                          ? "WQTM-CRD-0892"
                          : "EMP-1082"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-2.5">
                    <Phone className="h-4 w-4 text-indigo-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Contact Number</p>
                      <p className="text-xs font-black text-slate-900 dark:text-slate-100">
                        {isHimanshuUser
                          ? "-"
                          : isNandiniUser
                          ? "+91 92174 02920"
                          : user?.email?.toLowerCase() === "prakash@waqtfinance.com"
                          ? "+91 9217086602"
                          : isShrutiUser
                          ? "+91 9217086608"
                          : "-"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-2.5">
                    <Building className="h-4 w-4 text-indigo-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Branch Office</p>
                      <p className="text-xs font-black text-slate-900 dark:text-slate-100 truncate" title="BSI Business Park, Sector 63, Noida, UP - 201301">
                        BSI Business Park, Sector 63, Noida, UP - 201301
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-2.5">
                    <Sparkles className="h-4 w-4 text-indigo-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Qualification</p>
                      <p className="text-xs font-black text-slate-900 dark:text-slate-100">
                        {isNandiniUser ? "B.Com (2022)" : "Graduate"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Core Expertise Skills */}
                <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 p-3">
                  <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-indigo-500" />
                    Operational Competencies
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {(isHimanshuUser || collectionAccount
                      ? ["Loan Recovery", "Debt Collection", "PTP Management", "Customer Communication", "Field Followups"]
                      : isNandiniUser
                      ? ["Loan Sales", "Lead Generation", "Customer Relationship", "Excel", "Axis Bank Credit Process"]
                      : ["Credit Underwriting", "CAM Sheet Evaluation", "CIBIL Audit", "Salary Slip Analysis"]
                    ).map((skill) => (
                      <span key={skill} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-0.5 text-[10px] font-extrabold text-slate-800 dark:text-slate-200">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-5 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    const avatarSrc = isKanhaiyaUser
                      ? "/kanhaiya.jpg"
                      : isHimanshuUser
                      ? "/himanshu.jpg"
                      : isNandiniUser
                      ? "/nandini.jpg"
                      : isShrutiUser
                      ? "/shruti-avatar.jpg"
                      : user?.name === "Kajal"
                      ? "/kajal-avatar.jpg"
                      : user?.email?.toLowerCase() === "prakash@waqtfinance.com"
                      ? "/collection-agent-profile.jpg"
                      : null;
                    if (avatarSrc) setFullImageModal(avatarSrc);
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 py-2.5 text-xs font-black text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition shadow-xs cursor-pointer"
                >
                  <Maximize2 className="h-3.5 w-3.5 text-indigo-500" />
                  <span>View Portrait Photo</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowProfileModal(false)}
                  className="flex-1 rounded-xl bg-slate-900 dark:bg-white py-2.5 text-center text-xs font-black text-white dark:text-slate-900 shadow hover:bg-slate-800 dark:hover:bg-slate-100 transition cursor-pointer"
                >
                  Close Profile
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Image Lightbox Modal */}
      {fullImageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-2xl p-4 animate-in fade-in duration-200">
          <div className="relative max-w-xl w-full flex flex-col items-center">
            {/* Top Close Bar */}
            <div className="w-full flex items-center justify-between pb-3 text-white">
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-emerald-400" />
                <span className="text-sm font-bold text-slate-200">{user?.name || "User"} — Profile Details ({branding.name})</span>
              </div>
              <button
                type="button"
                onClick={() => setFullImageModal(null)}
                className="rounded-full bg-slate-800 p-2 text-white hover:bg-slate-700 transition"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* High-res Image Preview */}
            <div className="relative overflow-hidden rounded-3xl border-2 border-emerald-500/50 shadow-2xl bg-slate-900 max-h-[80vh] flex items-center justify-center">
              <img
                src={fullImageModal}
                alt="Profile Full View"
                className="max-h-[75vh] w-auto object-contain rounded-2xl p-1"
              />
            </div>

            <div className="mt-4 flex items-center gap-3">
              <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-4 py-1 text-xs font-bold text-emerald-400">
                Official Profile Photo • {branding.name} Panel
              </span>
              <button
                type="button"
                onClick={() => setFullImageModal(null)}
                className="rounded-full bg-slate-800 px-4 py-1 text-xs font-bold text-white hover:bg-slate-700 transition"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={showLogoutConfirmModal}
        onClose={() => setShowLogoutConfirmModal(false)}
        onConfirm={handleLogout}
        title="Confirm Logout"
        description={`Are you sure you want to end your session and log out of ${branding.name} CRM?`}
        confirmText="Logout"
        cancelText="Cancel"
        variant="danger"
        iconType="logout"
      />
    </div>
  );
}
