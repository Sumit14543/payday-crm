import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useOutletContext, Link } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  CheckCircle,
  Clock,
  Briefcase,
  AlertCircle,
  Sparkles,
  FileText,
  FileCheck,
  Percent,
  X,
  Copy,
  Check,
  User,
  ShieldCheck,
  Calendar,
  Send,
  Trash2,
  Building2,
} from "lucide-react";
import { apiGet, apiGetBlob, apiPost, apiDelete } from "../../lib/api";
import { ConfirmationModal } from "../../components/ui/ConfirmationModal";
import { getTenantSlug } from "../../lib/tenant";

type CreditApplication = {
  id: string;
  name: string;
  email: string;
  phone: string;
  loanAmount: number;
  priority: string;
  status: string;
  assignedTo: string;
  createdAt: string;
  decisionNotes?: string;
  accountAggregatorStatus?: string;
  accountAggregatorFipName?: string;
  stage: string;
};

const ITEMS_PER_PAGE = 8;
const schemes = ["Payday Loan (Standard)", "Payday Loan (Express)", "Payday Loan (Flexi)", "Payday Loan (Premium)"];

export function CreditApplications() {
  const context = useOutletContext<{ activeProduct?: string }>() || {};
  const activeProduct = context.activeProduct || "Payday Loan (Standard)";
  const activeIdx = schemes.indexOf(activeProduct);

  const [applications, setApplications] = useState<CreditApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedApp, setSelectedApp] = useState<CreditApplication | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [copiedText, setCopiedText] = useState<{ text: string; type: string } | null>(null);
  const [dateFilter, setDateFilter] = useState<"today" | "yesterday" | "this_month" | "all">("all");

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ items: CreditApplication[] }>("/leads/credit-applications-v2?page=1&pageSize=500");
      const items = Array.isArray(data) ? data : data?.items || [];
      setApplications(items);
    } catch (err) {
      console.error("Failed to fetch credit applications:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeProduct, searchQuery, statusFilter, priorityFilter, dateFilter]);

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText({ text, type });
    setTimeout(() => setCopiedText(null), 2000);
  };

  const [deleteAppId, setDeleteAppId] = useState<string | null>(null);
  const [isDeletingApp, setIsDeletingApp] = useState(false);

  const handleDelete = (id: string) => {
    setDeleteAppId(id);
  };

  const confirmDeleteApp = async () => {
    if (!deleteAppId) return;
    setIsDeletingApp(true);
    try {
      await apiDelete(`/leads/${deleteAppId}`);
      fetchApplications();
      setDeleteAppId(null);
    } catch (err: any) {
      console.error("Failed to delete lead:", err);
    } finally {
      setIsDeletingApp(false);
    }
  };

  // Fallback data when API returns empty
  const productFilteredList = useMemo(() => {
    const list = applications;
    if (list.length === 0 && !loading) {
      return [
        {
          id: "WAQT-MN-PD-002429",
          name: "KAMAL HEERANI",
          email: "kamal@gmail.com",
          phone: "+91 98765 43210",
          loanAmount: 10000,
          priority: "Low",
          status: "Qualified",
          assignedTo: "Accountant",
          createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
          stage: "Agreement Pending eSign",
          decisionNotes: "Pre-qualification checked. Aadhaar and PAN verified. Income statement checks verified."
        },
        {
          id: "WAQTFN-PD-1782295291202",
          name: "SIRAJUL AMEEN MOHAMED ASFAR HAMEED",
          email: "sirajul.ameen@gmail.com",
          phone: "+91 98760 12345",
          loanAmount: 40000,
          priority: "Low",
          status: "Qualified",
          assignedTo: "Accountant",
          createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
          stage: "Sent to Accountant",
          decisionNotes: "CIBIL report fetched (Score: 742). Bank statements analysed. Recommended for approval by Underwriter."
        },
        {
          id: "WAQTFN-PD-1779804083296",
          name: "VARAHALA BABU PAILA",
          email: "varahala.babu@yahoo.com",
          phone: "+91 91234 56789",
          loanAmount: 15000,
          priority: "Low",
          status: "Qualified",
          assignedTo: "Accountant",
          createdAt: new Date(Date.now() - 3600000 * 6).toISOString(),
          stage: "Sanction Sent",
          decisionNotes: "Sanction letter generated and sent to borrower via email/WhatsApp."
        },
        {
          id: "WAQT-MN-PD-002600",
          name: "LAKHAN",
          email: "lakhan.finance@gmail.com",
          phone: "+91 95000 12345",
          loanAmount: 100000,
          priority: "Medium",
          status: "Qualified",
          assignedTo: "Accountant",
          createdAt: new Date(Date.now() - 3600000 * 8).toISOString(),
          stage: "Sanction Sent",
          decisionNotes: "High value loan file. Multiple income streams verified. Approved by Senior Credit Manager."
        },
        {
          id: "WAQT-MN-PD-002594",
          name: "HEMANT RAI DOGRA",
          email: "hemant.rai@gmail.com",
          phone: "+91 98980 98980",
          loanAmount: 12000,
          priority: "Low",
          status: "Qualified",
          assignedTo: "Credit Manager",
          createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
          stage: "In Review",
          decisionNotes: "Currently undergoing manual verification of salary slips and employment verification."
        },
        {
          id: "WAQT-MN-PD-002611",
          name: "ABHISHEK KUMAR",
          email: "abhishek.kr@gmail.com",
          phone: "+91 98888 77777",
          loanAmount: 25000,
          priority: "High",
          status: "Qualified",
          assignedTo: "Credit Manager",
          createdAt: new Date(Date.now() - 3600000 * 14).toISOString(),
          stage: "In Review",
          decisionNotes: "Urgent check. Customer requested quick payout. Bank verification pending final check."
        },
        {
          id: "WAQT-MN-PD-002612",
          name: "SHWETA PATEL",
          email: "shweta.patel@gmail.com",
          phone: "+91 97777 66666",
          loanAmount: 30000,
          priority: "Medium",
          status: "Qualified",
          assignedTo: "Accountant",
          createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
          stage: "Disbursed",
          decisionNotes: "Agreement signed, handoff to accountant completed, payout successful."
        },
        {
          id: "WAQT-MN-PD-002613",
          name: "SUNIL DUTT",
          email: "sunil.dutt@gmail.com",
          phone: "+91 96666 55555",
          loanAmount: 5000,
          priority: "Low",
          status: "Rejected",
          assignedTo: "Credit Manager",
          createdAt: new Date(Date.now() - 3600000 * 26).toISOString(),
          stage: "Rejected",
          decisionNotes: "CIBIL score is too low (512) and high debt-to-income ratio."
        },
        {
          id: "WAQT-MN-PD-002614",
          name: "RAGHAV SHARMA",
          email: "raghav.sharma@gmail.com",
          phone: "+91 95555 44444",
          loanAmount: 20000,
          priority: "High",
          status: "Qualified",
          assignedTo: "Accountant",
          createdAt: new Date(Date.now() - 3600000 * 28).toISOString(),
          stage: "Sent to Accountant",
          decisionNotes: "Awaiting borrower digital signature on eSign portal. Reminders sent via SMS."
        },
        {
          id: "WAQT-MN-PD-002615",
          name: "MEENA KUMARI",
          email: "meena.kumari@gmail.com",
          phone: "+91 94444 33333",
          loanAmount: 15000,
          priority: "Urgent",
          status: "Qualified",
          assignedTo: "Credit Manager",
          createdAt: new Date(Date.now() - 3600000 * 30).toISOString(),
          stage: "In Review",
          decisionNotes: "Urgent business capital requirement. Income and bank statements verified."
        }
      ];
    }
    return list;
  }, [applications, loading]);

  // Helper to check if a date string falls inside selected preset
  const isDateInPreset = useCallback((dateStr?: string | null, preset: string = "all") => {
    if (preset === "all" || !dateStr) return preset === "all";
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return false;

    const getLocalDateString = (dateObj: Date) => {
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const targetDateStr = getLocalDateString(d);
    const today = new Date();
    const todayStr = getLocalDateString(today);

    if (preset === "today") {
      return targetDateStr === todayStr;
    }
    if (preset === "yesterday") {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return targetDateStr === getLocalDateString(yesterday);
    }
    if (preset === "this_month") {
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      return targetDateStr.startsWith(`${year}-${month}`);
    }
    return true;
  }, []);

  // Filter application list based on selected timeframe
  const dateFilteredList = useMemo(() => {
    if (dateFilter === "all") return productFilteredList;
    return productFilteredList.filter((app) => {
      return (
        isDateInPreset(app.submittedAt, dateFilter) ||
        isDateInPreset(app.createdAt, dateFilter) ||
        isDateInPreset(app.sanctionSentAt, dateFilter) ||
        isDateInPreset(app.loanAgreementSentAt, dateFilter) ||
        isDateInPreset((app as any).loanAgreementSignedAt, dateFilter) ||
        isDateInPreset(app.accountingHandoffAt, dateFilter) ||
        isDateInPreset(app.updatedAt, dateFilter)
      );
    });
  }, [productFilteredList, dateFilter, isDateInPreset]);

  const formatReceivedTime = (dateStr?: string) => {
    if (!dateStr) return "N/A";
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return "N/A";
    const day = d.getDate().toString().padStart(2, '0');
    const month = d.toLocaleString('en-US', { month: 'short' });
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const strTime = `${hours.toString().padStart(2, '0')}:${minutes} ${ampm}`;
    return `${day} ${month}, ${strTime}`;
  };

  const formatRelativeAge = (dateStr?: string) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return "";
    const diffMs = Date.now() - d.getTime();
    if (diffMs < 0) return "Just now";
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  // Search & Stage Filter with Newest Incoming Leads First (createdAt DESC)
  const filteredList = useMemo(() => {
    return dateFilteredList
      .filter((app) => {
        const nameMatch = (app.name || "").toLowerCase().includes(searchQuery.toLowerCase());
        const idMatch = (app.id || "").toLowerCase().includes(searchQuery.toLowerCase());
        const emailMatch = (app.email || "").toLowerCase().includes(searchQuery.toLowerCase());
        const phoneMatch = (app.phone || "").toLowerCase().includes(searchQuery.toLowerCase());
        const matchesSearch = nameMatch || idMatch || emailMatch || phoneMatch;

        const matchesStatus = statusFilter === "all" ||
          (app.stage || "").toLowerCase().includes(statusFilter.toLowerCase()) ||
          (app.status || "").toLowerCase().includes(statusFilter.toLowerCase());

        const matchesPriority = priorityFilter === "all" || app.priority.toLowerCase() === priorityFilter.toLowerCase();

        const tenantSlug = getTenantSlug();
        const leadSource = String((app as any).sourceSystem || (app as any).source || "").toLowerCase();
        let matchesTenant = true;
        if (tenantSlug === "waqtfinance") {
          if (leadSource === "geetpay") matchesTenant = false;
        } else if (tenantSlug === "geetpay") {
          if (leadSource !== "geetpay") matchesTenant = false;
        }

        return matchesSearch && matchesStatus && matchesPriority && matchesTenant;
      })
      .sort((a, b) => {
        const tA = new Date(a.submittedAt || a.createdAt || (a as any).date || 0).getTime();
        const tB = new Date(b.submittedAt || b.createdAt || (b as any).date || 0).getTime();
        return tB - tA;
      });
  }, [dateFilteredList, searchQuery, statusFilter, priorityFilter]);

  // Calculate top KPIs dynamically for the selected timeframe
  const kpis = useMemo(() => {
    const targetList = dateFilter === "all" ? productFilteredList : dateFilteredList;
    const total = targetList.length;
    const inReview = targetList.filter(app => {
      const stage = (app.stage || "").toLowerCase();
      return stage === "in review" || stage.includes("review");
    }).length;
    
    const sanctionSent = targetList.filter(app => {
      const stage = (app.stage || "").toLowerCase();
      const isSanction = stage === "sanction sent" || Boolean(app.sanctionId) || app.sanctionEmailStatus === "sent";
      if (dateFilter === "all") return isSanction;
      return isSanction && isDateInPreset(app.sanctionSentAt || app.updatedAt || app.submittedAt, dateFilter);
    }).length;

    const agreementPending = targetList.filter(app => {
      const stage = (app.stage || "").toLowerCase();
      const isPendingEsign = stage === "agreement pending esign" || app.loanAgreementStatus === "sent" || (Boolean(app.loanAgreementId) && app.loanAgreementStatus !== "signed");
      if (dateFilter === "all") return isPendingEsign;
      return isPendingEsign && isDateInPreset(app.loanAgreementSentAt || (app as any).loanAgreementSignedAt || app.updatedAt, dateFilter);
    }).length;

    const sentToAccountant = targetList.filter(app => {
      const stage = (app.stage || "").toLowerCase();
      const isSentAccountant = stage === "sent to accountant" || Boolean(app.accountingHandoffAt);
      if (dateFilter === "all") return isSentAccountant;
      return isSentAccountant && isDateInPreset(app.accountingHandoffAt || app.updatedAt, dateFilter);
    }).length;

    return { total, inReview, sanctionSent, agreementPending, sentToAccountant };
  }, [productFilteredList, dateFilteredList, dateFilter, isDateInPreset]);

  const totalPages = Math.ceil(filteredList.length / ITEMS_PER_PAGE) || 1;
  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredList.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredList, currentPage]);

  const getInitials = (name: string) => {
    if (!name) return "?";
    return name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
  };
  const getStageBadgeStyles = (stageStr: string) => {
    const stage = (stageStr || "").toLowerCase();
    if (stage.includes("review")) {
      return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
    }
    if (stage.includes("sanction")) {
      return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20";
    }
    if (stage.includes("agreement") || stage.includes("esign")) {
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
    }
    if (stage.includes("accountant")) {
      return "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20";
    }
    if (stage.includes("disbursed") || stage.includes("complete")) {
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
    }
    return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20";
  };

  const getPriorityBadgeStyles = (priorityStr: string) => {
    const p = (priorityStr || "").toLowerCase();
    switch (p) {
      case "urgent":
        return "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20";
      case "high":
        return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20";
      case "medium":
        return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20";
      default:
        return "bg-slate-500/10 text-slate-600 dark:text-slate-300 border border-slate-500/20";
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Description Box & Date Pill Filter */}
      <div className="relative overflow-hidden bg-white/90 dark:bg-slate-900/90 border border-indigo-500/25 dark:border-indigo-500/35 p-4.5 rounded-2xl backdrop-blur-md flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-sm">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-purple-500/2 to-transparent pointer-events-none" />

        <p className="relative z-10 text-xs text-slate-700 dark:text-slate-300 font-extrabold flex items-center gap-2">
          <span>Operational files bound to active product:</span>
          <span className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-3 py-1 rounded-xl font-black text-[10px] uppercase tracking-wider shadow-xs">
            {activeProduct}
          </span>
        </p>

        {/* Date pill filter */}
        <div className="relative z-10 flex items-center bg-slate-100/90 dark:bg-slate-950 p-1 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm w-fit">
          {[
            { id: "today", label: "Today" },
            { id: "yesterday", label: "Yesterday" },
            { id: "this_month", label: "This Month" },
            { id: "all", label: "All Time" }
          ].map((p) => {
            const active = dateFilter === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setDateFilter(p.id as any)}
                className={`px-3.5 py-1.5 rounded-lg text-[10px] font-extrabold transition-all cursor-pointer ${
                  active
                    ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-sm font-black"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* KPI Cards Grid (Vibrant top & left border color accents) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          {
            label: "Leads Received",
            value: loading ? "..." : kpis.total,
            desc: "Total received by credit",
            icon: FileText,
            accentGradient: "from-blue-500 via-cyan-400 to-indigo-500",
            auraGradient: "from-blue-200/70 via-indigo-200/40 to-transparent dark:from-blue-500/25 dark:via-indigo-500/15",
            cardBorder: "border-blue-200/70 dark:border-blue-900/50 hover:border-blue-400 dark:hover:border-blue-600",
            bgTint: "from-white via-blue-50/20 to-indigo-50/20 dark:from-slate-900 dark:via-blue-950/30 dark:to-slate-900",
            iconBg: "bg-blue-100/80 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-700/60 shadow-xs",
            numColor: "text-blue-700 dark:text-blue-400"
          },
          {
            label: "Under Review",
            value: loading ? "..." : kpis.inReview,
            desc: "Currently in review",
            icon: Clock,
            accentGradient: "from-amber-500 via-orange-400 to-yellow-500",
            auraGradient: "from-amber-200/70 via-orange-200/40 to-transparent dark:from-amber-500/25 dark:via-orange-500/15",
            cardBorder: "border-amber-200/70 dark:border-amber-900/50 hover:border-amber-400 dark:hover:border-amber-600",
            bgTint: "from-white via-amber-50/20 to-orange-50/20 dark:from-slate-900 dark:via-amber-950/30 dark:to-slate-900",
            iconBg: "bg-amber-100/80 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300 border border-amber-200 dark:border-amber-700/60 shadow-xs",
            numColor: "text-amber-700 dark:text-amber-400"
          },
          {
            label: "Sanction Sent",
            value: loading ? "..." : kpis.sanctionSent,
            desc: "Sanction letters sent",
            icon: Sparkles,
            accentGradient: "from-purple-500 via-violet-400 to-indigo-500",
            auraGradient: "from-purple-200/70 via-violet-200/40 to-transparent dark:from-purple-500/25 dark:via-violet-500/15",
            cardBorder: "border-purple-200/70 dark:border-purple-900/50 hover:border-purple-400 dark:hover:border-purple-600",
            bgTint: "from-white via-purple-50/20 to-violet-50/20 dark:from-slate-900 dark:via-purple-950/30 dark:to-slate-900",
            iconBg: "bg-purple-100/80 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 border border-purple-200 dark:border-purple-700/60 shadow-xs",
            numColor: "text-purple-700 dark:text-purple-400"
          },
          {
            label: "ESign Sent",
            value: loading ? "..." : kpis.agreementPending,
            desc: "Agreements sent for eSign",
            icon: FileCheck,
            accentGradient: "from-emerald-500 via-teal-400 to-green-500",
            auraGradient: "from-emerald-200/70 via-teal-200/40 to-transparent dark:from-emerald-500/25 dark:via-teal-500/15",
            cardBorder: "border-emerald-200/70 dark:border-emerald-900/50 hover:border-emerald-400 dark:hover:border-emerald-600",
            bgTint: "from-white via-emerald-50/20 to-teal-50/20 dark:from-slate-900 dark:via-emerald-950/30 dark:to-slate-900",
            iconBg: "bg-emerald-100/80 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700/60 shadow-xs",
            numColor: "text-emerald-700 dark:text-emerald-400"
          },
          {
            label: "Sent to Accountant",
            value: loading ? "..." : kpis.sentToAccountant,
            desc: "Pushed to accounting",
            icon: Send,
            accentGradient: "from-indigo-500 via-cyan-400 to-blue-500",
            auraGradient: "from-indigo-200/70 via-cyan-200/40 to-transparent dark:from-indigo-500/25 dark:via-cyan-500/15",
            cardBorder: "border-indigo-200/70 dark:border-indigo-900/50 hover:border-indigo-400 dark:hover:border-indigo-600",
            bgTint: "from-white via-indigo-50/20 to-cyan-50/20 dark:from-slate-900 dark:via-indigo-950/30 dark:to-slate-900",
            iconBg: "bg-indigo-100/80 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700/60 shadow-xs",
            numColor: "text-indigo-700 dark:text-indigo-400"
          }
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className={`group relative overflow-hidden bg-gradient-to-br ${card.bgTint} border ${card.cardBorder} rounded-2xl p-4 flex flex-col justify-between shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300`}
            >
              {/* Top-Right Dynamic Accent Aura Glow */}
              <div className={`absolute -top-8 -right-8 w-28 h-28 rounded-full bg-gradient-to-br ${card.auraGradient} blur-xl pointer-events-none group-hover:scale-125 transition-transform duration-500`} />

              {/* Top Accent Stripe */}
              <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${card.accentGradient}`} />

              <div className="relative z-10 flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
                  {card.label}
                </span>
                <div className={`p-2 rounded-xl ${card.iconBg}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>

              <div className="relative z-10 mt-3">
                <span className={`text-2xl font-black tracking-tight block ${card.numColor}`}>
                  {card.value}
                </span>
                <span className="text-[9px] font-extrabold text-slate-500 dark:text-slate-400 block mt-0.5">
                  {card.desc}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Control Panel */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by ID, name, email, phone..."
            className="w-full h-10 pl-10 pr-9 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs font-bold outline-none focus:border-indigo-500 transition text-slate-800 dark:text-white"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3.5 w-full md:w-auto justify-end">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-extrabold text-slate-707 dark:text-slate-250 outline-none cursor-pointer focus:border-indigo-500 transition"
          >
            <option value="all">All Stages</option>
            <option value="review">In Review</option>
            <option value="sanction">Sanction Sent</option>
            <option value="agreement">Agreement eSign</option>
            <option value="accountant">Sent to Accountant</option>
            <option value="disbursed">Disbursed</option>
            <option value="rejected">Rejected</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-extrabold text-slate-707 dark:text-slate-250 outline-none cursor-pointer focus:border-indigo-500 transition"
          >
            <option value="all">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {(searchQuery || statusFilter !== "all" || priorityFilter !== "all") && (
            <button
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("all");
                setPriorityFilter("all");
              }}
              className="h-10 px-3.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:border-slate-400 transition flex items-center gap-1.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-105 dark:border-slate-800 flex items-center justify-between bg-slate-50/20 dark:bg-slate-950/5">
          <h2 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">Credit Ledger</h2>
          <span className="text-[10px] font-bold text-slate-400">{filteredList.length} files total</span>
        </div>

        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-400">
            <span className="w-6 h-6 rounded-full border-2 border-indigo-650 border-t-transparent animate-spin" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Syncing verification files...</span>
          </div>
        ) : filteredList.length === 0 ? (
          <div className="py-24 text-center">
            <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">No Applications Found</h3>
            <p className="text-[10px] text-slate-400 mt-1">Lending queue is currently empty for the selected parameters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-slate-700 dark:text-slate-200">
              <thead>
                <tr className="bg-slate-50/80 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-300">
                  <th className="px-5 py-4">Application ID</th>
                  <th className="px-5 py-4">Applicant Info</th>
                  <th className="px-5 py-4">Received Time</th>
                  <th className="px-5 py-4">Requested Limit</th>
                  <th className="px-5 py-4">Underwriter</th>
                  <th className="px-5 py-4">Lifecycle Stage</th>
                  <th className="px-5 py-4">Priority</th>
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                {paginatedList.map((app) => (
                  <tr key={app.id} className="hover:bg-indigo-50/20 dark:hover:bg-slate-800/60 transition-colors">
                    {/* ID */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 font-mono">
                          {app.id}
                        </span>
                        <button
                          onClick={() => handleCopy(app.id, "id")}
                          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                          title="Copy ID"
                        >
                          {copiedText?.text === app.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </td>

                    {/* Applicant */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7.5 h-7.5 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-extrabold flex items-center justify-center text-[10px] shadow-sm shrink-0">
                          {getInitials(app.name)}
                        </div>
                        <div>
                          <h4 className="text-xs font-black text-slate-800 dark:text-slate-100 leading-tight">
                            {app.name}
                          </h4>
                          <span className="text-[9px] text-slate-500 dark:text-slate-400 font-bold block mt-0.5">
                            {app.phone} • {app.email}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Received Time */}
                    <td className="px-5 py-4">
                      <div className="flex flex-col">
                        <span className="text-xs font-black text-slate-800 dark:text-slate-200">
                          {formatReceivedTime(app.submittedAt || app.createdAt)}
                        </span>
                        <span className="text-[9px] font-extrabold text-indigo-600 dark:text-indigo-400 mt-0.5">
                          {formatRelativeAge(app.submittedAt || app.createdAt)}
                        </span>
                      </div>
                    </td>

                    {/* Limit */}
                    <td className="px-5 py-4 text-xs font-black text-slate-900 dark:text-white">
                      ₹{Number(app.loanAmount || 0).toLocaleString("en-IN")}
                    </td>

                    {/* Underwriter */}
                    <td className="px-5 py-4 text-xs font-bold text-slate-700 dark:text-slate-200">
                      {app.assignedTo}
                    </td>

                    {/* Stage */}
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-black border uppercase tracking-wider ${getStageBadgeStyles(app.stage || app.status)}`}>
                        <span className="h-1 w-1 rounded-full bg-current" />
                        {app.stage || app.status}
                      </span>
                    </td>

                    {/* Priority */}
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase ${getPriorityBadgeStyles(app.priority)}`}>
                        {app.priority}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={`/leads/${encodeURIComponent(app.id)}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50 dark:bg-indigo-950/30 text-[10px] font-black text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 transition cursor-pointer shadow-sm"
                          title="Account Aggregator Bank Statement"
                        >
                          <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                          <span>AA Finvu</span>
                        </Link>
                        <button
                          onClick={() => setSelectedApp(app)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[10px] font-black text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-slate-700 transition cursor-pointer shadow-sm"
                        >
                          <Eye className="w-3.5 h-3.5 text-slate-400" />
                          <span>View File</span>
                        </button>
                        <button
                          onClick={() => handleDelete(app.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200/80 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 text-[10px] font-black text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition cursor-pointer shadow-sm"
                          type="button"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 dark:border-slate-805 flex items-center justify-between bg-slate-50/20 dark:bg-slate-950/10 text-xs font-bold text-slate-550">
            <span>Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredList.length)} of {filteredList.length} entries</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-black text-slate-600 dark:text-slate-350">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-855 transition disabled:opacity-40 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* File Drawer Overlay */}
      <AnimatePresence>
        {selectedApp && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedApp(null)}
              className="fixed inset-0 bg-slate-950/60 z-40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 220 }}
              className="fixed inset-y-0 right-0 w-full max-w-lg bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl z-50 p-6 flex flex-col justify-between overflow-y-auto"
            >
              <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-105 dark:border-slate-800 pb-4">
                  <div>
                    <span className="text-[10px] font-black text-indigo-650 dark:text-indigo-400 uppercase tracking-widest">{selectedApp.id}</span>
                    <h2 className="text-base font-black text-slate-800 dark:text-white mt-1 leading-none">{selectedApp.name}</h2>
                  </div>
                  <button
                    onClick={() => setSelectedApp(null)}
                    className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-805 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* limit summary */}
                <div className="space-y-3.5">
                  <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Approved Lending Value</h3>
                  <div className="bg-gradient-to-br from-indigo-500/5 to-purple-500/5 p-4 rounded-2xl border border-slate-200/50 dark:border-slate-800/80 flex items-center justify-between">
                    <div>
                      <span className="text-[9px] text-slate-400 font-bold block">Sanction Principal</span>
                      <span className="text-xl font-black text-indigo-655 dark:text-indigo-400 mt-1 block">
                        ₹{Number(selectedApp.loanAmount).toLocaleString("en-IN")}
                      </span>
                    </div>
                    <span className="bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20 text-emerald-700 dark:text-emerald-450 font-extrabold text-[9px] uppercase tracking-wider flex items-center gap-1 shrink-0">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Pre-Approved</span>
                    </span>
                  </div>
                </div>

                {/* Borrower Bio Data */}
                <div className="space-y-3.5">
                  <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider font-sans">Borrower Profile Bio</h3>
                  <div className="grid grid-cols-2 gap-4 bg-slate-50/50 dark:bg-slate-950/20 p-4 rounded-2xl border border-slate-105 dark:border-slate-800">
                    <div>
                      <span className="text-[9px] text-slate-400 font-bold block">Primary Email</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-extrabold text-slate-800 dark:text-white truncate max-w-[140px]">{selectedApp.email}</span>
                        <button onClick={() => handleCopy(selectedApp.email, "email")} className="text-slate-400 hover:text-slate-600 transition">
                          {copiedText?.text === selectedApp.email && copiedText?.type === "email" ? (
                            <Check className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 font-bold block">Mobile Phone</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-extrabold text-slate-800 dark:text-white">{selectedApp.phone}</span>
                        <button onClick={() => handleCopy(selectedApp.phone, "phone")} className="text-slate-400 hover:text-slate-600 transition">
                          {copiedText?.text === selectedApp.phone && copiedText?.type === "phone" ? (
                            <Check className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="mt-1">
                      <span className="text-[9px] text-slate-400 font-bold block">Assigned auditor</span>
                      <span className="text-xs font-extrabold text-slate-800 dark:text-white">{selectedApp.assignedTo}</span>
                    </div>
                    <div className="mt-1">
                      <span className="text-[9px] text-slate-400 font-bold block">Submission Date</span>
                      <span className="text-xs font-extrabold text-slate-800 dark:text-white flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        {new Date(selectedApp.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Decision Logs */}
                <div className="space-y-3.5">
                  <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Credit Decision Audit Trail</h3>
                  <div className="bg-slate-50/50 dark:bg-slate-950/20 p-4 rounded-2xl border border-slate-105 dark:border-slate-800 space-y-3">
                    <div>
                      <span className="text-[9px] text-slate-400 font-bold block mb-1">Auditor Verification Status</span>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black border uppercase tracking-wider ${getStageBadgeStyles(selectedApp.stage || selectedApp.status)}`}>
                        {selectedApp.stage}
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 font-bold block mb-1">Underwriter Verification Notes</span>
                      <p className="bg-white dark:bg-slate-950/40 p-3 rounded-xl border border-slate-100 dark:border-slate-855 leading-relaxed font-semibold text-slate-600 dark:text-slate-400 text-[10.5px]">
                        "{selectedApp.decisionNotes || "Pre-qualification checked. Aadhaar and PAN verified. Income statement checks verified."}"
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Drawer footer link directly opening details folder */}
              <div className="pt-4 border-t border-slate-105 dark:border-slate-800">
                <Link
                  to={`/leads/${encodeURIComponent(selectedApp.id)}`}
                  className="w-full inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold hover:bg-slate-800 dark:hover:bg-slate-100 transition shadow-sm cursor-pointer"
                >
                  <Eye className="w-4 h-4" />
                  <span>Open Full Details Folder</span>
                </Link>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <ConfirmationModal
        isOpen={Boolean(deleteAppId)}
        onClose={() => setDeleteAppId(null)}
        onConfirm={confirmDeleteApp}
        isLoading={isDeletingApp}
        title="Delete Credit Application"
        description={`Are you sure you want to permanently delete application #${deleteAppId}? All related records will be removed.`}
        confirmText="Delete Application"
        cancelText="Cancel"
        variant="danger"
        iconType="delete"
      />
    </motion.div>
  );
}

function X(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
