import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, Calendar, CheckCircle2, Eye, IndianRupee, RefreshCw, Search, TrendingUp, Upload, X, Check, FileText } from "lucide-react";
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
];

function formatCurrency(value: number | null | undefined) {
  return money.format(Number(value || 0));
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function statusBadge(status: string) {
  const tone =
    status === "Active"
      ? "bg-blue-50 text-blue-700 ring-blue-200"
      : status === "Paid Off"
        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
        : status === "Overdue"
          ? "bg-red-50 text-red-700 ring-red-200"
          : "bg-slate-50 text-slate-700 ring-slate-200";

  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${tone}`}>{status || "Unknown"}</span>;
}

function paymentStatusBadge(status: string) {
  const isRisk = status === "At Risk" || status === "Overdue";
  const isComplete = status === "Complete";
  const Icon = isRisk ? AlertCircle : CheckCircle2;
  const tone = isRisk ? "text-red-600" : isComplete ? "text-slate-600" : "text-emerald-600";

  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${tone}`}>
      <Icon className="h-4 w-4" />
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
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState("8");
  const [error, setError] = useState<string | null>(null);

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
      params.set("limit", "100");
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

  const statusOptions = useMemo(() => {
    const statuses = Array.from(
      new Set([
        "Active",
        "Overdue",
        "Paid Off",
        ...loans.map((loan) => loan.status).filter(Boolean),
        ...loans.map((loan) => loan.paymentStatus).filter(Boolean),
      ])
    ).sort();
    return [{ label: "All Status", value: "all" }, ...statuses.map((status) => ({ label: status, value: status }))];
  }, [loans]);

  const filteredLoans = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return loans.filter((loan) => {
      const matchesSearch =
        !query ||
        loan.id.toLowerCase().includes(query) ||
        loan.customerId.toLowerCase().includes(query) ||
        (loan.customer || "").toLowerCase().includes(query) ||
        (loan.utrNumber || "").toLowerCase().includes(query) ||
        (loan.status || "").toLowerCase().includes(query) ||
        (loan.paymentStatus || "").toLowerCase().includes(query) ||
        (loan.dueDate || "").toLowerCase().includes(query) ||
        (loan.startDate || "").toLowerCase().includes(query) ||
        String(loan.principal || "").includes(query) ||
        String(loan.totalAmount || "").includes(query) ||
        String(loan.balance || "").includes(query);

      const matchesStatus =
        statusFilter === "all" ||
        (loan.status || "").toLowerCase() === statusFilter.toLowerCase() ||
        (loan.paymentStatus || "").toLowerCase() === statusFilter.toLowerCase();

      return matchesSearch && matchesStatus;
    });
  }, [loans, searchTerm, statusFilter]);

  const totals = useMemo(
    () => ({
      activeLoans: loans.filter((loan) => loan.status === "Active").length,
      totalOutstanding: loans.reduce((sum, loan) => sum + Number(loan.balance || 0), 0),
      totalCollected: loans.reduce((sum, loan) => sum + Number(loan.amountPaid || 0), 0),
      overdueLoans: loans.filter((loan) => loan.status === "Overdue" || loan.paymentStatus === "Overdue").length,
    }),
    [loans]
  );
  const rowsPerPage = Number(pageSize);
  const totalPages = Math.max(1, Math.ceil(filteredLoans.length / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = filteredLoans.length ? (safePage - 1) * rowsPerPage : 0;
  const endIndex = Math.min(startIndex + rowsPerPage, filteredLoans.length);
  const visibleLoans = filteredLoans.slice(startIndex, endIndex);

  const showInitialLoading = isRefreshing && !lastUpdatedAt && loans.length === 0;

  useEffect(() => {
    setCurrentPage(1);
  }, [pageSize, searchTerm, statusFilter]);

  return (
    <div className="w-full min-w-0 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Loan Portfolio</p>
          <h2 className="mt-2 text-3xl font-bold text-gray-950">Active Loan Management</h2>
          <p className="mt-1 text-sm text-slate-600">Loans activated after accountant fund transfer submission.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            Last updated {lastUpdatedAt ? lastUpdatedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "--"}
          </span>
          <button
            type="button"
            onClick={() => {
              refresh();
            }}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
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
              className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-600 px-3.5 text-sm font-semibold text-white hover:bg-emerald-700 transition shadow-sm"
            >
              <Upload className="h-4 w-4" />
              Bulk Repayments
            </button>
          )}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="relative overflow-hidden rounded-2xl border border-blue-200/90 dark:border-blue-900/60 border-t-4 border-t-blue-500 border-l-4 border-l-blue-500 bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-white dark:from-blue-950/40 dark:via-slate-900 dark:to-slate-900 p-5 shadow-sm hover:shadow-md transition-all duration-200">
          <div className="mb-2 flex items-center justify-between text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Active loans
            <div className="p-2 rounded-xl bg-blue-100/80 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-700/60">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <p className="text-3xl font-black text-blue-700 dark:text-blue-400">{totals.activeLoans}</p>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-purple-200/90 dark:border-purple-900/60 border-t-4 border-t-purple-500 border-l-4 border-l-purple-500 bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-white dark:from-purple-950/40 dark:via-slate-900 dark:to-slate-900 p-5 shadow-sm hover:shadow-md transition-all duration-200">
          <div className="mb-2 flex items-center justify-between text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Outstanding
            <div className="p-2 rounded-xl bg-purple-100/80 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 border border-purple-200 dark:border-purple-700/60">
              <IndianRupee className="h-4 w-4" />
            </div>
          </div>
          <p className="text-3xl font-black text-purple-700 dark:text-purple-400">{formatCurrency(totals.totalOutstanding)}</p>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-emerald-200/90 dark:border-emerald-900/60 border-t-4 border-t-emerald-500 border-l-4 border-l-emerald-500 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-white dark:from-emerald-950/40 dark:via-slate-900 dark:to-slate-900 p-5 shadow-sm hover:shadow-md transition-all duration-200">
          <div className="mb-2 flex items-center justify-between text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Collected
            <div className="p-2 rounded-xl bg-emerald-100/80 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700/60">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <p className="text-3xl font-black text-emerald-700 dark:text-emerald-400">{formatCurrency(totals.totalCollected)}</p>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-rose-200/90 dark:border-rose-900/60 border-t-4 border-t-rose-500 border-l-4 border-l-rose-500 bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-white dark:from-rose-950/40 dark:via-slate-900 dark:to-slate-900 p-5 shadow-sm hover:shadow-md transition-all duration-200">
          <div className="mb-2 flex items-center justify-between text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Overdue
            <div className="p-2 rounded-xl bg-rose-100/80 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-700/60">
              <AlertCircle className="h-4 w-4" />
            </div>
          </div>
          <p className="text-3xl font-black text-rose-700 dark:text-rose-400">{totals.overdueLoans}</p>
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search customer, loan ID, customer ID, UTR, amount, status..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 pl-9 pr-9 text-sm font-medium text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:ring-blue-900/40"
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
          <NiceSelect
            ariaLabel="Filter by loan status"
            value={statusFilter}
            onValueChange={setStatusFilter}
            className="min-w-44"
            options={statusOptions}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-500">
            {filteredLoans.length ? `Showing ${startIndex + 1}-${endIndex} of ${filteredLoans.length} loans` : "No loans to show"}
          </div>
          <div className="flex items-center gap-2">
            <NiceSelect
              ariaLabel="Loan rows per page"
              value={pageSize}
              onValueChange={setPageSize}
              className="w-32"
              options={PAGE_SIZE_OPTIONS}
            />
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
              {loans.length} total
            </span>
          </div>
        </div>
        {error && <div className="m-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                {["Loan ID", "Customer", "Principal", "Total Amount", "Paid", "Balance", "Due Date", "Status", "Payment", "Action"].map(
                  (heading) => (
                    <th key={heading} className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                      {heading}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {showInitialLoading ? (
                <tr>
                  <td colSpan={10} className="px-5 py-12 text-center text-sm text-slate-500">
                    Loading loan portfolio...
                  </td>
                </tr>
              ) : filteredLoans.length ? (
                visibleLoans.map((loan) => (
                  <tr key={loan.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-5 py-4">
                      <div className="text-sm font-semibold text-slate-950">{loan.id}</div>
                      {loan.utrNumber && <div className="font-mono text-xs text-slate-500">UTR: {loan.utrNumber}</div>}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4">
                      <div className="text-sm font-medium text-slate-950">{loan.customer || "Customer not linked"}</div>
                      <div className="text-xs text-slate-500">{loan.customerId}</div>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-700">{formatCurrency(loan.principal)}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm font-semibold text-slate-950">{formatCurrency(loan.totalAmount)}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm font-semibold text-emerald-700">{formatCurrency(loan.amountPaid)}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm font-semibold text-slate-950">{formatCurrency(loan.balance)}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-700">
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="h-4 w-4 text-slate-400" />
                        {formatDate(loan.dueDate)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4">{statusBadge(loan.status)}</td>
                    <td className="whitespace-nowrap px-5 py-4">{paymentStatusBadge(loan.paymentStatus)}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm">
                      <Link to={`/loan-management/${encodeURIComponent(loan.id)}`} className="inline-flex items-center gap-1.5 font-semibold text-blue-700 hover:text-blue-900">
                        <Eye className="h-4 w-4" />
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="px-5 py-12 text-center text-sm text-slate-500">
                    No real loans found. Loans appear here after fund transfer is submitted from Accountant Panel.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filteredLoans.length > rowsPerPage && (
          <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <span>Page {safePage} of {totalPages}</span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage(1)}
                disabled={safePage === 1}
                className="h-9 rounded-md border border-slate-200 px-3 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                First
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={safePage === 1}
                className="h-9 rounded-md border border-slate-200 px-3 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={safePage === totalPages}
                className="h-9 rounded-md bg-blue-600 px-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage(totalPages)}
                disabled={safePage === totalPages}
                className="h-9 rounded-md border border-slate-200 px-3 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
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
          <div className="relative w-full max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl transition-all animate-scale-up">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-slate-950">Bulk Repayment Upload</h3>
                <p className="text-xs text-slate-500">Superadmin Access Only</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsUploadModalOpen(false);
                  refresh();
                }}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="max-h-[60vh] overflow-y-auto p-6">
              {uploadError && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
                  <div>{uploadError}</div>
                </div>
              )}

              {!isUploading && !uploadResults && (
                <div className="space-y-4">
                  <div className="rounded-lg bg-blue-50 border border-blue-100 p-4 text-xs text-blue-800 space-y-2">
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
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl px-6 py-10 cursor-pointer hover:border-blue-500 hover:bg-blue-50/20 transition group">
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <FileText className="h-10 w-10 text-slate-400 group-hover:text-blue-500 transition mb-3" />
                    <span className="text-sm font-semibold text-slate-900">
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
                  <p className="text-sm font-semibold text-slate-950">Processing repayments...</p>
                  <p className="text-xs text-slate-500">Please do not close this window</p>
                </div>
              )}

              {uploadResults && (
                <div className="space-y-4">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="rounded-lg bg-slate-50 p-4 text-center border border-slate-100">
                      <p className="text-xs text-slate-500 uppercase font-semibold">Total Rows</p>
                      <p className="text-2xl font-bold text-slate-950 mt-1">{uploadResults.totalRows}</p>
                    </div>
                    <div className="rounded-lg bg-emerald-50 p-4 text-center border border-emerald-100">
                      <p className="text-xs text-emerald-600 uppercase font-semibold">Success</p>
                      <p className="text-2xl font-bold text-emerald-700 mt-1">{uploadResults.successCount}</p>
                    </div>
                    <div className="rounded-lg bg-red-50 p-4 text-center border border-red-100">
                      <p className="text-xs text-red-600 uppercase font-semibold">Failures</p>
                      <p className="text-2xl font-bold text-red-700 mt-1">{uploadResults.failureCount}</p>
                    </div>
                  </div>

                  {/* Details List */}
                  <div>
                    <h4 className="text-sm font-bold text-slate-950 mb-2">Processed Log Details</h4>
                    <div className="overflow-hidden rounded-lg border border-slate-200 max-h-[30vh] overflow-y-auto">
                      <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-slate-50 sticky top-0">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-bold text-slate-500 uppercase">Row</th>
                            <th className="px-4 py-2 text-left text-xs font-bold text-slate-500 uppercase">UTR Reference</th>
                            <th className="px-4 py-2 text-left text-xs font-bold text-slate-500 uppercase">Status</th>
                            <th className="px-4 py-2 text-left text-xs font-bold text-slate-500 uppercase">Notes / Errors</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-100 text-xs">
                          {uploadResults.results.map((r, idx) => (
                            <tr key={idx} className={r.status === "Success" ? "bg-emerald-50/10" : "bg-red-50/10"}>
                              <td className="px-4 py-2 font-medium text-slate-900">{r.row}</td>
                              <td className="px-4 py-2 font-mono text-slate-600">{r.reference}</td>
                              <td className="px-4 py-2">
                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                  r.status === "Success" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                                }`}>
                                  {r.status === "Success" ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                                  {r.status}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-slate-700">
                                {r.status === "Success" ? (
                                  <span>
                                    Loan <strong>{r.loanId}</strong> ({r.customer}) credited. {r.closed ? <strong className="text-emerald-700">(Closed & Cleared for Reloan)</strong> : `Balance: ₹${r.balance}`}
                                  </span>
                                ) : (
                                  <span className="text-red-700 font-medium">{r.reason}</span>
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
            <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
              {!uploadResults ? (
                <>
                  <button
                    type="button"
                    onClick={() => setIsUploadModalOpen(false)}
                    className="h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
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
