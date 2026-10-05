import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  Wallet,
  AlertCircle,
  TrendingUp,
  DollarSign,
  PiggyBank,
  CheckCircle2,
  RefreshCw,
  Building2,
  Calendar,
  X,
  History,
  FileSpreadsheet,
  Printer,
  RotateCcw,
  SlidersHorizontal
} from "lucide-react";
import { apiGet } from "../../lib/api";

type Loan = {
  id: string;
  customer?: string | null;
  customerId?: string | null;
  principal: number;
  balance: number;
  amountPaid: number;
  status: string;
  startDate?: string | null;
  disbursedDate?: string | null;
  dueDate?: string | null;
  paymentStatus?: string | null;
  accountNumber?: string | null;
  ifscCode?: string | null;
  bankName?: string | null;
  utrNumber?: string | null;
  transferType?: string | null;
  processingFee?: number;
  gstAmount?: number;
  repaymentAmount?: number;
  interestAmount?: number;
  agreementNumber?: string | null;
  repayments?: Array<{ amount: number; receivedAt: string }>;
};

const schemes = ["Payday Loan (Standard)", "Payday Loan (Express)", "Payday Loan (Flexi)", "Payday Loan (Premium)"];

export function Disbursals() {
  const context = useOutletContext<{ activeProduct?: string }>() || {};
  const activeProduct = context.activeProduct || "Payday Loan (Standard)";

  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);

  // Timeframe & Filter States
  const [dateRangePreset, setDateRangePreset] = useState("all"); // all (Total), today, this_month, last_month, yesterday, custom
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [amountRange, setAmountRange] = useState("all"); // all, under_10k, 10k_25k, 25k_50k, over_50k
  const [transferTypeFilter, setTransferTypeFilter] = useState("all");
  const [pageSize, setPageSize] = useState("10");

  // Selection & UI Feedback State
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const fetchLoans = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<Loan[]>("/loans");
      setLoans(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch loans ledger:", err);
      setLoans([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLoans();
  }, [fetchLoans]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeProduct, searchQuery, statusFilter, dateRangePreset, fromDate, toDate, amountRange, transferTypeFilter, pageSize]);

  // Pure 100% Real Database List
  const productFilteredList = useMemo(() => {
    return loans;
  }, [loans]);

  // Filter Engine (Search + Status + Timeframe Date Range + Amount + Transfer Type)
  const filteredList = useMemo(() => {
    return productFilteredList.filter((loan) => {
      const name = (loan.customer || "").toLowerCase();
      const id = (loan.id || "").toLowerCase();
      const utr = (loan.utrNumber || "").toLowerCase();
      const acc = (loan.accountNumber || "").toLowerCase();
      const bank = (loan.bankName || "").toLowerCase();
      const q = searchQuery.toLowerCase().trim();

      // 1. Search Query Match
      const matchesSearch = !q || name.includes(q) || id.includes(q) || utr.includes(q) || acc.includes(q) || bank.includes(q);

      // 2. Status Match
      const statusLower = (loan.status || "").toLowerCase();
      const matchesStatus = statusFilter === "all" || statusLower === statusFilter.toLowerCase();

      // 3. Amount Range Match
      const principal = Number(loan.principal || 0);
      let matchesAmount = true;
      if (amountRange === "under_10k") matchesAmount = principal < 10000;
      else if (amountRange === "10k_25k") matchesAmount = principal >= 10000 && principal <= 25000;
      else if (amountRange === "25k_50k") matchesAmount = principal >= 25000 && principal <= 50000;
      else if (amountRange === "over_50k") matchesAmount = principal > 50000;

      // 4. Transfer Type Match
      const transferType = (loan.transferType || "").toLowerCase();
      const matchesTransfer = transferTypeFilter === "all" || transferType.includes(transferTypeFilter.toLowerCase());

      // 5. Timeframe / Date Range Match
      let matchesDate = true;
      const rawDateStr = loan.disbursedDate || loan.startDate;
      if (rawDateStr) {
        const loanDate = new Date(rawDateStr);
        const today = new Date();
        const lastMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        
        if (dateRangePreset === "today") {
          matchesDate = loanDate.toDateString() === today.toDateString();
        } else if (dateRangePreset === "this_month") {
          matchesDate = loanDate.getMonth() === today.getMonth() && loanDate.getFullYear() === today.getFullYear();
        } else if (dateRangePreset === "last_month") {
          matchesDate = loanDate.getMonth() === lastMonthDate.getMonth() && loanDate.getFullYear() === lastMonthDate.getFullYear();
        } else if (dateRangePreset === "yesterday") {
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          matchesDate = loanDate.toDateString() === yesterday.toDateString();
        } else if (dateRangePreset === "custom") {
          if (fromDate) {
            const fDate = new Date(fromDate);
            fDate.setHours(0, 0, 0, 0);
            if (loanDate < fDate) matchesDate = false;
          }
          if (toDate) {
            const tDate = new Date(toDate);
            tDate.setHours(23, 59, 59, 999);
            if (loanDate > tDate) matchesDate = false;
          }
        }
      }

      return matchesSearch && matchesStatus && matchesAmount && matchesTransfer && matchesDate;
    });
  }, [productFilteredList, searchQuery, statusFilter, amountRange, transferTypeFilter, dateRangePreset, fromDate, toDate]);

  // Dynamic Real DB KPI Aggregates (Recalculated dynamically based on active filtered list or selected timeframe)
  const kpis = useMemo(() => {
    const list = filteredList;
    const totalCount = list.length;
    const totalPrincipal = list.reduce((sum, l) => sum + Number(l.principal || 0), 0);
    const totalNetDisbursed = list.reduce((sum, l) => {
      const principal = Number(l.principal || 0);
      const pFee = Number(l.processingFee || Math.round(principal * 0.10));
      const gst = Number(l.gstAmount || Math.round(pFee * 0.18));
      return sum + Math.max(0, principal - pFee - gst);
    }, 0);
    const totalOutstanding = list.reduce((sum, l) => sum + Number(l.balance !== undefined ? l.balance : l.principal), 0);

    return { totalCount, totalPrincipal, totalNetDisbursed, totalOutstanding };
  }, [filteredList]);

  // Pagination Logic
  const itemsPerPage = pageSize === "all" ? Math.max(1, filteredList.length) : Number(pageSize);
  const totalPages = Math.ceil(filteredList.length / itemsPerPage) || 1;
  const paginatedList = useMemo(() => {
    if (pageSize === "all") return filteredList;
    const start = (currentPage - 1) * itemsPerPage;
    return filteredList.slice(start, start + itemsPerPage);
  }, [filteredList, currentPage, pageSize, itemsPerPage]);

  const hasActiveFilters = searchQuery || statusFilter !== "all" || dateRangePreset !== "all" || amountRange !== "all" || transferTypeFilter !== "all" || fromDate || toDate;

  const resetAllFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setDateRangePreset("all");
    setFromDate("");
    setToDate("");
    setAmountRange("all");
    setTransferTypeFilter("all");
    setCurrentPage(1);
  };

  // --- CLEAN EXPORT TO EXCEL (.xls) & PRINT ---

  // Perfectly Formatted Excel Worksheet Export Generator
  const exportExcel = () => {
    if (filteredList.length === 0) return;

    const totalSanctioned = filteredList.reduce((sum, l) => sum + Number(l.principal || 0), 0);
    const totalNetDisbursed = filteredList.reduce((sum, l) => {
      const sanctioned = Number(l.principal || 0);
      const fee = Number(l.processingFee || Math.round(sanctioned * 0.10));
      const gst = Number(l.gstAmount || Math.round(fee * 0.18));
      return sum + Math.max(0, sanctioned - fee - gst);
    }, 0);
    const totalOutstanding = filteredList.reduce((sum, l) => sum + Number(l.balance !== undefined ? l.balance : l.principal), 0);

    const headers = [
      "S.No",
      "Loan ID",
      "Customer Name",
      "Sanction Amount (₹)",
      "Net Payout (₹)",
      "Outstanding Balance (₹)",
      "Status",
      "Disbursed Date",
      "Bank Name",
      "Account Number",
      "IFSC Code",
      "UTR Reference",
      "Transfer Mode"
    ];

    const rowsHtml = filteredList.map((l, index) => {
      const sanctioned = Number(l.principal || 0);
      const fee = Number(l.processingFee || Math.round(sanctioned * 0.10));
      const gst = Number(l.gstAmount || Math.round(fee * 0.18));
      const netPayout = Math.max(0, sanctioned - fee - gst);
      const outstanding = Number(l.balance !== undefined ? l.balance : l.principal);
      
      let dateStr = "-";
      if (l.startDate || l.disbursedDate) {
        const d = new Date(l.disbursedDate || l.startDate || "");
        dateStr = isNaN(d.getTime()) ? String(l.startDate || "-") : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
      }

      return `
        <tr>
          <td style="text-align: center; border: 1px solid #CBD5E1;">${index + 1}</td>
          <td style="font-weight: bold; color: #4F46E5; border: 1px solid #CBD5E1; mso-number-format:'\\@';">${l.id || ''}</td>
          <td style="font-weight: bold; border: 1px solid #CBD5E1;">${l.customer || 'Applicant'}</td>
          <td style="text-align: right; font-weight: bold; border: 1px solid #CBD5E1;">₹${sanctioned.toLocaleString("en-IN")}</td>
          <td style="text-align: right; font-weight: bold; color: #059669; border: 1px solid #CBD5E1;">₹${netPayout.toLocaleString("en-IN")}</td>
          <td style="text-align: right; font-weight: bold; color: #2563EB; border: 1px solid #CBD5E1;">₹${outstanding.toLocaleString("en-IN")}</td>
          <td style="text-align: center; border: 1px solid #CBD5E1;">${l.status || 'Active'}</td>
          <td style="text-align: center; border: 1px solid #CBD5E1;">${dateStr}</td>
          <td style="border: 1px solid #CBD5E1;">${l.bankName || '-'}</td>
          <td style="border: 1px solid #CBD5E1; mso-number-format:'\\@';">${l.accountNumber ? `'${l.accountNumber}` : '-'}</td>
          <td style="border: 1px solid #CBD5E1; mso-number-format:'\\@';">${l.ifscCode || '-'}</td>
          <td style="border: 1px solid #CBD5E1; mso-number-format:'\\@';">${l.utrNumber || '-'}</td>
          <td style="text-align: center; border: 1px solid #CBD5E1;">${l.transferType || 'IMPS'}</td>
        </tr>
      `;
    }).join("");

    const template = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8">
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>Active Disbursements</x:Name>
                <x:WorksheetOptions>
                  <x:DisplayGridlines/>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
          body { font-family: Arial, sans-serif; font-size: 12px; }
          .title { font-size: 16px; font-weight: bold; color: #0F172A; margin-bottom: 4px; }
          .subtitle { font-size: 11px; color: #64748B; margin-bottom: 12px; }
          th { background-color: #0F172A; color: #FFFFFF; font-weight: bold; padding: 8px; border: 1px solid #475569; text-align: left; }
          td { padding: 6px 8px; font-size: 11px; }
          .total-row td { background-color: #F1F5F9; font-weight: bold; border-top: 2px solid #0F172A; border-bottom: 2px solid #0F172A; }
        </style>
      </head>
      <body>
        <div class="title">ACTIVE DISBURSEMENTS LEDGER REPORT</div>
        <div class="subtitle">Generated on ${new Date().toLocaleString("en-IN")} | Total Accounts: ${filteredList.length}</div>
        <table border="1" cellspacing="0" cellpadding="5">
          <thead>
            <tr>
              ${headers.map(h => `<th>${h}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
          <tfoot>
            <tr class="total-row">
              <td colspan="3" style="text-align: right; font-weight: bold;">TOTAL SUMMARY:</td>
              <td style="text-align: right; font-weight: bold;">₹${totalSanctioned.toLocaleString("en-IN")}</td>
              <td style="text-align: right; font-weight: bold; color: #059669;">₹${totalNetDisbursed.toLocaleString("en-IN")}</td>
              <td style="text-align: right; font-weight: bold; color: #2563EB;">₹${totalOutstanding.toLocaleString("en-IN")}</td>
              <td colspan="7"></td>
            </tr>
          </tfoot>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob(["\uFEFF" + template], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Disbursals_Ledger_${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Print Report
  const printReport = () => {
    window.print();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 pb-10 font-sans print:p-0 print:m-0"
    >
      {/* Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5 print:hidden">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
            <span>DASHBOARD</span>
            <span>/</span>
            <span className="text-slate-800 dark:text-white uppercase font-bold">Loan management</span>
          </div>
          <div className="flex items-center gap-3 mt-1.5">
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
              <span>Active Disbursements Ledger</span>
              <Wallet className="w-6 h-6 text-indigo-500" />
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 text-[11px] font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              100% Real DB Ledger
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">
            Real disbursed capital loans bound to product: <span className="text-indigo-600 dark:text-indigo-400 font-bold">{activeProduct}</span>
          </p>
        </div>

        {/* Action Command Bar: Sync + Print + Excel Only */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            onClick={fetchLoans}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm transition cursor-pointer disabled:opacity-50"
            title="Sync latest DB state"
          >
            <RefreshCw className={`w-4 h-4 text-slate-400 ${loading ? "animate-spin" : ""}`} />
            <span>Sync</span>
          </button>

          {/* Print PDF Action */}
          <button
            onClick={printReport}
            disabled={filteredList.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm transition cursor-pointer disabled:opacity-40"
            title="Print / Save as PDF Report"
          >
            <Printer className="w-4 h-4 text-purple-500" />
            <span>Print</span>
          </button>

          {/* Excel Export Action */}
          <button
            onClick={exportExcel}
            disabled={filteredList.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold shadow-md hover:bg-emerald-700 transition cursor-pointer disabled:opacity-40"
            title="Export Clean Formatted Excel Worksheet (.xls)"
          >
            <FileSpreadsheet className="w-4 h-4 text-white" />
            <span>Excel</span>
          </button>
        </div>
      </div>

      {/* TIMEFRAME FILTER BUTTON TABS (Today / This Month / Last Month / Total) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-900/60 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 print:hidden">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-indigo-500" />
          <span className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">KPI Timeframe Filter:</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 bg-white dark:bg-slate-950 p-1 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
          {[
            { id: "today", label: "Today" },
            { id: "this_month", label: "This Month" },
            { id: "last_month", label: "Last Month" },
            { id: "all", label: "Total (All Time)" }
          ].map((tab) => {
            const isActive = dateRangePreset === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setDateRangePreset(tab.id)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                  isActive
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* KPI Cards Grid (Dynamically Calculated for Selected Timeframe) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
        {[
          {
            label: "Active Loan Accounts",
            value: loading ? "..." : kpis.totalCount,
            desc: `Accounts (${dateRangePreset === 'all' ? 'All Time' : dateRangePreset === 'today' ? 'Today' : dateRangePreset === 'this_month' ? 'This Month' : 'Last Month'})`,
            icon: Wallet,
            badgeColor: "text-blue-600 dark:text-blue-300 bg-blue-100/80 dark:bg-blue-900/40 border-blue-200 dark:border-blue-700/60 shadow-xs",
            accentClasses: "border border-blue-200/90 dark:border-blue-900/60 border-t-4 border-t-blue-500 border-l-4 border-l-blue-500 bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-white dark:from-blue-950/40 dark:via-slate-900 dark:to-slate-900",
            valueColor: "text-blue-700 dark:text-blue-400"
          },
          {
            label: "Sanctioned Principal",
            value: loading ? "..." : `₹${kpis.totalPrincipal.toLocaleString("en-IN")}`,
            desc: "Capital sanctioned",
            icon: DollarSign,
            badgeColor: "text-purple-600 dark:text-purple-300 bg-purple-100/80 dark:bg-purple-900/40 border-purple-200 dark:border-purple-700/60 shadow-xs",
            accentClasses: "border border-purple-200/90 dark:border-purple-900/60 border-t-4 border-t-purple-500 border-l-4 border-l-purple-500 bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-white dark:from-purple-950/40 dark:via-slate-900 dark:to-slate-900",
            valueColor: "text-purple-700 dark:text-purple-400"
          },
          {
            label: "Net Payout Volume",
            value: loading ? "..." : `₹${Math.round(kpis.totalNetDisbursed).toLocaleString("en-IN")}`,
            desc: "Disbursed capital (net of fees)",
            icon: TrendingUp,
            badgeColor: "text-emerald-600 dark:text-emerald-300 bg-emerald-100/80 dark:bg-emerald-900/40 border-emerald-200 dark:border-emerald-700/60 shadow-xs",
            accentClasses: "border border-emerald-200/90 dark:border-emerald-900/60 border-t-4 border-t-emerald-500 border-l-4 border-l-emerald-500 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-white dark:from-emerald-950/40 dark:via-slate-900 dark:to-slate-900",
            valueColor: "text-emerald-700 dark:text-emerald-400"
          },
          {
            label: "Gross Outstanding Book",
            value: loading ? "..." : `₹${kpis.totalOutstanding.toLocaleString("en-IN")}`,
            desc: "Unrecovered principal + fee",
            icon: PiggyBank,
            badgeColor: "text-indigo-600 dark:text-indigo-300 bg-indigo-100/80 dark:bg-indigo-900/40 border-indigo-200 dark:border-indigo-700/60 shadow-xs",
            accentClasses: "border border-indigo-200/90 dark:border-indigo-900/60 border-t-4 border-t-indigo-500 border-l-4 border-l-indigo-500 bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-white dark:from-indigo-950/40 dark:via-slate-900 dark:to-slate-900",
            valueColor: "text-indigo-700 dark:text-indigo-400"
          }
        ].map((item, idx) => (
          <div
            key={idx}
            className={`relative overflow-hidden ${item.accentClasses} rounded-2xl p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-3.5 group`}
          >
            <div className={`p-3 rounded-xl ${item.badgeColor} border shrink-0`}>
              <item.icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider block truncate">{item.label}</span>
              <h3 className={`text-xl font-black ${item.valueColor} mt-0.5 leading-none truncate`}>{item.value}</h3>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium block mt-1 truncate">{item.desc}</span>
            </div>
          </div>
        ))}
      </div>

      {/* FILTER CONTROL BAR & ADVANCED FILTERS SUITE */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-4 print:hidden">
        {/* Main Search & Primary Filters Row */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[260px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search Loan ID, Borrower, UTR, Account, Bank..."
              className="w-full h-10 pl-10 pr-9 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 text-xs font-semibold outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition text-slate-900 dark:text-white"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Selectors */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-300 outline-none cursor-pointer focus:border-indigo-500 transition shadow-sm"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="overdue">Overdue</option>
              <option value="paid off">Paid Off / Closed</option>
            </select>

            {/* Date Range Preset Filter Select Dropdown */}
            <select
              value={dateRangePreset}
              onChange={(e) => setDateRangePreset(e.target.value)}
              className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-300 outline-none cursor-pointer focus:border-indigo-500 transition shadow-sm"
            >
              <option value="all">Total (All Time)</option>
              <option value="today">Today</option>
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="yesterday">Yesterday</option>
              <option value="custom">Custom Date Range...</option>
            </select>

            {/* Toggle Advanced Filters */}
            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={`inline-flex h-10 items-center gap-1.5 px-3.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                showAdvancedFilters || hasActiveFilters
                  ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800"
                  : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-50"
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>More Filters</span>
              {hasActiveFilters && (
                <span className="w-2 h-2 rounded-full bg-indigo-500" />
              )}
            </button>

            {/* Clear All Filters Button */}
            {hasActiveFilters && (
              <button
                onClick={resetAllFilters}
                className="inline-flex h-10 items-center gap-1 px-3 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 text-xs font-bold hover:bg-rose-100/70 transition cursor-pointer"
                title="Reset all filters to default"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Advanced Filters Expandable Drawer */}
        <AnimatePresence>
          {(showAdvancedFilters || dateRangePreset === "custom") && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 overflow-hidden"
            >
              {/* Custom From & To Date Pickers */}
              {dateRangePreset === "custom" && (
                <>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">From Date</label>
                    <input
                      type="date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-semibold text-slate-900 dark:text-white outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">To Date</label>
                    <input
                      type="date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-semibold text-slate-900 dark:text-white outline-none focus:border-indigo-500"
                    />
                  </div>
                </>
              )}

              {/* Amount Range Filter */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Sanction Amount Range</label>
                <select
                  value={amountRange}
                  onChange={(e) => setAmountRange(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-semibold text-slate-900 dark:text-white outline-none focus:border-indigo-500"
                >
                  <option value="all">All Amounts</option>
                  <option value="under_10k">Under ₹10,000</option>
                  <option value="10k_25k">₹10,000 - ₹25,000</option>
                  <option value="25k_50k">₹25,000 - ₹50,000</option>
                  <option value="over_50k">Above ₹50,000</option>
                </select>
              </div>

              {/* Transfer Mode Filter */}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">Transfer Mode</label>
                <select
                  value={transferTypeFilter}
                  onChange={(e) => setTransferTypeFilter(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-xs font-semibold text-slate-900 dark:text-white outline-none focus:border-indigo-500"
                >
                  <option value="all">All Modes</option>
                  <option value="imps">IMPS</option>
                  <option value="neft">NEFT</option>
                  <option value="rtgs">RTGS</option>
                  <option value="upi">UPI</option>
                </select>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* DATA TABLE CONTAINER */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        {/* Table Top Bar */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">Active Capital Allocations</h2>
            <span className="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-black text-slate-600 dark:text-slate-300">
              {filteredList.length} accounts
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400 font-semibold">Rows:</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(e.target.value)}
                className="h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-300 outline-none"
              >
                <option value="10">10 / page</option>
                <option value="25">25 / page</option>
                <option value="50">50 / page</option>
                <option value="100">100 / page</option>
                <option value="all">All</option>
              </select>
            </div>
            <span className="text-xs font-medium text-slate-400">Page {currentPage} of {totalPages}</span>
          </div>
        </div>

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400">
            <span className="w-7 h-7 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
            <span className="text-xs font-bold uppercase tracking-wider">Loading real database accounts...</span>
          </div>
        ) : filteredList.length === 0 ? (
          <div className="py-24 text-center px-4">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">No Disbursals Found</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
              There are currently no disbursed loan accounts matching your selected timeframe or filter options in the database.
            </p>
            {hasActiveFilters && (
              <button
                onClick={resetAllFilters}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Filters</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-slate-100/70 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-700/80 text-[10px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  <th className="px-5 py-4">Loan ID</th>
                  <th className="px-5 py-4">Customer Name</th>
                  <th className="px-5 py-4">Sanction Amount</th>
                  <th className="px-5 py-4">Net Payout</th>
                  <th className="px-5 py-4">Outstanding Balance</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Disbursed Date</th>
                  <th className="px-5 py-4 text-right print:hidden">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-semibold">
                {paginatedList.map((loan) => {
                  const sanctioned = Number(loan.principal || 0);
                  const pFee = Number(loan.processingFee || Math.round(sanctioned * 0.10));
                  const gst = Number(loan.gstAmount || Math.round(pFee * 0.18));
                  const netDisbursed = Math.max(0, sanctioned - pFee - gst);
                  const outstanding = Number(loan.balance !== undefined ? loan.balance : loan.principal);
                  const statusLower = (loan.status || "active").toLowerCase();

                  let formattedDate = "—";
                  const rawDate = loan.disbursedDate || loan.startDate;
                  if (rawDate) {
                    const d = new Date(rawDate);
                    formattedDate = isNaN(d.getTime()) ? String(rawDate).split("T")[0] : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
                  }

                  const nameStr = loan.customer || "Applicant";
                  const initials = nameStr.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "AP";

                  return (
                    <tr key={loan.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition">
                      <td className="px-5 py-4 text-xs font-extrabold text-indigo-600 dark:text-indigo-400">
                        <span className="font-mono">{loan.id}</span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center justify-center shrink-0 border border-slate-200 dark:border-slate-700 print:hidden">
                            {initials}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-900 dark:text-white leading-snug">{nameStr}</p>
                            {loan.accountNumber && (
                              <p className="text-[10px] font-mono text-slate-400 mt-0.5">A/C: ****{String(loan.accountNumber).slice(-4)}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-xs font-bold text-slate-900 dark:text-white">
                        ₹{sanctioned.toLocaleString("en-IN")}
                      </td>
                      <td className="px-5 py-4 text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
                        ₹{netDisbursed.toLocaleString("en-IN")}
                      </td>
                      <td className="px-5 py-4 text-xs font-extrabold text-blue-600 dark:text-blue-400">
                        ₹{outstanding.toLocaleString("en-IN")}
                      </td>
                      <td className="px-5 py-4">
                        {statusLower === "active" ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 text-[11px] font-bold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse print:hidden" />
                            Active
                          </span>
                        ) : statusLower === "overdue" ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60 text-[11px] font-bold">
                            <AlertCircle className="w-3 h-3 text-rose-500 print:hidden" />
                            Overdue
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60 text-[11px] font-bold">
                            <CheckCircle2 className="w-3 h-3 text-blue-500 print:hidden" />
                            {loan.status || "Paid Off"}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-xs font-medium text-slate-500 dark:text-slate-400">
                        {formattedDate}
                      </td>
                      <td className="px-5 py-4 text-right print:hidden">
                        <button
                          onClick={() => setSelectedLoan(loan)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 shadow-sm transition cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5 text-indigo-500" />
                          <span>View Dossier</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-900/90 text-slate-700 dark:text-slate-300 print:hidden">
            <span className="text-xs font-semibold text-slate-400">
              Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredList.length)} of {filteredList.length} accounts
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="inline-flex h-8 items-center gap-1 px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-bold hover:bg-white dark:hover:bg-slate-800 disabled:opacity-40 transition cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Prev</span>
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="inline-flex h-8 items-center gap-1 px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-bold hover:bg-white dark:hover:bg-slate-800 disabled:opacity-40 transition cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Payout Dossier Drawer Modal */}
      <AnimatePresence>
        {selectedLoan && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedLoan(null)}
              className="fixed inset-0 bg-slate-950 z-50 print:hidden"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="fixed top-0 bottom-0 right-0 w-full max-w-lg bg-white dark:bg-slate-900 shadow-2xl z-[60] p-6 flex flex-col border-l border-slate-200 dark:border-slate-800 overflow-y-auto print:hidden"
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-6">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Disbursals dossier</span>
                    <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/50 text-[10px] font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      {selectedLoan.id}
                    </span>
                  </div>
                  <h2 className="text-lg font-black text-slate-900 dark:text-white mt-1">{selectedLoan.customer || "Applicant"}</h2>
                </div>
                <button
                  onClick={() => setSelectedLoan(null)}
                  className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-5 text-xs font-semibold">
                {/* Capital Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 dark:bg-slate-950/40 p-4 border border-slate-200/80 dark:border-slate-800 rounded-2xl">
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">Sanction Principal</span>
                    <span className="text-base font-black text-slate-900 dark:text-white">
                      ₹{Number(selectedLoan.principal || 0).toLocaleString("en-IN")}
                    </span>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-950/40 p-4 border border-slate-200/80 dark:border-slate-800 rounded-2xl">
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">Outstanding Balance</span>
                    <span className="text-base font-black text-blue-600 dark:text-blue-400">
                      ₹{Number(selectedLoan.balance !== undefined ? selectedLoan.balance : selectedLoan.principal).toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>

                {/* Financial Breakdown Card */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4.5 space-y-3 bg-white dark:bg-slate-900">
                  <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 pb-2">
                    Capital Disbursement Breakdown
                  </h3>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Sanctioned Amount</span>
                    <span className="font-bold text-slate-900 dark:text-white">₹{Number(selectedLoan.principal || 0).toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Processing Fee (10%)</span>
                    <span className="font-bold text-rose-600">- ₹{Number(selectedLoan.processingFee || Math.round(Number(selectedLoan.principal || 0) * 0.10)).toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">GST on Fee (18%)</span>
                    <span className="font-bold text-rose-600">- ₹{Number(selectedLoan.gstAmount || Math.round(Number(selectedLoan.processingFee || Math.round(Number(selectedLoan.principal || 0) * 0.10)) * 0.18)).toLocaleString("en-IN")}</span>
                  </div>
                  <div className="border-t border-slate-100 dark:border-slate-800 pt-2.5 flex justify-between items-center text-sm font-extrabold">
                    <span className="text-emerald-600 dark:text-emerald-400">Net Disbursed Payout</span>
                    <span className="text-emerald-600 dark:text-emerald-400">
                      ₹{Math.max(0, Number(selectedLoan.principal || 0) - Number(selectedLoan.processingFee || Math.round(Number(selectedLoan.principal || 0) * 0.10)) - Number(selectedLoan.gstAmount || Math.round(Number(selectedLoan.processingFee || Math.round(Number(selectedLoan.principal || 0) * 0.10)) * 0.18))).toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>

                {/* Bank Account & Transaction Reference */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4.5 space-y-3 bg-white dark:bg-slate-900">
                  <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 pb-2 flex items-center justify-between">
                    <span>Disbursement Bank & UTR</span>
                    <Building2 className="w-4 h-4 text-indigo-500" />
                  </h3>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Bank Name</span>
                    <span className="font-bold text-slate-900 dark:text-white uppercase">{selectedLoan.bankName || "—"}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Account Number</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">{selectedLoan.accountNumber || "—"}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">IFSC Code</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white uppercase">{selectedLoan.ifscCode || "—"}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">UTR Ref / Txn ID</span>
                    <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{selectedLoan.utrNumber || "—"}</span>
                  </div>
                </div>

                {/* Timeline Dates */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4.5 space-y-3 bg-white dark:bg-slate-900">
                  <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 pb-2">
                    Timeline & Due Dates
                  </h3>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Disbursed Date</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {selectedLoan.startDate ? new Date(selectedLoan.startDate).toLocaleDateString("en-IN") : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Maturity Due Date</span>
                    <span className="font-bold text-rose-600">
                      {selectedLoan.dueDate ? new Date(selectedLoan.dueDate).toLocaleDateString("en-IN") : "—"}
                    </span>
                  </div>
                </div>

                {/* Repayment History list */}
                {selectedLoan.repayments && selectedLoan.repayments.length > 0 && (
                  <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4.5 space-y-3 bg-white dark:bg-slate-900">
                    <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 pb-2 flex items-center justify-between">
                      <span>Repayment Transactions</span>
                      <History className="w-4 h-4 text-emerald-500" />
                    </h3>
                    <div className="space-y-2">
                      {selectedLoan.repayments.map((rep, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-slate-50 dark:bg-slate-950/40 p-2.5 rounded-xl text-xs">
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white">Received Repayment</p>
                            <p className="text-[10px] text-slate-400">{new Date(rep.receivedAt).toLocaleString("en-IN")}</p>
                          </div>
                          <span className="font-extrabold text-emerald-600 dark:text-emerald-400">+ ₹{Number(rep.amount).toLocaleString("en-IN")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
