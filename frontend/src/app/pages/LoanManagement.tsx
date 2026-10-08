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
  Zap,
  Wallet,
  Banknote,
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

  // Collection & Disbursement fields
  leadId?: string;
  loanNo?: string;
  customerName?: string;
  email?: string;
  mobile?: string;
  mobileNumber?: string;
  alternativeNumber?: string;
  gender?: string;
  dob?: string | null;
  panNumber?: string;
  monthlyIncome?: number;
  disbursedAmount?: number;
  adminFee?: number;
  adminFeeGst?: number;
  totalAdminFee?: number;
  igst?: number;
  cgst?: number;
  sgst?: number;
  processing?: number;
  tenure?: number;
  roi?: number;
  repaymentAmount?: number;
  loanRepayAmount?: number;
  repaymentDate?: string | null;
  modeOfPayment?: string;
  companyBankAccount?: string;
  disbursementReference?: string;
  disbursementStatus?: string;
  repeatType?: string;
  leadInitiatedDate?: string | null;
  sanctionedBy?: string;
  approvedBy?: string;
  sanctionDate?: string | null;
  disbursedBy?: string;
  loanDisbursedDate?: string | null;
  houseType?: string;
  address?: string;
  pincode?: string;
  stateName?: string;
  cityName?: string;
  branchName?: string;
  collectedAmount?: number;
  collectedMode?: string;
  collectedDate?: string | null;
  createdAt?: string;
};

const COLLECTION_HEADERS = [
  "Loan No.",
  "Name",
  "Email",
  "Mobile",
  "DOB",
  "PAN No.",
  "Loan Amount",
  "Repayamount Amount",
  "Income Amount",
  "Disbursed Date",
  "Repay Date",
  "LOAN TENURE",
  "ROI",
  "Collected Amount",
  "Collected Mode",
  "Collected Date",
  "Actions",
];

const DISBURSEMENT_HEADERS = [
  "LeadID",
  "State Name",
  "City Name",
  "Branch Name",
  "Customer ID",
  "Pancard",
  "Loan No.",
  "Customer Name",
  "Mobile Number",
  "Gender",
  "DOB",
  "Alternative Number",
  "Email",
  "Loan Amount",
  "Disbursed Amount",
  "Admin Fee",
  "Admin Fee GST",
  "Total Admin Fee",
  "IGST",
  "CGST",
  "SGST",
  "Processing",
  "Tenure",
  "ROI(%)",
  "Loan Repay Amount",
  "Disbursement Date",
  "Repayment Date",
  "Mode Of Payment",
  "Company Bank Account Number",
  "Customer Bank Account Number",
  "Customer Bank Name",
  "Customer Bank IFSC",
  "Refrence No Of Disbursement",
  "Disbursement Status",
  "Repeat Type",
  "Lead Initiated Date",
  "Sanctioned By",
  "Approved By",
  "Sanction Date",
  "Loan Disbursed By",
  "Loan Disbursed Date",
  "House Type",
  "Address",
  "Pin Code",
  "Actions",
];

function parseLoanRow(loan: Loan) {
  let leadId = loan.leadId || "";
  let loanNo = loan.loanNo || loan.id || "";
  let customerName = loan.customerName || loan.customer || "";

  if (String(loan.id || "").includes("/")) {
    const parts = String(loan.id).split("/");
    if (!leadId && parts[0]) leadId = parts[0];
    if (parts[1]) loanNo = parts[1];
    if ((!customerName || customerName === "Customer not linked") && parts[2]) {
      customerName = parts[2];
    }
  }

  const principal = Number(loan.principal || 0);
  const adminFee = Number(loan.adminFee || loan.processing || Math.round(principal * 0.10));
  const adminFeeGst = Number(loan.adminFeeGst || Math.round(adminFee * 0.18));
  const totalAdminFee = Number(loan.totalAdminFee || (adminFee + adminFeeGst));
  const igst = Number(loan.igst || adminFeeGst);
  const cgst = Number(loan.cgst || Math.round((adminFeeGst / 2) * 100) / 100);
  const sgst = Number(loan.sgst || Math.round((adminFeeGst / 2) * 100) / 100);
  const processing = Number(loan.processing || adminFee);
  const disbursedAmount = Number(loan.disbursedAmount || (principal > totalAdminFee ? principal - totalAdminFee : principal));
  const loanRepayAmount = Number(loan.loanRepayAmount || loan.repaymentAmount || loan.totalAmount || Math.round(principal * 1.12));

  const mobile = loan.mobile || loan.mobileNumber || (loan as any).phone || (loan as any).customerPhone || "-";
  const email = loan.email || (loan as any).customerEmail || "-";
  const panNumber = loan.panNumber || (loan as any).pan || (loan as any).pancard || "-";
  const dob = loan.dob || (loan as any).dateOfBirth || null;
  const monthlyIncome = Number(loan.monthlyIncome || (loan as any).incomeAmount || 0);

  return {
    ...loan,
    leadId: leadId || "-",
    loanNo: loanNo || loan.id,
    customerName: customerName || loan.customer || "Customer not linked",
    email,
    mobile,
    mobileNumber: mobile,
    dob,
    panNumber,
    principal,
    loanRepayAmount,
    monthlyIncome,
    disbursedDate: loan.disbursedDate || loan.startDate || null,
    repaymentDate: loan.repaymentDate || loan.dueDate || null,
    tenure: loan.tenure || 30,
    roi: Number(loan.roi || loan.interestRate || 0),
    collectedAmount: Number(loan.collectedAmount || loan.amountPaid || 0),
    collectedMode: loan.collectedMode || (Number(loan.amountPaid || 0) > 0 ? "Bank Transfer" : "-"),
    collectedDate: loan.collectedDate || loan.lastPaymentDate || null,
    stateName: loan.stateName || "-",
    cityName: loan.cityName || "-",
    branchName: loan.branchName || "Main Branch",
    alternativeNumber: loan.alternativeNumber || "-",
    gender: loan.gender || "-",
    disbursedAmount,
    adminFee,
    adminFeeGst,
    totalAdminFee,
    igst,
    cgst,
    sgst,
    processing,
    modeOfPayment: loan.modeOfPayment || "Bank Transfer",
    companyBankAccount: loan.companyBankAccount || "000705001234",
    accountNumber: loan.accountNumber || "-",
    bankName: loan.bankName || "-",
    ifscCode: loan.ifscCode || "-",
    disbursementReference: loan.disbursementReference || loan.utrNumber || "-",
    disbursementStatus: loan.disbursementStatus || "Disbursed",
    repeatType: loan.repeatType || "Fresh",
    leadInitiatedDate: loan.leadInitiatedDate || loan.createdAt || null,
    sanctionedBy: loan.sanctionedBy || "Credit Manager",
    approvedBy: loan.approvedBy || "Credit Desk",
    sanctionDate: loan.sanctionDate || loan.startDate || null,
    disbursedBy: loan.disbursedBy || "Accountant",
    loanDisbursedDate: loan.loanDisbursedDate || loan.disbursedDate || loan.startDate || null,
    houseType: loan.houseType || "Owned",
    address: loan.address || "-",
    pincode: loan.pincode || "-",
  };
}

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

const DISBURSED_FILTER_OPTIONS = [
  { label: "All Disbursed Dates", value: "all" },
  { label: "Today Disbursed", value: "today" },
  { label: "This Month Disbursed", value: "month" },
];

const DATE_FILTER_OPTIONS = [
  { label: "All Due Dates", value: "all" },
  { label: "Due Today", value: "today" },
  { label: "Due This Week", value: "week" },
  { label: "Due This Month", value: "month" },
  { label: "Overdue (Past Due)", value: "overdue" },
];

const STATUS_OPTIONS = [
  { label: "All Status", value: "all" },
  { label: "Active", value: "Active" },
  { label: "Part Payment", value: "Part Payment" },
  { label: "Paid Off (Closed)", value: "Paid Off" },
  { label: "Overdue", value: "Overdue" },
];

const DATE_TYPE_OPTIONS = [
  { label: "Disbursal Date", value: "disbursed" },
  { label: "Repayment Due Date", value: "due" },
  { label: "Collection / Paid Date", value: "collected" },
  { label: "Lead Created Date", value: "created" },
];

const DATE_PRESET_OPTIONS = [
  { label: "All Time", value: "all" },
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "This Week", value: "this_week" },
  { label: "This Month", value: "this_month" },
  { label: "Last Month", value: "last_month" },
];

function getTodayDateStr(): string {
  try {
    return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  } catch {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
}

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
  if (/^(\d{2})[-/](\d{2})[-/](\d{4})$/.test(str)) {
    const parts = str.split(/[-/]/);
    const date = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    }
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
  const [viewMode, setViewMode] = useState<"collection" | "disbursement">("collection");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDateInput, setFromDateInput] = useState("");
  const [toDateInput, setToDateInput] = useState("");
  const [appliedFromDate, setAppliedFromDate] = useState("");
  const [appliedToDate, setAppliedToDate] = useState("");
  const [dateType, setDateType] = useState<"disbursed" | "due" | "collected" | "created">("disbursed");
  const [datePreset, setDatePreset] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState("15");
  const [totalCount, setTotalCount] = useState(0);
  const [apiStats, setApiStats] = useState<any>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  const handleApplyDateSearch = () => {
    setAppliedFromDate(fromDateInput);
    setAppliedToDate(toDateInput);
    setDatePreset(fromDateInput || toDateInput ? "custom" : "all");
    setCurrentPage(1);
  };

  const handleDatePreset = (preset: string) => {
    setDatePreset(preset);
    const todayStr = getTodayDateStr();
    if (preset === "all") {
      setFromDateInput("");
      setToDateInput("");
      setAppliedFromDate("");
      setAppliedToDate("");
      setCurrentPage(1);
      return;
    }
    let from = "";
    let to = "";
    if (preset === "today") {
      from = todayStr;
      to = todayStr;
    } else if (preset === "yesterday") {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const yStr = toDateKey(d) || todayStr;
      from = yStr;
      to = yStr;
    } else if (preset === "this_week") {
      const now = new Date();
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
      const monday = new Date(now.setDate(diff));
      from = toDateKey(monday) || todayStr;
      to = todayStr;
    } else if (preset === "this_month") {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      from = toDateKey(firstDay) || todayStr;
      to = todayStr;
    } else if (preset === "last_month") {
      const now = new Date();
      const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      from = toDateKey(firstDayLastMonth) || todayStr;
      to = toDateKey(lastDayLastMonth) || todayStr;
    }
    setFromDateInput(from);
    setToDateInput(to);
    setAppliedFromDate(from);
    setAppliedToDate(to);
    setCurrentPage(1);
  };

  const clearDateFilter = () => {
    setFromDateInput("");
    setToDateInput("");
    setAppliedFromDate("");
    setAppliedToDate("");
    setDatePreset("all");
    setCurrentPage(1);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [pageSize, debouncedSearch, statusFilter, appliedFromDate, appliedToDate, dateType]);

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
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (appliedFromDate) params.set("fromDate", appliedFromDate);
      if (appliedToDate) params.set("toDate", appliedToDate);
      if (appliedFromDate || appliedToDate) {
        params.set("dateType", dateType);
      }
      params.set("page", String(currentPage));
      params.set("limit", pageSize);

      const url = `/loans${params.toString() ? `?${params.toString()}` : ""}`;
      const data = await apiGet<Loan[]>(url, signal);
      setLoans(data);

      const pagination = (data as any)?.pagination;
      if (pagination && typeof pagination.total === "number") {
        setTotalCount(pagination.total);
      } else {
        setTotalCount(data.length);
      }

      const st = (data as any)?.stats;
      if (st) {
        setApiStats(st);
      }
      setError(null);
    } catch (err) {
      if (!signal.aborted) {
        setError(err instanceof Error ? err.message : "Unable to load loan portfolio");
      }
      throw err;
    }
  }, [currentPage, pageSize, debouncedSearch, statusFilter, appliedFromDate, appliedToDate, dateType]);

  const { isRefreshing, lastUpdatedAt, refresh } = useSmartPolling(loadLoans, {
    enabled: true,
    intervalMs: 60_000,
  });

  // Export CSV (Fetches complete dataset on-demand so viewing the table is always blazing fast)
  const handleExportCsv = async () => {
    try {
      setIsExporting(true);
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (appliedFromDate) params.set("fromDate", appliedFromDate);
      if (appliedToDate) params.set("toDate", appliedToDate);
      if (appliedFromDate || appliedToDate) {
        params.set("dateType", dateType);
      }
      params.set("limit", "5000"); // full export

      const exportData = await apiGet<Loan[]>(`/loans?${params.toString()}`);
      if (!exportData || !exportData.length) {
        alert("No loans available to export with current filters.");
        return;
      }

      if (viewMode === "collection") {
        const headers = [
          "Loan No.",
          "Name",
          "Email",
          "Mobile",
          "DOB",
          "PAN No.",
          "Loan Amount",
          "Repayment Amount",
          "Income Amount",
          "Disbursed Date",
          "Repay Date",
          "LOAN TENURE",
          "ROI",
          "Collected Amount",
          "Collected Mode",
          "Collected Date",
        ];

        const rows = exportData.map((raw) => {
          const l = parseLoanRow(raw);
          return [
            `"${(l.loanNo || l.id || "").replace(/"/g, '""')}"`,
            `"${(l.customerName || "").replace(/"/g, '""')}"`,
            `"${(l.email || "").replace(/"/g, '""')}"`,
            `"${l.mobile || l.mobileNumber || ""}"`,
            `"${toDateKey(l.dob) || ""}"`,
            `"${(l.panNumber || "").replace(/"/g, '""')}"`,
            l.principal || 0,
            l.loanRepayAmount || l.repaymentAmount || l.totalAmount || 0,
            l.monthlyIncome || 0,
            `"${toDateKey(l.disbursedDate || l.startDate) || ""}"`,
            `"${toDateKey(l.repaymentDate || l.dueDate) || ""}"`,
            `"${l.tenure || 30} Days"`,
            `"${l.roi || l.interestRate || 0}%"`,
            l.amountPaid || l.collectedAmount || 0,
            `"${(l.collectedMode || (Number(l.amountPaid || 0) > 0 ? "Bank Transfer" : "-")).replace(/"/g, '""')}"`,
            `"${toDateKey(l.collectedDate || l.lastPaymentDate) || ""}"`,
          ];
        });

        const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `loan_collection_export_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        // Disbursement mode
        const headers = [
          "LeadID",
          "State Name",
          "City Name",
          "Branch Name",
          "Customer ID",
          "Pancard",
          "Loan No.",
          "Customer Name",
          "Mobile Number",
          "Gender",
          "DOB",
          "Alternative Number",
          "Email",
          "Loan Amount",
          "Disbursed Amount",
          "Admin Fee",
          "Admin Fee GST",
          "Total Admin Fee",
          "IGST",
          "CGST",
          "SGST",
          "Processing",
          "Tenure",
          "ROI(%)",
          "Loan Repay Amount",
          "Disbursement Date",
          "Repayment Date",
          "Mode Of Payment",
          "Company Bank Account Number",
          "Customer Bank Account Number",
          "Customer Bank Name",
          "Customer Bank IFSC",
          "Refrence No Of Disbursement",
          "Disbursement Status",
          "Repeat Type",
          "Lead Initiated Date",
          "Sanctioned By",
          "Approved By",
          "Sanction Date",
          "Loan Disbursed By",
          "Loan Disbursed Date",
          "House Type",
          "Address",
          "Pin Code",
        ];

        const rows = exportData.map((raw) => {
          const l = parseLoanRow(raw);
          return [
            `"${(l.leadId || "").replace(/"/g, '""')}"`,
            `"${(l.stateName || "-").replace(/"/g, '""')}"`,
            `"${(l.cityName || "-").replace(/"/g, '""')}"`,
            `"${(l.branchName || "Main Branch").replace(/"/g, '""')}"`,
            `"${(l.customerId || "").replace(/"/g, '""')}"`,
            `"${(l.panNumber || "").replace(/"/g, '""')}"`,
            `"${(l.loanNo || "").replace(/"/g, '""')}"`,
            `"${(l.customerName || "").replace(/"/g, '""')}"`,
            `"${l.mobile || l.mobileNumber || ""}"`,
            `"${(l.gender || "-").replace(/"/g, '""')}"`,
            `"${toDateKey(l.dob) || ""}"`,
            `"${(l.alternativeNumber || "-").replace(/"/g, '""')}"`,
            `"${(l.email || "").replace(/"/g, '""')}"`,
            l.principal || 0,
            l.disbursedAmount || l.principal || 0,
            l.adminFee || l.processing || 0,
            l.adminFeeGst || 0,
            l.totalAdminFee || 0,
            l.igst || 0,
            l.cgst || 0,
            l.sgst || 0,
            l.processing || l.adminFee || 0,
            `"${l.tenure || 30} Days"`,
            `"${l.roi || l.interestRate || 0}%"`,
            l.loanRepayAmount || l.repaymentAmount || l.totalAmount || 0,
            `"${toDateKey(l.disbursedDate || l.startDate) || ""}"`,
            `"${toDateKey(l.repaymentDate || l.dueDate) || ""}"`,
            `"${(l.modeOfPayment || "Bank Transfer").replace(/"/g, '""')}"`,
            `"${(l.companyBankAccount || "000705001234").replace(/"/g, '""')}"`,
            l.accountNumber ? `="${String(l.accountNumber).replace(/"/g, '""').trim()}"` : `""`,
            `"${(l.bankName || "").replace(/"/g, '""')}"`,
            `"${(l.ifscCode || "").replace(/"/g, '""')}"`,
            `"${(l.disbursementReference || l.utrNumber || "").replace(/"/g, '""')}"`,
            `"${(l.disbursementStatus || "Disbursed").replace(/"/g, '""')}"`,
            `"${(l.repeatType || "Fresh").replace(/"/g, '""')}"`,
            `"${toDateKey(l.leadInitiatedDate || l.createdAt) || ""}"`,
            `"${(l.sanctionedBy || "Credit Manager").replace(/"/g, '""')}"`,
            `"${(l.approvedBy || "Credit Desk").replace(/"/g, '""')}"`,
            `"${toDateKey(l.sanctionDate || l.startDate) || ""}"`,
            `"${(l.disbursedBy || "Accountant").replace(/"/g, '""')}"`,
            `"${toDateKey(l.loanDisbursedDate || l.disbursedDate || l.startDate) || ""}"`,
            `"${(l.houseType || "Owned").replace(/"/g, '""')}"`,
            `"${(l.address || "").replace(/"/g, '""')}"`,
            `"${(l.pincode || "").replace(/"/g, '""')}"`,
          ];
        });

        const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `loan_disbursement_export_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to export loans CSV.");
    } finally {
      setIsExporting(false);
    }
  };

  const totals = useMemo(() => {
    if (apiStats) {
      return apiStats;
    }

    const todayKey = toDateKey(new Date()) || "";
    const currentMonthKey = todayKey.slice(0, 7);

    const todayDisbursedLoans = loans.filter((loan) => {
      const disbursalKey = toDateKey(loan.disbursedDate || loan.startDate);
      return disbursalKey === todayKey;
    });

    const monthDisbursedLoans = loans.filter((loan) => {
      const disbursalKey = toDateKey(loan.disbursedDate || loan.startDate);
      return disbursalKey ? disbursalKey.slice(0, 7) === currentMonthKey : false;
    });

    return {
      allLoans: totalCount || loans.length,
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
      todayDisbursedCount: todayDisbursedLoans.length,
      todayDisbursedAmount: todayDisbursedLoans.reduce((sum, loan) => sum + Number(loan.principal || 0), 0),
      monthDisbursedCount: monthDisbursedLoans.length,
      monthDisbursedAmount: monthDisbursedLoans.reduce((sum, loan) => sum + Number(loan.principal || 0), 0),
    };
  }, [loans, totalCount, apiStats]);

  const rowsPerPage = Number(pageSize);
  const totalPages = Math.max(1, Math.ceil(totalCount / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = totalCount ? (safePage - 1) * rowsPerPage : 0;
  const endIndex = Math.min(startIndex + loans.length, totalCount);
  const visibleLoans = loans;

  const showInitialLoading = isRefreshing && !lastUpdatedAt && loans.length === 0;

  const resetFilters = () => {
    setSearchTerm("");
    setDebouncedSearch("");
    setStatusFilter("all");
    setFromDateInput("");
    setToDateInput("");
    setAppliedFromDate("");
    setAppliedToDate("");
    setDatePreset("all");
    setDateType("disbursed");
    setCurrentPage(1);
  };

  const hasActiveFilters =
    debouncedSearch.trim() !== "" ||
    statusFilter !== "all" ||
    appliedFromDate !== "" ||
    appliedToDate !== "" ||
    datePreset !== "all";

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
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {/* Today Disbursed */}
        <div
          onClick={() => {
            if (datePreset === "today" && dateType === "disbursed") {
              handleDatePreset("all");
            } else {
              setDateType("disbursed");
              handleDatePreset("today");
            }
          }}
          className={`group relative cursor-pointer overflow-hidden rounded-2xl border border-sky-200/90 dark:border-sky-900/60 border-t-4 border-t-sky-500 border-l-4 border-l-sky-500 bg-gradient-to-br from-sky-500/10 via-sky-500/5 to-white dark:from-sky-950/40 dark:via-slate-900 dark:to-slate-900 p-5 shadow-sm hover:shadow-md transition-all duration-200 ${
            datePreset === "today" && dateType === "disbursed" ? "ring-2 ring-sky-500 shadow-md" : ""
          }`}
          title="Filter loans disbursed today"
        >
          <div className="mb-2 flex items-center justify-between text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Today Disbursed
            <div className="p-2 rounded-xl bg-sky-100/80 dark:bg-sky-900/40 text-sky-600 dark:text-sky-300 border border-sky-200 dark:border-sky-700/60 group-hover:scale-105 transition">
              <Zap className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl xl:text-3xl font-black text-sky-700 dark:text-sky-400">{formatCurrency(totals.todayDisbursedAmount)}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-semibold">
            {totals.todayDisbursedCount} loan{totals.todayDisbursedCount === 1 ? "" : "s"} today
          </p>
        </div>

        {/* This Month Disbursed */}
        <div
          onClick={() => {
            if (datePreset === "this_month" && dateType === "disbursed") {
              handleDatePreset("all");
            } else {
              setDateType("disbursed");
              handleDatePreset("this_month");
            }
          }}
          className={`group relative cursor-pointer overflow-hidden rounded-2xl border border-indigo-200/90 dark:border-indigo-900/60 border-t-4 border-t-indigo-500 border-l-4 border-l-indigo-500 bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-white dark:from-indigo-950/40 dark:via-slate-900 dark:to-slate-900 p-5 shadow-sm hover:shadow-md transition-all duration-200 ${
            datePreset === "this_month" && dateType === "disbursed" ? "ring-2 ring-indigo-500 shadow-md" : ""
          }`}
          title="Filter loans disbursed this month"
        >
          <div className="mb-2 flex items-center justify-between text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            This Month Disbursed
            <div className="p-2 rounded-xl bg-indigo-100/80 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700/60 group-hover:scale-105 transition">
              <Calendar className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl xl:text-3xl font-black text-indigo-700 dark:text-indigo-400">{formatCurrency(totals.monthDisbursedAmount)}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-semibold">
            {totals.monthDisbursedCount} loan{totals.monthDisbursedCount === 1 ? "" : "s"} this month
          </p>
        </div>

        {/* Total Outstanding */}
        <div className="relative overflow-hidden rounded-2xl border border-purple-200/90 dark:border-purple-900/60 border-t-4 border-t-purple-500 border-l-4 border-l-purple-500 bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-white dark:from-purple-950/40 dark:via-slate-900 dark:to-slate-900 p-5 shadow-sm hover:shadow-md transition-all duration-200">
          <div className="mb-2 flex items-center justify-between text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Outstanding Due
            <div className="p-2 rounded-xl bg-purple-100/80 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 border border-purple-200 dark:border-purple-700/60">
              <IndianRupee className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl xl:text-3xl font-black text-purple-700 dark:text-purple-400">{formatCurrency(totals.totalOutstanding)}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Total balance awaiting collection</p>
        </div>

        {/* Total Collected / Paid Off */}
        <div
          onClick={() => setStatusFilter(statusFilter === "Paid Off" ? "all" : "Paid Off")}
          className={`group relative cursor-pointer overflow-hidden rounded-2xl border border-emerald-200/90 dark:border-emerald-900/60 border-t-4 border-t-emerald-500 border-l-4 border-l-emerald-500 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-white dark:from-emerald-950/40 dark:via-slate-900 dark:to-slate-900 p-5 shadow-sm hover:shadow-md transition-all duration-200 ${
            statusFilter === "Paid Off" ? "ring-2 ring-emerald-500 shadow-md" : ""
          }`}
        >
          <div className="mb-2 flex items-center justify-between text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Collected / Settled
            <div className="p-2 rounded-xl bg-emerald-100/80 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700/60 group-hover:scale-105 transition">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl xl:text-3xl font-black text-emerald-700 dark:text-emerald-400">{formatCurrency(totals.totalCollected)}</p>
          <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
            {totals.paidOffLoans} loans fully settled (Paid Off)
          </p>
        </div>

        {/* Overdue Loans */}
        <div
          onClick={() => setStatusFilter(statusFilter === "Overdue" ? "all" : "Overdue")}
          className={`group relative cursor-pointer overflow-hidden rounded-2xl border border-rose-200/90 dark:border-rose-900/60 border-t-4 border-t-rose-500 border-l-4 border-l-rose-500 bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-white dark:from-rose-950/40 dark:via-slate-900 dark:to-slate-900 p-5 shadow-sm hover:shadow-md transition-all duration-200 ${
            statusFilter === "Overdue" ? "ring-2 ring-rose-500 shadow-md" : ""
          }`}
        >
          <div className="mb-2 flex items-center justify-between text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Overdue Loans
            <div className="p-2 rounded-xl bg-rose-100/80 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-700/60 group-hover:scale-105 transition">
              <AlertCircle className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl xl:text-3xl font-black text-rose-700 dark:text-rose-400">{totals.overdueLoans}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Past due date requiring recovery</p>
        </div>
      </div>

      {/* Filter and Search Panel */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {/* Top Dropdowns & Search Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 mb-3">
          {/* Keyword Search */}
          <div className="relative lg:col-span-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Search customer, loan ID, phone, PAN..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 pl-9 pr-9 text-xs font-semibold text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
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

          {/* Status Dropdown */}
          <div className="lg:col-span-3">
            <NiceSelect
              ariaLabel="Filter by status"
              value={statusFilter}
              onValueChange={setStatusFilter}
              className="w-full text-xs font-semibold"
              options={STATUS_OPTIONS}
            />
          </div>

          {/* Date Field Type Dropdown */}
          <div className="lg:col-span-3">
            <NiceSelect
              ariaLabel="Select date field"
              value={dateType}
              onValueChange={(val) => setDateType(val as any)}
              className="w-full text-xs font-semibold"
              options={DATE_TYPE_OPTIONS}
            />
          </div>

          {/* Quick Date Presets Dropdown */}
          <div className="lg:col-span-2">
            <NiceSelect
              ariaLabel="Quick date preset"
              value={datePreset}
              onValueChange={handleDatePreset}
              className="w-full text-xs font-semibold"
              options={DATE_PRESET_OPTIONS}
            />
          </div>
        </div>

        {/* Date Filter Row: Only Date Filter (From Date, To Date & Search Button) stays outside */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span>Date Filter:</span>
          </div>

          {/* From Date */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">From</span>
            <input
              type="date"
              value={fromDateInput}
              onChange={(e) => setFromDateInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleApplyDateSearch();
              }}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          {/* To Date */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">To</span>
            <input
              type="date"
              value={toDateInput}
              onChange={(e) => setToDateInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleApplyDateSearch();
              }}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          {/* Search Button for Date Filter */}
          <button
            type="button"
            onClick={handleApplyDateSearch}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-blue-700 active:scale-95 transition"
          >
            <Search className="h-3.5 w-3.5" />
            Search
          </button>

          {/* Reset Filters / Clear */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition"
            >
              <RotateCcw className="h-3.5 w-3.5 text-slate-400" />
              Reset Filters
            </button>
          )}

          {/* Active Range Banner */}
          {(appliedFromDate || appliedToDate) && (
            <div className="ml-auto inline-flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60">
              <span>
                Active: <strong>{appliedFromDate ? formatDate(appliedFromDate) : "Start"}</strong> to{" "}
                <strong>{appliedToDate ? formatDate(appliedToDate) : "End"}</strong> (
                {DATE_TYPE_OPTIONS.find((o) => o.value === dateType)?.label})
              </span>
              <button
                type="button"
                onClick={clearDateFilter}
                className="hover:text-blue-900 dark:hover:text-blue-100 ml-1"
                title="Clear date filter"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* View Mode Switcher: Collection vs Disbursement */}
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-inner">
          <button
            type="button"
            onClick={() => setViewMode("collection")}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 ${
              viewMode === "collection"
                ? "bg-white text-blue-700 shadow-md dark:bg-slate-900 dark:text-blue-400"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <Wallet className="h-4 w-4" />
            <span>Collection</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode("disbursement")}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 ${
              viewMode === "disbursement"
                ? "bg-white text-emerald-700 shadow-md dark:bg-slate-900 dark:text-emerald-400"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <Banknote className="h-4 w-4" />
            <span>Disbursement</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Active Mode: <strong className="text-slate-900 dark:text-white capitalize">{viewMode}</strong>
          </span>
        </div>
      </div>

      {/* Loan Portfolio Table Section */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {totalCount ? (
              <span>
                Showing <strong className="text-slate-900 dark:text-white">{startIndex + 1}-{endIndex}</strong> of{" "}
                <strong className="text-slate-900 dark:text-white">{totalCount}</strong> loans
              </span>
            ) : (
              "No matching loans found"
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!totalCount || isExporting}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-xs font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60 shadow-sm transition"
              title={`Export current table to ${viewMode === "collection" ? "Collection" : "Disbursement"} CSV`}
            >
              {isExporting ? <RefreshCw className="h-3.5 w-3.5 animate-spin text-emerald-600" /> : <Download className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />}
              {isExporting ? "Exporting..." : `Export ${viewMode === "collection" ? "Collection" : "Disbursement"} CSV`}
            </button>
            <NiceSelect
              ariaLabel="Loan rows per page"
              value={pageSize}
              onValueChange={setPageSize}
              className="w-32"
              options={PAGE_SIZE_OPTIONS}
            />
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {totals.allLoans} total in system
            </span>
          </div>
        </div>

        {error && (
          <div className="m-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800/80 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/70">
              <tr>
                {(viewMode === "collection" ? COLLECTION_HEADERS : DISBURSEMENT_HEADERS).map(
                  (heading) => (
                    <th
                      key={heading}
                      className="whitespace-nowrap px-4 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800"
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
                  <td
                    colSpan={viewMode === "collection" ? COLLECTION_HEADERS.length : DISBURSEMENT_HEADERS.length}
                    className="px-5 py-16 text-center text-sm text-slate-500 dark:text-slate-400"
                  >
                    <RefreshCw className="mx-auto mb-2 h-6 w-6 animate-spin text-blue-600" />
                    Loading loan portfolio...
                  </td>
                </tr>
              ) : visibleLoans.length ? (
                visibleLoans.map((rawLoan) => {
                  const loan = parseLoanRow(rawLoan);

                  if (viewMode === "collection") {
                    return (
                      <tr key={loan.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                        {/* 0. Loan No. (Loan ID) */}
                        <td className="whitespace-nowrap px-4 py-3.5 font-mono text-xs font-bold text-blue-600 dark:text-blue-400 select-all">
                          <Link to={`/admin/loans/${loan.id}`} className="hover:underline flex items-center gap-1">
                            {loan.loanNo || loan.id}
                          </Link>
                        </td>

                        {/* 1. Name */}
                        <td className="whitespace-nowrap px-4 py-3.5">
                          <div className="text-sm font-bold text-slate-950 dark:text-white">{loan.customerName}</div>
                          <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">{loan.customerId}</div>
                        </td>

                        {/* 2. Email */}
                        <td className="whitespace-nowrap px-4 py-3.5 text-xs text-slate-600 dark:text-slate-300">
                          {loan.email}
                        </td>

                        {/* 3. Mobile */}
                        <td className="whitespace-nowrap px-4 py-3.5 font-mono text-xs font-semibold text-slate-800 dark:text-slate-200 select-all">
                          {loan.mobile}
                        </td>

                        {/* 4. DOB */}
                        <td className="whitespace-nowrap px-4 py-3.5 text-xs text-slate-700 dark:text-slate-300">
                          {loan.dob ? formatDate(loan.dob) : "-"}
                        </td>

                        {/* 5. PAN No. */}
                        <td className="whitespace-nowrap px-4 py-3.5 font-mono text-xs font-bold text-slate-900 dark:text-white uppercase select-all">
                          {loan.panNumber}
                        </td>

                        {/* 6. Loan Amount */}
                        <td className="whitespace-nowrap px-4 py-3.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {formatCurrency(loan.principal)}
                        </td>

                        {/* 7. Repayamount Amount */}
                        <td className="whitespace-nowrap px-4 py-3.5 text-sm font-bold text-slate-950 dark:text-white">
                          {formatCurrency(loan.loanRepayAmount)}
                        </td>

                        {/* 8. Income Amount */}
                        <td className="whitespace-nowrap px-4 py-3.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                          {loan.monthlyIncome ? formatCurrency(loan.monthlyIncome) : "-"}
                        </td>

                        {/* 9. Disbursed Date */}
                        <td className="whitespace-nowrap px-4 py-3.5 text-xs text-slate-700 dark:text-slate-300">
                          {formatDate(loan.disbursedDate)}
                        </td>

                        {/* 10. Repay Date */}
                        <td className="whitespace-nowrap px-4 py-3.5 text-xs font-semibold text-slate-900 dark:text-slate-200">
                          {formatDate(loan.repaymentDate)}
                        </td>

                        {/* 11. LOAN TENURE */}
                        <td className="whitespace-nowrap px-4 py-3.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                          {loan.tenure} Days
                        </td>

                        {/* 12. ROI */}
                        <td className="whitespace-nowrap px-4 py-3.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                          {loan.roi}%
                        </td>

                        {/* 13. Collected Amount */}
                        <td className="whitespace-nowrap px-4 py-3.5 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(loan.collectedAmount)}
                        </td>

                        {/* 14. Collected Mode */}
                        <td className="whitespace-nowrap px-4 py-3.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                          {loan.collectedMode}
                        </td>

                        {/* 15. Collected Date */}
                        <td className="whitespace-nowrap px-4 py-3.5 text-xs text-slate-700 dark:text-slate-300">
                          {formatDate(loan.collectedDate)}
                        </td>

                        {/* 16. Actions */}
                        <td className="whitespace-nowrap px-4 py-3.5 text-xs">
                          <Link
                            to={`/loan-management/${encodeURIComponent(loan.id)}`}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-800 dark:text-blue-400 dark:hover:bg-slate-700 transition"
                            title="View Full Loan Profile"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View
                          </Link>
                        </td>
                      </tr>
                    );
                  }

                  // Disbursement Mode
                  return (
                    <tr key={loan.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors text-xs">
                      {/* 1. LeadID */}
                      <td className="whitespace-nowrap px-4 py-3.5 font-mono font-bold text-slate-900 dark:text-white select-all">
                        {loan.leadId}
                      </td>

                      {/* 2. State Name */}
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-700 dark:text-slate-300">
                        {loan.stateName}
                      </td>

                      {/* 3. City Name */}
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-700 dark:text-slate-300">
                        {loan.cityName}
                      </td>

                      {/* 4. Branch Name */}
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-700 dark:text-slate-300">
                        {loan.branchName}
                      </td>

                      {/* 5. Customer ID */}
                      <td className="whitespace-nowrap px-4 py-3.5 font-mono text-slate-700 dark:text-slate-300 select-all">
                        {loan.customerId}
                      </td>

                      {/* 6. Pancard */}
                      <td className="whitespace-nowrap px-4 py-3.5 font-mono font-bold uppercase text-slate-900 dark:text-white select-all">
                        {loan.panNumber}
                      </td>

                      {/* 7. Loan No. */}
                      <td className="whitespace-nowrap px-4 py-3.5 font-mono font-bold text-blue-700 dark:text-blue-400 select-all">
                        {loan.loanNo}
                      </td>

                      {/* 8. Customer Name */}
                      <td className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-950 dark:text-white">
                        {loan.customerName}
                      </td>

                      {/* 9. Mobile Number */}
                      <td className="whitespace-nowrap px-4 py-3.5 font-mono text-slate-800 dark:text-slate-200 select-all">
                        {loan.mobileNumber}
                      </td>

                      {/* 10. Gender */}
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-700 dark:text-slate-300">
                        {loan.gender}
                      </td>

                      {/* 11. DOB */}
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-700 dark:text-slate-300">
                        {loan.dob ? formatDate(loan.dob) : "-"}
                      </td>

                      {/* 12. Alternative Number */}
                      <td className="whitespace-nowrap px-4 py-3.5 font-mono text-slate-600 dark:text-slate-400 select-all">
                        {loan.alternativeNumber}
                      </td>

                      {/* 13. Email */}
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-600 dark:text-slate-400">
                        {loan.email}
                      </td>

                      {/* 14. Loan Amount */}
                      <td className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-900 dark:text-white">
                        {formatCurrency(loan.principal)}
                      </td>

                      {/* 15. Disbursed Amount */}
                      <td className="whitespace-nowrap px-4 py-3.5 font-bold text-sky-700 dark:text-sky-400">
                        {formatCurrency(loan.disbursedAmount)}
                      </td>

                      {/* 16. Admin Fee */}
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-700 dark:text-slate-300">
                        {formatCurrency(loan.adminFee)}
                      </td>

                      {/* 17. Admin Fee GST */}
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-700 dark:text-slate-300">
                        {formatCurrency(loan.adminFeeGst)}
                      </td>

                      {/* 18. Total Admin Fee */}
                      <td className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-800 dark:text-slate-200">
                        {formatCurrency(loan.totalAdminFee)}
                      </td>

                      {/* 19. IGST */}
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-700 dark:text-slate-300">
                        {formatCurrency(loan.igst)}
                      </td>

                      {/* 20. CGST */}
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-700 dark:text-slate-300">
                        {formatCurrency(loan.cgst)}
                      </td>

                      {/* 21. SGST */}
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-700 dark:text-slate-300">
                        {formatCurrency(loan.sgst)}
                      </td>

                      {/* 22. Processing */}
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-700 dark:text-slate-300">
                        {formatCurrency(loan.processing)}
                      </td>

                      {/* 23. Tenure */}
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-700 dark:text-slate-300">
                        {loan.tenure} Days
                      </td>

                      {/* 24. ROI(%) */}
                      <td className="whitespace-nowrap px-4 py-3.5 font-bold text-slate-800 dark:text-slate-200">
                        {loan.roi}%
                      </td>

                      {/* 25. Loan Repay Amount */}
                      <td className="whitespace-nowrap px-4 py-3.5 font-bold text-slate-950 dark:text-white">
                        {formatCurrency(loan.loanRepayAmount)}
                      </td>

                      {/* 26. Disbursement Date */}
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-700 dark:text-slate-300">
                        {formatDate(loan.disbursedDate)}
                      </td>

                      {/* 27. Repayment Date */}
                      <td className="whitespace-nowrap px-4 py-3.5 font-semibold text-slate-800 dark:text-slate-200">
                        {formatDate(loan.repaymentDate)}
                      </td>

                      {/* 28. Mode Of Payment */}
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-700 dark:text-slate-300">
                        {loan.modeOfPayment}
                      </td>

                      {/* 29. Company Bank Account Number */}
                      <td className="whitespace-nowrap px-4 py-3.5 font-mono text-slate-700 dark:text-slate-300 select-all">
                        {loan.companyBankAccount}
                      </td>

                      {/* 30. Customer Bank Account Number */}
                      <td className="whitespace-nowrap px-4 py-3.5 font-mono text-slate-800 dark:text-slate-200 select-all">
                        {loan.accountNumber}
                      </td>

                      {/* 31. Customer Bank Name */}
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-700 dark:text-slate-300">
                        {loan.bankName}
                      </td>

                      {/* 32. Customer Bank IFSC */}
                      <td className="whitespace-nowrap px-4 py-3.5 font-mono text-slate-800 dark:text-slate-200 select-all">
                        {loan.ifscCode}
                      </td>

                      {/* 33. Refrence No Of Disbursement */}
                      <td className="whitespace-nowrap px-4 py-3.5 font-mono font-semibold text-slate-800 dark:text-slate-200 select-all">
                        {loan.disbursementReference}
                      </td>

                      {/* 34. Disbursement Status */}
                      <td className="whitespace-nowrap px-4 py-3.5">
                        <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-800">
                          {loan.disbursementStatus}
                        </span>
                      </td>

                      {/* 35. Repeat Type */}
                      <td className="whitespace-nowrap px-4 py-3.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            loan.repeatType === "Repeat"
                              ? "bg-purple-50 text-purple-700 ring-1 ring-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:ring-purple-800"
                              : "bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:ring-blue-800"
                          }`}
                        >
                          {loan.repeatType}
                        </span>
                      </td>

                      {/* 36. Lead Initiated Date */}
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-700 dark:text-slate-300">
                        {formatDate(loan.leadInitiatedDate)}
                      </td>

                      {/* 37. Sanctioned By */}
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-700 dark:text-slate-300">
                        {loan.sanctionedBy}
                      </td>

                      {/* 38. Approved By */}
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-700 dark:text-slate-300">
                        {loan.approvedBy}
                      </td>

                      {/* 39. Sanction Date */}
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-700 dark:text-slate-300">
                        {formatDate(loan.sanctionDate)}
                      </td>

                      {/* 40. Loan Disbursed By */}
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-700 dark:text-slate-300">
                        {loan.disbursedBy}
                      </td>

                      {/* 41. Loan Disbursed Date */}
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-700 dark:text-slate-300">
                        {formatDate(loan.loanDisbursedDate)}
                      </td>

                      {/* 42. House Type */}
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-700 dark:text-slate-300">
                        {loan.houseType}
                      </td>

                      {/* 43. Address */}
                      <td className="max-w-[200px] truncate px-4 py-3.5 text-slate-600 dark:text-slate-400" title={loan.address}>
                        {loan.address}
                      </td>

                      {/* 44. Pin Code */}
                      <td className="whitespace-nowrap px-4 py-3.5 font-mono text-slate-700 dark:text-slate-300">
                        {loan.pincode}
                      </td>

                      {/* 45. Actions */}
                      <td className="whitespace-nowrap px-4 py-3.5">
                        <Link
                          to={`/loan-management/${encodeURIComponent(loan.id)}`}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-800 dark:text-blue-400 dark:hover:bg-slate-700 transition"
                          title="View Full Loan Profile"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={viewMode === "collection" ? COLLECTION_HEADERS.length : DISBURSEMENT_HEADERS.length}
                    className="px-5 py-12 text-center text-sm text-slate-500 dark:text-slate-400"
                  >
                    No matching loans found in this filter range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination bar */}
        {totalCount > rowsPerPage && (
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
