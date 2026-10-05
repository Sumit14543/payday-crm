import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import {
  Eye,
  AlertCircle,
  Search,
  UserPlus,
  PhoneCall,
  FileClock,
  Activity,
  CheckCircle2,
  CircleDollarSign,
  Archive,
  User,
  MapPin
} from "lucide-react";
import { apiGet, apiPatch } from "../../lib/api";
import { getTenantSlug } from "../../lib/tenant";

type ColumnKey = "New Lead" | "Contacted" | "Documents Pending" | "Bank Verification" | "Approved" | "Disbursed" | "Closed";

const columnsList: ColumnKey[] = [
  "New Lead",
  "Contacted",
  "Documents Pending",
  "Bank Verification",
  "Approved",
  "Disbursed",
  "Closed"
];

// Column header styling and icons helper
const columnMeta: Record<ColumnKey, { headerClass: string; icon: any; iconColor: string; bgBadge: string }> = {
  "New Lead": {
    headerClass: "border-t-4 border-t-blue-500 bg-blue-50/10 dark:bg-blue-955/5",
    icon: UserPlus,
    iconColor: "text-blue-500",
    bgBadge: "bg-blue-50 dark:bg-blue-955/35 text-blue-600 dark:text-blue-400"
  },
  "Contacted": {
    headerClass: "border-t-4 border-t-indigo-500 bg-indigo-50/10 dark:bg-indigo-955/5",
    icon: PhoneCall,
    iconColor: "text-indigo-500",
    bgBadge: "bg-indigo-50 dark:bg-indigo-955/35 text-indigo-600 dark:text-indigo-400"
  },
  "Documents Pending": {
    headerClass: "border-t-4 border-t-amber-500 bg-amber-50/10 dark:bg-amber-955/5",
    icon: FileClock,
    iconColor: "text-amber-500",
    bgBadge: "bg-amber-50 dark:bg-amber-955/35 text-amber-600 dark:text-amber-400"
  },
  "Bank Verification": {
    headerClass: "border-t-4 border-t-violet-500 bg-violet-50/10 dark:bg-violet-955/5",
    icon: Activity,
    iconColor: "text-violet-500",
    bgBadge: "bg-violet-50 dark:bg-violet-955/35 text-violet-600 dark:text-violet-400"
  },
  "Approved": {
    headerClass: "border-t-4 border-t-emerald-500 bg-emerald-50/10 dark:bg-emerald-955/5",
    icon: CheckCircle2,
    iconColor: "text-emerald-500",
    bgBadge: "bg-emerald-50 dark:bg-emerald-955/35 text-emerald-600 dark:text-emerald-400"
  },
  "Disbursed": {
    headerClass: "border-t-4 border-t-teal-500 bg-teal-50/10 dark:bg-teal-955/5",
    icon: CircleDollarSign,
    iconColor: "text-teal-500",
    bgBadge: "bg-teal-50 dark:bg-teal-955/35 text-teal-600 dark:text-teal-400"
  },
  "Closed": {
    headerClass: "border-t-4 border-t-slate-500 bg-slate-50/10 dark:bg-slate-950/5",
    icon: Archive,
    iconColor: "text-slate-500",
    bgBadge: "bg-slate-50 dark:bg-slate-950/35 text-slate-600 dark:text-slate-400"
  }
};

// Status Mapping
const mapStatusToColumn = (status: string): ColumnKey => {
  const norm = String(status || "").trim().toLowerCase();
  if (norm === "new" || norm === "new lead" || norm === "draft") return "New Lead";
  if (norm === "contacted" || norm === "submitted") return "Contacted";
  if (norm === "documents pending" || norm === "documents_pending" || norm === "document collection" || norm === "review") return "Documents Pending";
  if (norm === "bank verification" || norm === "verification" || norm === "send to credit manager" || norm === "send_to_credit") return "Bank Verification";
  if (norm === "approved" || norm === "qualified") return "Approved";
  if (norm === "disbursed" || norm === "converted") return "Disbursed";
  if (norm === "closed") return "Closed";
  return "New Lead";
};

const statusPayloadMap: Record<ColumnKey, string> = {
  "New Lead": "New",
  "Contacted": "Contacted",
  "Documents Pending": "Documents Pending",
  "Bank Verification": "Send to Credit Manager",
  "Approved": "Qualified",
  "Disbursed": "Converted",
  "Closed": "Closed"
};

const formatLeadAge = (dateStr: string) => {
  if (!dateStr) return "N/A";
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMins = Math.round(diffMs / (1000 * 60));
  if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  if (diffHours < 24) return `${diffHours} hr${diffHours !== 1 ? 's' : ''} ago`;
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
};

export function Pipeline() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggedCard, setDraggedCard] = useState<{ id: string; sourceCol: ColumnKey } | null>(null);
  const [draggedOverCol, setDraggedOverCol] = useState<ColumnKey | null>(null);

  // Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [telecallerFilter, setTelecallerFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<"today" | "yesterday" | "this_month" | "all">("all");

  const fetchLeads = () => {
    setLoading(true);
    apiGet<any[]>("/leads?pageSize=5000&limit=5000")
      .then((data) => {
        if (Array.isArray(data)) {
          setLeads(data);
        }
      })
      .catch((err) => console.error("Failed to load leads for pipeline:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  // Extract unique telecallers for the filter
  const uniqueTelecallers = useMemo(() => {
    const callers = new Set<string>();
    leads.forEach((l) => {
      if (l.assignedTo && l.assignedTo !== "Unassigned") {
        callers.add(l.assignedTo);
      }
    });
    return Array.from(callers).sort();
  }, [leads]);

  const getLocalDateString = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // 1. Dynamic filtering of raw leads
  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const idStr = String(l.id || "").toLowerCase();
        const rawIdStr = String(l.rawId || "").toLowerCase();
        const nameStr = String(l.name || "").toLowerCase();
        const emailStr = String(l.email || "").toLowerCase();
        const phoneStr = String(l.phone || "").toLowerCase();
        const cityStr = String(l.city || "").toLowerCase();
        const pinStr = String(l.pincode || "").toLowerCase();
        
        const match = idStr.includes(query) || rawIdStr.includes(query) || nameStr.includes(query) || emailStr.includes(query) || phoneStr.includes(query) || cityStr.includes(query) || pinStr.includes(query);
        if (!match) return false;
      }

      // 2. Priority Filter
      if (priorityFilter !== "all") {
        if (String(l.priority || "").toLowerCase() !== priorityFilter.toLowerCase()) {
          return false;
        }
      }

      // 3. Telecaller Filter
      if (telecallerFilter !== "all") {
        if (l.assignedTo !== telecallerFilter) {
          return false;
        }
      }

      // 4. Date Pill Filter
      if (dateFilter !== "all") {
        const colKey = mapStatusToColumn(l.status);
        let refDateStr = l.createdAt;
        if (colKey === "Closed") {
          refDateStr = l.closedDate || l.updatedAt || l.createdAt;
        } else if (colKey === "Disbursed") {
          refDateStr = l.disbursementDate || l.createdAt;
        } else if (colKey === "New Lead" || colKey === "Contacted") {
          refDateStr = l.createdAt;
        } else {
          refDateStr = l.updatedAt || l.createdAt;
        }
        
        if (!refDateStr) return false;
        const d = new Date(refDateStr);
        if (Number.isNaN(d.getTime())) return false;
        
        const leadDateStr = getLocalDateString(d);
        const todayStr = getLocalDateString(new Date());
        
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = getLocalDateString(yesterday);

        if (dateFilter === "today" && leadDateStr !== todayStr) return false;
        if (dateFilter === "yesterday" && leadDateStr !== yesterdayStr) return false;
        if (dateFilter === "this_month") {
          const now = new Date();
          const year = now.getFullYear();
          const month = String(now.getMonth() + 1).padStart(2, '0');
          if (!leadDateStr.startsWith(`${year}-${month}`)) return false;
        }
      }

      // 5. Tenant Isolation Filter
      const tenantSlug = getTenantSlug();
      const leadSource = String(l.sourceSystem || l.source || "").toLowerCase();
      if (tenantSlug === "waqtfinance") {
        if (leadSource === "geetpay") return false;
      } else if (tenantSlug === "geetpay") {
        if (leadSource !== "geetpay") return false;
      }

      return true;
    });
  }, [leads, searchQuery, priorityFilter, telecallerFilter, dateFilter]);

  // 2. Map filtered leads into columns list
  const columnsData = useMemo(() => {
    const cols: Record<ColumnKey, any[]> = {
      "New Lead": [],
      "Contacted": [],
      "Documents Pending": [],
      "Bank Verification": [],
      "Approved": [],
      "Disbursed": [],
      "Closed": []
    };

    filteredLeads.forEach((l) => {
      const colKey = mapStatusToColumn(l.status);
      let refDate = l.createdAt;
      if (colKey === "Closed") {
        refDate = l.closedDate || l.updatedAt || l.createdAt;
      } else if (colKey === "Disbursed") {
        refDate = l.disbursementDate || l.createdAt;
      } else if (colKey === "New Lead" || colKey === "Contacted") {
        refDate = l.createdAt;
      } else {
        refDate = l.updatedAt || l.createdAt;
      }
      let finalAmount = l.loanAmount || 0;
      if (colKey === "Approved") {
        finalAmount = l.approvedAmount || l.loanAmount || 0;
      } else if (colKey === "Disbursed" || colKey === "Closed") {
        finalAmount = l.disbursedAmount || l.loanAmount || 0;
      }

      let amountLabel = "Loan Amount";
      if (colKey === "Approved") {
        amountLabel = "Approved Amount";
      } else if (colKey === "Disbursed" || colKey === "Closed") {
        amountLabel = "Disbursed Amount";
      }

      let cardCollected = 0;
      if (dateFilter === "today") {
        cardCollected = l.todayCollected || 0;
      } else if (dateFilter === "yesterday") {
        cardCollected = l.yesterdayCollected || 0;
      } else if (dateFilter === "this_month") {
        cardCollected = l.thisMonthCollected || 0;
      } else {
        cardCollected = l.totalCollected || 0;
      }

      const rawCibil = l.cibilScore || l.cibil_score || l.cibil || l.creditScore || l.credit_score;

      cols[colKey].push({
        id: l.id,
        rawId: l.rawId,
        name: l.name || "Applicant",
        amount: finalAmount ? `₹${Number(finalAmount).toLocaleString("en-IN")}` : "₹0",
        amountNum: Number(finalAmount || 0),
        collectedNum: Number(cardCollected || 0),
        amountLabel,
        cibil: rawCibil && Number(rawCibil) > 0 ? Number(rawCibil) : "N/A",
        age: formatLeadAge(refDate),
        priority: l.priority || "Medium",
        source: l.source || "WaqtMoney",
        assignedTo: l.assignedTo || "Unassigned",
        city: l.city || "",
        pincode: l.pincode || ""
      });
    });

    return cols;
  }, [filteredLeads, dateFilter]);

  // 3. Compute dynamic total stage values for all columns
  const columnSums = useMemo(() => {
    const sums: Record<ColumnKey, number> = {
      "New Lead": 0,
      "Contacted": 0,
      "Documents Pending": 0,
      "Bank Verification": 0,
      "Approved": 0,
      "Disbursed": 0,
      "Closed": 0
    };
    columnsList.forEach((col) => {
      const cards = columnsData[col] || [];
      sums[col] = cards.reduce((sum, card) => sum + (card.amountNum || 0), 0);
    });
    return sums;
  }, [columnsData]);

  const formatColumnSum = (value: number) => {
    return `₹${value.toLocaleString("en-IN")}`;
  };

  const handleDragStart = (id: string, sourceCol: ColumnKey) => {
    setDraggedCard({ id, sourceCol });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (targetCol: ColumnKey) => {
    setDraggedOverCol(null);
    if (!draggedCard) return;
    const { id, sourceCol } = draggedCard;
    if (sourceCol === targetCol) return;

    const nextStatus = statusPayloadMap[targetCol];
    apiPatch(`/leads/${id}/status`, { status: nextStatus })
      .then(() => {
        fetchLeads();
      })
      .catch((err) => {
        console.error("Failed to update lead status on drop:", err);
        fetchLeads();
      });

    setDraggedCard(null);
  };

  const getPriorityBadgeStyles = (priorityStr: string) => {
    const p = (priorityStr || "").toLowerCase();
    switch (p) {
      case "urgent":
        return "bg-rose-500/10 text-rose-700 dark:text-rose-455 border border-rose-500/20";
      case "high":
        return "bg-amber-500/10 text-amber-700 dark:text-amber-455 border border-amber-500/20";
      case "medium":
        return "bg-blue-500/10 text-blue-700 dark:text-blue-455 border border-blue-500/20";
      default:
        return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-transparent";
    }
  };

  const getCibilBadgeStyles = (cibilVal: any) => {
    if (cibilVal === "N/A" || !cibilVal) {
      return "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200/40 dark:border-slate-800";
    }
    const score = Number(cibilVal);
    if (score >= 700) {
      return "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-650 dark:text-emerald-400 border border-emerald-500/20";
    }
    if (score >= 600) {
      return "bg-amber-50 dark:bg-amber-950/20 text-amber-650 dark:text-amber-400 border border-amber-500/20";
    }
    return "bg-rose-50 dark:bg-rose-950/20 text-rose-650 dark:text-rose-400 border border-rose-500/20";
  };

  const renderSkeleton = () => {
    return (
      <div className="flex-1 flex gap-4 overflow-x-auto pb-6 items-start select-none scrollbar-thin">
        {["New Lead", "Contacted", "Documents Pending", "Bank Verification", "Approved"].map((colName, index) => {
          return (
            <div
              key={index}
              className="w-[320px] bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-805/70 rounded-2xl flex flex-col shrink-0 overflow-hidden shadow-sm animate-pulse"
            >
              {/* Header Skeleton */}
              <div className="px-4 py-3.5 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between bg-slate-50/40 dark:bg-slate-950/10">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-slate-200 dark:bg-slate-800 rounded-md" />
                  <div className="w-24 h-3.5 bg-slate-200 dark:bg-slate-800 rounded-md" />
                </div>
                <div className="w-8 h-4 bg-slate-200 dark:bg-slate-800 rounded-full" />
              </div>

              {/* Sub-header Skeleton */}
              <div className="px-4 py-2 bg-slate-50/20 dark:bg-slate-950/5 border-b border-slate-100/50 dark:border-slate-800/40 flex items-center justify-between">
                <div className="w-16 h-2.5 bg-slate-150 dark:bg-slate-800/60 rounded" />
                <div className="w-16 h-2.5 bg-slate-150 dark:bg-slate-800/60 rounded" />
              </div>

              {/* Cards Skeleton Queue */}
              <div className="p-3.5 space-y-3.5 bg-slate-50/20 dark:bg-slate-950/5 min-h-[350px]">
                {[1, 2].map((cardIdx) => (
                  <div
                    key={cardIdx}
                    className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 flex flex-col gap-3"
                  >
                    {/* Top row */}
                    <div className="flex items-center justify-between">
                      <div className="w-24 h-2.5 bg-slate-200 dark:bg-slate-800 rounded" />
                      <div className="w-16 h-2.5 bg-slate-150 dark:bg-slate-800/60 rounded" />
                    </div>
                    {/* Title */}
                    <div className="w-36 h-4 bg-slate-200 dark:bg-slate-800 rounded mt-1" />
                    <div className="w-20 h-2 bg-slate-150 dark:bg-slate-800/60 rounded" />
                    {/* Bottom row */}
                    <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 dark:border-slate-800/60 mt-1">
                      <div className="w-24 h-5 bg-slate-150 dark:bg-slate-800/60 rounded-xl" />
                      <div className="w-16 h-5 bg-slate-150 dark:bg-slate-800/60 rounded-xl" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 flex flex-col h-[calc(100vh-140px)]"
    >
      {/* Page Title */}
      <div className="border-b border-slate-200/80 dark:border-slate-800/80 pb-4.5">
        <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">Kanban Pipeline</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-bold mt-1">
          Drag and drop lead cards to route them through different validation gates.
        </p>
      </div>

      {/* Quick Filters bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 p-4 rounded-2xl shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by ID, name, city, phone or pincode..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200/80 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-950/20 text-xs text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-bold"
          />
        </div>

        {/* Action Selects */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Priority filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3.5 py-2.5 border border-slate-200/80 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-950/20 text-xs text-slate-600 dark:text-slate-300 font-extrabold focus:outline-none cursor-pointer"
          >
            <option value="all">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {/* Telecaller filter */}
          <select
            value={telecallerFilter}
            onChange={(e) => setTelecallerFilter(e.target.value)}
            className="px-3.5 py-2.5 border border-slate-200/80 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-950/20 text-xs text-slate-600 dark:text-slate-300 font-extrabold focus:outline-none cursor-pointer"
          >
            <option value="all">All Telecallers</option>
            {uniqueTelecallers.map((tc) => (
              <option key={tc} value={tc}>
                {tc}
              </option>
            ))}
          </select>

          {/* Date quick filters pills */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200/60 dark:border-slate-800 shadow-inner">
            {[
              { id: "all", label: "All Time" },
              { id: "today", label: "Today" },
              { id: "yesterday", label: "Yesterday" },
              { id: "this_month", label: "This Month" }
            ].map((p) => {
              const active = dateFilter === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setDateFilter(p.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                    active
                      ? "bg-white dark:bg-slate-900 text-indigo-650 dark:text-indigo-400 shadow-sm"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {loading ? (
        renderSkeleton()
      ) : (
        /* Kanban Board Horizontal Scrolling container */
        <div className="flex-1 flex gap-4 overflow-x-auto pb-6 pt-1 px-3.5 items-start select-none scrollbar-thin">
          {columnsList.map((colName) => {
            const cards = columnsData[colName] || [];
            const meta = columnMeta[colName];
            const sumVal = columnSums[colName];
            const isDraggedOver = draggedOverCol === colName;

            return (
              <div
                key={colName}
                onDragOver={handleDragOver}
                onDragEnter={() => setDraggedOverCol(colName)}
                onDragLeave={() => {
                  if (draggedOverCol === colName) setDraggedOverCol(null);
                }}
                onDrop={() => handleDrop(colName)}
                className={`w-[320px] bg-white dark:bg-slate-900 border rounded-2xl flex flex-col max-h-[70vh] shrink-0 overflow-hidden shadow-sm transition-all duration-305 ${
                  meta.headerClass
                } ${
                  isDraggedOver
                    ? "border-indigo-500 ring-4 ring-indigo-500/10 dark:ring-indigo-500/5 bg-indigo-50/10 dark:bg-indigo-950/10"
                    : "border-slate-200/60 dark:border-slate-805/70"
                }`}
              >
                {/* Column Header */}
                <div className="px-4 py-3.5 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between bg-slate-50/40 dark:bg-slate-950/10 shrink-0">
                  <div className="flex items-center gap-2">
                    <meta.icon className={`w-4 h-4 ${meta.iconColor}`} />
                    <span className="text-[11px] font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                      {colName}
                    </span>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${meta.bgBadge}`}>
                    {cards.length}
                  </span>
                </div>

                {/* Sub-header displaying cumulative stage limit sum */}
                <div className="px-4 py-2 bg-slate-50/20 dark:bg-slate-950/5 border-b border-slate-100/50 dark:border-slate-800/40 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-extrabold shrink-0">
                  <span>Stage Value:</span>
                  <span className="text-slate-800 dark:text-slate-250 font-black">{formatColumnSum(sumVal)}</span>
                </div>

                {/* Cards Scrolling Queue */}
                <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 min-h-[350px] bg-slate-50/20 dark:bg-slate-950/5 scrollbar-thin">
                  {cards.map((card) => (
                    <div
                      key={card.id}
                      draggable
                      onDragStart={() => handleDragStart(card.id, colName)}
                      className="p-4 rounded-2xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-800 hover:shadow-md hover:border-indigo-500/30 dark:hover:border-indigo-500/20 transition-all duration-200 cursor-grab active:cursor-grabbing group relative flex flex-col gap-3"
                    >
                      {/* Top row: ID, Age and Source */}
                      <div className="flex items-center justify-between text-[10px] font-extrabold leading-none">
                        <div className="flex items-center gap-1.5">
                          <span className="text-indigo-650 dark:text-indigo-400 font-black text-[9px] uppercase tracking-wide">
                            {card.id}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[8px] uppercase font-black">
                            {card.source}
                          </span>
                        </div>
                        <span className="text-slate-400 dark:text-slate-500 text-[8px] font-black">
                          {card.age}
                        </span>
                      </div>

                      {/* Middle row: Customer Details */}
                      <div>
                        <h4 className="text-[11.5px] font-black text-slate-800 dark:text-slate-100 tracking-tight leading-snug">
                          {card.name}
                        </h4>
                        {(card.city || card.pincode) && (
                          <div className="flex items-center gap-1 mt-1 text-[9px] text-slate-400 dark:text-slate-500 font-extrabold">
                            <MapPin className="w-2.5 h-2.5 shrink-0" />
                            <span>
                              {card.city}
                              {card.pincode ? ` (${card.pincode})` : ""}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Loan Amount & CIBIL */}
                      <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 dark:border-slate-800/60">
                        <div className="bg-slate-50 dark:bg-slate-900/60 px-2.5 py-1.5 rounded-xl border border-slate-200/40 dark:border-slate-800/40 flex items-center gap-1.5">
                          <span className="text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-extrabold">
                            {card.amountLabel}:
                          </span>
                          <span className="text-slate-800 dark:text-slate-205 font-black text-[12px]">
                            {card.amount}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-extrabold">CIBIL:</span>
                          <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black ${getCibilBadgeStyles(card.cibil)}`}>
                            {card.cibil}
                          </span>
                        </div>
                      </div>

                      {/* Footer row: Priority and Telecaller */}
                      <div className="flex items-center justify-between pt-2.5 border-t border-slate-100/60 dark:border-slate-800/40 text-[9px] font-extrabold">
                        {/* Priority */}
                        <span className={`px-2 py-0.5 rounded-full font-black ${getPriorityBadgeStyles(card.priority)}`}>
                          {card.priority}
                        </span>

                        {/* Caller */}
                        <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                          <User className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[100px]">{card.assignedTo}</span>
                        </div>
                      </div>

                      {/* Hover action slide in */}
                      <button
                        onClick={() => navigate(`/leads/${card.id}`)}
                        className="absolute top-3 right-3 p-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-800 dark:hover:text-white opacity-0 group-hover:opacity-100 transition-all duration-200 cursor-pointer border border-slate-200 dark:border-slate-700 shadow-sm"
                        title="View Full File Workspace"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  {cards.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400/80 border-2 border-dashed border-slate-205 dark:border-slate-800 rounded-2xl bg-white/20 dark:bg-slate-900/10">
                      <AlertCircle className="w-5.5 h-5.5 text-slate-300 dark:text-slate-700 mb-2" />
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-600">
                        Empty Stage
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
