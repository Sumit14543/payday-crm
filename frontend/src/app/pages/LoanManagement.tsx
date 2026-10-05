import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Eye,
  IndianRupee,
  RefreshCw,
  Search,
  TrendingUp,
  Upload,
  X,
  Check,
  FileText,
  Download,
  Printer,
  ShieldCheck,
  RotateCcw,
} from "lucide-react";
import { NiceSelect } from "../components/ui/nice-select";
import { apiGet, apiPostForm } from "../lib/api";
import { useSmartPolling } from "../lib/useSmartPolling";
import { useAuth } from "../lib/auth";

type Loan = {
  id: string;
  customer: string | null;
  customerId: string;
  principal: number;
  interestRate: number;
  totalAmount: number;
  amountPaid: number;
  balance: number;
  startDate: string;
  disbursedDate?: string | null;
  dueDate: string;
  status: string;
  paymentStatus: string;
  nextPaymentDate: string | null;
  nextPaymentAmount: number;
  utrNumber?: string | null;
  accountNumber?: string | null;
  ifscCode?: string | null;
  bankName?: string | null;
  lastPaymentDate?: string | null;
};

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const PAGE_SIZE_OPTIONS = [
  { label: "8 / page", value: "8" },
  { label: "15 / page", value: "15" },
  { label: "25 / page", value: "25" },
  { label: "50 / page", value: "50" },
  { label: "100 / page", value: "100" },
];

const DATE_FILTER_OPTIONS = [
  { label: "All Due Dates", value: "all" },
  { label: "Due Today", value: "today" },
  { label: "Due This Week", value: "week" },
  { label: "Due This Month", value: "month" },
  { label: "Overdue (Past Due)", value: "overdue" },
];

function formatCurrency(value: number | null | undefined) {
  return money.format(Number(value || 0));
}

function toDateKey(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  } catch {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
}

function statusBadge(status: string) {
  const isPaidOff = status === "Paid Off" || status === "Closed";
  const isPartial = status === "Part Payment" || status === "Partial";
  const isActive = status === "Active";
  const isOverdue = status === "Overdue";

  const tone = isPaidOff
    ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-800"
    : isPartial
      ? "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-800"
      : isActive
        ? "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:ring-blue-800"
        : isOverdue
          ? "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/60 dark:text-red-300 dark:ring-red-800"
          : "bg-slate-50 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700";

  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${tone}`}>{status || "Unknown"}</span>;
}

function paymentStatusBadge(status: string) {
  const isRisk = status === "At Risk" || status === "Overdue";
  const isPaid = status === "Paid" || status === "Complete";
  const isPartial = status === "Partial" || status === "Part Payment";
  const Icon = isRisk ? AlertCircle : CheckCircle2;
  const tone = isRisk
    ? "text-red-600 dark:text-red-400"
    : isPaid
      ? "text-emerald-600 dark:text-emerald-400"
      : isPartial
        ? "text-amber-600 dark:text-amber-400"
        : "text-slate-600 dark:text-slate-400";

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${tone}`}>
      <Icon className="h-3.5 w-3.5" />
      {status || "Pending"}
    </span>
  );
}

export function LoanManagement() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "superadmin";

  const [loans, setLoans] = useState<Loan[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState("15");
  const [error, setError] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // Bulk upload states
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadResults, setUploadResults] = useState<{
    totalRows: number;
    successCount: number;
    failureCount: number;
    results: Array<{
      row: number;
      status: string;
      loanId?: string;
      customer?: string;
      amount?: number;
      reference: string;
      balance?: number;
      closed?: boolean;
      reason?: string;
    }>;
  } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
      setUploadError(null);
      setUploadResults(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setUploadError("Please select a file to upload.");
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadResults(null);

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const data = await apiPostForm<{
        success: boolean;
        totalRows: number;
        successCount: number;
        failureCount: number;
        results: Array<{
          row: number;
          status: string;
          loanId?: string;
          customer?: string;
          amount?: number;
          reference: string;
          balance?: number;
          closed?: boolean;
          reason?: string;
        }>;
      }>("/loans/bulk-repayment", formData);

      setUploadResults(data);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Failed to upload and process Excel file.");
    } finally {
      setIsUploading(false);
    }
  };

  const loadLoans = useCallback(async (signal: AbortSignal) => {
    try {
      const params = new URLSearchParams();
      if (searchTerm.trim()) params.set("search", searchTerm.trim());
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("limit", "1000"); // Load full portfolio
      const url = `/loans${params.toString() ? `?${params.toString()}` : ""}`;
      const data = await apiGet<Loan[]>(url, signal);
      setLoans(data);
      setError(null);
    } catch (err) {
      if (!signal.aborted) {
        setError(err instanceof Error ? err.message : "Unable to load loan portfolio");
      }
      throw err;
    }
  }, [searchTerm, statusFilter]);

  const { isRefreshing, lastUpdatedAt, refresh } = useSmartPolling(loadLoans, {
    enabled: true,
    intervalMs: 60_000,
  });

  // Export CSV
  const handleExportCsv = () => {
    if (!filteredLoans.length) {
      alert("No loans available to export with current filters.");
      return;
    }

    const headers = [
      "Loan ID",
      "Customer Name",
      "Customer ID",
      "Principal (Rs)",
      "Interest Rate (%)",
      "Total Amount (Rs)",
      "Amount Paid (Rs)",
      "Balance (Rs)",
      "Disbursed Date",
      "Due Date",
      "Payment Date",
      "Status",
      "Payment Status",
      "UTR Number",
      "Bank Account",
      "IFSC Code",
    ];

    const rows = filteredLoans.map((l) => [
      `"${l.id}"`,
      `"${(l.customer || "").replace(/"/g, '""')}"`,
      `"${l.customerId || ""}"`,
      l.principal || 0,
      l.interestRate || 0,
      l.totalAmount || 0,
      l.amountPaid || 0,
      l.balance || 0,
      `"${l.disbursedDate || l.startDate || ""}"`,
      `"${l.dueDate || ""}"`,
      `"${l.lastPaymentDate || ""}"`,
      `"${l.status || ""}"`,
      `"${l.paymentStatus || ""}"`,
      `"${l.utrNumber || ""}"`,
      `"${l.accountNumber || ""}"`,
      `"${l.ifscCode || ""}"`,
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `loan_portfolio_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Filtered Loans
  const filteredLoans = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const now = new Date();
    const todayKey = toDateKey(now) || "";
    const currentMonthKey = todayKey.slice(0, 7);

    // Compute start and end of week (Monday to Sunday) in IST
    const dayOfWeek = now.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const startOfWeekKey = toDateKey(monday) || "";
    const endOfWeekKey = toDateKey(sunday) || "";

    return loans.filter((loan) => {
      const dueKey = toDateKey(loan.dueDate) || "";
      const formattedDue = formatDate(loan.dueDate).toLowerCase();
      const formattedPaymentDate = formatDate(loan.lastPaymentDate).toLowerCase();

      const matchesSearch =
        !query ||
        loan.id.toLowerCase().includes(query) ||
        loan.customerId.toLowerCase().includes(query) ||
        (loan.customer || "").toLowerCase().includes(query) ||
        (loan.utrNumber || "").toLowerCase().includes(query) ||
        (loan.status || "").toLowerCase().includes(query) ||
        (loan.paymentStatus || "").toLowerCase().includes(query) ||
        dueKey.includes(query) ||
        formattedDue.includes(query) ||
        (loan.dueDate || "").toLowerCase().includes(query) ||
        (loan.startDate || "").toLowerCase().includes(query) ||
        (loan.lastPaymentDate || "").toLowerCase().includes(query) ||
        formattedPaymentDate.includes(query) ||
        String(loan.principal || "").includes(query) ||
        String(loan.totalAmount || "").includes(query) ||
        String(loan.balance || "").includes(query);

      // Part Payment loan: paid something, but balance > 0
      const isPartPaymentLoan = Number(loan.amountPaid || 0) > 0 && Number(loan.balance || 0) > 0;
      // Paid Off loan: balance MUST be <= 0 (cannot be paid off if balance > 0)
      const isPaidOffLoan = Number(loan.balance || 0) <= 0;

      let matchesStatus = true;
      if (statusFilter !== "all") {
        const sf = statusFilter.toLowerCase();
        if (sf === "paid off") {
          matchesStatus = isPaidOffLoan;
        } else if (sf === "part payment" || sf === "partial") {
          matchesStatus = isPartPaymentLoan;
        } else if (sf === "active") {
          matchesStatus = (loan.status || "").toLowerCase() === "active" && !isPaidOffLoan;
        } else if (sf === "overdue") {
          matchesStatus =
            ((loan.status || "").toLowerCase() === "overdue" ||
              (loan.paymentStatus || "").toLowerCase() === "overdue" ||
              (dueKey ? dueKey < todayKey : false)) &&
            !isPaidOffLoan;
        } else {
          matchesStatus = (loan.status || "").toLowerCase() === sf;
        }
      }

      let matchesDate = true;
      if (dateFilter !== "all" && loan.dueDate) {
        if (!dueKey) {
          matchesDate = false;
        } else if (dateFilter === "today") {
          matchesDate = dueKey === todayKey;
        } else if (dateFilter === "month") {
          matchesDate = dueKey.slice(0, 7) === currentMonthKey;
        } else if (dateFilter === "week") {
          matchesDate = dueKey >= startOfWeekKey && dueKey <= endOfWeekKey;
        } else if (dateFilter === "overdue") {
          matchesDate = dueKey < todayKey && !isPaidOffLoan;
        }
      }

      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [loans, searchTerm, statusFilter, dateFilter]);

  const totals = useMemo(() => {
    const todayKey = toDateKey(new Date()) || "";
    return {
      allLoans: loans.length,
      activeLoans: loans.filter((loan) => (loan.status === "Active" || !loan.status) && Number(loan.balance || 0) > 0).length,
      partPaymentLoans: loans.filter((loan) => Number(loan.amountPaid || 0) > 0 && Number(loan.balance || 0) > 0).length,
      paidOffLoans: loans.filter((loan) => Number(loan.balance || 0) <= 0).length,
      overdueLoans: loans.filter((loan) => {
        if (Number(loan.balance || 0) <= 0) return false;
        const dueKey = toDateKey(loan.dueDate);
        return (
          (loan.status || "").toLowerCase() === "overdue" ||
          (loan.paymentStatus || "").toLowerCase() === "overdue" ||
          (dueKey ? dueKey < todayKey : false)
        );
      }).length,
      totalOutstanding: loans.reduce((sum, loan) => sum + Number(loan.balance || 0), 0),
      totalCollected: loans.reduce((sum, loan) => sum + Number(loan.amountPaid || 0), 0),
    };
  }, [loans]);

  const rowsPerPage = Number(pageSize);
  const totalPages = Math.max(1, Math.ceil(filteredLoans.length / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = filteredLoans.length ? (safePage - 1) * rowsPerPage : 0;
  const endIndex = Math.min(startIndex + rowsPerPage, filteredLoans.length);
  const visibleLoans = filteredLoans.slice(startIndex, endIndex);

  const showInitialLoading = isRefreshing && !lastUpdatedAt && loans.length === 0;

  const resetFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setDateFilter("all");
    setCurrentPage(1);
  };

  const hasActiveFilters =
    searchTerm.trim() !== "" || statusFilter !== "all" || dateFilter !== "all";

  useEffect(() => {
    setCurrentPage(1);
  }, [pageSize, searchTerm, statusFilter, dateFilter]);

  return (
    <div className="w-full min-w-0 px-4 py-6 sm:px-6 lg:px-8 text-slate-900 dark:text-slate-100">
      {/* Success Notification Banner */}
      {actionSuccessMessage && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-200 animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{actionSuccessMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 dark:text-emerald-300 dark:hover:text-emerald-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header section */}
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">Loan Portfolio</p>
          <h2 className="mt-2 text-3xl font-bold text-gray-950 dark:text-white">Active Loan Management</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Real-time loan accounts, repayments, settlements, and portfolio monitoring.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="hidden sm:inline text-xs text-slate-500 dark:text-slate-400">
            Updated {lastUpdatedAt ? lastUpdatedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "--"}
          </span>
          <button
            type="button"
            onClick={() => refresh()}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 shadow-sm transition"
            disabled={isRefreshing}
            title="Refresh Portfolio"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>

          {/* Export CSV Button */}
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60 shadow-sm transition"
            title="Export loans to CSV spreadsheet"
          >
            <Download className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            Export CSV
          </button>

          {/* Print Table Button */}
          <button
            type="button"
            onClick={() => window.print()}
            className="hidden md:inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 shadow-sm transition"
            title="Print loan table"
          >
            <Printer className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            Print
          </button>

          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => {
                setIsUploadModalOpen(true);
                setSelectedFile(null);
                setUploadResults(null);
                setUploadError(null);
              }}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-3.5 text-sm font-semibold text-white hover:bg-emerald-700 transition shadow-sm"
            >
              <Upload className="h-4 w-4" />
              Bulk Repayments
            </button>
          )}
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Active Loans */}
        <div
          onClick={() => setStatusFilter("Active")}
          className="group relative cursor-pointer overflow-hidden rounded-2xl border border-blue-200/90 dark:border-blue-900/60 border-t-4 border-t-blue-500 border-l-4 border-l-blue-500 bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-white dark:from-blue-950/40 dark:via-slate-900 dark:to-slate-900 p-5 shadow-sm hover:shadow-md transition-all duration-200"
        >
          <div className="mb-2 flex items-center justify-between text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Active Loans
            <div className="p-2 rounded-xl bg-blue-100/80 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-700/60 group-hover:scale-105 transition">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <p className="text-3xl font-black text-blue-700 dark:text-blue-400">{totals.activeLoans}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Running repayment portfolios</p>
        </div>

        {/* Total Outstanding */}
        <div className="relative overflow-hidden rounded-2xl border border-purple-200/90 dark:border-purple-900/60 border-t-4 border-t-purple-500 border-l-4 border-l-purple-500 bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-white dark:from-purple-950/40 dark:via-slate-900 dark:to-slate-900 p-5 shadow-sm hover:shadow-md transition-all duration-200">
          <div className="mb-2 flex items-center justify-between text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Outstanding Due
            <div className="p-2 rounded-xl bg-purple-100/80 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 border border-purple-200 dark:border-purple-700/60">
              <IndianRupee className="h-4 w-4" />
            </div>
          </div>
          <p className="text-3xl font-black text-purple-700 dark:text-purple-400">{formatCurrency(totals.totalOutstanding)}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Total balance awaiting collection</p>
        </div>

        {/* Total Collected / Paid Off */}
        <div
          onClick={() => setStatusFilter("Paid Off")}
          className="group relative cursor-pointer overflow-hidden rounded-2xl border border-emerald-200/90 dark:border-emerald-900/60 border-t-4 border-t-emerald-500 border-l-4 border-l-emerald-500 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-white dark:from-emerald-950/40 dark:via-slate-900 dark:to-slate-900 p-5 shadow-sm hover:shadow-md transition-all duration-200"
        >
          <div className="mb-2 flex items-center justify-between text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Collected / Settled
            <div className="p-2 rounded-xl bg-emerald-100/80 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700/60 group-hover:scale-105 transition">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <p className="text-3xl font-black text-emerald-700 dark:text-emerald-400">{formatCurrency(totals.totalCollected)}</p>
          <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
            {totals.paidOffLoans} loans fully settled (Paid Off)
          </p>
        </div>

        {/* Overdue Loans */}
        <div
          onClick={() => setStatusFilter("Overdue")}
          className="group relative cursor-pointer overflow-hidden rounded-2xl border border-rose-200/90 dark:border-rose-900/60 border-t-4 border-t-rose-500 border-l-4 border-l-rose-500 bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-white dark:from-rose-950/40 dark:via-slate-900 dark:to-slate-900 p-5 shadow-sm hover:shadow-md transition-all duration-200"
        >
          <div className="mb-2 flex items-center justify-between text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Overdue Loans
            <div className="p-2 rounded-xl bg-rose-100/80 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-700/60 group-hover:scale-105 transition">
              <AlertCircle className="h-4 w-4" />
            </div>
          </div>
          <p className="text-3xl font-black text-rose-700 dark:text-rose-400">{totals.overdueLoans}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Past due date requiring recovery</p>
        </div>
      </div>

      {/* Filter and Search Panel */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {/* Quick Status Tabs */}
        <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mr-1">
            Status:
          </span>
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              statusFilter === "all"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            All Loans
            <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${statusFilter === "all" ? "bg-white/20 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300"}`}>
              {totals.allLoans}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("Active")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              statusFilter === "Active"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/50 dark:text-blue-300 dark:hover:bg-blue-900/60"
            }`}
          >
            Active
            <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${statusFilter === "Active" ? "bg-white/20 text-white" : "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200"}`}>
              {totals.activeLoans}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("Part Payment")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              statusFilter === "Part Payment"
                ? "bg-amber-600 text-white shadow-sm"
                : "bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-300 dark:hover:bg-amber-900/60"
            }`}
          >
            Part Payment
            <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${statusFilter === "Part Payment" ? "bg-white/20 text-white" : "bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200"}`}>
              {totals.partPaymentLoans}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("Paid Off")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              statusFilter === "Paid Off"
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Paid Off
            <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${statusFilter === "Paid Off" ? "bg-white/20 text-white" : "bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200"}`}>
              {totals.paidOffLoans}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("Overdue")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              statusFilter === "Overdue"
                ? "bg-rose-600 text-white shadow-sm"
                : "bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/50 dark:text-rose-300 dark:hover:bg-rose-900/60"
            }`}
          >
            Overdue
            <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${statusFilter === "Overdue" ? "bg-white/20 text-white" : "bg-rose-100 dark:bg-rose-900 text-rose-800 dark:text-rose-200"}`}>
              {totals.overdueLoans}
            </span>
          </button>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Filters
            </button>
          )}
        </div>

        {/* Search & Due Date Filter Bar */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          {/* Search box */}
          <div className="relative md:col-span-8 lg:col-span-9">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Search by customer, loan ID, phone, PAN, UTR..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 pl-9 pr-9 text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:ring-blue-900/40"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Date Filter Dropdown */}
          <div className="md:col-span-4 lg:col-span-3">
            <NiceSelect
              ariaLabel="Filter by due date"
              value={dateFilter}
              onValueChange={setDateFilter}
              className="w-full"
              options={DATE_FILTER_OPTIONS}
            />
          </div>
        </div>
      </div>

      {/* Loan Portfolio Table Section */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {filteredLoans.length ? (
              <span>
                Showing <strong className="text-slate-900 dark:text-white">{startIndex + 1}-{endIndex}</strong> of{" "}
                <strong className="text-slate-900 dark:text-white">{filteredLoans.length}</strong> loans
              </span>
            ) : (
              "No matching loans found"
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!filteredLoans.length}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-xs font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60 shadow-sm transition"
              title="Export current table loans to CSV spreadsheet"
            >
              <Download className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              Export CSV
            </button>
            <NiceSelect
              ariaLabel="Loan rows per page"
              value={pageSize}
              onValueChange={setPageSize}
              className="w-32"
              options={PAGE_SIZE_OPTIONS}
            />
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {loans.length} total in system
            </span>
          </div>
        </div>

        {error && (
          <div className="m-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800/80 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
            <thead className="bg-slate-50 dark:bg-slate-800/70">
              <tr>
                {["Loan ID", "Customer", "Principal", "Total Due", "Paid", "Balance", "Due Date", "Payment Date", "Status", "Payment", "Actions"].map(
                  (heading) => (
                    <th
                      key={heading}
                      className="px-5 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"
                    >
                      {heading}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800/80 dark:bg-slate-900">
              {showInitialLoading ? (
                <tr>
                  <td colSpan={11} className="px-5 py-16 text-center text-sm text-slate-500 dark:text-slate-400">
                    <RefreshCw className="mx-auto mb-2 h-6 w-6 animate-spin text-blue-600" />
                    Loading loan portfolio...
                  </td>
                </tr>
              ) : filteredLoans.length ? (
                visibleLoans.map((loan) => {
                  const isSettled = Number(loan.balance || 0) <= 0;

                  return (
                    <tr key={loan.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                      {/* Loan ID & UTR */}
                      <td className="whitespace-nowrap px-5 py-4">
                        <div className="text-sm font-bold text-slate-950 dark:text-white">{loan.id}</div>
                        {loan.utrNumber && (
                          <div className="font-mono text-xs text-slate-500 dark:text-slate-400" title="Disbursement UTR">
                            UTR: {loan.utrNumber}
                          </div>
                        )}
                      </td>

                      {/* Customer */}
                      <td className="whitespace-nowrap px-5 py-4">
                        <div className="text-sm font-semibold text-slate-950 dark:text-slate-100">
                          {loan.customer || "Customer not linked"}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{loan.customerId}</div>
                      </td>

                      {/* Principal */}
                      <td className="whitespace-nowrap px-5 py-4 text-sm font-medium text-slate-700 dark:text-slate-300">
                        {formatCurrency(loan.principal)}
                      </td>

                      {/* Total Amount */}
                      <td className="whitespace-nowrap px-5 py-4 text-sm font-bold text-slate-950 dark:text-white">
                        {formatCurrency(loan.totalAmount)}
                      </td>

                      {/* Amount Paid */}
                      <td className="whitespace-nowrap px-5 py-4 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(loan.amountPaid)}
                      </td>

                      {/* Balance */}
                      <td className="whitespace-nowrap px-5 py-4 text-sm font-black">
                        {isSettled ? (
                          <span className="text-emerald-600 dark:text-emerald-400">₹0 (Cleared)</span>
                        ) : (
                          <span className="text-purple-700 dark:text-purple-400">{formatCurrency(loan.balance)}</span>
                        )}
                      </td>

                      {/* Due Date */}
                      <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-700 dark:text-slate-300">
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                          {formatDate(loan.dueDate)}
                        </span>
                      </td>

                      {/* Payment Date */}
                      <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-700 dark:text-slate-300">
                        {loan.amountPaid > 0 || loan.lastPaymentDate ? (
                          <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
                            <Calendar className="h-4 w-4 text-emerald-500 shrink-0" />
                            {formatDate(loan.lastPaymentDate)}
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500 text-xs">-</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="whitespace-nowrap px-5 py-4">{statusBadge(loan.status)}</td>

                      {/* Payment Status */}
                      <td className="whitespace-nowrap px-5 py-4">
                        {paymentStatusBadge(
                          Number(loan.balance || 0) <= 0
                            ? "Paid"
                            : Number(loan.amountPaid || 0) > 0
                              ? "Partial"
                              : loan.paymentStatus || "Pending"
                        )}
                      </td>

                      {/* Action buttons */}
                      <td className="whitespace-nowrap px-5 py-4 text-sm">
                        <div className="flex items-center gap-2">
                          {/* View Details */}
                          <Link
                            to={`/loan-management/${encodeURIComponent(loan.id)}`}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-800 dark:text-blue-400 dark:hover:bg-slate-700 transition"
                            title="View Full Loan Profile"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={11} className="px-5 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                    No matching loans found in this filter range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination bar */}
        {filteredLoans.length > rowsPerPage && (
          <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Page {safePage} of {totalPages}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage(1)}
                disabled={safePage === 1}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                First
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={safePage === 1}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={safePage === totalPages}
                className="h-9 rounded-lg bg-blue-600 px-3.5 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage(totalPages)}
                disabled={safePage === totalPages}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Last
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bulk Repayment Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 transition-all">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-slate-800/60">
              <div>
                <h3 className="text-lg font-bold text-slate-950 dark:text-white">Bulk Repayment Upload</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Superadmin Access Only</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsUploadModalOpen(false);
                  refresh();
                }}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="max-h-[60vh] overflow-y-auto p-6">
              {uploadError && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-start gap-2 dark:border-red-800 dark:bg-red-950/60 dark:text-red-300">
                  <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
                  <div>{uploadError}</div>
                </div>
              )}

              {!isUploading && !uploadResults && (
                <div className="space-y-4">
                  <div className="rounded-lg bg-blue-50 border border-blue-100 p-4 text-xs text-blue-800 dark:bg-blue-950/40 dark:border-blue-900/60 dark:text-blue-300 space-y-2">
                    <p className="font-bold">Instructions & Column Mapping Guide:</p>
                    <p>Excel or CSV sheet must contain the following columns (names can have spaces or be case-insensitive):</p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li><strong>Identifier (One of these):</strong> <code>Loan ID</code>, <code>Phone</code>, or <code>PAN</code></li>
                      <li><strong>Amount:</strong> <code>Amount</code> (e.g. 5000)</li>
                      <li><strong>Reference (Required):</strong> <code>Reference</code> or <code>UTR</code> (Must be unique)</li>
                      <li><strong>Optional:</strong> <code>Date</code>, <code>Method</code>, <code>Notes</code></li>
                    </ul>
                  </div>

                  {/* Dropzone */}
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl px-6 py-10 cursor-pointer hover:border-blue-500 hover:bg-blue-50/20 dark:border-slate-700 dark:hover:border-blue-500 dark:hover:bg-slate-800/50 transition group">
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <FileText className="h-10 w-10 text-slate-400 group-hover:text-blue-500 transition mb-3" />
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">
                      {selectedFile ? selectedFile.name : "Click to select or drag Excel/CSV file"}
                    </span>
                    <span className="text-xs text-slate-400 mt-1">
                      {selectedFile ? `${(selectedFile.size / 1024).toFixed(1)} KB` : "Supports .xlsx, .xls, .csv"}
                    </span>
                  </label>
                </div>
              )}

              {isUploading && (
                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                  <RefreshCw className="h-8 w-8 text-blue-600 animate-spin" />
                  <p className="text-sm font-semibold text-slate-950 dark:text-white">Processing repayments...</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Please do not close this window</p>
                </div>
              )}

              {uploadResults && (
                <div className="space-y-4">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="rounded-lg bg-slate-50 p-4 text-center border border-slate-100 dark:bg-slate-800/60 dark:border-slate-700">
                      <p className="text-xs text-slate-500 uppercase font-semibold">Total Rows</p>
                      <p className="text-2xl font-bold text-slate-950 dark:text-white mt-1">{uploadResults.totalRows}</p>
                    </div>
                    <div className="rounded-lg bg-emerald-50 p-4 text-center border border-emerald-100 dark:bg-emerald-950/40 dark:border-emerald-800">
                      <p className="text-xs text-emerald-600 uppercase font-semibold">Success</p>
                      <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">{uploadResults.successCount}</p>
                    </div>
                    <div className="rounded-lg bg-red-50 p-4 text-center border border-red-100 dark:bg-red-950/40 dark:border-red-800">
                      <p className="text-xs text-red-600 uppercase font-semibold">Failures</p>
                      <p className="text-2xl font-bold text-red-700 dark:text-red-400 mt-1">{uploadResults.failureCount}</p>
                    </div>
                  </div>

                  {/* Details List */}
                  <div>
                    <h4 className="text-sm font-bold text-slate-950 dark:text-white mb-2">Processed Log Details</h4>
                    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 max-h-[30vh] overflow-y-auto">
                      <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                        <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Row</th>
                            <th className="px-4 py-2 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">UTR Reference</th>
                            <th className="px-4 py-2 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Status</th>
                            <th className="px-4 py-2 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Notes / Errors</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-100 dark:bg-slate-900 dark:divide-slate-800 text-xs">
                          {uploadResults.results.map((r, idx) => (
                            <tr key={idx} className={r.status === "Success" ? "bg-emerald-50/10" : "bg-red-50/10"}>
                              <td className="px-4 py-2 font-medium text-slate-900 dark:text-white">{r.row}</td>
                              <td className="px-4 py-2 font-mono text-slate-600 dark:text-slate-300">{r.reference}</td>
                              <td className="px-4 py-2">
                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                  r.status === "Success" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                }`}>
                                  {r.status === "Success" ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                                  {r.status}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-slate-700 dark:text-slate-300">
                                {r.status === "Success" ? (
                                  <span>
                                    Loan <strong>{r.loanId}</strong> ({r.customer}) credited. {r.closed ? <strong className="text-emerald-700 dark:text-emerald-400">(Closed & Cleared for Reloan)</strong> : `Balance: ₹${r.balance}`}
                                  </span>
                                ) : (
                                  <span className="text-red-700 dark:text-red-400 font-medium">{r.reason}</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-slate-800/60">
              {!uploadResults ? (
                <>
                  <button
                    type="button"
                    onClick={() => setIsUploadModalOpen(false)}
                    className="h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    disabled={isUploading}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleUpload}
                    className="h-10 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    disabled={!selectedFile || isUploading}
                  >
                    Upload & Apply
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsUploadModalOpen(false);
                    refresh();
                  }}
                  className="h-10 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Close & Refresh List
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
