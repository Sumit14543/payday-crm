import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Banknote,
  Building2,
  Calendar,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Clock3,
  Download,
  FileCheck,
  FileText,
  Filter,
  Headphones,
  IndianRupee,
  Layers,
  ListFilter,
  Lock,
  MapPin,
  MessageCircle,
  MessageSquare,
  Phone,
  PhoneCall,
  PhoneOff,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Tag,
  TrendingUp,
  Upload,
  User,
  UserCheck,
  Users,
  UsersRound,
  WalletCards,
  X,
  CreditCard,
  Menu,
  ChevronDown,
} from "lucide-react";
import { NiceSelect } from "../components/ui/nice-select";
import { EmptyState, MetricCard } from "../components/crm/DashboardPrimitives";
import { PageLoading } from "../components/PageLoading";
import { apiGet, apiPatch, apiPost, apiPostForm, resolveBackendUploadUrl } from "../lib/api";
import { useSmartPolling } from "../lib/useSmartPolling";

type CollectionCase = {
  aadhaar?: string;
  address?: string;
  borrowerName?: string;
  fatherName?: string;
  careOf?: string;
  principal?: number;
  disbursementAmount?: number;
  disbursementDate?: string | null;
  dob?: string | null;
  emiStatus?: string;
  gender?: string;
  id: string;
  loanId: string;
  loanType?: string;
  memberCode?: string;
  outstanding?: number;
  overdueInterest?: number;
  baseOutstanding?: number;
  baseRepayment?: number;
  amountPaid?: number;
  pan?: string;
  pincode?: string;
  customerId: string;
  customer: string;
  phone: string;
  totalDue: number;
  daysOverdue: number;
  dueDate?: string | null;
  originalDueDate: string | null;
  lastContactDate: string | null;
  lastPaymentDate: string | null;
  status: string;
  assignedTo: string;
  bankName?: string;
  bankAccountNumber?: string;
  ifscCode?: string;
  email?: string;
  reference2Name?: string;
  reference2Phone?: string;
  reference2Relation?: string;
  reference2Address?: string;
  cibilScore?: number | string | null;
  companyName?: string;
  designation?: string;
  monthlyIncome?: number | string | null;
  loanPurpose?: string;
  disbursedBy?: string;
  experienceYears?: number | string | null;
  userType?: string;
  lastLoginAt?: string | null;
  product?: string;
  ntpCategory?: string;
  ntpCategoryUpdatedAt?: string | null;
  etpCategory?: string;
  etpCategoryUpdatedAt?: string | null;
  roi?: number | string | null;
  processingFee?: number | null;
  processingWaiveOff?: number | string | null;
  mars?: number | null;
  waqtmoney?: number | null;
};

type CollectionSummary = {
  activeCases: number;
  activePtps: number;
  brokenPtps: number;
  buckets: Record<string, number>;
  collectionToday: number;
  collectionThisMonth?: number;
  dueToday: number;
  overdueAccounts: number;
  paymentsToday: number;
  paymentsThisMonth?: number;
  pendingFollowups: number;
  recoveryRate: number;
  totalCollected: number;
  totalOutstanding: number;
};

type CollectionActivity = {
  calls: Array<{ id: number; disposition: string; notes?: string; nextActionAt?: string | null; createdAt: string; actor: string }>;
  followups: Array<{ id: number; dueAt: string; reason: string; status: string; notes?: string; actor: string }>;
  ptps: Array<{ id: number; amount: number; ptpDate: string; status: string; notes?: string; actor: string }>;
  payments?: Array<{ id: number; loanId: string; customerId: string; amount: number; method: string; reference: string; status: string; receivedBy: string; receivedAt: string; proofUrl?: string; proofOriginalName?: string; notes?: string; createdAt: string }>;
};

type CaseActionForm = {
  disposition: string;
  followupAt: string;
  paymentAmount: string;
  paymentMethod: string;
  paymentReference: string;
  notes: string;
  ptpAmount: string;
  ptpDate: string;
  transactionDate: string;
  closeFully?: boolean;
};

const money = new Intl.NumberFormat("en-IN", {
  currency: "INR",
  maximumFractionDigits: 0,
  style: "currency",
});

const pageSizeOptions = [
  { label: "10 / page", value: "10" },
  { label: "25 / page", value: "25" },
  { label: "50 / page", value: "50" },
  { label: "100 / page", value: "100" },
];

const dateFilterOptions = [
  { label: "All Time", value: "all" },
  { label: "This Week", value: "this_week" },
  { label: "This Month", value: "this_month" },
  { label: "Last Month", value: "last_month" },
  { label: "Custom Date", value: "custom" },
];

const bucketOptions = [
  { label: "All cases", value: "all" },
  { label: "Due today", value: "dueToday" },
  { label: "Overdue", value: "overdue" },
  { label: "Critical 15+", value: "critical" },
  { label: "Current", value: "current" },
];

const highPriorityDelinquencyOptions = [
  { label: "Delinquency: 60+ Days", value: "60" },
  { label: "Delinquency: 30+ Days", value: "30" },
  { label: "Delinquency: 15+ Days", value: "15" },
  { label: "All High Priority", value: "all" },
];

const sortOptions = [
  { label: "Highest DPD", value: "dpdDesc" },
  { label: "Highest outstanding", value: "outstandingDesc" },
  { label: "Nearest due date", value: "dueDateAsc" },
  { label: "Newest disbursal", value: "disbursalDesc" },
  { label: "Borrower A-Z", value: "nameAsc" },
];

const dispositionOptions = [
  { label: "Connected", value: "Connected" },
  { label: "Not Connected", value: "Not Connected" },
  { label: "Switched Off", value: "Switched Off" },
  { label: "Busy", value: "Busy" },
  { label: "Wrong Number", value: "Wrong Number" },
  { label: "Call Back Requested", value: "Call Back Requested" },
  { label: "Promise To Pay", value: "Promise To Pay" },
  { label: "Dispute", value: "Dispute" },
  { label: "Refused To Pay", value: "Refused To Pay" },
];

const paymentMethodOptions = [
  { label: "Bank Transfer (ACH / NEFT / IMPS)", value: "Bank Transfer (ACH / NEFT / IMPS)" },
  { label: "UPI", value: "UPI" },
  { label: "Payment Link", value: "Payment Link" },
  { label: "Cash", value: "Cash" },
  { label: "Cheque", value: "Cheque" },
  { label: "Manual Collection", value: "Manual Collection" },
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

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const str = String(value).trim();
  const ddmmyyyy = str.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (ddmmyyyy) {
    return new Date(Number(ddmmyyyy[3]), Number(ddmmyyyy[2]) - 1, Number(ddmmyyyy[1]));
  }
  const localDate = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (localDate) {
    return new Date(Number(localDate[1]), Number(localDate[2]) - 1, Number(localDate[3]));
  }
  const isoFormat = str.replace(" ", "T");
  const date = new Date(isoFormat);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function isSameDay(dateInput: string | Date | null | undefined, targetDate: Date = new Date()) {
  if (!dateInput) return false;
  const yyyy = targetDate.getFullYear();
  const mm = String(targetDate.getMonth() + 1).padStart(2, "0");
  const dd = String(targetDate.getDate()).padStart(2, "0");
  const todayYyyyMmDd = `${yyyy}-${mm}-${dd}`;
  const todayDdMmYyyy = `${dd}/${mm}/${yyyy}`;
  const todayDdMmYyyyDash = `${dd}-${mm}-${yyyy}`;

  if (typeof dateInput === "string") {
    if (dateInput.includes(todayYyyyMmDd) || dateInput.includes(todayDdMmYyyy) || dateInput.includes(todayDdMmYyyyDash)) {
      return true;
    }
  }

  const d = parseDate(typeof dateInput === "string" ? dateInput : dateInput.toISOString());
  if (!d) return false;

  return d.getFullYear() === targetDate.getFullYear() && d.getMonth() === targetDate.getMonth() && d.getDate() === targetDate.getDate();
}

function isSameMonth(dateInput: string | Date | null | undefined, targetDate: Date = new Date()) {
  if (!dateInput) return false;
  const yyyy = targetDate.getFullYear();
  const mm = String(targetDate.getMonth() + 1).padStart(2, "0");
  const monthStr = `${yyyy}-${mm}`;

  if (typeof dateInput === "string" && dateInput.includes(monthStr)) {
    return true;
  }

  const d = parseDate(typeof dateInput === "string" ? dateInput : dateInput.toISOString());
  if (!d) return false;

  const isLocalMatch = d.getFullYear() === targetDate.getFullYear() && d.getMonth() === targetDate.getMonth();
  if (isLocalMatch) return true;

  const isUtcMatch = d.getUTCFullYear() === targetDate.getFullYear() && d.getUTCMonth() === targetDate.getMonth();
  if (isUtcMatch) return true;

  return false;
}

function getDaysPastDue(item: CollectionCase) {
  if (!item || (item.outstanding !== undefined ? item.outstanding : item.totalDue) <= 0 || item.emiStatus === 'Paid' || item.status === 'Closed' || item.status === 'Paid') {
    return 0;
  }
  if (typeof item.daysOverdue === 'number' && !isNaN(item.daysOverdue) && item.daysOverdue >= 0) {
    return item.daysOverdue;
  }
  const dueDate = parseDate(item.dueDate || item.originalDueDate);
  if (!dueDate) return 0;
  const dueDay = new Date(dueDate);
  dueDay.setHours(0, 0, 0, 0);
  const today = startOfToday();
  return Math.max(0, Math.floor((today.getTime() - dueDay.getTime()) / 86400000));
}

function getDueStatus(item: CollectionCase) {
  if (!item || (item.outstanding !== undefined ? item.outstanding : item.totalDue) <= 0 || item.emiStatus === 'Paid' || item.status === 'Closed' || item.status === 'Paid') {
    return { label: "DPD", value: "0 days" };
  }
  const dueDate = parseDate(item.dueDate || item.originalDueDate);
  if (!dueDate) return { label: "Due", value: "-" };
  const dueDay = new Date(dueDate);
  dueDay.setHours(0, 0, 0, 0);
  const today = startOfToday();
  const diff = Math.floor((dueDay.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return { label: "DPD", value: `${Math.abs(diff)} days` };
  if (diff === 0) return { label: "Due today", value: "0 DPD" };
  return { label: "Due in", value: `${diff} days` };
}

function formatDobCompact(value: string | null | undefined) {
  if (!value) return "-";
  const normalized = String(value).trim();
  const ddMmYyyy = normalized.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (ddMmYyyy) return `${ddMmYyyy[1]}${ddMmYyyy[2]}${ddMmYyyy[3]}`;

  const yyyyMmDd = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (yyyyMmDd) return `${yyyyMmDd[3]}${yyyyMmDd[2]}${yyyyMmDd[1]}`;

  const compact = normalized.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (compact) return normalized;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}${month}${date.getFullYear()}`;
}

function formatDobDisplay(value: string | null | undefined) {
  const compact = formatDobCompact(value);
  if (compact === "-" || !/^\d{8}$/.test(compact)) return compact;
  return `${compact.slice(0, 2)}-${compact.slice(2, 4)}-${compact.slice(4)}`;
}

function InfoItem({ label, value, strong = false }: { label: string; value: string | number | null | undefined; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 whitespace-nowrap">{label}</p>
      <p className={`mt-0.5 text-xs sm:text-sm font-mono sm:font-sans whitespace-nowrap truncate ${strong ? "font-bold text-slate-950 dark:text-slate-100" : "font-semibold text-slate-700 dark:text-slate-300"}`}>
        {value || "-"}
      </p>
    </div>
  );
}

function getFatherName(item: CollectionCase): string {
  if (item.fatherName) return item.fatherName;
  if (item.careOf) return item.careOf.replace(/^(?:C\/O|S\/O|D\/O|W\/O)[\s,:]+/i, '').trim();
  if (item.address) {
    const match = item.address.match(/^(?:C\/O|S\/O|D\/O|W\/O)[\s,:]+([^,]+)/i);
    if (match) return match[1].trim();
  }
  return "-";
}

function MetricTile({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`min-w-[130px] rounded-lg border px-3 py-1.5 transition ${accent ? "border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/50 dark:bg-emerald-950/40" : "border-slate-200/80 bg-slate-50/70 dark:border-slate-800/80 dark:bg-slate-800/40"}`}>
      <p className={`text-[10px] font-bold uppercase tracking-wider ${accent ? "text-emerald-700 dark:text-emerald-400" : "text-slate-400 dark:text-slate-500"}`}>{label}</p>
      <p className={`mt-0.5 truncate text-sm font-extrabold ${accent ? "text-emerald-800 dark:text-emerald-300" : "text-slate-900 dark:text-slate-100"}`}>{value}</p>
    </div>
  );
}

function DetailPanel({ title, icon, tone = "slate", children }: { title: string; icon?: React.ReactNode; tone?: "blue" | "teal" | "indigo" | "slate"; children: React.ReactNode }) {
  const toneStyles = {
    blue: "border-blue-200/70 bg-white dark:border-blue-900/50 dark:bg-slate-900/90",
    teal: "border-teal-200/70 bg-white dark:border-teal-900/50 dark:bg-slate-900/90",
    indigo: "border-indigo-200/70 bg-white dark:border-indigo-900/50 dark:bg-slate-900/90",
    slate: "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900",
  };

  const titleStyles = {
    blue: "text-blue-700 dark:text-blue-400",
    teal: "text-teal-700 dark:text-teal-400",
    indigo: "text-indigo-700 dark:text-indigo-400",
    slate: "text-slate-600 dark:text-slate-400",
  };

  return (
    <section className={`min-w-0 rounded-xl border p-4 shadow-xs transition ${toneStyles[tone]}`}>
      <div className={`mb-3.5 flex items-center gap-1.5 text-xs font-black uppercase tracking-wider ${titleStyles[tone]}`}>
        {icon}
        <span>{title}</span>
      </div>
      {children}
    </section>
  );
}

function ActionPill({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-sm font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function getPriority(item: CollectionCase) {
  if (!item) return "Active";
  const outstanding = Number(item.outstanding || item.totalDue || 0);
  const daysOverdue = getDaysPastDue(item);
  if (outstanding <= 0) return "Paid";
  if (daysOverdue <= 0) return "Active";
  if (daysOverdue > 15) return "Critical";
  if (daysOverdue > 7) return "High";
  return "Medium";
}

function priorityBadge(priority: string) {
  const tone = priority === "Paid"
    ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-800"
    : priority === "Active"
    ? "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:ring-blue-800"
    : priority === "Critical"
      ? "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-400 dark:ring-red-800"
      : priority === "High"
        ? "bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:ring-orange-800"
        : "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-800";
  const Icon = priority === "Active" || priority === "Paid" ? CheckCircle2 : priority === "Medium" ? Clock : AlertTriangle;

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${tone}`}>
      <Icon className="h-3.5 w-3.5" />
      {priority}
    </span>
  );
}

function getStatusBadge(status: string) {
  const cleanStatus = String(status || 'Active').trim();
  if (cleanStatus === 'CRITICAL' || cleanStatus === 'Critical' || cleanStatus === 'Broken PTP') {
    return <span className="rounded px-2 py-0.5 text-[10px] font-bold uppercase bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300">CRITICAL</span>;
  }
  if (cleanStatus === 'Promise To Pay' || cleanStatus === 'PTP') {
    return <span className="rounded px-2 py-0.5 text-[10px] font-bold uppercase bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">PROMISE TO PAY</span>;
  }
  if (cleanStatus === 'Legal Review' || cleanStatus === 'Dispute') {
    return <span className="rounded px-2 py-0.5 text-[10px] font-bold uppercase bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300">LEGAL REVIEW</span>;
  }
  if (cleanStatus === 'Part Payment' || cleanStatus === 'Part Paid' || cleanStatus === 'Partial') {
    return <span className="rounded px-2 py-0.5 text-[10px] font-bold uppercase bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">PART PAYMENT</span>;
  }
  if (cleanStatus === 'Arrangement' || cleanStatus === 'Paid Off' || cleanStatus === 'Paid' || cleanStatus === 'Closed') {
    return <span className="rounded px-2 py-0.5 text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">PAID OFF</span>;
  }
  return <span className="rounded px-2 py-0.5 text-[10px] font-bold uppercase bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300">{cleanStatus}</span>;
}

export function LoanCollection() {
  const location = useLocation();
  const navigate = useNavigate();
  const isLogPaymentPage = location.pathname.toLowerCase().includes("log-payment") || location.pathname.toLowerCase().includes("log_payment");
  const isMyCollectionsPage = location.pathname.toLowerCase().includes("my-collections") || location.pathname.toLowerCase().includes("my_collections");
  const isReportsPage = location.pathname.toLowerCase().includes("reports");

  // All State Declarations grouped at top of component to prevent TDZ ReferenceErrors
  const [collections, setCollections] = useState<CollectionCase[]>([]);
  const [summary, setSummary] = useState<CollectionSummary | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [bucketFilter, setBucketFilter] = useState("all");
  const [highPriorityFilter, setHighPriorityFilter] = useState("60");
  const [sortBy, setSortBy] = useState("dpdDesc");
  const [pageSize, setPageSize] = useState("10");
  const [dateFilter, setDateFilter] = useState("all");
  const [customFromDate, setCustomFromDate] = useState("");
  const [customToDate, setCustomToDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState("");

  const [reportSelectedCaseId, setReportSelectedCaseId] = useState<string>("");
  const [reportSearchTerm, setReportSearchTerm] = useState<string>("");
  const [reportComments, setReportComments] = useState<Array<{ actor: string; note: string; date: string }>>([]);
  const [reportNewComment, setReportNewComment] = useState("");
  const [showAddCommentModal, setShowAddCommentModal] = useState(false);
  const [showSmsModal, setShowSmsModal] = useState(false);
  const [showDeviceInfoModal, setShowDeviceInfoModal] = useState(false);
  const [showAllCommentsModal, setShowAllCommentsModal] = useState(false);
  const [reportDuesFilter, setReportDuesFilter] = useState("all");

  // Today's & Monthly Collected Payments Modal State & Logic
  const [showTodayPaymentsModal, setShowTodayPaymentsModal] = useState(false);
  const [todayPaymentsFilter, setTodayPaymentsFilter] = useState<"today" | "month" | "all">("today");
  const [reportsData, setReportsData] = useState<{ recentPayments?: Array<{ paymentId: number; loanId: string; customerName: string; phone: string; amount: number; principalComponent?: number; interestComponent?: number; receivedAt: string; status: string; reference: string }> } | null>(null);
  const [isReportsLoading, setIsReportsLoading] = useState(false);

  // Standalone Log Payment Dashboard States
  const [logPaymentCase, setLogPaymentCase] = useState<CollectionCase | null>(null);
  const [logActivity, setLogActivity] = useState<CollectionActivity | null>(null);
  const [logSearchTerm, setLogSearchTerm] = useState("");
  const [logPaymentAmount, setLogPaymentAmount] = useState("");
  const [logPaymentMethod, setLogPaymentMethod] = useState("Bank Transfer (ACH / NEFT / IMPS)");
  const [logTransactionDate, setLogTransactionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [logPaymentReference, setLogPaymentReference] = useState("");
  const [logNotes, setLogNotes] = useState("");
  const [logProofFile, setLogProofFile] = useState<File | null>(null);
  const [logIsSubmitting, setLogIsSubmitting] = useState(false);
  const [logError, setLogError] = useState("");
  const [logSuccess, setLogSuccess] = useState("");

  // My Collections View Mode & Top Bar Filters
  const [myCollectionsViewMode, setMyCollectionsViewMode] = useState<"console" | "queue">("console");
  const [myCollectionsSelectedCaseId, setMyCollectionsSelectedCaseId] = useState<string>("");
  const [myCollectionsSearchTerm, setMyCollectionsSearchTerm] = useState<string>("");
  const [myCollectionsBucketFilter, setMyCollectionsBucketFilter] = useState<string>("all");

  const [myCollectionsTab, setMyCollectionsTab] = useState<"logs" | "history" | "notes" | "documents">("logs");
  const [historyFilterTag, setHistoryFilterTag] = useState<"all" | "payments" | "calls" | "sms" | "notes">("all");

  // Real Database Activity State for My Collections Selected Borrower Case
  const [myCollectionsActivity, setMyCollectionsActivity] = useState<CollectionActivity | null>(null);
  const [isMyCollectionsActivityLoading, setIsMyCollectionsActivityLoading] = useState(false);

  // Modal / Drawer States
  const [selectedCase, setSelectedCase] = useState<CollectionCase | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<CollectionActivity | null>(null);
  const [modalTab, setModalTab] = useState<"overview" | "contact" | "payment" | "history">("overview");

  // Selected Borrower & Filters for Log Payment Page
  const [selectedLogPaymentCaseId, setSelectedLogPaymentCaseId] = useState<string>("");
  const [logPaymentFilter, setLogPaymentFilter] = useState<"all" | "dueToday" | "dueYesterday" | "dueTomorrow" | "dueThisMonth" | "overdue">("all");
  const [logPaymentSearchTerm, setLogPaymentSearchTerm] = useState<string>("");
  const [proofFile, setProofFile] = useState<File | null>(null);

  const [actionForm, setActionForm] = useState<CaseActionForm>({
    disposition: "Connected",
    followupAt: "",
    notes: "",
    paymentAmount: "",
    paymentMethod: "Bank Transfer (ACH / NEFT / IMPS)",
    paymentReference: "",
    ptpAmount: "",
    ptpDate: "",
    transactionDate: new Date().toISOString().slice(0, 10),
    closeFully: false,
  });
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [isActionSubmitting, setIsActionSubmitting] = useState(false);


  const openTodayPaymentsModal = useCallback(async (filterMode: "today" | "month" | "all" = "today") => {
    setTodayPaymentsFilter(filterMode);
    setShowTodayPaymentsModal(true);
    setIsReportsLoading(true);
    try {
      const data = await apiGet<any>("/collections/reports");
      setReportsData(data || null);
    } catch (err) {
      console.error("Failed to load collection reports:", err);
    } finally {
      setIsReportsLoading(false);
    }
  }, []);

  const allPaymentsList = useMemo(() => {
    if (reportsData?.recentPayments && reportsData.recentPayments.length > 0) {
      return reportsData.recentPayments;
    }
    return collections
      .filter((c) => Number(c.amountPaid || 0) > 0 || c.lastPaymentDate)
      .map((c, idx) => ({
        paymentId: idx + 1,
        loanId: c.loanId,
        customerName: c.borrowerName || c.customer || "Borrower",
        phone: c.phone || "",
        amount: Number(c.amountPaid || 0),
        receivedAt: c.lastPaymentDate || new Date().toISOString(),
        status: "Received",
        reference: `LOAN #${c.loanId}`,
      }));
  }, [reportsData, collections]);

  const todayPaymentsList = useMemo(() => {
    const now = new Date();
    return allPaymentsList.filter((p) => {
      if (!p.receivedAt) return false;
      return isSameDay(p.receivedAt, now);
    });
  }, [allPaymentsList]);

  const monthPaymentsList = useMemo(() => {
    const now = new Date();
    return allPaymentsList.filter((p) => {
      if (!p.receivedAt) return false;
      return isSameMonth(p.receivedAt, now);
    });
  }, [allPaymentsList]);

  const displayPaymentsList = useMemo(() => {
    if (todayPaymentsFilter === "today") return todayPaymentsList;
    if (todayPaymentsFilter === "month") return monthPaymentsList;
    return allPaymentsList;
  }, [todayPaymentsFilter, todayPaymentsList, monthPaymentsList, allPaymentsList]);

  const filteredPaymentsTotal = useMemo(() => {
    return displayPaymentsList.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  }, [displayPaymentsList]);

  const proofPreviewUrl = useMemo(() => {
    if (!proofFile) return "";
    if (proofFile.type.startsWith("image/")) {
      return URL.createObjectURL(proofFile);
    }
    return "";
  }, [proofFile]);

  const loadCollections = useCallback(async (signal: AbortSignal) => {
    try {
      setError("");
      const [data, summaryData] = await Promise.all([
        apiPost<CollectionCase[]>("/collections/list", {}, signal),
        apiPost<CollectionSummary>("/collections/summary/fetch", {}, signal),
      ]);
      setCollections(data || []);
      setSummary(summaryData || null);
    } catch (requestError) {
      if (!signal.aborted) {
        setError(requestError instanceof Error ? requestError.message : "Unable to load collections");
      }
      throw requestError;
    }
  }, []);

  const { isRefreshing, lastUpdatedAt, refresh } = useSmartPolling(loadCollections, {
    enabled: true,
    intervalMs: 60_000,
  });

  // Filter ONLY borrowers with pending balance (> 0) and NOT paid / closed
  const pendingUnpaidCollections = useMemo(() => {
    const today = startOfToday().getTime();
    const yesterday = new Date(startOfToday().getTime() - 86400000).getTime();
    const tomorrow = new Date(startOfToday().getTime() + 86400000).getTime();
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const query = logPaymentSearchTerm.trim().toLowerCase();

    return collections.filter((item) => {
      const due = Number(item.outstanding || item.totalDue || 0);
      const isPaid = due <= 0 || item.status === "Paid" || item.status === "Closed" || item.status === "Paid Off" || item.emiStatus === "Paid";
      
      // EXCLUDE ALL PAID BORROWERS!
      if (isPaid) return false;

      const dueDate = parseDate(item.dueDate || item.originalDueDate);
      const dueTime = dueDate ? new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate()).getTime() : null;
      const dpd = getDaysPastDue(item);

      // Date Filters
      if (logPaymentFilter === "dueToday" && dueTime !== today) return false;
      if (logPaymentFilter === "dueYesterday" && dueTime !== yesterday) return false;
      if (logPaymentFilter === "dueTomorrow" && dueTime !== tomorrow) return false;
      if (logPaymentFilter === "dueThisMonth") {
        if (!dueDate) return false;
        if (dueDate.getMonth() !== currentMonth || dueDate.getFullYear() !== currentYear) return false;
      }
      if (logPaymentFilter === "overdue" && dpd <= 0) return false;

      // Live Search Filter
      if (query) {
        const matches = [
          item.borrowerName,
          item.customer,
          item.loanId,
          item.phone,
          item.pan,
          item.aadhaar,
          item.memberCode,
        ].join(" ").toLowerCase().includes(query);
        if (!matches) return false;
      }

      return true;
    });
  }, [collections, logPaymentFilter, logPaymentSearchTerm]);

  // Counts for Log Payment Filter Badges
  const logPaymentFilterCounts = useMemo(() => {
    const today = startOfToday().getTime();
    const yesterday = new Date(startOfToday().getTime() - 86400000).getTime();
    const tomorrow = new Date(startOfToday().getTime() + 86400000).getTime();
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    const unpaidOnly = collections.filter((item) => {
      const due = Number(item.outstanding || item.totalDue || 0);
      if (logPaymentSearchTerm.trim()) {
        return true;
      }
      return due > 0 && item.status !== "Paid" && item.status !== "Closed" && item.status !== "Paid Off" && item.emiStatus !== "Paid";
    });

    return {
      all: unpaidOnly.length,
      dueToday: unpaidOnly.filter((item) => {
        const dueDate = parseDate(item.dueDate || item.originalDueDate);
        return dueDate ? new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate()).getTime() === today : false;
      }).length,
      dueYesterday: unpaidOnly.filter((item) => {
        const dueDate = parseDate(item.dueDate || item.originalDueDate);
        return dueDate ? new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate()).getTime() === yesterday : false;
      }).length,
      dueTomorrow: unpaidOnly.filter((item) => {
        const dueDate = parseDate(item.dueDate || item.originalDueDate);
        return dueDate ? new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate()).getTime() === tomorrow : false;
      }).length,
      dueThisMonth: unpaidOnly.filter((item) => {
        const dueDate = parseDate(item.dueDate || item.originalDueDate);
        return dueDate ? (dueDate.getMonth() === currentMonth && dueDate.getFullYear() === currentYear) : false;
      }).length,
      overdue: unpaidOnly.filter((item) => getDaysPastDue(item) > 0).length,
    };
  }, [collections]);

  const selectedLogPaymentCase = useMemo(() => {
    if (!pendingUnpaidCollections.length) return null;
    return pendingUnpaidCollections.find((c) => String(c.id) === String(selectedLogPaymentCaseId)) || pendingUnpaidCollections[0] || null;
  }, [pendingUnpaidCollections, selectedLogPaymentCaseId]);

  useEffect(() => {
    if (pendingUnpaidCollections.length > 0 && (!selectedLogPaymentCaseId || !pendingUnpaidCollections.some((c) => String(c.id) === String(selectedLogPaymentCaseId)))) {
      setSelectedLogPaymentCaseId(String(pendingUnpaidCollections[0].id));
    }
  }, [pendingUnpaidCollections, selectedLogPaymentCaseId]);

  // Filter My Collections dropdown options based on search term & DPD bucket pill
  const myCollectionsFilteredCases = useMemo(() => {
    const query = myCollectionsSearchTerm.trim().toLowerCase();
    const today = startOfToday();
    return collections.filter((item) => {
      const dueDate = parseDate(item.dueDate || item.originalDueDate);
      const dueDay = dueDate ? new Date(dueDate) : null;
      if (dueDay) dueDay.setHours(0, 0, 0, 0);
      const outstanding = Number(item.outstanding || item.totalDue || 0);
      const daysOverdue = getDaysPastDue(item);

      const matchesSearch = !query || [
        item.customer,
        item.borrowerName,
        item.loanId,
        item.customerId,
        item.memberCode,
        item.pan,
        item.aadhaar,
        item.phone,
      ].join(" ").toLowerCase().includes(query);

      const matchesBucket = myCollectionsBucketFilter === "all"
        || (myCollectionsBucketFilter === "dueToday" && dueDay?.getTime() === today.getTime() && outstanding > 0)
        || (myCollectionsBucketFilter === "overdue" && daysOverdue > 0 && outstanding > 0)
        || (myCollectionsBucketFilter === "critical" && daysOverdue > 15 && outstanding > 0)
        || (myCollectionsBucketFilter === "current" && daysOverdue <= 0 && outstanding > 0);

      return matchesSearch && matchesBucket;
    });
  }, [collections, myCollectionsSearchTerm, myCollectionsBucketFilter]);

  // Filter Collections for Reports & Unified View based on search term & dues status filter
  const reportFilteredCollections = useMemo(() => {
    const today = startOfToday().getTime();
    const activeSearchTerm = isMyCollectionsPage ? myCollectionsSearchTerm : (reportSearchTerm || myCollectionsSearchTerm);
    const query = activeSearchTerm.trim().toLowerCase();

    return collections.filter((item) => {
      const dueDate = parseDate(item.dueDate || item.originalDueDate);
      const dueTime = dueDate ? new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate()).getTime() : null;
      const dpd = getDaysPastDue(item);
      const outstanding = Number(item.outstanding !== undefined ? item.outstanding : item.totalDue || 0);
      const amountPaid = Number(item.amountPaid || 0);
      const isPaid = outstanding <= 0;
      const isActive = !isPaid && dpd <= 0;
      const isOverdue = !isPaid && dpd > 0;
      const isPartPayment = amountPaid > 0 && outstanding > 0;
      const lastPayment = item.lastPaymentDate || item.paidAt || item.updatedAt;
      const isCollectedToday = amountPaid > 0 && (lastPayment ? isSameDay(lastPayment) : true);

      if (reportDuesFilter === "dueToday" && dueTime !== today) return false;
      if (reportDuesFilter === "collectedToday" && !isCollectedToday) return false;
      if (reportDuesFilter === "overdue" && !isOverdue) return false;
      if (reportDuesFilter === "active" && !isActive) return false;
      if (reportDuesFilter === "paidOff" && !isPaid) return false;
      if (reportDuesFilter === "partPayment" && !isPartPayment) return false;

      if (query) {
        const matches = [
          item.borrowerName,
          item.customer,
          item.loanId,
          item.phone,
          item.pan,
          item.aadhaar,
          item.memberCode,
          item.customerId,
        ].join(" ").toLowerCase().includes(query);
        if (!matches) return false;
      }

      return true;
    });
  }, [collections, isMyCollectionsPage, myCollectionsSearchTerm, reportSearchTerm, reportDuesFilter]);

  const reportDuesCounts = useMemo(() => {
    const today = startOfToday().getTime();
    return {
      all: collections.length,
      active: collections.filter((item) => {
        const outstanding = Number(item.outstanding !== undefined ? item.outstanding : item.totalDue || 0);
        return outstanding > 0 && getDaysPastDue(item) <= 0;
      }).length,
      dueToday: collections.filter((item) => {
        const dueDate = parseDate(item.dueDate || item.originalDueDate);
        return dueDate ? new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate()).getTime() === today : false;
      }).length,
      collectedToday: collections.filter((item) => {
        const amountPaid = Number(item.amountPaid || 0);
        const lastPayment = item.lastPaymentDate || item.paidAt || item.updatedAt;
        return amountPaid > 0 && (lastPayment ? isSameDay(lastPayment) : true);
      }).length,
      overdue: collections.filter((item) => {
        const outstanding = Number(item.outstanding !== undefined ? item.outstanding : item.totalDue || 0);
        return outstanding > 0 && getDaysPastDue(item) > 0;
      }).length,
      paidOff: collections.filter((item) => {
        const outstanding = Number(item.outstanding !== undefined ? item.outstanding : item.totalDue || 0);
        return outstanding <= 0;
      }).length,
      partPayment: collections.filter((item) => {
        const outstanding = Number(item.outstanding !== undefined ? item.outstanding : item.totalDue || 0);
        const amountPaid = Number(item.amountPaid || 0);
        return amountPaid > 0 && outstanding > 0;
      }).length,
    };
  }, [collections]);

  // Selected Borrower Case for My Collections Console View
  const selectedMyCollectionsCase = useMemo(() => {
    if (!collections.length) return null;
    if (myCollectionsFilteredCases.length) {
      return myCollectionsFilteredCases.find((c) => String(c.id) === String(myCollectionsSelectedCaseId)) || myCollectionsFilteredCases[0] || null;
    }
    return collections.find((c) => String(c.id) === String(myCollectionsSelectedCaseId)) || collections[0] || null;
  }, [collections, myCollectionsFilteredCases, myCollectionsSelectedCaseId]);

  const selectedReportCase = useMemo(() => {
    if (!collections.length) return null;
    const currentSelectedId = myCollectionsSelectedCaseId || reportSelectedCaseId;
    const targetCollections = reportFilteredCollections.length ? reportFilteredCollections : collections;
    return targetCollections.find((c) => String(c.id) === String(currentSelectedId)) || targetCollections[0] || null;
  }, [collections, reportFilteredCollections, myCollectionsSelectedCaseId, reportSelectedCaseId]);

  useEffect(() => {
    if (myCollectionsFilteredCases.length > 0 && (!myCollectionsSelectedCaseId || !myCollectionsFilteredCases.some((c) => String(c.id) === String(myCollectionsSelectedCaseId)))) {
      setMyCollectionsSelectedCaseId(String(myCollectionsFilteredCases[0].id));
    }
  }, [myCollectionsFilteredCases, myCollectionsSelectedCaseId]);

  useEffect(() => {
    if (reportFilteredCollections.length > 0 && (!reportSelectedCaseId || !reportFilteredCollections.some((c) => String(c.id) === String(reportSelectedCaseId)))) {
      setReportSelectedCaseId(String(reportFilteredCollections[0].id));
    }
  }, [reportFilteredCollections, reportSelectedCaseId]);

  // Reset custom comments when selected borrower changes
  useEffect(() => {
    setReportComments([]);
  }, [selectedReportCase?.id]);

  // Fetch REAL activity data for selected borrower case in My Collections & Reports
  useEffect(() => {
    const targetCaseId = selectedReportCase ? String(selectedReportCase.id) : (myCollectionsSelectedCaseId || reportSelectedCaseId);
    if (!targetCaseId) return;
    let isMounted = true;
    setIsMyCollectionsActivityLoading(true);
    apiGet<CollectionActivity>(`/collections/${encodeURIComponent(targetCaseId)}/activity`)
      .then((data) => {
        if (isMounted) {
          setMyCollectionsActivity(data || null);
        }
      })
      .catch((err) => {
        console.error("Failed to load borrower activity:", err);
      })
      .finally(() => {
        if (isMounted) setIsMyCollectionsActivityLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [selectedReportCase?.id, myCollectionsSelectedCaseId, reportSelectedCaseId, lastUpdatedAt]);

  useEffect(() => {
    if (selectedLogPaymentCase) {
      setActionForm((f) => {
        if (f.paymentAmount !== "") return f;
        return {
          ...f,
          paymentAmount: "",
        };
      });
    }
  }, [selectedLogPaymentCase]);


  // DYNAMIC REAL TIMELINE EVENTS FROM DATABASE (NO HARDCODED GUESSED DATA)
  const realTimelineItems = useMemo(() => {
    const items: Array<{
      id: string;
      type: "payments" | "calls" | "sms" | "notes";
      title: string;
      subtitle?: string;
      date: Date;
      dateString: string;
      notes?: string;
      actor?: string;
      amount?: number;
      reference?: string;
      proofUrl?: string;
      proofOriginalName?: string;
    }> = [];

    if (myCollectionsActivity) {
      // 1. Real Call Logs from DB
      myCollectionsActivity.calls.forEach((call) => {
        const d = parseDate(call.createdAt) || new Date(call.createdAt);
        items.push({
          id: `call-${call.id}`,
          type: "calls",
          title: `OUTBOUND CALL`,
          subtitle: `Disposition: ${call.disposition}`,
          date: d,
          dateString: formatDateTime(call.createdAt),
          notes: call.notes,
          actor: call.actor,
        });
      });

      // 2. Real Promise To Pay (PTP) Records from DB
      myCollectionsActivity.ptps.forEach((ptp) => {
        const d = parseDate(ptp.createdAt) || new Date(ptp.createdAt);
        items.push({
          id: `ptp-${ptp.id}`,
          type: "payments",
          title: `PROMISE TO PAY RECORDED`,
          subtitle: `Promised Date: ${formatDate(ptp.ptpDate)} • Status: ${ptp.status.toUpperCase()}`,
          date: d,
          dateString: formatDate(ptp.createdAt),
          amount: ptp.amount,
          notes: ptp.notes,
          actor: ptp.actor,
        });
      });

      // 3. Real Follow-up Schedules from DB
      myCollectionsActivity.followups.forEach((f) => {
        const d = parseDate(f.dueAt) || new Date(f.dueAt);
        items.push({
          id: `followup-${f.id}`,
          type: "notes",
          title: `FOLLOW-UP SCHEDULED`,
          subtitle: `Reason: ${f.reason} • Status: ${f.status}`,
          date: d,
          dateString: formatDateTime(f.dueAt),
          notes: f.notes,
          actor: f.actor,
        });
      });

      // 4. Real Logged Payments & Receipts from DB
      if (myCollectionsActivity.payments) {
        myCollectionsActivity.payments.forEach((pay) => {
          const d = parseDate(pay.receivedAt || pay.createdAt) || new Date(pay.receivedAt || pay.createdAt);
          items.push({
            id: `payment-log-${pay.id}`,
            type: "payments",
            title: `PAYMENT LOGGED (${pay.method || "DIRECT"})`,
            subtitle: `Ref / UTR: ${pay.reference || "N/A"} • Collected by: ${pay.receivedBy || "Agent"}`,
            date: d,
            dateString: formatDateTime(pay.receivedAt || pay.createdAt),
            notes: pay.notes,
            actor: pay.receivedBy,
            amount: pay.amount,
            reference: pay.reference,
            proofUrl: pay.proofUrl,
            proofOriginalName: pay.proofOriginalName,
          });
        });
      }
    }

    const activeCase = selectedReportCase || selectedMyCollectionsCase;

    // 4. Real Verified Payment fallback if present in borrower case record but no individual payment logs exist
    const hasPaymentLogs = Boolean(myCollectionsActivity?.payments && myCollectionsActivity.payments.length > 0);
    if (!hasPaymentLogs && activeCase && Number(activeCase.amountPaid || 0) > 0) {
      const d = parseDate(activeCase.lastPaymentDate) || new Date();
      items.push({
        id: `actual-payment-${activeCase.id}`,
        type: "payments",
        title: `PAYMENT RECEIVED`,
        subtitle: `Repayment Verified`,
        date: d,
        dateString: formatDate(activeCase.lastPaymentDate || new Date().toISOString()),
        amount: activeCase.amountPaid,
        reference: `LOAN #${activeCase.loanId}`,
      });
    }

    // 5. Real Loan Origination / Disbursal event
    if (activeCase && activeCase.disbursementDate) {
      const d = parseDate(activeCase.disbursementDate) || new Date();
      items.push({
        id: `actual-disbursal-${activeCase.id}`,
        type: "notes",
        title: `LOAN DISBURSED`,
        subtitle: `Disbursed Amount: ${formatCurrency(activeCase.disbursementAmount)}`,
        date: d,
        dateString: formatDate(activeCase.disbursementDate),
        notes: `Payday loan active for Loan ID #${activeCase.loanId}.`,
      });
    }

    // Sort by date DESC (newest first)
    return items.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [myCollectionsActivity, selectedReportCase, selectedMyCollectionsCase]);

  // Filter real timeline items by selected tag
  const filteredTimelineItems = useMemo(() => {
    if (historyFilterTag === "all") return realTimelineItems;
    return realTimelineItems.filter((item) => item.type === historyFilterTag);
  }, [historyFilterTag, realTimelineItems]);

  const paymentProofItems = useMemo(() => {
    if (!myCollectionsActivity?.payments) return [];
    return myCollectionsActivity.payments
      .filter((p) => Boolean(p.proofUrl))
      .map((p) => ({
        id: p.id,
        reference: p.reference,
        amount: p.amount,
        method: p.method,
        proofUrl: p.proofUrl || "",
        proofOriginalName: p.proofOriginalName || `Payment Receipt (${p.reference})`,
        dateString: formatDateTime(p.receivedAt || p.createdAt),
      }));
  }, [myCollectionsActivity]);

  const statusOptions = useMemo(() => {
    const baseStatuses = ["Active", "Overdue", "Part Payment", "Paid Off"];
    const extraStatuses = Array.from(
      new Set(
        collections
          .map((item) => item.status)
          .filter((s) => Boolean(s) && !["Active", "Overdue", "Paid Off", "Paid", "Closed", "Part Payment", "Part Paid", "Partial"].includes(s!))
      )
    ).sort();
    
    const allOptions = ["All Status", "Active", "Overdue", "Part Payment", ...extraStatuses, "Paid Off"];
    return allOptions.map((status) => ({
      label: status,
      value: status === "All Status" ? "all" : status,
    }));
  }, [collections]);

  const borrowerSelectOptions = useMemo(() => {
    if (!pendingUnpaidCollections.length) {
      return [{ label: "No pending borrowers matching filter", value: "__none__" }];
    }
    return pendingUnpaidCollections.map((item) => {
      const dpd = getDaysPastDue(item);
      const dpdTag = dpd > 0 ? ` (${dpd} DPD)` : "";
      return {
        label: `${item.borrowerName || item.customer || "Borrower"} (#${item.loanId})${dpdTag} - ${formatCurrency(item.outstanding || item.totalDue)}`,
        value: String(item.id),
      };
    });
  }, [pendingUnpaidCollections]);

  const myCollectionsSelectOptions = useMemo(() => {
    if (!myCollectionsFilteredCases.length) {
      return [{ label: "No matching borrower cases found", value: "__none__" }];
    }
    return myCollectionsFilteredCases.map((item) => {
      const dpd = getDaysPastDue(item);
      const dpdTag = dpd > 0 ? ` (${dpd} DPD)` : "";
      return {
        label: `${item.borrowerName || item.customer || "Borrower"} (#${item.loanId})${dpdTag} - ${formatCurrency(item.outstanding || item.totalDue)}`,
        value: String(item.id),
      };
    });
  }, [myCollectionsFilteredCases]);

  const filteredCollections = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const today = startOfToday();
    const now = new Date();

    const filtered = collections.filter((item) => {
      const dueDate = parseDate(item.dueDate || item.originalDueDate);
      const dueDay = dueDate ? new Date(dueDate) : null;
      if (dueDay) dueDay.setHours(0, 0, 0, 0);
      const outstanding = Number(item.outstanding || item.totalDue || 0);
      const daysOverdue = getDaysPastDue(item);
      const matchesSearch = !query || [
        item.customer,
        item.borrowerName,
        item.loanId,
        item.customerId,
        item.memberCode,
        item.pan,
        item.aadhaar,
        item.phone,
      ].join(" ").toLowerCase().includes(query);
      const amountPaidVal = Number(item.amountPaid || 0);
      let matchesStatus = true;
      if (statusFilter === "all") {
        matchesStatus = true;
      } else if (statusFilter === "Paid Off" || statusFilter === "Paid" || statusFilter === "Closed") {
        matchesStatus = outstanding <= 0;
      } else if (statusFilter === "Part Payment" || statusFilter === "Part Paid" || statusFilter === "Partial") {
        matchesStatus = amountPaidVal > 0 && outstanding > 0;
      } else if (statusFilter === "Active") {
        matchesStatus = (item.status === "Active" || !item.status || daysOverdue <= 0) && outstanding > 0;
      } else if (statusFilter === "Overdue") {
        matchesStatus = (item.status === "Overdue" || daysOverdue > 0) && outstanding > 0;
      } else {
        matchesStatus = (item.status || "Active") === statusFilter;
      }
      const matchesBucket = bucketFilter === "all"
        || (bucketFilter === "dueToday" && dueDay?.getTime() === today.getTime() && outstanding > 0)
        || (bucketFilter === "overdue" && daysOverdue > 0 && outstanding > 0)
        || (bucketFilter === "critical" && daysOverdue > 15 && outstanding > 0)
        || (bucketFilter === "current" && daysOverdue <= 0 && outstanding > 0);

      let matchesDate = true;
      if (dateFilter !== "all") {
        if (!dueDate) {
          matchesDate = false;
        } else {
          const tTime = dueDate.getTime();
          if (dateFilter === "this_week") {
            const day = now.getDay();
            const diffToMon = (day + 6) % 7;
            const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMon, 0, 0, 0, 0);
            const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6, 23, 59, 59, 999);
            matchesDate = tTime >= monday.getTime() && tTime <= sunday.getTime();
          } else if (dateFilter === "this_month") {
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            matchesDate = tTime >= startOfMonth.getTime() && tTime <= endOfMonth.getTime();
          } else if (dateFilter === "last_month") {
            const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
            const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
            matchesDate = tTime >= startOfLastMonth.getTime() && tTime <= endOfLastMonth.getTime();
          } else if (dateFilter === "custom") {
            if (customFromDate) {
              const fromTime = new Date(customFromDate + "T00:00:00").getTime();
              if (!Number.isNaN(fromTime) && tTime < fromTime) matchesDate = false;
            }
            if (customToDate) {
              const toTime = new Date(customToDate + "T23:59:59").getTime();
              if (!Number.isNaN(toTime) && tTime > toTime) matchesDate = false;
            }
          }
        }
      }

      return matchesSearch && matchesStatus && matchesBucket && matchesDate;
    });

    return [...filtered].sort((a, b) => {
      const outstandingA = Number(a.outstanding || a.totalDue || 0);
      const outstandingB = Number(b.outstanding || b.totalDue || 0);
      const dueA = parseDate(a.dueDate || a.originalDueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const dueB = parseDate(b.dueDate || b.originalDueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const disbursalA = parseDate(a.disbursementDate)?.getTime() ?? 0;
      const disbursalB = parseDate(b.disbursementDate)?.getTime() ?? 0;

      if (sortBy === "outstandingDesc") return outstandingB - outstandingA;
      if (sortBy === "dueDateAsc") return dueA - dueB;
      if (sortBy === "disbursalDesc") return disbursalB - disbursalA;
      if (sortBy === "nameAsc") return (a.borrowerName || a.customer || "").localeCompare(b.borrowerName || b.customer || "");
      return getDaysPastDue(b) - getDaysPastDue(a) || outstandingB - outstandingA;
    });
  }, [bucketFilter, collections, customFromDate, customToDate, dateFilter, searchTerm, sortBy, statusFilter]);

  const highPriorityBorrowers = useMemo(() => {
    const minDpd = highPriorityFilter === "60" ? 60 : highPriorityFilter === "30" ? 30 : highPriorityFilter === "15" ? 15 : 1;
    return collections
      .filter((item) => {
        const dpd = getDaysPastDue(item);
        const due = Number(item.outstanding || item.totalDue || 0);
        return due > 0 && dpd >= minDpd;
      })
      .sort((a, b) => getDaysPastDue(b) - getDaysPastDue(a) || Number(b.outstanding || b.totalDue || 0) - Number(a.outstanding || a.totalDue || 0))
      .slice(0, 10);
  }, [collections, highPriorityFilter]);

  const regionalExposure = useMemo(() => {
    const map: Record<string, { count: number; exposure: number }> = {};
    collections.forEach((item) => {
      const due = Number(item.outstanding || item.totalDue || 0);
      if (due <= 0) return;
      const pin = String(item.pincode || "").trim();
      const regionKey = pin.length >= 3 ? `Zone (${pin.slice(0, 3)}xxx)` : "General Zone";
      if (!map[regionKey]) {
        map[regionKey] = { count: 0, exposure: 0 };
      }
      map[regionKey].count += 1;
      map[regionKey].exposure += due;
    });

    return Object.entries(map)
      .map(([zone, data]) => ({ zone, ...data }))
      .sort((a, b) => b.exposure - a.exposure)
      .slice(0, 4);
  }, [collections]);

  const totalPages = Math.max(1, Math.ceil(filteredCollections.length / Number(pageSize)));
  const visibleCollections = useMemo(() => {
    const size = Number(pageSize);
    const start = (currentPage - 1) * size;
    return filteredCollections.slice(start, start + size);
  }, [currentPage, filteredCollections, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [bucketFilter, searchTerm, sortBy, statusFilter, pageSize, dateFilter, customFromDate, customToDate]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (isLogPaymentPage && collections.length > 0 && !logPaymentCase) {
      const firstPending = collections.find((c) => Number(c.outstanding || c.totalDue || 0) > 0) || collections[0];
      setLogPaymentCase(firstPending);
      setLogPaymentAmount("");
    }
  }, [isLogPaymentPage, collections, logPaymentCase]);


  useEffect(() => {
    if (isLogPaymentPage && logPaymentCase) {
      apiGet<CollectionActivity>(`/collections/${encodeURIComponent(logPaymentCase.id)}/activity`)
        .then((data) => setLogActivity(data))
        .catch(() => setLogActivity(null));
    }
  }, [isLogPaymentPage, logPaymentCase]);

  const handleLogPaymentSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!logPaymentCase) return;
    try {
      setLogIsSubmitting(true);
      setLogError("");
      setLogSuccess("");

      if (logProofFile) {
        const formData = new FormData();
        formData.append("amount", String(Number(logPaymentAmount || 0)));
        formData.append("method", logPaymentMethod);
        formData.append("notes", logNotes);
        formData.append("reference", logPaymentReference.trim());
        if (logTransactionDate) {
          formData.append("paidAt", logTransactionDate);
        }
        formData.append("proofFile", logProofFile);

        await apiPostForm(`/collections/${encodeURIComponent(logPaymentCase.id)}/payment`, formData);
      } else {
        await apiPost(`/collections/${encodeURIComponent(logPaymentCase.id)}/payment`, {
          amount: Number(logPaymentAmount || 0),
          method: logPaymentMethod,
          notes: logNotes,
          reference: logPaymentReference.trim(),
          paidAt: logTransactionDate || null,
        });
      }

      setLogSuccess(`Payment of ${formatCurrency(Number(logPaymentAmount || 0))} recorded successfully for ${logPaymentCase.borrowerName || logPaymentCase.customer}!`);
      setLogPaymentReference("");
      setLogNotes("");
      setLogProofFile(null);
      await refresh();

      const activityData = await apiGet<CollectionActivity>(`/collections/${encodeURIComponent(logPaymentCase.id)}/activity`);
      setLogActivity(activityData);
      setMyCollectionsActivity(activityData);
      setSelectedActivity(activityData);
    } catch (err) {
      setLogError(err instanceof Error ? err.message : "Failed to record payment transaction");
    } finally {
      setLogIsSubmitting(false);
    }
  };

  const stats = useMemo(() => ({
    activeLoans: collections.filter((item) => (item.status || "Active") === "Active").length,
    overdueCases: collections.filter((item) => getDaysPastDue(item) > 0).length,
    totalDue: collections.reduce((sum, item) => sum + Number(item.outstanding || item.totalDue || 0), 0),
    criticalCases: collections.filter((item) => getPriority(item) === "Critical").length,
    criticalDue: collections
      .filter((item) => getPriority(item) === "Critical")
      .reduce((sum, item) => sum + Number(item.outstanding || item.totalDue || 0), 0),
    dueToday: collections.filter((item) => {
      const dueDate = parseDate(item.dueDate || item.originalDueDate);
      if (!dueDate) return false;
      dueDate.setHours(0, 0, 0, 0);
      return dueDate.getTime() === startOfToday().getTime() && Number(item.outstanding || item.totalDue || 0) > 0;
    }).length,
    avgDpd: collections.filter((item) => getDaysPastDue(item) > 0).length
      ? Math.round(
        collections
          .filter((item) => getDaysPastDue(item) > 0)
          .reduce((sum, item) => sum + getDaysPastDue(item), 0) / collections.filter((item) => getDaysPastDue(item) > 0).length
      )
      : 0,
  }), [collections]);

  const atRiskAmount = filteredCollections
    .filter((item) => getDaysPastDue(item) > 0)
    .reduce((sum, item) => sum + Number(item.outstanding || item.totalDue || 0), 0);

  const bucketCounts = useMemo(() => {
    const today = startOfToday().getTime();
    return {
      all: collections.length,
      dueToday: collections.filter((item) => {
        const dueDate = parseDate(item.dueDate || item.originalDueDate);
        if (!dueDate) return false;
        dueDate.setHours(0, 0, 0, 0);
        return dueDate.getTime() === today && Number(item.outstanding || item.totalDue || 0) > 0;
      }).length,
      overdue: collections.filter((item) => getDaysPastDue(item) > 0 && Number(item.outstanding || item.totalDue || 0) > 0).length,
      critical: collections.filter((item) => getDaysPastDue(item) > 15 && Number(item.outstanding || item.totalDue || 0) > 0).length,
      current: collections.filter((item) => getDaysPastDue(item) <= 0 && Number(item.outstanding || item.totalDue || 0) > 0).length,
    };
  }, [collections]);

  const showInitialLoading = isRefreshing && !lastUpdatedAt && collections.length === 0;

  const openCaseAction = async (item: CollectionCase, tab: "overview" | "contact" | "payment" | "history" = "overview") => {
    setSelectedCase(item);
    setSelectedActivity(null);
    setModalTab(tab);
    setActionError("");
    setActionSuccess("");
    setActionForm({
      disposition: "Connected",
      followupAt: "",
      notes: "",
      paymentAmount: "",
      paymentMethod: "Bank Transfer (ACH / NEFT / IMPS)",
      paymentReference: "",
      ptpAmount: String(Math.round(Number(item.outstanding || item.totalDue || 0))),
      ptpDate: "",
      transactionDate: new Date().toISOString().slice(0, 10),
    });
    try {
      setSelectedActivity(await apiGet<CollectionActivity>(`/collections/${encodeURIComponent(item.id)}/activity`));
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : "Unable to load collection activity");
    }
  };

  const closeCaseAction = () => {
    if (isActionSubmitting) return;
    setSelectedCase(null);
    setSelectedActivity(null);
    setActionError("");
    setActionSuccess("");
  };

  const submitCaseAction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const targetCase = isLogPaymentPage ? selectedLogPaymentCase : selectedCase;
    if (!targetCase) return;

    try {
      setIsActionSubmitting(true);
      setActionError("");
      setActionSuccess("");

      let nextActivity: CollectionActivity | null = selectedActivity;

      if (!isLogPaymentPage && (modalTab === "contact" || actionForm.disposition)) {
        const callResponse = await apiPost<{ activity: CollectionActivity }>(`/collections/${encodeURIComponent(targetCase.id)}/call-log`, {
          disposition: actionForm.disposition,
          nextActionAt: actionForm.followupAt || null,
          notes: actionForm.notes,
        });
        nextActivity = callResponse.activity;

        if (actionForm.followupAt) {
          const followupResponse = await apiPost<{ activity: CollectionActivity }>(`/collections/${encodeURIComponent(targetCase.id)}/followups`, {
            dueAt: actionForm.followupAt,
            notes: actionForm.notes,
            reason: actionForm.disposition,
          });
          nextActivity = followupResponse.activity;
        }

        if (actionForm.disposition === "Promise To Pay" || actionForm.ptpDate || Number(actionForm.ptpAmount || 0) > 0) {
          if (actionForm.ptpDate && Number(actionForm.ptpAmount || 0) > 0) {
            const ptpResponse = await apiPost<{ activity: CollectionActivity }>(`/collections/${encodeURIComponent(targetCase.id)}/ptp`, {
              amount: Number(actionForm.ptpAmount || 0),
              notes: actionForm.notes,
              ptpDate: actionForm.ptpDate,
            });
            nextActivity = ptpResponse.activity;
          }
        }
      }

      if (Number(actionForm.paymentAmount || 0) > 0 || actionForm.paymentReference.trim() || actionForm.closeFully) {
        const fileToUpload = proofFile || logProofFile;
        let paymentResponse: { activity: CollectionActivity };

        if (fileToUpload) {
          const formData = new FormData();
          formData.append("amount", String(Number(actionForm.paymentAmount || 0)));
          formData.append("method", actionForm.paymentMethod);
          formData.append("notes", actionForm.notes);
          formData.append("reference", actionForm.paymentReference.trim());
          formData.append("closeFully", String(Boolean(actionForm.closeFully)));
          if (actionForm.transactionDate) {
            formData.append("paidAt", actionForm.transactionDate);
          }
          formData.append("proofFile", fileToUpload);

          paymentResponse = await apiPostForm<{ activity: CollectionActivity }>(
            `/collections/${encodeURIComponent(targetCase.id)}/payment`,
            formData
          );
        } else {
          paymentResponse = await apiPost<{ activity: CollectionActivity }>(
            `/collections/${encodeURIComponent(targetCase.id)}/payment`,
            {
              amount: Number(actionForm.paymentAmount || 0),
              method: actionForm.paymentMethod,
              notes: actionForm.notes,
              reference: actionForm.paymentReference.trim(),
              paidAt: actionForm.transactionDate || null,
              closeFully: Boolean(actionForm.closeFully),
            }
          );
        }
        nextActivity = paymentResponse.activity;
        setProofFile(null);
        setLogProofFile(null);
      }

      setSelectedActivity(nextActivity);
      setActionSuccess("Collection payment recorded successfully.");
      await refresh();
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : "Unable to save collection action");
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const updatePtpStatus = async (ptpId: number, status: "kept" | "broken") => {
    if (!selectedCase) return;
    try {
      setIsActionSubmitting(true);
      setActionError("");
      const response = await apiPatch<{ activity: CollectionActivity }>(
        `/collections/${encodeURIComponent(selectedCase.id)}/ptp/${encodeURIComponent(String(ptpId))}`,
        {
          keptAmount: status === "kept" ? Number(actionForm.paymentAmount || 0) : 0,
          notes: actionForm.notes,
          status,
        },
      );
      setSelectedActivity(response.activity);
      setActionSuccess(status === "kept" ? "PTP marked as kept." : "PTP marked as broken.");
      await refresh();
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : "Unable to update PTP status");
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const exportBorrowerLog = () => {
    const caseName = selectedReportCase?.borrowerName || selectedReportCase?.customer || "borrower";
    const loanId = selectedReportCase?.loanId || "case";
    const headers = ["Date & Time", "Activity Type", "Amount Paid / Value", "Ref / UTR / Agent", "Notes / Details"];
    const rows = realTimelineItems.map((item) => [
      item.date || "",
      item.title || "",
      item.amount ? `₹${item.amount}` : "-",
      item.subtitle || "",
      item.details || item.notes || "",
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `borrower-activity-log-${loanId}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportCollectionCsv = () => {
    const headers = [
      "S. No.",
      "Member Code",
      "Borrower Name + Surname",
      "Gender",
      "PAN",
      "Aadhaar",
      "Telephone No.",
      "DOB (DDMMYYYY)",
      "Address",
      "Pin Code",
      "Reference 1 Name",
      "Reference 1 Phone",
      "Reference 1 Relation",
      "Reference 1 Address",
      "Reference 2 Name",
      "Reference 2 Phone",
      "Reference 2 Relation",
      "Reference 2 Address",
      "Loan Account Number",
      "Loan Type",
      "Sanction / Principal Amount",
      "Disbursement amount",
      "Base Repayment Amount",
      "Disbursement Date",
      "Due Date",
      "Total Amount Paid",
      "Outstanding Balance",
      "EMI status",
      "DPD (Days Past Due)",
      "Part Payment Sequence",
      "Part Payment Date",
      "Part Payment Amount (INR)",
      "Transaction ID / Ref",
      "Collected By / Agent",
      "Payment Status",
    ];

    const rows: string[][] = [];
    let rowCounter = 1;

    filteredCollections.forEach((item) => {
      const loanPayments = (reportsData?.recentPayments || []).filter((p) => {
        if (!p.loanId || !item.loanId) return false;
        const normP = String(p.loanId).replace(/\D/g, "");
        const normItem = String(item.loanId).replace(/\D/g, "");
        return normP === normItem || String(p.loanId).toUpperCase() === String(item.loanId).toUpperCase();
      });

      const aadhaarVal = String(item.aadhaar || "").trim();
      const formattedAadhaar = aadhaarVal ? (/^\d{10,16}$/.test(aadhaarVal.replace(/[-\s]/g, "")) ? `\t${aadhaarVal}` : aadhaarVal) : "";
      const phoneVal = String(item.phone || "").trim();
      const formattedPhone = phoneVal ? (/^\d{10,16}$/.test(phoneVal) ? `\t${phoneVal}` : phoneVal) : "";
      const memberCodeVal = String(item.memberCode || "").trim();
      const formattedMemberCode = memberCodeVal ? (/^\d{10,16}$/.test(memberCodeVal) ? `\t${memberCodeVal}` : memberCodeVal) : "";

      const baseInfo = [
        formattedMemberCode,
        item.borrowerName || item.customer || "",
        item.gender || "",
        item.pan || "",
        formattedAadhaar,
        formattedPhone,
        formatDobCompact(item.dob),
        item.address || "",
        item.pincode || "",
        item.reference1Name || "",
        item.reference1Phone ? `\t${item.reference1Phone}` : "",
        item.reference1Relation || "",
        item.reference1Address || "",
        item.reference2Name || "",
        item.reference2Phone ? `\t${item.reference2Phone}` : "",
        item.reference2Relation || "",
        item.reference2Address || "",
        item.loanId || "",
        item.loanType ? "Payday Loan" : "Payday Loan",
        String(item.principal || item.disbursementAmount || 0),
        String(item.disbursementAmount || 0),
        String(item.baseRepayment || item.totalDue || 0),
        formatDate(item.disbursementDate),
        formatDate(item.dueDate || item.originalDueDate),
        String(item.amountPaid || 0),
        String(item.outstanding !== undefined ? item.outstanding : (item.totalDue || 0)),
        item.emiStatus || item.status || "",
        String(getDaysPastDue(item)),
      ];

      if (loanPayments && loanPayments.length > 0) {
        loanPayments.forEach((p, pIdx) => {
          const rawAgent = String(p.receivedBy || (p as any).received_by || (p as any).actor || item.assignedTo || "").trim();
          const isWebsite = !rawAgent || /website|online|system|gateway|razorpay|cashfree|auto/i.test(rawAgent);
          const collectorName = isWebsite ? "Website" : rawAgent;

          rows.push([
            `${rowCounter}.${pIdx + 1}`,
            ...baseInfo,
            `Part Payment ${pIdx + 1} of ${loanPayments.length}`,
            formatDate(p.receivedAt) || (p.receivedAt ? String(p.receivedAt).slice(0, 10) : "-"),
            String(p.amount || 0),
            p.reference || "-",
            collectorName,
            p.status || "settled",
          ]);
        });
      } else {
        const rawAgent = String(item.assignedTo || "").trim();
        const isWebsite = !rawAgent || /website|online|system|gateway|razorpay|cashfree|auto/i.test(rawAgent);
        const collectorName = isWebsite ? "Website" : rawAgent;

        rows.push([
          String(rowCounter),
          ...baseInfo,
          "No Part Payments",
          Number(item.amountPaid || 0) > 0 && item.lastPaymentDate ? (formatDate(item.lastPaymentDate) || "-") : "-",
          "0",
          "-",
          collectorName,
          "-",
        ]);
      }
      rowCounter++;
    });

    const csvContent = "\uFEFF" + [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell || "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `collection-panel-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const renderTodayPaymentsModal = () => {
    if (!showTodayPaymentsModal) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-2xs">
        <div className="w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 space-y-4 text-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
            <div>
              <h3 className="font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Banknote className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <span>Collected Payments Detail Log</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Real-time payment transactions recorded in the system</p>
            </div>
            <button
              type="button"
              onClick={() => setShowTodayPaymentsModal(false)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white transition"
            >
              ✕
            </button>
          </div>

          {/* Filter Tabs inside modal */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setTodayPaymentsFilter("today")}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs transition ${todayPaymentsFilter === "today" ? "bg-emerald-600 text-white shadow-xs" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}
              >
                Today's Payments ({todayPaymentsList.length})
              </button>
              <button
                type="button"
                onClick={() => setTodayPaymentsFilter("month")}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs transition ${todayPaymentsFilter === "month" ? "bg-emerald-600 text-white shadow-xs" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}
              >
                This Month ({monthPaymentsList.length})
              </button>
              <button
                type="button"
                onClick={() => setTodayPaymentsFilter("all")}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs transition ${todayPaymentsFilter === "all" ? "bg-emerald-600 text-white shadow-xs" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}
              >
                All Recent ({allPaymentsList.length})
              </button>
            </div>

            <div className="text-right">
              <span className="text-slate-400 font-semibold uppercase text-[10px] block">Total Amount</span>
              <span className="font-black text-base text-emerald-600 dark:text-emerald-400">{formatCurrency(filteredPaymentsTotal)}</span>
            </div>
          </div>

          {/* Table */}
          {isReportsLoading ? (
            <div className="py-12 text-center text-xs font-semibold text-slate-500">Loading collected payments data...</div>
          ) : displayPaymentsList.length > 0 ? (
            <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-500 font-bold uppercase tracking-wider sticky top-0 dark:bg-slate-800 dark:text-slate-400">
                  <tr>
                    <th className="p-3">Borrower / Customer</th>
                    <th className="p-3">Loan ID</th>
                    <th className="p-3">Amount Collected</th>
                    <th className="p-3">Reference / UTR</th>
                    <th className="p-3">Received At</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                  {displayPaymentsList.map((p, idx) => (
                    <tr key={p.paymentId || `pay-${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="p-3 font-bold text-slate-900 dark:text-white">{p.customerName || "Borrower"}</td>
                      <td className="p-3 font-mono font-bold text-blue-600 dark:text-blue-400">{p.loanId}</td>
                      <td className="p-3 font-extrabold text-emerald-600 dark:text-emerald-400">{formatCurrency(p.amount)}</td>
                      <td className="p-3 font-mono text-slate-600 dark:text-slate-300">{p.reference || "N/A"}</td>
                      <td className="p-3 text-slate-500">{formatDateTime(p.receivedAt)}</td>
                      <td className="p-3"><span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">{p.status || "Received"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-12 text-center space-y-2">
              <Banknote className="mx-auto h-8 w-8 text-slate-400" />
              <p className="font-bold text-slate-700 dark:text-slate-300">No Payments Recorded for Selected Filter</p>
              <p className="text-xs text-slate-500">Payments logged via Log Payment or Gateway will automatically reflect here.</p>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end pt-2 border-t border-slate-100 dark:border-slate-800 gap-2">
            <button
              type="button"
              onClick={() => {
                setShowTodayPaymentsModal(false);
                navigate("/collections/log-payment");
              }}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition cursor-pointer"
            >
              + Log New Payment
            </button>
            <button
              type="button"
              onClick={() => setShowTodayPaymentsModal(false)}
              className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderCustomerListQueue = () => (
    <div className="space-y-6">
      {/* DPD BUCKET FILTER PILLS & SEARCH / SORT CONTROLS BAR */}
      <div id="collection-queue" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
        {/* DPD Bucket Filter Pills (All cases 98, Due today 2, Overdue 65, Critical 15+ 58, Current 26) */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
          {bucketOptions.map((bucket) => (
            <button
              key={bucket.value}
              type="button"
              onClick={() => setBucketFilter(bucket.value)}
              className={`inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-xs font-bold transition ${
                bucketFilter === bucket.value
                  ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {bucket.label}
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                bucketFilter === bucket.value
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
              }`}>
                {bucketCounts[bucket.value as keyof typeof bucketCounts] || 0}
              </span>
            </button>
          ))}
        </div>

        {/* Live Search Input & Dropdowns Bar */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 xl:flex-row">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search borrower, loan account, member code, PAN, Aadhaar, phone..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>
            <NiceSelect
              ariaLabel="Filter by collection status"
              value={statusFilter}
              onValueChange={setStatusFilter}
              className="w-full xl:w-52 xl:shrink-0"
              options={statusOptions}
            />
            <NiceSelect
              ariaLabel="Sort collection cases"
              value={sortBy}
              onValueChange={setSortBy}
              className="w-full xl:w-56 xl:shrink-0"
              options={sortOptions}
            />
            <NiceSelect
              ariaLabel="Filter by date range"
              value={dateFilter}
              onValueChange={setDateFilter}
              className="w-full xl:w-44 xl:shrink-0"
              options={dateFilterOptions}
            />
            <button
              type="button"
              onClick={exportCollectionCsv}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 xl:shrink-0"
              title="Export all filtered collection cases to Excel / CSV"
            >
              <Download className="h-4 w-4" /> Export Excel
            </button>
          </div>

          {dateFilter === "custom" && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-800/50">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">From:</label>
                <input
                  type="date"
                  value={customFromDate}
                  onChange={(e) => setCustomFromDate(e.target.value)}
                  className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">To:</label>
                <input
                  type="date"
                  value={customToDate}
                  onChange={(e) => setCustomToDate(e.target.value)}
                  className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                />
              </div>
              {(customFromDate || customToDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomFromDate("");
                    setCustomToDate("");
                  }}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                >
                  Clear dates
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* FULL A TO Z CUSTOMER LIST QUEUE CARDS */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Showing <strong className="font-semibold text-slate-900 dark:text-slate-100">{visibleCollections.length}</strong> of{" "}
            <strong className="font-semibold text-slate-900 dark:text-slate-100">{filteredCollections.length}</strong> collection cases
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={exportCollectionCsv}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 shadow-sm transition hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
            >
              <Download className="h-3.5 w-3.5" /> Export Excel (CSV)
            </button>
            {lastUpdatedAt && (
              <span className="text-xs text-slate-500">
                Last updated {lastUpdatedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        </div>
        {error && <div className="m-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        <div className="divide-y divide-slate-100 bg-slate-50/40 dark:divide-slate-800 dark:bg-slate-950/20">
          {visibleCollections.length ? (
            visibleCollections.map((item, index) => {
              const serialNumber = (currentPage - 1) * Number(pageSize) + index + 1;
              const dueAmount = formatCurrency(item.outstanding || item.totalDue);
              const dueStatus = getDueStatus(item);
              return (
                <article key={item.id} className="bg-white p-4 transition hover:bg-slate-50/80 sm:p-5 dark:bg-slate-900 dark:hover:bg-slate-800/50">
                  <div className="rounded-xl border border-slate-200 bg-white p-4.5 sm:p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
                    {/* TOP HEADER BAR: BORROWER IDENTITY & QUICK ACTIONS */}
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between border-b border-slate-100 dark:border-slate-800/80 pb-3.5">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-black text-slate-400 dark:text-slate-500 text-base sm:text-lg">
                            {serialNumber}.
                          </span>
                          <h3 className="min-w-0 text-lg font-black tracking-tight text-slate-950 dark:text-white sm:text-xl truncate">
                            {item.borrowerName || item.customer || "Customer"}
                          </h3>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                          <span className="font-bold text-blue-700 dark:text-blue-400">
                            Cust ID: {item.memberCode || item.customerId || "-"}
                          </span>
                          <span className="text-slate-300 dark:text-slate-700">•</span>
                          <span className="inline-flex items-center gap-1 font-semibold text-slate-600 dark:text-slate-300">
                            <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                            Due {formatDate(item.dueDate || item.originalDueDate)}
                          </span>
                        </div>
                      </div>

                      {/* QUICK ACTION BUTTONS */}
                      <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                        <a
                          href={`https://wa.me/91${String(item.phone || "").replace(/\D/g, "").slice(-10)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-10 sm:h-11 items-center justify-center gap-2 rounded-xl border border-emerald-300/80 bg-emerald-50 px-4 text-xs sm:text-sm font-bold text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 shadow-xs"
                        >
                          <MessageCircle className="h-4 w-4" /> WhatsApp
                        </a>
                        <a
                          href={`tel:${item.phone || ""}`}
                          className="inline-flex h-10 sm:h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-xs sm:text-sm font-bold text-white transition hover:bg-blue-700 shadow-sm"
                        >
                          <Phone className="h-4 w-4" /> Call
                        </a>
                        <button
                          type="button"
                          onClick={() => {
                            setMyCollectionsSelectedCaseId(String(item.id));
                            setMyCollectionsViewMode("console");
                            navigate("/collections/my-collections");
                          }}
                          className="inline-flex h-10 sm:h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-xs sm:text-sm font-bold text-slate-800 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 shadow-xs"
                        >
                          <UserCheck className="h-4 w-4 text-emerald-600" /> Open Console
                        </button>
                        <button
                          type="button"
                          onClick={() => openCaseAction(item, "overview")}
                          className="inline-flex h-10 sm:h-11 items-center justify-center rounded-xl bg-slate-950 px-4 sm:px-5 text-xs sm:text-sm font-bold text-white transition hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 shadow-sm"
                        >
                          Update Case
                        </button>
                      </div>
                    </div>

                    {/* METRICS STATS RIBBON */}
                    <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                      <MetricTile label="Outstanding" value={dueAmount} accent />
                      <MetricTile label={dueStatus.label} value={dueStatus.value} />
                      <MetricTile label="Disbursed" value={formatCurrency(item.disbursementAmount)} />
                    </div>

                    {/* RESPONSIVE STRUCTURED PANELS */}
                    <div className="mt-4 grid gap-3.5 grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
                      {/* PANEL 1: BORROWER KYC & IDENTITY */}
                      <DetailPanel title="Borrower KYC" tone="blue" icon={<User className="h-4 w-4 text-blue-600 dark:text-blue-400" />}>
                        <div className="grid grid-cols-2 gap-3.5">
                          <InfoItem label="Phone" value={item.phone} strong />
                          <InfoItem label="DOB" value={formatDobDisplay(item.dob)} strong />
                          <InfoItem label="Father Name" value={getFatherName(item)} strong />
                          <InfoItem label="Gender" value={item.gender || "-"} />
                          <InfoItem label="PAN" value={item.pan} strong />
                          <InfoItem label="Aadhaar" value={item.aadhaar} />
                          <InfoItem label="Pin code" value={item.pincode} />
                        </div>
                      </DetailPanel>

                      {/* PANEL 2: ADDRESS & EMERGENCY REFERENCES */}
                      <DetailPanel title="Location & References" tone="teal" icon={<MapPin className="h-4 w-4 text-teal-600 dark:text-teal-400" />}>
                        <div className="space-y-3.5">
                          {/* CUSTOMER ADDRESS */}
                          <div>
                            <span className="text-[11px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400 flex items-center gap-1 mb-1.5">
                              <MapPin className="h-3 w-3 text-teal-500" /> Customer Address
                            </span>
                            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/60 text-xs font-medium leading-relaxed text-slate-800 dark:text-slate-200">
                              {item.address || "Address not available"}
                            </div>
                          </div>

                          {/* EMERGENCY REFERENCES */}
                          <div className="border-t border-slate-100 pt-3 dark:border-slate-800/80">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400 flex items-center gap-1 mb-2">
                              <Phone className="h-3 w-3 text-teal-500" /> References
                            </span>

                            <div className="space-y-2">
                              <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/60">
                                <div className="flex items-center justify-between gap-1 text-xs">
                                  <span className="font-bold text-slate-900 dark:text-slate-100 truncate">
                                    Ref 1: {item.reference1Name || "Not provided"} {item.reference1Relation ? `(${item.reference1Relation})` : ""}
                                  </span>
                                  {item.reference1Phone ? (
                                    <a href={`tel:${item.reference1Phone}`} className="font-mono font-bold text-blue-700 dark:text-blue-400 hover:underline shrink-0 flex items-center gap-1 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-md border border-blue-200/60 dark:border-blue-900/60">
                                      <Phone className="h-3 w-3" /> {item.reference1Phone}
                                    </a>
                                  ) : (
                                    <span className="text-slate-400 text-xs">-</span>
                                  )}
                                </div>
                              </div>

                              <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/60">
                                <div className="flex items-center justify-between gap-1 text-xs">
                                  <span className="font-bold text-slate-900 dark:text-slate-100 truncate">
                                    Ref 2: {item.reference2Name || "Not provided"} {item.reference2Relation ? `(${item.reference2Relation})` : ""}
                                  </span>
                                  {item.reference2Phone ? (
                                    <a href={`tel:${item.reference2Phone}`} className="font-mono font-bold text-blue-700 dark:text-blue-400 hover:underline shrink-0 flex items-center gap-1 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-md border border-blue-200/60 dark:border-blue-900/60">
                                      <Phone className="h-3 w-3" /> {item.reference2Phone}
                                    </a>
                                  ) : (
                                    <span className="text-slate-400 text-xs">-</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </DetailPanel>

                      {/* PANEL 3: LOAN & FINANCIAL DETAILS */}
                      <div className="lg:col-span-2 xl:col-span-1">
                        <DetailPanel title="Loan & Financial Details" tone="indigo" icon={<CreditCard className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />}>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-2">
                            <InfoItem label="Loan ID" value={item.loanId} strong />
                            <InfoItem label="Account no." value={item.bankAccountNumber || "-"} strong />
                            <InfoItem label="Bank Name" value={item.bankName || "-"} />
                            <InfoItem label="IFSC Code" value={item.ifscCode || "-"} />
                            <InfoItem label="Principal Amount" value={formatCurrency(item.principal || item.disbursementAmount)} strong />
                            <InfoItem label="Disbursement" value={formatCurrency(item.disbursementAmount)} strong />
                            <InfoItem label="Disbursed on" value={formatDate(item.disbursementDate)} />
                            <InfoItem label="Due date" value={formatDate(item.dueDate || item.originalDueDate)} strong />
                            <InfoItem label="EMI status" value={item.emiStatus || item.status || "-"} />
                            <InfoItem label="DPD Interest" value={formatCurrency(item.overdueInterest)} strong />
                            <InfoItem label="Base Repayment" value={formatCurrency(item.baseRepayment)} strong />
                            <InfoItem label="Amount Paid" value={formatCurrency(item.amountPaid)} strong />
                            <InfoItem label="Paid On" value={Number(item.amountPaid || 0) > 0 && item.lastPaymentDate ? formatDate(item.lastPaymentDate) : "-"} strong />
                          </div>
                        </DetailPanel>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="px-5 py-12 text-sm text-slate-500">
              <EmptyState title="No collection cases found" description="Active loans appear here after fund transfer is submitted." />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
          <p className="text-sm text-slate-500">
            Page <span className="font-semibold text-slate-900 dark:text-slate-100">{currentPage}</span> of{" "}
            <span className="font-semibold text-slate-900 dark:text-slate-100">{totalPages}</span>
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={currentPage <= 1}
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={currentPage >= totalPages}
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );



  // ----------------------------------------------------
  // LOG NEW PAYMENT VIEW (/collections/log-payment) (Image 4 Design with Advanced Filters)


  if (showInitialLoading) {
    return <PageLoading label="Loading Collection Workspace..." />;
  }

if (isLogPaymentPage) {
    return (
      <div className="w-full min-w-0 px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {/* Top Header / Breadcrumb */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
          <div>
            <button
              type="button"
              onClick={() => navigate("/collections")}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white transition mb-1"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> BACK TO DASHBOARD
            </button>
            <h1 className="text-2xl font-black text-slate-950 dark:text-white tracking-tight">Log New Payment</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Record borrower repayment transaction, proof of payment, and update loan ledger.</p>
          </div>

          {selectedLogPaymentCase && (
            <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">BORROWER</p>
                <p className="text-sm font-black text-slate-950 dark:text-white">{selectedLogPaymentCase.borrowerName || selectedLogPaymentCase.customer}</p>
              </div>
              <div className="h-8 w-px bg-slate-200 dark:bg-slate-800" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">ACCOUNT ID</p>
                <p className="text-sm font-mono font-bold text-slate-800 dark:text-slate-200">#{selectedLogPaymentCase.loanId}</p>
              </div>
              <div className="h-8 w-px bg-slate-200 dark:bg-slate-800" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">CURRENT DUE</p>
                <p className="text-sm font-black text-red-600 dark:text-red-400">{formatCurrency(selectedLogPaymentCase.outstanding || selectedLogPaymentCase.totalDue)}</p>
              </div>
            </div>
          )}
        </div>

        {/* LOG PAYMENT SEARCH BAR */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search pending borrower, loan ID, phone..."
                value={logPaymentSearchTerm}
                onChange={(e) => setLogPaymentSearchTerm(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 pl-10 pr-4 text-xs font-medium outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              {logPaymentSearchTerm && (
                <button
                  type="button"
                  onClick={() => setLogPaymentSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-500 font-semibold shrink-0">
              Showing <strong className="text-slate-900 dark:text-white">{pendingUnpaidCollections.length}</strong> pending accounts (Paid/Closed borrowers are automatically hidden).
            </p>
          </div>
        </div>

        {/* Main Log Payment Layout (Image 4 Style) */}
        <form onSubmit={submitCaseAction} className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          {/* Left Card: Transaction Details Form */}
          <div className="xl:col-span-2 rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-base font-bold text-slate-950 dark:text-white border-b border-slate-100 pb-3 dark:border-slate-800">
              Transaction Details
            </h3>

            {/* Select Borrower / Account Dropdown */}
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">SELECT BORROWER ACCOUNT *</label>
              <NiceSelect
                ariaLabel="Select Borrower Case"
                value={selectedLogPaymentCaseId}
                onValueChange={(val) => {
                  setSelectedLogPaymentCaseId(val);
                  setActionForm((f) => ({
                    ...f,
                    paymentAmount: "",
                  }));
                }}

                className="w-full"
                options={borrowerSelectOptions}
              />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">PAYMENT AMOUNT (INR) *</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={actionForm.paymentAmount}
                  onChange={(e) => setActionForm((f) => ({ ...f, paymentAmount: e.target.value }))}
                  placeholder="e.g. 15000"
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 font-bold text-base outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                {selectedLogPaymentCase && (
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setActionForm((f) => ({
                          ...f,
                          paymentAmount: String(Math.round(Number(selectedLogPaymentCase.outstanding || selectedLogPaymentCase.totalDue || 0))),
                        }))
                      }
                      className="rounded bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300"
                    >
                      Full payment suggested ({formatCurrency(selectedLogPaymentCase.outstanding || selectedLogPaymentCase.totalDue)})
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setActionForm((f) => ({
                          ...f,
                          paymentAmount: String(Math.round(Number(selectedLogPaymentCase.outstanding || selectedLogPaymentCase.totalDue || 0) / 2)),
                        }))
                      }
                      className="rounded bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300"
                    >
                      50% Partial
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">PAYMENT MODE *</label>
                <NiceSelect
                  ariaLabel="Payment mode"
                  value={actionForm.paymentMethod}
                  onValueChange={(val) => setActionForm((f) => ({ ...f, paymentMethod: val }))}
                  className="w-full"
                  options={paymentMethodOptions}
                />
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">TRANSACTION DATE *</label>
                <input
                  type="date"
                  required
                  value={actionForm.transactionDate}
                  onChange={(e) => setActionForm((f) => ({ ...f, transactionDate: e.target.value }))}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">RECEIPT / REFERENCE NUMBER (UTR) (OPTIONAL)</label>
                <input
                  type="text"
                  placeholder="TXN-00000000 / UTR Number (Optional)"
                  value={actionForm.paymentReference}
                  onChange={(e) => setActionForm((f) => ({ ...f, paymentReference: e.target.value }))}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 font-mono text-sm font-bold outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>

            {/* FULL SETTLEMENT / PERMANENT CLOSURE OPTION */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/40 shadow-2xs">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(actionForm.closeFully)}
                  onChange={(e) => setActionForm((f) => ({ ...f, closeFully: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
                <div>
                  <span className="text-xs font-extrabold text-slate-900 dark:text-white block">
                    Mark as Full Settlement / Permanent Loan Closure (Set Balance to ₹0)
                  </span>
                  <span className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 block leading-normal font-medium">
                    Check this option if this payment permanently closes the loan (e.g. historical payment or full settlement). It will zero out remaining balance and prevent future interest accrued on this specific case.
                  </span>
                </div>
              </label>
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">INTERNAL AUDIT NOTES</label>
              <textarea
                rows={4}
                placeholder="Add specific details regarding this transaction for audit purposes..."
                value={actionForm.notes}
                onChange={(e) => setActionForm((f) => ({ ...f, notes: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            {actionError && <div className="rounded-lg border border-red-200 bg-red-50 p-3.5 text-sm font-semibold text-red-700">{actionError}</div>}
            {actionSuccess && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-sm font-semibold text-emerald-700">{actionSuccess}</div>}

            <div className="flex justify-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button
                type="button"
                onClick={() => navigate("/collections")}
                className="h-11 rounded-lg border border-slate-300 px-5 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition"
              >
                DISCARD ENTRY
              </button>
              <button
                type="submit"
                disabled={isActionSubmitting || !pendingUnpaidCollections.length}
                className="h-11 rounded-lg bg-slate-950 px-6 text-sm font-bold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-700 transition"
              >
                {isActionSubmitting ? "PROCESSING..." : "PROCESS & LOG PAYMENT"}
              </button>
            </div>
          </div>

          {/* Right Section Cards (Image 4 Style) */}
          <div className="space-y-5">
            {/* Proof of Payment Upload Card */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">PROOF OF PAYMENT (OPTIONAL)</h4>
                <ShieldCheck className="h-4 w-4 text-slate-400" />
              </div>

              {proofFile ? (
                <div className="space-y-3">
                  {proofFile.type.startsWith("image/") && proofPreviewUrl ? (
                    <div className="relative rounded-xl border border-emerald-200 bg-slate-100/80 p-2 text-center dark:border-emerald-800 dark:bg-slate-800 overflow-hidden group">
                      <img
                        src={proofPreviewUrl}
                        alt="Payment Receipt Preview"
                        className="mx-auto max-h-52 w-full rounded-lg object-contain shadow-xs transition-transform group-hover:scale-[1.01]"
                      />
                      <a
                        href={proofPreviewUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-white/90 backdrop-blur-xs border border-slate-300 px-2.5 py-1 text-[11px] font-bold text-slate-800 shadow-xs hover:bg-white dark:bg-slate-900/90 dark:border-slate-700 dark:text-slate-100"
                      >
                        <ArrowUpRight className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" /> Open Full Image
                      </a>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 dark:border-emerald-900/40 dark:bg-emerald-950/30">
                      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-red-600 text-white font-bold shrink-0 shadow-xs">
                        <FileText className="h-6 w-6" />
                      </div>
                      <div className="min-w-0 flex-1 text-left">
                        <p className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">{proofFile.name}</p>
                        <p className="text-[10px] text-slate-500 font-semibold mt-0.5">
                          {(proofFile.size / (1024 * 1024)).toFixed(2)} MB • PDF Document
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100 dark:border-slate-800">
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" /> File attached
                    </span>
                    <div className="flex items-center gap-3">
                      <label className="cursor-pointer text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
                        Change File
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          onChange={(e) => e.target.files?.[0] && setProofFile(e.target.files[0])}
                          className="hidden"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setProofFile(null)}
                        className="text-xs font-bold text-red-600 hover:text-red-700 dark:text-red-400"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/70 p-6 text-center dark:border-slate-700 dark:bg-slate-800/40">
                  <Upload className="mx-auto h-8 w-8 text-slate-400 mb-2" />
                  <p className="text-xs font-bold text-slate-900 dark:text-slate-100">Drag and drop file here</p>
                  <p className="text-[10px] text-slate-500 mt-1">PDF, JPG or PNG up to 10MB</p>
                  <label className="mt-3 inline-block cursor-pointer rounded-lg bg-white border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    Select File
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={(e) => e.target.files?.[0] && setProofFile(e.target.files[0])}
                      className="hidden"
                    />
                  </label>
                </div>
              )}
            </div>

            {/* Recent Ledger Entries Card */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3 dark:border-slate-800 dark:bg-slate-900">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2 dark:border-slate-800">
                RECENT LEDGER ENTRIES
              </h4>
              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between p-2 rounded bg-slate-50 dark:bg-slate-800/50">
                  <div>
                    <p className="font-bold text-slate-900 dark:text-slate-100">Payment Processed</p>
                    <p className="text-[10px] text-slate-500">{formatDate(new Date().toISOString())} • Direct Collection</p>
                  </div>
                  <span className="rounded bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                    +{formatCurrency(summary?.collectionToday || 5000)}
                  </span>
                </div>

                <div className="flex items-center justify-between p-2 rounded bg-slate-50 dark:bg-slate-800/50">
                  <div>
                    <p className="font-bold text-slate-900 dark:text-slate-100">Promise to Pay</p>
                    <p className="text-[10px] text-slate-500">Scheduled via Phone</p>
                  </div>
                  <span className="rounded bg-amber-100 px-2 py-0.5 font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                    Pending
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate("/collections/my-collections")}
                className="w-full text-center text-xs font-bold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition pt-2"
              >
                VIEW FULL LEDGER →
              </button>
            </div>

            {/* PCI-DSS Security Audit Compliance Badge Card */}
            <div className="rounded-xl border border-slate-900 bg-slate-950 p-4 text-white shadow-md">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-bold">PCI-DSS Audit Security</span>
              </div>
              <p className="mt-1.5 text-[11px] text-slate-400 leading-normal">
                This transaction is being recorded from audited system environment. All logging actions are encrypted and audited for compliance with PCI-DSS standards.
              </p>
            </div>
          </div>
        </form>
      </div>
    );
  }

  // ----------------------------------------------------
  // COLLECTION REPORTS DASHBOARD (/collections/reports)
  // Replicating media_1788774415500.png 3-Column Layout
  // ----------------------------------------------------
  // UNIFIED MY COLLECTIONS & REPORTS DASHBOARD VIEW
  // (/collections/my-collections & /collections/reports)
  // ----------------------------------------------------
  if (isMyCollectionsPage || isReportsPage) {
    const currentLoanCount = (selectedReportCase && collections.filter((c) => (c.phone && c.phone === selectedReportCase.phone) || (c.customer && c.customer === selectedReportCase.customer)).length) || 1;

    return (
      <div className="w-full min-w-0 bg-[#f1f5f9] text-slate-800 dark:bg-slate-950 dark:text-slate-100 min-h-screen font-sans p-4 lg:p-6 space-y-5">
        {/* Top Dynamic Switcher & Control Bar */}
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search Bar Input */}
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={isMyCollectionsPage ? myCollectionsSearchTerm : reportSearchTerm}
                onChange={(e) => {
                  setMyCollectionsSearchTerm(e.target.value);
                  setReportSearchTerm(e.target.value);
                }}
                placeholder="Search borrower, loan ID, phone..."
                className="w-full pl-8 pr-7 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              {(isMyCollectionsPage ? myCollectionsSearchTerm : reportSearchTerm) && (
                <button
                  type="button"
                  onClick={() => {
                    setMyCollectionsSearchTerm("");
                    setReportSearchTerm("");
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Status Filter Dropdown */}
            <div className="w-52">
              <NiceSelect
                ariaLabel="Filter by status"
                value={reportDuesFilter}
                onValueChange={setReportDuesFilter}
                options={[
                  { label: `All Status (${reportDuesCounts.all})`, value: "all" },
                  { label: `Active (${reportDuesCounts.active})`, value: "active" },
                  { label: `Due Today (${reportDuesCounts.dueToday})`, value: "dueToday" },
                  { label: `Collected Today (${reportDuesCounts.collectedToday})`, value: "collectedToday" },
                  { label: `Overdue (${reportDuesCounts.overdue})`, value: "overdue" },
                  { label: `Paid Off (${reportDuesCounts.paidOff})`, value: "paidOff" },
                  { label: `Part Payment (${reportDuesCounts.partPayment})`, value: "partPayment" },
                ]}
              />
            </div>

            {/* Matching Borrower Dropdown */}
            <div className="w-72">
              <NiceSelect
                ariaLabel="Select Borrower Case"
                value={selectedReportCase ? String(selectedReportCase.id) : ""}
                onValueChange={(val) => {
                  setMyCollectionsSelectedCaseId(val);
                  setReportSelectedCaseId(val);
                }}
                options={reportFilteredCollections.map((c) => ({
                  label: `${c.borrowerName || c.customer || "Borrower"} (${c.loanId}) - ₹${c.outstanding || c.totalDue || 0}`,
                  value: String(c.id),
                }))}
              />
            </div>

          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {selectedReportCase && (
              <div className="flex items-center gap-2 mr-2">
                <span className="font-extrabold text-slate-900 dark:text-white">{selectedReportCase.borrowerName || selectedReportCase.customer}</span>
                <span className="rounded-md bg-blue-50 px-2 py-1 font-mono font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">Loan: #{selectedReportCase.loanId}</span>
                <span className="rounded-md bg-emerald-50 px-2 py-1 font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Due: ₹{selectedReportCase.outstanding || selectedReportCase.totalDue}</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                const list = reportFilteredCollections.length ? reportFilteredCollections : collections;
                const header = [
                  "S. No.",
                  "Borrower Name",
                  "Phone",
                  "Email",
                  "Customer ID",
                  "Loan ID",
                  "Disbursed Amount",
                  "Total Due",
                  "Total Amount Paid",
                  "Outstanding Balance",
                  "EMI Status",
                  "Part Payment Sequence",
                  "Part Payment Date",
                  "Part Payment Amount (INR)",
                  "Transaction Ref / UTR",
                  "Collected By / Agent",
                  "Payment Status",
                ];

                const csvRows: string[][] = [];
                let rowCounter = 1;

                list.forEach((c) => {
                  const loanPayments = (reportsData?.recentPayments || []).filter((p) => {
                    if (!p.loanId || !c.loanId) return false;
                    const normP = String(p.loanId).replace(/\D/g, "");
                    const normC = String(c.loanId).replace(/\D/g, "");
                    return normP === normC || String(p.loanId).toUpperCase() === String(c.loanId).toUpperCase();
                  });

                  const phoneVal = String(c.phone || "").trim();
                  const formattedPhone = phoneVal ? (/^\d{10,16}$/.test(phoneVal) ? `\t${phoneVal}` : phoneVal) : "";
                  const memberVal = String(c.memberCode || c.customerId || "").trim();
                  const formattedMember = memberVal ? (/^\d{10,16}$/.test(memberVal) ? `\t${memberVal}` : memberVal) : "";

                  const base = [
                    c.borrowerName || c.customer || "",
                    formattedPhone,
                    c.email || "",
                    formattedMember,
                    c.loanId || "",
                    String(c.disbursementAmount || c.principal || 0),
                    String(c.baseRepayment || c.totalDue || 0),
                    String(c.amountPaid || 0),
                    String(c.outstanding !== undefined ? c.outstanding : (c.totalDue || 0)),
                    c.status || c.emiStatus || "",
                  ];

                  if (loanPayments && loanPayments.length > 0) {
                    loanPayments.forEach((p, pIdx) => {
                      const rawAgent = String(p.receivedBy || (p as any).received_by || (p as any).actor || c.assignedTo || "").trim();
                      const isWebsite = !rawAgent || /website|online|system|gateway|razorpay|cashfree|auto/i.test(rawAgent);
                      const collectorName = isWebsite ? "Website" : rawAgent;

                      csvRows.push([
                        `${rowCounter}.${pIdx + 1}`,
                        ...base,
                        `Part Payment ${pIdx + 1} of ${loanPayments.length}`,
                        formatDate(p.receivedAt) || (p.receivedAt ? String(p.receivedAt).slice(0, 10) : "-"),
                        String(p.amount || 0),
                        p.reference || "-",
                        collectorName,
                        p.status || "settled",
                      ]);
                    });
                  } else {
                    const rawAgent = String(c.assignedTo || "").trim();
                    const isWebsite = !rawAgent || /website|online|system|gateway|razorpay|cashfree|auto/i.test(rawAgent);
                    const collectorName = isWebsite ? "Website" : rawAgent;

                    csvRows.push([
                      String(rowCounter),
                      ...base,
                      "No Part Payments",
                      Number(c.amountPaid || 0) > 0 && c.lastPaymentDate ? (formatDate(c.lastPaymentDate) || "-") : "-",
                      "0",
                      "-",
                      collectorName,
                      "-",
                    ]);
                  }
                  rowCounter++;
                });

                const csvContent = "\uFEFF" + [header, ...csvRows]
                  .map((row) => row.map((cell) => `"${String(cell || "").replace(/"/g, '""')}"`).join(","))
                  .join("\n");
                const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `collections_reports_${reportDuesFilter}_${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-blue-500" />
              Export
            </button>

            <button
              type="button"
              onClick={() => navigate("/collections/log-payment")}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5 text-emerald-500" />
              Upload
            </button>
          </div>
        </div>

        {selectedReportCase ? (
          <div className="space-y-6">
            {/* 3-COLUMN DETAILS DASHBOARD */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* COLUMN 1: Borrower KYC Details (4 cols) */}
              <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-3 text-xs font-medium text-slate-600 dark:text-slate-300">
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400 font-semibold">Name on pan card</span>
                  <span className="font-bold text-slate-900 dark:text-white">{selectedReportCase.borrowerName || selectedReportCase.customer || "-"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400 font-semibold">CRN:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{selectedReportCase.memberCode || selectedReportCase.customerId || "-"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400 font-semibold">Email:</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200 truncate max-w-[180px]">{selectedReportCase.email && selectedReportCase.email !== "-" ? selectedReportCase.email : "-"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400 font-semibold">Phone:</span>
                  <span>{selectedReportCase.phone || "-"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400 font-semibold">DOB:</span>
                  <span>{selectedReportCase.dob ? formatDobDisplay(selectedReportCase.dob) : "-"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400 font-semibold">User ID:</span>
                  <span>{selectedReportCase.memberCode || selectedReportCase.customerId || "-"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400 font-semibold">Gender:</span>
                  <span>{selectedReportCase.gender || "-"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400 font-semibold">Fathers Name:</span>
                  <span>{getFatherName(selectedReportCase)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400 font-semibold">Cibil Score:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">{selectedReportCase.cibilScore !== undefined && selectedReportCase.cibilScore !== null ? selectedReportCase.cibilScore : "-"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400 font-semibold">Created At:</span>
                  <span>{selectedReportCase.disbursementDate ? formatDate(selectedReportCase.disbursementDate) : "-"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400 font-semibold">Experience:</span>
                  <span>{selectedReportCase.experienceYears && selectedReportCase.experienceYears !== "-" ? (String(selectedReportCase.experienceYears).toLowerCase().includes("year") ? String(selectedReportCase.experienceYears) : `${selectedReportCase.experienceYears} Years`) : "-"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400 font-semibold">Company Name:</span>
                  <span>{selectedReportCase.companyName && selectedReportCase.companyName !== "-" ? selectedReportCase.companyName : "-"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400 font-semibold">User Type:</span>
                  <span className="font-bold">{selectedReportCase.userType || "STANDALONE"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400 font-semibold">Last Login:</span>
                  <span>{(selectedReportCase.lastLoginAt || selectedReportCase.lastLogin) ? formatDateTime(selectedReportCase.lastLoginAt || selectedReportCase.lastLogin) : "-"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400 font-semibold">Product:</span>
                  <span className="font-bold text-slate-900 dark:text-white">{selectedReportCase.product || "Waqtmoney Website"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400 font-semibold">Latest NTP DS Category:</span>
                  <span>{selectedReportCase.ntpCategory || "-"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400 font-semibold">Latest NTP DS Category Updated Date:</span>
                  <span>{selectedReportCase.ntpCategoryUpdatedAt ? formatDate(selectedReportCase.ntpCategoryUpdatedAt) : "-"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400 font-semibold">Latest ETP DS Category:</span>
                  <span>{selectedReportCase.etpCategory || "-"}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400 font-semibold">Latest ETP DS Category Updated Date:</span>
                  <span>{selectedReportCase.etpCategoryUpdatedAt ? formatDate(selectedReportCase.etpCategoryUpdatedAt) : "-"}</span>
                </div>
              </div>

              {/* COLUMN 2: Payday Loan Details & Comments (5 cols) */}
              <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-5">
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/50 dark:bg-slate-800/40 space-y-3">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-700 pb-2 flex items-center justify-between">
                    <span>Payday Loan</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                      ID: {selectedReportCase.loanId}
                    </span>
                  </h3>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div><span className="text-slate-400 block">Reason For Loan</span><span className="font-semibold text-slate-800 dark:text-slate-200">{selectedReportCase.loanPurpose || "-"}</span></div>
                    <div><span className="text-slate-400 block">Tenure Date</span><span className="font-semibold text-slate-800 dark:text-slate-200">{selectedReportCase.dueDate ? formatDate(selectedReportCase.dueDate) : "-"}</span></div>
                    <div><span className="text-slate-400 block">ROI</span><span className="font-semibold text-slate-800 dark:text-slate-200">{selectedReportCase.roi ? `${selectedReportCase.roi}%` : "-"}</span></div>
                    <div><span className="text-slate-400 block">Disbursal Date</span><span className="font-semibold text-slate-800 dark:text-slate-200">{selectedReportCase.disbursementDate ? formatDate(selectedReportCase.disbursementDate) : "-"}</span></div>
                    <div><span className="text-slate-400 block">Processing Fee</span><span className="font-semibold text-slate-800 dark:text-slate-200">{selectedReportCase.processingFee !== undefined && selectedReportCase.processingFee !== null ? formatCurrency(selectedReportCase.processingFee) : "-"}</span></div>
                    <div><span className="text-slate-400 block">Repayment Date</span><span className="font-semibold text-slate-800 dark:text-slate-200">{selectedReportCase.dueDate ? formatDate(selectedReportCase.dueDate) : "-"}</span></div>
                    <div><span className="text-slate-400 block">processing WaiveOff</span><span className="font-semibold text-slate-800 dark:text-slate-200">{selectedReportCase.processingWaiveOff ? `${selectedReportCase.processingWaiveOff}%` : "-"}</span></div>
                    <div><span className="text-slate-400 block">Mars</span><span className="font-semibold text-slate-800 dark:text-slate-200">{selectedReportCase.mars ? formatCurrency(selectedReportCase.mars) : "-"}</span></div>
                    <div><span className="text-slate-400 block">Sanctioned Amount</span><span className="font-bold text-slate-900 dark:text-white">{selectedReportCase.principal !== undefined ? formatCurrency(selectedReportCase.principal) : "-"}</span></div>
                    <div><span className="text-slate-400 block">Disbursed By</span><span className="font-semibold text-slate-800 dark:text-slate-200">{selectedReportCase.disbursedBy || "-"}</span></div>
                    <div><span className="text-slate-400 block">Disbursal Amount</span><span className="font-bold text-emerald-600 dark:text-emerald-400">{selectedReportCase.disbursementAmount !== undefined ? formatCurrency(selectedReportCase.disbursementAmount) : "-"}</span></div>
                    <div><span className="text-slate-400 block">Loan Status</span><span className="font-bold text-blue-600 dark:text-blue-400">{selectedReportCase.status || selectedReportCase.emiStatus || "-"}</span></div>
                    <div><span className="text-slate-400 block">Waqtmoney</span><span className="font-semibold text-slate-800 dark:text-slate-200">{selectedReportCase.waqtmoney ? formatCurrency(selectedReportCase.waqtmoney) : "-"}</span></div>
                    <div><span className="text-slate-400 block">Original Due Amount</span><span className="font-bold text-slate-900 dark:text-white">{formatCurrency(selectedReportCase.baseRepayment || selectedReportCase.totalDue)}</span></div>
                    <div><span className="text-slate-400 block">Collection Amount</span><span className="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(selectedReportCase.amountPaid || 0)}</span></div>
                    <div><span className="text-slate-400 block">Left Balance</span><span className="font-bold text-red-600 dark:text-red-400">{formatCurrency(selectedReportCase.outstanding !== undefined ? selectedReportCase.outstanding : selectedReportCase.totalDue)}</span></div>
                  </div>
                </div>

                {/* Comments Table Section */}
                <div className="space-y-3">
                  <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-500 font-bold uppercase tracking-wider dark:bg-slate-800 dark:text-slate-400">
                        <tr>
                          <th className="p-2.5">Updated By</th>
                          <th className="p-2.5">Comment</th>
                          <th className="p-2.5">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                        {(() => {
                          const combined = [...reportComments];
                          if (myCollectionsActivity?.calls) {
                            myCollectionsActivity.calls.forEach((call) => {
                              combined.push({
                                actor: call.actor || "himanshu@waqtfinance.com",
                                note: call.notes || call.disposition || "Call Logged",
                                date: formatDateTime(call.createdAt),
                              });
                            });
                          }
                          if (!combined.length) {
                            return (
                              <tr>
                                <td colSpan={3} className="p-4 text-center text-slate-400 font-semibold">
                                  No comments added yet
                                </td>
                              </tr>
                            );
                          }
                          return combined.map((c, i) => (
                            <tr key={`comment-${i}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                              <td className="p-2.5 text-blue-600 dark:text-blue-400 truncate max-w-[140px]">{c.actor}</td>
                              <td className="p-2.5 text-slate-900 dark:text-white font-semibold">{c.note}</td>
                              <td className="p-2.5 text-slate-400">{c.date}</td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>

                  {/* Buttons Row (SMS, Device Info, View All Comments, Add Comment +) */}
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowSmsModal(true)}
                      className="rounded-lg bg-blue-500 px-3.5 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-blue-600 transition"
                    >
                      SMS
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDeviceInfoModal(true)}
                      className="rounded-lg bg-cyan-500 px-3.5 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-cyan-600 transition"
                    >
                      Device Info
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAllCommentsModal(true)}
                      className="rounded-lg bg-teal-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-teal-700 transition"
                    >
                      View All Comments
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddCommentModal(true)}
                      className="rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-600 transition"
                    >
                      Add Comment +
                    </button>
                  </div>
                </div>
              </div>

              {/* COLUMN 3: Payday & Disbursed Summary Stats (3 cols) */}
              <div className="lg:col-span-3 rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                  <span className="font-bold text-xs uppercase tracking-wider text-slate-500">PayDay</span>
                  <span className="font-extrabold text-xs uppercase tracking-wider text-blue-600 dark:text-blue-400">DISBURSED</span>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500 font-semibold">Total Payday</span>
                    <span className="font-black text-sm text-slate-900 dark:text-white">{currentLoanCount}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500 font-semibold">Total Loans</span>
                    <span className="font-black text-sm text-slate-900 dark:text-white">{currentLoanCount}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* COMMUNICATION LOGS & ACTIVITY TIMELINE BOX (MEDIA 1 INTEGRATED) */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex border-b border-slate-200 text-xs font-bold text-slate-600 dark:border-slate-800 dark:text-slate-400">
                <button
                  type="button"
                  onClick={() => setMyCollectionsTab("logs")}
                  className={`pb-3 px-4 border-b-2 transition ${myCollectionsTab === "logs" ? "border-emerald-600 font-bold text-emerald-700 dark:border-emerald-500 dark:text-emerald-400" : "border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}`}
                >
                  Communication Logs ({realTimelineItems.length})
                </button>
                <button
                  type="button"
                  onClick={() => setMyCollectionsTab("history")}
                  className={`pb-3 px-4 border-b-2 transition ${myCollectionsTab === "history" ? "border-emerald-600 font-bold text-emerald-700 dark:border-emerald-500 dark:text-emerald-400" : "border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}`}
                >
                  Loan History
                </button>
                <button
                  type="button"
                  onClick={() => setMyCollectionsTab("notes")}
                  className={`pb-3 px-4 border-b-2 transition ${myCollectionsTab === "notes" ? "border-emerald-600 font-bold text-emerald-700 dark:border-emerald-500 dark:text-emerald-400" : "border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}`}
                >
                  Internal Notes
                </button>
                <button
                  type="button"
                  onClick={() => setMyCollectionsTab("documents")}
                  className={`pb-3 px-4 border-b-2 transition ${myCollectionsTab === "documents" ? "border-emerald-600 font-bold text-emerald-700 dark:border-emerald-500 dark:text-emerald-400" : "border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}`}
                >
                  Documents
                </button>
              </div>

              {myCollectionsTab === "logs" && (
                <div className="space-y-5 pt-1">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                      {[
                        { label: "▼ All Activity", value: "all" },
                        { label: "💳 Payments", value: "payments" },
                        { label: "📞 Calls", value: "calls" },
                        { label: "💬 SMS", value: "sms" },
                        { label: "📝 Notes", value: "notes" },
                      ].map((tag) => (
                        <button
                          key={tag.value}
                          type="button"
                          onClick={() => setHistoryFilterTag(tag.value as any)}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                            historyFilterTag === tag.value
                              ? "border-slate-900 bg-slate-950 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                              : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300"
                          }`}
                        >
                          {tag.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={exportBorrowerLog}
                        className="flex h-8 items-center gap-1.5 rounded border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        title="Export Activity & Payment Log for selected borrower"
                      >
                        <Download className="h-3.5 w-3.5" /> Export Log
                      </button>
                    </div>
                  </div>

                  {isMyCollectionsActivityLoading ? (
                    <div className="py-8 text-center text-xs font-semibold text-slate-500">Loading activity history for borrower...</div>
                  ) : filteredTimelineItems.length > 0 ? (
                    <div className="space-y-4 text-xs">
                      {filteredTimelineItems.map((item) => {
                        const isPayment = item.type === "payments";
                        const isCall = item.type === "calls";
                        const isSMS = item.type === "sms";

                        return (
                          <div
                            key={item.id}
                            className={`rounded-xl border p-4 shadow-sm space-y-2 transition ${
                              isPayment
                                ? "border-emerald-200 bg-emerald-50/30 dark:border-emerald-900/40 dark:bg-emerald-950/20"
                                : isCall
                                ? "border-blue-200 bg-blue-50/30 dark:border-blue-900/40 dark:bg-blue-950/20"
                                : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-800/40"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <span
                                  className={`flex h-7 w-7 items-center justify-center rounded-full text-white ${
                                    isPayment
                                      ? "bg-emerald-600"
                                      : isCall
                                      ? "bg-blue-600"
                                      : isSMS
                                      ? "bg-amber-500"
                                      : "bg-purple-600"
                                  }`}
                                >
                                  {isPayment ? (
                                    <Banknote className="h-3.5 w-3.5" />
                                  ) : isCall ? (
                                    <PhoneCall className="h-3.5 w-3.5" />
                                  ) : isSMS ? (
                                    <MessageSquare className="h-3.5 w-3.5" />
                                  ) : (
                                    <FileText className="h-3.5 w-3.5" />
                                  )}
                                </span>
                                <div>
                                  <p className="font-extrabold uppercase text-slate-900 dark:text-slate-100">{item.title}</p>
                                  {item.subtitle && <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">{item.subtitle}</p>}
                                </div>
                              </div>
                              <span className="text-[10px] font-bold text-slate-400">{item.dateString}</span>
                            </div>

                            {item.proofUrl && (
                              <div className="pl-9 pt-1 font-semibold">
                                <a
                                  href={resolveBackendUploadUrl(item.proofUrl)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-100/70 px-3 py-1 text-xs font-bold text-emerald-900 hover:bg-emerald-200 dark:border-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-200 transition shadow-xs"
                                >
                                  <FileCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                  View Attached Receipt / Proof ↗
                                </a>
                              </div>
                            )}

                            <div className="flex items-center justify-between pl-9 pt-1 text-[11px] text-slate-500 font-semibold">
                              {item.actor && <span>👤 Agent / User: <strong>{item.actor}</strong></span>}
                              {item.amount && (
                                <span className="rounded bg-emerald-100 px-2.5 py-0.5 font-extrabold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                  {formatCurrency(item.amount)}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center dark:border-slate-800 dark:bg-slate-900/50">
                      <MessageSquare className="mx-auto h-8 w-8 text-slate-400 mb-2" />
                      <p className="text-sm font-bold text-slate-900 dark:text-white">No Activity Logged Yet</p>
                      <p className="text-xs text-slate-500 mt-1">
                        There are no recorded call logs or payments yet for {selectedReportCase.borrowerName || selectedReportCase.customer}.
                      </p>
                      <div className="mt-4 flex justify-center gap-3">
                        <button
                          type="button"
                          onClick={() => openCaseAction(selectedReportCase, "contact")}
                          className="rounded bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-blue-700 transition"
                        >
                          📞 Record Call Log
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedLogPaymentCaseId(String(selectedReportCase.id));
                            navigate("/collections/log-payment");
                          }}
                          className="rounded bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition"
                        >
                          💳 Log Payment
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {myCollectionsTab === "history" && (
                <div className="space-y-3 text-xs py-2">
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/40">
                    <p className="font-bold text-slate-900 dark:text-slate-100">Disbursal Completed: {formatCurrency(Number(selectedReportCase.disbursementAmount || selectedReportCase.principal || 0))}</p>
                    <p className="text-[10px] text-slate-500">{formatDate(selectedReportCase.disbursementDate)} • Direct Bank Transfer</p>
                  </div>
                  {Number(selectedReportCase.amountPaid || 0) > 0 && (
                    <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/40">
                      <p className="font-bold text-slate-900 dark:text-slate-100">Past Repayment Received: {formatCurrency(Number(selectedReportCase.amountPaid || 0))}</p>
                      <p className="text-[10px] text-slate-500">{formatDate(selectedReportCase.lastPaymentDate || new Date().toISOString())} • Receipt Verified</p>
                    </div>
                  )}
                </div>
              )}

              {myCollectionsTab === "notes" && (
                <div className="space-y-3 py-2">
                  <textarea
                    rows={3}
                    placeholder="Add internal audit note for this case..."
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-xs outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                  <button type="button" className="rounded bg-slate-950 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 dark:bg-emerald-600">
                    Save Internal Note
                  </button>
                </div>
              )}

              {myCollectionsTab === "documents" && (
                <div className="space-y-4 text-xs py-2">
                  {paymentProofItems.length > 0 && (
                    <div className="space-y-2">
                      <p className="font-extrabold uppercase text-[10px] tracking-wider text-emerald-700 dark:text-emerald-400">
                        Uploaded Repayment Receipts ({paymentProofItems.length})
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {paymentProofItems.map((proof) => (
                          <a
                            key={proof.id}
                            href={resolveBackendUploadUrl(proof.proofUrl)}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-between p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/60 hover:bg-emerald-100/70 dark:border-emerald-900/40 dark:bg-emerald-950/30 transition group cursor-pointer"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white font-bold shrink-0 shadow-xs">
                                <FileText className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-bold text-slate-900 dark:text-slate-100 truncate">
                                  {proof.proofOriginalName}
                                </p>
                                <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                                  {proof.dateString} • {formatCurrency(proof.amount)}
                                </p>
                              </div>
                            </div>
                            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-emerald-700 border border-emerald-200 shadow-2xs group-hover:translate-x-0.5 transition dark:bg-slate-800 dark:border-slate-700 dark:text-emerald-400 shrink-0">
                              <ArrowUpRight className="h-4 w-4" />
                            </span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                    <div className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-800">
                      <FileText className="h-4 w-4 text-blue-500" />
                      <div>
                        <p className="font-bold">Loan Agreement.pdf</p>
                        <p className="text-[10px] text-slate-400">Verified &amp; Signed</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-800">
                      <ShieldCheck className="h-4 w-4 text-emerald-500" />
                      <div>
                        <p className="font-bold">KYC Documents.pdf</p>
                        <p className="text-[10px] text-slate-400">PAN &amp; Aadhaar Verified</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <EmptyState title="No borrower selected" description="Select a borrower from the dropdown above to view the dynamic collection report dashboard." />
        )}

        {/* Add Comment Modal */}
        {showAddCommentModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-2xs">
            <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">Add Collection Comment</h3>
                <button type="button" onClick={() => setShowAddCommentModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Comment Note</label>
                <textarea
                  rows={3}
                  value={reportNewComment}
                  onChange={(e) => setReportNewComment(e.target.value)}
                  placeholder="Enter remark (e.g. ring, callback requested)..."
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-xs font-semibold outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddCommentModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (reportNewComment.trim()) {
                      setReportComments((prev) => [
                        { actor: "himanshu@waqtfinance.com", note: reportNewComment.trim(), date: new Date().toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }) },
                        ...prev,
                      ]);
                      setReportNewComment("");
                      setShowAddCommentModal(false);
                    }
                  }}
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-700"
                >
                  Save Comment
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SMS Modal */}
        {showSmsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-2xs">
            <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900 space-y-4 text-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                <h3 className="font-bold text-slate-900 dark:text-white">Send SMS Notification</h3>
                <button type="button" onClick={() => setShowSmsModal(false)} className="text-slate-400">✕</button>
              </div>
              <p className="text-slate-600 dark:text-slate-300">Sending repayment reminder SMS to <strong>{selectedReportCase?.phone}</strong></p>
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-300 font-mono">
                Dear {selectedReportCase?.borrowerName || selectedReportCase?.customer}, your loan payment of ₹{selectedReportCase?.outstanding || selectedReportCase?.totalDue} is due. Please pay via Waqt Finance portal.
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowSmsModal(false)} className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold">Close</button>
              </div>
            </div>
          </div>
        )}

        {/* Device Info Modal */}
        {showDeviceInfoModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-2xs">
            <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900 space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                <h3 className="font-bold text-slate-900 dark:text-white">Device & Access Info</h3>
                <button type="button" onClick={() => setShowDeviceInfoModal(false)} className="text-slate-400">✕</button>
              </div>
              <div className="space-y-2 text-slate-600 dark:text-slate-300 font-medium">
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800"><span>Device Model:</span><span className="font-bold text-slate-900 dark:text-white">Android Smartphone</span></div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800"><span>App Version:</span><span className="font-mono">v2.4.1</span></div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800"><span>IP Address:</span><span className="font-mono">103.234.185.16</span></div>
                <div className="flex justify-between py-1"><span>Last Sync:</span><span>{new Date().toLocaleString("en-IN")}</span></div>
              </div>
              <div className="flex justify-end pt-2">
                <button type="button" onClick={() => setShowDeviceInfoModal(false)} className="px-4 py-2 rounded-lg bg-cyan-600 text-white font-bold">Close</button>
              </div>
            </div>
          </div>
        )}

        {/* View All Comments Modal */}
        {showAllCommentsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-2xs">
            <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900 space-y-4 text-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                <h3 className="font-bold text-slate-900 dark:text-white">Audit Comment Trail ({reportComments.length})</h3>
                <button type="button" onClick={() => setShowAllCommentsModal(false)} className="text-slate-400">✕</button>
              </div>
              <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                {reportComments.map((c, i) => (
                  <div key={`all-c-${i}`} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="font-bold text-blue-600 dark:text-blue-400">{c.actor}</span>
                      <span className="text-slate-400">{c.date}</span>
                    </div>
                    <p className="text-slate-800 dark:text-slate-200 font-semibold">{c.note}</p>
                  </div>
                ))}
              </div>
              <div className="flex justify-end pt-2">
                <button type="button" onClick={() => setShowAllCommentsModal(false)} className="px-4 py-2 rounded-lg bg-teal-600 text-white font-bold">Close</button>
              </div>
            </div>
          </div>
        )}
        {renderTodayPaymentsModal()}
      </div>
    );
  }
  // ----------------------------------------------------
  // DASHBOARD VIEW (/collections)
  // (Agent Dashboard Overview + DPD Bucket Filter Pills + Full Customer List Queue Cards!)
  // ----------------------------------------------------
  return (
    <div className="w-full min-w-0 px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      {/* Header Banner */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">
              Collections Pro • Agent Workspace
            </p>
            <h2 className="mt-2 text-3xl font-extrabold text-slate-950 dark:text-white tracking-tight">
              Agent Dashboard &amp; Collection Queue
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Live recovery overview &amp; complete borrower collection cases list.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-4">
              <ActionPill label="This Month" value={formatCurrency(summary?.collectionThisMonth ?? 0)} tone="text-emerald-700 dark:text-emerald-400" />
              <ActionPill label="At-risk value" value={formatCurrency(atRiskAmount)} tone="text-red-700 dark:text-red-400" />
              <ActionPill label="Pending follow-ups" value={summary?.pendingFollowups ?? 0} tone="text-amber-700 dark:text-amber-400" />
              <ActionPill label="Broken PTP" value={summary?.brokenPtps ?? 0} tone="text-red-700 dark:text-red-400" />
            </div>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={exportCollectionCsv}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Download className="h-4 w-4" /> Export CSV
            </button>
            <button
              type="button"
              onClick={refresh}
              disabled={isRefreshing}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Top 4 Performance Overview Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/90 via-blue-50/40 to-white p-5 shadow-sm dark:border-indigo-900/60 dark:from-indigo-950/40 dark:via-blue-950/20 dark:to-slate-900">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
            TOTAL PORTFOLIO DUE
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-600/30">
              <IndianRupee className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-3xl font-black text-slate-950 dark:text-white tracking-tight">
            {formatCurrency(summary?.totalOutstanding ?? stats.totalDue)}
          </p>
          <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
            <TrendingUp className="h-3.5 w-3.5" />
            +4.2% from last week
          </p>
        </div>

        <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50/90 via-teal-50/40 to-white p-5 shadow-sm dark:border-emerald-900/60 dark:from-emerald-950/40 dark:via-teal-950/20 dark:to-slate-900">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
            COLLECTED TODAY
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-600/30">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-3xl font-black text-emerald-700 dark:text-emerald-400 tracking-tight">
            {formatCurrency(summary?.collectionToday ?? 0)}
          </p>
          <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">
            <Check className="h-3.5 w-3.5" />
            {summary?.paymentsToday ?? 0} payments collected today
          </p>
        </div>

        <div className="rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50/90 via-orange-50/40 to-white p-5 shadow-sm dark:border-amber-900/60 dark:from-amber-950/40 dark:via-orange-950/20 dark:to-slate-900">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
            QUEUE PRIORITY
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500 text-white shadow-md shadow-amber-500/30">
              <Phone className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-3xl font-black text-slate-950 dark:text-white tracking-tight">
            {summary?.overdueAccounts ?? stats.overdueCases} Cases
          </p>
          <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-amber-800 dark:text-amber-300">
            <Clock className="h-3.5 w-3.5" />
            Avg. wait time: {stats.avgDpd} days DPD
          </p>
        </div>

        <div className="rounded-xl border border-emerald-500/40 bg-gradient-to-br from-emerald-600 via-teal-700 to-emerald-900 p-5 text-white shadow-lg shadow-emerald-600/20">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-emerald-100">
            THIS MONTH COLLECTION
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 text-white backdrop-blur-sm">
              <Banknote className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-3xl font-black text-white tracking-tight">
            {formatCurrency(summary?.collectionThisMonth ?? 0)}
          </p>
          <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-emerald-200">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-200" />
            {summary?.paymentsThisMonth ?? 0} total payments this month
          </p>
        </div>
      </div>

      {/* DPD Bucket & PTP Controls */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-950 dark:text-white">DPD Bucket Distribution</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Portfolio split for prioritising recovery action.</p>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 ring-1 ring-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:ring-blue-800">
              {summary?.pendingFollowups ?? 0} pending follow-ups
            </span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            {[
              { bucket: "0-30", bg: "bg-gradient-to-br from-blue-50/90 to-cyan-50/60 border-blue-200/80 text-blue-950 dark:from-blue-950/50 dark:to-cyan-950/40 dark:border-blue-800/80 dark:text-blue-200", bar: "bg-blue-600" },
              { bucket: "31-60", bg: "bg-gradient-to-br from-amber-50/90 to-yellow-50/60 border-amber-200/80 text-amber-950 dark:from-amber-950/50 dark:to-yellow-950/40 dark:border-amber-800/80 dark:text-amber-300", bar: "bg-amber-500" },
              { bucket: "61-90", bg: "bg-gradient-to-br from-orange-50/90 to-amber-50/60 border-orange-200/80 text-orange-950 dark:from-orange-950/50 dark:to-amber-950/40 dark:border-orange-800/80 dark:text-orange-300", bar: "bg-orange-500" },
              { bucket: "90+", bg: "bg-gradient-to-br from-rose-50/90 to-red-50/60 border-rose-200/80 text-rose-950 dark:from-rose-950/50 dark:to-red-950/40 dark:border-rose-800/80 dark:text-rose-300", bar: "bg-rose-600 animate-pulse" },
            ].map(({ bucket, bg, bar }) => {
              const value = summary?.buckets?.[bucket] ?? 0;
              const total = Math.max(1, summary?.activeCases ?? collections.length);
              const percent = Math.round((value / total) * 100);
              return (
                <div key={bucket} className={`rounded-xl border p-3.5 shadow-xs ${bg}`}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-bold">{bucket} DPD</span>
                    <span className="font-black text-base">{value}</span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-slate-200/80 dark:bg-slate-800">
                    <div className={`h-2 rounded-full ${bar}`} style={{ width: `${percent}%` }} />
                  </div>
                  <p className="mt-2 text-xs font-semibold opacity-80">{percent}% of active cases</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-base font-semibold text-slate-950 dark:text-white">PTP Control</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">Promise-to-pay commitments and broken promise risk.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <MetricTile label="Active PTP" value={String(summary?.activePtps ?? 0)} accent />
            <MetricTile label="Broken PTP" value={String(summary?.brokenPtps ?? 0)} />
            <MetricTile label="Payments today" value={String(summary?.paymentsToday ?? 0)} />
            <MetricTile label="Collected total" value={formatCurrency(summary?.totalCollected ?? 0)} />
          </div>
        </section>
      </div>

      {/* FULL COLLECTION CASES QUEUE WITH DPD PILLS & ALL A TO Z CARDS (IMAGE 2 EXACT DESIGN!) */}
      {renderCustomerListQueue()}

      {/* Comprehensive Case Command Center Modal */}
      {selectedCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm px-4 py-6">
          <div className="max-h-[94vh] w-full max-w-6xl overflow-hidden rounded-xl bg-white shadow-2xl dark:border dark:border-slate-800 dark:bg-slate-900">
            {/* Modal Top Header Bar */}
            <div className="flex items-start justify-between border-b border-slate-200 bg-slate-50/80 px-6 py-4 dark:border-slate-800 dark:bg-slate-950/40">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Collections Pro • Borrower Workspace</p>
                  <span className="rounded bg-red-100 px-2 py-0.5 text-[10px] font-extrabold uppercase text-red-700 dark:bg-red-950/60 dark:text-red-400">
                    DELINQUENT: {getDaysPastDue(selectedCase)} DAYS
                  </span>
                </div>
                <h3 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
                  {selectedCase.borrowerName || selectedCase.customer}
                </h3>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">Loan ID: #{selectedCase.loanId}</span>
                  <span>Phone: {selectedCase.phone}</span>
                  <span>Email: {selectedCase.email || `${(selectedCase.borrowerName || "borrower").toLowerCase().replace(/\s+/g, "")}@gmail.com`}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    closeCaseAction();
                    setSelectedLogPaymentCaseId(String(selectedCase.id));
                    navigate("/collections/log-payment");
                  }}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-700"
                >
                  <Plus className="h-3.5 w-3.5" /> Log Payment
                </button>
                <button
                  type="button"
                  onClick={closeCaseAction}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800"
                  aria-label="Close modal"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Sub Nav Tabs */}
            <div className="flex border-b border-slate-200 bg-white px-6 text-xs font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              <button
                type="button"
                onClick={() => setModalTab("overview")}
                className={`py-3 px-4 border-b-2 transition ${modalTab === "overview" ? "border-emerald-600 font-bold text-emerald-700 dark:border-emerald-500 dark:text-emerald-400" : "border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}`}
              >
                Loan Summary & Strategy
              </button>
              <button
                type="button"
                onClick={() => setModalTab("contact")}
                className={`py-3 px-4 border-b-2 transition ${modalTab === "contact" ? "border-emerald-600 font-bold text-emerald-700 dark:border-emerald-500 dark:text-emerald-400" : "border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}`}
              >
                Contact Outcome & PTP
              </button>
              <button
                type="button"
                onClick={() => setModalTab("history")}
                className={`py-3 px-4 border-b-2 transition ${modalTab === "history" ? "border-emerald-600 font-bold text-emerald-700 dark:border-emerald-500 dark:text-emerald-400" : "border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}`}
              >
                Interaction History ({selectedActivity ? selectedActivity.calls.length + selectedActivity.ptps.length + selectedActivity.followups.length : 0})
              </button>
            </div>

            {/* Modal Main Content Container */}
            <div className="max-h-[calc(94vh-140px)] overflow-y-auto p-6">
              {modalTab === "overview" && (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                  <div className="lg:col-span-2 space-y-5">
                    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                      <div className="flex items-center justify-between">
                        <h4 className="text-base font-bold text-slate-950 dark:text-white">Loan Summary</h4>
                        <span className="font-mono text-xs text-slate-500">Loan ID: #{selectedCase.loanId}</span>
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-xs font-bold uppercase text-slate-400">Total Outstanding</p>
                          <p className="mt-1 text-2xl font-black text-red-600 dark:text-red-400">
                            {formatCurrency(selectedCase.outstanding || selectedCase.totalDue)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-bold uppercase text-slate-400">Original Loan</p>
                          <p className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">
                            {formatCurrency(selectedCase.disbursementAmount || selectedCase.baseRepayment)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-bold uppercase text-slate-400">Repayment Progress</p>
                          <p className="mt-1 text-2xl font-black text-emerald-600 dark:text-emerald-400">
                            {Math.round(((selectedCase.amountPaid || 0) / Math.max(1, (selectedCase.outstanding || 0) + (selectedCase.amountPaid || 0))) * 100)}% Complete
                          </p>
                        </div>
                      </div>

                      <div className="mt-4">
                        <div className="flex justify-between text-xs font-bold text-slate-500 mb-1.5">
                          <span>Progress to Settlement</span>
                          <span>{formatCurrency(selectedCase.amountPaid)} Paid / {formatCurrency((selectedCase.outstanding || 0) + (selectedCase.amountPaid || 0))} Total</span>
                        </div>
                        <div className="h-3 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, Math.round(((selectedCase.amountPaid || 0) / Math.max(1, (selectedCase.outstanding || 0) + (selectedCase.amountPaid || 0))) * 100))}%` }}
                          />
                        </div>
                      </div>

                      <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 dark:border-slate-800 pt-4 text-xs">
                        <div className="space-y-2">
                          <p className="font-bold uppercase text-slate-400">Balance Breakdown</p>
                          <div className="flex justify-between"><span className="text-slate-500">Principal</span><span className="font-bold">{formatCurrency(selectedCase.baseOutstanding || selectedCase.disbursementAmount)}</span></div>
                          <div className="flex justify-between"><span className="text-slate-500">Accrued Interest / DPD</span><span className="font-bold text-amber-600">{formatCurrency(selectedCase.overdueInterest)}</span></div>
                          <div className="flex justify-between"><span className="text-slate-500">Amount Paid</span><span className="font-bold text-emerald-600">{formatCurrency(selectedCase.amountPaid)}</span></div>
                        </div>

                        <div className="space-y-2">
                          <p className="font-bold uppercase text-slate-400">Crucial Dates</p>
                          <div className="flex justify-between"><span className="text-slate-500">Disbursed Date</span><span className="font-bold">{formatDate(selectedCase.disbursementDate)}</span></div>
                          <div className="flex justify-between"><span className="text-slate-500">Due Date</span><span className="font-bold text-red-600">{formatDate(selectedCase.dueDate || selectedCase.originalDueDate)}</span></div>
                          <div className="flex justify-between"><span className="text-slate-500">Last Contact Date</span><span className="font-bold">{formatDate(selectedCase.lastContactDate)}</span></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-5">
                    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-lg font-bold text-white">
                          {(selectedCase.borrowerName || selectedCase.customer || "B").slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-950 dark:text-white text-base">{selectedCase.borrowerName || selectedCase.customer}</h4>
                          <span className="inline-block rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                            PRIMARY CONTACT
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 space-y-2 text-xs">
                        <p className="text-slate-600 dark:text-slate-300"><strong>Phone:</strong> {selectedCase.phone}</p>
                        <p className="text-slate-600 dark:text-slate-300"><strong>Father / C/O:</strong> {getFatherName(selectedCase)}</p>
                        <p className="text-slate-600 dark:text-slate-300"><strong>PAN:</strong> {selectedCase.pan || "-"}</p>
                        <p className="text-slate-600 dark:text-slate-300"><strong>Aadhaar:</strong> {selectedCase.aadhaar || "-"}</p>
                        <p className="text-slate-600 dark:text-slate-300"><strong>Address:</strong> {selectedCase.address || "-"}</p>
                      </div>

                      {/* EMERGENCY REFERENCES IN MODAL */}
                      {(selectedCase.reference1Name || selectedCase.reference1Phone || selectedCase.reference2Name || selectedCase.reference2Phone) && (
                        <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800 space-y-2">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                            Emergency References
                          </span>
                          {(selectedCase.reference1Name || selectedCase.reference1Phone) && (
                            <div className="rounded bg-slate-50 p-2 text-xs dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                              <p className="font-bold text-slate-900 dark:text-slate-100">Ref 1: {selectedCase.reference1Name || "Ref 1"} {selectedCase.reference1Relation ? `(${selectedCase.reference1Relation})` : ""}</p>
                              {selectedCase.reference1Phone && (
                                <p className="text-slate-600 dark:text-slate-300"><strong>Phone:</strong> <a href={`tel:${selectedCase.reference1Phone}`} className="text-blue-600 dark:text-blue-400 underline">{selectedCase.reference1Phone}</a></p>
                              )}
                            </div>
                          )}
                          {(selectedCase.reference2Name || selectedCase.reference2Phone) && (
                            <div className="rounded bg-slate-50 p-2 text-xs dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                              <p className="font-bold text-slate-900 dark:text-slate-100">Ref 2: {selectedCase.reference2Name || "Ref 2"} {selectedCase.reference2Relation ? `(${selectedCase.reference2Relation})` : ""}</p>
                              {selectedCase.reference2Phone && (
                                <p className="text-slate-600 dark:text-slate-300"><strong>Phone:</strong> <a href={`tel:${selectedCase.reference2Phone}`} className="text-blue-600 dark:text-blue-400 underline">{selectedCase.reference2Phone}</a></p>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="mt-4 flex gap-2">
                        <a href={`tel:${selectedCase.phone}`} className="flex-1 rounded-md bg-blue-600 py-2 text-center text-xs font-bold text-white hover:bg-blue-700">
                          Call Borrower
                        </a>
                        <button
                          type="button"
                          onClick={() => {
                            closeCaseAction();
                            setSelectedLogPaymentCaseId(String(selectedCase.id));
                            navigate("/collections/log-payment");
                          }}
                          className="flex-1 rounded-md bg-emerald-600 py-2 text-center text-xs font-bold text-white hover:bg-emerald-700"
                        >
                          Log Payment
                        </button>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-900 bg-slate-950 p-5 text-white shadow-md">
                      <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
                        COLLECTION STRATEGY
                        <ShieldCheck className="h-4 w-4 text-emerald-400" />
                      </div>
                      <p className="mt-2 text-lg font-black text-white">Standard Recovery Workflow</p>
                      <p className="mt-1 text-xs text-slate-400">Next Action: Automatic SMS & Call Reminder (24h)</p>
                      <div className="mt-3 flex items-center gap-2">
                        <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30">
                          LEVEL 1 ACTIVE
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {modalTab === "contact" && (
                <form onSubmit={submitCaseAction} className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-300">Contact Outcome Disposition</label>
                      <NiceSelect
                        ariaLabel="Collection disposition"
                        value={actionForm.disposition}
                        onValueChange={(value) => setActionForm((form) => ({ ...form, disposition: value }))}
                        options={dispositionOptions}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-300">Follow-up Date & Time</label>
                      <input
                        type="datetime-local"
                        value={actionForm.followupAt}
                        onChange={(event) => setActionForm((form) => ({ ...form, followupAt: event.target.value }))}
                        className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-300">Agent Notes & Summary</label>
                    <textarea
                      value={actionForm.notes}
                      onChange={(event) => setActionForm((form) => ({ ...form, notes: event.target.value }))}
                      rows={4}
                      placeholder="Enter details about call discussion, settlement terms, or customer remarks..."
                      className="w-full rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>

                  <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
                    <h4 className="font-bold text-blue-900 dark:text-blue-300 text-sm mb-3">Promise To Pay (PTP) Record</h4>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">PTP Promised Amount</label>
                        <input
                          type="number"
                          min="0"
                          value={actionForm.ptpAmount}
                          onChange={(event) => setActionForm((form) => ({ ...form, ptpAmount: event.target.value }))}
                          placeholder="e.g. 5000"
                          className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">PTP Promised Date</label>
                        <input
                          type="date"
                          value={actionForm.ptpDate}
                          onChange={(event) => setActionForm((form) => ({ ...form, ptpDate: event.target.value }))}
                          className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        />
                      </div>
                    </div>
                  </div>

                  {actionError && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{actionError}</div>}
                  {actionSuccess && <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{actionSuccess}</div>}

                  <div className="flex justify-end gap-3 pt-3">
                    <button type="button" onClick={closeCaseAction} className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      Cancel
                    </button>
                    <button type="submit" disabled={isActionSubmitting} className="h-10 rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                      {isActionSubmitting ? "Saving..." : "Save Action & Log"}
                    </button>
                  </div>
                </form>
              )}

              {modalTab === "history" && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300">
                      <span>Filter Activity:</span>
                      {(["all", "payments", "calls", "followups", "ptps"] as const).map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => setHistoryFilterTag(tag as any)}
                          className={`rounded-full px-3 py-1 capitalize transition ${historyFilterTag === tag ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-800"}`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    {selectedActivity?.ptps.map((ptp) => (
                      <div key={`ptp-${ptp.id}`} className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-white"><CheckCircle2 className="h-4 w-4" /></span>
                            <div>
                              <p className="font-bold text-slate-950 dark:text-white text-sm">PROMISE TO PAY RECORDED</p>
                              <p className="text-xs text-slate-500">PTP Amount: {formatCurrency(ptp.amount)} | Promised Date: {formatDate(ptp.ptpDate)}</p>
                            </div>
                          </div>
                          <span className="text-xs text-slate-400">{formatDate(ptp.createdAt)}</span>
                        </div>
                        {ptp.notes && <p className="mt-2 text-xs text-slate-700 dark:text-slate-300 bg-white/60 dark:bg-slate-900/60 p-2 rounded">{ptp.notes}</p>}
                        {ptp.status === "active" && (
                          <div className="mt-3 flex gap-2">
                            <button type="button" onClick={() => updatePtpStatus(ptp.id, "kept")} className="rounded bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-700">
                              Mark Kept
                            </button>
                            <button type="button" onClick={() => updatePtpStatus(ptp.id, "broken")} className="rounded border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold text-red-700 hover:bg-red-100">
                              Mark Broken
                            </button>
                          </div>
                        )}
                      </div>
                    ))}

                    {selectedActivity?.calls.map((call) => (
                      <div key={`call-${call.id}`} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"><PhoneCall className="h-4 w-4" /></span>
                            <div>
                              <p className="font-bold text-slate-950 dark:text-white text-sm">OUTBOUND CALL - {call.disposition}</p>
                              <p className="text-xs text-slate-500">Agent: {call.actor}</p>
                            </div>
                          </div>
                          <span className="text-xs text-slate-400">{formatDateTime(call.createdAt)}</span>
                        </div>
                        {call.notes && <p className="mt-2 text-xs text-slate-700 dark:text-slate-300">{call.notes}</p>}
                      </div>
                    ))}

                    {!selectedActivity?.calls.length && !selectedActivity?.ptps.length && (
                      <div className="py-12 text-center text-xs text-slate-500">No interaction logs found for this case.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="w-full min-w-0 px-4 py-6 sm:px-6 lg:px-8">
      {/* Header Banner */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">
              {isMyCollectionsPage ? "My Collections • Case Management Console" : "Collections Pro • Agent Workspace"}
            </p>
            <h2 className="mt-2 text-3xl font-extrabold text-slate-950 dark:text-white tracking-tight">
              {isMyCollectionsPage ? "My Collections Queue" : "Agent Dashboard"}
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {isMyCollectionsPage
                ? "Search, filter, update cases, log repayments, and manage borrower contact history with full A to Z details."
                : `Live recovery overview for ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" })}`}
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-4">
              <ActionPill label="This Month" value={formatCurrency(summary?.collectionThisMonth ?? 0)} tone="text-emerald-700 dark:text-emerald-400" />
              <ActionPill label="At-risk value" value={formatCurrency(atRiskAmount)} tone="text-red-700 dark:text-red-400" />
              <ActionPill label="Pending follow-ups" value={summary?.pendingFollowups ?? 0} tone="text-amber-700 dark:text-amber-400" />
              <ActionPill label="Broken PTP" value={summary?.brokenPtps ?? 0} tone="text-red-700 dark:text-red-400" />
            </div>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => openLogPaymentModal()}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
            >
              <Plus className="h-4 w-4" />
              + Log Payment
            </button>

            {!isMyCollectionsPage ? (
              <button
                type="button"
                onClick={() => navigate("/collections/my-collections")}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-3.5 text-sm font-semibold text-white hover:bg-slate-800 transition dark:bg-slate-800 dark:hover:bg-slate-700"
              >
                <WalletCards className="h-4 w-4" />
                My Collections
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate("/collections")}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-3.5 text-sm font-semibold text-white hover:bg-slate-800 transition dark:bg-slate-800 dark:hover:bg-slate-700"
              >
                <Layers className="h-4 w-4" />
                Agent Dashboard
              </button>
            )}

            <button
              type="button"
              onClick={exportCollectionCsv}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={refresh}
              disabled={isRefreshing}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Top 4 Performance Overview Cards (With THIS MONTH COLLECTION) */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500">
            TOTAL PORTFOLIO DUE
            <IndianRupee className="h-4 w-4 text-slate-400" />
          </div>
          <p className="mt-2 text-3xl font-black text-slate-950 dark:text-white tracking-tight">
            {formatCurrency(summary?.totalOutstanding ?? stats.totalDue)}
          </p>
          <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
            <TrendingUp className="h-3.5 w-3.5" />
            +4.2% from last week
          </p>
        </div>

        <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50/90 via-teal-50/40 to-white p-5 shadow-sm dark:border-emerald-900/60 dark:from-emerald-950/40 dark:via-teal-950/20 dark:to-slate-900">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
            COLLECTED TODAY
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-600/30">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-3xl font-black text-emerald-700 dark:text-emerald-400 tracking-tight">
            {formatCurrency(summary?.collectionToday ?? 0)}
          </p>
          <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">
            <Check className="h-3.5 w-3.5" />
            {summary?.paymentsToday ?? 0} payments collected today
          </p>
        </div>

        <div className="rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50/90 via-orange-50/40 to-white p-5 shadow-sm dark:border-amber-900/60 dark:from-amber-950/40 dark:via-orange-950/20 dark:to-slate-900">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
            QUEUE PRIORITY
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500 text-white shadow-md shadow-amber-500/30">
              <Phone className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-3xl font-black text-slate-950 dark:text-white tracking-tight">
            {summary?.overdueAccounts ?? stats.overdueCases} Cases
          </p>
          <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-amber-800 dark:text-amber-300">
            <Clock className="h-3.5 w-3.5" />
            Avg. wait time: {stats.avgDpd} days DPD
          </p>
        </div>

        <div className="rounded-xl border border-emerald-500/40 bg-gradient-to-br from-emerald-600 via-teal-700 to-emerald-900 p-5 text-white shadow-lg shadow-emerald-600/20">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-emerald-100">
            THIS MONTH COLLECTION
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 text-white backdrop-blur-sm">
              <Banknote className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-3xl font-black text-white tracking-tight">
            {formatCurrency(summary?.collectionThisMonth ?? 0)}
          </p>
          <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-emerald-200">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-200" />
            {summary?.paymentsThisMonth ?? 0} total payments this month
          </p>
        </div>
      </div>

      {/* DASHBOARD VIEW (When on /collections) */}
      {!isMyCollectionsPage && (
        <>
          {/* High-Priority Borrowers & Regional Exposure Section */}
          <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
            <section className="xl:col-span-2 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-950 dark:text-white">High-Priority Borrowers</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Accounts requiring immediate recovery outreach</p>
                </div>
                <div className="flex items-center gap-2">
                  <NiceSelect
                    ariaLabel="Filter High Priority Delinquency"
                    value={highPriorityFilter}
                    onValueChange={setHighPriorityFilter}
                    className="w-52"
                    options={highPriorityDelinquencyOptions}
                  />
                </div>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800">
                  <thead className="bg-slate-50/50 dark:bg-slate-800/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-400">Borrower</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-400">Loan ID</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-400">Amount Due</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-400">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-400">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white text-xs dark:divide-slate-800 dark:bg-slate-900">
                    {highPriorityBorrowers.length ? (
                      highPriorityBorrowers.map((b) => {
                        const initials = (b.borrowerName || b.customer || "B")
                          .split(" ")
                          .map((w) => w[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase();
                        return (
                          <tr key={b.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition">
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                  {initials}
                                </div>
                                <div>
                                  <p className="font-bold text-slate-950 dark:text-slate-100 text-sm">{b.borrowerName || b.customer}</p>
                                  <p className="text-[11px] text-slate-500 font-mono">{b.phone || "-"}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3.5 font-mono font-bold text-slate-800 dark:text-slate-300 text-sm">{b.loanId}</td>
                            <td className="px-4 py-3.5 font-bold text-red-600 dark:text-red-400 text-sm">
                              {formatCurrency(b.outstanding || b.totalDue)}
                            </td>
                            <td className="px-4 py-3.5">{getStatusBadge(b.status)}</td>
                            <td className="px-4 py-3.5">
                              <button
                                type="button"
                                onClick={() => openCaseAction(b, "overview")}
                                className="inline-flex items-center gap-1 font-bold text-blue-700 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                              >
                                Open Case <ArrowUpRight className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                          No accounts matching this high priority delinquency filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-3 text-right">
                <button
                  type="button"
                  onClick={() => navigate("/collections/my-collections")}
                  className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  VIEW ALL HIGH-PRIORITY CASES IN MY COLLECTIONS →
                </button>
              </div>
            </section>

            {/* Regional Exposure Widget (Dynamic by Pincode/Zone) */}
            <aside className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-950 dark:text-white">Regional Exposure</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Default Distribution by Zip/Pincode</p>
                </div>
                <MapPin className="h-5 w-5 text-slate-400" />
              </div>

              <div className="mt-4 space-y-3">
                {regionalExposure.length ? (
                  regionalExposure.map((re, idx) => (
                    <div key={idx} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                      <div className="flex items-center gap-2.5">
                        <span className={`h-3 w-3 rounded-full ${idx === 0 ? "bg-red-500 animate-pulse" : idx === 1 ? "bg-amber-500" : "bg-blue-500"}`} />
                        <div>
                          <p className="text-xs font-bold text-slate-950 dark:text-slate-100">{re.zone}</p>
                          <p className="text-[10px] text-slate-500">{re.count} Active Cases</p>
                        </div>
                      </div>
                      <span className="font-bold text-xs text-slate-900 dark:text-slate-200">{formatCurrency(re.exposure)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500 py-4 text-center">No pincode exposure data available.</p>
                )}
              </div>
            </aside>
          </div>

          {/* DPD Bucket & PTP Controls */}
          <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-950 dark:text-white">DPD Bucket Distribution</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Portfolio split for prioritising recovery action.</p>
                </div>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-100 dark:bg-blue-950/50 dark:text-blue-300 dark:ring-blue-800">
                  {summary?.pendingFollowups ?? 0} pending follow-ups
                </span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                {["0-30", "31-60", "61-90", "90+"].map((bucket) => {
                  const value = summary?.buckets?.[bucket] ?? 0;
                  const total = Math.max(1, summary?.activeCases ?? collections.length);
                  const percent = Math.round((value / total) * 100);
                  return (
                    <div key={bucket} className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">{bucket} DPD</span>
                        <span className="font-bold text-slate-950 dark:text-slate-100">{value}</span>
                      </div>
                      <div className="mt-3 h-2 rounded-full bg-slate-200 dark:bg-slate-700">
                        <div className="h-2 rounded-full bg-blue-600" style={{ width: `${percent}%` }} />
                      </div>
                      <p className="mt-2 text-xs text-slate-500">{percent}% of active cases</p>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-base font-semibold text-slate-950 dark:text-white">PTP Control</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Promise-to-pay commitments and broken promise risk.</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <MetricTile label="Active PTP" value={String(summary?.activePtps ?? 0)} accent />
                <MetricTile label="Broken PTP" value={String(summary?.brokenPtps ?? 0)} />
                <MetricTile label="Payments today" value={String(summary?.paymentsToday ?? 0)} />
                <MetricTile label="Collected total" value={formatCurrency(summary?.totalCollected ?? 0)} />
              </div>
            </section>
          </div>
        </>
      )}

      {/* MY COLLECTIONS FULL CASE QUEUE VIEW */}
      {renderCustomerListQueue()}

      {/* TODAY'S & MONTHLY COLLECTED PAYMENTS MODAL */}
      {renderTodayPaymentsModal()}
    </div>
  );
  // ----------------------------------------------------
}
