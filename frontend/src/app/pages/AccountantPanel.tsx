import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Banknote, BarChart3, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock, Copy, FileText, Link as LinkIcon, ReceiptText, RefreshCw, Search, ShieldCheck, WalletCards, X } from "lucide-react";
import { AppTooltip } from "../components/ui/app-tooltip";
import { NiceSelect } from "../components/ui/nice-select";
import { EmptyState, MetricCard } from "../components/crm/DashboardPrimitives";
import { PageLoading } from "../components/PageLoading";
import { apiGet, apiPost } from "../lib/api";
import { useSmartPolling } from "../lib/useSmartPolling";

type AccountingLead = {
  id: string;
  rawId?: string;
  customerName: string;
  loanId: string;
  agreementNumber: string;
  esignDate: string | null;
  panNumber: string;
  phone: string;
  loanAmount: number;
  processingFee: number;
  gstAmount: number;
  disbursementAmount: number;
  repaymentAmount: number;
  tenureDays?: number;
  dueDate: string | null;
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  status: string;
};

type TransferForm = {
  paymentProofUrl: string;
  transactionId: string;
  transferType: "IMPS" | "NEFT" | "UPI";
  disbursementDate: string;
  dueDate: string;
  tenureDays: string;
};

type AccountingQueueResponse = {
  items: AccountingLead[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  stats: {
    bankReadyCount: number;
    feeTotal: number;
    totalDisbursement: number;
    totalLoanAmount: number;
    totalQueue: number;
  };
};

type RecentTransferResponse = {
  items: RecentTransfer[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  stats?: {
    dueSoonCount: number;
    overdueCount: number;
  };
};

type TransferResponse = {
  lead: { id: string; status: string };
  loan: { id: string; status: string; start_date?: string; startDate?: string; due_date?: string; dueDate?: string };
  payment: { id: number; loanId: string; transactionId: string; transferType: string; disbursedAt: string };
  nextStep?: {
    loanId: string;
    loanStatus: string;
    repaymentStatus: string;
    repaymentAmount: number;
    dueDate: string | null;
    nextPaymentDate: string | null;
  };
};

type RecentTransfer = {
  id: number;
  leadId: string;
  applicationId: string;
  customerName: string;
  phone: string;
  loanId: string;
  agreementNumber: string;
  disbursementAmount: number;
  repaymentAmount: number;
  balance: number;
  transferType: string;
  transactionId: string;
  paymentStatus: string;
  loanStatus: string;
  repaymentStatus: string;
  paidBy: string;
  disbursedAt: string | null;
  dueDate: string | null;
  nextPaymentDate: string | null;
  accountNumber?: string;
  bankName?: string;
  ifscCode?: string;
};

type PaymentLinkResponse = {
  id: number;
  loanId: string;
  amount: number;
  gatewayLinkId: string;
  linkUrl: string;
  status: string;
  expiresAt: string | null;
};

type InterestReportRow = Record<string, string | number | null | undefined>;

type InterestReportsResponse = {
  filters: {
    from: string;
    to: string;
  };
  reports: {
    accruedInterest: InterestReportRow[];
    accruedVsCollected: InterestReportRow[];
    bookedVsReceived: InterestReportRow[];
    customerMonthWise: InterestReportRow[];
    dayWise: InterestReportRow[];
    interestRealization: InterestReportRow[];
    interestReceivable: InterestReportRow[];
    monthWise: InterestReportRow[];
  };
  summary: {
    accruedInterest: number;
    bookedInterest: number;
    bookedReceiptRate: number;
    collectedInterest: number;
    collectionRate: number;
    interestReceivable: number;
    pendingBookedInterest: number;
    rangeAccruedInterest: number;
    rangeBookedInterest: number;
    rangeInterestReceived: number;
  };
};

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  currency: "INR",
  maximumFractionDigits: 0,
  style: "currency",
});

const formatCurrency = (value: number | null | undefined) => (
  value === null || value === undefined ? "Not provided" : currencyFormatter.format(Number(value || 0))
);

const formatDate = (value?: string | null) => {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
};

const formatDateOnly = (value?: string | null) => {
  if (!value) return "Not available";
  const normalizedValue = String(value).trim();
  if (normalizedValue.includes("T") || normalizedValue.includes("Z")) {
    const date = new Date(normalizedValue);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString("en-IN", { dateStyle: "medium" });
    }
  }
  const dateOnlyMatch = normalizedValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const date = dateOnlyMatch
    ? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]))
    : new Date(normalizedValue);
  if (Number.isNaN(date.getTime())) return normalizedValue;
  return date.toLocaleDateString("en-IN", { dateStyle: "medium" });
};

const getTodayIsoDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addDaysToIsoDate = (dateStr: string, days: number) => {
  if (!dateStr) return "";
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const d = new Date(year, month - 1, day);
    d.setDate(d.getDate() + days);
    const ry = d.getFullYear();
    const rm = String(d.getMonth() + 1).padStart(2, "0");
    const rd = String(d.getDate()).padStart(2, "0");
    return `${ry}-${rm}-${rd}`;
  }
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const calculateDaysDifference = (fromIsoDate: string, toIsoDate: string): number => {
  if (!fromIsoDate || !toIsoDate) return 0;
  const fromMatch = fromIsoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const toMatch = toIsoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!fromMatch || !toMatch) return 0;
  const fromDate = new Date(Number(fromMatch[1]), Number(fromMatch[2]) - 1, Number(fromMatch[3]));
  const toDate = new Date(Number(toMatch[1]), Number(toMatch[2]) - 1, Number(toMatch[3]));
  const diffMs = toDate.getTime() - fromDate.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
};

const formatUpdatedTime = (value: Date | null) => (
  value ? value.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "Not yet"
);

const repaymentDisplayStatus = (transfer: RecentTransfer) => {
  const status = String(transfer.repaymentStatus || "").trim();
  if (status && status.toLowerCase() !== "on time") return status;

  const balance = Number(transfer.balance || 0);
  if (balance <= 0) return "Paid";

  const dueInDays = daysUntil(transfer.dueDate || transfer.nextPaymentDate);
  if (dueInDays === null) return "";
  if (dueInDays < 0) return "Overdue";
  if (dueInDays === 0) return "Due Today";
  return "Pending";
};

const daysUntil = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86400000);
};

const PAGE_SIZE = 10;
const RECENT_PAGE_SIZE = 6;
const INTEREST_PAGE_SIZE = 10;

const reportOptions = [
  { key: "accruedInterest", label: "Accrued Interest Report" },
  { key: "interestReceivable", label: "Interest Receivable Report" },
  { key: "interestRealization", label: "Interest Realization Report" },
  { key: "accruedVsCollected", label: "Accrued vs Collected Interest" },
  { key: "bookedVsReceived", label: "Booked vs Received Interest" },
  { key: "monthWise", label: "Month wise interest report" },
  { key: "customerMonthWise", label: "Customer month wise interest" },
  { key: "dayWise", label: "Day wise Interest report" },
] as const;

type InterestReportKey = typeof reportOptions[number]["key"];

const reportColumns: Record<InterestReportKey, { key: string; label: string; type?: "currency" | "date" | "percent" }[]> = {
  accruedInterest: [
    { key: "loanId", label: "Loan ID" },
    { key: "customerName", label: "Customer" },
    { key: "principal", label: "Principal", type: "currency" },
    { key: "interestRate", label: "Rate", type: "percent" },
    { key: "accruedInterest", label: "Accrued", type: "currency" },
    { key: "dueDate", label: "Due Date", type: "date" },
  ],
  interestReceivable: [
    { key: "loanId", label: "Loan ID" },
    { key: "customerName", label: "Customer" },
    { key: "accruedInterest", label: "Accrued", type: "currency" },
    { key: "collectedInterest", label: "Collected", type: "currency" },
    { key: "interestReceivable", label: "Receivable", type: "currency" },
    { key: "dueDate", label: "Due Date", type: "date" },
  ],
  interestRealization: [
    { key: "loanId", label: "Loan ID" },
    { key: "customerName", label: "Customer" },
    { key: "collectedInterest", label: "Realized", type: "currency" },
    { key: "pendingInterest", label: "Pending", type: "currency" },
  ],
  accruedVsCollected: [
    { key: "loanId", label: "Loan ID" },
    { key: "customerName", label: "Customer" },
    { key: "accruedInterest", label: "Accrued", type: "currency" },
    { key: "collectedInterest", label: "Collected", type: "currency" },
    { key: "pendingInterest", label: "Pending", type: "currency" },
    { key: "collectionRate", label: "Collection", type: "percent" },
  ],
  bookedVsReceived: [
    { key: "loanId", label: "Loan ID" },
    { key: "customerName", label: "Customer" },
    { key: "bookedInterest", label: "Booked", type: "currency" },
    { key: "receivedInterest", label: "Received", type: "currency" },
    { key: "pendingBookedInterest", label: "Pending", type: "currency" },
  ],
  monthWise: [
    { key: "period", label: "Month" },
    { key: "days", label: "Days" },
    { key: "accruedInterest", label: "Accrued", type: "currency" },
    { key: "bookedInterest", label: "Booked", type: "currency" },
    { key: "receivedInterest", label: "Received", type: "currency" },
    { key: "pendingInterest", label: "Pending", type: "currency" },
  ],
  customerMonthWise: [
    { key: "period", label: "Month" },
    { key: "loanId", label: "Loan ID" },
    { key: "customerName", label: "Customer" },
    { key: "principal", label: "Principal", type: "currency" },
    { key: "interestRate", label: "ROI", type: "percent" },
    { key: "days", label: "Days" },
    { key: "accruedInterest", label: "Earned Interest", type: "currency" },
    { key: "receivedInterest", label: "Received", type: "currency" },
    { key: "pendingInterest", label: "Pending", type: "currency" },
  ],
  dayWise: [
    { key: "period", label: "Date", type: "date" },
    { key: "days", label: "Active Loans" },
    { key: "accruedInterest", label: "Accrued", type: "currency" },
    { key: "bookedInterest", label: "Booked", type: "currency" },
    { key: "receivedInterest", label: "Received", type: "currency" },
    { key: "pendingInterest", label: "Pending", type: "currency" },
  ],
};

const formatAccountNumber = (value?: string) => {
  if (!value) return "Missing";
  return String(value).replace(/\s+/g, "");
};

export function AccountantPanel() {
  const [leads, setLeads] = useState<AccountingLead[]>([]);
  const [recentTransfers, setRecentTransfers] = useState<RecentTransfer[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState<AccountingQueueResponse["pagination"] | null>(null);
  const [recentPage, setRecentPage] = useState(1);
  const [recentPagination, setRecentPagination] = useState<RecentTransferResponse["pagination"] | null>(null);
  const [recentStats, setRecentStats] = useState<RecentTransferResponse["stats"] | null>(null);
  const [serverStats, setServerStats] = useState<AccountingQueueResponse["stats"] | null>(null);
  const [interestReports, setInterestReports] = useState<InterestReportsResponse | null>(null);
  const [interestReportType, setInterestReportType] = useState<InterestReportKey>("accruedVsCollected");
  const [interestPage, setInterestPage] = useState(1);
  const [interestFrom, setInterestFrom] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [interestTo, setInterestTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedLead, setSelectedLead] = useState<AccountingLead | null>(null);
  const [transferForm, setTransferForm] = useState<TransferForm>({
    paymentProofUrl: "",
    transactionId: "",
    transferType: "IMPS",
    disbursementDate: getTodayIsoDate(),
    dueDate: "",
    tenureDays: "30",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [copiedField, setCopiedField] = useState("");
  const [linkError, setLinkError] = useState("");
  const [linkGeneratingId, setLinkGeneratingId] = useState<number | null>(null);
  const [repaymentLinks, setRepaymentLinks] = useState<Record<number, PaymentLinkResponse>>({});

  const loadAccountantWorkspace = useCallback(async (signal: AbortSignal) => {
    try {
      setError("");
      const params = new URLSearchParams({
        page: String(currentPage),
        pageSize: String(PAGE_SIZE),
      });
      const recentParams = new URLSearchParams({
        page: String(recentPage),
        pageSize: String(RECENT_PAGE_SIZE),
      });
      const reportParams = new URLSearchParams({
        from: interestFrom,
        to: interestTo,
      });
      if (debouncedSearchTerm.trim()) params.set("search", debouncedSearchTerm.trim());
      const [queue, recent, reports] = await Promise.all([
        apiGet<AccountingQueueResponse>(`/leads/accounting-queue-v2?${params.toString()}`, signal),
        apiGet<RecentTransferResponse>(`/leads/accounting-payments/recent?${recentParams.toString()}`, signal),
        apiGet<InterestReportsResponse>(`/accounts/reports/interest?${reportParams.toString()}`, signal),
      ]);
      setLeads(queue.items);
      setPagination(queue.pagination);
      setServerStats(queue.stats);
      setRecentTransfers(recent.items);
      setRecentPagination(recent.pagination);
      setRecentStats(recent.stats || null);
      setInterestReports(reports);
    } catch (requestError) {
      if (!signal.aborted) {
        setError(requestError instanceof Error ? requestError.message : "Unable to load accountant workspace");
      }
    }
  }, [currentPage, debouncedSearchTerm, interestFrom, interestTo, recentPage]);

  const { isRefreshing, lastUpdatedAt, refresh } = useSmartPolling(loadAccountantWorkspace, {
    enabled: true,
    intervalMs: 60_000,
  });

  useEffect(() => {
    setIsLoading(isRefreshing && !lastUpdatedAt);
  }, [isRefreshing, lastUpdatedAt]);

  useEffect(() => {
    refresh();
  }, [currentPage, debouncedSearchTerm, interestFrom, interestTo, recentPage, refresh]);

  useEffect(() => {
    setInterestPage(1);
  }, [interestFrom, interestReportType, interestTo]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  const stats = serverStats || {
    bankReadyCount: 0,
    feeTotal: 0,
    totalDisbursement: 0,
    totalLoanAmount: 0,
    totalQueue: 0,
  };
  const safePage = pagination?.page || currentPage;
  const totalPages = pagination?.totalPages || 1;
  const totalItems = pagination?.totalItems || 0;
  const safeRecentPage = recentPagination?.page || recentPage;
  const totalRecentPages = recentPagination?.totalPages || 1;
  const totalRecentItems = recentPagination?.totalItems || recentTransfers.length;
  const bankMissingCount = Math.max(0, stats.totalQueue - stats.bankReadyCount);
  const recentDisbursedAmount = recentTransfers.reduce((sum, transfer) => sum + Number(transfer.disbursementAmount || 0), 0);
  const repaymentDueSoonCount = recentStats?.dueSoonCount ?? 0;
  const repaymentOverdueCount = recentStats?.overdueCount ?? 0;
  const bankReadyPercent = stats.totalQueue ? Math.round((stats.bankReadyCount / stats.totalQueue) * 100) : 0;
  const deductionRate = stats.totalLoanAmount ? Math.round((stats.feeTotal / stats.totalLoanAmount) * 100) : 0;
  const selectedInterestRows = interestReports?.reports[interestReportType] || [];
  const selectedInterestColumns = reportColumns[interestReportType];
  const totalInterestPages = Math.max(1, Math.ceil(selectedInterestRows.length / INTEREST_PAGE_SIZE));
  const safeInterestPage = Math.min(interestPage, totalInterestPages);
  const interestStartIndex = (safeInterestPage - 1) * INTEREST_PAGE_SIZE;
  const pagedInterestRows = selectedInterestRows.slice(interestStartIndex, interestStartIndex + INTEREST_PAGE_SIZE);

  const formatReportValue = (value: string | number | null | undefined, type?: "currency" | "date" | "percent") => {
    if (type === "currency") return formatCurrency(Number(value || 0));
    if (type === "date") return formatDateOnly(value ? String(value) : "");
    if (type === "percent") return `${Number(value || 0)}%`;
    return value === null || value === undefined || value === "" ? "-" : String(value);
  };

  const openTransferModal = (lead: AccountingLead) => {
    setSelectedLead(lead);
    const todayIso = getTodayIsoDate();
    const leadDueIso = lead.dueDate ? (lead.dueDate.match(/^(\d{4})-(\d{2})-(\d{2})/)?.[0] || "") : "";
    const fallbackTenure = Number(lead.tenureDays || 30);
    const initialDue = leadDueIso || addDaysToIsoDate(todayIso, fallbackTenure);
    const initialTenure = calculateDaysDifference(todayIso, initialDue);

    setTransferForm({
      paymentProofUrl: "",
      transactionId: "",
      transferType: "IMPS",
      disbursementDate: todayIso,
      dueDate: initialDue,
      tenureDays: String(initialTenure > 0 ? initialTenure : fallbackTenure),
    });
    setSubmitError("");
    setSuccessMessage("");
    setCopiedField("");
  };

  const handleDisbursementDateChange = (newDisbDate: string) => {
    setTransferForm((prev) => {
      const currentDue = prev.dueDate;
      const newDiff = calculateDaysDifference(newDisbDate, currentDue);
      return {
        ...prev,
        disbursementDate: newDisbDate,
        tenureDays: newDiff > 0 ? String(newDiff) : prev.tenureDays,
      };
    });
  };

  const handleDueDateChange = (newDueDate: string) => {
    setTransferForm((prev) => {
      const newDiff = calculateDaysDifference(prev.disbursementDate, newDueDate);
      return {
        ...prev,
        dueDate: newDueDate,
        tenureDays: newDiff > 0 ? String(newDiff) : prev.tenureDays,
      };
    });
  };

  const handleTenureDaysChange = (newTenure: string) => {
    const tenureNum = parseInt(newTenure, 10);
    setTransferForm((prev) => {
      if (!Number.isNaN(tenureNum) && tenureNum > 0 && prev.disbursementDate) {
        const newDue = addDaysToIsoDate(prev.disbursementDate, tenureNum);
        return {
          ...prev,
          tenureDays: newTenure,
          dueDate: newDue,
        };
      }
      return { ...prev, tenureDays: newTenure };
    });
  };

  const closeTransferModal = () => {
    if (isSubmitting) return;
    setSelectedLead(null);
    setSubmitError("");
  };

  const copyValue = async (label: string, value?: string) => {
    const text = String(value || "").trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(label);
      window.setTimeout(() => setCopiedField((current) => (current === label ? "" : current)), 1800);
    } catch {
      setCopiedField("");
    }
  };

  const createRepaymentLink = async (transfer: RecentTransfer) => {
    const amount = Number(transfer.balance || transfer.repaymentAmount || 0);
    if (!amount || amount <= 0) {
      setLinkError("Repayment link amount is not available for this transfer.");
      return;
    }

    try {
      setLinkGeneratingId(transfer.id);
      setLinkError("");
      const response = await apiPost<PaymentLinkResponse>(`/leads/${encodeURIComponent(transfer.applicationId || transfer.leadId || transfer.loanId)}/repayment-link`, {
        amount,
        loanId: transfer.loanId,
        validForHours: 24,
      });
      setRepaymentLinks((current) => ({ ...current, [transfer.id]: response }));
      setSuccessMessage(`Repayment link created for ${transfer.customerName || transfer.loanId}.`);
    } catch (requestError) {
      setLinkError(requestError instanceof Error ? requestError.message : "Unable to create repayment link");
    } finally {
      setLinkGeneratingId(null);
    }
  };

  const submitFundTransfer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedLead) return;

    const transactionId = transferForm.transactionId.trim();
    if (!transactionId) {
      setSubmitError("Submit UTR / transaction ID before marking fund transfer.");
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitError("");
      const response = await apiPost<TransferResponse>(`/leads/${encodeURIComponent(selectedLead.id)}/accounting-payment`, {
        loanId: selectedLead.loanId,
        paymentProofUrl: transferForm.paymentProofUrl.trim(),
        transactionId,
        transferType: transferForm.transferType,
        disbursementDate: transferForm.disbursementDate || undefined,
        dueDate: transferForm.dueDate || undefined,
        tenureDays: Number(transferForm.tenureDays) || undefined,
      });
      const nextStep = response.nextStep;
      const dueText = nextStep?.dueDate ? ` Due on ${formatDate(nextStep.dueDate)}.` : "";
      const repaymentText = nextStep?.repaymentAmount ? ` Repayment ${formatCurrency(nextStep.repaymentAmount)}.` : "";
      setSuccessMessage(`Loan ${nextStep?.loanId || response.loan?.id || selectedLead.loanId} is active.${repaymentText}${dueText}`);
      setSelectedLead(null);
      setRecentPage(1);
      await refresh();
    } catch (requestError) {
      setSubmitError(requestError instanceof Error ? requestError.message : "Unable to submit fund transfer");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading && !lastUpdatedAt) {
    return <PageLoading label="Loading Accountant Panel workspace..." />;
  }

  return (
    <div className="w-full min-w-0 px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Finance workspace</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">Accountant Panel</h1>
          <p className="mt-1 text-sm text-slate-500">Signed agreements ready for fund transfer, UTR capture, and loan activation.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-slate-500">Auto-refresh: 60s | Last updated {formatUpdatedTime(lastUpdatedAt)}</span>
          <AppTooltip label="Refresh payment queue now">
            <button
              type="button"
              onClick={refresh}
              disabled={isRefreshing}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </AppTooltip>
        </div>
      </header>

      {successMessage && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
          {successMessage}
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ["Ready loan amount", formatCurrency(stats.totalLoanAmount), `${stats.totalQueue} signed agreements`, "info"],
          ["Net disbursement", formatCurrency(stats.totalDisbursement), "Amount to transfer", "success"],
          ["Fees + GST", formatCurrency(stats.feeTotal), "Deductions before transfer", "warning"],
          ["Bank ready", String(stats.bankReadyCount), "Account details complete", "teal"],
        ].map(([label, value, note, tone]) => (
          <MetricCard
            key={label as string}
            accent={tone as "info" | "success" | "warning" | "teal"}
            metric={value as string}
            note={note as string}
            title={label as string}
            trend="Live"
          />
        ))}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-950">Disbursement Control</h2>
              <p className="mt-1 text-sm text-slate-500">Beneficiary readiness, deduction quality, and recent cash movement.</p>
            </div>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              {bankReadyPercent}% bank ready
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { detail: "Can be transferred now", icon: ShieldCheck, label: "Bank ready", tone: "text-green-600", value: stats.bankReadyCount },
              { detail: "Needs beneficiary fix", icon: AlertCircle, label: "Bank missing", tone: "text-red-600", value: bankMissingCount },
              { detail: `${deductionRate}% of gross amount`, icon: FileText, label: "Deduction rate", tone: "text-amber-600", value: `${deductionRate}%` },
              { detail: "Total completed transfers", icon: WalletCards, label: "Net Disbursed", tone: "text-blue-600", value: formatCurrency(recentStats?.totalDisbursed || 0) },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="rounded-lg border border-slate-200 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <Icon className={`h-5 w-5 ${item.tone}`} />
                    <span className="text-xl font-bold text-slate-950">{item.value}</span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900">{item.label}</div>
                  <div className="mt-1 text-xs text-slate-500">{item.detail}</div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-slate-950">Repayment Watch</h2>
            <p className="mt-1 text-sm text-slate-500">From recently activated loans.</p>
          </div>
          <div className="space-y-3">
            {[
              { icon: Clock, label: "Due in 7 days", tone: "text-orange-600", value: repaymentDueSoonCount },
              { icon: AlertCircle, label: "Overdue watch", tone: "text-red-600", value: repaymentOverdueCount },
              { icon: ReceiptText, label: "Recent transfers", tone: "text-blue-600", value: totalRecentItems },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Icon className={`h-5 w-5 ${item.tone}`} />
                    <span className="text-sm font-medium text-slate-800">{item.label}</span>
                  </div>
                  <span className="text-lg font-semibold text-slate-950">{item.value}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <section className="mb-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-indigo-600" />
                <h2 className="text-base font-semibold text-slate-950">Interest Reports</h2>
              </div>
              <p className="mt-1 text-sm text-slate-500">Accrued, receivable, realized, booked, received, month-wise, and day-wise interest.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-[160px_160px_260px]">
              <input
                type="date"
                value={interestFrom}
                onChange={(event) => setInterestFrom(event.target.value)}
                className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                aria-label="Interest report from date"
              />
              <input
                type="date"
                value={interestTo}
                onChange={(event) => setInterestTo(event.target.value)}
                className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                aria-label="Interest report to date"
              />
              <NiceSelect
                ariaLabel="Select interest report"
                value={interestReportType}
                onValueChange={(value) => setInterestReportType(value as InterestReportKey)}
                options={reportOptions.map((option) => ({ label: option.label, value: option.key }))}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 border-b border-slate-200 p-5 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Accrued Interest", formatCurrency(interestReports?.summary.accruedInterest), `${interestReports?.summary.collectionRate ?? 0}% collected`, "info"],
            ["Interest Receivable", formatCurrency(interestReports?.summary.interestReceivable), "Accrued minus received", "warning"],
            ["Interest Realized", formatCurrency(interestReports?.summary.collectedInterest), "Actual interest collection", "success"],
            ["Booked Pending", formatCurrency(interestReports?.summary.pendingBookedInterest), `${interestReports?.summary.bookedReceiptRate ?? 0}% received`, "teal"],
          ].map(([label, value, note, tone]) => (
            <MetricCard
              key={label as string}
              accent={tone as "info" | "success" | "warning" | "teal"}
              metric={value as string}
              note={note as string}
              title={label as string}
              trend="Interest"
            />
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                {selectedInterestColumns.map((column) => (
                  <th key={column.key} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {pagedInterestRows.map((row, index) => (
                <tr key={`${interestReportType}-${row.loanId || row.period || interestStartIndex + index}`}>
                  {selectedInterestColumns.map((column) => (
                    <td key={column.key} className="whitespace-nowrap px-5 py-4 text-sm text-slate-700">
                      {formatReportValue(row[column.key], column.type)}
                    </td>
                  ))}
                </tr>
              ))}

              {!selectedInterestRows.length && (
                <tr>
                  <td colSpan={selectedInterestColumns.length} className="px-5 py-10 text-center text-sm text-slate-500">
                    No interest report rows found for this date range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Showing {selectedInterestRows.length ? interestStartIndex + 1 : 0}-{Math.min(interestStartIndex + INTEREST_PAGE_SIZE, selectedInterestRows.length)} of {selectedInterestRows.length} rows for {reportOptions.find((option) => option.key === interestReportType)?.label}.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setInterestPage((page) => Math.max(1, page - 1))}
              disabled={safeInterestPage <= 1 || isRefreshing}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <span className="min-w-24 text-center text-xs font-semibold text-slate-500">
              Page {safeInterestPage} of {totalInterestPages}
            </span>
            <button
              type="button"
              onClick={() => setInterestPage((page) => Math.min(totalInterestPages, page + 1))}
              disabled={safeInterestPage >= totalInterestPages || isRefreshing}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-emerald-600" />
            <h2 className="text-base font-semibold text-slate-950">Fund Transfer Queue</h2>
          </div>
          <p className="mt-1 text-sm text-slate-500">Submit transfer type and UTR after payment is completed outside the CRM.</p>
        </div>

        {error && <div className="m-5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="border-b border-slate-200 px-5 py-4">
          <label className="relative block max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search customer, loan ID, PAN, phone, bank..."
              className="h-10 w-full rounded-md border border-slate-300 pl-9 pr-3 text-sm outline-none transition hover:border-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                {[
                  "Customer",
                  "Loan ID",
                  "eSign date",
                  "PAN / Phone",
                  "Account",
                  "Loan amount",
                  "Processing fee",
                  "GST",
                  "Disbursement",
                  "Action",
                ].map((head) => (
                  <th key={head} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">{head}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading && [0, 1, 2].map((item) => (
                <tr key={item}>
                  <td colSpan={10} className="px-5 py-4">
                    <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                  </td>
                </tr>
              ))}

              {!isLoading && leads.map((lead) => {
                const accountCopyKey = `account-${lead.id}`;
                const isAccountCopied = copiedField === accountCopyKey;
                const isBankReady = Boolean(lead.bankName && lead.accountNumber && lead.ifscCode);

                return (
                <tr key={lead.id} className="hover:bg-slate-50">
                  <td className="px-5 py-4">
                    <p className="font-semibold text-slate-950">{lead.customerName}</p>
                    <p className="text-xs text-slate-500">{lead.id}</p>
                  </td>
                  <td className="px-5 py-4">
                    <p className="font-mono text-sm font-semibold text-slate-950">{lead.loanId}</p>
                    <p className="text-xs text-slate-500">{lead.agreementNumber}</p>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-700">{formatDate(lead.esignDate)}</td>
                  <td className="px-5 py-4">
                    <p className="text-sm font-semibold text-slate-900">{lead.panNumber || "PAN missing"}</p>
                    <p className="text-xs text-slate-500">{lead.phone || "Phone missing"}</p>
                  </td>
                  <td className="px-5 py-4">
                    <div className={`flex min-w-56 items-start justify-between gap-3 rounded-md border px-3 py-2 transition ${isAccountCopied ? "border-emerald-300 bg-emerald-50" : isBankReady ? "border-slate-200 bg-slate-50" : "border-amber-200 bg-amber-50"}`}>
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-semibold text-slate-950">{formatAccountNumber(lead.accountNumber)}</p>
                        <p className={`mt-0.5 text-xs ${isBankReady ? "text-slate-500" : "text-amber-700"}`}>{lead.bankName || "Bank missing"} | {lead.ifscCode || "IFSC missing"}</p>
                      </div>
                      {lead.accountNumber && (
                        <AppTooltip label={isAccountCopied ? "Account number copied" : "Copy account number"}>
                          <button
                            type="button"
                            onClick={() => copyValue(accountCopyKey, formatAccountNumber(lead.accountNumber))}
                            className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold transition ${isAccountCopied ? "border-emerald-200 bg-white text-emerald-700" : "border-transparent text-slate-500 hover:border-slate-200 hover:bg-white hover:text-blue-600"}`}
                            aria-label={`Copy account number for ${lead.customerName}`}
                            aria-live="polite"
                          >
                            {isAccountCopied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                            <span>{isAccountCopied ? "Copied" : "Copy"}</span>
                          </button>
                        </AppTooltip>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm font-semibold text-slate-950">{formatCurrency(lead.loanAmount)}</td>
                  <td className="px-5 py-4 text-sm text-slate-700">{formatCurrency(lead.processingFee)}</td>
                  <td className="px-5 py-4 text-sm text-slate-700">{formatCurrency(lead.gstAmount)}</td>
                  <td className="px-5 py-4">
                    <p className="text-sm font-bold text-emerald-700">{formatCurrency(lead.disbursementAmount)}</p>
                    <p className="text-xs text-slate-500">Repay {formatCurrency(lead.repaymentAmount)}</p>
                  </td>
                  <td className="px-5 py-4">
                    <AppTooltip label={isBankReady ? "Open UTR capture and activate loan" : "Bank, account number, and IFSC are required"}>
                      <button
                        type="button"
                        onClick={() => openTransferModal(lead)}
                        disabled={!isBankReady}
                        className="inline-flex h-10 min-w-32 items-center justify-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                      >
                        <Banknote className="h-4 w-4" />
                        <span>{isBankReady ? "Transfer" : "Bank Missing"}</span>
                      </button>
                    </AppTooltip>
                  </td>
                </tr>
                );
              })}

              {!isLoading && leads.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-5 py-12 text-sm text-slate-500">
                    <EmptyState
                      title={debouncedSearchTerm ? "No transfer records found" : "No fund transfers waiting"}
                      description={debouncedSearchTerm ? "Clear the search to see all signed agreements." : "Signed agreements ready for disbursement will appear here."}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>Page {safePage} of {totalPages} - {totalItems} transfer{totalItems === 1 ? "" : "s"}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={safePage <= 1 || isRefreshing}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={safePage >= totalPages || isRefreshing}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      <section className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5 text-blue-600" />
            <h2 className="text-base font-semibold text-slate-950">Recent Fund Transfers</h2>
          </div>
          <p className="mt-1 text-sm text-slate-500">Completed transfers move into active loans and collection tracking.</p>
        </div>

        <div className="divide-y divide-slate-200">
          {recentTransfers.map((transfer) => {
            const displayRepaymentStatus = repaymentDisplayStatus(transfer);
            const repaymentLink = repaymentLinks[transfer.id];
            const linkCopyKey = `repayment-link-${transfer.id}`;

            return (
            <div key={transfer.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1.2fr] lg:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-slate-950">{transfer.customerName || "Customer"}</p>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                    {transfer.loanStatus || "Active"}
                  </span>
                </div>
                <p className="mt-1 break-all font-mono text-xs text-slate-500">{transfer.loanId}</p>
                <p className="mt-1 text-xs text-slate-500">{transfer.phone || transfer.applicationId || transfer.leadId}</p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Transfer</p>
                <p className="mt-1 text-sm font-bold text-emerald-700">{formatCurrency(transfer.disbursementAmount)}</p>
                <p className="mt-1 break-all text-xs text-slate-600"><span className="font-semibold text-slate-700">UTR:</span> {transfer.transactionId} ({transfer.transferType})</p>
                {transfer.accountNumber && (
                  <p className="mt-1 text-xs font-mono font-semibold text-slate-700">
                    A/C: {formatAccountNumber(transfer.accountNumber)} {transfer.bankName ? `(${transfer.bankName})` : ""}
                  </p>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Repayment</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">{formatCurrency(transfer.repaymentAmount || transfer.balance)}</p>
                {displayRepaymentStatus && <p className="mt-1 text-xs text-slate-500">{displayRepaymentStatus}</p>}
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <CalendarDays className="h-4 w-4" />
                  Next due
                </div>
                <p className="mt-1 text-sm font-semibold text-slate-950">{formatDateOnly(transfer.dueDate || transfer.nextPaymentDate)}</p>
                <p className="mt-1 text-xs text-slate-500">Disbursed {formatDate(transfer.disbursedAt)}</p>
              </div>

              <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Payment link</p>
                {repaymentLink ? (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      readOnly
                      value={repaymentLink.linkUrl}
                      className="h-9 min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-50 px-2 text-xs text-slate-600 outline-none"
                      aria-label={`Repayment link for ${transfer.customerName || transfer.loanId}`}
                    />
                    <AppTooltip label={copiedField === linkCopyKey ? "Link copied" : "Copy repayment link"}>
                      <button
                        type="button"
                        onClick={() => copyValue(linkCopyKey, repaymentLink.linkUrl)}
                        className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold transition ${copiedField === linkCopyKey ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-blue-600"}`}
                        aria-label="Copy repayment link"
                        aria-live="polite"
                      >
                        {copiedField === linkCopyKey ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copiedField === linkCopyKey ? "Copied" : "Copy"}
                      </button>
                    </AppTooltip>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => createRepaymentLink(transfer)}
                    disabled={linkGeneratingId === transfer.id || Number(transfer.balance || transfer.repaymentAmount || 0) <= 0}
                    className="mt-2 inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
                  >
                    <LinkIcon className="h-3.5 w-3.5" />
                    {linkGeneratingId === transfer.id ? "Creating..." : "Generate link"}
                  </button>
                )}
              </div>
            </div>
            );
          })}

          {!recentTransfers.length && (
            <div className="px-5 py-10 text-center text-sm text-slate-500">
              No completed fund transfers yet.
            </div>
          )}
        </div>

        {linkError && <div className="mx-5 mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{linkError}</div>}

        <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>Page {safeRecentPage} of {totalRecentPages} - {totalRecentItems} transfer{totalRecentItems === 1 ? "" : "s"}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRecentPage((page) => Math.max(1, page - 1))}
              disabled={safeRecentPage <= 1 || isRefreshing}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <button
              type="button"
              onClick={() => setRecentPage((page) => Math.min(totalRecentPages, page + 1))}
              disabled={safeRecentPage >= totalRecentPages || isRefreshing}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      {selectedLead && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/50">
          <div className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">Fund Transfer</h3>
                <p className="mt-1 text-sm text-slate-500">{selectedLead.customerName} | {selectedLead.loanId}</p>
              </div>
              <button
                type="button"
                onClick={closeTransferModal}
                className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Close fund transfer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={submitFundTransfer} className="space-y-4 px-5 py-5">
              <div className="grid grid-cols-2 gap-3 rounded-md bg-slate-50 p-3 text-sm">
                <p><span className="block text-xs text-slate-500">Disbursement</span><span className="font-semibold text-slate-950">{formatCurrency(selectedLead.disbursementAmount)}</span></p>
                <p>
                  <span className="block text-xs text-slate-500">Repayment due</span>
                  <span className="font-semibold text-emerald-700">{formatDateOnly(transferForm.dueDate || selectedLead.dueDate)}</span>
                  <span className="ml-1 text-[11px] text-slate-500">({transferForm.tenureDays} days)</span>
                </p>
                <p><span className="block text-xs text-slate-500">eSign date</span><span className="font-semibold text-slate-950">{formatDate(selectedLead.esignDate)}</span></p>
                <p><span className="block text-xs text-slate-500">Gross loan</span><span className="font-semibold text-slate-950">{formatCurrency(selectedLead.loanAmount)}</span></p>
                <p><span className="block text-xs text-slate-500">Processing + GST</span><span className="font-semibold text-slate-950">{formatCurrency(Number(selectedLead.processingFee || 0) + Number(selectedLead.gstAmount || 0))}</span></p>
                <p><span className="block text-xs text-slate-500">Agreement</span><span className="font-semibold text-slate-950">{selectedLead.agreementNumber || "Missing"}</span></p>
              </div>

              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Beneficiary details</p>
                    <p className="mt-1 text-sm text-blue-900">Use these exact details for bank transfer.</p>
                  </div>
                  <ShieldCheck className="h-5 w-5 text-blue-600" />
                </div>
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <div className="rounded-md bg-white px-3 py-2">
                    <span className="block text-xs text-slate-500">Bank</span>
                    <span className="font-semibold text-slate-950">{selectedLead.bankName || "Missing"}</span>
                  </div>
                  <div className="rounded-md bg-white px-3 py-2">
                    <span className="block text-xs text-slate-500">IFSC</span>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-slate-950">{selectedLead.ifscCode || "Missing"}</span>
                      {selectedLead.ifscCode && (
                        <button
                          type="button"
                          onClick={() => copyValue("modal-ifsc", selectedLead.ifscCode)}
                          className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold transition ${copiedField === "modal-ifsc" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-transparent text-slate-500 hover:border-slate-200 hover:bg-slate-100 hover:text-blue-600"}`}
                          aria-label="Copy IFSC"
                          aria-live="polite"
                        >
                          {copiedField === "modal-ifsc" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          <span>{copiedField === "modal-ifsc" ? "Copied" : "Copy"}</span>
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="rounded-md bg-white px-3 py-2 sm:col-span-2">
                    <span className="block text-xs text-slate-500">Account number</span>
                    <div className="flex items-center justify-between gap-2">
                      <span className="break-all font-mono text-base font-bold text-slate-950">{formatAccountNumber(selectedLead.accountNumber)}</span>
                      {selectedLead.accountNumber && (
                        <button
                          type="button"
                          onClick={() => copyValue("modal-account", formatAccountNumber(selectedLead.accountNumber))}
                          className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold transition ${copiedField === "modal-account" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600 hover:bg-white hover:text-blue-600"}`}
                          aria-live="polite"
                        >
                          {copiedField === "modal-account" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          {copiedField === "modal-account" ? "Copied" : "Copy"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-900">Disbursement Date</label>
                  <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800 border border-blue-300">
                    Tenure: {transferForm.tenureDays} days
                  </span>
                </div>
                <input
                  type="date"
                  value={transferForm.disbursementDate}
                  onChange={(event) => handleDisbursementDateChange(event.target.value)}
                  required
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition hover:border-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
                <p className="text-xs text-slate-600">
                  Repayment count begins from this date. Due date: <strong className="font-semibold text-emerald-700">{formatDateOnly(transferForm.dueDate)}</strong> ({transferForm.tenureDays} days).
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Select transfer type</label>
                <NiceSelect
                  ariaLabel="Select transfer type"
                  value={transferForm.transferType}
                  onValueChange={(value) => setTransferForm((form) => ({ ...form, transferType: value as TransferForm["transferType"] }))}
                  options={[
                    { label: "IMPS", value: "IMPS" },
                    { label: "NEFT", value: "NEFT" },
                    { label: "UPI", value: "UPI" },
                  ]}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Submit UTR / Transaction ID</label>
                <input
                  value={transferForm.transactionId}
                  onChange={(event) => setTransferForm((form) => ({ ...form, transactionId: event.target.value }))}
                  placeholder="Enter bank UTR or transaction ID"
                  className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm uppercase outline-none transition hover:border-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Payment proof URL <span className="text-xs font-normal text-slate-400">(optional)</span></label>
                <input
                  value={transferForm.paymentProofUrl}
                  onChange={(event) => setTransferForm((form) => ({ ...form, paymentProofUrl: event.target.value }))}
                  placeholder="Paste bank receipt or proof link"
                  className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition hover:border-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Please verify beneficiary bank, full account number, IFSC, disbursement amount, and UTR before submitting. This action activates the loan and starts the repayment cycle.
              </div>

              {submitError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{submitError}</div>
              )}

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={closeTransferModal}
                  disabled={isSubmitting}
                  className="h-10 rounded-md border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-10 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? "Submitting..." : "Submit Transfer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
