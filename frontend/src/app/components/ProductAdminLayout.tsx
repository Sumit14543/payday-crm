import React, { useState, useEffect, useRef } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  LayoutDashboard,
  Users,
  GitFork,
  FileText,
  BarChart3,
  UsersRound,
  Settings,
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  Bell,
  Search,
  ChevronDown,
  LogOut,
  User,
  Sun,
  Moon,
  Briefcase,
  Layers,
  Sparkles,
  Command,
  HelpCircle,
  MessageSquare,
  CheckSquare,
  Plus,
  Wallet,
  PiggyBank,
  Server,
  IndianRupee,
  ShieldAlert,
  Zap
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { apiGet } from "../lib/api";
import { getTenantBranding } from "../lib/tenant";
import { useTheme } from "../lib/theme";
import { ConfirmationModal } from "./ui/ConfirmationModal";

export function ProductAdminLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const branding = getTenantBranding();

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showLogoutConfirmModal, setShowLogoutConfirmModal] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState(branding.name);
  const [activeProduct, setActiveProduct] = useState("Payday Loan (Standard)");

  const getProductPrefix = (prodName: string) => {
    if (prodName.includes("Standard")) return "Standard";
    if (prodName.includes("Express")) return "Express";
    if (prodName.includes("Flexi")) return "Flexi";
    if (prodName.includes("Premium")) return "Premium";
    return "Product";
  };

  const reportsList = [
    { label: "Lead Report", type: "lead-report" },
    { label: "Application Report", type: "application-report" },
    { label: "Loan Report", type: "loan-report" },
    { label: "Disbursement Report", type: "disbursement-report" },
    { label: "Collection Report", type: "collection-report" },
    { label: "CIBIL Bureau Report", type: "cibil-report" },
    { label: "Due Report", type: "due-report" },
    { label: "DPD Bucket Report", type: "dpd-bucket-report" },
    { label: "Interest Accrued Report", type: "interest-accrued-report" },
    { label: "Outstanding Report", type: "outstanding-report" },
    { label: "Payment Report", type: "payment-report" },
    { label: "Employee Performance", type: "employee-performance" },
    { label: "Customer Report", type: "customer-report" },
    { label: "Recovery Report", type: "recovery-report" },
    { label: "Dashboard Summary", type: "" },
    { label: "Audit Log Report", type: "audit-log-report" }
  ];
  const { isDark, toggleTheme } = useTheme();
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
  const [showProductMenu, setShowProductMenu] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotificationDrawer, setShowNotificationDrawer] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  // Dynamic Real-time Live Alerts fetched from Database Leads
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);


  useEffect(() => {
    let active = true;

    apiGet<any[]>("/leads")
      .then((data) => {
        if (active && Array.isArray(data) && data.length > 0) {
          const sorted = [...data].sort((a, b) => {
            const tA = new Date(a.createdAt || a.date || 0).getTime();
            const tB = new Date(b.createdAt || b.date || 0).getTime();
            return tB - tA;
          });

          const liveAlerts = sorted.slice(0, 10).map((l, idx) => {
            let title = "New Lead Received";
            let msg = `New application received for ${l.name}`;

            if (l.status === "Approved" || l.status === "Qualified") {
              title = "Application Approved";
              msg = `Sanction approved: ₹${Number(l.amount || l.loanAmount || 25000).toLocaleString("en-IN")} for ${l.name}`;
            } else if (l.status === "Disbursed" || l.status === "Converted") {
              title = "Disbursement Processed";
              msg = `Loan disbursed: ₹${Number(l.amount || l.loanAmount || 25000).toLocaleString("en-IN")} to ${l.name}`;
            } else if (l.status === "KYC Pending" || l.status === "Documents Pending" || l.status === "Document Collection") {
              title = "KYC Verification Pending";
              msg = `Document verification required for ${l.name}`;
            } else if (l.status === "Rejected" || l.status === "Lost") {
              title = "Application Rejected";
              msg = `Application rejected for ${l.name}`;
            } else if (l.status === "Contacted" || l.status === "Interested") {
              title = "Borrower Contacted";
              msg = `Contact established with ${l.name} by ${l.assignedTo || "Operations"}`;
            } else if (l.assignedTo && l.assignedTo !== "Unassigned") {
              title = "Lead Assigned";
              msg = `${l.name} assigned to ${l.assignedTo}`;
            }

            let timeStr = "Just now";
            const ts = l.createdAt || l.date;
            if (ts) {
              const diffMs = Date.now() - new Date(ts).getTime();
              const diffMins = Math.floor(diffMs / 60000);
              if (diffMins < 1) timeStr = "Just now";
              else if (diffMins < 60) timeStr = `${diffMins} min ago`;
              else {
                const diffHours = Math.floor(diffMins / 60);
                if (diffHours < 24) timeStr = `${diffHours} hour ago`;
                else timeStr = `${Math.floor(diffHours / 24)} day ago`;
              }
            } else {
              timeStr = `${(idx + 1) * 5} min ago`;
            }

            return {
              id: l.id || `alert-${idx}`,
              title,
              message: msg,
              time: timeStr,
              read: idx >= 3
            };
          });

          setNotifications(liveAlerts);
          setNotificationsLoading(false);
        } else if (active) {
          setNotifications([
            { id: "L-1082", title: "New Lead Received", message: "New application received for Rahul Sharma", time: "2 min ago", read: false },
            { id: "L-1081", title: "KYC Pending", message: "Document verification required for Amit Patel", time: "15 min ago", read: false },
            { id: "L-1080", title: "Disbursement Processed", message: "Loan disbursed: ₹1,50,000 to Jyoti Singh", time: "45 min ago", read: false },
            { id: "L-1079", title: "Application Approved", message: "Sanction approved: ₹75,000 for Vikram Malhotra", time: "2 hours ago", read: true }
          ]);
          setNotificationsLoading(false);
        }
      })
      .catch((err) => {
        console.error("Failed to load live alerts:", err);
        if (active) setNotificationsLoading(false);
      });

    return () => { active = false; };
  }, []);

  // Handle Ctrl+K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setShowCommandPalette((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Grouped Navigation configuration matching standard Admin Panel structure
  const sidebarGroups = [
    {
      title: "Navigation",
      items: [
        { name: "Dashboard", href: "/", icon: LayoutDashboard }
      ]
    },
    {
      title: "Lead Management",
      items: [
        { name: "Leads", href: "/leads", icon: GitFork },
        { name: "Revenue Analytics", href: "/revenue", icon: IndianRupee }
      ]
    },
    {
      title: "Loan Lifecycle",
      items: [
        { name: "Credit Applications", href: "/credit-applications", icon: Briefcase },
        { name: "Disbursals", href: "/loan-management", icon: Wallet },
        { name: "Collections", href: "/collections", icon: PiggyBank }
      ]
    },
    {
      title: "Customers & Assets",
      items: [
        { name: "Customers", href: "/customers", icon: Users },
        { name: "Team", href: "/team", icon: UsersRound }
      ]
    },
    {
      title: "System",
      items: [
        { name: "Reports", href: "/reports", icon: BarChart3 },
        { name: "Audit Logs", href: "/audit-logs", icon: ShieldAlert },
        { name: "Settings", href: "/settings", icon: Settings },
        { name: "Integrations", href: "/integrations", icon: Server, disabled: true }
      ]
    }
  ];

  // Derived navItems for command palette and mobile menu drawer
  const navItems = sidebarGroups.flatMap((group) => group.items.filter((item) => !item.disabled));

  // Breadcrumbs calculation (removing any trailing empty/index items)
  const pathParts = location.pathname.split("/").filter(Boolean);
  const breadcrumbs = pathParts.map((part, index) => {
    const href = "/" + pathParts.slice(0, index + 1).join("/");
    const label = part.charAt(0).toUpperCase() + part.slice(1).replace("-", " ");
    return { label, href, active: index === pathParts.length - 1 };
  });

  return (
    <div className="h-dvh w-full flex bg-slate-50 dark:bg-slate-950 font-sans overflow-hidden">
      
      {/* SIDEBAR FOR DESKTOP */}
      <aside
        className={`hidden md:flex flex-col bg-slate-900 border-r border-slate-800/80 shadow-sm z-30 h-full shrink-0 ${
          isSidebarCollapsed ? "w-20" : "w-64"
        }`}
      >
        {/* Sidebar Header */}
        <div className="h-16 flex items-center justify-between pl-4 pr-2 border-b border-slate-800/60 shrink-0">
          <Link to="/" className="flex items-center gap-3 overflow-hidden">
            <div className="w-11 h-11 rounded-xl p-1 border border-slate-200/60 flex items-center justify-center shadow-md shrink-0 hover:scale-105 transition-transform" style={{ backgroundColor: "#ffffff" }}>
              <img src={branding.logoUrl} alt={branding.name} className="w-full h-full object-contain" />
            </div>
            {!isSidebarCollapsed && (
              <div>
                <div className="flex items-center text-base font-black tracking-tight text-white whitespace-nowrap">
                  <span className="text-red-500">WAQT</span>
                  <span className="text-blue-400 ml-1">FINANCE</span>
                </div>
                <span className="block text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Product Admin</span>
              </div>
            )}
          </Link>
          
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="p-2 rounded-xl bg-slate-800/60 border border-slate-700/60 text-slate-300 hover:text-white hover:bg-slate-800 transition-all duration-200 cursor-pointer flex items-center justify-center shadow-sm ml-auto mr-0"
            title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isSidebarCollapsed ? (
              <PanelLeftOpen className="w-5 h-5 text-indigo-400 animate-pulse" />
            ) : (
              <PanelLeftClose className="w-5 h-5 text-slate-300 group-hover:text-white" />
            )}
          </button>
        </div>

        {/* Sidebar Nav Links */}
        <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
          {sidebarGroups.map((group, gIdx) => (
            <div key={gIdx} className={`space-y-1.5 ${gIdx > 0 ? "pt-4 border-t border-slate-700/60" : ""}`}>
              {!isSidebarCollapsed && (
                <span className="text-[10px] font-black text-slate-400/90 uppercase tracking-wider px-3 block mb-2">
                  {group.title}
                </span>
              )}
              {group.items.map((item) => {
                const isActive =
                  item.href === "/"
                    ? location.pathname === "/"
                    : location.pathname.startsWith(item.href);

                const isLeads = item.href === "/leads";
                const isReports = item.href === "/reports";

                return (
                  <div key={item.name} className="space-y-1">
                    {item.disabled ? (
                      <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-500 opacity-60">
                        <div className="flex items-center gap-3">
                          <item.icon className="w-4.5 h-4.5 shrink-0" />
                          {!isSidebarCollapsed && <span>{item.name}</span>}
                        </div>
                        {!isSidebarCollapsed && (
                          <span className="text-[8px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-bold tracking-wider uppercase">Soon</span>
                        )}
                      </div>
                    ) : (
                      <Link
                        to={item.href}
                        className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
                          isActive
                            ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/30 shadow-sm"
                            : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                        }`}
                      >
                        <item.icon className={`w-4.5 h-4.5 shrink-0 ${isActive ? "text-indigo-400" : "text-slate-400"}`} />
                        {!isSidebarCollapsed && <span>{item.name}</span>}
                      </Link>
                    )}

                    {/* Submenu for Reports */}
                    {isReports && isActive && !isSidebarCollapsed && (
                      <div className="pl-6 space-y-0.5 mt-1 border-l border-slate-800 ml-5 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
                        {reportsList.map((sub, sIdx) => {
                          const params = new URLSearchParams(location.search);
                          const currentType = params.get("type") || "";
                          const isSubActive = currentType === sub.type || (sub.type === "" && !currentType);
                          
                          const basePath = location.pathname.startsWith("/product-admin") ? "/product-admin/reports" : "/reports";
                          return (
                            <Link
                              key={sIdx}
                              to={sub.type ? `${basePath}?type=${sub.type}` : basePath}
                              className={`block py-1.5 px-3 text-[11px] font-medium rounded-lg transition-all truncate ${
                                isSubActive
                                  ? "text-indigo-400 bg-indigo-950/40"
                                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
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
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-slate-700/80 shrink-0">
          <button
            onClick={() => setShowLogoutConfirmModal(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold text-red-500 hover:bg-transparent font-sans cursor-pointer transition-none"
          >
            <LogOut className="w-4.5 h-4.5 shrink-0 text-red-500" />
            {!isSidebarCollapsed && <span className="tracking-wide text-red-500">Log Out</span>}
          </button>
        </div>
      </aside>

      {/* MOBILE HEADER */}
      <div className="md:hidden fixed top-0 inset-x-0 h-16 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 flex items-center justify-between px-4 z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg p-0.5 border border-slate-200/60 flex items-center justify-center shadow-md shrink-0" style={{ backgroundColor: "#ffffff" }}>
            <img src={branding.logoUrl} alt={branding.name} className="w-full h-full object-contain" />
          </div>
          <div className="flex items-center text-sm font-black tracking-tight text-white">
            <span className="text-red-500">WAQT</span>
            <span className="text-blue-400 ml-1">FINANCE</span>
          </div>
        </div>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 rounded-xl bg-slate-800/60 border border-slate-700/60 text-slate-200 hover:text-white"
        >
          {isMobileMenuOpen ? <X className="w-5 h-5" /> : <PanelLeft className="w-5 h-5 text-indigo-400" />}
        </button>
      </div>

      {/* MOBILE MENU DRAWER */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-black z-40 md:hidden"
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "tween", duration: 0.25 }}
              className="fixed top-0 bottom-0 left-0 w-64 bg-slate-900 shadow-2xl z-50 p-4 flex flex-col md:hidden"
            >
              <div className="flex items-center justify-between mb-6 border-b border-slate-800 pb-3">
                <span className="font-extrabold text-sm text-slate-200">Navigation</span>
                <button onClick={() => setIsMobileMenuOpen(false)} className="p-1 text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="flex-1 space-y-1.5 overflow-y-auto">
                {navItems.map((item) => {
                  const isActive =
                    item.href === "/"
                      ? location.pathname === "/"
                      : location.pathname.startsWith(item.href);

                  const isLeads = item.href === "/leads";

                  return (
                    <div key={item.name} className="space-y-1">
                      <Link
                        to={item.href}
                        onClick={() => {
                          if (!isLeads) setIsMobileMenuOpen(false);
                        }}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition ${
                          isActive ? "bg-indigo-950/50 text-indigo-400" : "text-slate-300 hover:bg-slate-800/60"
                        }`}
                      >
                        <item.icon className={`w-4.5 h-4.5 ${isActive ? "text-indigo-400" : "text-slate-400"}`} />
                        <span>{item.name}</span>
                      </Link>
                    </div>
                  );
                })}
              </nav>
              <button
                onClick={() => setShowLogoutConfirmModal(true)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold text-rose-400 hover:bg-rose-950/20 w-full mt-auto cursor-pointer"
              >
                <LogOut className="w-4.5 h-4.5" />
                <span>Log Out</span>
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* MAIN CONTENT WRAPPER */}
      <div className="flex-1 flex flex-col min-w-0 md:pl-0 pt-16 md:pt-0 h-full overflow-hidden">
        
        {/* TOP NAVIGATION BAR */}
        <header className="h-18 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between px-6 sticky top-0 z-20 shrink-0">
          
          {/* Left Side: Search & Switches */}
          <div className="flex items-center gap-3">
            
            {/* Search triggers Ctrl+K */}
            <button
              onClick={() => setShowCommandPalette(true)}
              className="hidden lg:flex items-center gap-3 px-4 h-11.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold w-64 transition shadow-sm cursor-pointer"
            >
              <Search className="w-4.5 h-4.5 text-slate-400" />
              <span>Search or Ctrl + K...</span>
              <kbd className="ml-auto bg-white dark:bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[10px] shadow-sm font-mono font-bold text-slate-500">⌘K</kbd>
            </button>

            {/* Workspace Switcher */}
            <div className="flex items-center gap-2 px-4 h-11.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-slate-800 dark:text-slate-200 text-xs font-black shadow-sm">
              <Briefcase className="w-4.5 h-4.5 text-indigo-500 shrink-0" />
              <span>{activeWorkspace}</span>
            </div>

            {/* Product Switcher */}
            <div className="flex items-center gap-2 px-4 h-11.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-slate-800 dark:text-slate-200 text-xs font-black shadow-sm">
              <Layers className="w-4.5 h-4.5 text-violet-500 shrink-0" />
              <span>{activeProduct}</span>
            </div>

          </div>

          {/* Right Side: Proportional Tools & Profile */}
          <div className="flex items-center gap-3">

            {/* Quick Create (+) Button */}
            <button
              onClick={() => navigate("/leads")}
              className="w-11.5 h-11.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 text-indigo-600 dark:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition shadow-sm cursor-pointer flex items-center justify-center shrink-0"
              title="Quick Create Lead"
            >
              <Plus className="w-5 h-5" />
            </button>

            {/* Task Center Button */}
            <button
              onClick={() => navigate("/")}
              className="w-11.5 h-11.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition shadow-sm relative cursor-pointer flex items-center justify-center shrink-0"
              title="Task Center"
            >
              <CheckSquare className="w-5 h-5" />
              <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            </button>
            
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="w-11.5 h-11.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition shadow-sm cursor-pointer flex items-center justify-center shrink-0"
              title="Toggle Theme"
            >
              {isDark ? <Sun className="w-5 h-5 text-amber-500 animate-pulse" /> : <Moon className="w-5 h-5 text-indigo-500" />}
            </button>

            {/* Notification Center */}
            <div className="relative">
              <button
                onClick={() => setShowNotificationDrawer(!showNotificationDrawer)}
                className="w-11.5 h-11.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition shadow-sm relative cursor-pointer flex items-center justify-center shrink-0"
                title="Live Operational Alerts"
              >
                <Bell className="w-5 h-5" />
                {notifications.filter(n => !n.read).length > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center ring-2 ring-white dark:ring-slate-900 animate-pulse">
                    {notifications.filter(n => !n.read).length}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {showNotificationDrawer && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowNotificationDrawer(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl p-4 z-20"
                    >
                      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5 mb-3">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-xs text-slate-900 dark:text-white">Live Operations Alerts</span>
                          {notifications.filter(n => !n.read).length > 0 && (
                            <span className="px-1.5 py-0.5 rounded-full text-[8px] font-black bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                              {notifications.filter(n => !n.read).length} New
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => setNotifications(prev => prev.map(n => ({ ...n, read: true })))}
                          className="text-[10px] text-indigo-600 dark:text-indigo-400 font-black hover:underline cursor-pointer"
                        >
                          Mark all read
                        </button>
                      </div>

                      <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                        {notificationsLoading ? (
                          <div className="py-6 text-center text-xs font-bold text-slate-400 animate-pulse">
                            Loading live system alerts...
                          </div>
                        ) : notifications.length === 0 ? (
                          <div className="py-6 text-center text-xs font-bold text-slate-400">
                            No active alerts at this moment
                          </div>
                        ) : (
                          notifications.map((n) => (
                            <div
                              key={n.id}
                              className={`p-3 rounded-xl border transition-all ${
                                n.read
                                  ? "bg-slate-50/50 dark:bg-slate-950/20 border-slate-100 dark:border-slate-800/60 opacity-75"
                                  : "bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-transparent border-indigo-500/20 dark:border-indigo-500/30"
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-black text-[11px] text-slate-900 dark:text-white flex items-center gap-1.5">
                                  {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />}
                                  {n.title}
                                </span>
                                <span className="text-[9px] text-slate-400 font-bold shrink-0">{n.time}</span>
                              </div>
                              <p className="text-[10.5px] text-slate-600 dark:text-slate-300 leading-normal font-medium">{n.message}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* Vertical Divider */}
            <div className="h-7 w-px bg-slate-200 dark:bg-slate-800 mx-1 shrink-0" />

            {/* Profile Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-3.5 h-13.5 px-3 pr-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/40 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-all duration-200 shadow-sm cursor-pointer group shrink-0"
              >
                <div className="relative w-10.5 h-10.5 rounded-xl overflow-hidden ring-2 ring-indigo-500/40 dark:ring-indigo-400/50 shadow-md group-hover:scale-105 transition-transform duration-200 shrink-0 my-auto">
                  <img
                    src="/product-admin-avatar.jpg"
                    alt="Admin Profile"
                    className="w-full h-full object-cover object-top"
                  />
                  <span className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
                </div>
                <div className="hidden lg:flex flex-col text-left py-0.5">
                  <span className="font-black text-xs text-slate-900 dark:text-white leading-tight">Admin</span>
                  <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-extrabold tracking-wide mt-0.5">Bhupender Singh</span>
                </div>
                <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200 transition ml-0.5" />
              </button>

              <AnimatePresence>
                {showProfileMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowProfileMenu(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-2 w-60 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl overflow-hidden z-20"
                    >
                      {/* Profile Card Header */}
                      <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/40">
                        <div className="flex items-center gap-3">
                          <div className="relative w-12 h-12 rounded-xl overflow-hidden ring-2 ring-indigo-500/40 shadow-sm shrink-0">
                            <img
                              src="/product-admin-avatar.jpg"
                              alt="Admin Profile"
                              className="w-full h-full object-cover object-top"
                            />
                            <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="font-black text-sm text-slate-900 dark:text-white truncate">Admin</h4>
                            <p className="text-[11px] font-extrabold text-indigo-600 dark:text-indigo-400 mt-0.5 truncate">
                              Bhupender Singh
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="p-1 space-y-0.5">
                        <button
                          onClick={() => {
                            navigate("/settings");
                            setShowProfileMenu(false);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all cursor-pointer"
                        >
                          <User className="w-4 h-4 text-slate-400" />
                          <span>My Account</span>
                        </button>
                        <button
                          onClick={() => {
                            navigate("/settings");
                            setShowProfileMenu(false);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all cursor-pointer"
                        >
                          <Settings className="w-4 h-4 text-slate-400" />
                          <span>CRM Config</span>
                        </button>
                        <div className="border-t border-slate-100 dark:border-slate-800 my-1" />
                        <button
                          onClick={() => {
                            setShowProfileMenu(false);
                            setShowLogoutConfirmModal(true);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all cursor-pointer"
                        >
                          <LogOut className="w-4 h-4" />
                          <span>Logout</span>
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

          </div>

        </header>

        {/* BREADCRUMB & PAGE HEADER */}
        <div className="px-6 pt-5 shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-1">
            <nav className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              <Link to="/" className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">DASHBOARD</Link>
              {breadcrumbs.length > 0 && breadcrumbs[0].href !== "/" && (
                <>
                  {breadcrumbs.map((crumb) => (
                    <React.Fragment key={crumb.href}>
                      <span className="text-slate-305 dark:text-slate-800">/</span>
                      {crumb.active ? (
                        <span className="text-slate-500 dark:text-slate-300 font-black">{crumb.label}</span>
                      ) : (
                        <Link to={crumb.href} className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">{crumb.label}</Link>
                      )}
                    </React.Fragment>
                  ))}
                </>
              )}
            </nav>
            <h1 className="text-lg font-black text-slate-800 dark:text-white tracking-tight leading-none mt-1">
              {location.pathname === "/" ? "Operations Control Center" : breadcrumbs[breadcrumbs.length - 1]?.label || "Control Center"}
            </h1>
            {location.pathname === "/" && (
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mt-1">Real-Time CRM Operations Monitor</span>
            )}
          </div>
          
          <div className="flex items-center gap-2 text-[10px] font-extrabold text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/80 px-3 py-1.5 rounded-xl shadow-sm self-start md:self-auto">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span>Operational Integrity: 100% Secure</span>
          </div>
        </div>

        {/* DYNAMIC VIEW ROUTER OUTLET */}
        <main className="flex-1 p-6 overflow-y-auto bg-white dark:bg-slate-950">
          <React.Suspense fallback={
            <div className="space-y-6 animate-pulse p-4">
              <div className="h-8 w-1/4 bg-slate-200 dark:bg-slate-800 rounded-lg" />
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-24 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
                ))}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="h-60 bg-slate-200 dark:bg-slate-800 rounded-2xl lg:col-span-2" />
                <div className="h-60 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
              </div>
            </div>
          }>
            <Outlet context={{ activeProduct }} />
          </React.Suspense>
        </main>
      </div>

      {/* FLOATING ACTION ACTION SHORTCUTS (FAB) */}
      <div className="fixed bottom-6 right-6 z-40">
        <button
          onClick={() => setShowCommandPalette(true)}
          className="w-12 h-12 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-600 text-white flex items-center justify-center shadow-lg hover:scale-105 transition-all shadow-indigo-500/30 cursor-pointer"
          title="Open Command Palette"
        >
          <Command className="w-5 h-5 animate-pulse" />
        </button>
      </div>

      {/* GLOBAL COMMAND PALETTE (CTRL+K MODAL) */}
      <AnimatePresence>
        {showCommandPalette && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCommandPalette(false)}
              className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xl rounded-2xl p-4 z-[60] overflow-hidden"
            >
              <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-3 mb-3">
                <Search className="w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Type to search leads, customers, or actions..."
                  className="w-full bg-transparent border-none outline-none text-slate-800 dark:text-slate-200 text-xs font-semibold"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                />
                <button
                  onClick={() => setShowCommandPalette(false)}
                  className="p-1 rounded bg-slate-50 dark:bg-slate-800 text-[10px] text-slate-400 font-bold border border-slate-200 dark:border-slate-700"
                >
                  ESC
                </button>
              </div>

              <div className="space-y-4 max-h-80 overflow-y-auto">
                <div>
                  <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Navigation Shortcuts</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {navItems.map((n) => (
                      <button
                        key={n.name}
                        onClick={() => {
                          navigate(n.href);
                          setShowCommandPalette(false);
                        }}
                        className="flex items-center gap-2 p-2 rounded-xl border border-slate-105 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-left text-xs font-bold text-slate-705 dark:text-slate-300 transition-all cursor-pointer"
                      >
                        <n.icon className="w-4 h-4 text-indigo-550" />
                        <span>{n.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Common Operations</h3>
                  <div className="space-y-1.5">
                    {[
                      { name: "Create New CRM Lead", desc: "Open lead form drawer", icon: Sparkles },
                      { name: "Upload Excel Leads", desc: "Batch import data list", icon: FileText },
                      { name: "Run Agent Performance Report", desc: "Open analytics wizard", icon: BarChart3 },
                      { name: "Global System Settings", desc: "Configure workflows & integrations", icon: Settings },
                    ].map((act) => (
                      <button
                        key={act.name}
                        onClick={() => {
                          navigate("/settings");
                          setShowCommandPalette(false);
                        }}
                        className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/30 text-left transition-all cursor-pointer"
                      >
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/20 flex items-center justify-center">
                          <act.icon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div>
                          <div className="text-[11px] font-extrabold text-slate-800 dark:text-slate-200">{act.name}</div>
                          <div className="text-[9px] text-slate-404 font-bold mt-0.5">{act.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

            </motion.div>
          </>
        )}
      </AnimatePresence>

      <ConfirmationModal
        isOpen={showLogoutConfirmModal}
        onClose={() => setShowLogoutConfirmModal(false)}
        onConfirm={() => {
          setShowLogoutConfirmModal(false);
          logout();
        }}
        title="Confirm Logout"
        description="Are you sure you want to log out of Waqt Finance CRM?"
        confirmText="Logout"
        cancelText="Cancel"
        variant="danger"
        iconType="logout"
      />
    </div>
  );
}
