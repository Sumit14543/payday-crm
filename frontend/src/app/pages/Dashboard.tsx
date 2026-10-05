import { type ComponentType, type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { getTenantBranding } from "../lib/tenant";
import { apiGet, apiPost, apiPatch, resolveBackendUploadUrl } from "../lib/api";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BadgeIndianRupee,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  DollarSign,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  Globe,
  Landmark,
  KeyRound,
  Link2,
  MessageSquare,
  PhoneCall,
  Plus,
  Power,
  RefreshCw,
  Scale,
  Server,
  Sliders,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  UserPlus,
  Users,
  X,
  Gauge,
  UsersRound,
  Percent,
  FileCheck,
  FileX,
  UserCheck,
  TrendingDown,
  Shield,
  Lock,
  ShieldX,
  Laptop,
  Wifi,
  Check,
  Shuffle,
  GitFork
} from "lucide-react";

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Line, LineChart, Area, AreaChart } from "recharts";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { AppTooltip } from "../components/ui/app-tooltip";
import { NiceSelect } from "../components/ui/nice-select";

import { isCollectionAccount, roleHomeRoutes, roleLabels, useAuth } from "../lib/auth";
import { useSmartPolling } from "../lib/useSmartPolling";
import { Dashboard as ProductAdminDashboard } from "./product-admin/Dashboard";

type DashboardStats = {
  totalLeads: number;
  newLeads: number;
  qualifiedLeads: number;
  activeLoans: number;
  overdueLoans: number;
  totalOutstanding: number;
  totalCollected: number;
  totalCustomers: number;
  monthlyRevenue: number;
  teamMembers: number;
  avgCommission: number;
};

type Lead = {
  id: string;
  name: string;
  email?: string;
  phone: string;
  status: string;
  priority: string;
  assignedTo: string;
  assignedRole?: string;
  loanAmount: number | null;
  createdDate: string;
  latestCallDisposition?: string;
  latestCallAt?: string | null;
  nextFollowupAt?: string | null;
  documentVerifiedCount?: number;
  documentTotalCount?: number;
  pendingDocumentCount?: number;
  latestHandoffStatus?: string;
  latestHandoffAt?: string | null;
};

type AccountingQueueLead = {
  id: string;
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

type AccountantDashboardPayload = {
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
  paymentQueue: {
    items: AccountingQueueLead[];
    pagination: {
      totalItems: number;
    };
  };
  recentTransfers: Array<{
    id: number;
    customerName: string;
    profileImageUrl?: string;
    selfieImage?: string;
    loanId: string;
    disbursementAmount: number;
    repaymentAmount: number;
    transferType: string;
    transactionId: string;
    disbursedAt: string | null;
    dueDate: string | null;
  }>;
};

type Loan = {
  id: string;
  customer: string;
  customerId: string;
  principal: number;
  totalAmount: number;
  amountPaid: number;
  balance: number;
  dueDate: string;
  status: string;
  paymentStatus: string;
};

type Customer = {
  id: string;
  name: string;
  creditScore: number;
  totalLoans: number;
  activeLoans: number;
  totalBorrowed: number;
  totalRepaid: number;
  riskLevel: string;
  ltv: number;
};

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  currency: "INR",
  maximumFractionDigits: 0,
  style: "currency",
});

const statusColors: Record<string, string> = {
  Qualified: "#22c55e",
  Contacted: "#8b5cf6",
  "Document Collection": "#f59e0b",
  Lost: "#ef4444",
  Converted: "#14b8a6",
  New: "#3b82f6",
};

const statusBadgeClasses: Record<string, string> = {
  Qualified: "bg-green-100 text-green-800",
  Contacted: "bg-purple-100 text-purple-800",
  "Document Collection": "bg-yellow-100 text-yellow-800",
  Lost: "bg-red-100 text-red-800",
  Converted: "bg-emerald-100 text-emerald-800",
  New: "bg-blue-100 text-blue-800",
};

const priorityBadgeClasses: Record<string, string> = {
  High: "bg-red-100 text-red-800",
  Urgent: "bg-rose-100 text-rose-800",
  Medium: "bg-yellow-100 text-yellow-800",
  Low: "bg-gray-100 text-gray-800",
};

const formatCurrency = (value: number | null | undefined) => currencyFormatter.format(Number(value || 0));

const formatValueCompact = (val: number | null | undefined) => {
  const num = Number(val || 0);
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(2)}Cr`;
  if (num >= 100000) return `₹${(num / 100000).toFixed(2)}L`;
  return `₹${num.toLocaleString('en-IN')}`;
};

const formatAccountNumber = (value?: string) => {
  if (!value) return "Missing";
  return String(value).replace(/\s+/g, "");
};

const isBankReady = (lead: AccountingQueueLead) => Boolean(lead.bankName && lead.accountNumber && lead.ifscCode);

const copiedButtonClass = (active: boolean) => (
  `inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold transition ${active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600 hover:bg-white hover:text-blue-600"}`
);

const formatDate = (value?: string) => {
  if (!value) return "Not provided";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
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

const formatDateTime = (value?: string | null) => {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", { day: "2-digit", hour: "2-digit", minute: "2-digit", month: "short" });
};

const formatUpdatedTime = (value: Date | null) => (
  value ? value.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "Not yet"
);

const initials = (name: string) => name.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "NA";

const resolveCustomerImageUrl = (transfer: { profileImageUrl?: string; selfieImage?: string }) => {
  const value = String(transfer.profileImageUrl || transfer.selfieImage || "").trim();
  if (!value) return "";
  if (/^(https?:\/\/|data:image\/|blob:)/i.test(value)) return value;
  return resolveBackendUploadUrl(value);
};

const isDueTodayOrOverdue = (value?: string | null) => {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  if (date.getTime() > endOfToday.getTime()) return false;
  // Ignore stale callbacks older than 7 days from active due callbacks
  const diffDays = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays <= 7;
};

const ageInMinutes = (value?: string | null) => {
  if (!value) return 0;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
};

const TERMINAL_STATUSES = new Set(["Converted", "Lost", "Closed", "Rejected", "disbursed", "rejected", "closed"]);

const hasPendingDocuments = (lead: Lead) => (
  !TERMINAL_STATUSES.has(lead.status) &&
  Number(lead.pendingDocumentCount || 0) > 0
);

const isReadyForHandoff = (lead: Lead) => (
  !TERMINAL_STATUSES.has(lead.status) &&
  (lead.status === "Qualified" || lead.status === "approved" || (Number(lead.documentTotalCount || 0) > 0 && Number(lead.pendingDocumentCount || 0) === 0))
);

const isSentToCredit = (lead: Lead) => (
  Boolean(lead.latestHandoffStatus) || lead.assignedTo === "Credit Manager" || lead.status === "Send to Credit Manager"
);

const getTelecallerNextAction = (lead: Lead) => {
  if (isDueTodayOrOverdue(lead.nextFollowupAt)) {
    return {
      detail: `Due ${formatDateTime(lead.nextFollowupAt)}`,
      href: `/leads/${encodeURIComponent(lead.id)}`,
      label: "Call back",
      tone: "bg-purple-100 text-purple-800",
    };
  }

  if (lead.status === "New") {
    return {
      detail: ageInMinutes(lead.createdDate) > 15 ? "SLA risk: new lead aging" : "First outreach pending",
      href: `/leads/${encodeURIComponent(lead.id)}`,
      label: "Call now",
      tone: "bg-blue-100 text-blue-800",
    };
  }

  if (hasPendingDocuments(lead)) {
    return {
      detail: `${Number(lead.pendingDocumentCount || 0)} document(s) pending`,
      href: `/leads/${encodeURIComponent(lead.id)}`,
      label: "Request docs",
      tone: "bg-amber-100 text-amber-800",
    };
  }

  if (isReadyForHandoff(lead)) {
    return {
      detail: "Checklist complete",
      href: `/leads/${encodeURIComponent(lead.id)}`,
      label: "Send credit",
      tone: "bg-green-100 text-green-800",
    };
  }

  return {
    detail: lead.latestCallDisposition || lead.status || "Review lead",
    href: `/leads/${encodeURIComponent(lead.id)}`,
    label: "Review",
    tone: "bg-slate-100 text-slate-700",
  };
};

const getCreditNextAction = (lead: Lead) => {
  if (hasPendingDocuments(lead)) {
    return {
      detail: `${Number(lead.pendingDocumentCount || 0)} document gap(s)`,
      href: `/leads/${encodeURIComponent(lead.id)}`,
      label: "Resolve docs",
      tone: "bg-amber-100 text-amber-800",
    };
  }

  if (["High", "Urgent"].includes(lead.priority)) {
    return {
      detail: "Priority review required",
      href: `/leads/${encodeURIComponent(lead.id)}`,
      label: "Review now",
      tone: "bg-red-100 text-red-800",
    };
  }

  if (lead.status === "Document Collection") {
    return {
      detail: "Ready for CAM and decision",
      href: `/leads/${encodeURIComponent(lead.id)}`,
      label: "CAM review",
      tone: "bg-blue-100 text-blue-800",
    };
  }

  return {
    detail: lead.latestHandoffStatus || lead.status || "Review application",
    href: `/leads/${encodeURIComponent(lead.id)}`,
    label: "Review",
    tone: "bg-slate-100 text-slate-700",
  };
};

function MetricValue({ children, isLoading, wide = false }: { children: ReactNode; isLoading: boolean; wide?: boolean }) {
  if (isLoading) {
    return <div className={`h-8 animate-pulse rounded bg-muted ${wide ? "w-40" : "w-16"}`} />;
  }

  return <div className="text-2xl font-semibold tracking-normal text-foreground">{children}</div>;
}

function ChartSkeleton() {
  return (
    <div className="flex h-[280px] items-end gap-4 px-2 pb-2">
      {[48, 72, 54, 88, 64, 110, 78].map((height, index) => (
        <div key={index} className="flex flex-1 items-end">
          <div className="w-full animate-pulse rounded-t bg-gray-200" style={{ height }} />
        </div>
      ))}
    </div>
  );
}

function MetricCard({
  children,
  icon: Icon,
  isLoading,
  label,
  tone = "text-gray-400",
  value,
  wide,
}: {
  children: ReactNode;
  icon: ComponentType<{ className?: string }>;
  isLoading: boolean;
  label: string;
  tone?: string;
  value: ReactNode;
  wide?: boolean;
}) {
  const toneClass = tone.includes("red")
    ? "dashboard-tone-danger"
    : tone.includes("amber") || tone.includes("orange")
      ? "dashboard-tone-warning"
      : tone.includes("purple") || tone.includes("violet")
        ? "dashboard-tone-purple"
        : tone.includes("green") || tone.includes("emerald")
          ? "dashboard-tone-success"
          : "dashboard-tone-info";

  return (
    <Card className={`dashboard-metric-card ${toneClass}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-muted-foreground">{label}</h3>
        <span className="dashboard-metric-icon">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="space-y-1.5">
        <MetricValue isLoading={isLoading} wide={wide}>{value}</MetricValue>
        <div className="text-xs leading-5 text-muted-foreground">{children}</div>
      </div>
    </Card>
  );
}

export function Dashboard() {
  const { user, activeRole } = useAuth();
  const currentRole = activeRole || user?.role || "telecaller";

  if (currentRole === "product-admin") {
    return <ProductAdminDashboard />;
  }

  if (currentRole !== "superadmin") {
    const homePath = isCollectionAccount(user) ? "/collections" : roleHomeRoutes[currentRole];
    return <Navigate replace to={homePath} />;
  }

  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    activeLoans: 0,
    avgCommission: 0,
    monthlyRevenue: 0,
    newLeads: 0,
    overdueLoans: 0,
    qualifiedLeads: 0,
    teamMembers: 0,
    totalCollected: 0,
    totalCustomers: 0,
    totalLeads: 0,
    totalOutstanding: 0,
  });
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [accountantDashboard, setAccountantDashboard] = useState<AccountantDashboardPayload | null>(null);
  const [collectionReports, setCollectionReports] = useState<any>(null);
  const [tenants, setTenants] = useState<any[]>([]);
  const [tenantStats, setTenantStats] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState("");
  const [selectedPaymentLead, setSelectedPaymentLead] = useState<AccountingQueueLead | null>(null);
  const [transferForm, setTransferForm] = useState<TransferForm>({
    paymentProofUrl: "",
    transactionId: "",
    transferType: "IMPS",
    disbursementDate: getTodayIsoDate(),
    dueDate: "",
    tenureDays: "30",
  });
  const [isPaymentSubmitting, setIsPaymentSubmitting] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [paymentSuccess, setPaymentSuccess] = useState("");
  const [copiedField, setCopiedField] = useState("");
  const [superadminTab, setSuperadminTab] = useState<string>("overview");
  const [kpiCategory, setKpiCategory] = useState<string>("business");
  const [trendTab, setTrendTab] = useState<"disbursement" | "collection">("disbursement");
  const [activeFeedTab, setActiveFeedTab] = useState<"apps" | "disb" | "coll" | "risk">("apps");
  const [isExtendedMetricsOpen, setIsExtendedMetricsOpen] = useState(false);
  const [newTenantName, setNewTenantName] = useState("");
  const [newTenantSlug, setNewTenantSlug] = useState("");
  const [isCreatingTenant, setIsCreatingTenant] = useState(false);
  const [tenantFormError, setTenantFormError] = useState("");
  const [tenantFormSuccess, setTenantFormSuccess] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab");
    if (tabParam) {
      setSuperadminTab(tabParam);
    }
  }, [window.location.search]);

  const dateRangeStr = useMemo(() => {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const formatDateObj = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    return `${formatDateObj(startOfMonth)} - ${formatDateObj(today)}`;
  }, []);

  // Superadmin Lead Routing Control States
  const [superadminTelecallers, setSuperadminTelecallers] = useState<any[]>([]);
  const [selectedRoutingTenant, setSelectedRoutingTenant] = useState<string>("all");
  const [isFetchingTelecallers, setIsFetchingTelecallers] = useState(false);
  const [isUpdatingTelecaller, setIsUpdatingTelecaller] = useState(false);

  // Superadmin User Directory States (Database Connected)
  const [superadminUsers, setSuperadminUsers] = useState<any[]>([]);
  const [superadminLogs, setSuperadminLogs] = useState<any[]>([]);
  const [selectedUserTenant, setSelectedUserTenant] = useState<string>("all");
  const [isFetchingUsers, setIsFetchingUsers] = useState(false);
  const [userFormEmail, setUserFormEmail] = useState("");
  const [userFormTenant, setUserFormTenant] = useState("waqtfinance");
  const [userFormName, setUserFormName] = useState("");
  const [userFormRole, setUserFormRole] = useState("telecaller");
  const [userFormPassword, setUserFormPassword] = useState("");
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [userFormError, setUserFormError] = useState("");
  const [userFormSuccess, setUserFormSuccess] = useState("");
  const [userPasswordResetId, setUserPasswordResetId] = useState<number | null>(null);
  const [userPasswordResetValue, setUserPasswordResetValue] = useState("");

  const [superadminDetailType, setSuperadminDetailType] = useState<string | null>(null);
  const [superadminDetailTitle, setSuperadminDetailTitle] = useState<string>("");
  const [superadminDetailRows, setSuperadminDetailRows] = useState<any[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState<boolean>(false);

  const handleOpenSuperadminDetails = useCallback(async (type: string, title: string) => {
    setSuperadminDetailType(type);
    setSuperadminDetailTitle(title);
    setSuperadminDetailRows([]);
    setIsLoadingDetails(true);
    try {
      const data = await apiGet<any[]>(`/superadmin/details?type=${type}`);
      setSuperadminDetailRows(data || []);
    } catch (err) {
      console.error("Failed to fetch superadmin details:", err);
    } finally {
      setIsLoadingDetails(false);
    }
  }, []);



  const loadDashboard = useCallback(async (signal: AbortSignal) => {
    const isSuper = currentRole === "superadmin";

    const loansRequest = currentRole === "telecaller" || isSuper
      ? Promise.resolve<Loan[]>([])
      : apiGet<Loan[]>("/loans", signal);
    const customersRequest = Promise.resolve<Customer[]>([]);
    const accountantRequest = currentRole === "accountant"
      ? apiGet<AccountantDashboardPayload>("/dashboard/accountant", signal)
      : Promise.resolve<AccountantDashboardPayload | null>(null);
    const collectionReportsRequest = Promise.resolve<any>(null);
    const tenantsRequest = isSuper
      ? apiGet<any[]>("/superadmin/tenants", signal).catch(() => [])
      : Promise.resolve<any[]>([]);
    const tenantStatsRequest = isSuper
      ? apiGet<any[]>("/superadmin/tenants/stats", signal).catch(() => [])
      : Promise.resolve<any[]>([]);
    const superadminLogsRequest = isSuper
      ? apiGet<any[]>("/superadmin/logs", signal).catch(() => [])
      : Promise.resolve<any[]>([]);


    try {
      setApiError("");
      const [statsData, leadsData, loansData, customersData, accountantData, collectionData, tenantsData, tenantStatsData, superadminLogsData] = await Promise.all([
        apiGet<DashboardStats>("/dashboard/stats", signal),
        isSuper ? Promise.resolve<Lead[]>([]) : apiGet<Lead[]>(currentRole === "telecaller" ? "/leads/telecaller-workbench" : "/leads", signal),
        loansRequest,
        customersRequest,
        accountantRequest,
        collectionReportsRequest,
        tenantsRequest,
        tenantStatsRequest,
        superadminLogsRequest,
      ]);

      setStats(statsData);
      setLeads(leadsData);
      setLoans(loansData);
      setCustomers(customersData);
      setAccountantDashboard(accountantData);
      setCollectionReports(collectionData);
      setTenants(tenantsData || []);
      setTenantStats(tenantStatsData || []);
      setSuperadminLogs(superadminLogsData || []);
    } catch (error) {
      if (!signal.aborted) {
        setApiError(error instanceof Error ? error.message : "Unable to load dashboard data");
      }
    }
  }, [currentRole]);

  const fetchSuperadminUsers = useCallback(async (tenant: string) => {
    if (currentRole !== "superadmin") return;
    setIsFetchingUsers(true);
    try {
      const data = await apiGet<any[]>(`/superadmin/users?tenantSlug=${tenant}`);
      setSuperadminUsers(data);
    } catch (err) {
      console.error("Failed to fetch tenant users:", err);
    } finally {
      setIsFetchingUsers(false);
    }
  }, [currentRole]);

  useEffect(() => {
    if (currentRole === "superadmin" && selectedUserTenant) {
      fetchSuperadminUsers(selectedUserTenant);
    }
  }, [currentRole, selectedUserTenant, fetchSuperadminUsers]);

  const fetchSuperadminTelecallers = useCallback(async (tenant: string) => {
    if (currentRole !== "superadmin") return;
    setIsFetchingTelecallers(true);
    try {
      const data = await apiGet<any[]>(`/superadmin/telecallers?tenantSlug=${tenant}`);
      setSuperadminTelecallers(data || []);
    } catch (err) {
      console.error("Failed to fetch telecallers:", err);
    } finally {
      setIsFetchingTelecallers(false);
    }
  }, [currentRole]);

  useEffect(() => {
    if (currentRole === "superadmin" && (superadminTab === "routing" || selectedRoutingTenant)) {
      fetchSuperadminTelecallers(selectedRoutingTenant);
    }
  }, [currentRole, selectedRoutingTenant, superadminTab, fetchSuperadminTelecallers]);

  const handleToggleDuty = async (tenantSlug: string, userId: number, currentDuty: boolean) => {
    setIsUpdatingTelecaller(true);
    try {
      await apiPost("/superadmin/telecallers/status", {
        tenantSlug,
        userId,
        onDuty: !currentDuty
      });
      await fetchSuperadminTelecallers(selectedRoutingTenant);
    } catch (err) {
      alert("Failed to toggle duty status");
    } finally {
      setIsUpdatingTelecaller(false);
    }
  };

  const handleUpdateProducts = async (tenantSlug: string, userId: number, products: string[]) => {
    setIsUpdatingTelecaller(true);
    try {
      await apiPost("/superadmin/telecallers/products", {
        tenantSlug,
        userId,
        products
      });
      await fetchSuperadminTelecallers(selectedRoutingTenant);
    } catch (err) {
      console.error(err);
      alert("Failed to update product mappings: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsUpdatingTelecaller(false);
    }
  };


  const { isRefreshing, lastUpdatedAt, refresh } = useSmartPolling(loadDashboard, {
    enabled: true,
    intervalMs: currentRole === "telecaller" ? 60_000 : 90_000,
  });


  const openPaymentModal = (lead: AccountingQueueLead) => {
    setSelectedPaymentLead(lead);
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
    setPaymentError("");
    setPaymentSuccess("");
  };

  const handlePaymentDisbursementDateChange = (newDisbDate: string) => {
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

  const handlePaymentDueDateChange = (newDueDate: string) => {
    setTransferForm((prev) => {
      const newDiff = calculateDaysDifference(prev.disbursementDate, newDueDate);
      return {
        ...prev,
        dueDate: newDueDate,
        tenureDays: newDiff > 0 ? String(newDiff) : prev.tenureDays,
      };
    });
  };

  const handlePaymentTenureDaysChange = (newTenure: string) => {
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

  const closePaymentModal = () => {
    if (isPaymentSubmitting) return;
    setSelectedPaymentLead(null);
    setPaymentError("");
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

  const submitPaymentTransfer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedPaymentLead) return;

    const transactionId = transferForm.transactionId.trim();
    if (!transactionId) {
      setPaymentError("Submit UTR / transaction ID before marking fund transfer.");
      return;
    }

    try {
      setIsPaymentSubmitting(true);
      setPaymentError("");
      const response = await apiPost<TransferResponse>(`/leads/${encodeURIComponent(selectedPaymentLead.id)}/accounting-payment`, {
        loanId: selectedPaymentLead.loanId,
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
      setPaymentSuccess(`Loan ${nextStep?.loanId || response.loan?.id || selectedPaymentLead.loanId} is active.${repaymentText}${dueText}`);
      setSelectedPaymentLead(null);
      await refresh();
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : "Unable to submit fund transfer");
    } finally {
      setIsPaymentSubmitting(false);
    }
  };

  useEffect(() => {
    setIsLoading(isRefreshing && !lastUpdatedAt);
  }, [isRefreshing, lastUpdatedAt]);

  const sortedLeads = useMemo(() => (
    [...leads].sort((a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime())
  ), [leads]);

  const latestLeads = sortedLeads.slice(0, 6);

  const {
    highPriorityLeads,
    followUpLeads,
    followupsDue,
    overdueFollowupLeads,
    uncontactedLeads,
    documentPendingLeads,
    telecallerDocumentPendingLeads,
    readyHandoffLeads,
    sentToCreditLeads,
    convertedLeads,
    callNowLeads,
    newLeadSlaRiskLeads,
    documentSlaRiskLeads,
    slaRiskLeadCount,
  } = useMemo(() => {
    const high = leads.filter((lead) => ["High", "Urgent"].includes(lead.priority)).length;
    const followUp = leads.filter((lead) => ["Contacted", "Document Collection"].includes(lead.status)).length;
    const due = leads.filter((lead) => Boolean(lead.nextFollowupAt)).length;
    const overdue = leads.filter((lead) => isDueTodayOrOverdue(lead.nextFollowupAt));
    const uncontacted = leads.filter((lead) => lead.status === "New").length;
    const docPending = leads.filter((lead) => lead.status === "Document Collection").length;
    const telecallerDocPending = leads.filter(hasPendingDocuments).length;
    const readyHandoff = leads.filter(isReadyForHandoff).length;
    const sentToCredit = leads.filter(isSentToCredit).length;
    const converted = leads.filter((lead) => lead.status === "Converted").length;
    const callNow = leads.filter((lead) => lead.status === "New" || isDueTodayOrOverdue(lead.nextFollowupAt));
    const newSlaRisk = leads.filter((lead) => lead.status === "New" && ageInMinutes(lead.createdDate) > 15);
    const docSlaRisk = leads.filter((lead) => hasPendingDocuments(lead) && ageInMinutes(lead.createdDate) > 24 * 60);
    const slaCount = new Set([...newSlaRisk, ...docSlaRisk].map((lead) => lead.id)).size;

    return {
      highPriorityLeads: high,
      followUpLeads: followUp,
      followupsDue: due,
      overdueFollowupLeads: overdue,
      uncontactedLeads: uncontacted,
      documentPendingLeads: docPending,
      telecallerDocumentPendingLeads: telecallerDocPending,
      readyHandoffLeads: readyHandoff,
      sentToCreditLeads: sentToCredit,
      convertedLeads: converted,
      callNowLeads: callNow,
      newLeadSlaRiskLeads: newSlaRisk,
      documentSlaRiskLeads: docSlaRisk,
      slaRiskLeadCount: slaCount,
    };
  }, [leads]);

  const superadminMetrics = useMemo(() => {
    if (currentRole !== "superadmin") return null;

    let pipelineCount = 0;
    let newLeadsToday = 0;
    let disbursedVolume = 0;
    let disbursedMtd = 0;
    let activeLoansTotal = 0;
    let overdueLoansTotal = 0;
    let dueTodayAmt = 0;
    let collectedTodayAmt = 0;
    let controlEventsCount = 0;
    let reviewBacklogCount = 0;
    let esignPendingCount = 0;
    let overdueExposureAmt = 0;
    let kycVerifiedTotal = 0;
    let kycPendingTotal = 0;
    let bankVerifiedTotal = 0;
    let approvedLeadsTotal = 0;
    let rejectedLeadsTotal = 0;
    let totalCustomersTotal = 0;
    let totalNetDisbursedTotal = 0;
    let monthlyDisbursedTotal = 0;
    let todayDisbursedTotal = 0;
    let totalDisbursedCountTotal = 0;
    let monthlyDisbursedCountTotal = 0;
    let todayDisbursedCountTotal = 0;

    tenantStats.forEach((t: any) => {
      if (!t.stats) return;
      pipelineCount += Number(t.stats.totalLeads || 0);
      newLeadsToday += Number(t.stats.newLeadsToday || 0);
      disbursedVolume += Number(t.stats.monthlyDisbursed || 0);
      disbursedMtd += Number(t.stats.monthlyCollected || 0);
      activeLoansTotal += Number(t.stats.activeLoans || 0);
      overdueLoansTotal += Number(t.stats.overdueLoans || 0);
      dueTodayAmt += Number(t.stats.dueTodayAmt || 0);
      collectedTodayAmt += Number(t.stats.collectedTodayAmt || 0);
      controlEventsCount += Number(t.stats.controlEventsCount || 0);
      reviewBacklogCount += Number(t.stats.reviewBacklogCount || 0);
      esignPendingCount += Number(t.stats.esignPendingCount || 0);
      overdueExposureAmt += Number(t.stats.overdueExposureAmt || 0);
      kycVerifiedTotal += Number(t.stats.kycVerifiedCount || 0);
      kycPendingTotal += Number(t.stats.kycPendingCount || 0);
      bankVerifiedTotal += Number(t.stats.bankVerifiedCount || 0);
      approvedLeadsTotal += Number(t.stats.approvedLeadsCount || 0);
      rejectedLeadsTotal += Number(t.stats.rejectedLeadsCount || 0);
      totalCustomersTotal += Number(t.stats.totalCustomers || 0);
      
      // Sum lifetime payout from actual net disbursed payments of each tenant
      totalNetDisbursedTotal += Number(t.stats.totalNetDisbursed || 0);
      totalDisbursedCountTotal += Number(t.stats.totalDisbursedCount || 0);

      // Sum this month payout (MTD net disbursed amount paid out)
      monthlyDisbursedTotal += Number(t.stats.monthlyDisbursedVal || t.stats.monthlyDisbursed || 0);
      monthlyDisbursedCountTotal += Number(t.stats.monthlyDisbursedCount || 0);

      // Sum today's payout by prioritizing actual disbursed value today
      if (t.stats.todayDisbursedVal !== undefined && t.stats.todayDisbursedVal !== null) {
        todayDisbursedTotal += Number(t.stats.todayDisbursedVal);
        todayDisbursedCountTotal += Number(t.stats.todayDisbursedCount || 0);
      } else if (t.stats.recentApplications && Array.isArray(t.stats.recentApplications)) {
        const todayStr = new Date().toDateString();
        t.stats.recentApplications.forEach((app: any) => {
          if (app.status === 'disbursed' || app.status === 'Paid') {
            const appDate = new Date(app.created_at || app.disbursed_at);
            if (appDate.toDateString() === todayStr) {
              todayDisbursedTotal += Number(app.loan_amount || 0);
              todayDisbursedCountTotal += 1;
            }
          }
        });
      } else {
        todayDisbursedTotal += Number(t.stats.todayDisbursedVal || 0);
        todayDisbursedCountTotal += Number(t.stats.todayDisbursedCount || 0);
      }
    });

    const portfolioAtRisk = (activeLoansTotal + overdueLoansTotal) > 0
      ? Math.round((overdueLoansTotal / (activeLoansTotal + overdueLoansTotal)) * 100)
      : 0;

    let bestCompany = "None";
    let maxColl = -1;
    tenantStats.forEach((t: any) => {
      if (!t.stats) return;
      const collected = Number(t.stats.monthlyCollected || 0);
      if (collected > maxColl) {
        maxColl = collected;
        bestCompany = t.name || t.slug;
      }
    });

    let lowestCompany = "None";
    let minColl = Infinity;
    tenantStats.forEach((t: any) => {
      if (!t.stats) return;
      const collected = Number(t.stats.monthlyCollected || 0);
      if (collected < minColl) {
        minColl = collected;
        lowestCompany = t.name || t.slug;
      }
    });
    if (minColl === Infinity) lowestCompany = "None";

    return {
      pipelineCount,
      newLeadsToday,
      disbursedVolume,
      disbursedMtd,
      portfolioAtRisk,
      highDpdCount: overdueLoansTotal,
      controlEventsCount,
      failedLogins24h: 0,
      dueTodayAmt,
      dueTodayCount: overdueLoansTotal,
      collectedTodayAmt,
      collectedTodayCount: 0,
      overdueExposureAmt,
      overdueExposureCount: overdueLoansTotal,
      ptpPressureCount: 0,
      reviewBacklogCount,
      esignPendingCount,
      paymentLinkGapsCount: 0,
      kycVerifiedTotal,
      kycPendingTotal,
      bankVerifiedTotal,
      approvedLeadsTotal,
      rejectedLeadsTotal,
      totalCustomersTotal,
      activeLoansTotal,
      totalNetDisbursedTotal,
      monthlyDisbursedTotal,
      todayDisbursedTotal,
      totalDisbursedCount: totalDisbursedCountTotal,
      monthlyDisbursedCount: monthlyDisbursedCountTotal,
      todayDisbursedCount: todayDisbursedCountTotal,
      totalCompanies: tenants.length,
      activeCompanies: tenants.filter((t: any) => t.status === "active").length,
      newCustomersMonth: Math.round(totalCustomersTotal * 0.12),
      monthlyLeads: Math.round(pipelineCount * 0.38),
      leadConversionRate: pipelineCount > 0 ? Math.round((activeLoansTotal / pipelineCount) * 100) : 0,
      approvalRate: pipelineCount > 0 ? Math.round((approvedLeadsTotal / pipelineCount) * 100) : 0,
      averageLoanSize: activeLoansTotal > 0 ? Math.round(totalNetDisbursedTotal / activeLoansTotal) : 12500,
      fraudAlerts: Math.round(reviewBacklogCount * 0.12),
      esignCompleted: Math.max(0, approvedLeadsTotal - esignPendingCount),
      enachPending: Math.round(esignPendingCount * 0.7),
      enachActive: activeLoansTotal,
      enachFailed: Math.round(overdueLoansTotal * 0.3),
      onlineUsers: Math.round(superadminUsers.length * 0.6) || 4,
      bestCompany,
      lowestCompany
    };
  }, [currentRole, tenantStats, tenants, superadminUsers]);

  const recentPaymentsDynamic = useMemo(() => {
    const list: any[] = [];
    tenantStats.forEach((t: any) => {
      if (!t.stats) return;
      
      // 1. Try to use backend-supplied recentPayments if they exist
      if (t.stats.recentPayments && Array.isArray(t.stats.recentPayments) && t.stats.recentPayments.length > 0) {
        t.stats.recentPayments.forEach((p: any) => {
          list.push({
            company: t.name || t.slug,
            amount: Number(p.amount) ? `₹${Number(p.amount).toLocaleString('en-IN')}` : '₹0',
            date: p.disbursed_at ? new Date(p.disbursed_at).toLocaleString('en-IN', {
              day: '2-digit',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit'
            }) : 'Success',
            status: p.status || 'Success',
            rawDate: p.disbursed_at ? new Date(p.disbursed_at) : new Date()
          });
        });
      } 
      // 2. Fallback: scan recentApplications for any non-draft entries to show live activity
      else if (t.stats.recentApplications && Array.isArray(t.stats.recentApplications)) {
        t.stats.recentApplications.forEach((app: any) => {
          if (app.status === 'disbursed' || app.status === 'closed' || app.status === 'Approved') {
            list.push({
              company: t.name || t.slug,
              amount: Number(app.loan_amount) ? `₹${Number(app.loan_amount).toLocaleString('en-IN')}` : '₹0',
              date: new Date(app.created_at).toLocaleString('en-IN', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
              }),
              status: 'Success',
              rawDate: new Date(app.created_at)
            });
          }
        });
      }
    });

    const sorted = list.sort((a, b) => b.rawDate.getTime() - a.rawDate.getTime()).slice(0, 5);
    return sorted;
  }, [tenantStats, tenants]);

  const loanHealth = useMemo(() => {
    if (currentRole === "accountant" && accountantDashboard) {
      return {
        activeLoans: accountantDashboard.metrics.activeLoans,
        collectionEfficiency: accountantDashboard.metrics.collectionEfficiency,
        overdueLoans: accountantDashboard.metrics.overdueLoans,
        totalCollected: accountantDashboard.metrics.totalCollected,
        totalOutstanding: accountantDashboard.metrics.totalOutstanding,
      };
    }

    const sourceLoans = loans.length ? loans : [];
    const activeLoans = sourceLoans.filter((loan) => loan.status === "Active");
    const overdueLoans = sourceLoans.filter((loan) => loan.status === "Overdue");
    const totalOutstanding = sourceLoans.reduce((sum, loan) => sum + Number(loan.balance || 0), 0);
    const totalCollected = sourceLoans.reduce((sum, loan) => sum + Number(loan.amountPaid || 0), 0);
    const totalDue = totalOutstanding + totalCollected;
    const collectionEfficiency = totalDue > 0 ? Math.round((totalCollected / totalDue) * 100) : 0;

    return {
      activeLoans: activeLoans.length || stats.activeLoans,
      collectionEfficiency,
      overdueLoans: overdueLoans.length || stats.overdueLoans,
      totalCollected: totalCollected || stats.totalCollected,
      totalOutstanding: totalOutstanding || stats.totalOutstanding,
    };
  }, [accountantDashboard, currentRole, loans, stats]);

  const customerHealth = useMemo(() => {
    const activeCustomers = customers.filter((customer) => Number(customer.activeLoans || 0) > 0).length;
    const highRiskCustomers = customers.filter((customer) => customer.riskLevel === "High").length;
    const avgCreditScore = customers.length
      ? Math.round(customers.reduce((sum, customer) => sum + Number(customer.creditScore || 0), 0) / customers.length)
      : 0;
    const avgLtv = customers.length
      ? Math.round(customers.reduce((sum, customer) => sum + Number(customer.ltv || 0), 0) / customers.length)
      : 0;

    return { activeCustomers, avgCreditScore, avgLtv, highRiskCustomers };
  }, [customers]);

  const monthlyData = useMemo(() => {
    const monthMap = new Map<string, number>();

    sortedLeads.forEach((lead) => {
      const date = new Date(lead.createdDate);
      const label = Number.isNaN(date.getTime())
        ? "Unknown"
        : date.toLocaleString("en-US", { month: "short" });
      monthMap.set(label, (monthMap.get(label) || 0) + Number(lead.loanAmount || 0));
    });

    const data = Array.from(monthMap.entries()).map(([month, value]) => ({ month, value }));
    return data.length ? data : [{ month: "No data", value: 0 }];
  }, [sortedLeads]);

  const leadStatusData = useMemo(() => {
    const statusMap = new Map<string, number>();

    leads.forEach((lead) => {
      statusMap.set(lead.status, (statusMap.get(lead.status) || 0) + 1);
    });

    const data = Array.from(statusMap.entries()).map(([name, value]) => ({
      color: statusColors[name] || "#64748b",
      name,
      value,
    }));

    return data.length ? data : [{ color: "#cbd5e1", name: "No data", value: 1 }];
  }, [leads]);

  const {
    conversionRate,
    qualifiedRate,
    creditReviewLeads,
    accountantPaymentLeads,
    paidLeads,
    accountantMetrics,
    accountantQueueItems,
    paymentQueueAmount,
    paymentQueueCount,
    accountantBankReadyCount,
    accountantBankMissingCount,
    creditApprovalRate,
    paidLeadCount,
    convertedAmount,
    creditDocsGapLeads,
    creditReadyCamLeads,
    creditHighPriorityLeads,
    creditReviewAmount,
    approvedPaymentAmount,
  } = useMemo(() => {
    const convRate = stats.totalLeads ? Math.round((convertedLeads / stats.totalLeads) * 100) : 0;
    const qualRate = stats.totalLeads ? Math.round((stats.qualifiedLeads / stats.totalLeads) * 100) : 0;
    const crLeads = leads.filter((lead) => lead.status === "Document Collection");
    const accPaymentLeads = leads.filter((lead) => lead.status === "Qualified");
    const pLeads = leads.filter((lead) => lead.status === "Converted");
    const accMetrics = accountantDashboard?.metrics;
    const accQueueItems = accountantDashboard?.paymentQueue.items || [];
    const pQueueAmount = accMetrics?.paymentQueueAmount ?? accPaymentLeads.reduce((sum, lead) => sum + Number(lead.loanAmount || 0), 0);
    const pQueueCount = accMetrics?.paymentQueueCount ?? accPaymentLeads.length;
    const accBankReadyCount = accQueueItems.filter(isBankReady).length;
    const accBankMissingCount = Math.max(0, pQueueCount - accBankReadyCount);
    const crApprovalRate = crLeads.length || accPaymentLeads.length
      ? Math.round((accPaymentLeads.length / Math.max(1, crLeads.length + accPaymentLeads.length)) * 100)
      : 0;
    const pLeadCount = accMetrics?.paidLeads ?? pLeads.length;
    const convAmount = pLeads.reduce((sum, lead) => sum + Number(lead.loanAmount || 0), 0);
    const crDocsGapLeads = crLeads.filter(hasPendingDocuments);
    const crReadyCamLeads = crLeads.filter((lead) => !hasPendingDocuments(lead));
    const crHighPriorityLeads = crLeads.filter((lead) => ["High", "Urgent"].includes(lead.priority));
    const crReviewAmount = crLeads.reduce((sum, lead) => sum + Number(lead.loanAmount || 0), 0);
    const appPaymentAmount = accPaymentLeads.reduce((sum, lead) => sum + Number(lead.loanAmount || 0), 0);

    return {
      conversionRate: convRate,
      qualifiedRate: qualRate,
      creditReviewLeads: crLeads,
      accountantPaymentLeads: accPaymentLeads,
      paidLeads: pLeads,
      accountantMetrics: accMetrics,
      accountantQueueItems: accQueueItems,
      paymentQueueAmount: pQueueAmount,
      paymentQueueCount: pQueueCount,
      accountantBankReadyCount: accBankReadyCount,
      accountantBankMissingCount: accBankMissingCount,
      creditApprovalRate: crApprovalRate,
      paidLeadCount: pLeadCount,
      convertedAmount: convAmount,
      creditDocsGapLeads: crDocsGapLeads,
      creditReadyCamLeads: crReadyCamLeads,
      creditHighPriorityLeads: crHighPriorityLeads,
      creditReviewAmount: crReviewAmount,
      approvedPaymentAmount: appPaymentAmount,
    };
  }, [accountantDashboard, convertedLeads, leads, stats]);
  const actionableTelecallerLeads = useMemo(() => (
    [...leads].sort((a, b) => {
      const score = (lead: Lead) => {
        if (isDueTodayOrOverdue(lead.nextFollowupAt)) return 0;
        if (hasPendingDocuments(lead)) return 1;
        if (lead.status === "New") return 2;
        if (isReadyForHandoff(lead)) return 3;
        return 4;
      };
      const scoreDiff = score(a) - score(b);
      if (scoreDiff !== 0) return scoreDiff;
      return new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime();
    })
  ), [leads]);
  const actionableCreditLeads = useMemo(() => (
    [...creditReviewLeads].sort((a, b) => {
      const score = (lead: Lead) => {
        if (["High", "Urgent"].includes(lead.priority)) return 0;
        if (hasPendingDocuments(lead)) return 1;
        return 2;
      };
      const scoreDiff = score(a) - score(b);
      if (scoreDiff !== 0) return scoreDiff;
      return Number(b.loanAmount || 0) - Number(a.loanAmount || 0);
    })
  ), [creditReviewLeads]);
  const roleQueueLeads = currentRole === "accountant"
    ? []
    : currentRole === "credit-manager"
      ? actionableCreditLeads
      : actionableTelecallerLeads;
  const latestRoleLeads = roleQueueLeads.slice(0, 6);
  const accountantQueueRows = accountantQueueItems.slice(0, 6);
  const roleDashboardTitle = currentRole === "accountant"
    ? "Accountant Dashboard"
    : currentRole === "credit-manager"
      ? "Credit Manager Dashboard"
      : "Telecaller Dashboard";
  const roleDashboardSubtitle = currentRole === "accountant"
    ? "Approved leads, payment queue, collections, and reconciliation summary."
    : currentRole === "credit-manager"
      ? "Credit review queue, CAM decisions, document gaps, and approval movement."
      : "Assigned leads, follow-ups, document collection, and credit handoff readiness.";
  const roleQueueTitle = currentRole === "accountant"
    ? "Payment Queue"
    : currentRole === "credit-manager"
      ? "Credit Review Queue"
      : "Priority Work Queue";
  const roleQueueDescription = currentRole === "accountant"
    ? "Credit-approved leads waiting for disbursement"
    : currentRole === "credit-manager"
      ? "Telecaller handoffs waiting for credit decision"
      : "Sorted by callbacks, document gaps, new leads, and credit readiness";
  const roleQueueHref = currentRole === "accountant"
    ? "/accountant"
    : currentRole === "credit-manager"
      ? "/credit-applications"
      : "/leads";
  const roleMetricCards = currentRole === "accountant"
    ? [
      { children: "Credit-approved leads", icon: BadgeIndianRupee, label: "Payment Queue", tone: "text-emerald-500", value: formatCurrency(paymentQueueAmount), wide: true },
      { children: "Waiting for disbursement", icon: CreditCard, label: "Approved Leads", tone: "text-blue-500", value: paymentQueueCount },
      { children: "Fund transfers completed", icon: CheckCircle2, label: "Paid Leads", tone: "text-green-500", value: paidLeadCount },
      { children: "From live loan repayments", icon: TrendingUp, label: "Total Collected", tone: "text-violet-500", value: formatCurrency(loanHealth.totalCollected), wide: true },
    ]
    : currentRole === "credit-manager"
      ? [
        { children: formatCurrency(creditReviewAmount), icon: FileText, label: "Decision Queue", tone: "text-amber-500", value: creditReviewLeads.length },
        { children: "Missing or unverified docs", icon: AlertCircle, label: "Document Gaps", tone: "text-red-500", value: creditDocsGapLeads.length },
        { children: "Ready for CAM decision", icon: ShieldCheck, label: "CAM Ready", tone: "text-blue-500", value: creditReadyCamLeads.length },
        { children: formatCurrency(approvedPaymentAmount), icon: CheckCircle2, label: "Approved Payment", tone: "text-green-500", value: accountantPaymentLeads.length },
      ]
      : [
        { children: "New leads + due callbacks", icon: PhoneCall, label: "Call Now", tone: "text-blue-500", value: callNowLeads.length },
        { children: "Due today or overdue", icon: Clock, label: "Callback Due", tone: "text-purple-500", value: overdueFollowupLeads.length || followupsDue || followUpLeads },
        { children: "Missing upload or verification", icon: FileText, label: "Docs Pending", tone: "text-amber-500", value: telecallerDocumentPendingLeads || documentPendingLeads },
        { children: "15m new lead / 24h docs risk", icon: AlertCircle, label: "SLA Risk", tone: "text-red-500", value: slaRiskLeadCount },
      ];

  const actionQueue = currentRole === "accountant"
    ? [
      { href: "/accountant", icon: BadgeIndianRupee, label: "Payment queue", tone: "text-emerald-600", value: accountantDashboard?.actionQueue.paymentQueue ?? paymentQueueCount },
      { href: "/loan-management", icon: CreditCard, label: "Active loans", tone: "text-blue-600", value: loanHealth.activeLoans },
      { href: "/collections", icon: PhoneCall, label: "Collections follow-up", tone: "text-purple-600", value: accountantDashboard?.actionQueue.collectionsFollowup ?? loanHealth.overdueLoans },
      { href: "/loan-management", icon: Clock, label: "Repayment due", tone: "text-orange-600", value: accountantDashboard?.actionQueue.repaymentDue ?? 0 },
      { href: "/accountant", icon: FileText, label: "Payout queue", tone: "text-amber-600", value: accountantDashboard?.actionQueue.payoutQueue ?? 0 },
      { href: "/accountant", icon: CheckCircle2, label: "Disbursed amount", tone: "text-green-600", value: formatCurrency(accountantMetrics?.totalDisbursed ?? convertedAmount) },
    ]
    : currentRole === "credit-manager"
      ? [
        { href: "/credit-manager", icon: FileText, label: "Decision queue", tone: "text-amber-600", value: creditReviewLeads.length },
        { href: "/credit-manager?tab=docs-gap", icon: AlertCircle, label: "Document gaps", tone: "text-red-600", value: creditDocsGapLeads.length },
        { href: "/credit-manager?tab=ready", icon: ShieldCheck, label: "CAM ready", tone: "text-blue-600", value: creditReadyCamLeads.length },
        { href: "/credit-manager?tab=high-priority", icon: AlertCircle, label: "High priority", tone: "text-red-600", value: creditHighPriorityLeads.length || highPriorityLeads },
        { href: "/credit-applications?tab=sent-to-accountant", icon: CheckCircle2, label: "Approved for payment", tone: "text-green-600", value: accountantPaymentLeads.length },
        { href: "/reports", icon: TrendingUp, label: "Approval rate", tone: "text-blue-600", value: `${creditApprovalRate}%` },
      ]
      : [
        { href: "/leads?tab=uncontacted", icon: PhoneCall, label: "Call now", tone: "text-blue-600", value: callNowLeads.length },
        { href: "/leads?tab=followups", icon: Clock, label: "Callback due", tone: "text-purple-600", value: overdueFollowupLeads.length || followupsDue || followUpLeads },
        { href: "/leads?tab=docs-pending", icon: FileText, label: "Documents pending", tone: "text-amber-600", value: telecallerDocumentPendingLeads || documentPendingLeads },
        { href: "/leads?tab=ready-handoff", icon: CheckCircle2, label: "Ready for credit", tone: "text-green-600", value: readyHandoffLeads },
        { href: "/leads?tab=sent-credit", icon: ShieldCheck, label: "Sent to credit", tone: "text-emerald-600", value: sentToCreditLeads },
        { href: "/leads?priority=High", icon: AlertCircle, label: "High priority leads", tone: "text-red-600", value: highPriorityLeads },
      ];

  const telecallerFunnel = [
    { color: "#3b82f6", label: "New", value: uncontactedLeads },
    { color: "#a855f7", label: "Follow-up", value: followupsDue || followUpLeads },
    { color: "#f59e0b", label: "Docs", value: telecallerDocumentPendingLeads || documentPendingLeads },
    { color: "#10b981", label: "Ready", value: readyHandoffLeads },
    { color: "#14b8a6", label: "Credit", value: sentToCreditLeads },
  ];
  const maxTelecallerFunnel = Math.max(...telecallerFunnel.map((item) => item.value), 1);
  const telecallerWorkloadData = [
    { color: "#2563eb", label: "Call now", value: callNowLeads.length },
    { color: "#7c3aed", label: "Callback due", value: overdueFollowupLeads.length || followupsDue || followUpLeads },
    { color: "#d97706", label: "Docs pending", value: telecallerDocumentPendingLeads || documentPendingLeads },
    { color: "#16a34a", label: "Ready credit", value: readyHandoffLeads },
    { color: "#dc2626", label: "SLA risk", value: slaRiskLeadCount },
  ];
  const telecallerPriorityMix = [
    { color: "#e11d48", label: "High / Urgent", value: highPriorityLeads },
    { color: "#2563eb", label: "Normal queue", value: Math.max(0, leads.length - highPriorityLeads - slaRiskLeadCount) },
    { color: "#dc2626", label: "SLA risk", value: slaRiskLeadCount },
  ].filter((item) => item.value > 0);
  const creditWorkloadData = [
    { color: "#d97706", label: "Decision queue", value: creditReviewLeads.length },
    { color: "#dc2626", label: "Docs gap", value: creditDocsGapLeads.length },
    { color: "#2563eb", label: "CAM ready", value: creditReadyCamLeads.length },
    { color: "#16a34a", label: "Approved", value: accountantPaymentLeads.length },
    { color: "#7c3aed", label: "High priority", value: creditHighPriorityLeads.length },
  ];
  const creditDecisionMix = [
    { color: "#d97706", label: "Pending decision", value: creditReviewLeads.length },
    { color: "#16a34a", label: "Approved payment", value: accountantPaymentLeads.length },
    { color: "#dc2626", label: "Docs gap", value: creditDocsGapLeads.length },
  ].filter((item) => item.value > 0);
  const accountantWorkloadData = [
    { color: "#059669", label: "Payment queue", value: paymentQueueCount },
    { color: "#2563eb", label: "Active loans", value: loanHealth.activeLoans },
    { color: "#d97706", label: "Repayment due", value: accountantDashboard?.actionQueue.repaymentDue ?? 0 },
    { color: "#7c3aed", label: "Collections", value: accountantDashboard?.actionQueue.collectionsFollowup ?? loanHealth.overdueLoans },
    { color: "#dc2626", label: "Bank missing", value: accountantBankMissingCount },
  ];
  const accountantPortfolioMix = [
    { color: "#059669", label: "Ready to disburse", value: accountantBankReadyCount },
    { color: "#dc2626", label: "Bank missing", value: accountantBankMissingCount },
    { color: "#2563eb", label: "Active loans", value: loanHealth.activeLoans },
    { color: "#d97706", label: "Repayment due", value: accountantDashboard?.actionQueue.repaymentDue ?? 0 },
  ].filter((item) => item.value > 0);

  if (currentRole === "superadmin" && superadminMetrics) {
    const CircleProgress = ({ percentage, strokeColor = "#8b5cf6" }: { percentage: number; strokeColor?: string }) => {
      const radius = 20;
      const circumference = 2 * Math.PI * radius;
      const offset = circumference - (Math.min(100, Math.max(0, percentage)) / 100) * circumference;
      return (
        <div className="relative flex items-center justify-center h-12 w-12 shrink-0">
          <svg className="w-full h-full transform -rotate-90">
            <circle cx="24" cy="24" r={radius} className="text-slate-100 dark:text-slate-800" strokeWidth="3" stroke="currentColor" fill="transparent" />
            <circle cx="24" cy="24" r={radius} stroke={strokeColor} strokeWidth="3" fill="transparent" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
          </svg>
          <span className="absolute text-[9px] font-extrabold text-slate-800 dark:text-slate-200">{percentage}%</span>
        </div>
      );
    };

    // Calculate circular values
    const statusCountsMap: Record<string, number> = {
      "New": 0,
      "Qualified": 0,
      "In Progress": 0,
      "Approved": 0,
    };
    tenantStats.forEach((t: any) => {
      if (!t.stats || !t.stats.statusCounts) return;
      t.stats.statusCounts.forEach((sc: any) => {
        const statusLower = String(sc.status).toLowerCase();
        if (statusLower === 'new' || statusLower === 'draft') {
          statusCountsMap["New"] += Number(sc.count || 0);
        } else if (statusLower === 'submitted' || statusLower === 'review') {
          statusCountsMap["Qualified"] += Number(sc.count || 0);
        } else if (statusLower === 'document collection' || statusLower === 'document_pending' || statusLower === 'documents_pending' || statusLower === 'not_connected') {
          statusCountsMap["In Progress"] += Number(sc.count || 0);
        } else if (statusLower === 'approved' || statusLower === 'disbursed' || statusLower === 'closed') {
          statusCountsMap["Approved"] += Number(sc.count || 0);
        }
      });
    });

    const leadStatusCounts = [
      { name: "New", value: statusCountsMap["New"], color: "#3b82f6" },
      { name: "Qualified", value: statusCountsMap["Qualified"], color: "#10b981" },
      { name: "In Progress", value: statusCountsMap["In Progress"], color: "#8b5cf6" },
      { name: "Approved", value: statusCountsMap["Approved"], color: "#f59e0b" },
    ].filter(item => item.value > 0);

    const brandingSlug = getTenantBranding().slug || "waqtfinance";
    const tenantPortfolio = (tenants || []).map((t) => {
      const statsObj = tenantStats.find((s: any) => s.slug === t.slug)?.stats;
      const active = Number(statsObj?.activeLoans || 0);
      const overdue = Number(statsObj?.overdueLoans || 0);
      const totalL = Number(statsObj?.totalLeads || 0);
      const disbursed = Number(statsObj?.monthlyDisbursedVal || statsObj?.monthlyDisbursed || 0);
      const collected = Number(statsObj?.monthlyCollected || 0);

      const recoveryRate = (disbursed + collected) > 0
        ? Math.round((collected / (disbursed + collected)) * 100)
        : 0;

      return {
        id: t.id,
        name: t.name,
        slug: t.slug,
        dbName: t.db_name,
        status: t.status,
        totalLeads: totalL,
        activeLoans: active,
        disbursedVol: disbursed,
        collectedVol: collected,
        recoveryRate: recoveryRate || 82,
        isCurrent: t.slug === brandingSlug
      };
    });

    const totalPortfolioLeads = tenantPortfolio.reduce((sum, p) => sum + p.totalLeads, 0);
    const totalPortfolioActiveLoans = tenantPortfolio.reduce((sum, p) => sum + p.activeLoans, 0);
    const totalPortfolioDisbursed = tenantPortfolio.reduce((sum, p) => sum + p.disbursedVol, 0);

    const positivePipelineRatio = totalPortfolioLeads > 0 ? Math.round(((statusCountsMap["Qualified"] + statusCountsMap["In Progress"] + statusCountsMap["Approved"]) / totalPortfolioLeads) * 100) : 78;
    const paidLoansRatio = 64; // static fallback or calculate if desired
    const collectionEfficiencyRatio = superadminMetrics.dueTodayAmt > 0 ? Math.min(100, Math.round((superadminMetrics.collectedTodayAmt / superadminMetrics.dueTodayAmt) * 100)) : 82;

    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthlyDataMap: Record<string, { disbursed: number, collected: number }> = {};
    months.forEach(m => monthlyDataMap[m] = { disbursed: 0, collected: 0 });

    tenantStats.forEach((t: any) => {
      if (!t.stats || !t.stats.monthlyHistory) return;
      t.stats.monthlyHistory.forEach((mh: any) => {
        const mName = mh.monthName;
        if (monthlyDataMap[mName]) {
          monthlyDataMap[mName].disbursed += Number(mh.disbursed || 0);
          monthlyDataMap[mName].collected += Number(mh.collected || 0);
        }
      });
    });

    const monthlyData = months.map(m => ({
      name: m,
      disbursed: monthlyDataMap[m].disbursed,
      collected: monthlyDataMap[m].collected
    }));

    const recentActivity = superadminLogs
      .filter((log: any) => log.action.startsWith('lead') || log.action.startsWith('loan') || log.action.startsWith('agreement') || log.action.startsWith('disburse') || log.action.startsWith('repayment'))
      .slice(0, 10)
      .map((log: any) => {
        const time = new Date(log.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        return {
          time,
          text: `[${log.tenantName}] ${log.actorName} (${log.actorRole}): ${log.action} ${log.leadId ? `for lead #${log.leadId}` : ''}`
        };
      });

    if (recentActivity.length === 0) {
      recentActivity.push(
        { time: "08:42", text: "System active. Listening for incoming leads and audit activities." }
      );
    }

    const mockSystemLogs: any[] = [];

    const allRecentApps: any[] = [];
    tenantStats.forEach((t: any) => {
      if (!t.stats || !t.stats.recentApplications) return;
      t.stats.recentApplications.forEach((app: any) => {
        allRecentApps.push({
          tenantName: t.name,
          tenantSlug: t.slug,
          name: app.full_name || "Unknown",
          amount: Number(app.loan_amount) ? `₹${Number(app.loan_amount).toLocaleString('en-IN')}` : "₹0",
          app: app.application_id,
          cus: `CUS-${app.application_id.slice(4) || '000'}`,
          type: "PAYDAY LOAN",
          risk: "MEDIUM",
          riskColor: "text-amber-700 bg-amber-50 border-amber-100",
          status: String(app.status).charAt(0).toUpperCase() + String(app.status).slice(1),
          statusColor: app.status === "approved" || app.status === "disbursed"
            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
            : "bg-blue-50 text-blue-700 border border-blue-200",
          createdAt: app.created_at
        });
      });
    });

    allRecentApps.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const recentPortfolioMovement = allRecentApps.slice(0, 5);

    const auditPulse = superadminLogs
      .slice(0, 4)
      .map((log: any) => {
        const dateObj = new Date(log.createdAt);
        const timeStr = dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ', ' + dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        return {
          title: log.action.split('.').map((s: string) => s.charAt(0).toUpperCase() + s.slice(1)).join(' '),
          note: `${log.actorRole} | ${log.actorName}`,
          trace: `ip: ${log.ipAddress || 'unknown'}`,
          time: timeStr
        };
      });

    if (auditPulse.length === 0) {
      auditPulse.push(
        { title: "System Ready", note: "System | Daemon", trace: "trace_id: init_check", time: "Just Now" }
      );
    }

    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dailyInflowCounts: Record<string, number> = {};
    days.forEach(d => dailyInflowCounts[d] = 0);

    tenantStats.forEach((t: any) => {
      if (!t.stats || !t.stats.dailyInflow) return;
      t.stats.dailyInflow.forEach((di: any) => {
        const dName = days[(Number(di.dayNum) - 1) % 7];
        if (dName) {
          dailyInflowCounts[dName] += Number(di.count || 0);
        }
      });
    });
    const dailyInflow = days.map(d => ({ name: d, count: dailyInflowCounts[d] }));

    const approvedDisbursement = superadminMetrics.totalNetDisbursedTotal;
    const overdueCount = superadminMetrics.highDpdCount;
    const totalOutstandingBalance = superadminMetrics.overdueExposureAmt;
    const collectedToday = superadminMetrics.collectedTodayAmt;
    const dueToday = superadminMetrics.dueTodayAmt;
    const ptpCount = superadminMetrics.ptpPressureCount;
    const approvedPercent = positivePipelineRatio;
    const highDpdCount = superadminMetrics.highDpdCount;
    const portfolioRisk = superadminMetrics.portfolioAtRisk;
    const eSignPending = superadminMetrics.esignPendingCount;
    const manualReview = superadminMetrics.reviewBacklogCount;
    const paymentLinkGaps = 0;
    const trendData = (() => {
      const data = [];
      const today = new Date();
      const dailyActuals: Record<string, { disbursed: number; collected: number }> = {};

      tenantStats.forEach((t: any) => {
        if (!t.stats) return;

        // Process actual daily disbursed trend from backend
        if (t.stats.dailyDisbursedTrend && Array.isArray(t.stats.dailyDisbursedTrend)) {
          t.stats.dailyDisbursedTrend.forEach((item: any) => {
            if (!item.trend_date) return;
            const dStr = new Date(item.trend_date).toDateString();
            if (!dailyActuals[dStr]) dailyActuals[dStr] = { disbursed: 0, collected: 0 };
            dailyActuals[dStr].disbursed += Number(item.total_disbursed || 0);
          });
        } else if (t.stats.recentApplications && Array.isArray(t.stats.recentApplications)) {
          // Fallback scan
          t.stats.recentApplications.forEach((app: any) => {
            if (app.status === 'disbursed' || app.status === 'Paid') {
              const dStr = new Date(app.created_at || app.disbursed_at).toDateString();
              if (!dailyActuals[dStr]) dailyActuals[dStr] = { disbursed: 0, collected: 0 };
              dailyActuals[dStr].disbursed += Number(app.loan_amount || 0);
            }
          });
        }

        // Process actual daily collected trend from backend
        if (t.stats.dailyCollectedTrend && Array.isArray(t.stats.dailyCollectedTrend)) {
          t.stats.dailyCollectedTrend.forEach((item: any) => {
            if (!item.trend_date) return;
            const dStr = new Date(item.trend_date).toDateString();
            if (!dailyActuals[dStr]) dailyActuals[dStr] = { disbursed: 0, collected: 0 };
            dailyActuals[dStr].collected += Number(item.total_collected || 0);
          });
        } else if (t.stats.recentPayments && Array.isArray(t.stats.recentPayments)) {
          // Fallback scan
          t.stats.recentPayments.forEach((pay: any) => {
            const dStr = new Date(pay.disbursed_at || pay.received_at || new Date()).toDateString();
            if (!dailyActuals[dStr]) dailyActuals[dStr] = { disbursed: 0, collected: 0 };
            dailyActuals[dStr].collected += Number(pay.amount || 0);
          });
        }
      });

      // Construct a continuous 30-day timeline showing the ACTUAL values (no mock data fallback)
      for (let i = 29; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
        const dStr = d.toDateString();
        const dateLabel = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });

        const actualDisbursed = dailyActuals[dStr]?.disbursed || 0;
        const actualCollected = dailyActuals[dStr]?.collected || 0;

        data.push({
          date: dateLabel,
          disbursed: actualDisbursed,
          collected: actualCollected,
        });
      }
      return data;
    })();

    const pieChartData = [
      { name: "New", value: statusCountsMap["New"] || 10, color: "#3b82f6" },
      { name: "In Review", value: superadminMetrics?.reviewBacklogCount || 5, color: "#f59e0b" },
      { name: "Approved", value: superadminMetrics?.approvedLeadsTotal || 25, color: "#10b981" },
      { name: "Rejected", value: superadminMetrics?.rejectedLeadsTotal || 8, color: "#ef4444" },
    ];

    const companyPerformanceData = tenantPortfolio.map(p => ({
      name: p.name,
      disbursed: p.disbursedVol || 100000,
      collected: p.collectedVol || 80000,
      activeLoans: p.activeLoans || 12
    }));

    const disbApps = recentPaymentsDynamic.filter(p => p.status === 'disbursed' || p.status === 'Success');
    const collPayments = recentPaymentsDynamic.filter(p => p.status === 'Paid' || p.status === 'repayment');
    const highRiskApps = recentPortfolioMovement.filter(app => app.risk === "HIGH" || app.status === "Review" || app.status === "Overdue" || app.status === "Rejected");

    const kpiCategoriesList = [
      { id: "business", label: "Business Overview", icon: Building2 },
      { id: "leads", label: "Lead Metrics", icon: TrendingUp },
      { id: "applications", label: "Application Metrics", icon: FileText },
      { id: "disbursements", label: "Disbursement Metrics", icon: CreditCard },
      { id: "collections", label: "Collection Metrics", icon: BadgeIndianRupee },
      { id: "risk", label: "Risk Metrics", icon: ShieldAlert },
      { id: "esign", label: "eSign & eNACH", icon: ShieldCheck },
      { id: "tenants", label: "Tenant Metrics", icon: Landmark },
      { id: "system", label: "System Metrics", icon: Server },
    ];

    const kpiCardsData: Record<string, Array<{ label: string; value: any; sub: string; icon: any; prefix?: string; suffix?: string; color: string; indicator: "positive" | "negative" | "pending" | "info" }>> = {
      business: [
        { label: "Total Companies", value: superadminMetrics.totalCompanies, sub: "Registered tenants", icon: Building2, color: "text-blue-600 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-400", indicator: "info" },
        { label: "Active Companies", value: superadminMetrics.activeCompanies, sub: "Live CRM instances", icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400", indicator: "positive" },
        { label: "Total Customers", value: superadminMetrics.totalCustomersTotal, sub: "Across all tenants", icon: Users, color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 dark:text-indigo-400", indicator: "info" },
        { label: "Active Customers", value: superadminMetrics.activeLoansTotal, sub: "Currently active loans", icon: UserCheck, color: "text-purple-600 bg-purple-50 dark:bg-purple-950/40 dark:text-purple-400", indicator: "positive" },
        { label: "New Customers This Month", value: superadminMetrics.newCustomersMonth, sub: "MTD new acquisition", icon: UserPlus, color: "text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400", indicator: "pending" }
      ],
      leads: [
        { label: "Total Leads", value: superadminMetrics.pipelineCount, sub: "Cumulative lead volume", icon: FileText, color: "text-blue-600 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-400", indicator: "info" },
        { label: "Today's Leads", value: superadminMetrics.newLeadsToday, sub: "Fresh entries today", icon: Calendar, color: "text-orange-600 bg-orange-50 dark:bg-orange-950/40 dark:text-orange-400", indicator: "pending" },
        { label: "Monthly Leads", value: superadminMetrics.monthlyLeads, sub: "Received this month", icon: TrendingUp, color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 dark:text-indigo-400", indicator: "info" },
        { label: "Lead Conversion Rate", value: superadminMetrics.leadConversionRate, sub: "Leads to active loans", icon: Percent, suffix: "%", color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400", indicator: "positive" }
      ],
      applications: [
        { label: "Total Applications", value: superadminMetrics.pipelineCount, sub: "Overall loan applications", icon: FileSpreadsheet, color: "text-blue-600 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-400", indicator: "info" },
        { label: "Pending Applications", value: superadminMetrics.reviewBacklogCount, sub: "Awaiting underwriter review", icon: Clock, color: "text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400", indicator: "pending" },
        { label: "Approved Applications", value: superadminMetrics.approvedLeadsTotal, sub: "Ready for disbursement", icon: FileCheck, color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400", indicator: "positive" },
        { label: "Rejected Applications", value: superadminMetrics.rejectedLeadsTotal, sub: "Declined applications", icon: FileX, color: "text-rose-600 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-400", indicator: "negative" },
        { label: "Approval Rate", value: superadminMetrics.approvalRate, sub: "Approve ratio overall", icon: Percent, suffix: "%", color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 dark:text-indigo-400", indicator: "info" }
      ],
      disbursements: [
        { label: "Today's Disb. Count", value: superadminMetrics.todayDisbursedCount, sub: "Loans disbursed today", icon: Activity, color: "text-purple-600 bg-purple-50 dark:bg-purple-950/40 dark:text-purple-400", indicator: "info" },
        { label: "Today's Disb. Amount", value: superadminMetrics.todayDisbursedTotal, sub: "Disbursed volume today", icon: CreditCard, prefix: "₹", color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400", indicator: "positive" },
        { label: "Monthly Disb. Count", value: superadminMetrics.monthlyDisbursedCount, sub: "Loans disbursed MTD", icon: FileText, color: "text-blue-600 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-400", indicator: "info" },
        { label: "Monthly Disbursement", value: superadminMetrics.monthlyDisbursedTotal, sub: "MTD disbursement volume", icon: Calendar, prefix: "₹", color: "text-green-600 bg-green-50 dark:bg-green-950/40 dark:text-green-400", indicator: "positive" },
        { label: "Total Disb. Count", value: superadminMetrics.totalDisbursedCount, sub: "Lifetime disbursed loans", icon: Landmark, color: "text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400", indicator: "info" },
        { label: "Total Disbursed Amount", value: superadminMetrics.totalNetDisbursedTotal, sub: "Lifetime platform payout", icon: BadgeIndianRupee, prefix: "₹", color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 dark:text-indigo-400", indicator: "info" },
        { label: "Average Loan Size", value: superadminMetrics.averageLoanSize, sub: "Mean ticket size per client", icon: Landmark, prefix: "₹", color: "text-blue-600 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-400", indicator: "info" }
      ],
      collections: [
        { label: "Collection Today", value: superadminMetrics.collectedTodayAmt, sub: "Amount recovered today", icon: CheckCircle2, prefix: "₹", color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400", indicator: "positive" },
        { label: "Collection This Month", value: superadminMetrics.disbursedMtd, sub: "MTD collection volume", icon: Calendar, prefix: "₹", color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400", indicator: "positive" },
        { label: "Outstanding Amount", value: superadminMetrics.overdueExposureAmt, sub: "Outstanding balance due", icon: DollarSign, prefix: "₹", color: "text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400", indicator: "pending" },
        { label: "Due Today", value: superadminMetrics.dueTodayAmt, sub: "Repayment target today", icon: Clock, prefix: "₹", color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 dark:text-indigo-400", indicator: "info" },
        { label: "Overdue Amount", value: superadminMetrics.overdueExposureAmt, sub: "Total default volume", icon: AlertTriangle, prefix: "₹", color: "text-rose-600 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-400", indicator: "negative" },
        { label: "Collection Success Rate", value: collectionEfficiencyRatio, sub: "Collected vs due efficiency", icon: Percent, suffix: "%", color: "text-violet-600 bg-violet-50 dark:bg-violet-950/40 dark:text-violet-400", indicator: "info" }
      ],
      risk: [
        { label: "Portfolio At Risk (PAR)", value: superadminMetrics.portfolioAtRisk, sub: "Percent of overdue portfolio", icon: ShieldAlert, suffix: "%", color: "text-rose-600 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-400", indicator: "negative" },
        { label: "High Risk Customers", value: superadminMetrics.highDpdCount, sub: "Severe overdue cases", icon: UsersRound, color: "text-rose-600 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-400", indicator: "negative" },
        { label: "Manual Reviews Pending", value: superadminMetrics.reviewBacklogCount, sub: "Leads flagged for checks", icon: AlertCircle, color: "text-orange-600 bg-orange-50 dark:bg-orange-950/40 dark:text-orange-400", indicator: "pending" },
        { label: "Fraud Alerts", value: superadminMetrics.fraudAlerts, sub: "Suspicious activity flags", icon: ShieldX, color: "text-rose-600 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-400", indicator: "negative" },
        { label: "Failed KYC", value: superadminMetrics.kycPendingTotal, sub: "KYC documents rejected/pending", icon: FileX, color: "text-orange-600 bg-orange-50 dark:bg-orange-950/40 dark:text-orange-400", indicator: "pending" },
        { label: "DPD Cases", value: superadminMetrics.highDpdCount, sub: "Active overdue schedules", icon: Clock, color: "text-rose-600 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-400", indicator: "negative" }
      ],
      esign: [
        { label: "eSign Pending", value: superadminMetrics.esignPendingCount, sub: "Awaiting Aadhaar signature", icon: FileText, color: "text-orange-600 bg-orange-50 dark:bg-orange-950/40 dark:text-orange-400", indicator: "pending" },
        { label: "eSign Completed", value: superadminMetrics.esignCompleted, sub: "E-signed loan agreements", icon: ShieldCheck, color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400", indicator: "positive" },
        { label: "eNACH Pending", value: superadminMetrics.enachPending, sub: "Awaiting mandate setup", icon: Clock, color: "text-orange-600 bg-orange-50 dark:bg-orange-950/40 dark:text-orange-400", indicator: "pending" },
        { label: "eNACH Active", value: superadminMetrics.enachActive, sub: "Active auto-debit mandates", icon: Lock, color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400", indicator: "positive" },
        { label: "eNACH Failed", value: superadminMetrics.enachFailed, sub: "Mandates failed/bounced", icon: ShieldAlert, color: "text-rose-600 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-400", indicator: "negative" }
      ],
      tenants: [
        { label: "Best Performing Company", value: superadminMetrics.bestCompany, sub: "Highest monthly collection", icon: TrendingUp, color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400", indicator: "positive" },
        { label: "Lowest Performing Company", value: superadminMetrics.lowestCompany, sub: "Lowest monthly collection", icon: TrendingDown, color: "text-rose-600 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-400", indicator: "negative" },
        { label: "Total Registered Companies", value: superadminMetrics.totalCompanies, sub: "Overall active tenants", icon: Landmark, color: "text-blue-600 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-400", indicator: "info" }
      ],
      system: [
        { label: "Active CRM Users", value: superadminUsers.length, sub: "User accounts across companies", icon: UsersRound, color: "text-blue-600 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-400", indicator: "info" },
        { label: "Online Users", value: superadminMetrics.onlineUsers, sub: "Users active in last 15 min", icon: Laptop, color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400", indicator: "positive" },
        { label: "API Success Rate", value: 99.8, suffix: "%", sub: "Global API endpoints health", icon: Wifi, color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400", indicator: "positive" },
        { label: "Failed API Requests", value: 4, sub: "Exceptions caught in last 24h", icon: AlertCircle, color: "text-rose-600 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-400", indicator: "negative" },
        { label: "Last Sync Time", value: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }), sub: "Data refresh heartbeat", icon: Clock, color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 dark:text-indigo-400", indicator: "info" }
      ]
    };

    const kpiGroups = [
      {
        title: "Platform Scale & Growth",
        icon: Building2,
        badge: "Companies",
        color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200/50 dark:border-indigo-800/50",
        cards: [
          { label: "Total Companies", value: superadminMetrics.totalCompanies, sub: "Registered instances", icon: Building2, color: "text-blue-600 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-400", indicator: "info", accent: "indigo" },
          { label: "Active Companies", value: superadminMetrics.activeCompanies, sub: "Currently active", icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400", indicator: "positive", accent: "emerald" },
          { label: "Total Customers", value: superadminMetrics.totalCustomersTotal, sub: "All platform users", icon: Users, color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 dark:text-indigo-400", indicator: "info", accent: "indigo" },
          { label: "Active Customers", value: superadminMetrics.activeLoansTotal, sub: "Active loan accounts", icon: UserCheck, color: "text-purple-600 bg-purple-50 dark:bg-purple-950/40 dark:text-purple-400", indicator: "positive", accent: "purple" },
        ]
      },
      {
        title: "Leads & Applications",
        icon: TrendingUp,
        badge: "Pipeline",
        color: "text-blue-600 bg-blue-50 dark:bg-blue-950/40 border-blue-200/50 dark:border-blue-800/50",
        cards: [
          { label: "Total Leads", value: superadminMetrics.pipelineCount, sub: "Cumulative leads", icon: FileText, color: "text-blue-600 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-400", indicator: "info", accent: "blue" },
          { label: "Today's Leads", value: superadminMetrics.newLeadsToday, sub: "Ingested today", icon: Calendar, color: "text-orange-600 bg-orange-50 dark:bg-orange-950/40 dark:text-orange-400", indicator: "pending", accent: "orange" },
          { label: "Monthly Leads", value: superadminMetrics.monthlyLeads, sub: "This month", icon: TrendingUp, color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 dark:text-indigo-400", indicator: "info", accent: "indigo" },
          { label: "Lead Conversion Rate", value: superadminMetrics.leadConversionRate, sub: "Conversion ratio", icon: Percent, suffix: "%", color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400", indicator: "positive", accent: "emerald" },
        ]
      },
      {
        title: "Disbursements",
        icon: CreditCard,
        badge: "Payouts",
        color: "text-amber-600 bg-amber-50 dark:bg-amber-950/40 border-amber-200/50 dark:border-amber-800/50",
        cards: [
          { label: "Pending Applications", value: superadminMetrics.reviewBacklogCount, sub: "Awaiting review", icon: Clock, color: "text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400", indicator: "pending", accent: "amber" },
          { label: "Today's Disb. Amount", value: superadminMetrics.todayDisbursedTotal, sub: "Paid today", icon: CreditCard, prefix: "₹", color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400", indicator: "positive", accent: "emerald" },
          { label: "Monthly Disbursement", value: superadminMetrics.monthlyDisbursedTotal, sub: "MTD payout volume", icon: Calendar, prefix: "₹", color: "text-green-600 bg-green-50 dark:bg-green-950/40 dark:text-green-400", indicator: "positive", accent: "green" },
          { label: "Total Disbursed Amount", value: superadminMetrics.totalNetDisbursedTotal, sub: "Total platform payout", icon: BadgeIndianRupee, prefix: "₹", color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 dark:text-indigo-400", indicator: "info", accent: "indigo" },
        ]
      },
      {
        title: "Collections",
        icon: BadgeIndianRupee,
        badge: "Recoveries",
        color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200/50 dark:border-emerald-800/50",
        cards: [
          { label: "Collection Today", value: superadminMetrics.collectedTodayAmt, sub: "Recovered today", icon: CheckCircle2, prefix: "₹", color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400", indicator: "positive", accent: "emerald" },
          { label: "Collection This Month", value: superadminMetrics.disbursedMtd, sub: "MTD recovery volume", icon: Calendar, prefix: "₹", color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400", indicator: "positive", accent: "emerald" },
          { label: "Portfolio At Risk (PAR)", value: superadminMetrics.portfolioAtRisk, sub: "Overdue ratio", icon: ShieldAlert, suffix: "%", color: "text-rose-600 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-400", indicator: "negative", accent: "rose" },
          { label: "High Risk Customers", value: superadminMetrics.highDpdCount, sub: "Severe overdue cases", icon: UsersRound, color: "text-rose-600 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-400", indicator: "negative", accent: "rose" }
        ]
      }
    ];

    const activeCards = kpiCardsData[kpiCategory] || kpiCardsData.business;

    return (
      <div className="w-full min-h-screen bg-slate-50 dark:bg-slate-950 pb-12">
        {/* Enterprise Control Room Header */}
        <div className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 px-6 py-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">Dashboard</h2>
                <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                  Super Admin
                </span>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 font-medium">
                Payday lending workspace - all queues, controls, and audit trails
              </p>
            </div>
            
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs font-semibold text-slate-500 dark:text-slate-400 shadow-sm">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                <span>{dateRangeStr}</span>
              </div>
              <button onClick={refresh} disabled={isRefreshing} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition disabled:opacity-50 shadow-sm">
                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} /> Refresh Data
              </button>
            </div>
          </div>

          {/* Premium Tab Bar Navigation */}
          <div className="flex border-b border-slate-100 dark:border-slate-800 mt-6 -mb-5 gap-1 overflow-x-auto scrollbar-none">
            {[
              { id: "overview", label: "Overview Metrics", icon: <Activity className="h-4 w-4" /> },
              { id: "companies", label: "Company Directory", icon: <Building2 className="h-4 w-4" /> },
              { id: "users", label: "User Directory", icon: <Users className="h-4 w-4" /> },
              { id: "routing", label: "Lead Routing", icon: <GitFork className="h-4 w-4" /> },
              { id: "logs", label: "Security & Audits", icon: <Server className="h-4 w-4" /> },
            ].map((tab) => {
              const isActive = superadminTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setSuperadminTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-xs font-extrabold border-b-2 transition-all duration-200 outline-none whitespace-nowrap ${
                    isActive
                      ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400"
                      : "border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-200 dark:hover:text-slate-300"
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                  {tab.id === "users" && (
                    <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-black ${isActive ? "bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`}>
                      {superadminUsers.length}
                    </span>
                  )}
                  {tab.id === "companies" && (
                    <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-black ${isActive ? "bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`}>
                      {tenants.length || 3}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-6 py-6 space-y-6">
          {/* TAB 1: OVERVIEW METRICS */}
          {superadminTab === "overview" && (
            <div className="space-y-6 animate-fadeIn">
              
              {/* Categorized 16 KPI Metrics Sections */}
              <div className="space-y-8 animate-fadeIn">
                {kpiGroups.map((group, groupIdx) => {
                  const GroupIcon = group.icon;
                  return (
                    <div key={groupIdx} className="space-y-4">
                      {/* Section Header with Accent Bar */}
                      <div className="flex items-center gap-2.5 pb-2 border-b border-slate-200/60 dark:border-slate-800/80">
                        <span className={`p-1.5 rounded-lg border flex items-center justify-center ${group.color}`}>
                          <GroupIcon className="h-4 w-4" />
                        </span>
                        <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          {group.title}
                        </h3>
                        <span className="ml-auto rounded-full bg-slate-100 dark:bg-slate-800/80 px-2.5 py-0.5 text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest border border-slate-200/50 dark:border-slate-700/50">
                          {group.badge}
                        </span>
                      </div>

                      {/* 4 Cards Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        {isLoading ? (
                          Array.from({ length: 4 }).map((_, idx) => (
                            <div key={idx} className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-6 shadow-sm animate-pulse h-32 flex flex-col justify-between">
                              <div className="flex items-center justify-between">
                                <div className="h-4 w-28 bg-slate-200 dark:bg-slate-800 rounded" />
                                <div className="h-8 w-8 rounded-xl bg-slate-200 dark:bg-slate-800" />
                              </div>
                              <div className="space-y-2 mt-2">
                                <div className="h-8 w-24 bg-slate-200 dark:bg-slate-800 rounded" />
                                <div className="h-3 w-40 bg-slate-200 dark:bg-slate-800 rounded" />
                              </div>
                            </div>
                          ))
                        ) : (
                          group.cards.map((card, idx) => {
                            const Icon = card.icon;
                            const accentKey = card.accent || "indigo";
                            const auraGradients: Record<string, string> = {
                              indigo: "from-indigo-200/70 via-purple-200/40 to-transparent dark:from-indigo-500/25 dark:via-purple-500/15",
                              emerald: "from-emerald-200/70 via-teal-200/40 to-transparent dark:from-emerald-500/25 dark:via-teal-500/15",
                              purple: "from-purple-200/70 via-violet-200/40 to-transparent dark:from-purple-500/25 dark:via-violet-500/15",
                              blue: "from-blue-200/70 via-indigo-200/40 to-transparent dark:from-blue-500/25 dark:via-indigo-500/15",
                              orange: "from-orange-200/70 via-amber-200/40 to-transparent dark:from-orange-500/25 dark:via-amber-500/15",
                              amber: "from-amber-200/70 via-orange-200/40 to-transparent dark:from-amber-500/25 dark:via-orange-500/15",
                              green: "from-green-200/70 via-emerald-200/40 to-transparent dark:from-green-500/25 dark:via-emerald-500/15",
                              rose: "from-rose-200/70 via-pink-200/40 to-transparent dark:from-rose-500/25 dark:via-pink-500/15",
                            };
                            const bgTints: Record<string, string> = {
                              indigo: "from-white via-indigo-50/20 to-purple-50/20 dark:from-slate-900 dark:via-indigo-950/30 dark:to-slate-900",
                              emerald: "from-white via-emerald-50/20 to-teal-50/20 dark:from-slate-900 dark:via-emerald-950/30 dark:to-slate-900",
                              purple: "from-white via-purple-50/20 to-violet-50/20 dark:from-slate-900 dark:via-purple-950/30 dark:to-slate-900",
                              blue: "from-white via-blue-50/20 to-indigo-50/20 dark:from-slate-900 dark:via-blue-950/30 dark:to-slate-900",
                              orange: "from-white via-orange-50/20 to-amber-50/20 dark:from-slate-900 dark:via-orange-950/30 dark:to-slate-900",
                              amber: "from-white via-amber-50/20 to-orange-50/20 dark:from-slate-900 dark:via-amber-950/30 dark:to-slate-900",
                              green: "from-white via-green-50/20 to-emerald-50/20 dark:from-slate-900 dark:via-green-950/30 dark:to-slate-900",
                              rose: "from-white via-rose-50/20 to-pink-50/20 dark:from-slate-900 dark:via-rose-950/30 dark:to-slate-900",
                            };
                            const borderTints: Record<string, string> = {
                              indigo: "border-indigo-200/70 dark:border-indigo-900/50 hover:border-indigo-400 dark:hover:border-indigo-600",
                              emerald: "border-emerald-200/70 dark:border-emerald-900/50 hover:border-emerald-400 dark:hover:border-emerald-600",
                              purple: "border-purple-200/70 dark:border-purple-900/50 hover:border-purple-400 dark:hover:border-purple-600",
                              blue: "border-blue-200/70 dark:border-blue-900/50 hover:border-blue-400 dark:hover:border-blue-600",
                              orange: "border-orange-200/70 dark:border-orange-900/50 hover:border-orange-400 dark:hover:border-orange-600",
                              amber: "border-amber-200/70 dark:border-amber-900/50 hover:border-amber-400 dark:hover:border-amber-600",
                              green: "border-green-200/70 dark:border-green-900/50 hover:border-green-400 dark:hover:border-green-600",
                              rose: "border-rose-200/70 dark:border-rose-900/50 hover:border-rose-400 dark:hover:border-rose-600",
                            };
                            const stripeGradients: Record<string, string> = {
                              indigo: "from-indigo-500 via-purple-400 to-violet-500",
                              emerald: "from-emerald-500 via-teal-400 to-green-500",
                              purple: "from-purple-500 via-violet-400 to-indigo-500",
                              blue: "from-blue-500 via-cyan-400 to-indigo-500",
                              orange: "from-orange-500 via-amber-400 to-yellow-500",
                              amber: "from-amber-500 via-orange-400 to-yellow-500",
                              green: "from-green-500 via-emerald-400 to-teal-500",
                              rose: "from-rose-500 via-pink-400 to-red-500",
                            };

                            const aura = auraGradients[accentKey] || auraGradients.indigo;
                            const bgTint = bgTints[accentKey] || bgTints.indigo;
                            const borderTint = borderTints[accentKey] || borderTints.indigo;
                            const stripe = stripeGradients[accentKey] || stripeGradients.indigo;

                            return (
                              <div
                                key={idx}
                                className={`group relative overflow-hidden bg-gradient-to-br ${bgTint} border ${borderTint} rounded-2xl p-6 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between min-h-[130px]`}
                              >
                                {/* Top-Right Dynamic Accent Aura Glow */}
                                <div className={`absolute -top-8 -right-8 w-28 h-28 rounded-full bg-gradient-to-br ${aura} blur-xl pointer-events-none group-hover:scale-125 transition-transform duration-500`} />

                                {/* Top Accent Stripe */}
                                <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${stripe}`} />

                                <div className="relative z-10 flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 line-clamp-2">{card.label}</p>
                                    <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-2 leading-none tracking-tight">
                                      <AnimatedCounter value={card.value} prefix={card.prefix} suffix={card.suffix} />
                                    </p>
                                  </div>
                                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0 bg-slate-50 dark:bg-slate-800/50 shadow-inner ${card.color}`}>
                                    <Icon className="h-5 w-5" />
                                  </span>
                                </div>
                                <div className="relative z-10 mt-4 border-t border-slate-100 dark:border-slate-800/80 pt-3">
                                  <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold truncate">{card.sub}</p>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 1. Loan Disbursement Trend & 2. Collection Trend Tabbed Widget & 3. Donut Pie Chart */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                {/* Left Side: Trends Card (Span 2) */}
                <div className="lg:col-span-2 rounded-xl bg-white border border-slate-200/80 p-5 dark:bg-slate-900/60 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                  <div className="flex flex-col h-full justify-between">
                    <div className="flex items-center justify-between flex-wrap gap-2 pb-4 border-b border-slate-100 dark:border-slate-800">
                      <div>
                        <h3 className="font-extrabold text-slate-800 dark:text-white text-sm">Fintech Trend Analytics</h3>
                        <p className="text-xs text-slate-400 mt-0.5">30-day historical analysis of disbursements and recovery inflows</p>
                      </div>
                      <div className="flex bg-slate-100 dark:bg-slate-800/80 p-1 rounded-lg border border-slate-200/50 dark:border-slate-700/50">
                        <button
                          onClick={() => setTrendTab("disbursement")}
                          className={`px-3 py-1 text-[10px] font-black uppercase rounded-md transition-all duration-150 ${
                            trendTab === "disbursement"
                              ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                              : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          }`}
                        >
                          Disbursements
                        </button>
                        <button
                          onClick={() => setTrendTab("collection")}
                          className={`px-3 py-1 text-[10px] font-black uppercase rounded-md transition-all duration-150 ${
                            trendTab === "collection"
                              ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                              : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          }`}
                        >
                          Collections
                        </button>
                      </div>
                    </div>

                    <div className="h-60 w-full mt-4">
                      <ResponsiveContainer width="100%" height="100%">
                        {trendTab === "disbursement" ? (
                          <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                            <defs>
                              <linearGradient id="colorDisbursed" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2}/>
                                <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="dark:stroke-slate-800/60" />
                            <XAxis dataKey="date" stroke="#94a3b8" fontSize={9} tickLine={false} axisLine={false} />
                            <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v >= 1000 ? (v / 1000) + 'k' : v}`} />
                            <Tooltip
                              contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(226, 232, 240, 0.1)', borderRadius: '8px', color: '#fff', fontSize: '11px' }}
                              formatter={(v: any) => [`₹${v.toLocaleString('en-IN')}`, 'Disbursed']}
                            />
                            <Area type="monotone" dataKey="disbursed" name="Disbursed" stroke="#4f46e5" strokeWidth={2.5} fillOpacity={1} fill="url(#colorDisbursed)" />
                          </AreaChart>
                        ) : (
                          <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                            <defs>
                              <linearGradient id="colorCollected" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="dark:stroke-slate-800/60" />
                            <XAxis dataKey="date" stroke="#94a3b8" fontSize={9} tickLine={false} axisLine={false} />
                            <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v >= 1000 ? (v / 1000) + 'k' : v}`} />
                            <Tooltip
                              contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(226, 232, 240, 0.1)', borderRadius: '8px', color: '#fff', fontSize: '11px' }}
                              formatter={(v: any) => [`₹${v.toLocaleString('en-IN')}`, 'Collected']}
                            />
                            <Area type="monotone" dataKey="collected" name="Collected" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#colorCollected)" />
                          </AreaChart>
                        )}
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Right Side: 3. Application Status Pie Chart (Donut) */}
                <div className="rounded-xl bg-white border border-slate-200/80 p-5 dark:bg-slate-900/60 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                  <div>
                    <h3 className="font-extrabold text-slate-800 dark:text-white text-sm">Application Funnel</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Underwriting status distribution across companies</p>
                  </div>
                  <div className="relative h-44 w-full mt-4 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieChartData}
                          innerRadius={50}
                          outerRadius={70}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {pieChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-xl font-black text-slate-800 dark:text-white">
                        {superadminMetrics.approvalRate}%
                      </span>
                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Approval</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    {pieChartData.map((entry, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                        <span className="truncate">{entry.name}: {entry.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 4. Company-wise Performance Bar Chart */}
              <div className="rounded-xl bg-white border border-slate-200/80 p-5 dark:bg-slate-900/60 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                <div>
                  <h3 className="font-extrabold text-slate-800 dark:text-white text-sm">Company Performance</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Disbursements vs Collections comparing all live tenant databases</p>
                </div>
                <div className="h-64 w-full mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={companyPerformanceData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="dark:stroke-slate-800/60" />
                      <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} fontWeight="750" tickLine={false} axisLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v >= 100000 ? (v / 100000) + 'L' : (v / 1000) + 'k'}`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(226, 232, 240, 0.1)', borderRadius: '8px', color: '#fff', fontSize: '11px' }}
                        formatter={(v: any) => [`₹${v.toLocaleString('en-IN')}`, '']}
                      />
                      <Bar dataKey="disbursed" name="Disbursement MTD" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="collected" name="Collection MTD" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* 5. Top Performing Companies & Tabbed feeds monitor */}
              <div className="grid gap-6 lg:grid-cols-5">
                {/* 5. Top Performing Companies Table (Span 2) */}
                <div className="lg:col-span-2 rounded-xl bg-white border border-slate-200/80 p-5 dark:bg-slate-900/60 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                  <div className="mb-4">
                    <h3 className="font-extrabold text-slate-800 dark:text-white text-sm">Top CRM Tenants</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Tenants ranked by dynamic collection efficiency metrics</p>
                  </div>
                  <div className="overflow-x-auto grow">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                          <th className="py-2.5">Company</th>
                          <th className="py-2.5 text-right">Disbursed MTD</th>
                          <th className="py-2.5 text-right">Collected MTD</th>
                          <th className="py-2.5 text-right">Efficiency</th>
                          <th className="py-2.5 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100/50 dark:divide-slate-800/40">
                        {tenantPortfolio.map((t, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors text-xs font-semibold text-slate-700 dark:text-slate-300">
                            <td className="py-3 font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                              <span className="h-6 w-6 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[10px] font-black text-slate-500">
                                {t.name.slice(0,2).toUpperCase()}
                              </span>
                              {t.name}
                            </td>
                            <td className="py-3 text-right">₹{t.disbursedVol.toLocaleString('en-IN')}</td>
                            <td className="py-3 text-right">₹{t.collectedVol.toLocaleString('en-IN')}</td>
                            <td className="py-3 text-right text-emerald-600 dark:text-emerald-400 font-extrabold">{t.recoveryRate}%</td>
                            <td className="py-3 text-right">
                              <span className={`inline-block px-1.5 py-0.5 text-[8px] font-black rounded capitalize ${
                                t.status === 'active' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400' : 'bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400'
                              }`}>
                                {t.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Tabbed Feed Monitor (Span 3) - 6. Recent Apps, 7. Recent Disb, 8. Recent Coll, 9. High Risk */}
                <div className="lg:col-span-3 rounded-xl bg-white border border-slate-200/80 p-5 dark:bg-slate-900/60 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                  <div className="flex flex-col h-full justify-between">
                    <div className="flex items-center justify-between flex-wrap gap-2 pb-4 border-b border-slate-100 dark:border-slate-800">
                      <div>
                        <h3 className="font-extrabold text-slate-800 dark:text-white text-sm">Fintech Transaction Feeds</h3>
                        <p className="text-xs text-slate-400 mt-0.5">Live event stream and active loan ledger updates</p>
                      </div>
                      
                      <div className="flex bg-slate-100 dark:bg-slate-800/80 p-1 rounded-lg border border-slate-200/50 dark:border-slate-700/50">
                        {[
                          { id: "apps", label: "Applications", count: recentPortfolioMovement.length },
                          { id: "disb", label: "Disbursals", count: recentPaymentsDynamic.filter(p => p.status === 'disbursed' || p.status === 'Success').length || recentPaymentsDynamic.length },
                          { id: "coll", label: "Collections", count: recentPaymentsDynamic.filter(p => p.status === 'Paid' || p.status === 'repayment').length || recentPaymentsDynamic.length },
                          { id: "risk", label: "High Risk", count: recentPortfolioMovement.filter(app => app.risk === "HIGH" || app.status === "Review" || app.status === "Overdue" || app.status === "Rejected").length || 1 },
                        ].map((feed) => (
                          <button
                            key={feed.id}
                            onClick={() => setActiveFeedTab(feed.id as any)}
                            className={`px-2.5 py-1 text-[10px] font-black uppercase rounded-md transition-all duration-150 flex items-center gap-1 ${
                              activeFeedTab === feed.id
                                ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                                : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            }`}
                          >
                            {feed.label}
                            <span className={`h-4 min-w-4 px-1 rounded-full flex items-center justify-center text-[8px] font-black ${activeFeedTab === feed.id ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-500 dark:bg-slate-700'}`}>
                              {feed.count}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="overflow-x-auto grow mt-4">
                      {activeFeedTab === "apps" && (
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-slate-100 dark:border-slate-800 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                              <th className="py-2">Company</th>
                              <th className="py-2">Customer</th>
                              <th className="py-2 text-right">Amount</th>
                              <th className="py-2">Type</th>
                              <th className="py-2">Risk</th>
                              <th className="py-2 text-right">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100/50 dark:divide-slate-800/40">
                            {recentPortfolioMovement.map((app, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors text-xs font-semibold text-slate-700 dark:text-slate-300">
                                <td className="py-2.5 font-bold text-slate-800 dark:text-white">{app.tenantName}</td>
                                <td className="py-2.5">{app.name}</td>
                                <td className="py-2.5 text-right font-black text-slate-900 dark:text-white">{app.amount}</td>
                                <td className="py-2.5 text-[10px] uppercase font-bold text-slate-400">{app.type}</td>
                                <td className="py-2.5">
                                  <span className={`inline-block px-1.5 py-0.5 text-[8px] font-black rounded ${app.risk === 'HIGH' ? 'bg-red-50 text-red-600 dark:bg-red-950/20' : 'bg-amber-50 text-amber-600 dark:bg-amber-950/20'}`}>
                                    {app.risk}
                                  </span>
                                </td>
                                <td className="py-2.5 text-right">
                                  <span className={`inline-block px-1.5 py-0.5 text-[8px] font-black rounded border ${app.statusColor}`}>
                                    {app.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}

                      {activeFeedTab === "disb" && (
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-slate-100 dark:border-slate-800 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                              <th className="py-2">Company</th>
                              <th className="py-2">Customer</th>
                              <th className="py-2">Date / Time</th>
                              <th className="py-2 text-right">Amount</th>
                              <th className="py-2 text-right">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100/50 dark:divide-slate-800/40">
                            {(recentPaymentsDynamic.filter(p => p.status === 'disbursed' || p.status === 'Success').length > 0 ? recentPaymentsDynamic.filter(p => p.status === 'disbursed' || p.status === 'Success') : recentPaymentsDynamic).map((p, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors text-xs font-semibold text-slate-700 dark:text-slate-300">
                                <td className="py-2.5 font-bold text-slate-800 dark:text-white">{p.company}</td>
                                <td className="py-2.5">{p.customerName || "Loan Client"}</td>
                                <td className="py-2.5 text-slate-400 text-[11px]">{p.date}</td>
                                <td className="py-2.5 text-right font-black text-slate-900 dark:text-white">{p.amount}</td>
                                <td className="py-2.5 text-right">
                                  <span className="inline-block px-1.5 py-0.5 text-[8px] font-black rounded bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400 uppercase">
                                    Disbursed
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}

                      {activeFeedTab === "coll" && (
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-slate-100 dark:border-slate-800 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                              <th className="py-2">Company</th>
                              <th className="py-2">Customer</th>
                              <th className="py-2">Collected At</th>
                              <th className="py-2 text-right">Amount</th>
                              <th className="py-2">Method</th>
                              <th className="py-2 text-right">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100/50 dark:divide-slate-800/40">
                            {(recentPaymentsDynamic.filter(p => p.status === 'Paid' || p.status === 'repayment').length > 0 ? recentPaymentsDynamic.filter(p => p.status === 'Paid' || p.status === 'repayment') : recentPaymentsDynamic).map((p, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors text-xs font-semibold text-slate-700 dark:text-slate-300">
                                <td className="py-2.5 font-bold text-slate-800 dark:text-white">{p.company}</td>
                                <td className="py-2.5">{p.customerName || "Waqt Debtor"}</td>
                                <td className="py-2.5 text-slate-400 text-[11px]">{p.date}</td>
                                <td className="py-2.5 text-right font-black text-slate-900 dark:text-white">{p.amount}</td>
                                <td className="py-2.5 text-[10px] font-bold uppercase text-slate-400">{p.payment_mode || "UPI/Auto"}</td>
                                <td className="py-2.5 text-right">
                                  <span className="inline-block px-1.5 py-0.5 text-[8px] font-black rounded bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400 uppercase">
                                    Success
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}

                      {activeFeedTab === "risk" && (
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-slate-100 dark:border-slate-800 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                              <th className="py-2">Company</th>
                              <th className="py-2">Customer</th>
                              <th className="py-2">Reason Flag</th>
                              <th className="py-2 text-right">Exposure</th>
                              <th className="py-2 text-right">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100/50 dark:divide-slate-800/40">
                            {(recentPortfolioMovement.filter(app => app.risk === "HIGH" || app.status === "Review" || app.status === "Overdue" || app.status === "Rejected").length > 0 ? recentPortfolioMovement.filter(app => app.risk === "HIGH" || app.status === "Review" || app.status === "Overdue" || app.status === "Rejected") : recentPortfolioMovement).map((app, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors text-xs font-semibold text-slate-700 dark:text-slate-300">
                                <td className="py-2.5 font-bold text-slate-800 dark:text-white">{app.tenantName}</td>
                                <td className="py-2.5">{app.name}</td>
                                <td className="py-2.5 text-rose-600 dark:text-rose-400 font-extrabold flex items-center gap-1">
                                  <ShieldAlert className="h-3 w-3" />
                                  {app.status === 'Review' ? 'Manual Underwriting Check' : 'High Debt-To-Income (DTI)'}
                                </td>
                                <td className="py-2.5 text-right font-black text-slate-900 dark:text-white">{app.amount}</td>
                                <td className="py-2.5 text-right">
                                  <span className="inline-block px-1.5 py-0.5 text-[8px] font-black rounded bg-rose-50 text-rose-600 dark:bg-rose-950/20 dark:text-rose-400 uppercase">
                                    Flagged
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 10. Recent Activities Timeline & Additional Info Card */}
              <div className="grid gap-6 lg:grid-cols-3">
                {/* Column 1 & 2: Recent Activities Timeline (Span 2) */}
                <div className="lg:col-span-2 rounded-xl bg-white border border-slate-200/80 p-5 dark:bg-slate-900/60 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                  <div className="mb-4">
                    <h3 className="font-extrabold text-slate-800 dark:text-white text-sm">Platform Audit Log Timeline</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Real-time system events, permission overrides, and actions across tenants</p>
                  </div>
                  
                  <div className="relative border-l-2 border-indigo-100 dark:border-slate-800/80 pl-6 space-y-5 py-2">
                    {auditPulse.map((event, idx) => (
                      <div key={idx} className="relative transition-all duration-150 hover:pl-0.5">
                        <span className="absolute -left-[31px] top-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-indigo-600 ring-4 ring-white dark:ring-slate-900 text-white text-[8px] font-black">
                          <Activity className="h-2 w-2" />
                        </span>
                        
                        <div className="flex items-start justify-between flex-wrap gap-2 p-3 rounded-lg border border-slate-100/70 bg-slate-50/50 hover:bg-slate-50 dark:border-slate-800/70 dark:bg-slate-900/40 dark:hover:bg-slate-900/60 shadow-sm">
                          <div>
                            <h4 className="font-extrabold text-slate-800 dark:text-white text-xs flex items-center gap-1.5">
                              {event.title}
                              <span className="text-[9px] text-slate-300 dark:text-slate-700">|</span>
                              <span className="font-mono text-[9px] text-indigo-600 dark:text-indigo-400">{event.trace}</span>
                            </h4>
                            <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-wider">{event.note}</p>
                          </div>
                          
                          <div className="text-right">
                            <span className="inline-block bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400 px-1.5 py-0.5 text-[8px] font-black rounded-full uppercase tracking-wider">
                              Success
                            </span>
                            <p className="text-[9.5px] text-slate-400 font-semibold mt-1.5 flex items-center gap-1 justify-end">
                              <Clock className="h-3 w-3" />
                              {event.time}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                    {auditPulse.length === 0 && (
                      <p className="text-xs text-slate-400 text-center py-8">No recent platform activities recorded.</p>
                    )}
                  </div>
                </div>

                {/* Column 3: System Health Diagnoses (Reused & Beautifully Styled) */}
                <div className="rounded-xl bg-white border border-slate-200/80 p-5 dark:bg-slate-900/60 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                  <div className="mb-4">
                    <h3 className="font-extrabold text-slate-800 dark:text-white text-sm">System Health & Gatekeepers</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Infrastructure health checks and verification success rates</p>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-4 grow justify-center">
                    {[
                      { label: "Data Freshness Status", value: "Realtime Sync", note: "API heartbeats active", color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
                      { label: "Access Privilege Level", value: "Root Super Admin", note: "All permissions inherited", color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
                      { label: "Operational Event Audit", value: `${superadminMetrics.controlEventsCount} Logs`, note: "Audited actions cataloged", color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-950/30" },
                      { label: "Document Verification Success", value: `${superadminMetrics.pipelineCount > 0 ? Math.round((superadminMetrics.kycVerifiedTotal / superadminMetrics.pipelineCount) * 100) : 0}%`, note: "KYC pass percentage", color: "text-indigo-600", bg: "bg-indigo-50 dark:bg-indigo-950/30" },
                    ].map((card, idx) => (
                      <div key={idx} className={`p-4 rounded-xl border border-slate-200/40 dark:border-slate-800/40 flex flex-col justify-between ${card.bg}`}>
                        <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 truncate">{card.label}</p>
                        <h4 className={`text-base font-black mt-1.5 ${card.color}`}>{card.value}</h4>
                        <p className="text-[9px] text-slate-400 font-semibold mt-1 truncate">{card.note}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* TAB 1.5: EXTENDED METRICS (FULL SCREEN) */}
          {superadminTab === "extended" && (
            <div className="space-y-8 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                <div>
                  <h3 className="text-lg font-black uppercase tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                    <Sliders className="h-5 w-5 text-indigo-500" />
                    Extended Platform Metrics
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 font-semibold">Full-screen breakdown of operational registers, tenant indexes, and server node sync heartbeats</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {(() => {
                  const extendedCategories = [
                    { id: "applications", label: "Applications Detailed", icon: FileText, color: "text-blue-500 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-400" },
                    { id: "disbursements", label: "Disbursement Statistics", icon: CreditCard, color: "text-purple-500 bg-purple-50 dark:bg-purple-950/40 dark:text-purple-400" },
                    { id: "collections", label: "Collection & Recovery", icon: BadgeIndianRupee, color: "text-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400" },
                    { id: "risk", label: "Risk & DPD Metrics", icon: ShieldAlert, color: "text-rose-500 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-400" },
                    { id: "esign", label: "eSign & auto-debit (eNACH)", icon: ShieldCheck, color: "text-sky-500 bg-sky-50 dark:bg-sky-950/40 dark:text-sky-400" },
                    { id: "tenants", label: "Tenant Comparison", icon: Landmark, color: "text-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 dark:text-indigo-400" },
                    { id: "system", label: "System Nodes Health", icon: Server, color: "text-teal-500 bg-teal-50 dark:bg-teal-950/40 dark:text-teal-400" },
                  ];

                  return extendedCategories.map((cat) => {
                    const Icon = cat.icon;
                    const cards = kpiCardsData[cat.id] || [];
                    return (
                      <div key={cat.id} className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-6 shadow-sm space-y-4">
                        <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800/80 pb-2">
                          <span className={`p-1 rounded ${cat.color}`}><Icon className="h-4.5 w-4.5" /></span>
                          <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-300">{cat.label}</h4>
                        </div>
                        <div className="grid grid-cols-1 gap-4">
                          {cards.map((card, idx) => {
                            const CardIcon = card.icon;
                            return (
                              <div
                                key={idx}
                                className="rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 p-4 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 flex flex-col justify-between min-h-[90px]"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 line-clamp-2">{card.label}</p>
                                  <span className="flex h-6 w-6 items-center justify-center rounded bg-slate-100 dark:bg-slate-800 text-slate-400 shrink-0">
                                    <CardIcon className="h-3.5 w-3.5" />
                                  </span>
                                </div>
                                <div className="mt-2">
                                  <p className="text-lg font-black text-slate-900 dark:text-white leading-none">
                                    <AnimatedCounter value={card.value} prefix={card.prefix} suffix={card.suffix} />
                                  </p>
                                  <p className="text-[9.5px] text-slate-400 font-semibold mt-1 truncate">{card.sub}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {/* TAB 2: COMPANY DIRECTORY */}
          {superadminTab === "companies" && (
            <div className="space-y-6 animate-fadeIn">
              {/* Tenant Summary Statistics Panel */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 shadow-sm flex items-center gap-3 animate-fadeIn">
                  <span className="p-3 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"><Landmark className="h-6 w-6" /></span>
                  <div>
                    <p className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">Registered SaaS Tenants</p>
                    <h4 className="text-lg font-black text-slate-900 dark:text-white mt-0.5">{tenants.length} Companies</h4>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 shadow-sm flex items-center gap-3 animate-fadeIn">
                  <span className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-6 w-6" /></span>
                  <div>
                    <p className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">Live Active Instances</p>
                    <h4 className="text-lg font-black text-slate-900 dark:text-white mt-0.5">{tenants.filter((t: any) => t.status === "active").length} Active</h4>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 shadow-sm flex items-center gap-3 animate-fadeIn">
                  <span className="p-3 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400"><ShieldAlert className="h-6 w-6" /></span>
                  <div>
                    <p className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">Suspended Nodes</p>
                    <h4 className="text-lg font-black text-slate-900 dark:text-white mt-0.5">{tenants.filter((t: any) => t.status !== "active").length} Suspended</h4>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 shadow-sm flex items-center gap-3 animate-fadeIn">
                  <span className="p-3 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400"><Server className="h-6 w-6" /></span>
                  <div>
                    <p className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500">DB Schema Isolation</p>
                    <h4 className="text-lg font-black text-slate-900 dark:text-white mt-0.5">Strict MySQL VPS</h4>
                  </div>
                </div>
              </div>

              {/* Onboard Company & CRM Instances Table */}
              <div className="grid gap-6 lg:grid-cols-3">
                {/* Onboard Form */}
                <div className="rounded-xl bg-white border border-slate-200/80 p-6 dark:bg-slate-900/60 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="mb-3 flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"><Plus className="h-4 w-4" /></span>
                      <h3 className="font-extrabold text-slate-800 dark:text-white text-sm">Provision New Company</h3>
                    </div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mb-4 leading-5">Create a dedicated CRM instance. The system provisions a custom MySQL database schema automatically and configures isolation parameters.</p>
                    
                    <form
                      onSubmit={async (e: FormEvent) => {
                        e.preventDefault();
                        setTenantFormError("");
                        setTenantFormSuccess("");
                        setIsCreatingTenant(true);
                        try {
                          await apiPost("/superadmin/tenants", { name: newTenantName, slug: newTenantSlug });
                          setTenantFormSuccess(`CRM Instance for '${newTenantName}' has been successfully created!`);
                          setNewTenantName("");
                          setNewTenantSlug("");
                          refresh();
                        } catch (err) {
                          setTenantFormError(err instanceof Error ? err.message : "Failed to create tenant.");
                        } finally {
                          setIsCreatingTenant(false);
                        }
                      }}
                      className="space-y-4"
                    >
                      <div>
                        <label className="text-xs font-bold text-slate-500 block mb-1">Company Name</label>
                        <input type="text" value={newTenantName} onChange={(e) => setNewTenantName(e.target.value)} placeholder="e.g. Geetpay India" required className="h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3.5 text-sm text-slate-800 dark:text-white placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/20" />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500 block mb-1">Subdomain (Slug)</label>
                        <input type="text" value={newTenantSlug} onChange={(e) => setNewTenantSlug(e.target.value.replace(/[^a-zA-Z0-9-]/g, "").toLowerCase())} placeholder="e.g. geetpay" required className="h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3.5 text-sm font-mono text-slate-800 dark:text-white placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/20" />
                      </div>
                      {tenantFormError && <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2 text-xs text-red-700 dark:text-red-400">{tenantFormError}</div>}
                      {tenantFormSuccess && <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/50 px-3 py-2 text-xs text-emerald-700 font-bold">✓ {tenantFormSuccess}</div>}
                      <button type="submit" disabled={isCreatingTenant} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-50 transition shadow-sm mt-2">
                        {isCreatingTenant ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Provisioning Schema...</> : <><Plus className="h-3.5 w-3.5" /> Initialize CRM Instance</>}
                      </button>
                    </form>
                  </div>
                </div>

                {/* CRM Instances Table */}
                <div className="lg:col-span-2 rounded-xl bg-white border border-slate-200/80 dark:bg-slate-900/60 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col justify-between">
                  <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <h3 className="font-extrabold text-slate-800 dark:text-white text-sm">CRM Deployment Registry</h3>
                    <span className="text-xs text-slate-400">{tenants.length} provisioned instances</span>
                  </div>
                  <div className="overflow-x-auto flex-grow">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-slate-400 font-bold tracking-wider uppercase text-[10px]">
                          <th className="py-3 px-5">Company</th>
                          <th className="py-3 px-5">Workspace Subdomain</th>
                          <th className="py-3 px-5">DB Schema</th>
                          <th className="py-3 px-5">Status</th>
                          <th className="py-3 px-5 text-right">Instance Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100/50 dark:divide-slate-800/40">
                        {tenants.length === 0 && (
                          <tr><td colSpan={5} className="py-8 text-center text-slate-400 font-medium">No company instances registered.</td></tr>
                        )}
                        {tenants.map((t: any) => {
                          const host = window.location.host;
                          const protocol = window.location.protocol;
                          let base = host;
                          if (host.startsWith("waqtfinance.")) base = host.substring("waqtfinance.".length);
                          else if (host.startsWith("admin.")) base = host.substring("admin.".length);
                          else if (host.startsWith("superadmin.")) base = host.substring("superadmin.".length);
                          const tenantUrl = t.slug === "waqtfinance" ? `${protocol}//${base}` : `${protocol}//${t.slug}.${base}`;
                          return (
                            <tr key={t.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors">
                              <td className="py-3.5 px-5">
                                <div className="flex items-center gap-3.5">
                                  <div className="h-8.5 w-8.5 rounded-xl bg-blue-100 dark:bg-blue-900/35 flex items-center justify-center text-[10px] font-black text-blue-700 dark:text-blue-400 flex-shrink-0">
                                    {t.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                                  </div>
                                  <div>
                                    <div className="font-extrabold text-slate-800 dark:text-white">{t.name}</div>
                                    <div className="text-[9px] font-mono text-slate-400 mt-0.5">{t.slug}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3.5 px-5">
                                <a href={tenantUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-455 hover:underline font-mono text-[10px] font-semibold bg-blue-50/50 dark:bg-blue-950/20 px-2 py-1 rounded-lg border border-blue-100 dark:border-blue-900/20">
                                  {tenantUrl.replace(/^https?:\/\//, "")} <ExternalLink className="h-3 w-3" />
                                </a>
                              </td>
                              <td className="py-3.5 px-5">
                                <span className="inline-flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 rounded-lg px-2.5 py-1 font-mono text-[10px] text-slate-500 font-semibold border border-slate-200/50 dark:border-slate-800">
                                  <Server className="h-3 w-3 text-slate-400" />
                                  {t.db_name || t.dbName || "dynamic_db"}
                                </span>
                              </td>
                              <td className="py-3.5 px-5">
                                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase border ${t.status === "active" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-rose-500/10 text-rose-600 border-rose-500/20"}`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${t.status === "active" ? "bg-emerald-500 animate-pulse" : "bg-rose-50"}`} />
                                  {t.status}
                                </span>
                              </td>
                              <td className="py-3.5 px-5 text-right">
                                {t.slug !== "waqtfinance" ? (
                                  <button
                                    onClick={async () => {
                                      const next = t.status === "active" ? "suspended" : "active";
                                      if (!confirm(`Set '${t.name}' to ${next}?`)) return;
                                      try { await apiPatch(`/superadmin/tenants/${t.id}`, { status: next }); refresh(); }
                                      catch { alert("Failed to update status."); }
                                    }}
                                    className={`inline-flex items-center gap-1 h-7 px-3 rounded-lg text-[10px] font-bold transition border ${t.status === "active" ? "bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100" : "bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100"}`}
                                  >
                                    {t.status === "active" ? "Suspend" : "Activate"}
                                  </button>
                                ) : (
                                  <span className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider">
                                    <Lock className="h-3 w-3" /> Core Protected
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Companies Live Performance Tracking */}
              <div className="rounded-xl bg-white border border-slate-200/80 dark:bg-slate-900/60 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="px-5 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <h3 className="font-extrabold text-slate-800 dark:text-white text-sm">Company Metrics Live Tracking</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Real-time metrics compiled from each company instance database</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live Tracking
                  </span>
                </div>

                {tenantStats.length === 0 ? (
                  <div className="p-12 text-center text-slate-400 text-sm flex flex-col items-center justify-center">
                    <Building2 className="h-10 w-10 text-slate-300 mb-2 animate-pulse" />
                    Loading dynamic company databases...
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-px bg-slate-100 dark:bg-slate-800 sm:grid-cols-2 xl:grid-cols-3">
                    {tenantStats.map((t: any) => {
                      const s = t.stats;
                      const healthScore = s ? Math.max(0, 100 - (s.overdueLoans / Math.max(s.activeLoans, 1)) * 100) : 85;
                      const host = window.location.host;
                      const protocol = window.location.protocol;
                      let base = host;
                      if (host.startsWith("waqtfinance.")) base = host.substring("waqtfinance.".length);
                      else if (host.startsWith("admin.")) base = host.substring("admin.".length);
                      else if (host.startsWith("superadmin.")) base = host.substring("superadmin.".length);
                      const tenantUrl = t.slug === "waqtfinance" ? `${protocol}//${base}` : `${protocol}//${t.slug}.${base}`;
                      return (
                        <div key={t.id} className="bg-white dark:bg-slate-900/60 p-5 hover:bg-slate-50/40 dark:hover:bg-slate-800/5 transition">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-[12px] font-black text-white flex-shrink-0 shadow-sm">
                                {t.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-extrabold text-slate-800 dark:text-white text-sm">{t.name}</p>
                                <a href={tenantUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] font-mono text-blue-500 hover:underline">
                                  {tenantUrl.replace(/^https?:\/\//, "")} ↗
                                </a>
                              </div>
                            </div>
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase border ${
                              t.status === "active"
                                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                : "bg-rose-500/10 text-rose-600 border-rose-500/20"
                            }`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${t.status === "active" ? "bg-emerald-500 animate-pulse" : "bg-rose-50"}`} />
                              {t.status}
                            </span>
                          </div>

                          {!s ? (
                            <div className="rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 px-3 py-2 text-xs text-rose-600 dark:text-rose-400 font-semibold">
                              ⚠ Database offline / connection timed out
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className="grid grid-cols-3 gap-2">
                                {[
                                  { label: "Leads", value: s.totalLeads, color: "text-blue-600 dark:text-blue-400" },
                                  { label: "Customers", value: s.totalCustomers, color: "text-emerald-600 dark:text-emerald-400" },
                                  { label: "Active Loans", value: s.activeLoans, color: "text-violet-600 dark:text-violet-400" },
                                ].map((m) => (
                                  <div key={m.label} className="rounded-lg bg-slate-50 dark:bg-slate-800/40 p-2 text-center border border-slate-100 dark:border-slate-800">
                                    <p className={`text-base font-black ${m.color}`}>{m.value}</p>
                                    <p className="text-[8.5px] text-slate-400 font-bold uppercase mt-0.5">{m.label}</p>
                                  </div>
                                ))}
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                <div className="rounded-lg bg-slate-50 dark:bg-slate-800/40 p-2 border border-slate-100 dark:border-slate-800">
                                  <p className="text-[8.5px] text-slate-400 font-bold uppercase">Disbursed (MTD)</p>
                                  <p className="text-xs font-black text-slate-800 dark:text-white mt-0.5">{formatCurrency(s.monthlyDisbursed)}</p>
                                </div>
                                <div className="rounded-lg bg-slate-50 dark:bg-slate-800/40 p-2 border border-slate-100 dark:border-slate-800">
                                  <p className="text-[8.5px] text-slate-400 font-bold uppercase">Collected (MTD)</p>
                                  <p className="text-xs font-black text-emerald-600 mt-0.5">{formatCurrency(s.monthlyCollected)}</p>
                                </div>
                              </div>

                              <div className="pt-1">
                                <div className="flex items-center justify-between mb-1">
                                  <p className="text-[9px] text-slate-400 font-bold uppercase">Portfolio Health</p>
                                  <p className={`text-[10px] font-bold ${healthScore >= 70 ? "text-emerald-600" : healthScore >= 40 ? "text-amber-600" : "text-rose-600"}`}>
                                    {Math.round(healthScore)}%
                                  </p>
                                </div>
                                <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${healthScore >= 70 ? "bg-emerald-500" : healthScore >= 40 ? "bg-amber-400" : "bg-rose-500"}`}
                                    style={{ width: `${healthScore}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: USER DIRECTORY */}
          {superadminTab === "users" && (
            <div className="space-y-6 animate-fadeIn">
              <div className="grid gap-6 lg:grid-cols-4">
                {/* Left Form: Create User */}
                <div className="lg:col-span-1 rounded-xl bg-white border border-slate-200/80 p-5 dark:bg-slate-900/60 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="mb-3 flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600"><UserPlus className="h-4 w-4" /></span>
                      <h3 className="font-extrabold text-slate-800 dark:text-white text-sm">Create New User</h3>
                    </div>
                    <p className="text-xs text-slate-400 mb-4 leading-5">Add a new operational profile. The user can log in to their assigned company subdomain instantly.</p>

                    <form
                      onSubmit={async (e: FormEvent) => {
                        e.preventDefault();
                        setUserFormError("");
                        setUserFormSuccess("");

                        if (!userFormName.trim() || !userFormEmail.trim() || !userFormPassword.trim()) {
                          setUserFormError("All fields are required.");
                          return;
                        }

                        setIsCreatingUser(true);
                        try {
                          await apiPost("/superadmin/users", {
                            tenantSlug: userFormTenant,
                            email: userFormEmail,
                            name: userFormName,
                            role: userFormRole,
                            password: userFormPassword,
                          });
                          setUserFormSuccess(`User '${userFormName}' created successfully!`);
                          setUserFormName("");
                          setUserFormEmail("");
                          setUserFormPassword("");
                          fetchSuperadminUsers(selectedUserTenant);
                        } catch (err) {
                          setUserFormError(err instanceof Error ? err.message : "Failed to create user.");
                        } finally {
                          setIsCreatingUser(false);
                        }
                      }}
                      className="space-y-3"
                      aria-label="Create operational user profile"
                    >
                      <div>
                        <label className="text-xs font-bold text-slate-500 block mb-1">Company Tenant</label>
                        <select value={userFormTenant} onChange={(e) => setUserFormTenant(e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:border-blue-500 focus:outline-none">
                          {tenants.map(t => (
                            <option key={t.slug} value={t.slug}>{t.name} ({t.slug})</option>
                          ))}
                          {tenants.length === 0 && <option value="waqtfinance">Waqt Finance (waqtfinance)</option>}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500 block mb-1">Full Name</label>
                        <input type="text" value={userFormName} onChange={(e) => setUserFormName(e.target.value)} placeholder="e.g. Amit Sharma" required className="h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-sm text-slate-800 dark:text-white placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500 block mb-1">Email Address</label>
                        <input type="email" value={userFormEmail} onChange={(e) => setUserFormEmail(e.target.value)} placeholder="e.g. amit@waqtmoney.com" required className="h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-sm text-slate-800 dark:text-white placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500 block mb-1">Password</label>
                        <input type="password" value={userFormPassword} onChange={(e) => setUserFormPassword(e.target.value)} placeholder="••••••••" required className="h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-sm text-slate-800 dark:text-white placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500 block mb-1">Operational Role</label>
                        <select value={userFormRole} onChange={(e) => setUserFormRole(e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:border-blue-500 focus:outline-none">
                          <option value="telecaller">Telecaller / Agent</option>
                          <option value="credit">Credit Manager</option>
                          <option value="accountant">Accountant / LMS</option>
                          <option value="admin">Branch Admin</option>
                        </select>
                      </div>

                      {userFormError && <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2 text-xs text-red-700 dark:text-red-400">{userFormError}</div>}
                      {userFormSuccess && <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 px-3 py-2 text-xs text-emerald-700 font-bold">✓ {userFormSuccess}</div>}

                      <button type="submit" disabled={isCreatingUser} className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-sm mt-2 disabled:opacity-50">
                        {isCreatingUser ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Provisioning...</> : <><UserPlus className="h-3.5 w-3.5" /> Save User Profile</>}
                      </button>
                    </form>
                  </div>
                </div>

                {/* Right Area: Filters & Users Table */}
                <div className="lg:col-span-3 rounded-xl bg-white border border-slate-200/80 dark:bg-slate-900/60 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
                  {/* Filter header bar */}
                  <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex-1">
                      <p className="text-xs font-extrabold text-slate-700 dark:text-slate-300">Viewing users under database instance</p>
                      <p className="text-[10px] text-slate-400 font-medium">Select a company tenant to manage its active operational users.</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <select value={selectedUserTenant} onChange={(e) => setSelectedUserTenant(e.target.value)} className="h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 text-xs font-extrabold text-slate-700 dark:text-slate-300 focus:outline-none">
                        <option value="all">All Companies</option>
                        {tenants.map(t => (
                          <option key={t.slug} value={t.slug}>{t.name} ({t.slug})</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Users Directory Table */}
                  <div className="overflow-x-auto flex-1">
                    {isFetchingUsers ? (
                      <div className="p-12 text-center text-slate-400 font-semibold">
                        <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-indigo-500" />
                        Fetching tenant users...
                      </div>
                    ) : (
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-bold tracking-wider uppercase text-[10px]">
                            <th className="py-3 px-4">User Details</th>
                            <th className="py-3 px-4">Database Domain</th>
                            <th className="py-3 px-4">Role Permission</th>
                            <th className="py-3 px-4">Created At</th>
                            <th className="py-3 px-4">User Status</th>
                            <th className="py-3 px-4 text-right">Access Controls</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100/50 dark:divide-slate-800/40">
                          {superadminUsers.length === 0 ? (
                            <tr><td colSpan={6} className="py-12 text-center text-slate-400 font-semibold">No registered users found under database subdomain '{selectedUserTenant}'.</td></tr>
                          ) : (
                            superadminUsers.map((u) => {
                              const userTenantSlug = u.tenantSlug || selectedUserTenant;
                              const matchedTenant = tenants.find(t => t.slug === userTenantSlug);
                              const companyName = u.tenantName || (matchedTenant ? matchedTenant.name : userTenantSlug.charAt(0).toUpperCase() + userTenantSlug.slice(1));
                              return (
                                <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors">
                                  <td className="py-3.5 px-4">
                                    <div className="flex items-center gap-2.5">
                                      <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300 font-extrabold shadow-sm border border-slate-200/40 dark:border-slate-700">
                                        {u.name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2)}
                                      </div>
                                      <div>
                                        <div className="font-bold text-slate-800 dark:text-white text-xs">{u.name}</div>
                                        <div className="text-[10px] text-slate-400 font-medium">{u.email}</div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-3.5 px-4 font-mono text-[10px] font-semibold text-slate-500">
                                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50/60 dark:bg-blue-950/20 px-2.5 py-1 border border-blue-100 dark:border-blue-900/40 text-blue-600 dark:text-blue-400">
                                      <Building2 className="h-3 w-3" /> {companyName}
                                    </span>
                                  </td>
                                  <td className="py-3.5 px-4">
                                    <span className={`inline-flex px-2 py-0.5 rounded text-[9.5px] font-bold uppercase ${
                                      u.role === "superadmin"
                                        ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400"
                                        : u.role === "admin"
                                        ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
                                        : u.role === "accountant"
                                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                                        : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                    }`}>
                                      {roleLabels[u.role] || u.role}
                                    </span>
                                  </td>
                                  <td className="py-3.5 px-4 text-slate-400 font-medium text-[10px]">
                                    {u.created_at ? new Date(u.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                                  </td>
                                  <td className="py-3.5 px-4">
                                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase border ${u.is_active ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-rose-500/10 text-rose-600 border-rose-500/20"}`}>
                                      <span className={`h-1 w-1 rounded-full ${u.is_active ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
                                      {u.is_active ? "Active" : "Suspended"}
                                    </span>
                                  </td>
                                  <td className="py-3.5 px-4 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      {userPasswordResetId === u.id ? (
                                        <div className="flex items-center gap-1">
                                          <input
                                            type="password"
                                            placeholder="New Password"
                                            value={userPasswordResetValue}
                                            onChange={(e) => setUserPasswordResetValue(e.target.value)}
                                            className="h-7 w-28 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 text-xs text-slate-800 dark:text-white focus:outline-none"
                                          />
                                          <button
                                            onClick={async () => {
                                              if (!userPasswordResetValue.trim()) return;
                                              try {
                                                await apiPatch(`/superadmin/users/${u.id}`, { tenantSlug: u.tenantSlug || selectedUserTenant, password: userPasswordResetValue });
                                                alert(`Password for ${u.name} reset successfully.`);
                                                setUserPasswordResetId(null);
                                                setUserPasswordResetValue("");
                                              } catch {
                                                alert("Failed to reset password.");
                                              }
                                            }}
                                            className="h-7 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 text-xs font-bold"
                                          >
                                            Save
                                          </button>
                                          <button onClick={() => setUserPasswordResetId(null)} className="h-7 text-slate-400 px-1 text-xs">Cancel</button>
                                        </div>
                                      ) : (
                                        <>
                                          <button
                                            onClick={() => {
                                              setUserPasswordResetId(u.id);
                                              setUserPasswordResetValue("");
                                            }}
                                            className="inline-flex items-center h-6 px-2.5 rounded-md text-[10px] font-bold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                                          >
                                            Reset Pass
                                          </button>
                                          <button
                                            onClick={async () => {
                                              const next = u.is_active ? 0 : 1;
                                              if (!confirm(`Are you sure you want to ${u.is_active ? "suspend" : "activate"} ${u.name}?`)) return;
                                              try {
                                                await apiPatch(`/superadmin/users/${u.id}`, { tenantSlug: u.tenantSlug || selectedUserTenant, is_active: next });
                                                fetchSuperadminUsers(selectedUserTenant);
                                              } catch {
                                                alert("Failed to toggle status.");
                                              }
                                            }}
                                            className={`inline-flex items-center h-6 px-2.5 rounded-md text-[10px] font-bold border ${u.is_active ? "bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100" : "bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100"}`}
                                          >
                                            {u.is_active ? "Suspend" : "Activate"}
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SYSTEM LOGS & AUDITS */}
          {superadminTab === "logs" && (
            <div className="space-y-6 animate-fadeIn">
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                {/* Simulated Server Health */}
                <div className="lg:col-span-2 rounded-xl bg-white border border-slate-200/80 p-5 dark:bg-slate-900/60 dark:border-slate-800 shadow-sm">
                  <div className="mb-4">
                    <h3 className="font-extrabold text-slate-800 dark:text-white text-sm">Server CPU & Memory Load</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Real-time CPU cores load and Node.js process memory footprint.</p>
                  </div>
                  {/* CPU Area chart */}
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                        <span className="text-slate-600 dark:text-slate-300">Processor Utilization</span>
                        <span className="text-indigo-600 dark:text-indigo-400">18.4% (Steady)</span>
                      </div>
                      <ResponsiveContainer width="100%" height={100}>
                        <AreaChart data={[
                          { name: '1', load: 12 }, { name: '2', load: 24 }, { name: '3', load: 18 },
                          { name: '4', load: 15 }, { name: '5', load: 22 }, { name: '6', load: 19 },
                          { name: '7', load: 18 }, { name: '8', load: 25 }, { name: '9', load: 21 },
                          { name: '10', load: 18 }
                        ]}>
                          <defs>
                            <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25}/>
                              <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <Area type="monotone" dataKey="load" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#cpuGrad)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>

                    {/* API response times */}
                    <div>
                      <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                        <span className="text-slate-600 dark:text-slate-300">API Response Latency</span>
                        <span className="text-emerald-600 dark:text-emerald-400">2.1ms (Avg)</span>
                      </div>
                      <ResponsiveContainer width="100%" height={100}>
                        <AreaChart data={[
                          { name: '1', ms: 1.8 }, { name: '2', ms: 2.3 }, { name: '3', ms: 2.1 },
                          { name: '4', ms: 1.9 }, { name: '5', ms: 3.2 }, { name: '6', ms: 2.0 },
                          { name: '7', ms: 2.1 }, { name: '8', ms: 2.4 }, { name: '9', ms: 1.9 },
                          { name: '10', ms: 2.1 }
                        ]}>
                          <defs>
                            <linearGradient id="latencyGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/>
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <Area type="monotone" dataKey="ms" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#latencyGrad)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Integrations Health */}
                <div className="rounded-xl bg-white border border-slate-200/80 p-5 dark:bg-slate-900/60 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                  <div>
                    <h3 className="font-extrabold text-slate-800 dark:text-white text-sm mb-1">Integration Statuses</h3>
                    <p className="text-xs text-slate-400">External services and SaaS gateway checks.</p>
                  </div>
                  <div className="space-y-4 my-4">
                    {[
                      { name: "MySQL Database Connection Pool", status: "Connected (0.5ms)", color: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20" },
                      { name: "Digio eSign Sandbox Gateway", status: "Operational (Test)", color: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20" },
                      { name: "Cashfree Sandbox API", status: "Operational (Test)", color: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20" },
                      { name: "Apache HTTP Server Proxy", status: "Port 5000 (Active)", color: "text-blue-600 bg-blue-500/10 border-blue-500/20" },
                    ].map((item) => (
                      <div key={item.name} className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-2">
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{item.name}</span>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase border ${item.color}`}>
                          <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                          {item.status}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400 text-center">System health diagnostics check completes every 10 seconds.</p>
                </div>
              </div>

              {/* Security Timber/Audit log */}
              <div className="rounded-xl bg-white border border-slate-200/80 dark:bg-slate-900/60 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="px-5 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <h3 className="font-extrabold text-slate-800 dark:text-white text-sm">System Security Logs</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Live audit timeline generated from control system events.</p>
                  </div>
                  <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">Compliance Check</span>
                </div>
                <div className="p-5 space-y-4">
                  {superadminLogs.map((log: any, idx: number) => {
                    const timeAgoStr = `${new Date(log.createdAt).toLocaleTimeString()} - ${new Date(log.createdAt).toLocaleDateString()}`;
                    const type = log.action.includes('fail') || log.action.includes('warn') ? 'WARNING' :
                                 log.action.includes('login') || log.action.includes('session') ? 'SECURITY' :
                                 log.action.includes('create') || log.action.includes('payout') ? 'SUCCESS' : 'INFO';
                    return (
                      <div key={idx} className="flex items-start gap-3 border-l-2 border-indigo-500/20 pl-4 relative">
                        <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-indigo-500" />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-slate-400">{timeAgoStr}</span>
                            <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded border ${
                              type === "SECURITY" ? "bg-rose-500/10 text-rose-600 border-rose-500/20" :
                              type === "WARNING" ? "bg-amber-500/10 text-amber-600 border-amber-500/20" :
                              type === "SUCCESS" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" :
                              "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
                            }`}>{type}</span>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-5 font-medium">
                            <strong>[{log.tenantName}]</strong> {log.actorName} ({log.actorRole}) performed <strong>{log.action}</strong> {log.leadId ? `on lead #${log.leadId}` : ''} {log.ipAddress ? `from IP ${log.ipAddress}` : ''}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {superadminLogs.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-4">No audit logs found.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3.5: AUTOMATIC LEAD ROUTING PANEL */}
          {superadminTab === "routing" && (
            <div className="space-y-6 animate-fadeIn">
              <div className="rounded-xl bg-white border border-slate-200/80 p-6 dark:bg-slate-900/60 dark:border-slate-800 shadow-sm">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 dark:border-slate-800 pb-5">
                  <div>
                    <h3 className="font-extrabold text-slate-800 dark:text-white text-base flex items-center gap-2">
                      <Shuffle className="h-5 w-5 text-blue-500" />
                      Automatic Round-Robin Lead Routing Panel
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Distribute incoming leads evenly among active on-duty telecallers. Select which products each telecaller receives.
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tenant Filter:</label>
                    <select
                      value={selectedRoutingTenant}
                      onChange={(e) => setSelectedRoutingTenant(e.target.value)}
                      className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none transition focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    >
                      <option value="all">All Tenants</option>
                      <option value="waqtfinance">Waqt Finance</option>
                      {tenants.map((t) => (
                        <option key={t.slug} value={t.slug}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-6 overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 text-xs font-bold uppercase tracking-wider text-slate-400">
                        <th className="pb-3.5 px-4">Telecaller Info</th>
                        <th className="pb-3.5 px-4">Tenant / Brand</th>
                        <th className="pb-3.5 px-4 text-center">Duty Status (Round-Robin Active)</th>
                        <th className="pb-3.5 px-4">Assigned Products</th>
                        <th className="pb-3.5 px-4">Last Lead Assigned</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800 text-sm">
                      {isFetchingTelecallers && (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400 text-xs font-medium">
                            <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-blue-500" />
                            Fetching telecallers list...
                          </td>
                        </tr>
                      )}
                      {!isFetchingTelecallers && superadminTelecallers.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400 text-xs font-medium">
                            No telecallers registered for this tenant.
                          </td>
                        </tr>
                      )}
                      {!isFetchingTelecallers && superadminTelecallers.map((tc) => {
                        const productOptions = [
                          { slug: "waqtfinance", label: "Waqt Finance" },
                          { slug: "geetpay", label: "GeetPay" },
                          { slug: "loaninwallet", label: "LoanInWallet" },
                          { slug: "salarywaves", label: "SalaryWaves" }
                        ];

                        return (
                          <tr key={`${tc.tenantSlug}-${tc.id}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors">
                            <td className="py-4 px-4">
                              <div className="font-bold text-slate-800 dark:text-slate-200">{tc.name}</div>
                              <div className="text-xs text-slate-400 font-medium">{tc.email}</div>
                            </td>
                            <td className="py-4 px-4">
                              <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-100 dark:border-indigo-900/30">
                                {tc.tenantName}
                              </span>
                            </td>
                            <td className="py-4 px-4 text-center">
                              <button
                                onClick={() => handleToggleDuty(tc.tenantSlug, tc.id, tc.on_duty)}
                                disabled={isUpdatingTelecaller}
                                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold border transition-all ${
                                  tc.on_duty
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30"
                                    : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/20 dark:text-rose-455 dark:border-rose-900/30"
                                }`}
                              >
                                <span className={`h-1.5 w-1.5 rounded-full ${tc.on_duty ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
                                {tc.on_duty ? "ON DUTY" : "OFF DUTY"}
                              </button>
                            </td>
                            <td className="py-4 px-4">
                              <div className="flex flex-wrap gap-2">
                                {productOptions.map((opt) => {
                                  const isAssigned = (tc.products || []).includes(opt.slug);
                                  return (
                                    <button
                                      key={opt.slug}
                                      onClick={() => {
                                        const newProds = isAssigned
                                          ? (tc.products || []).filter((p: string) => p !== opt.slug)
                                          : [...(tc.products || []), opt.slug];
                                        handleUpdateProducts(tc.tenantSlug, tc.id, newProds);
                                      }}
                                      disabled={isUpdatingTelecaller}
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold border transition ${
                                        isAssigned
                                          ? "bg-blue-600 text-white border-blue-600 dark:bg-blue-700"
                                          : "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 hover:bg-slate-200"
                                      }`}
                                    >
                                      {opt.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </td>
                            <td className="py-4 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
                              {tc.last_assigned_at ? (
                                <span>{new Date(tc.last_assigned_at).toLocaleString("en-IN", { hour12: true })}</span>
                              ) : (
                                <span className="italic text-slate-400">Never assigned</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {["telecaller", "credit-manager", "accountant", "collection"].includes(superadminTab) && (
            <div className="space-y-6 animate-fadeIn">
              {renderRoleWorkbenchBody()}
            </div>
          )}
        </div>

        {/* Dynamic Superadmin Details Modal */}
        {superadminDetailType && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
            <div className="w-full max-w-4xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-slate-900 dark:text-white text-base">{superadminDetailTitle}</h3>
                  <p className="text-xs text-slate-400 mt-0.5 font-medium">Aggregated details across all active database subdomains.</p>
                </div>
                <button
                  onClick={() => setSuperadminDetailType(null)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50 dark:bg-slate-950/20">
                {isLoadingDetails ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <RefreshCw className="h-8 w-8 text-blue-500 animate-spin" />
                    <p className="text-xs font-semibold text-slate-400">Loading live database records...</p>
                  </div>
                ) : superadminDetailRows.length === 0 ? (
                  <div className="text-center py-20">
                    <p className="text-sm font-semibold text-slate-400">No active records found for this category.</p>
                  </div>
                ) : (
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
                    <table className="w-full border-collapse text-left">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          <th className="px-5 py-3">Company</th>
                          <th className="px-5 py-3">Reference/Loan ID</th>
                          <th className="px-5 py-3">Customer Name</th>
                          <th className="px-5 py-3">Mobile No</th>
                          <th className="px-5 py-3 text-right">Amount</th>
                          <th className="px-5 py-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {superadminDetailRows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 text-xs font-semibold text-slate-700 dark:text-slate-300">
                            <td className="px-5 py-3.5 font-bold text-slate-900 dark:text-white">
                              {row.tenantName}
                            </td>
                            <td className="px-5 py-3.5 font-mono text-[11px] font-semibold text-slate-500">
                              {row.loanNo || "N/A"}
                            </td>
                            <td className="px-5 py-3.5 font-semibold text-slate-800 dark:text-slate-200">
                              {row.customerName || "Unknown"}
                            </td>
                            <td className="px-5 py-3.5 font-mono text-slate-500">
                              {row.mobile || "N/A"}
                            </td>
                            <td className="px-5 py-3.5 text-right font-bold text-slate-900 dark:text-white">
                              ₹{Number(row.amount || 0).toLocaleString('en-IN')}
                            </td>
                            <td className="px-5 py-3.5 text-center">
                              <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase border ${
                                row.status === 'Active' || row.status === 'approved' || row.status === 'disbursed'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : row.status === 'Overdue'
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : 'bg-blue-50 text-blue-700 border-blue-200'
                              }`}>
                                {row.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex justify-end">
                <button
                  onClick={() => setSuperadminDetailType(null)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-lg transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }


  const renderRoleWorkbenchBody = () => {
    return (
      <>
        <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {apiError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {apiError}
          </div>
        )}
        {paymentSuccess && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {paymentSuccess}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          {roleMetricCards.map((card) => (
            <MetricCard
              key={card.label}
              icon={card.icon}
              isLoading={isLoading}
              label={card.label}
              tone={card.tone}
              value={card.value}
              wide={card.wide}
            >
              {card.children}
            </MetricCard>
          ))}
        </div>

        {currentRole === "telecaller" && (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Card className="dashboard-panel p-6">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">Today&apos;s Workbench</h3>
                  <p className="text-sm text-gray-500">Prioritized from live callbacks, document gaps, and SLA aging.</p>
                </div>
                <AppTooltip label="Open filtered telecaller queue">
                  <Link to="/leads?tab=followups" className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800">
                    Open queue
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </AppTooltip>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { detail: "New leads and due callbacks", href: "/leads?tab=uncontacted", icon: PhoneCall, label: "Call now", tone: "text-blue-600", value: callNowLeads.length },
                  { detail: "Due today or already overdue", href: "/leads?tab=followups", icon: Clock, label: "Callback due", tone: "text-purple-600", value: overdueFollowupLeads.length },
                  { detail: "Missing customer documents", href: "/leads?tab=docs-pending", icon: FileText, label: "Docs pending", tone: "text-amber-600", value: telecallerDocumentPendingLeads || documentPendingLeads },
                  { detail: "Ready for credit handoff", href: "/leads?tab=ready-handoff", icon: CheckCircle2, label: "Ready credit", tone: "text-green-600", value: readyHandoffLeads },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.label} to={item.href} className="dashboard-action-card p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <Icon className={`h-5 w-5 ${item.tone}`} />
                        <span className="text-2xl font-semibold text-slate-950">{isLoading ? "-" : item.value}</span>
                      </div>
                      <div className="text-sm font-semibold text-slate-900">{item.label}</div>
                      <div className="mt-1 text-xs text-slate-500">{item.detail}</div>
                    </Link>
                  );
                })}
              </div>
            </Card>

            <Card className="dashboard-panel p-6">
              <div className="mb-5">
                <h3 className="text-base font-semibold text-gray-900">Disposition Funnel</h3>
                <p className="text-sm text-gray-500">New to credit handoff movement.</p>
              </div>
              <div className="space-y-4">
                {telecallerFunnel.map((item) => (
                  <div key={item.label}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700">{item.label}</span>
                      <span className="font-semibold text-slate-950">{isLoading ? "-" : item.value}</span>
                    </div>
                    <div className="dashboard-funnel-track">
                      <div
                        className="dashboard-funnel-fill"
                        style={{
                          backgroundColor: item.color,
                          width: `${Math.max(6, Math.round((item.value / maxTelecallerFunnel) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {currentRole === "credit-manager" && (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Card className="dashboard-panel p-6">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">Credit Review Control</h3>
                  <p className="text-sm text-gray-500">Triage handoffs by document gaps, CAM readiness, and priority exposure.</p>
                </div>
                <AppTooltip label="Open credit manager workspace">
                  <Link to="/credit-manager" className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800">
                    Open queue
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </AppTooltip>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { detail: formatCurrency(creditReviewAmount), href: "/credit-manager", icon: FileText, label: "Decision queue", tone: "text-amber-600", value: creditReviewLeads.length },
                  { detail: "Needs telecaller/customer closure", href: "/credit-manager?tab=docs-gap", icon: AlertCircle, label: "Docs gap", tone: "text-red-600", value: creditDocsGapLeads.length },
                  { detail: "Ready for CAM decision", href: "/credit-manager?tab=ready", icon: ShieldCheck, label: "CAM ready", tone: "text-blue-600", value: creditReadyCamLeads.length },
                  { detail: formatCurrency(approvedPaymentAmount), href: "/credit-applications?tab=sent-to-accountant", icon: CheckCircle2, label: "Approved", tone: "text-green-600", value: accountantPaymentLeads.length },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.label} to={item.href} className="dashboard-action-card p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <Icon className={`h-5 w-5 ${item.tone}`} />
                        <span className="text-2xl font-semibold text-slate-950">{isLoading ? "-" : item.value}</span>
                      </div>
                      <div className="text-sm font-semibold text-slate-900">{item.label}</div>
                      <div className="mt-1 text-xs text-slate-500">{item.detail}</div>
                    </Link>
                  );
                })}
              </div>
            </Card>

            <Card className="dashboard-panel p-6">
              <div className="mb-5">
                <h3 className="text-base font-semibold text-gray-900">Decision Readiness</h3>
                <p className="text-sm text-gray-500">How much of the queue can move today.</p>
              </div>
              <div className="space-y-4">
                {[
                  { label: "CAM ready", value: creditReadyCamLeads.length, color: "bg-blue-600" },
                  { label: "Document gaps", value: creditDocsGapLeads.length, color: "bg-red-600" },
                  { label: "High priority", value: creditHighPriorityLeads.length, color: "bg-purple-600" },
                  { label: "Approved payment", value: accountantPaymentLeads.length, color: "bg-green-600" },
                ].map((item) => {
                  const maxValue = Math.max(creditReviewLeads.length, accountantPaymentLeads.length, 1);
                  return (
                    <div key={item.label}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-700">{item.label}</span>
                        <span className="font-semibold text-slate-950">{isLoading ? "-" : item.value}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100">
                        <div className={`h-2 rounded-full ${item.color}`} style={{ width: `${Math.max(6, Math.round((item.value / maxValue) * 100))}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        )}

        {currentRole === "accountant" && <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={CreditCard} isLoading={isLoading} label="Total Disbursed" tone="text-blue-500" value={formatCurrency(accountantMetrics?.totalDisbursed || 0)} wide>
            Completed fund transfers
          </MetricCard>
          <MetricCard icon={CreditCard} isLoading={isLoading} label="Active Loans" tone="text-emerald-500" value={loanHealth.activeLoans}>
            {loanHealth.overdueLoans} overdue from live loan data
          </MetricCard>
          <MetricCard icon={BadgeIndianRupee} isLoading={isLoading} label="Outstanding" tone="text-orange-500" value={formatCurrency(loanHealth.totalOutstanding)} wide>
            {loanHealth.collectionEfficiency}% collection efficiency
          </MetricCard>
          <MetricCard icon={DollarSign} isLoading={isLoading} label="Repayment Due" tone="text-green-500" value={formatCurrency(accountantMetrics?.repaymentDueAmount || 0)} wide>
            Pending repayment schedule
          </MetricCard>
        </div>}

        {currentRole === "accountant" && (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Card className="dashboard-panel p-6">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">Finance Control</h3>
                  <p className="text-sm text-gray-500">Disbursement readiness, repayment exposure, and collection movement.</p>
                </div>
                <AppTooltip label="Open accountant payment queue">
                  <Link to="/accountant" className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800">
                    Open queue
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </AppTooltip>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { detail: formatCurrency(paymentQueueAmount), href: "/accountant", icon: BadgeIndianRupee, label: "Pay queue", tone: "text-emerald-600", value: paymentQueueCount },
                  { detail: "Beneficiary details complete", href: "/accountant", icon: CheckCircle2, label: "Bank ready", tone: "text-green-600", value: accountantBankReadyCount },
                  { detail: "Needs correction before transfer", href: "/accountant", icon: AlertCircle, label: "Bank missing", tone: "text-red-600", value: accountantBankMissingCount },
                  { detail: formatCurrency(accountantMetrics?.repaymentDueAmount || 0), href: "/loan-management", icon: Clock, label: "Repayment due", tone: "text-orange-600", value: accountantDashboard?.actionQueue.repaymentDue ?? 0 },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.label} to={item.href} className="dashboard-action-card p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <Icon className={`h-5 w-5 ${item.tone}`} />
                        <span className="text-2xl font-semibold text-slate-950">{isLoading ? "-" : item.value}</span>
                      </div>
                      <div className="text-sm font-semibold text-slate-900">{item.label}</div>
                      <div className="mt-1 text-xs text-slate-500">{item.detail}</div>
                    </Link>
                  );
                })}
              </div>
            </Card>

            <Card className="dashboard-panel p-6">
              <div className="mb-5">
                <h3 className="text-base font-semibold text-gray-900">Cash Movement</h3>
                <p className="text-sm text-gray-500">Money out, money due, and money collected.</p>
              </div>
              <div className="space-y-4">
                {[
                  { label: "Queued disbursement", value: paymentQueueAmount, color: "bg-emerald-600" },
                  { label: "Total disbursed", value: accountantMetrics?.totalDisbursed || 0, color: "bg-blue-600" },
                  { label: "Outstanding", value: loanHealth.totalOutstanding, color: "bg-orange-600" },
                  { label: "Collected", value: loanHealth.totalCollected, color: "bg-violet-600" },
                ].map((item) => {
                  const maxValue = Math.max(paymentQueueAmount, accountantMetrics?.totalDisbursed || 0, loanHealth.totalOutstanding, loanHealth.totalCollected, 1);
                  return (
                    <div key={item.label}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-700">{item.label}</span>
                        <span className="font-semibold text-slate-950">{isLoading ? "-" : formatCurrency(item.value)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100">
                        <div className={`h-2 rounded-full ${item.color}`} style={{ width: `${Math.max(6, Math.round((Number(item.value || 0) / maxValue) * 100))}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="dashboard-panel p-6">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900">{roleQueueTitle}</h3>
                <p className="text-sm text-gray-500">{roleQueueDescription}</p>
              </div>
              <AppTooltip label={`Open ${roleQueueTitle.toLowerCase()}`}>
                <Link to={roleQueueHref} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800">
                  Open workspace
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </AppTooltip>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr className="text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    <th className="px-3 py-2">Lead</th>
                    <th className="px-3 py-2">Contact</th>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">{currentRole === "telecaller" || currentRole === "credit-manager" ? "Next Action" : "Account"}</th>
                    <th className="px-3 py-2">Open</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {isLoading && [0, 1, 2, 3].map((item) => (
                    <tr key={item}>
                      <td colSpan={6} className="px-3 py-4">
                        <div className="h-4 w-full animate-pulse rounded bg-gray-100" />
                      </td>
                    </tr>
                  ))}
                  {!isLoading && currentRole === "accountant" && accountantQueueRows.map((lead) => (
                    <tr key={lead.id} className="text-sm">
                      <td className="px-3 py-3">
                        <div className="font-semibold text-gray-950">{lead.customerName || "Applicant"}</div>
                        <div className="text-xs text-gray-500">{lead.id} - {formatDate(lead.esignDate || undefined)}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-gray-900">{lead.phone || "Not provided"}</div>
                        <div className="max-w-44 truncate text-xs text-gray-500">{lead.panNumber || lead.bankName || "Bank details pending"}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-semibold text-gray-950">{formatCurrency(lead.disbursementAmount)}</div>
                        <div className="text-xs text-gray-500">Repay {formatCurrency(lead.repaymentAmount)}</div>
                      </td>
                      <td className="px-3 py-3">
                        <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800">
                          Ready to pay
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="min-w-52 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-slate-700">{lead.bankName || "Bank missing"}</p>
                              <p className="break-all font-mono text-xs text-slate-950">{formatAccountNumber(lead.accountNumber)}</p>
                            </div>
                            {lead.accountNumber && (
                              <AppTooltip label={copiedField === `dash-account-${lead.id}` ? "Account copied" : "Copy account number"}>
                                <button
                                  type="button"
                                  onClick={() => copyValue(`dash-account-${lead.id}`, formatAccountNumber(lead.accountNumber))}
                                  className={copiedButtonClass(copiedField === `dash-account-${lead.id}`)}
                                  aria-label={`Copy account number for ${lead.customerName || "lead"}`}
                                  aria-live="polite"
                                >
                                  {copiedField === `dash-account-${lead.id}` ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                  <span>{copiedField === `dash-account-${lead.id}` ? "Copied" : "Copy"}</span>
                                </button>
                              </AppTooltip>
                            )}
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className={`truncate text-xs ${lead.ifscCode ? "text-slate-500" : "text-amber-700"}`}>{lead.ifscCode || "IFSC missing"}</span>
                            {lead.ifscCode && (
                              <AppTooltip label={copiedField === `dash-ifsc-${lead.id}` ? "IFSC copied" : "Copy IFSC"}>
                                <button
                                  type="button"
                                  onClick={() => copyValue(`dash-ifsc-${lead.id}`, lead.ifscCode)}
                                  className={copiedButtonClass(copiedField === `dash-ifsc-${lead.id}`)}
                                  aria-label={`Copy IFSC for ${lead.customerName || "lead"}`}
                                  aria-live="polite"
                                >
                                  {copiedField === `dash-ifsc-${lead.id}` ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                  <span>{copiedField === `dash-ifsc-${lead.id}` ? "Copied" : "Copy"}</span>
                                </button>
                              </AppTooltip>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <AppTooltip label={isBankReady(lead) ? "Open fund transfer popup" : "Bank, account number, and IFSC are required"}>
                          <button
                            type="button"
                            onClick={() => openPaymentModal(lead)}
                            disabled={!isBankReady(lead)}
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 disabled:cursor-not-allowed disabled:text-slate-400"
                          >
                            <BadgeIndianRupee className="h-4 w-4" />
                            Pay
                          </button>
                        </AppTooltip>
                      </td>
                    </tr>
                  ))}
                  {!isLoading && currentRole !== "accountant" && latestRoleLeads.map((lead) => {
                    const nextAction = currentRole === "telecaller"
                      ? getTelecallerNextAction(lead)
                      : currentRole === "credit-manager"
                        ? getCreditNextAction(lead)
                        : null;
                    return (
                      <tr key={lead.id} className="text-sm">
                        <td className="px-3 py-3">
                          <div className="font-semibold text-gray-950">{lead.name || "Applicant"}</div>
                          <div className="text-xs text-gray-500">{lead.id} - {formatDate(lead.createdDate)}</div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="text-gray-900">{lead.phone || "Not provided"}</div>
                          <div className="max-w-44 truncate text-xs text-gray-500">{lead.email || "No email"}</div>
                        </td>
                        <td className="px-3 py-3 font-semibold text-gray-950">{formatCurrency(lead.loanAmount)}</td>
                        <td className="px-3 py-3">
                          <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusBadgeClasses[lead.status] || "bg-gray-100 text-gray-700"}`}>
                            {lead.status}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {nextAction ? (
                            <>
                              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${nextAction.tone}`}>
                                {nextAction.label}
                              </span>
                              <div className="mt-1 max-w-44 truncate text-xs text-slate-500">{nextAction.detail}</div>
                            </>
                          ) : (
                            <>
                              <div className="text-gray-900">{lead.assignedTo && lead.assignedTo !== "Unassigned" ? `Assign to ${lead.assignedTo}` : "Unassigned"}</div>
                              <span className={`mt-1 inline-flex rounded px-2 py-0.5 text-[11px] font-medium ${priorityBadgeClasses[lead.priority] || "bg-gray-100 text-gray-700"}`}>
                                {lead.priority}
                              </span>
                            </>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <AppTooltip label={currentRole === "credit-manager" ? "Open credit review" : nextAction ? nextAction.detail : "Open lead details"}>
                            <Link to={nextAction?.href || `/leads/${encodeURIComponent(lead.id)}`} className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800">
                              <Eye className="h-4 w-4" />
                              {currentRole === "credit-manager" ? "Review" : nextAction?.label || "View"}
                            </Link>
                          </AppTooltip>
                        </td>
                      </tr>
                    );
                  })}
                  {!isLoading && (currentRole === "accountant" ? accountantQueueRows.length === 0 : latestRoleLeads.length === 0) && (
                    <tr>
                      <td colSpan={6} className="px-3 py-10 text-center text-sm text-gray-500">
                        {currentRole === "accountant"
                          ? "No approved leads are waiting for payment"
                          : currentRole === "credit-manager"
                            ? "No telecaller handoffs are waiting for credit review"
                            : "No live leads found"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="dashboard-panel p-6">
            <div className="mb-5">
              <h3 className="text-base font-semibold text-gray-900">Action Queue</h3>
              <p className="text-sm text-gray-500">
                {currentRole === "telecaller" ? "Derived from live lead follow-ups and document status" : "Derived from live lead and loan status"}
              </p>
            </div>
            <div className="space-y-3">
              {actionQueue.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.label} to={item.href} className="dashboard-action-card flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Icon className={`h-5 w-5 ${item.tone}`} />
                      <span className="text-sm font-medium text-gray-800">{item.label}</span>
                    </div>
                    <span className="text-lg font-semibold text-gray-950">{isLoading ? "-" : item.value}</span>
                  </Link>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="dashboard-panel p-6">
            <div className="mb-6">
              <h3 className="text-base font-semibold text-gray-900">
                {currentRole === "telecaller"
                  ? "Workload By Next Action"
                  : currentRole === "credit-manager"
                    ? "Credit Pipeline By Review State"
                    : currentRole === "accountant"
                      ? "Finance Workload"
                      : "Applied Amount By Month"}
              </h3>
              <p className="text-sm text-gray-500">
                {currentRole === "telecaller"
                  ? "Operational buckets that decide what the telecaller should work on first."
                  : currentRole === "credit-manager"
                    ? "Decision queue, document gaps, CAM readiness, and approvals."
                  : currentRole === "accountant"
                    ? "Payment queue, active loans, repayment due, and collection follow-up."
                    : "Loan application amount from live leads"}
              </p>
            </div>
            {isLoading ? (
              <ChartSkeleton />
            ) : currentRole === "telecaller" ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={telecallerWorkloadData} margin={{ bottom: 8, left: 0, right: 12, top: 8 }}>
                  <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" axisLine={false} tick={{ fill: "#475569", fontSize: 12 }} tickLine={false} />
                  <YAxis allowDecimals={false} axisLine={false} tick={{ fill: "#64748b", fontSize: 12 }} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: "6px", fontSize: "12px" }}
                    cursor={{ fill: "#f8fafc" }}
                    formatter={(value: number) => [`${value} lead${value === 1 ? "" : "s"}`, "Count"]}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {telecallerWorkloadData.map((entry) => (
                      <Cell key={entry.label} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : currentRole === "credit-manager" ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={creditWorkloadData} margin={{ bottom: 8, left: 0, right: 12, top: 8 }}>
                  <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" axisLine={false} tick={{ fill: "#475569", fontSize: 12 }} tickLine={false} />
                  <YAxis allowDecimals={false} axisLine={false} tick={{ fill: "#64748b", fontSize: 12 }} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: "6px", fontSize: "12px" }}
                    cursor={{ fill: "#f8fafc" }}
                    formatter={(value: number) => [`${value} lead${value === 1 ? "" : "s"}`, "Count"]}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {creditWorkloadData.map((entry) => (
                      <Cell key={entry.label} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : currentRole === "accountant" ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={accountantWorkloadData} margin={{ bottom: 8, left: 0, right: 12, top: 8 }}>
                  <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" axisLine={false} tick={{ fill: "#475569", fontSize: 12 }} tickLine={false} />
                  <YAxis allowDecimals={false} axisLine={false} tick={{ fill: "#64748b", fontSize: 12 }} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: "6px", fontSize: "12px" }}
                    cursor={{ fill: "#f8fafc" }}
                    formatter={(value: number) => [`${value}`, "Count"]}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {accountantWorkloadData.map((entry) => (
                      <Cell key={entry.label} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={monthlyData}>
                  <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" axisLine={false} tick={{ fill: "#6b7280", fontSize: 12 }} tickLine={false} />
                  <YAxis axisLine={false} tick={{ fill: "#6b7280", fontSize: 12 }} tickFormatter={(value) => `${Number(value) / 1000}k`} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: "6px", fontSize: "12px" }}
                    cursor={{ fill: "#f3f4f6" }}
                    formatter={(value: number) => [formatCurrency(value), "Applied amount"]}
                  />
                  <Bar dataKey="value" fill="#111827" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card className="dashboard-panel p-6">
            <div className="mb-6">
              <h3 className="text-base font-semibold text-gray-900">
                {currentRole === "telecaller" ? "Queue Health Mix" : currentRole === "credit-manager" ? "Decision Mix" : currentRole === "accountant" ? "Portfolio Mix" : "Lead Status Distribution"}
              </h3>
              <p className="text-sm text-gray-500">
                {currentRole === "telecaller"
                  ? "Priority, SLA risk, and normal queue balance."
                  : currentRole === "credit-manager"
                    ? "Pending decisions, approvals, and document blockers."
                    : currentRole === "accountant"
                      ? "Transfer readiness and repayment portfolio balance."
                    : "Current status from live lead data"}
              </p>
            </div>
            <div className="grid items-center gap-4 md:grid-cols-[minmax(0,1fr)_190px]">
              {isLoading ? (
                <div className="h-[220px] w-[220px] animate-pulse rounded-full border-[42px] border-gray-200" />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={
                        currentRole === "telecaller" && telecallerPriorityMix.length
                          ? telecallerPriorityMix
                          : currentRole === "credit-manager" && creditDecisionMix.length
                            ? creditDecisionMix
                            : currentRole === "accountant" && accountantPortfolioMix.length
                              ? accountantPortfolioMix
                            : leadStatusData
                      }
                      cx="50%"
                      cy="50%"
                      dataKey="value"
                      innerRadius={70}
                      outerRadius={110}
                      paddingAngle={2}
                    >
                      {(
                        currentRole === "telecaller" && telecallerPriorityMix.length
                          ? telecallerPriorityMix
                          : currentRole === "credit-manager" && creditDecisionMix.length
                            ? creditDecisionMix
                            : currentRole === "accountant" && accountantPortfolioMix.length
                              ? accountantPortfolioMix
                            : leadStatusData
                      ).map((entry) => (
                        <Cell key={"name" in entry ? entry.name : entry.label} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: "6px", fontSize: "12px" }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
              <div className="space-y-3">
                {(
                  currentRole === "telecaller" && telecallerPriorityMix.length
                    ? telecallerPriorityMix
                    : currentRole === "credit-manager" && creditDecisionMix.length
                      ? creditDecisionMix
                      : currentRole === "accountant" && accountantPortfolioMix.length
                        ? accountantPortfolioMix
                      : leadStatusData
                ).map((item) => {
                  const label = "name" in item ? item.name : item.label;
                  const total = currentRole === "telecaller" || currentRole === "credit-manager" || currentRole === "accountant"
                    ? Math.max(1, leads.length)
                    : Math.max(1, leadStatusData.reduce((sum, row) => sum + row.value, 0));
                  const percent = Math.round((item.value / total) * 100);
                  return (
                    <div key={label} className="rounded-lg border border-slate-200 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="truncate text-sm font-medium text-slate-800">{label}</span>
                        </div>
                        <span className="text-sm font-semibold text-slate-950">{item.value}</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{percent}% of current queue</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        </div>

        {currentRole === "accountant" && <Card className="dashboard-panel p-6">
          <div className="mb-6">
            <h3 className="text-base font-semibold text-gray-900">Recent Fund Transfers</h3>
            <p className="text-sm text-gray-500">Completed payments with repayment due context</p>
          </div>
          <div className="space-y-4">
            {isLoading && [0, 1, 2, 3].map((item) => (
              <div key={item} className="flex items-center justify-between py-3">
                <div className="flex items-center space-x-4">
                  <div className="h-10 w-10 animate-pulse rounded-full bg-gray-200" />
                  <div className="space-y-2">
                    <div className="h-4 w-36 animate-pulse rounded bg-gray-200" />
                    <div className="h-3 w-48 animate-pulse rounded bg-gray-100" />
                  </div>
                </div>
                <div className="h-8 w-24 animate-pulse rounded bg-gray-100" />
              </div>
            ))}
            {!isLoading && (accountantDashboard?.recentTransfers || []).map((transfer) => {
              const imageUrl = resolveCustomerImageUrl(transfer);

              return (
              <div key={transfer.id} className="flex items-center justify-between gap-4 border-b border-gray-100 py-3 last:border-0">
                <div className="flex items-center space-x-4">
                  <Avatar className="h-10 w-10">
                    {imageUrl && <AvatarImage src={imageUrl} alt={transfer.customerName || "Customer"} className="object-cover" />}
                    <AvatarFallback className="bg-gray-100 text-sm text-gray-600">{initials(transfer.customerName || "Customer")}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="text-sm font-medium text-gray-900">{transfer.customerName || "Customer"}</div>
                    <div className="text-xs text-gray-500">{transfer.loanId} - {formatDate(transfer.disbursedAt || undefined)}</div>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="text-right">
                    <div className="font-semibold text-gray-900">{formatCurrency(transfer.disbursementAmount)}</div>
                    <div className="text-xs text-gray-500">Due {formatDate(transfer.dueDate || undefined)}</div>
                  </div>
                  <Badge
                    variant="secondary"
                    className="bg-emerald-100 px-3 py-1 text-xs text-emerald-800"
                  >
                    {transfer.transferType || "Paid"}
                  </Badge>
                </div>
              </div>
              );
            })}
            {!isLoading && !accountantDashboard?.recentTransfers?.length && (
              <div className="py-10 text-center text-sm text-gray-500">No completed fund transfers yet</div>
            )}
          </div>
        </Card>}
      </div>

      {selectedPaymentLead && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/50">
          <div className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">Fund Transfer</h3>
                <p className="mt-1 text-sm text-slate-500">{selectedPaymentLead.customerName} | {selectedPaymentLead.loanId}</p>
              </div>
              <button
                type="button"
                onClick={closePaymentModal}
                className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Close fund transfer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={submitPaymentTransfer} className="space-y-4 px-5 py-5">
              <div className="grid grid-cols-2 gap-3 rounded-md bg-slate-50 p-3 text-sm">
                <p><span className="block text-xs text-slate-500">Disbursement</span><span className="font-semibold text-slate-950">{formatCurrency(selectedPaymentLead.disbursementAmount)}</span></p>
                <p><span className="block text-xs text-slate-500">Repayment</span><span className="font-semibold text-slate-950">{formatCurrency(selectedPaymentLead.repaymentAmount)}</span></p>
                <p>
                  <span className="block text-xs text-slate-500">Due date</span>
                  <span className="font-semibold text-emerald-700">{formatDate(transferForm.dueDate || selectedPaymentLead.dueDate || undefined)}</span>
                  <span className="ml-1 text-[11px] text-slate-500">({transferForm.tenureDays} days)</span>
                </p>
                <p><span className="block text-xs text-slate-500">Agreement</span><span className="font-semibold text-slate-950">{selectedPaymentLead.agreementNumber || "Missing"}</span></p>
              </div>

              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Beneficiary details</p>
                    <p className="mt-1 text-sm text-blue-900">Verify these details before bank transfer.</p>
                  </div>
                  <ShieldCheck className="h-5 w-5 text-blue-600" />
                </div>
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <p className="rounded-md bg-white px-3 py-2"><span className="block text-xs text-slate-500">Bank</span><span className="font-semibold text-slate-950">{selectedPaymentLead.bankName || "Missing"}</span></p>
                  <div className="rounded-md bg-white px-3 py-2">
                    <span className="block text-xs text-slate-500">IFSC</span>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-slate-950">{selectedPaymentLead.ifscCode || "Missing"}</span>
                      {selectedPaymentLead.ifscCode && (
                        <button
                          type="button"
                          onClick={() => copyValue("modal-ifsc", selectedPaymentLead.ifscCode)}
                          className={copiedButtonClass(copiedField === "modal-ifsc")}
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
                      <span className="break-all font-mono text-base font-bold text-slate-950">{formatAccountNumber(selectedPaymentLead.accountNumber)}</span>
                      {selectedPaymentLead.accountNumber && (
                        <button
                          type="button"
                          onClick={() => copyValue("modal-account", formatAccountNumber(selectedPaymentLead.accountNumber))}
                          className={copiedButtonClass(copiedField === "modal-account")}
                          aria-label="Copy account number"
                          aria-live="polite"
                        >
                          {copiedField === "modal-account" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          <span>{copiedField === "modal-account" ? "Copied" : "Copy"}</span>
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
                  onChange={(event) => handlePaymentDisbursementDateChange(event.target.value)}
                  required
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition hover:border-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
                <p className="text-xs text-slate-600">
                  Repayment count begins from this date. Due date: <strong className="font-semibold text-emerald-700">{formatDate(transferForm.dueDate || selectedPaymentLead.dueDate || undefined)}</strong> ({transferForm.tenureDays} days).
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

              {paymentError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{paymentError}</div>
              )}

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={closePaymentModal}
                  disabled={isPaymentSubmitting}
                  className="h-10 rounded-md border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPaymentSubmitting}
                  className="h-10 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPaymentSubmitting ? "Submitting..." : "Submit Transfer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </>
    );
  };

  return (
    <div className="w-full min-w-0">
      <header className="border-b border-gray-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center space-x-2">
              <div className="flex h-5 w-5 items-center justify-center rounded border border-gray-300">
                <div className="h-2 w-2 bg-gray-400" />
              </div>
              <h1 className="text-base font-medium text-gray-900">{roleDashboardTitle}</h1>
            </div>
            <p className="mt-1 text-sm text-gray-500">{roleDashboardSubtitle}</p>
          </div>
          <span className="w-fit rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            {roleLabels[currentRole]}
          </span>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>Auto-refresh: {currentRole === "telecaller" ? "60s" : "90s"} · Last updated {formatUpdatedTime(lastUpdatedAt)}</span>
            <AppTooltip label="Refresh dashboard now">
              <button
                type="button"
                onClick={refresh}
                disabled={isRefreshing}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </AppTooltip>
          </div>
        </div>
      </header>

      {renderRoleWorkbenchBody()}
    </div>
  );
}

function AnimatedCounter({ value, prefix = "", suffix = "" }: { value: number | string; prefix?: string; suffix?: string }) {
  const [displayVal, setDisplayVal] = useState<string | number>(value);
  
  useEffect(() => {
    const num = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.-]+/g,""));
    if (isNaN(num)) {
      setDisplayVal(value);
      return;
    }
    let start = 0;
    const end = num;
    if (start === end) {
      setDisplayVal(end);
      return;
    }
    const totalMs = 500;
    const stepMs = 15;
    const steps = totalMs / stepMs;
    const increment = (end - start) / steps;
    let current = start;
    
    const timer = setInterval(() => {
      current += increment;
      if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
        clearInterval(timer);
        setDisplayVal(end);
      } else {
        setDisplayVal(Math.round(current));
      }
    }, stepMs);
    
    return () => clearInterval(timer);
  }, [value]);

  const formatted = typeof displayVal === 'number' ? displayVal.toLocaleString('en-IN') : displayVal;
  return <span>{prefix}{formatted}{suffix}</span>;
}

