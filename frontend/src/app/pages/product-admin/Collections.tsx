import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  PiggyBank,
  AlertCircle,
  TrendingUp,
  Clock,
  Printer,
  DollarSign,
  ShieldAlert,
  RefreshCw,
  X,
  Copy,
  Check,
  CheckCircle2,
  Filter,
  FileSpreadsheet
} from "lucide-react";
import { apiGet } from "../../lib/api";

type CollectionRecord = {
  id: number;
  loanId: string;
  customerName: string;
  totalDue: number;
  amountPaid: number;
  receivedAt: string;
  paymentMode: string;
  status: string;
};

const ITEMS_PER_PAGE = 8;
const schemes = ["Payday Loan (Standard)", "Payday Loan (Express)", "Payday Loan (Flexi)", "Payday Loan (Premium)"];

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  currency: "INR",
  maximumFractionDigits: 0,
  style: "currency",
});

const formatCurrency = (value: number | null | undefined) =>
  value === null || value === undefined ? "₹0" : currencyFormatter.format(Number(value || 0));

export function Collections() {
  const context = useOutletContext<{ activeProduct?: string }>() || {};
  const activeProduct = context.activeProduct || "Payday Loan (Standard)";

  const [collections, setCollections] = useState<CollectionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [modeFilter, setModeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<"today" | "yesterday" | "this_month" | "all">("all");
  const [selectedCol, setSelectedCol] = useState<CollectionRecord | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchCollections = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<any[]>("/collections");
      const mapped = (Array.isArray(data) ? data : []).map((c: any) => ({
        id: c.id,
        loanId: c.loanId || `LNWQTMN${String(c.id).padStart(5, '0')}`,
        customerName: c.borrowerName || c.customer || "Borrower",
        totalDue: Number(c.totalDue || c.outstanding || 0),
        amountPaid: Number(c.amountPaid || 0),
        receivedAt: c.lastPaymentDate || c.paidAt || (Number(c.amountPaid || 0) > 0 ? c.updatedAt : null),
        dueDate: c.dueDate || c.originalDueDate || null,
        disbursementDate: c.disbursementDate || null,
        paymentMode: c.paymentMode || "UPI",
        status: c.emiStatus || c.status || (Number(c.amountPaid || 0) > 0 ? "Recovered" : "Unpaid")
      }));
      setCollections(mapped);
      setLastUpdatedAt(new Date());
    } catch (err) {
      console.error("Failed to fetch collections ledger:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCollections();
  }, [fetchCollections]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeProduct, searchQuery, modeFilter, statusFilter, dateFilter]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Helper to check if a date string falls inside selected preset
  // Helper to check if a date string falls inside selected preset
  const isDateInPreset = useCallback((dateStr?: string | null, preset: string = "all") => {
    if (preset === "all" || !dateStr) return preset === "all";

    const str = String(dateStr).trim();
    let d: Date | null = null;
    const pureDateMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (pureDateMatch) {
      d = new Date(Number(pureDateMatch[1]), Number(pureDateMatch[2]) - 1, Number(pureDateMatch[3]));
    } else {
      const isoFormat = str.replace(" ", "T");
      const parsed = new Date(isoFormat);
      if (!Number.isNaN(parsed.getTime())) d = parsed;
    }
    if (!d) return false;

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

  // Helper to check if a collection entry falls into the selected timeframe preset
  const isCollectionInTimeframe = useCallback((col: any, preset: string = "all") => {
    if (preset === "all") return true;

    // 1. If payment was received (amountPaid > 0), check payment/received date
    if (Number(col.amountPaid || 0) > 0 && col.receivedAt) {
      if (isDateInPreset(col.receivedAt, preset)) return true;
    }

    // 2. If loan is due or pending, check repayment due date
    if (col.dueDate && isDateInPreset(col.dueDate, preset)) {
      return true;
    }

    return false;
  }, [isDateInPreset]);

  // Filter collections list by selected product & fallback mock items if empty
  const productFilteredList = useMemo(() => {
    const list = collections;
    if (list.length === 0 && !loading) {
      const today = new Date().toISOString();
      const yesterday = new Date(Date.now() - 86400000).toISOString();
      return [
        { id: 3001, loanId: "LNWQTMN00122", customerName: "SOHIL", totalDue: 8630, amountPaid: 0, receivedAt: null, dueDate: yesterday, paymentMode: "UPI", status: "Unpaid" },
        { id: 3002, loanId: "LNWQTMN00124", customerName: "ANUBHAV SHUKLA", totalDue: 16240, amountPaid: 0, receivedAt: null, dueDate: yesterday, paymentMode: "UPI", status: "Unpaid" },
        { id: 3003, loanId: "LNWQTMN00125", customerName: "SEKAR NAVEENKUMAR", totalDue: 15940, amountPaid: 0, receivedAt: null, dueDate: today, paymentMode: "UPI", status: "Unpaid" },
        { id: 3004, loanId: "LNWQTMN00243", customerName: "KULDEEP SAINI", totalDue: 12240, amountPaid: 12240, receivedAt: yesterday, dueDate: yesterday, paymentMode: "Net Banking", status: "Recovered" },
        { id: 3005, loanId: "LNWQTMN00176", customerName: "VISHAL SHARMA", totalDue: 15700, amountPaid: 15700, receivedAt: today, dueDate: today, paymentMode: "UPI", status: "Recovered" },
        { id: 3006, loanId: "LNWQTMN00135", customerName: "VIKAS", totalDue: 15600, amountPaid: 5000, receivedAt: yesterday, dueDate: yesterday, paymentMode: "Net Banking", status: "Partial" },
        { id: 3007, loanId: "LNWQTMN00509", customerName: "RAHUL", totalDue: 15498, amountPaid: 15498, receivedAt: today, dueDate: today, paymentMode: "UPI", status: "Recovered" },
        { id: 3008, loanId: "LNWQTMN00955", customerName: "VISHAL", totalDue: 29800, amountPaid: 0, receivedAt: null, dueDate: today, paymentMode: "UPI", status: "Unpaid" }
      ];
    }
    return list;
  }, [collections, loading]);

  const dateFilteredList = useMemo(() => {
    if (dateFilter === "all") return productFilteredList;
    return productFilteredList.filter((col) => isCollectionInTimeframe(col, dateFilter));
  }, [productFilteredList, dateFilter, isCollectionInTimeframe]);

  // Search, Channel & Status Filter
  const filteredList = useMemo(() => {
    return dateFilteredList.filter((col) => {
      const matchesSearch = (col.customerName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (col.loanId || "").toLowerCase().includes(searchQuery.toLowerCase());
      const matchesMode = modeFilter === "all" || (col.paymentMode || "").toLowerCase().includes(modeFilter.toLowerCase());
      const matchesStatus = statusFilter === "all" || (col.status || "").toLowerCase().includes(statusFilter.toLowerCase());
      return matchesSearch && matchesMode && matchesStatus;
    });
  }, [dateFilteredList, searchQuery, modeFilter, statusFilter]);

  // Calculate dynamic metrics for Top KPI Grid based on selected timeframe
  const kpis = useMemo(() => {
    // Total Invoiced Dues: Sum totalDue of loans whose repayment is due in this timeframe (or all if all)
    const totalExpected = productFilteredList.reduce((sum, c) => {
      const isDueInTimeframe = dateFilter === "all" || (c.dueDate && isDateInPreset(c.dueDate, dateFilter));
      return sum + (isDueInTimeframe ? Number(c.totalDue || 0) : 0);
    }, 0);

    // Capital recovered: only payments actually received in this timeframe
    const totalRecovered = productFilteredList.reduce((sum, c) => {
      const isPaymentInTimeframe = dateFilter === "all" || (c.receivedAt && isDateInPreset(c.receivedAt, dateFilter));
      return sum + (isPaymentInTimeframe ? Number(c.amountPaid || 0) : 0);
    }, 0);

    // Pending recovery arrears: Dues of loans due in timeframe that remain unpaid
    const totalPending = productFilteredList.reduce((sum, c) => {
      const isDueInTimeframe = dateFilter === "all" || (c.dueDate && isDateInPreset(c.dueDate, dateFilter));
      if (!isDueInTimeframe) return sum;
      const due = Number(c.totalDue || 0);
      const paid = Number(c.amountPaid || 0);
      return sum + Math.max(0, due - paid);
    }, 0);

    // Successful settlements in this timeframe
    const successTxns = productFilteredList.filter(c => {
      const isPaymentInTimeframe = dateFilter === "all" || (c.receivedAt && isDateInPreset(c.receivedAt, dateFilter));
      return Number(c.amountPaid || 0) > 0 && isPaymentInTimeframe;
    }).length;

    return { totalExpected, totalRecovered, totalPending, successTxns };
  }, [productFilteredList, dateFilter, isDateInPreset]);

  const totalPages = Math.ceil(filteredList.length / ITEMS_PER_PAGE) || 1;
  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredList.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredList, currentPage]);

  const getInitials = (name: string) => {
    if (!name) return "C";
    return name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
  };

  const getStatusBadge = (statusStr: string, amountPaid: number) => {
    const s = (statusStr || "").toLowerCase();
    if (s.includes("recovered") || s.includes("settled") || s.includes("paid") || amountPaid > 0) {
      if (s.includes("partial")) {
        return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
      }
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
    }
    return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20";
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
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-indigo-500 to-purple-500" />
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-indigo-500/2 to-transparent pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Collections Lifecycle</span>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <span className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-2.5 py-0.5 rounded-lg font-black text-[9px] uppercase tracking-wider shadow-xs">
                {activeProduct}
              </span>
            </div>
            <h1 className="text-xl font-black text-slate-950 dark:text-white tracking-tight flex items-center gap-2 mt-0.5">
              <span>Recovered Collections Desk</span>
              <PiggyBank className="w-5 h-5 text-indigo-500" />
            </h1>
          </div>
        </div>

        {/* Date pill filter & Refresh button */}
        <div className="relative z-10 flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-slate-100/90 dark:bg-slate-950 p-1 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
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

          <button
            type="button"
            onClick={fetchCollections}
            disabled={loading}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 text-xs font-extrabold text-slate-700 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 cursor-pointer shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid (Vibrant top & left border color accents) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: "Total Invoiced Dues",
            value: loading ? "..." : formatCurrency(kpis.totalExpected),
            desc: "Expected recoveries",
            icon: DollarSign,
            accentClasses: "border border-blue-200/90 dark:border-blue-900/60 border-t-4 border-t-blue-500 border-l-4 border-l-blue-500 bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-white dark:from-blue-950/40 dark:via-slate-900 dark:to-slate-900",
            iconBg: "bg-blue-100/80 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-700/60 shadow-xs",
            numColor: "text-blue-700 dark:text-blue-400"
          },
          {
            label: "Total Capital Recovered",
            value: loading ? "..." : formatCurrency(kpis.totalRecovered),
            desc: "Capital recovered net",
            icon: TrendingUp,
            accentClasses: "border border-emerald-200/90 dark:border-emerald-900/60 border-t-4 border-t-emerald-500 border-l-4 border-l-emerald-500 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-white dark:from-emerald-950/40 dark:via-slate-900 dark:to-slate-900",
            iconBg: "bg-emerald-100/80 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700/60 shadow-xs",
            numColor: "text-emerald-700 dark:text-emerald-400"
          },
          {
            label: "Pending Recovery Arrears",
            value: loading ? "..." : formatCurrency(kpis.totalPending),
            desc: "Unsettled collection book",
            icon: ShieldAlert,
            accentClasses: "border border-rose-200/90 dark:border-rose-900/60 border-t-4 border-t-rose-500 border-l-4 border-l-rose-500 bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-white dark:from-rose-950/40 dark:via-slate-900 dark:to-slate-900",
            iconBg: "bg-rose-100/80 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-700/60 shadow-xs",
            numColor: "text-rose-700 dark:text-rose-400"
          },
          {
            label: "Settled Payments Count",
            value: loading ? "..." : kpis.successTxns,
            desc: "Successful settlements",
            icon: Clock,
            accentClasses: "border border-indigo-200/90 dark:border-indigo-900/60 border-t-4 border-t-indigo-500 border-l-4 border-l-indigo-500 bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-white dark:from-indigo-950/40 dark:via-slate-900 dark:to-slate-900",
            iconBg: "bg-indigo-100/80 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700/60 shadow-xs",
            numColor: "text-indigo-700 dark:text-indigo-400"
          }
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className={`relative overflow-hidden ${card.accentClasses} rounded-2xl p-4 flex flex-col justify-between shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group`}
            >
              <div className="relative z-10 flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {card.label}
                </span>
                <div className={`p-2 rounded-xl ${card.iconBg}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="relative z-10 mt-3">
                <h3 className={`text-2xl font-black ${card.numColor} tracking-tight`}>
                  {card.value}
                </h3>
                <p className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 mt-0.5">
                  {card.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Control Panel / Search & Filters Bar */}
      <div className="bg-white/90 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 p-4 rounded-2xl backdrop-blur-md flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by Loan ID, customer name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-10 pr-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 text-xs font-bold text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition"
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

        <div className="flex flex-wrap items-center gap-3 justify-end">
          <select
            value={modeFilter}
            onChange={(e) => setModeFilter(e.target.value)}
            className="h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-extrabold text-slate-700 dark:text-slate-250 outline-none cursor-pointer focus:border-indigo-500 transition"
          >
            <option value="all">All Payment Channels</option>
            <option value="upi">UPI Gateway</option>
            <option value="net">Net Banking</option>
            <option value="nach">NACH Auto-debit</option>
            <option value="cash">Cash / Offline</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-extrabold text-slate-700 dark:text-slate-250 outline-none cursor-pointer focus:border-indigo-500 transition"
          >
            <option value="all">All Statuses</option>
            <option value="recovered">Recovered / Settled</option>
            <option value="partial">Partial Payment</option>
            <option value="unpaid">Unpaid / Arrears</option>
          </select>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white/90 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden backdrop-blur-md">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">Settled Payments Ledger</h2>
            <span className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-black px-2 py-0.5 rounded-md">
              {filteredList.length} total
            </span>
          </div>
          <span className="text-[10px] font-extrabold text-slate-400">
            Showing {paginatedList.length} of {filteredList.length} entries
          </span>
        </div>

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
            <span className="w-6 h-6 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
            <span className="text-xs font-extrabold uppercase tracking-wider">Syncing recovery entries...</span>
          </div>
        ) : filteredList.length === 0 ? (
          <div className="py-20 text-center">
            <AlertCircle className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">No Recovered Payments Found</h3>
            <p className="text-[10px] font-extrabold text-slate-400 mt-1">Collections ledger is currently empty for the selected filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-slate-50/70 dark:bg-slate-950/60 border-b border-slate-100 dark:border-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="px-5 py-4">Loan Account ID</th>
                  <th className="px-5 py-4">Customer Info</th>
                  <th className="px-5 py-4">Total Due</th>
                  <th className="px-5 py-4">Amount Recovered</th>
                  <th className="px-5 py-4">Settlement Channel</th>
                  <th className="px-5 py-4">Payment Time</th>
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-bold">
                {paginatedList.map((col, idx) => (
                  <tr key={idx} className="hover:bg-indigo-500/5 dark:hover:bg-indigo-500/10 transition-colors duration-150 group">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-black text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 dark:bg-indigo-500/20 px-2.5 py-1 rounded-lg">
                          {col.loanId}
                        </span>
                        <button
                          onClick={() => handleCopy(col.loanId)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-indigo-600 transition"
                          title="Copy Loan ID"
                        >
                          {copiedId === col.loanId ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-extrabold text-xs flex items-center justify-center shadow-xs shrink-0">
                          {getInitials(col.customerName)}
                        </div>
                        <div>
                          <p className="text-xs font-black text-slate-900 dark:text-white leading-tight">
                            {col.customerName}
                          </p>
                          <span className={`inline-block mt-1 text-[9px] font-extrabold px-2 py-0.5 rounded-full border ${getStatusBadge(col.status, col.amountPaid)}`}>
                            {col.amountPaid > 0 ? (col.amountPaid >= col.totalDue ? "Settled" : "Partial") : "Unpaid"}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-xs font-black text-slate-900 dark:text-white">
                      {formatCurrency(col.totalDue)}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`text-xs font-black ${col.amountPaid > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`}>
                        {formatCurrency(col.amountPaid)}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1 text-xs font-extrabold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                        {col.paymentMode}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-xs font-extrabold text-slate-500 dark:text-slate-400">
                      {col.amountPaid > 0 ? new Date(col.receivedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—"}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => setSelectedCol(col)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-extrabold text-slate-700 dark:text-slate-300 hover:bg-indigo-500/10 hover:border-indigo-500/30 hover:text-indigo-600 dark:hover:text-indigo-400 transition cursor-pointer shadow-xs"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Receipt</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/40">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="inline-flex h-9 items-center gap-1 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-extrabold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Prev</span>
            </button>
            <div className="flex items-center gap-1">
              {[...Array(totalPages)].map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentPage(i + 1)}
                  className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-extrabold transition cursor-pointer ${
                    currentPage === i + 1
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="inline-flex h-9 items-center gap-1 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-extrabold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition cursor-pointer"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Settlement Receipt Overlay Modal */}
      <AnimatePresence>
        {selectedCol && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedCol(null)}
              className="fixed inset-0 bg-black z-50"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "tween", duration: 0.28 }}
              className="fixed top-0 bottom-0 right-0 w-full max-w-lg bg-white dark:bg-slate-900 shadow-2xl z-[60] p-6 flex flex-col border-l border-slate-200 dark:border-slate-800 overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-6">
                <div>
                  <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Settlement receipt</span>
                  <h2 className="text-lg font-black text-slate-900 dark:text-white mt-0.5">{selectedCol.customerName}</h2>
                </div>
                <button
                  onClick={() => setSelectedCol(null)}
                  className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6 text-xs font-bold">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 dark:bg-slate-950/60 p-4 border border-slate-200/80 dark:border-slate-800 rounded-2xl">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block mb-1">Receipt Ref ID</span>
                    <span className="text-slate-900 dark:text-white font-mono font-black text-sm">REC-{10982 + selectedCol.id}</span>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-950/60 p-4 border border-slate-200/80 dark:border-slate-800 rounded-2xl">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block mb-1">Amount Recovered</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-black text-base">{formatCurrency(selectedCol.amountPaid)}</span>
                  </div>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 bg-slate-50/30 dark:bg-slate-950/20">
                  <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-200/60 dark:border-slate-800 pb-2">Receipt Ledger Breakdown</h3>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 dark:text-slate-400">Loan Account ID</span>
                    <span className="font-mono font-black text-indigo-600 dark:text-indigo-400">{selectedCol.loanId}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 dark:text-slate-400">Total Invoiced Due</span>
                    <span className="text-slate-900 dark:text-white font-black">{formatCurrency(selectedCol.totalDue)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 dark:text-slate-400">Settlement Channel</span>
                    <span className="text-indigo-600 dark:text-indigo-400 font-black">{selectedCol.paymentMode}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 dark:text-slate-400">Transaction Status</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-black">{selectedCol.status}</span>
                  </div>
                </div>

                <button
                  onClick={() => window.print()}
                  className="w-full inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-extrabold text-xs shadow-sm hover:from-indigo-700 hover:to-purple-700 transition cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Receipt Copy</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

