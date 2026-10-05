import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams, useOutletContext } from "react-router-dom";
import { Activity, AlertTriangle, Banknote, Briefcase, Calendar, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock, DollarSign, Download, FileSpreadsheet, FileText, IndianRupee, Phone, Search, Send, ShieldAlert, ShieldCheck, UserPlus, Users, Printer } from "lucide-react";
import { apiGet } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { AppTooltip } from "../../components/ui/app-tooltip";
import { NiceSelect } from "../../components/ui/nice-select";
import { EmptyState, MetricCard } from "../../components/crm/DashboardPrimitives";

type Lead = {
  id: string;
  name: string;
  phone: string;
  source?: string;
  status: string;
  priority: string;
  assignedTo: string;
  loanAmount: number | null;
  createdDate: string;
  nextFollowupAt?: string | null;
  pendingDocumentCount?: number;
  documentVerifiedCount?: number;
  documentTotalCount?: number;
  latestHandoffStatus?: string;
  latestHandoffAt?: string | null;
  isCallbackDue?: boolean;
  isDocsBreach?: boolean;
  isFirstCallBreach?: boolean;
  nextAction?: string;
  nextActionDueAt?: string | null;
  slaBreached?: boolean;
  slaStatus?: string;
};

type SlaReport = {
  generatedAt: string;
  period: string;
  summary: {
    breachRate: number;
    callbackDue: number;
    docsBreached: number;
    firstCallBreached: number;
    noDisposition: number;
    onTrack: number;
    readyHandoff: number;
    sentToCredit: number;
    slaBreached: number;
    totalLeads: number;
    warning: number;
  };
  byOwner: Array<{
    breachRate: number;
    breached: number;
    callbackDue: number;
    docsBreached: number;
    firstCallBreached: number;
    name: string;
    total: number;
    warning: number;
  }>;
  byReason: Record<string, number>;
  breachedLeads: Array<{
    assignedTo?: string | null;
    createdAt?: string | null;
    id: string;
    name: string;
    nextAction?: string;
    nextActionDueAt?: string | null;
    phone?: string;
    priority?: string;
    reason: string;
    slaStatus?: string;
  }>;
};

type AccountantReport = {
  actionQueue: {
    activeLoans: number;
    collectionsFollowup: number;
    paymentQueue: number;
    payoutQueue: number;
    repaymentDue: number;
  };
  metrics: {
    activeLoans: number;
    collectionDue: number;
    collectionEfficiency: number;
    overdueLoans: number;
    paidLeads: number;
    payoutAmount: number;
    paymentQueueAmount: number;
    paymentQueueCount: number;
    repaymentDueAmount: number;
    totalCollected: number;
    totalDisbursed: number;
    totalOutstanding: number;
    upcomingRepayment: number;
  };
  recentTransfers: Array<{
    customerName: string;
    disbursementAmount: number;
    dueDate: string | null;
    loanId: string;
    repaymentAmount: number;
    transferType: string;
    transactionId: string;
  }>;
};

type CollectionReportRow = {
  aadhaar?: string;
  address?: string;
  borrowerName?: string;
  daysOverdue: number;
  disbursementAmount?: number;
  disbursementDate?: string | null;
  dueDate?: string | null;
  emiStatus?: string;
  gender?: string;
  id: string;
  loanId: string;
  loanType?: string;
  memberCode?: string;
  outstanding?: number;
  pan?: string;
  phone: string;
  pincode?: string;
  totalDue: number;
  dob?: string | null;
  email?: string;
  lastPaymentDate?: string | null;
  amountPaid?: number;
  principal?: number;
  baseRepayment?: number;
  status?: string;
  customer?: string;
};

type CollectionDeepReport = {
  paymentTrend: Array<{ amount: number; paymentCount: number; paymentDate: string }>;
  recentPayments?: Array<{
    paymentId: number;
    loanId: string;
    customerName: string;
    phone: string;
    amount: number;
    principalComponent: number;
    interestComponent: number;
    receivedAt: string;
    status: string;
    reference: string;
    transactionId: string;
  }>;
  ptpSummary: Record<string, { amount: number; count: number }>;
  summary: {
    activePtps: number;
    brokenPtps: number;
    collectionToday: number;
    paymentsToday: number;
    pendingFollowups: number;
    recoveryRate: number;
    totalCollected: number;
    totalOutstanding: number;
  };
};

type InterestReportRow = Record<string, string | number | null | undefined>;

type AuditLog = {
  id: number;
  action: string;
  actorEmail: string;
  actorName: string;
  actorRole: string;
  leadId: string;
  applicationId: string;
  entityType: string;
  entityId: string;
  ipAddress: string;
  createdAt: string;
};

type InterestReportsResponse = {
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
  };
};

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  currency: "INR",
  maximumFractionDigits: 0,
  style: "currency",
});

const reportPageSizeOptions = [
  { label: "8 / page", value: "8" },
  { label: "15 / page", value: "15" },
  { label: "25 / page", value: "25" },
  { label: "50 / page", value: "50" },
];

const formatCurrency = (value: number | null | undefined) => currencyFormatter.format(Number(value || 0));

const formatDate = (value?: string | null) => {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", { day: "2-digit", hour: "2-digit", minute: "2-digit", month: "short" });
};

const formatPercent = (numerator: number, denominator: number) => (
  denominator > 0 ? `${Math.round((numerator / denominator) * 100)}%` : "0%"
);

const formatRate = (value: string | number | null | undefined) => `${Number(value || 0)}%`;

const parseDate = (value?: string | null) => {
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
  const date = new Date(str.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date;
};

const getCollectionPriority = (item: CollectionReportRow) => {
  const outstanding = Number(item.outstanding || item.totalDue || 0);
  const dpd = Number(item.daysOverdue || 0);
  if (outstanding <= 0) return "Paid";
  if (dpd <= 0) return "Current";
  if (dpd > 30) return "Critical";
  if (dpd > 15) return "High";
  return "Watch";
};

const daysUntil = (value?: string | null) => {
  const date = parseDate(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86400000);
};

const periodStartDate = (period: string) => {
  const date = new Date();
  if (period === "last30days") date.setDate(date.getDate() - 30);
  if (period === "last3months") date.setMonth(date.getMonth() - 3);
  if (period === "last6months") date.setMonth(date.getMonth() - 6);
  if (period === "lastyear") date.setFullYear(date.getFullYear() - 1);
  date.setHours(0, 0, 0, 0);
  return date;
};

const getPeriodRange = (period: string) => {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  switch (period) {
    case "today":
      start.setHours(0, 0, 0, 0);
      break;
    case "yesterday":
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      break;
    case "thismonth":
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    case "lastmonth":
      start.setMonth(start.getMonth() - 1);
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      
      end.setDate(0); // Last day of previous month
      end.setHours(23, 59, 59, 999);
      break;
    case "last30days":
      start.setDate(start.getDate() - 30);
      start.setHours(0, 0, 0, 0);
      break;
    case "last90days":
    case "last3months":
      start.setMonth(start.getMonth() - 3);
      start.setHours(0, 0, 0, 0);
      break;
    case "last6months":
      start.setMonth(start.getMonth() - 6);
      start.setHours(0, 0, 0, 0);
      break;
    case "yeartodate":
      start.setMonth(0, 1); // January 1st
      start.setHours(0, 0, 0, 0);
      break;
    case "lastyear":
      start.setFullYear(start.getFullYear() - 1);
      start.setHours(0, 0, 0, 0);
      break;
    case "alltime":
    default:
      start.setTime(0); // 1970-01-01
      break;
  }

  return { start, end };
};

const countRows = (leads: Lead[], key: keyof Lead) => {
  const map = new Map<string, number>();
  leads.forEach((lead) => {
    const label = String(lead[key] || "Unknown");
    map.set(label, (map.get(label) || 0) + 1);
  });
  return Array.from(map.entries()).map(([label, count]) => ({ count, label }));
};

const exportCsv = (rows: Array<Record<string, string | number>>, filename = "crm-report") => {
  const headers = Object.keys(rows[0] || { message: "No data" });
  const body = rows.length ? rows : [{ message: "No data" }];
  const csv = [
    headers.join(","),
    ...body.map((row) => headers.map((header) => `"${String(row[header] ?? "").replace(/"/g, '""')}"`).join(",")),
  ].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

const formatCibilDate = (value?: string | Date | null) => {
  if (!value) return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    const dd = String(value.getDate()).padStart(2, "0");
    const mm = String(value.getMonth() + 1).padStart(2, "0");
    const yyyy = String(value.getFullYear());
    return `${dd}${mm}${yyyy}`;
  }
  const str = String(value).trim();
  if (!str || str === "-") return "";
  if (/^\d{8}$/.test(str)) return str;
  const ddMmYyyy = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (ddMmYyyy) {
    return `${ddMmYyyy[1].padStart(2, "0")}${ddMmYyyy[2].padStart(2, "0")}${ddMmYyyy[3]}`;
  }
  const yyyyMmDd = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (yyyyMmDd) {
    return `${yyyyMmDd[3].padStart(2, "0")}${yyyyMmDd[2].padStart(2, "0")}${yyyyMmDd[1]}`;
  }
  const date = new Date(str);
  if (Number.isNaN(date.getTime())) return "";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  return `${dd}${mm}${yyyy}`;
};

const FEMALE_FIRST_NAMES = new Set([
  "anjali", "priya", "pooja", "neha", "kajal", "shruti", "nandini", "suman", "anita", "sunita",
  "kiran", "sangeeta", "ritu", "shweta", "kavita", "sneha", "divya", "megha", "deepika", "nisha",
  "meena", "seema", "rekha", "geeta", "chhaya", "jyoti", "mamta", "swati", "archana", "manju",
  "preeti", "rani", "payal", "soni", "sonam", "ankita", "rachna", "vandana", "bhavna", "dimple",
  "aarti", "monika", "simran", "sarita", "pinky", "sushma", "kusum", "babita", "kamlesh", "nirmala",
  "savita", "sudha", "lata", "usha", "asha", "laxmi", "saraswati", "parvati", "durga", "reena",
  "sheela", "radha", "sita", "gouri", "tulsi", "reshma", "roshni", "komal", "sakshi", "muskan",
  "shristi", "richa", "tanya", "riya", "khushi", "aditi", "ishita", "ananya", "avani", "drishti",
  "diya", "isika", "kavya", "manya", "navya", "prisha", "riddhi", "siddhi", "shreya", "snehal",
  "alisha", "anusha", "bhoomika", "chitra", "dolly", "ekta", "falguni", "gayatry", "heena", "indrani",
  "juhi", "karishma", "lipi", "madhu", "poonam", "roopa", "sapna", "tanu", "urvashi", "varsha", "yashika"
]);

const formatCibilGender = (gender?: string | null, name?: string | null) => {
  if (gender) {
    const g = String(gender).trim().toLowerCase();
    if (g === "2" || g === "f" || g.includes("female") || g.includes("woman")) return "2";
    if (g === "3" || g === "t" || g.includes("trans")) return "3";
    if (g === "1" || g === "m" || g.includes("male") || g.includes("man")) return "1";
  }

  if (name) {
    const cleanName = String(name).trim().toLowerCase();
    const parts = cleanName.split(/\s+/);
    for (const part of parts) {
      if (FEMALE_FIRST_NAMES.has(part) || part === "mrs" || part === "ms" || part === "miss" || part === "smt" || part === "female") {
        return "2";
      }
    }
  }

  return "1";
};

const cleanCibilAlphaNumeric = (str?: string | null): string => {
  if (!str || str === "-") return "";
  return String(str)
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const cleanCibilDigits = (str?: string | null): string => {
  if (!str || str === "-") return "";
  return String(str).replace(/\D/g, "").trim();
};

const cleanCibilEmail = (str?: string | null): string => {
  if (!str || str === "-") return "";
  const cleaned = String(str).trim().toLowerCase().replace(/[^a-z0-9._%+-@]/g, "");
  return cleaned.includes("@") ? cleaned : "";
};

const formatCibilStateCode = (address?: string | null, pincode?: string | null) => {
  const text = `${address || ""} ${pincode || ""}`.toLowerCase();
  if (text.includes("delhi") || text.startsWith("11")) return "07";
  if (text.includes("haryana") || text.startsWith("12")) return "06";
  if (text.includes("punjab") || text.startsWith("14") || text.startsWith("15")) return "03";
  if (text.includes("uttar pradesh") || text.includes("up") || text.startsWith("20")) return "09";
  if (text.includes("karnataka") || text.startsWith("56")) return "29";
  if (text.includes("maharashtra") || text.startsWith("40")) return "27";
  if (text.includes("gujarat") || text.startsWith("38")) return "24";
  if (text.includes("rajasthan") || text.startsWith("30")) return "08";
  if (text.includes("bihar") || text.startsWith("80")) return "10";
  if (text.includes("west bengal") || text.startsWith("70")) return "19";
  if (text.includes("telangana") || text.startsWith("50")) return "36";
  if (text.includes("tamil nadu") || text.startsWith("60")) return "33";
  return "09";
};

const exportCibilCsv = (collectionsData: CollectionReportRow[], filename = "cibil-bureau-report") => {
  const headerSegmentRow = [
    "Name Segment PN", "", "",
    "Identification Segment ID", "", "", "", "", "", "", "", "", "", "", "",
    "Telephone Segment PT", "", "", "", "", "",
    "Email Contact Segment EC", "",
    "Address Segment PA", "", "", "", "", "", "",
    "Account Segment AM", "", "", "", "", "", "", ""
  ];

  const headerColumnRow = [
    "Consumer Name", "Date of Birth", "Gender",
    "Income Tax ID Number", "Passport Number", "Passport Issue Date", "Passport Expiry Date", "Voter ID Number", "Driving License Number", "Driving License Issue Date", "Driving License Expiry Date", "Ration Card Number", "Universal ID Number", "Additional ID 1", "Additional ID 2",
    "Telephone No Mobile", "Telephone No Residence", "Telephone No Office", "Extension Office", "Telephone No Other", "Extension Other",
    "Email ID 1", "Email ID 2",
    "Address Line 1", "State Code 1", "PIN Code 1", "Address Category 1", "Address Line 2", "State Code 2", "PIN Code 2",
    "Curr New Account No", "Date Opened Disbursed", "Date of Last Payment", "Date Closed", "High Credit Sanctioned Amt", "Current Balance", "Amt Overdue", "No of Days Past Due"
  ];

  const dataRows = collectionsData.map((item) => {
    const name = cleanCibilAlphaNumeric(item.borrowerName || item.customer || "CUSTOMER");
    const dob = formatCibilDate(item.dob || (item as any).dateOfBirth || (item as any).date_of_birth);
    const gender = formatCibilGender(item.gender, item.borrowerName || item.customer);
    const pan = cleanCibilAlphaNumeric(item.pan).slice(0, 10);
    const aadhaar = cleanCibilDigits(item.aadhaar).slice(0, 12);
    const phone = cleanCibilDigits(item.phone).slice(-10);
    const email = cleanCibilEmail(item.email);
    const addr = cleanCibilAlphaNumeric(item.address);
    const pin = cleanCibilDigits(item.pincode).slice(0, 6);
    const stateCode = cleanCibilDigits(formatCibilStateCode(addr, pin));
    const accountNo = cleanCibilAlphaNumeric(item.loanId || item.memberCode || "");
    const disbursedDate = formatCibilDate(item.disbursementDate);
    const amountPaid = Number(item.amountPaid || 0);
    const lastPaymentDate = amountPaid > 0 ? formatCibilDate(item.lastPaymentDate) : "";
    const outstanding = Math.max(0, Math.round(Number(item.outstanding !== undefined ? item.outstanding : item.totalDue || 0)));
    const isClosed = outstanding <= 0 && amountPaid > 0;
    const dateClosed = isClosed ? formatCibilDate(item.lastPaymentDate || item.dueDate) : "";
    const highCredit = Math.max(0, Math.round(Number(item.principal || item.disbursementAmount || item.baseRepayment || item.totalDue || 0)));
    const dpd = Math.max(0, Math.round(Number(item.daysOverdue || 0)));
    const overdueAmt = dpd > 0 ? outstanding : 0;

    return [
      name,
      dob,
      gender,
      pan,
      "", "", "", "", "", "", "", "",
      aadhaar,
      "", "",
      phone,
      "", "", "", "", "",
      email,
      "",
      addr,
      stateCode,
      pin,
      "02",
      "", "", "",
      accountNo,
      disbursedDate,
      lastPaymentDate,
      dateClosed,
      String(highCredit),
      String(outstanding),
      String(overdueAmt),
      String(dpd)
    ];
  });

  const csvContent = "\uFEFF" + [headerSegmentRow, headerColumnRow, ...dataRows]
    .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

export function Reports() {
  const context = useOutletContext<{ activeProduct?: string }>() || {};
  const activeProduct = context.activeProduct || "Payday Loan (Standard)";
  const { user, activeRole } = useAuth();
  const [selectedPeriod, setSelectedPeriod] = useState("last6months");
  const [collectionSearch, setCollectionSearch] = useState("");
  const [collectionBucket, setCollectionBucket] = useState("all");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [slaReport, setSlaReport] = useState<SlaReport | null>(null);
  const [accountantReport, setAccountantReport] = useState<AccountantReport | null>(null);
  const [interestReports, setInterestReports] = useState<InterestReportsResponse | null>(null);
  const [collectionDeepReport, setCollectionDeepReport] = useState<CollectionDeepReport | null>(null);
  const [collections, setCollections] = useState<CollectionReportRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState("");
  const currentRole = "superadmin";
  const isTelecaller = currentRole === "telecaller";
  const isAccountant = currentRole === "accountant";
  const isCollection = currentRole === "collection";
  const isSuperadmin = true;

  const [searchParams, setSearchParams] = useSearchParams();
  const reportType = searchParams.get("type");

  const { hash } = useLocation();



  useEffect(() => {
    if (hash && !isLoading) {
      const id = hash.replace("#", "");
      const element = document.getElementById(id);
      if (element) {
        const timer = setTimeout(() => {
          element.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 120);
        return () => clearTimeout(timer);
      }
    }
  }, [hash, isLoading]);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setApiError("");

    const leadsRequest = (isAccountant || isCollection) && !isSuperadmin
      ? Promise.resolve<Lead[]>([])
      : apiGet<Lead[]>(isTelecaller ? "/leads/telecaller-workbench" : "/leads", controller.signal);
    const slaRequest = isTelecaller || isSuperadmin
      ? apiGet<SlaReport>(`/leads/telecaller-sla-report?period=${selectedPeriod}`, controller.signal)
      : Promise.resolve(null);
    const accountRequest = isAccountant || isSuperadmin
      ? apiGet<AccountantReport>("/dashboard/accountant", controller.signal)
      : Promise.resolve(null);
    const interestRequest = isAccountant || isSuperadmin
      ? apiGet<InterestReportsResponse>("/accounts/reports/interest", controller.signal)
      : Promise.resolve(null);
    const collectionRequest = isAccountant || isCollection || isSuperadmin
      ? apiGet<CollectionReportRow[]>("/collections", controller.signal)
      : Promise.resolve<CollectionReportRow[]>([]);
    const collectionDeepRequest = isCollection || isSuperadmin
      ? apiGet<CollectionDeepReport>("/collections/reports", controller.signal)
      : Promise.resolve(null);
    const auditLogsRequest = isAccountant || currentRole === "credit-manager" || isSuperadmin
      ? apiGet<AuditLog[]>("/dashboard/audit-logs", controller.signal)
      : Promise.resolve<AuditLog[]>([]);

    Promise.all([leadsRequest, slaRequest, accountRequest, interestRequest, collectionRequest, collectionDeepRequest, auditLogsRequest])
      .then(([leadRows, report, account, interest, collectionRows, collectionDeep, logs]) => {
        const schemes = ["Payday Loan (Standard)", "Payday Loan (Express)", "Payday Loan (Flexi)", "Payday Loan (Premium)"];
        const activeIdx = schemes.indexOf(activeProduct);
        const filterList = (arr: any[]) => arr;

        const filteredLeads = filterList(leadRows || []);
        const filteredCollections = filterList(collectionRows || []);
        const filteredLogs = filterList(logs || []);

        let filteredSla = null;
        if (report) {
          filteredSla = {
            ...report,
            breachedLeads: filterList(report.breachedLeads || []),
            byOwner: report.byOwner || [],
            summary: report.summary || {}
          };
        }

        let filteredAccount = null;
        if (account) {
          filteredAccount = {
            ...account,
            recentTransfers: filterList(account.recentTransfers || []),
            metrics: account.metrics || {},
            actionQueue: account.actionQueue || {}
          };
        }

        let filteredCollectionDeep = null;
        if (collectionDeep) {
          filteredCollectionDeep = {
            ...collectionDeep,
            recentPayments: filterList(collectionDeep.recentPayments || []),
            summary: collectionDeep.summary || {}
          };
        }

        let filteredInterest = null;
        if (interest) {
          const r = interest.reports || {};
          filteredInterest = {
            ...interest,
            reports: {
              accruedInterest: filterList(r.accruedInterest || []),
              accruedVsCollected: filterList(r.accruedVsCollected || []),
              bookedVsReceived: filterList(r.bookedVsReceived || []),
              customerMonthWise: filterList(r.customerMonthWise || []),
              dayWise: filterList(r.dayWise || []),
              interestRealization: filterList(r.interestRealization || []),
              interestReceivable: filterList(r.interestReceivable || []),
              monthWise: filterList(r.monthWise || [])
            },
            summary: interest.summary || {}
          };
        }

        setLeads(filteredLeads);
        setSlaReport(filteredSla);
        setAccountantReport(filteredAccount);
        setInterestReports(filteredInterest);
        setCollections(filteredCollections);
        setCollectionDeepReport(filteredCollectionDeep);
        setAuditLogs(filteredLogs);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setApiError(error instanceof Error ? error.message : "Unable to load reports");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [isAccountant, isCollection, isTelecaller, selectedPeriod, currentRole, reportType]);

  const filteredLeads = useMemo(() => {
    const { start, end } = getPeriodRange(selectedPeriod);
    return leads.filter((lead) => {
      const date = new Date(lead.createdDate);
      return Number.isNaN(date.getTime()) || (date >= start && date <= end);
    });
  }, [leads, selectedPeriod]);

  const documentPendingLeads = filteredLeads.filter((lead) => Number(lead.pendingDocumentCount || 0) > 0);
  const followupLeads = filteredLeads.filter((lead) => Boolean(lead.nextFollowupAt));
  const handoffLeads = filteredLeads.filter((lead) => Boolean(lead.latestHandoffStatus));
  const summaryRows = [
    ...countRows(filteredLeads, "status").map((row) => ({ report: "Status", ...row })),
    ...countRows(filteredLeads, "priority").map((row) => ({ report: "Priority", ...row })),
    ...countRows(filteredLeads, "source").map((row) => ({ report: "Source", ...row })),
  ];

  const exportRows = [
    ...summaryRows.map((row) => ({ Report: row.report, Label: row.label, Count: row.count })),
    ...(slaReport?.breachedLeads || []).map((lead) => ({ Report: "SLA Breach", Label: lead.name, Count: lead.reason })),
    ...(slaReport?.byOwner || []).map((owner) => ({ Report: "Owner SLA", Label: owner.name, Count: `${owner.breached}/${owner.total} breached` })),
    ...followupLeads.map((lead) => ({ Report: "Follow-up", Label: lead.name, Count: formatDate(lead.nextFollowupAt) })),
    ...documentPendingLeads.map((lead) => ({ Report: "Document Pending", Label: lead.name, Count: Number(lead.pendingDocumentCount || 0) })),
    ...handoffLeads.map((lead) => ({ Report: "Handoff", Label: lead.name, Count: lead.latestHandoffStatus || "ready" })),
  ];

  const filteredCollections = useMemo(() => {
    const query = collectionSearch.trim().toLowerCase();
    const { start, end } = getPeriodRange(selectedPeriod);
    return collections.filter((item) => {
      const priority = getCollectionPriority(item);
      const date = new Date(item.disbursementDate || item.dueDate || 0);
      const matchesPeriod = Number.isNaN(date.getTime()) || (date >= start && date <= end);
      const matchesSearch = !query || [
        item.borrowerName,
        item.loanId,
        item.memberCode,
        item.pan,
        item.aadhaar,
        item.phone,
      ].join(" ").toLowerCase().includes(query);
      const matchesBucket = collectionBucket === "all"
        || (collectionBucket === "current" && priority === "Current")
        || (collectionBucket === "watch" && priority === "Watch")
        || (collectionBucket === "high" && priority === "High")
        || (collectionBucket === "critical" && priority === "Critical")
        || (collectionBucket === "paid" && priority === "Paid")
        || (collectionBucket === "overdue" && Number(item.daysOverdue || 0) > 0)
        || (collectionBucket === "activePtp" && (item.emiStatus === "PTP" || item.status === "PTP"))
        || (collectionBucket === "brokenPtp" && (item.emiStatus === "Broken PTP" || item.status === "Broken PTP"));
      return matchesPeriod && matchesSearch && matchesBucket;
    }).sort((a, b) => Number(b.daysOverdue || 0) - Number(a.daysOverdue || 0)
      || Number(b.outstanding || b.totalDue || 0) - Number(a.outstanding || a.totalDue || 0));
  }, [collectionBucket, collectionSearch, collections, selectedPeriod]);

  const collectionRows = filteredCollections.map((item, index) => ({
    aadhaar: item.aadhaar || "-",
    borrower: item.borrowerName || "-",
    disbursement: formatCurrency(item.disbursementAmount),
    disbursementDate: formatDate(item.disbursementDate),
    dpd: Number(item.daysOverdue || 0),
    dueDate: formatDate(item.dueDate),
    emiStatus: item.emiStatus || "-",
    loanId: item.loanId,
    outstanding: formatCurrency(item.outstanding || item.totalDue),
    pan: item.pan || "-",
    phone: item.phone || "-",
    priority: getCollectionPriority(item),
    serial: index + 1,
  }));

  const collectionExportRows = collectionRows.map((row) => ({
    "S. No.": row.serial,
    Borrower: row.borrower,
    Phone: row.phone,
    PAN: row.pan,
    Aadhaar: row.aadhaar,
    "Loan Account": row.loanId,
    Disbursement: row.disbursement,
    "Disbursement Date": row.disbursementDate,
    "Due Date": row.dueDate,
    Outstanding: row.outstanding,
    "EMI Status": row.emiStatus,
    Priority: row.priority,
    DPD: row.dpd,
  }));
  const overallCollectionSummary = {
    active: collections.length,
    critical: collections.filter((item) => getCollectionPriority(item) === "Critical").length,
    current: collections.filter((item) => getCollectionPriority(item) === "Current").length,
    high: collections.filter((item) => getCollectionPriority(item) === "High").length,
    overdue: collections.filter((item) => Number(item.daysOverdue || 0) > 0).length,
    outstanding: collections.reduce((sum, item) => sum + Number(item.outstanding || item.totalDue || 0), 0),
    paid: collections.filter((item) => getCollectionPriority(item) === "Paid").length,
    par30: collections
      .filter((item) => Number(item.daysOverdue || 0) > 30)
      .reduce((sum, item) => sum + Number(item.outstanding || item.totalDue || 0), 0),
    watch: collections.filter((item) => getCollectionPriority(item) === "Watch").length,
  };
  const overallCollectionBucketOptions = [
    { label: "Current", value: "current", count: overallCollectionSummary.current, tone: "bg-emerald-600" },
    { label: "Watch", value: "watch", count: overallCollectionSummary.watch, tone: "bg-amber-500" },
    { label: "High", value: "high", count: overallCollectionSummary.high, tone: "bg-orange-600" },
    { label: "Critical", value: "critical", count: overallCollectionSummary.critical, tone: "bg-red-600" },
    { label: "Paid", value: "paid", count: overallCollectionSummary.paid, tone: "bg-slate-500" },
  ];
  const repaymentDueSoon = (accountantReport?.recentTransfers || []).filter((row) => {
    const dueInDays = daysUntil(row.dueDate);
    return dueInDays !== null && dueInDays >= 0 && dueInDays <= 7;
  }).length;
  const telecallerReportHealth = [
    { label: "Handoff rate", value: formatPercent(handoffLeads.length, filteredLeads.length), note: "Sent to credit", tone: "bg-emerald-600" },
    { label: "Docs pending rate", value: formatPercent(documentPendingLeads.length, filteredLeads.length), note: "Needs document action", tone: "bg-amber-500" },
    { label: "Follow-up coverage", value: formatPercent(followupLeads.length, filteredLeads.length), note: "Scheduled callbacks", tone: "bg-blue-600" },
    { label: "SLA health", value: `${Math.max(0, 100 - Number(slaReport?.summary.breachRate || 0))}%`, note: "Non-breached leads", tone: "bg-violet-600" },
  ];
  const topSlaOwners = [...(slaReport?.byOwner || [])]
    .sort((a, b) => b.breachRate - a.breachRate || b.breached - a.breached)
    .slice(0, 4);
  const accountRows = [
    { label: "Payment Queue", value: accountantReport?.metrics.paymentQueueCount ?? 0, amount: formatCurrency(accountantReport?.metrics.paymentQueueAmount) },
    { label: "Paid Leads", value: accountantReport?.metrics.paidLeads ?? 0, amount: formatCurrency(accountantReport?.metrics.totalDisbursed) },
    { label: "Active Loans", value: accountantReport?.metrics.activeLoans ?? 0, amount: formatCurrency(accountantReport?.metrics.totalOutstanding) },
    { label: "Repayment Due", value: accountantReport?.actionQueue.repaymentDue ?? 0, amount: formatCurrency(accountantReport?.metrics.repaymentDueAmount) },
    { label: "Collections Follow-up", value: accountantReport?.actionQueue.collectionsFollowup ?? 0, amount: formatCurrency(accountantReport?.metrics.collectionDue) },
    { label: "Payout Queue", value: accountantReport?.actionQueue.payoutQueue ?? 0, amount: formatCurrency(accountantReport?.metrics.payoutAmount) },
  ];
  const accountantExportRows = [
    ...accountRows.map((row) => ({ Report: "Account Summary", Label: row.label, Count: row.value, Amount: row.amount })),
    ...collectionRows.map((row) => ({ Report: "Collection", Label: row.borrower, Count: row.dpd, Amount: row.outstanding })),
    ...(accountantReport?.recentTransfers || []).map((row) => ({ Report: "Recent Transfer", Label: row.customerName, Count: row.loanId, Amount: formatCurrency(row.disbursementAmount) })),
  ];
  const interestSummaryRows = [
    { label: "Accrued Interest", value: interestReports?.summary.accruedInterest ?? 0, amount: formatCurrency(interestReports?.summary.accruedInterest) },
    { label: "Interest Receivable", value: interestReports?.reports.interestReceivable.length ?? 0, amount: formatCurrency(interestReports?.summary.interestReceivable) },
    { label: "Interest Realized", value: interestReports?.summary.collectionRate ?? 0, amount: formatCurrency(interestReports?.summary.collectedInterest) },
    { label: "Booked Interest", value: interestReports?.summary.bookedReceiptRate ?? 0, amount: formatCurrency(interestReports?.summary.bookedInterest) },
    { label: "Booked Pending", value: interestReports?.reports.bookedVsReceived.length ?? 0, amount: formatCurrency(interestReports?.summary.pendingBookedInterest) },
  ];
  const accruedInterestRows = (interestReports?.reports.accruedInterest || []).map((row) => [
    String(row.loanId || "-"),
    String(row.customerName || "Customer"),
    formatCurrency(Number(row.principal || 0)),
    formatRate(row.interestRate),
    formatCurrency(Number(row.accruedInterest || 0)),
    formatDate(row.dueDate ? String(row.dueDate) : null),
  ]);
  const receivableRows = (interestReports?.reports.interestReceivable || []).map((row) => [
    String(row.loanId || "-"),
    String(row.customerName || "Customer"),
    formatCurrency(Number(row.accruedInterest || 0)),
    formatCurrency(Number(row.collectedInterest || 0)),
    formatCurrency(Number(row.interestReceivable || 0)),
    formatDate(row.dueDate ? String(row.dueDate) : null),
  ]);
  const realizationRows = (interestReports?.reports.interestRealization || []).map((row) => [
    String(row.loanId || "-"),
    String(row.customerName || "Customer"),
    formatCurrency(Number(row.collectedInterest || 0)),
    formatCurrency(Number(row.pendingInterest || 0)),
  ]);
  const accruedVsCollectedRows = (interestReports?.reports.accruedVsCollected || []).map((row) => [
    String(row.loanId || "-"),
    String(row.customerName || "Customer"),
    formatCurrency(Number(row.accruedInterest || 0)),
    formatCurrency(Number(row.collectedInterest || 0)),
    formatCurrency(Number(row.pendingInterest || 0)),
    formatRate(row.collectionRate),
  ]);
  const bookedVsReceivedRows = (interestReports?.reports.bookedVsReceived || []).map((row) => [
    String(row.loanId || "-"),
    String(row.customerName || "Customer"),
    formatCurrency(Number(row.bookedInterest || 0)),
    formatCurrency(Number(row.receivedInterest || 0)),
    formatCurrency(Number(row.pendingBookedInterest || 0)),
  ]);
  const monthWiseRows = (interestReports?.reports.monthWise || []).map((row) => [
    String(row.period || "-"),
    String(row.days || 0),
    formatCurrency(Number(row.accruedInterest || 0)),
    formatCurrency(Number(row.bookedInterest || 0)),
    formatCurrency(Number(row.receivedInterest || 0)),
    formatCurrency(Number(row.pendingInterest || 0)),
  ]);
  const customerMonthWiseRows = (interestReports?.reports.customerMonthWise || []).map((row) => [
    String(row.period || "-"),
    String(row.loanId || "-"),
    String(row.customerName || "Customer"),
    formatCurrency(Number(row.principal || 0)),
    formatRate(row.interestRate),
    String(row.days || 0),
    formatCurrency(Number(row.accruedInterest || 0)),
    formatCurrency(Number(row.receivedInterest || 0)),
    formatCurrency(Number(row.pendingInterest || 0)),
  ]);
  const dayWiseRows = (interestReports?.reports.dayWise || []).map((row) => [
    formatDate(row.period ? String(row.period) : null),
    String(row.days || 0),
    formatCurrency(Number(row.accruedInterest || 0)),
    formatCurrency(Number(row.bookedInterest || 0)),
    formatCurrency(Number(row.receivedInterest || 0)),
    formatCurrency(Number(row.pendingInterest || 0)),
  ]);

  if (reportType) {
    return (
      <SingleReportView
        reportType={reportType}
        leads={leads}
        slaReport={slaReport}
        accountantReport={accountantReport}
        interestReports={interestReports}
        collectionDeepReport={collectionDeepReport}
        collections={collections}
        auditLogs={auditLogs}
        isLoading={isLoading}
        apiError={apiError}
        selectedPeriod={selectedPeriod}
        onPeriodChange={setSelectedPeriod}
        onBack={() => setSearchParams({})}
      />
    );
  }

  if (isCollection) {
    const collectionSummary = {
      active: collections.length,
      critical: collections.filter((item) => getCollectionPriority(item) === "Critical").length,
      high: collections.filter((item) => getCollectionPriority(item) === "High").length,
      overdue: collections.filter((item) => Number(item.daysOverdue || 0) > 0).length,
      outstanding: collections.reduce((sum, item) => sum + Number(item.outstanding || item.totalDue || 0), 0),
      par30: collections
        .filter((item) => Number(item.daysOverdue || 0) > 30)
        .reduce((sum, item) => sum + Number(item.outstanding || item.totalDue || 0), 0),
      avgDpd: collections.length
        ? Math.round(collections.reduce((sum, item) => sum + Number(item.daysOverdue || 0), 0) / collections.length)
        : 0,
    };
    const bucketOptions = [
      { label: "All", value: "all", count: collections.length },
      { label: "Current", value: "current", count: collections.filter((item) => getCollectionPriority(item) === "Current").length },
      { label: "Watch", value: "watch", count: collections.filter((item) => getCollectionPriority(item) === "Watch").length },
      { label: "High", value: "high", count: collectionSummary.high },
      { label: "Critical", value: "critical", count: collectionSummary.critical },
      { label: "Overdue", value: "overdue", count: collectionSummary.overdue },
      { label: "Active PTP", value: "activePtp", count: collections.filter((item) => item.emiStatus === 'PTP' || item.status === 'PTP').length },
      { label: "Broken PTP", value: "brokenPtp", count: collections.filter((item) => item.emiStatus === 'Broken PTP' || item.status === 'Broken PTP').length },
      { label: "Paid", value: "paid", count: collections.filter((item) => getCollectionPriority(item) === "Paid").length },
    ];

    const getBucketForLabel = (label: string) => {
      if (label === "Active Cases" || label === "Outstanding") return "all";
      if (label === "Overdue") return "overdue";
      if (label === "Collected Today") return "paid";
      if (label === "Active PTP") return "activePtp";
      if (label === "Broken PTP") return "brokenPtp";
      return "all";
    };

    return (
      <div className="w-full min-w-0 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">Collections MIS</p>
            <h2 className="mt-2 text-3xl font-bold text-gray-950 dark:text-white">Collection Reports</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-slate-300">Aging, DPD, outstanding exposure, and borrower-level collection file.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/product-admin/reports?type=cibil-report"
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-white text-sm font-semibold hover:bg-emerald-700 transition shadow-sm"
            >
              <FileSpreadsheet className="h-4 w-4" />
              CIBIL Bureau Report
            </Link>
            <AppTooltip label="Download account and collection report rows as CSV">
              <button
                type="button"
                onClick={() => exportCsv(collectionExportRows, "collection-report")}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
              >
                <Download className="h-4 w-4" />
                Export Report
              </button>
            </AppTooltip>
          </div>
        </div>

        {apiError && <div className="mb-6 rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">{apiError}</div>}

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-6">
          {[
            ["Active Cases", collectionSummary.active, FileText, "Collection portfolio"],
            ["Outstanding", formatCurrency(collectionDeepReport?.summary.totalOutstanding ?? collectionSummary.outstanding), IndianRupee, "Total collection exposure"],
            ["Overdue", collectionSummary.overdue, AlertTriangle, "DPD greater than zero"],
            ["Collected Today", formatCurrency(collectionDeepReport?.summary.collectionToday ?? 0), Send, `${collectionDeepReport?.summary.paymentsToday ?? 0} payments`],
            ["Active PTP", collectionDeepReport?.summary.activePtps ?? 0, ShieldCheck, "Promise-to-pay open"],
            ["Broken PTP", collectionDeepReport?.summary.brokenPtps ?? 0, ShieldAlert, `${collectionDeepReport?.summary.recoveryRate ?? 0}% recovery`],
          ].map(([label, value, Icon, note]) => {
            const targetBucket = getBucketForLabel(label as string);
            const isActive = collectionBucket === targetBucket;
            return (
              <button
                key={label as string}
                type="button"
                onClick={() => setCollectionBucket(targetBucket)}
                className={`rounded-lg border p-5 text-left shadow-sm transition-all focus:outline-none ${
                  isActive
                    ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/40 ring-2 ring-blue-100 dark:ring-blue-900/50"
                    : "border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-slate-50/80 dark:hover:bg-slate-800/80 cursor-pointer"
                }`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <p className={`text-sm font-medium ${isActive ? "text-blue-800 dark:text-blue-300" : "text-gray-600 dark:text-slate-300"}`}>{label as string}</p>
                  <Icon className={`h-5 w-5 ${isActive ? "text-blue-600 dark:text-blue-400" : "text-blue-500 dark:text-blue-400"}`} />
                </div>
                <p className={`text-2xl font-bold ${isActive ? "text-blue-950 dark:text-white" : "text-gray-900 dark:text-white"}`}>{isLoading ? "-" : value as string | number}</p>
                <p className={`mt-1 text-xs ${isActive ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-slate-400"}`}>{note as string}</p>
              </button>
            );
          })}
        </div>

        <div className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-lg border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
            <h3 className="text-base font-semibold text-gray-950 dark:text-white">Payment Trend</h3>
            <p className="mt-1 text-sm text-gray-600">Last 30 days repayment collection from CRM receipts.</p>
            <div className="mt-4 space-y-3">
              {(collectionDeepReport?.paymentTrend || []).slice(0, 7).map((row) => {
                const maxAmount = Math.max(1, ...(collectionDeepReport?.paymentTrend || []).map((item) => Number(item.amount || 0)));
                const percent = Math.round((Number(row.amount || 0) / maxAmount) * 100);
                return (
                  <div key={row.paymentDate}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700">{formatDate(row.paymentDate)}</span>
                      <span className="text-slate-500">{formatCurrency(row.amount)} · {row.paymentCount} payments</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div className="h-2 rounded-full bg-emerald-600" style={{ width: `${Math.max(4, percent)}%` }} />
                    </div>
                  </div>
                );
              })}
              {!(collectionDeepReport?.paymentTrend || []).length && <p className="text-sm text-slate-500">No repayment collections recorded yet.</p>}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-gray-950">PTP Performance</h3>
            <p className="mt-1 text-sm text-gray-600">Promise-to-pay commitments by current status.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {["active", "kept", "broken", "cancelled"].map((status) => {
                const item = collectionDeepReport?.ptpSummary?.[status] || { amount: 0, count: 0 };
                return (
                  <div key={status} className="rounded-lg border border-slate-200 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{status}</p>
                    <p className="mt-2 text-2xl font-bold text-slate-950">{item.count}</p>
                    <p className="mt-1 text-sm text-slate-500">{formatCurrency(item.amount)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap gap-2">
            {bucketOptions.map((bucket) => (
              <button
                key={bucket.value}
                type="button"
                onClick={() => setCollectionBucket(bucket.value)}
                className={`inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition ${
                  collectionBucket === bucket.value
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {bucket.label}
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-600 ring-1 ring-slate-200">{bucket.count}</span>
              </button>
            ))}
          </div>
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={collectionSearch}
              onChange={(event) => setCollectionSearch(event.target.value)}
              placeholder="Search borrower, loan account, PAN, Aadhaar, phone..."
              className="h-10 w-full rounded-md border border-slate-300 pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-[0.75fr_1.25fr]">
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-gray-950">Aging Mix</h3>
            <div className="mt-4 space-y-3">
              {bucketOptions.filter((bucket) => bucket.value !== "all" && bucket.value !== "paid").map((bucket) => {
                const percent = collections.length ? Math.round((bucket.count / collections.length) * 100) : 0;
                return (
                  <div key={bucket.value}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700">{bucket.label}</span>
                      <span className="text-slate-500">{bucket.count} cases</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div className="h-2 rounded-full bg-blue-600" style={{ width: `${percent}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <ReportTable
            id="collection-file-report"
            title="Collection File Report"
            headers={["S. No.", "Borrower", "Phone", "Loan Account", "Due Date", "Outstanding", "Priority", "DPD"]}
            rows={collectionRows.map((row) => [
              String(row.serial),
              row.borrower,
              row.phone,
              row.loanId,
              row.dueDate,
              row.outstanding,
              row.priority,
              String(row.dpd),
            ])}
          />
        </div>

        <ReportTable
          id="kyc-disbursement-report"
          title="KYC & Disbursement Report"
          headers={["Borrower", "PAN", "Aadhaar", "Disbursement", "Disbursed On", "EMI Status"]}
          rows={collectionRows.map((row) => [
            row.borrower,
            row.pan,
            row.aadhaar,
            row.disbursement,
            row.disbursementDate,
            row.emiStatus,
          ])}
        />
      </div>
    );
  }

  if (isAccountant) {
    return (
      <div className="w-full min-w-0 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Account & Collection Reports</h2>
            <p className="mt-1 text-sm text-gray-600">Finance, disbursement, repayment, payout, and collection file reports.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/product-admin/reports?type=cibil-report"
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-white text-sm font-semibold hover:bg-emerald-700 transition shadow-sm"
            >
              <FileSpreadsheet className="h-4 w-4" />
              CIBIL Bureau Report
            </Link>
            <AppTooltip label="Download account and collection report rows as CSV">
              <button
                type="button"
                onClick={() => exportCsv(accountantExportRows, "account-collection-report")}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
              >
                <Download className="h-4 w-4" />
                Export Report
              </button>
            </AppTooltip>
          </div>
        </div>

        {apiError && <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{apiError}</div>}

        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Payment Queue", accountantReport?.metrics.paymentQueueCount ?? 0, FileText, formatCurrency(accountantReport?.metrics.paymentQueueAmount), "accountant-summary-report"],
            ["Paid Leads", accountantReport?.metrics.paidLeads ?? 0, Send, formatCurrency(accountantReport?.metrics.totalDisbursed), "recent-transfer-report"],
            ["Outstanding", formatCurrency(accountantReport?.metrics.totalOutstanding), AlertTriangle, `${accountantReport?.metrics.collectionEfficiency ?? 0}% collected`, "collection-report"],
            ["Repayment Due", formatCurrency(accountantReport?.metrics.repaymentDueAmount), Clock, `${accountantReport?.actionQueue.repaymentDue ?? 0} schedules`, "recent-transfer-report"],
          ].map(([label, value, Icon, note, targetId]) => (
            <button
              key={label as string}
              type="button"
              onClick={() => scrollToSection(targetId as string)}
              className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm text-left hover:border-blue-300 hover:bg-slate-50 transition focus:outline-none cursor-pointer"
            >
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm text-gray-600">{label as string}</p>
                <Icon className="h-5 w-5 text-blue-600" />
              </div>
              <p className="text-3xl font-bold text-gray-900">{isLoading ? "-" : value as string | number}</p>
              <p className="mt-1 text-xs text-gray-500">{note as string}</p>
            </button>
          ))}
        </div>

        <div className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-gray-950">Finance MIS Snapshot</h3>
                <p className="mt-1 text-sm text-gray-600">Disbursement, repayment, and collection exposure in one view.</p>
              </div>
              <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                {accountantReport?.metrics.collectionEfficiency ?? 0}% efficiency
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Due soon", repaymentDueSoon, Clock, "Next 7 days", "recent-transfer-report"],
                ["PAR 30+", formatCurrency(overallCollectionSummary.par30), ShieldAlert, "Critical exposure", "collection-report"],
                ["Collection book", formatCurrency(overallCollectionSummary.outstanding), IndianRupee, "Total outstanding", "collection-report"],
                ["Payout queue", accountantReport?.actionQueue.payoutQueue ?? 0, FileText, formatCurrency(accountantReport?.metrics.payoutAmount), "accountant-summary-report"],
              ].map(([label, value, Icon, note, targetId]) => (
                <button
                  key={label as string}
                  type="button"
                  onClick={() => scrollToSection(targetId as string)}
                  className="rounded-lg border border-slate-200 p-4 text-left hover:border-blue-300 hover:bg-slate-50 transition focus:outline-none cursor-pointer"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <Icon className="h-5 w-5 text-blue-600" />
                    <span className="text-xl font-bold text-slate-950">{isLoading ? "-" : value as string | number}</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900">{label as string}</p>
                  <p className="mt-1 text-xs text-slate-500">{note as string}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-gray-950">Collection Risk Mix</h3>
            <p className="mt-1 text-sm text-gray-600">Aging bucket distribution for accountant review.</p>
            <div className="mt-4 space-y-4">
              {overallCollectionBucketOptions.filter((bucket) => bucket.value !== "paid").map((bucket) => {
                const percent = overallCollectionSummary.active ? Math.round((bucket.count / overallCollectionSummary.active) * 100) : 0;
                return (
                  <div key={bucket.value}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700">{bucket.label}</span>
                      <span className="text-slate-500">{bucket.count} cases · {percent}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div className={`h-2 rounded-full ${bucket.tone}`} style={{ width: `${Math.max(4, percent)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ReportTable
            id="accountant-summary-report"
            title="Account Report"
            headers={["Metric", "Count", "Amount"]}
            rows={accountRows.map((row) => [row.label, String(row.value), row.amount])}
          />
          <ReportTable
            id="recent-transfer-report"
            title="Recent Transfer Report"
            headers={["Customer", "Loan Account", "Disbursed", "Repayment Due"]}
            rows={(accountantReport?.recentTransfers || []).map((row) => [
              row.customerName || "Customer",
              row.loanId,
              formatCurrency(row.disbursementAmount),
              formatCurrency(row.repaymentAmount),
            ])}
          />
        </div>

        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ReportTable
            title="Interest Summary Report"
            headers={["Metric", "Count / Rate", "Amount"]}
            rows={interestSummaryRows.map((row) => [row.label, String(row.value), row.amount])}
          />
          <ReportTable
            title="Customer Month Wise Interest Report"
            headers={["Month", "Loan Account", "Customer", "Principal", "ROI", "Days", "Earned Interest", "Received", "Pending"]}
            rows={customerMonthWiseRows}
          />
        </div>

        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ReportTable
            title="Accrued Interest Report"
            headers={["Loan Account", "Customer", "Principal", "ROI", "Accrued", "Due Date"]}
            rows={accruedInterestRows}
          />
          <ReportTable
            title="Interest Receivable Report"
            headers={["Loan Account", "Customer", "Accrued", "Collected", "Receivable", "Due Date"]}
            rows={receivableRows}
          />
        </div>

        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ReportTable
            title="Interest Realization Report"
            headers={["Loan Account", "Customer", "Realized", "Pending"]}
            rows={realizationRows}
          />
          <ReportTable
            title="Accrued vs Collected Interest"
            headers={["Loan Account", "Customer", "Accrued", "Collected", "Pending", "Collection %"]}
            rows={accruedVsCollectedRows}
          />
        </div>

        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ReportTable
            title="Booked vs Received Interest"
            headers={["Loan Account", "Customer", "Booked", "Received", "Pending"]}
            rows={bookedVsReceivedRows}
          />
          <ReportTable
            title="Month Wise Interest Report"
            headers={["Month", "Days", "Accrued", "Booked", "Received", "Pending"]}
            rows={monthWiseRows}
          />
        </div>

        <div className="mb-8">
          <ReportTable
            title="Day Wise Interest Report"
            headers={["Date", "Active Loans", "Accrued", "Booked", "Received", "Pending"]}
            rows={dayWiseRows}
          />
        </div>

        <ReportTable
          id="collection-report"
          title="Collection Report"
          headers={["S. No.", "Borrower", "Phone", "PAN", "Aadhaar", "Loan Account", "Disbursement", "Outstanding", "EMI Status", "DPD"]}
          rows={collectionRows.map((row) => [
            String(row.serial),
            row.borrower,
            row.phone,
            row.pan,
            row.aadhaar,
            row.loanId,
            row.disbursement,
            row.outstanding,
            row.emiStatus,
            String(row.dpd),
          ])}
        />

        <div className="mt-8 rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50/80 via-indigo-50/50 to-purple-50/50 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-blue-700 bg-blue-100 px-2 py-0.5 rounded">Credit Bureau Standard</span>
              <span className="text-xs font-bold text-slate-500">38 Columns • PN, ID, PT, EC, PA, AM Segments</span>
            </div>
            <h3 className="text-lg font-black text-slate-900 mt-1 flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-blue-600" />
              <span>CIBIL Bureau Reporting File</span>
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">Export standardized CIBIL monthly credit bureau file with borrower KYC, addresses, accounts, and repayment histories.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Link
              to="/product-admin/reports?type=cibil-report"
              className="px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 transition shadow-2xs"
            >
              View CIBIL Report
            </Link>
            <button
              type="button"
              onClick={() => exportCibilCsv(collections, "cibil-bureau-report")}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="h-4 w-4" />
              Export CIBIL CSV
            </button>
          </div>
        </div>

        <div className="mt-8">
          <ReportTable
            id="audit-log-report"
            title="Audit Log Report"
            headers={["Timestamp", "User", "Role", "Action", "Lead / App ID", "IP Address"]}
            rows={auditLogs.map((log) => [
              formatDateTime(log.createdAt),
              `${log.actorName || "System"} (${log.actorEmail || "-"})`,
              log.actorRole || "-",
              log.action,
              log.applicationId || log.leadId || "-",
              log.ipAddress || "-",
            ])}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Telecaller Reports</h2>
          <p className="mt-1 text-sm text-gray-600">Live lead, follow-up, document, and handoff reports.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/product-admin/reports?type=cibil-report"
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-white text-sm font-semibold hover:bg-emerald-700 transition shadow-sm"
          >
            <FileSpreadsheet className="h-4 w-4" />
            CIBIL Bureau Report
          </Link>
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-gray-500" />
            <NiceSelect
              ariaLabel="Select report period"
              value={selectedPeriod}
              onValueChange={setSelectedPeriod}
              className="min-w-44"
              options={[
                { label: "Last 30 Days", value: "last30days" },
                { label: "Last 3 Months", value: "last3months" },
                { label: "Last 6 Months", value: "last6months" },
                { label: "Last Year", value: "lastyear" },
              ]}
            />
          </div>
          <AppTooltip label="Download current report rows as CSV">
            <button
              type="button"
              onClick={() => exportCsv(exportRows)}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
            >
              <Download className="h-4 w-4" />
              Export Report
            </button>
          </AppTooltip>
        </div>
      </div>

      {apiError && <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{apiError}</div>}

      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[
          ["Total Leads", filteredLeads.length, Users, "Current period", "lead-summary-report"],
          ["Follow-ups", followupLeads.length, Clock, "Scheduled callbacks", "followup-report"],
          ["Docs Pending", documentPendingLeads.length, FileText, "Upload or verification needed", "doc-pending-report"],
          ["Credit Handoffs", handoffLeads.length, Send, "Sent to credit manager", "handoff-report"],
        ].map(([label, value, Icon, note, targetId], index) => (
          <button
            key={label as string}
            type="button"
            onClick={() => scrollToSection(targetId as string)}
            className="text-left w-full focus:outline-none hover:opacity-90 transition cursor-pointer"
          >
            <MetricCard
              accent={index === 2 ? "warning" : index === 3 ? "teal" : "info"}
              metric={isLoading ? "-" : value as number}
              note={note as string}
              title={label as string}
              trend="Live"
            />
          </button>
        ))}
      </div>

      {isTelecaller && (
        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-5">
          {[
            ["SLA Breached", slaReport?.summary.slaBreached ?? 0, AlertTriangle, "Needs manager visibility", "text-red-600", "sla-breach-report"],
            ["SLA Warning", slaReport?.summary.warning ?? 0, Clock, "At risk before breach", "text-amber-600", "sla-breach-report"],
            ["Breach Rate", `${slaReport?.summary.breachRate ?? 0}%`, ShieldCheck, "Selected period", "text-blue-600", "owner-sla-report"],
            ["No Disposition", slaReport?.summary.noDisposition ?? 0, Users, "Untouched leads", "text-purple-600", "lead-summary-report"],
            ["Callback Due", slaReport?.summary.callbackDue ?? 0, Phone, "Follow-up queue", "text-emerald-600", "followup-report"],
          ].map(([label, value, Icon, note, tone, targetId], index) => (
            <button
              key={label as string}
              type="button"
              onClick={() => scrollToSection(targetId as string)}
              className="text-left w-full focus:outline-none hover:opacity-90 transition cursor-pointer"
            >
              <MetricCard
                accent={index === 0 ? "danger" : index === 1 ? "warning" : index === 4 ? "success" : "info"}
                metric={isLoading ? "-" : value as string | number}
                note={note as string}
                title={label as string}
                trend="SLA"
              />
            </button>
          ))}
        </div>
      )}

      {isTelecaller && (
        <div className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <h3 className="text-base font-semibold text-gray-950">Telecaller Conversion Health</h3>
              <p className="mt-1 text-sm text-gray-600">Period-level ratios for follow-up discipline and credit movement.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {telecallerReportHealth.map((item) => (
                <div key={item.label} className="rounded-lg border border-slate-200 p-4">
                  <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                  <p className="mt-2 text-2xl font-bold text-slate-950">{isLoading ? "-" : item.value}</p>
                  <div className="mt-3 h-2 rounded-full bg-slate-100">
                    <div className={`h-2 rounded-full ${item.tone}`} style={{ width: item.value }} />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{item.note}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-semibold text-gray-950">Owner SLA Watch</h3>
            <p className="mt-1 text-sm text-gray-600">Highest breach rate owners in this period.</p>
            <div className="mt-4 space-y-3">
              {topSlaOwners.map((owner) => (
                <div key={owner.name} className="rounded-lg border border-slate-200 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-semibold text-slate-900">{owner.name}</span>
                    <span className="text-sm font-bold text-red-600">{owner.breachRate}%</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{owner.breached} breached / {owner.warning} warning / {owner.total} total</p>
                </div>
              ))}
              {!topSlaOwners.length && (
                <div className="rounded-lg border border-slate-200 px-3 py-8 text-center text-sm text-slate-500">No owner SLA data available.</div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <ReportTable
          id="lead-summary-report"
          title="Lead Summary"
          headers={["Report", "Label", "Count"]}
          rows={summaryRows.map((row) => [row.report, row.label, String(row.count)])}
        />
        <ReportTable
          id="followup-report"
          title="Follow-up Report"
          headers={["Lead", "Phone", "Next Follow-up"]}
          rows={followupLeads.map((lead) => [lead.name, lead.phone, formatDate(lead.nextFollowupAt)])}
        />
        <ReportTable
          id="doc-pending-report"
          title="Document Pending Report"
          headers={["Lead", "Verified", "Pending"]}
          rows={documentPendingLeads.map((lead) => [
            lead.name,
            `${Number(lead.documentVerifiedCount || 0)}/${Number(lead.documentTotalCount || 0)}`,
            String(Number(lead.pendingDocumentCount || 0)),
          ])}
        />
      </div>

      {isTelecaller && (
        <div className="mb-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
          <ReportTable
            id="sla-breach-report"
            title="SLA Breach Report"
            headers={["Lead", "Reason", "Next Action", "Due"]}
            rows={(slaReport?.breachedLeads || []).map((lead) => [
              lead.name,
              lead.reason,
              lead.nextAction || "Review lead",
              formatDateTime(lead.nextActionDueAt || lead.createdAt),
            ])}
          />
          <ReportTable
            id="owner-sla-report"
            title="Owner SLA Performance"
            headers={["Owner", "Total", "Breached", "Rate"]}
            rows={(slaReport?.byOwner || []).map((owner) => [
              owner.name,
              String(owner.total),
              `${owner.breached} breached / ${owner.warning} warning`,
              `${owner.breachRate}%`,
            ])}
          />
        </div>
      )}

      <ReportTable
        id="handoff-report"
        title="Handoff Report"
        headers={["Lead", "Amount", "Priority", "Handoff Status", "Submitted"]}
        rows={handoffLeads.map((lead) => [
          lead.name,
          formatCurrency(lead.loanAmount),
          lead.priority,
          lead.latestHandoffStatus || "ready",
          formatDate(lead.latestHandoffAt),
        ])}
      />

      {(currentRole === "superadmin" || currentRole === "credit-manager") && (
        <div className="mt-8">
          <ReportTable
            id="audit-log-report"
            title="Audit Log Report"
            headers={["Timestamp", "User", "Role", "Action", "Lead / App ID", "IP Address"]}
            rows={auditLogs.map((log) => [
              formatDateTime(log.createdAt),
              `${log.actorName || "System"} (${log.actorEmail || "-"})`,
              log.actorRole || "-",
              log.action,
              log.applicationId || log.leadId || "-",
              log.ipAddress || "-",
            ])}
          />
        </div>
      )}
    </div>
  );
}

function SingleReportView({
  reportType,
  leads,
  slaReport,
  accountantReport,
  interestReports,
  collectionDeepReport,
  collections,
  auditLogs,
  isLoading,
  apiError,
  selectedPeriod,
  onPeriodChange,
  onBack,
}: {
  reportType: string;
  leads: Lead[];
  slaReport: SlaReport | null;
  accountantReport: AccountantReport | null;
  interestReports: InterestReportsResponse | null;
  collectionDeepReport: CollectionDeepReport | null;
  collections: CollectionReportRow[];
  auditLogs: AuditLog[];
  isLoading: boolean;
  apiError: string;
  selectedPeriod: string;
  onPeriodChange: (period: string) => void;
  onBack: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);

  const summaryCards = useMemo(() => {
    const { start, end } = getPeriodRange(selectedPeriod);
    const filterByDate = (dateVal: any) => {
      if (!dateVal) return false;
      const d = new Date(dateVal);
      return !Number.isNaN(d.getTime()) && d >= start && d <= end;
    };

    const pLeads = leads.filter(l => filterByDate(l.createdDate));
    
    let pCollections = collections;
    if (reportType === "collection-report") {
      pCollections = collections.filter(c => filterByDate(c.dueDate));
    } else if (reportType === "due-report") {
      pCollections = collections.filter(c => filterByDate(c.dueDate));
    } else if (reportType === "outstanding-report") {
      pCollections = collections.filter(c => {
        const outstandingVal = Number(c.outstanding || c.totalDue || 0);
        if (outstandingVal <= 0) return false;
        if (!c.dueDate) return true;
        const d = new Date(c.dueDate);
        return !Number.isNaN(d.getTime()) && d <= end;
      });
    } else if (reportType === "dpd-bucket-report") {
      pCollections = collections.filter(c => {
        const dpd = Number(c.daysOverdue || 0);
        const outstandingVal = Number(c.outstanding || c.totalDue || 0);
        if (dpd <= 0 || outstandingVal <= 0) return false;
        if (!c.dueDate) return true;
        const d = new Date(c.dueDate);
        return !Number.isNaN(d.getTime()) && d <= end;
      });
    } else if (reportType === "recovery-report") {
      pCollections = collections.filter(c => {
        if (!c.dueDate) return true;
        const d = new Date(c.dueDate);
        return !Number.isNaN(d.getTime()) && d <= end;
      });
    } else {
      pCollections = collections.filter(c => filterByDate(c.disbursementDate || c.dueDate));
    }

    let pTransfers = (accountantReport?.recentTransfers || []).filter(t => filterByDate(t.disbursedAt || t.dueDate));
    if (reportType === "due-report") {
      pTransfers = collections.filter(c => filterByDate(c.dueDate));
    } else if (reportType === "disbursement-report") {
      pTransfers = collections.filter(c => filterByDate(c.disbursementDate));
    }
    const pInterest = (interestReports?.reports.accruedInterest || []).filter(i => filterByDate(i.dueDate));
    const pCustomerInterest = (interestReports?.reports.customerMonthWise || []).filter(c => {
      if (!c.month) return false;
      const [year, month] = String(c.month).split('-').map(Number);
      if (!year || !month) return false;
      const d = new Date(year, month - 1, 1);
      return d >= start && d <= end;
    });
    const rawPayments = (collectionDeepReport?.recentPayments || []).filter(p => filterByDate(p.receivedAt));
    const seenPaymentKeys = new Set();
    const pPayments = rawPayments.filter(p => {
      const key = p.paymentId ? `id_${p.paymentId}` : `${p.transactionId || p.reference || ''}_${p.loanId || ''}_${p.amount}_${p.receivedAt}`;
      if (seenPaymentKeys.has(key)) return false;
      seenPaymentKeys.add(key);
      return true;
    });
    const pAuditLogs = auditLogs.filter(a => filterByDate(a.createdAt));

    // Apply status and priority filters if selected
    let finalLeads = pLeads;
    if (statusFilter !== "all" && reportType === "lead-report") {
      finalLeads = finalLeads.filter(l => String(l.status || "").toLowerCase() === statusFilter.toLowerCase());
    }
    if (priorityFilter !== "all" && (reportType === "lead-report" || reportType === "application-report")) {
      finalLeads = finalLeads.filter(l => String(l.priority || "").toLowerCase() === priorityFilter.toLowerCase());
    }

    let finalCollections = pCollections;
    if (statusFilter !== "all" && (reportType === "loan-report" || reportType === "collection-report" || reportType === "outstanding-report" || reportType === "recovery-report")) {
      finalCollections = finalCollections.filter(c => String(c.emiStatus || "").toLowerCase() === statusFilter.toLowerCase());
    }
    if (priorityFilter !== "all" && reportType === "dpd-bucket-report") {
      finalCollections = finalCollections.filter(c => String(getCollectionPriority(c) || "").toLowerCase() === priorityFilter.toLowerCase());
    }

    switch (reportType) {
      case "lead-report": {
        const newLeads = finalLeads.filter(l => l.status === "New").length;
        const contactedLeads = finalLeads.filter(l => l.status === "Contacted").length;
        const highPriority = finalLeads.filter(l => l.priority === "High").length;
        return [
          { label: "Total Leads", value: String(finalLeads.length), note: "Filtered in period", color: "blue", icon: "Users" },
          { label: "New Leads", value: String(newLeads), note: "Pending first contact", color: "emerald", icon: "UserPlus" },
          { label: "Contacted Leads", value: String(contactedLeads), note: "In communication", color: "amber", icon: "Phone" },
          { label: "High Priority", value: String(highPriority), note: "Require immediate action", color: "red", icon: "AlertTriangle" },
        ];
      }
      case "application-report": {
        const apps = finalLeads.filter(l => Boolean(l.latestHandoffStatus));
        const approved = apps.filter(l => l.latestHandoffStatus === "approved").length;
        const underReview = apps.filter(l => l.latestHandoffStatus === "review" || l.latestHandoffStatus === "submitted").length;
        const totalAmount = apps.reduce((sum, l) => sum + (l.loanAmount || 0), 0);
        return [
          { label: "Total Applications", value: String(apps.length), note: "Submitted to credit", color: "blue", icon: "FileText" },
          { label: "Approved Apps", value: String(approved), note: "Approved for funding", color: "emerald", icon: "CheckCircle2" },
          { label: "Under Review", value: String(underReview), note: "Pending decision", color: "amber", icon: "Activity" },
          { label: "Requested Volume", value: formatCurrency(totalAmount), note: "Total requested amount", color: "indigo", icon: "Banknote" },
        ];
      }
      case "loan-report": {
        const totalOutstanding = finalCollections.reduce((sum, c) => sum + Number(c.outstanding || c.totalDue || 0), 0);
        const overdueLoans = finalCollections.filter(c => Number(c.daysOverdue || 0) > 0).length;
        const paidLoans = finalCollections.filter(c => getCollectionPriority(c) === "Paid").length;
        return [
          { label: "Active Loans", value: String(finalCollections.length), note: "In portfolio", color: "blue", icon: "Briefcase" },
          { label: "Total Outstanding", value: formatCurrency(totalOutstanding), note: "Principal & Interest due", color: "amber", icon: "DollarSign" },
          { label: "Overdue Loans", value: String(overdueLoans), note: "DPD > 0", color: "red", icon: "AlertTriangle" },
          { label: "Closed / Paid", value: String(paidLoans), note: "Loans settled", color: "emerald", icon: "CheckCircle2" },
        ];
      }
      case "disbursement-report": {
        const totalDisbursed = pTransfers.reduce((sum, t) => sum + Number(t.disbursementAmount || 0), 0);
        const totalRepay = pTransfers.reduce((sum, t) => sum + Number(t.repaymentAmount || 0), 0);
        return [
          { label: "Disbursed Count", value: String(pTransfers.length), note: "Loans disbursed in period", color: "blue", icon: "FileText" },
          { label: "Total Disbursed", value: formatCurrency(totalDisbursed), note: "Funded volume", color: "emerald", icon: "Banknote" },
          { label: "Expected Repayment", value: formatCurrency(totalRepay), note: "Interest accrued returns", color: "indigo", icon: "DollarSign" },
        ];
      }
      case "collection-report": {
        const totalOutstanding = finalCollections.reduce((sum, c) => sum + Number(c.outstanding || c.totalDue || 0), 0);
        const ptpCount = finalCollections.filter(c => c.emiStatus === "PTP" || c.status === "PTP").length;
        const brokenPtp = finalCollections.filter(c => c.emiStatus === "Broken PTP" || c.status === "Broken PTP").length;
        return [
          { label: "Collection Portfolio", value: String(finalCollections.length), note: "Active collections cases", color: "blue", icon: "Users" },
          { label: "Outstanding Balance", value: formatCurrency(totalOutstanding), note: "Unrecovered volume", color: "red", icon: "DollarSign" },
          { label: "Active PTPs", value: String(ptpCount), note: "Promises to pay", color: "emerald", icon: "CheckCircle2" },
          { label: "Broken PTPs", value: String(brokenPtp), note: "Missed commitments", color: "amber", icon: "AlertTriangle" },
        ];
      }
      case "due-report": {
        const totalRepay = pTransfers.reduce((sum, t) => sum + Number(t.repaymentAmount || 0), 0);
        return [
          { label: "Due Accounts", value: String(pTransfers.length), note: "Accounts with active dues", color: "blue", icon: "Users" },
          { label: "Total Amount Due", value: formatCurrency(totalRepay), note: "Repayments expected", color: "amber", icon: "DollarSign" },
        ];
      }
      case "dpd-bucket-report": {
        const critical = finalCollections.filter(c => getCollectionPriority(c) === "Critical").length;
        const high = finalCollections.filter(c => getCollectionPriority(c) === "High").length;
        const totalOutstanding = finalCollections.reduce((sum, c) => sum + Number(c.outstanding || c.totalDue || 0), 0);
        return [
          { label: "Overdue Portfolio", value: String(finalCollections.length), note: "DPD active cases", color: "blue", icon: "Users" },
          { label: "Outstanding DPD", value: formatCurrency(totalOutstanding), note: "Amount in bucket", color: "red", icon: "DollarSign" },
          { label: "Critical DPD", value: String(critical), note: "Extreme severity DPD", color: "red", icon: "AlertTriangle" },
          { label: "High Severity", value: String(high), note: "High risk DPD", color: "amber", icon: "ShieldAlert" },
        ];
      }
      case "interest-accrued-report": {
        const totalAccrued = pInterest.reduce((sum, i) => sum + Number(i.accruedInterest || 0), 0);
        const totalPrincipal = pInterest.reduce((sum, i) => sum + Number(i.principal || 0), 0);
        return [
          { label: "Interest Accounts", value: String(pInterest.length), note: "Active interest accruals", color: "blue", icon: "Briefcase" },
          { label: "Principal Volume", value: formatCurrency(totalPrincipal), note: "Underlying principal", color: "indigo", icon: "Banknote" },
          { label: "Total Accrued", value: formatCurrency(totalAccrued), note: "Interest earned in period", color: "emerald", icon: "DollarSign" },
        ];
      }
      case "outstanding-report": {
        const totalOutstanding = finalCollections.reduce((sum, c) => sum + Number(c.outstanding || c.totalDue || 0), 0);
        const activeDpd = finalCollections.filter(c => Number(c.daysOverdue || 0) > 0).length;
        return [
          { label: "Outstanding Accounts", value: String(finalCollections.length), note: "Accounts with unpaid balance", color: "blue", icon: "Users" },
          { label: "Outstanding Balance", value: formatCurrency(totalOutstanding), note: "Total unpaid volume", color: "red", icon: "DollarSign" },
          { label: "Active DPD Cases", value: String(activeDpd), note: "DPD > 0 in outstanding", color: "amber", icon: "AlertTriangle" },
        ];
      }
      case "payment-report": {
        const totalAmt = pPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
        const totalTransactions = pPayments.length;
        return [
          { label: "Total Transactions", value: String(totalTransactions), note: "Filtered repayments", color: "blue", icon: "FileText" },
          { label: "Total Recovered", value: formatCurrency(totalAmt), note: "Collected volume", color: "emerald", icon: "CheckCircle2" },
        ];
      }
      case "employee-performance": {
        const records = slaReport?.byOwner || [];
        const avgBreach = records.length 
          ? Math.round(records.reduce((sum, o) => sum + Number(o.breachRate || 0), 0) / records.length)
          : 0;
        return [
          { label: "Tracked Employees", value: String(records.length), note: "Employees with assignments", color: "blue", icon: "Users" },
          { label: "Average Breach Rate", value: `${avgBreach}%`, note: "Average assignment delay", color: avgBreach > 30 ? "red" : "emerald", icon: "Activity" },
        ];
      }
      case "customer-report": {
        const totalAccrued = pCustomerInterest.reduce((sum, c) => sum + Number(c.accruedInterest || 0), 0);
        const totalReceived = pCustomerInterest.reduce((sum, c) => sum + Number(c.receivedInterest || 0), 0);
        const totalPending = pCustomerInterest.reduce((sum, c) => sum + Number(c.pendingInterest || 0), 0);
        return [
          { label: "Customer Records", value: String(pCustomerInterest.length), note: "Interest rows", color: "blue", icon: "Users" },
          { label: "Total Accrued", value: formatCurrency(totalAccrued), note: "Total accrued interest", color: "indigo", icon: "DollarSign" },
          { label: "Received Interest", value: formatCurrency(totalReceived), note: "Settle volume", color: "emerald", icon: "CheckCircle2" },
          { label: "Pending Interest", value: formatCurrency(totalPending), note: "Accrued but unpaid", color: "amber", icon: "AlertTriangle" },
        ];
      }
      case "recovery-report": {
        const ptpCount = finalCollections.filter(c => c.emiStatus === "PTP").length;
        const totalRecovered = finalCollections.reduce((sum, c) => sum + Number(c.amountPaid || 0), 0);
        const totalOutstanding = finalCollections.reduce((sum, c) => sum + Number(c.outstanding || c.totalDue || 0), 0);
        return [
          { label: "Recovery Accounts", value: String(finalCollections.length), note: "Target collection cases", color: "blue", icon: "Users" },
          { label: "Outstanding Debt", value: formatCurrency(totalOutstanding), note: "Remaining to recover", color: "red", icon: "DollarSign" },
          { label: "Total Recovered (Paid)", value: formatCurrency(totalRecovered), note: "Collected volume", color: "emerald", icon: "CheckCircle2" },
          { label: "Active PTP Plans", value: String(ptpCount), note: "Promises to pay", color: "indigo", icon: "Briefcase" },
        ];
      }
      case "audit-log-report": {
        const uniqueUsers = new Set(pAuditLogs.map(l => l.actorEmail).filter(Boolean)).size;
        return [
          { label: "Audit Actions", value: String(pAuditLogs.length), note: "Total logs in period", color: "blue", icon: "FileText" },
          { label: "Active Operators", value: String(uniqueUsers), note: "Unique system users", color: "indigo", icon: "Users" },
        ];
      }
      case "cibil-report": {
        const totalSanctioned = finalCollections.reduce((sum, c) => sum + Number(c.principal || c.disbursementAmount || c.baseRepayment || c.totalDue || 0), 0);
        const totalOutstanding = finalCollections.reduce((sum, c) => sum + Number(c.outstanding || c.totalDue || 0), 0);
        const overdueCount = finalCollections.filter(c => Number(c.daysOverdue || 0) > 0).length;
        return [
          { label: "CIBIL Records", value: String(finalCollections.length), note: "Borrower accounts in file", color: "blue", icon: "Users" },
          { label: "Sanctioned Volume", value: formatCurrency(totalSanctioned), note: "High credit limit", color: "emerald", icon: "Banknote" },
          { label: "Current Balance", value: formatCurrency(totalOutstanding), note: "Unpaid portfolio balance", color: "indigo", icon: "DollarSign" },
          { label: "Overdue Accounts", value: String(overdueCount), note: "DPD > 0 reported", color: "red", icon: "AlertTriangle" },
        ];
      }
      default:
        return [];
    }
  }, [reportType, leads, slaReport, accountantReport, interestReports, collectionDeepReport, collections, auditLogs, selectedPeriod, statusFilter, priorityFilter]);

  const reportDetails = useMemo(() => {
    let title = "System Report";
    let headers: string[] = [];
    let rows: string[][] = [];
    let rawData: Array<Record<string, any>> = [];

    // Statically determine title and headers first so they show while loading
    switch (reportType) {
      case "cibil-report":
        title = "CIBIL Bureau Report";
        headers = [
          "Consumer Name", "Date of Birth", "Gender",
          "Income Tax ID Number", "Passport Number", "Passport Issue Date", "Passport Expiry Date", "Voter ID Number", "Driving License Number", "Driving License Issue Date", "Driving License Expiry Date", "Ration Card Number", "Universal ID Number", "Additional ID 1", "Additional ID 2",
          "Telephone No Mobile", "Telephone No Residence", "Telephone No Office", "Extension Office", "Telephone No Other", "Extension Other",
          "Email ID 1", "Email ID 2",
          "Address Line 1", "State Code 1", "PIN Code 1", "Address Category 1", "Address Line 2", "State Code 2", "PIN Code 2",
          "Curr New Account No", "Date Opened Disbursed", "Date of Last Payment", "Date Closed", "High Credit Sanctioned Amt", "Current Balance", "Amt Overdue", "No of Days Past Due"
        ];
        break;
      case "lead-report":
        title = "Lead Report";
        headers = ["Lead ID", "Name", "Phone", "Source", "Status", "Priority", "Created Date"];
        break;
      case "application-report":
        title = "Application Report";
        headers = ["Lead ID", "Applicant Name", "Requested Amount", "Priority", "Handoff Status", "Submitted At"];
        break;
      case "loan-report":
        title = "Loan Report";
        headers = ["Loan Account", "Borrower", "Disbursement", "Disbursed On", "Due Date", "Outstanding", "EMI Status", "DPD"];
        break;
      case "disbursement-report":
        title = "Disbursement Report";
        headers = ["Customer", "Loan ID", "Sanction Amount", "Disbursed Amount", "Repayment Due", "Disbursed On", "Due Date"];
        break;
      case "collection-report":
        title = "Collection Report";
        headers = ["Borrower", "Phone", "PAN", "Aadhaar", "Loan Account", "Disbursement", "Outstanding", "EMI Status", "DPD"];
        break;
      case "due-report":
        title = "Due Report";
        headers = ["Customer", "Loan Account", "Disbursed Amount", "Repayment Amount", "Outstanding Balance", "Due Date"];
        break;
      case "dpd-bucket-report":
        title = "DPD Bucket Report";
        headers = ["Loan Account", "Borrower", "Phone", "Outstanding", "DPD", "Priority Group"];
        break;
      case "interest-accrued-report":
        title = "Interest Accrued Report";
        headers = ["Loan Account", "Customer", "Principal", "ROI", "Accrued Interest", "Due Date"];
        break;
      case "outstanding-report":
        title = "Outstanding Report";
        headers = ["Loan Account", "Borrower", "Phone", "Disbursement", "Outstanding Balance", "EMI Status", "DPD"];
        break;
      case "payment-report":
        title = "Payment Report";
        headers = ["Customer", "Loan Account", "Amount Paid", "Principal Component", "Interest Component", "Payment Date", "Transaction ID", "Status"];
        break;
      case "employee-performance":
        title = "Employee Performance SLA";
        headers = ["Employee Name", "Total Assigned Leads", "Breached Leads", "Warnings", "Breach Rate"];
        break;
      case "customer-report":
        title = "Customer Report";
        headers = ["Month", "Loan Account", "Customer", "Principal", "ROI", "Days", "Earned Interest", "Received", "Pending"];
        break;
      case "recovery-report":
        title = "Recovery Report";
        headers = ["Loan Account", "Borrower", "Outstanding", "Amount Paid", "Last Payment Date", "EMI Status", "PTP Commitment"];
        break;
      case "audit-log-report":
        title = "Audit Log Report";
        headers = ["Timestamp", "User", "Role", "Action", "Lead / App ID", "IP Address"];
        break;
      default:
        title = "System Report Summary";
        headers = ["Report Name", "Source", "Row Count"];
    }

    if (isLoading) {
      return { title, headers, rows, rawData };
    }

    const { start, end } = getPeriodRange(selectedPeriod);

    const filterByDate = (dateVal: any) => {
      if (!dateVal) return false;
      const d = parseDate(typeof dateVal === "string" ? dateVal : dateVal?.toISOString ? dateVal.toISOString() : String(dateVal));
      if (!d) return false;
      return d >= start && d <= end;
    };

    const periodLeads = leads.filter(l => filterByDate(l.createdDate));
    
    let periodCollections = collections;
    if (reportType === "collection-report") {
      periodCollections = collections.filter(c => filterByDate(c.dueDate));
    } else if (reportType === "due-report") {
      periodCollections = collections.filter(c => filterByDate(c.dueDate));
    } else if (reportType === "outstanding-report") {
      periodCollections = collections.filter(c => {
        const outstandingVal = Number(c.outstanding || c.totalDue || 0);
        if (outstandingVal <= 0) return false;
        if (!c.dueDate) return true;
        const d = new Date(c.dueDate);
        return !Number.isNaN(d.getTime()) && d <= end;
      });
    } else if (reportType === "dpd-bucket-report") {
      periodCollections = collections.filter(c => {
        const dpd = Number(c.daysOverdue || 0);
        const outstandingVal = Number(c.outstanding || c.totalDue || 0);
        if (dpd <= 0 || outstandingVal <= 0) return false;
        if (!c.dueDate) return true;
        const d = new Date(c.dueDate);
        return !Number.isNaN(d.getTime()) && d <= end;
      });
    } else if (reportType === "recovery-report") {
      periodCollections = collections.filter(c => {
        if (!c.dueDate) return true;
        const d = new Date(c.dueDate);
        return !Number.isNaN(d.getTime()) && d <= end;
      });
    } else {
      periodCollections = collections.filter(c => filterByDate(c.disbursementDate || c.dueDate));
    }

    let periodTransfers = (accountantReport?.recentTransfers || []).filter(t => filterByDate(t.disbursedAt || t.dueDate));
    if (reportType === "due-report") {
      periodTransfers = collections.filter(c => filterByDate(c.dueDate));
    } else if (reportType === "disbursement-report") {
      periodTransfers = collections.filter(c => filterByDate(c.disbursementDate));
    }
    const periodInterest = (interestReports?.reports.accruedInterest || []).filter(i => filterByDate(i.dueDate));
    const periodCustomerInterest = (interestReports?.reports.customerMonthWise || []).filter(c => {
      if (!c.month) return false;
      const [year, month] = String(c.month).split('-').map(Number);
      if (!year || !month) return false;
      const d = new Date(year, month - 1, 1);
      return d >= start && d <= end;
    });
    const rawPeriodPayments = (collectionDeepReport?.recentPayments || []).filter(p => filterByDate(p.receivedAt));
    const seenPeriodPaymentKeys = new Set();
    const periodPayments = rawPeriodPayments.filter(p => {
      const key = p.paymentId ? `id_${p.paymentId}` : `${p.transactionId || p.reference || ''}_${p.loanId || ''}_${p.amount}_${p.receivedAt}`;
      if (seenPeriodPaymentKeys.has(key)) return false;
      seenPeriodPaymentKeys.add(key);
      return true;
    });
    const periodAuditLogs = auditLogs.filter(a => filterByDate(a.createdAt));

    // Now populate records
    switch (reportType) {
      case "lead-report":
        rawData = periodLeads.map(lead => ({
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
          source: lead.source || "-",
          status: lead.status,
          priority: lead.priority,
          createdAt: formatDate(lead.createdDate),
        }));
        break;

      case "application-report":
        rawData = periodLeads.filter(l => Boolean(l.latestHandoffStatus)).map(lead => ({
          id: lead.id,
          name: lead.name,
          amount: formatCurrency(lead.loanAmount),
          priority: lead.priority,
          status: lead.latestHandoffStatus || "ready",
          date: formatDate(lead.latestHandoffAt),
        }));
        break;

      case "loan-report":
        rawData = periodCollections.map(row => ({
          loanId: row.loanId,
          borrower: row.borrowerName || "-",
          disbursement: formatCurrency(row.disbursementAmount),
          disbursedOn: formatDate(row.disbursementDate),
          dueDate: formatDate(row.dueDate),
          outstanding: formatCurrency(row.outstanding || row.totalDue),
          status: row.emiStatus || "-",
          dpd: String(row.daysOverdue || 0),
        }));
        break;

      case "disbursement-report":
        rawData = periodTransfers.map(row => ({
          customer: row.customerName || row.borrowerName || "Customer",
          loanId: row.loanId,
          sanctionAmount: formatCurrency(row.principal || row.sanctionAmount || row.loanAmount || row.disbursementAmount || 0),
          disbursed: formatCurrency(row.disbursementAmount),
          repayment: formatCurrency(row.repaymentAmount || row.totalDue),
          disbursedOn: formatDate(row.disbursedAt || row.disbursementDate),
          dueDate: formatDate(row.dueDate),
        }));
        break;

      case "collection-report":
        rawData = periodCollections.map(row => ({
          borrower: row.borrowerName || "-",
          phone: row.phone,
          pan: row.pan || "-",
          aadhaar: row.aadhaar || "-",
          loanId: row.loanId,
          disbursement: formatCurrency(row.disbursementAmount),
          outstanding: formatCurrency(row.outstanding || row.totalDue),
          status: row.emiStatus || "-",
          dpd: String(row.daysOverdue || 0),
        }));
        break;

      case "due-report":
        rawData = periodTransfers.map(row => ({
          customer: row.customerName || row.borrowerName || "Customer",
          loanId: row.loanId,
          disbursed: formatCurrency(row.disbursementAmount),
          repayment: formatCurrency(row.repaymentAmount || row.totalDue),
          balance: formatCurrency(row.balance !== undefined ? row.balance : row.outstanding),
          dueDate: formatDate(row.dueDate),
        }));
        break;

      case "dpd-bucket-report":
        rawData = periodCollections.map(row => ({
          loanId: row.loanId,
          borrower: row.borrowerName || "-",
          phone: row.phone,
          outstanding: formatCurrency(row.outstanding || row.totalDue),
          dpd: String(row.daysOverdue || 0),
          priority: getCollectionPriority(row),
        }));
        break;

      case "interest-accrued-report":
        rawData = periodInterest.map(row => ({
          loanId: String(row.loanId || "-"),
          customer: String(row.customerName || "Customer"),
          principal: formatCurrency(Number(row.principal || 0)),
          roi: formatRate(row.interestRate),
          accrued: formatCurrency(Number(row.accruedInterest || 0)),
          dueDate: formatDate(row.dueDate ? String(row.dueDate) : null),
        }));
        break;

      case "outstanding-report":
        rawData = periodCollections.filter(c => Number(c.outstanding || c.totalDue || 0) > 0).map(row => ({
          loanId: row.loanId,
          borrower: row.borrowerName || "-",
          phone: row.phone,
          disbursement: formatCurrency(row.disbursementAmount),
          outstanding: formatCurrency(row.outstanding || row.totalDue),
          status: row.emiStatus || "-",
          dpd: String(row.daysOverdue || 0),
        }));
        break;

      case "payment-report":
        rawData = periodPayments.map(row => ({
          customer: row.customerName || "Customer",
          loanId: row.loanId || "-",
          amount: formatCurrency(row.amount),
          principal: formatCurrency(row.principalComponent),
          interest: formatCurrency(row.interestComponent),
          date: formatDate(row.receivedAt),
          transactionId: row.transactionId || row.reference || "-",
          status: row.status || "success",
        }));
        break;

      case "employee-performance":
        rawData = (slaReport?.byOwner || []).map(row => ({
          name: row.name,
          total: String(row.total),
          breached: String(row.breached),
          warning: String(row.warning),
          rate: `${row.breachRate}%`,
        }));
        break;

      case "customer-report":
        rawData = periodCustomerInterest.map(row => ({
          period: String(row.period || "-"),
          loanId: String(row.loanId || "-"),
          customer: String(row.customerName || "Customer"),
          principal: formatCurrency(Number(row.principal || 0)),
          roi: formatRate(row.interestRate),
          days: String(row.days || 0),
          accrued: formatCurrency(Number(row.accruedInterest || 0)),
          received: formatCurrency(Number(row.receivedInterest || 0)),
          pending: formatCurrency(Number(row.pendingInterest || 0)),
        }));
        break;

      case "recovery-report":
        rawData = periodCollections.map(row => ({
          loanId: row.loanId,
          borrower: row.borrowerName || "-",
          outstanding: formatCurrency(row.outstanding || row.totalDue),
          amountPaid: formatCurrency(row.amountPaid),
          lastPaymentDate: formatDate(row.lastPaymentDate),
          status: row.emiStatus || "-",
          ptp: row.emiStatus === "PTP" ? "Active PTP" : row.emiStatus === "Broken PTP" ? "Broken PTP" : "No active PTP",
        }));
        break;

      case "audit-log-report":
        rawData = periodAuditLogs.map(log => ({
          timestamp: formatDateTime(log.createdAt),
          user: `${log.actorName || "System"} (${log.actorEmail || "-"})`,
          role: log.actorRole || "-",
          action: log.action,
          id: log.applicationId || log.leadId || "-",
          ip: log.ipAddress || "-",
        }));
        break;

      case "cibil-report":
        rawData = periodCollections.map(row => {
          const name = cleanCibilAlphaNumeric(row.borrowerName || row.customer || "CUSTOMER");
          const rawDob = row.dob || (row as any).dateOfBirth || (row as any).date_of_birth || "";
          const dob = formatCibilDate(rawDob);
          const gender = formatCibilGender(row.gender, row.borrowerName || row.customer);
          const pan = cleanCibilAlphaNumeric(row.pan).slice(0, 10);
          const aadhaar = cleanCibilDigits(row.aadhaar).slice(0, 12);
          const phone = cleanCibilDigits(row.phone).slice(-10);
          const email = cleanCibilEmail(row.email);
          const addr = cleanCibilAlphaNumeric(row.address);
          const pin = cleanCibilDigits(row.pincode).slice(0, 6);
          const stateCode = cleanCibilDigits(formatCibilStateCode(addr, pin));
          const accountNo = cleanCibilAlphaNumeric(row.loanId || row.memberCode || "");
          const disbursedDate = formatCibilDate(row.disbursementDate);
          const amountPaid = Number(row.amountPaid || 0);
          const lastPaymentDate = amountPaid > 0 ? formatCibilDate(row.lastPaymentDate) : "";
          const outstanding = Math.max(0, Math.round(Number(row.outstanding !== undefined ? row.outstanding : row.totalDue || 0)));
          const isClosed = outstanding <= 0 && amountPaid > 0;
          const dateClosed = isClosed ? formatCibilDate(row.lastPaymentDate || row.dueDate) : "";
          const highCredit = Math.max(0, Math.round(Number(row.principal || row.disbursementAmount || row.baseRepayment || row.totalDue || 0)));
          const dpd = Math.max(0, Math.round(Number(row.daysOverdue || 0)));
          const overdueAmt = dpd > 0 ? outstanding : 0;

          return {
            consumerName: name,
            dob,
            gender,
            pan,
            passportNo: "",
            passportIssue: "",
            passportExpiry: "",
            voterId: "",
            dlNo: "",
            dlIssue: "",
            dlExpiry: "",
            rationCard: "",
            aadhaar,
            addId1: "",
            addId2: "",
            mobile: phone,
            telResidence: "",
            telOffice: "",
            extOffice: "",
            telOther: "",
            extOther: "",
            email1: email,
            email2: "",
            address1: addr,
            stateCode1: stateCode,
            pin1: pin,
            addrCategory1: "02",
            address2: "",
            stateCode2: "",
            pin2: "",
            accountNo,
            dateDisbursed: disbursedDate,
            dateLastPayment: lastPaymentDate,
            dateClosed,
            sanctionedAmt: String(highCredit),
            currentBalance: String(outstanding),
            amtOverdue: String(overdueAmt),
            dpd: String(dpd),
          };
        });
        break;

      default:
        rawData = [
          { name: "Lead Report", src: "loan_applications", count: leads.length },
          { name: "Collection Report", src: "collection_cases", count: collections.length },
          { name: "Audit Log Report", src: "audit_logs", count: auditLogs.length },
        ];
    }

    const q = searchQuery.toLowerCase().trim();
    let filteredData = rawData;

    if (q) {
      filteredData = rawData.filter(item => 
        Object.values(item).some(val => String(val || "").toLowerCase().includes(q))
      );
    }

    if (statusFilter !== "all" && (reportType === "lead-report" || reportType === "loan-report" || reportType === "collection-report" || reportType === "outstanding-report" || reportType === "recovery-report")) {
      filteredData = filteredData.filter((item: any) => String(item.status || item.emiStatus || "").toLowerCase() === statusFilter.toLowerCase());
    }

    if (priorityFilter !== "all" && (reportType === "lead-report" || reportType === "application-report" || reportType === "dpd-bucket-report")) {
      filteredData = filteredData.filter((item: any) => String(item.priority || "").toLowerCase() === priorityFilter.toLowerCase());
    }

    rows = filteredData.map(item => Object.values(item));

    return { title, headers, rows, rawData: filteredData };
  }, [reportType, leads, slaReport, accountantReport, interestReports, collectionDeepReport, collections, auditLogs, isLoading, searchQuery, statusFilter, priorityFilter, selectedPeriod]);

  const handleExportCsv = () => {
    if (reportType === "cibil-report") {
      const { start, end } = getPeriodRange(selectedPeriod);
      const periodCollections = collections.filter(c => {
        if (!c.disbursementDate && !c.dueDate) return true;
        const d = new Date(c.disbursementDate || c.dueDate || 0);
        return Number.isNaN(d.getTime()) || (d >= start && d <= end);
      });
      exportCibilCsv(periodCollections.length ? periodCollections : collections, "cibil-bureau-report");
      return;
    }
    const formattedRows = reportDetails.rows.map((row) =>
      reportDetails.headers.reduce<Record<string, string>>((acc, header, index) => {
        acc[header] = row[index] || "";
        return acc;
      }, {})
    );
    exportCsv(formattedRows.length ? formattedRows : reportDetails.rawData, reportType || "report");
  };

  const handleExportJson = () => {
    const filename = `${reportType}-${new Date().toISOString().slice(0, 10)}.json`;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(reportDetails.rawData, null, 2));
    const link = document.createElement("a");
    link.setAttribute("href", dataStr);
    link.setAttribute("download", filename);
    link.click();
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="w-full min-w-0 px-4 py-6 sm:px-6 lg:px-8 print:p-0">
      {apiError && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 print:hidden">
          <p className="font-semibold mb-1">Failed to load report data:</p>
          <p>{apiError}</p>
        </div>
      )}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition mb-2 cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Dashboard
          </button>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{reportDetails.title}</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">Dedicated single report worksheet with advanced filters and exports.</p>
        </div>
        <div className="relative print:hidden">
          <button
            type="button"
            onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 transition cursor-pointer shadow-sm focus:ring-2 focus:ring-blue-100"
          >
            <Download className="h-4 w-4" />
            Actions & Export
            <ChevronDown className={`h-4 w-4 transition-transform ${isExportDropdownOpen ? "rotate-180" : ""}`} />
          </button>
          {isExportDropdownOpen && (
            <>
              <div 
                className="fixed inset-0 z-10" 
                onClick={() => setIsExportDropdownOpen(false)} 
              />
              <div className="absolute right-0 mt-2 w-48 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-1.5 shadow-lg z-20 focus:outline-none">
                <button
                  type="button"
                  onClick={() => {
                    handleExportCsv();
                    setIsExportDropdownOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  <Download className="h-4 w-4 text-emerald-500" />
                  Export as CSV
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleExportJson();
                    setIsExportDropdownOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  <Download className="h-4 w-4 text-amber-500" />
                  Export as JSON
                </button>
                <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                <button
                  type="button"
                  onClick={() => {
                    handlePrint();
                    setIsExportDropdownOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  <FileText className="h-4 w-4 text-blue-500" />
                  Print / Save PDF
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      {summaryCards.length > 0 && (
        <div className="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 print:hidden">
          {summaryCards.map((card) => {
            const IconComponent = {
              Users,
              UserPlus,
              Phone,
              AlertTriangle,
              FileText,
              CheckCircle2,
              Activity,
              Banknote,
              Briefcase,
              DollarSign,
              ShieldAlert,
            }[card.icon] || FileText;

            const colorClasses = {
              blue: {
                bg: "bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-white dark:from-blue-950/40 dark:via-slate-900 dark:to-slate-900",
                border: "border-blue-200/80 dark:border-blue-900/60 hover:border-blue-400 dark:hover:border-blue-600",
                text: "text-blue-700 dark:text-blue-400",
                iconBg: "bg-blue-100/80 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-700/60 shadow-xs",
                accent: "from-blue-500 to-indigo-600",
                aura: "from-blue-200/70 via-indigo-200/40 to-transparent dark:from-blue-500/25 dark:via-indigo-500/15",
              },
              emerald: {
                bg: "bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-white dark:from-emerald-950/40 dark:via-slate-900 dark:to-slate-900",
                border: "border-emerald-200/80 dark:border-emerald-900/60 hover:border-emerald-400 dark:hover:border-emerald-600",
                text: "text-emerald-700 dark:text-emerald-400",
                iconBg: "bg-emerald-100/80 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700/60 shadow-xs",
                accent: "from-emerald-500 to-teal-600",
                aura: "from-emerald-200/70 via-teal-200/40 to-transparent dark:from-emerald-500/25 dark:via-teal-500/15",
              },
              amber: {
                bg: "bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-white dark:from-amber-950/40 dark:via-slate-900 dark:to-slate-900",
                border: "border-amber-200/80 dark:border-amber-900/60 hover:border-amber-400 dark:hover:border-amber-600",
                text: "text-amber-700 dark:text-amber-400",
                iconBg: "bg-amber-100/80 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300 border border-amber-200 dark:border-amber-700/60 shadow-xs",
                accent: "from-amber-500 to-orange-600",
                aura: "from-amber-200/70 via-orange-200/40 to-transparent dark:from-amber-500/25 dark:via-orange-500/15",
              },
              red: {
                bg: "bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-white dark:from-rose-950/40 dark:via-slate-900 dark:to-slate-900",
                border: "border-rose-200/80 dark:border-rose-900/60 hover:border-rose-400 dark:hover:border-rose-600",
                text: "text-rose-700 dark:text-rose-400",
                iconBg: "bg-rose-100/80 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-700/60 shadow-xs",
                accent: "from-rose-500 to-red-600",
                aura: "from-rose-200/70 via-pink-200/40 to-transparent dark:from-rose-500/25 dark:via-pink-500/15",
              },
              indigo: {
                bg: "bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-white dark:from-indigo-950/40 dark:via-slate-900 dark:to-slate-900",
                border: "border-indigo-200/80 dark:border-indigo-900/60 hover:border-indigo-400 dark:hover:border-indigo-600",
                text: "text-indigo-700 dark:text-indigo-400",
                iconBg: "bg-indigo-100/80 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700/60 shadow-xs",
                accent: "from-indigo-500 to-purple-600",
                aura: "from-indigo-200/70 via-purple-200/40 to-transparent dark:from-indigo-500/25 dark:via-purple-500/15",
              },
            }[card.color as "blue" | "emerald" | "amber" | "red" | "indigo"] || {
              bg: "bg-gradient-to-br from-slate-500/10 via-slate-500/5 to-white dark:from-slate-800/40 dark:via-slate-900 dark:to-slate-900",
              border: "border-slate-200/80 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700",
              text: "text-slate-700 dark:text-slate-400",
              iconBg: "bg-slate-100/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shadow-xs",
              accent: "from-slate-500 to-slate-600",
              aura: "from-slate-200/70 via-slate-200/40 to-transparent dark:from-slate-600/25 dark:via-slate-700/15",
            };

            return (
              <div
                key={card.label}
                className={`relative overflow-hidden rounded-2xl border ${colorClasses.border} ${colorClasses.bg} p-5 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 group`}
              >
                {/* Dynamic Top-Right Accent Aura Glow */}
                <div className={`absolute -top-8 -right-8 w-28 h-28 rounded-full bg-gradient-to-br ${colorClasses.aura} blur-xl pointer-events-none group-hover:scale-125 transition-transform duration-500`} />

                {/* Visual Top Highlight Accent */}
                <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${colorClasses.accent}`} />
                
                <div className="relative z-10 flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{card.label}</span>
                  <div className={`rounded-xl p-2 ${colorClasses.iconBg} transition-transform duration-300 group-hover:scale-110`}>
                    <IconComponent className="h-4 w-4" />
                  </div>
                </div>
                
                <div className="relative z-10 mt-3">
                  <span className="text-2xl font-black tracking-tight text-slate-900 dark:text-white leading-none">{card.value}</span>
                  <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">{card.note}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4 print:hidden">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search details..."
            className="h-10 w-full rounded-md border border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-white pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40"
          />
        </label>

        <NiceSelect
          ariaLabel="Select period"
          value={selectedPeriod}
          onValueChange={onPeriodChange}
          options={[
            { label: "Today", value: "today" },
            { label: "Yesterday", value: "yesterday" },
            { label: "This Month", value: "thismonth" },
            { label: "Last Month", value: "lastmonth" },
            { label: "Last 30 Days", value: "last30days" },
            { label: "Last 90 Days", value: "last90days" },
            { label: "Last 6 Months", value: "last6months" },
            { label: "Year to Date", value: "yeartodate" },
            { label: "All Time", value: "alltime" },
          ]}
        />

        {(reportType === "lead-report" || reportType === "loan-report" || reportType === "collection-report" || reportType === "outstanding-report" || reportType === "recovery-report") && (
          <NiceSelect
            ariaLabel="Filter status"
            value={statusFilter}
            onValueChange={setStatusFilter}
            options={[
              { label: "All Statuses", value: "all" },
              { label: "New", value: "New" },
              { label: "Contacted", value: "Contacted" },
              { label: "Paid", value: "Paid" },
              { label: "Overdue", value: "Overdue" },
              { label: "PTP", value: "PTP" },
              { label: "Broken PTP", value: "Broken PTP" },
            ]}
          />
        )}

        {(reportType === "lead-report" || reportType === "application-report" || reportType === "dpd-bucket-report") && (
          <NiceSelect
            ariaLabel="Filter priority"
            value={priorityFilter}
            onValueChange={setPriorityFilter}
            options={[
              { label: "All Priorities", value: "all" },
              { label: "High", value: "High" },
              { label: "Medium", value: "Medium" },
              { label: "Low", value: "Low" },
            ]}
          />
        )}
      </div>

      <div className="print:block">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
              <p className="text-sm font-medium text-slate-500">Fetching report records...</p>
            </div>
          </div>
        ) : (
          <ReportTable
            title={reportDetails.title}
            headers={reportDetails.headers}
            rows={reportDetails.rows}
          />
        )}
      </div>
    </div>
  );
}

function getHeaderAlignment(header: string) {
  const h = header.toLowerCase();
  if (
    h.includes("amount") ||
    h.includes("disbursement") ||
    h.includes("outstanding") ||
    h.includes("repayment") ||
    h.includes("balance") ||
    h.includes("principal") ||
    h.includes("interest") ||
    h.includes("fees") ||
    h.includes("total") ||
    h.includes("rate") ||
    h.includes("count")
  ) {
    return "text-right";
  }
  if (h === "s. no." || h === "dpd" || h === "priority" || h === "status" || h.includes("status")) {
    return "text-center";
  }
  return "text-left";
}

function renderCell(cell: string, header: string) {
  const trimmed = String(cell || "").trim();
  const lowerHeader = header.toLowerCase();

  // Clickable Lead / Application Links
  if (lowerHeader === "lead id" || lowerHeader === "id" || lowerHeader === "lead / app id") {
    if (trimmed && trimmed !== "-" && trimmed !== "System") {
      return (
        <Link to={`/leads/${trimmed}`} className="font-mono font-bold text-blue-600 hover:text-blue-800 hover:underline">
          {trimmed}
        </Link>
      );
    }
  }

  // Clickable Loan Account Links
  if (lowerHeader === "loan account" || lowerHeader === "loan account id" || lowerHeader === "loan id") {
    if (trimmed && trimmed !== "-") {
      return (
        <Link to={`/loan-management/${trimmed}`} className="font-mono font-bold text-blue-600 hover:text-blue-800 hover:underline">
          {trimmed}
        </Link>
      );
    }
  }

  // 1. Currency formatting
  if (trimmed.startsWith("₹") || trimmed.startsWith("-₹")) {
    const isNegative = trimmed.startsWith("-");
    return (
      <span className={`font-mono font-semibold tracking-tight ${isNegative ? "text-rose-600 dark:text-rose-400" : "text-slate-800 dark:text-slate-100"}`}>
        {trimmed}
      </span>
    );
  }

  // 2. Percentages
  if (trimmed.endsWith("%") && !Number.isNaN(parseFloat(trimmed))) {
    return (
      <span className="font-mono font-semibold text-slate-700 dark:text-slate-200 bg-slate-100/70 dark:bg-slate-800 border border-slate-200/50 dark:border-slate-700 px-2 py-0.5 rounded text-xs">
        {trimmed}
      </span>
    );
  }

  // 3. Priorities & Buckets
  if (trimmed === "High" || trimmed === "critical") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-950/30 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        High
      </span>
    );
  }
  if (trimmed === "Critical" || trimmed === "high") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 dark:bg-rose-950/30 px-2.5 py-0.5 text-xs font-semibold text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
        Critical
      </span>
    );
  }
  if (trimmed === "Medium" || trimmed === "watch") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 dark:bg-sky-950/30 px-2.5 py-0.5 text-xs font-semibold text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-800/60">
        <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
        Medium
      </span>
    );
  }
  if (trimmed === "Low" || trimmed === "current") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
        Low
      </span>
    );
  }

  // 4. Statuses (Paid, Overdue, New, Pending, etc.)
  const lowerVal = trimmed.toLowerCase();
  if (["paid", "paid off", "success", "received", "settled"].includes(lowerVal)) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        {trimmed}
      </span>
    );
  }

  if (["overdue", "broken ptp", "failed", "breached", "breached leads"].includes(lowerVal) || lowerVal.includes("breach")) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 dark:bg-rose-950/30 px-2.5 py-0.5 text-xs font-semibold text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
        {trimmed}
      </span>
    );
  }

  if (["new", "pending", "contacted", "ready", "active ptp", "active", "warning"].includes(lowerVal) || lowerVal.includes("active")) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 dark:bg-indigo-950/30 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/60">
        <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
        {trimmed}
      </span>
    );
  }

  // 5. Default formatting: Dates or Codes
  if (lowerHeader.includes("date") || lowerHeader.includes("timestamp") || lowerHeader.includes("submitted")) {
    return <span className="text-slate-600 dark:text-slate-300 font-medium whitespace-nowrap">{trimmed}</span>;
  }

  if (lowerHeader.includes("account") || lowerHeader.includes("id") || lowerHeader.includes("phone") || lowerHeader.includes("pan") || lowerHeader.includes("aadhaar")) {
    return <span className="font-mono font-medium text-slate-800 dark:text-slate-200 tracking-tight">{trimmed}</span>;
  }

  return <span className="text-slate-700 dark:text-slate-300 font-medium">{trimmed}</span>;
}

function ReportTable({ id, headers, rows, title }: { id?: string; headers: string[]; rows: string[][]; title: string }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState("8");
  const rowsPerPage = Number(pageSize);
  const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  const safePage = Math.min(page, totalPages);
  const startIndex = rows.length ? (safePage - 1) * rowsPerPage : 0;
  const endIndex = Math.min(startIndex + rowsPerPage, rows.length);
  const visibleRows = rows.slice(startIndex, endIndex);

  useEffect(() => {
    setPage(1);
  }, [rows.length, pageSize]);

  const exportRows = rows.map((row) => headers.reduce<Record<string, string>>((acc, header, index) => {
    acc[header] = row[index] || "";
    return acc;
  }, {}));
  const exportFilename = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "report";

  const handlePrintTable = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    
    const tableEl = document.getElementById(id || exportFilename);
    const tableHtml = tableEl ? tableEl.innerHTML : "";
    
    printWindow.document.write(`
      <html>
        <head>
          <title>Print Report - ${title}</title>
          <style>
            body { font-family: sans-serif; padding: 20px; color: #333; }
            h2 { margin-bottom: 10px; font-size: 16px; text-transform: uppercase; letter-spacing: 0.5px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
            th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
            th { background-color: #f8fafc; font-weight: bold; color: #475569; }
            tr:nth-child(even) { background-color: #f8fafc; }
            .print-hidden, select, button, .tooltip { display: none !important; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <h2>${title}</h2>
          <div>${tableHtml}</div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div id={id || exportFilename} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden transition-all hover:shadow-md">
      <div className="flex flex-col gap-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h3>
          <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            {rows.length ? `Showing ${startIndex + 1}-${endIndex} of ${rows.length} records` : "No records matching query"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <AppTooltip label={`Download ${title} as Excel CSV`}>
            <button
              type="button"
              onClick={() => exportCsv(exportRows, exportFilename)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-sm transition hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              <Download className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              Download CSV
            </button>
          </AppTooltip>

          <AppTooltip label={`Print ${title} Table`}>
            <button
              type="button"
              onClick={handlePrintTable}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-sm transition hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              <Printer className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              Print Table
            </button>
          </AppTooltip>

          <NiceSelect
            ariaLabel={`${title} rows per page`}
            value={pageSize}
            onValueChange={setPageSize}
            className="w-32 bg-white dark:bg-slate-800"
            options={reportPageSizeOptions}
          />
          <span className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-950/40 px-3 py-1 text-xs font-bold text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-900/60">
            {rows.length} items
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800">
          <thead className="bg-slate-50/30 dark:bg-slate-800/60">
            <tr>
              {headers.map((head) => (
                <th key={head} className={`px-6 py-3.5 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 ${getHeaderAlignment(head)}`}>
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
            {visibleRows.map((row, rowIndex) => (
              <tr key={row.join("-") + rowIndex} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition border-b border-slate-100 dark:border-slate-800">
                {row.map((cell, index) => {
                  const head = headers[index] || "";
                  return (
                    <td key={`${rowIndex}-${cell}-${index}`} className={`px-6 py-4 text-sm whitespace-nowrap ${getHeaderAlignment(head)}`}>
                      {renderCell(cell, head)}
                    </td>
                  );
                })}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={headers.length} className="px-6 py-16 text-center">
                  <EmptyState title="No report data" description="Data will appear here when the selected period has matching records." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length > rowsPerPage && (
        <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-800/30 px-6 py-4 text-sm font-semibold text-slate-500 dark:text-slate-400">
          <span>Page {safePage} of {totalPages}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(1)}
              disabled={safePage === 1}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer shadow-sm"
            >
              First
            </button>
            <button
              type="button"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={safePage === 1}
              className="inline-flex items-center gap-1 rounded-lg border border-blue-200 dark:border-blue-900 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-blue-700 dark:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/40 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer shadow-sm"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </button>
            <button
              type="button"
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              disabled={safePage === totalPages}
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer shadow-sm"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setPage(totalPages)}
              disabled={safePage === totalPages}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer shadow-sm"
            >
              Last
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
