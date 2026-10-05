import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileCheck2,
  FileSignature,
  FileText,
  RefreshCw,
  Search,
  Send,
  X,
  Trash2,
  Copy,
  Building2,
} from "lucide-react";

import { AppTooltip } from "../components/ui/app-tooltip";
import { NiceSelect } from "../components/ui/nice-select";
import { apiGet, apiGetBlob, apiPost, apiDelete } from "../lib/api";
import { useSmartPolling } from "../lib/useSmartPolling";
import { useAuth } from "../lib/auth";
import { ConfirmationModal } from "../components/ui/ConfirmationModal";

type CreditApplication = {
  id: string;
  rawId?: string;
  name: string;
  email: string;
  phone: string;
  loanAmount: number;
  priority: string;
  status: string;
  assignedTo: string;
  monthlyIncome: number;
  panNumber: string;
  createdAt: string;
  submittedBy: string;
  submittedAt: string | null;
  reviewedBy: string;
  reviewedAt: string | null;
  decision: string;
  decisionNotes: string;
  handoffStatus: string;
  handoffAgeHours: number;
  documentTotalCount: number;
  documentVerifiedCount: number;
  pendingDocumentCount: number;
  camSheetId: number | null;
  camStatus: string;
  camVersion: number | null;
  camCreatedAt: string | null;
  sanctionId: number | null;
  agreementNumber: string;
  sanctionEmailStatus: string;
  sanctionSentAt: string | null;
  sanctionPdfPath: string;
  sanctionWhatsappStatus: string;
  sanctionWhatsappError: string;
  sanctionWhatsappSentAt: string | null;
  sanctionAmount: number;
  disbursementAmount: number;
  repaymentAmount: number;
  loanAgreementId: number | null;
  loanAgreementStatus: string;
  loanAgreementProviderStatus: string;
  loanAgreementSentAt: string | null;
  loanAgreementSignedAt: string | null;
  signingUrl: string;
  agreementPdfPath: string;
  signedAgreementPdfPath: string;
  accountingHandoffAt: string | null;
  accountingHandoffBy: string;
  accountAggregatorStatus?: string;
  accountAggregatorFipName?: string;
  stage: string;
  isDuplicate?: boolean | number;
  duplicateCount?: number;
};


type StageTab =
  | "all"
  | "in-review"
  | "sanction-sent"
  | "agreement-pending-esign"
  | "agreement-signed"
  | "sent-to-accountant"
  | "failed"
  | "rejected"
  | "disbursed"
  | "closed";

type CreditApplicationsResponse = {
  counts: Record<StageTab, number>;
  items: CreditApplication[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  stats: {
    agreementPending: number;
    agreementSigned: number;
    inReview: number;
    sanctioned: number;
  };
};

const PAGE_SIZE = 10;

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

const DEFAULT_DOCUMENT_BASE_URL = "https://payday-api.waqtmoney.com/uploads";
const documentBaseUrl = String(import.meta.env.VITE_DOCUMENT_BASE_URL || DEFAULT_DOCUMENT_BASE_URL).replace(/\/$/, "");

const openDocument = async (path: string) => {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) {
    try {
      const url = new URL(path);
      if (!url.pathname.startsWith("/uploads/")) {
        window.open(path, "_blank", "noopener,noreferrer");
        return;
      }
    } catch {
      window.open(path, "_blank", "noopener,noreferrer");
      return;
    }
  }
  const href = path.startsWith("/") ? path : `/${path}`;
  if (!href.startsWith("/uploads/")) {
    window.open(href, "_blank", "noopener,noreferrer");
    return;
  }
  const uploadHref = /^https?:\/\//i.test(path)
    ? path
    : /^https?:\/\//i.test(documentBaseUrl)
      ? `${documentBaseUrl}/${href.replace(/^\/uploads\//, "")}`
      : href;
  try {
    const blob = await apiGetBlob(uploadHref);
    const objectUrl = URL.createObjectURL(blob);
    window.open(objectUrl, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch {
    window.open(href, "_blank", "noopener,noreferrer");
  }
};

const stageSlug = (stage: string) => stage.toLowerCase().replace(/\s+/g, "-");

const stageClasses: Record<string, string> = {
  "Agreement Failed": "bg-red-50 text-red-700 border-red-200",
  "Agreement Pending eSign": "bg-amber-50 text-amber-700 border-amber-200",
  "Agreement Signed": "bg-green-50 text-green-700 border-green-200",
  Disbursed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  "In Review": "bg-blue-50 text-blue-700 border-blue-200",
  Rejected: "bg-red-50 text-red-700 border-red-200",
  "Sanction Failed": "bg-red-50 text-red-700 border-red-200",
  "Sanction Sent": "bg-indigo-50 text-indigo-700 border-indigo-200",
  "Sent to Accountant": "bg-slate-50 text-slate-700 border-slate-200",
  Closed: "bg-slate-100 text-slate-600 border-slate-350",
};

const deliveryLabel = (value?: string) => {
  const status = String(value || "pending").trim().toLowerCase();
  if (status === "sent") return "Sent";
  if (status === "failed") return "Failed";
  if (status === "skipped") return "Skipped";
  return "Pending";
};

const priorityClasses: Record<string, string> = {
  High: "bg-red-50 text-red-700",
  Low: "bg-slate-100 text-slate-700",
  Medium: "bg-amber-50 text-amber-700",
  Urgent: "bg-rose-50 text-rose-700",
};

const tabs: Array<{ id: StageTab; label: string }> = [
  { id: "all", label: "All" },
  { id: "in-review", label: "In Review" },
  { id: "sanction-sent", label: "Sanction Sent" },
  { id: "agreement-pending-esign", label: "Agreement Pending" },
  { id: "agreement-signed", label: "Agreement Signed" },
  { id: "sent-to-accountant", label: "Sent to Accountant" },
  { id: "failed", label: "Failed" },
  { id: "rejected", label: "Rejected" },
  { id: "disbursed", label: "Disbursed" },
  { id: "closed", label: "Closed" },
];

function WorkflowSteps({ application }: { application: CreditApplication }) {
  const steps = [
    { done: Boolean(application.submittedAt), label: "Handoff" },
    { done: Boolean(application.camSheetId), label: "CAM" },
    { done: application.sanctionEmailStatus === "sent", label: "Sanction" },
    { done: Boolean(application.loanAgreementId), label: "Agreement" },
    { done: application.loanAgreementStatus === "signed", label: "Signed" },
    { done: application.status === "Converted", label: "Disbursed" },
  ];
  const completedCount = steps.filter((step) => step.done).length;

  return (
    <div className="flex items-center gap-2">
      {steps.map((step) => (
        <AppTooltip
          key={step.label}
          label={step.label}
        >
          <span className={`h-2.5 w-2.5 rounded-full ring-4 ${
            step.done ? "bg-emerald-500 ring-emerald-50" : "bg-slate-300 ring-slate-50"
          }`} />
        </AppTooltip>
      ))}
      <span className="ml-1 text-xs font-semibold text-slate-600">{completedCount}/{steps.length}</span>
    </div>
  );
}

function nextAction(application: CreditApplication) {
  if (application.stage === "In Review") return "Open CAM decision";
  if (application.stage === "Sanction Sent") return "Send agreement eSign";
  if (application.stage === "Agreement Pending eSign") return "Track customer signing";
  if (application.stage === "Agreement Signed") return "Accountant can disburse";
  if (application.stage === "Rejected") return "View rejection reason";
  if (application.stage === "Disbursed") return "Completed";
  if (application.stage.includes("Failed")) return "Open lead and retry";
  return "Open lead details";
}

export function CreditApplications() {
  const { user, activeRole } = useAuth();
  const currentRole = activeRole || user?.role || "";
  const isAdmin = currentRole === "product-admin" || currentRole === "superadmin";

  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get("tab") || "all") as StageTab;
  const [applications, setApplications] = useState<CreditApplication[]>([]);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [activeTab, setActiveTab] = useState<StageTab>(tabs.some((tab) => tab.id === initialTab) ? initialTab : "all");
  const [currentPage, setCurrentPage] = useState(1);

  const [deleteAppId, setDeleteAppId] = useState<string | null>(null);
  const [isDeletingApp, setIsDeletingApp] = useState(false);

  const handleDelete = (id: string) => {
    setDeleteAppId(id);
  };

  const confirmDeleteApp = async () => {
    if (!deleteAppId) return;
    setIsDeletingApp(true);
    try {
      await apiDelete(`/leads/${deleteAppId}`);
      refresh();
      setDeleteAppId(null);
    } catch (err: any) {
      console.error("Failed to delete lead:", err);
    } finally {
      setIsDeletingApp(false);
    }
  };
  const [counts, setCounts] = useState<Record<StageTab, number> | null>(null);
  const [pagination, setPagination] = useState<CreditApplicationsResponse["pagination"] | null>(null);
  const [serverStats, setServerStats] = useState<CreditApplicationsResponse["stats"] | null>(null);
  const [handoffLeadId, setHandoffLeadId] = useState("");

  const loadApplications = useCallback(async (signal: AbortSignal) => {
    try {
      setError("");
      const params = new URLSearchParams({
        page: String(currentPage),
        pageSize: String(PAGE_SIZE),
        stage: activeTab,
      });
      if (debouncedSearchTerm.trim()) params.set("search", debouncedSearchTerm.trim());
      if (priorityFilter !== "all") params.set("priority", priorityFilter);
      const data = await apiGet<CreditApplicationsResponse>(`/leads/credit-applications-v2?${params.toString()}`, signal);
      setApplications(data.items);
      setCounts(data.counts);
      setPagination(data.pagination);
      setServerStats(data.stats);
    } catch (requestError) {
      if (!signal.aborted) {
        setError(requestError instanceof Error ? requestError.message : "Unable to load credit applications");
      }
    }
  }, [activeTab, currentPage, debouncedSearchTerm, priorityFilter]);

  const { isRefreshing, lastUpdatedAt, refresh } = useSmartPolling(loadApplications, {
    enabled: true,
    intervalMs: 60_000,
  });
  const isLoading = isRefreshing && !lastUpdatedAt;

  const isMountedRef = useRef(false);

  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }
    refresh();
  }, [activeTab, currentPage, debouncedSearchTerm, priorityFilter, refresh]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    const nextTab = searchParams.get("tab") as StageTab | null;
    if (nextTab && tabs.some((tab) => tab.id === nextTab)) {
      setActiveTab(nextTab);
      setCurrentPage(1);
    }
  }, [searchParams]);

  const setTab = (tab: StageTab) => {
    setActiveTab(tab);
    setCurrentPage(1);
    setSearchParams(tab === "all" ? {} : { tab });
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [priorityFilter]);

  const tabCounts = counts || Object.fromEntries(tabs.map((tab) => [tab.id, 0])) as Record<StageTab, number>;
  const stats = serverStats || {
    agreementPending: 0,
    agreementSigned: 0,
    inReview: 0,
    sanctioned: 0,
  };
  const safePage = pagination?.page || currentPage;
  const totalPages = pagination?.totalPages || 1;
  const totalItems = pagination?.totalItems || 0;
  const hasActiveFilters = Boolean(searchTerm || debouncedSearchTerm || priorityFilter !== "all");
  const clearFilters = () => {
    setSearchTerm("");
    setDebouncedSearchTerm("");
    setPriorityFilter("all");
    setCurrentPage(1);
  };

  const sendToAccountant = async (application: CreditApplication) => {
    try {
      setHandoffLeadId(application.id);
      await apiPost(`/leads/${encodeURIComponent(application.id)}/accounting-handoff`, {
        user: "Credit Manager",
      });
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to send lead to accountant");
    } finally {
      setHandoffLeadId("");
    }
  };

  return (
    <div className="w-full min-w-0 px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Credit lifecycle</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">Credit Applications</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Search and track every lead after telecaller handoff: CAM, sanction, agreement eSign, accountant queue, rejection, and disbursement.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-slate-500">
            Auto-refresh: 60s | Last updated {lastUpdatedAt ? lastUpdatedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "Not yet"}
          </span>
          <AppTooltip label="Refresh application ledger now">
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

      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "In review",
            value: stats.inReview,
            icon: FileText,
            note: "Needs credit decision",
            accentGradient: "from-blue-500 via-cyan-400 to-indigo-500",
            auraGradient: "from-blue-200/70 via-indigo-200/40 to-transparent dark:from-blue-500/25 dark:via-indigo-500/15",
            cardBorder: "border-blue-200/70 dark:border-blue-900/50 hover:border-blue-400 dark:hover:border-blue-600",
            bgTint: "from-white via-blue-50/20 to-indigo-50/20 dark:from-slate-900 dark:via-blue-950/30 dark:to-slate-900",
            iconBg: "bg-blue-100/80 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-700/60 shadow-xs",
            numColor: "text-blue-700 dark:text-blue-400"
          },
          {
            label: "Sanction sent",
            value: stats.sanctioned,
            icon: Send,
            note: "Next: agreement eSign",
            accentGradient: "from-purple-500 via-violet-400 to-indigo-500",
            auraGradient: "from-purple-200/70 via-violet-200/40 to-transparent dark:from-purple-500/25 dark:via-violet-500/15",
            cardBorder: "border-purple-200/70 dark:border-purple-900/50 hover:border-purple-400 dark:hover:border-purple-600",
            bgTint: "from-white via-purple-50/20 to-violet-50/20 dark:from-slate-900 dark:via-purple-950/30 dark:to-slate-900",
            iconBg: "bg-purple-100/80 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 border border-purple-200 dark:border-purple-700/60 shadow-xs",
            numColor: "text-purple-700 dark:text-purple-400"
          },
          {
            label: "Agreement pending",
            value: stats.agreementPending,
            icon: FileSignature,
            note: "Waiting on customer",
            accentGradient: "from-emerald-500 via-teal-400 to-green-500",
            auraGradient: "from-emerald-200/70 via-teal-200/40 to-transparent dark:from-emerald-500/25 dark:via-teal-500/15",
            cardBorder: "border-emerald-200/70 dark:border-emerald-900/50 hover:border-emerald-400 dark:hover:border-emerald-600",
            bgTint: "from-white via-emerald-50/20 to-teal-50/20 dark:from-slate-900 dark:via-emerald-950/30 dark:to-slate-900",
            iconBg: "bg-emerald-100/80 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700/60 shadow-xs",
            numColor: "text-emerald-700 dark:text-emerald-400"
          },
          {
            label: "Agreement signed",
            value: stats.agreementSigned,
            icon: FileCheck2,
            note: "Ready for accountant",
            accentGradient: "from-teal-500 via-cyan-400 to-indigo-500",
            auraGradient: "from-teal-200/70 via-cyan-200/40 to-transparent dark:from-teal-500/25 dark:via-cyan-500/15",
            cardBorder: "border-teal-200/70 dark:border-teal-900/50 hover:border-teal-400 dark:hover:border-teal-600",
            bgTint: "from-white via-teal-50/20 to-indigo-50/20 dark:from-slate-900 dark:via-teal-950/30 dark:to-slate-900",
            iconBg: "bg-teal-100/80 dark:bg-teal-900/40 text-teal-600 dark:text-teal-300 border border-teal-200 dark:border-teal-700/60 shadow-xs",
            numColor: "text-teal-700 dark:text-teal-400"
          }
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className={`group relative overflow-hidden bg-gradient-to-br ${card.bgTint} border ${card.cardBorder} rounded-2xl p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300`}>
              {/* Top-Right Dynamic Accent Aura Glow */}
              <div className={`absolute -top-8 -right-8 w-28 h-28 rounded-full bg-gradient-to-br ${card.auraGradient} blur-xl pointer-events-none group-hover:scale-125 transition-transform duration-500`} />

              {/* Top Accent Stripe */}
              <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${card.accentGradient}`} />

              <div className="relative z-10 flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">{card.label}</p>
                <div className={`p-2 rounded-xl ${card.iconBg}`}>
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <p className={`relative z-10 mt-2 text-2xl font-black ${card.numColor}`}>{card.value}</p>
              <p className="relative z-10 mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium">{card.note}</p>
            </div>
          );
        })}
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">Application Ledger</h2>
          <p className="mt-1 text-sm text-slate-500">Use this page when a lead has moved out of the review queue but still needs tracking.</p>
        </div>

        {error && <div className="m-5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="overflow-x-auto border-b border-slate-200 px-5 py-3">
          <div className="flex min-w-max gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTab(tab.id)}
                className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold transition ${
                  activeTab === tab.id
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
                }`}
              >
                {tab.label}
                <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[11px] ${
                  activeTab === tab.id ? "bg-white/20 text-white" : "bg-white text-slate-600"
                }`}>
                  {tabCounts[tab.id]}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 border-b border-slate-200 bg-slate-50/50 px-5 py-4 lg:grid-cols-[minmax(240px,1fr)_180px_auto]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search name, phone, email, PAN, application ID, agreement no..."
              className="h-10 w-full rounded-md border border-slate-300 pl-9 pr-3 text-sm outline-none transition hover:border-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <NiceSelect
            ariaLabel="Filter by priority"
            value={priorityFilter}
            onValueChange={(value) => setPriorityFilter(value)}
            options={[
              { label: "All priorities", value: "all" },
              { label: "Urgent", value: "Urgent" },
              { label: "High", value: "High" },
              { label: "Medium", value: "Medium" },
              { label: "Low", value: "Low" },
            ]}
          />
          <button
            type="button"
            onClick={clearFilters}
            disabled={!hasActiveFilters}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
          >
            <X className="h-4 w-4" />
            Reset
          </button>
        </div>

        <div className="divide-y divide-slate-200">
          {isLoading && [0, 1, 2].map((item) => (
            <div key={item} className="px-5 py-5">
              <div className="h-5 w-full animate-pulse rounded bg-slate-100" />
            </div>
          ))}

          {!isLoading && applications.map((application) => (
            <article key={`${application.id}-${application.loanAgreementId || application.sanctionId || application.handoffStatus}`} className="px-5 py-4 transition hover:bg-slate-50">
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(280px,1fr)_minmax(360px,1.45fr)_170px] xl:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-base font-semibold text-slate-950">{application.name}</h3>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${priorityClasses[application.priority] || "bg-slate-100 text-slate-700"}`}>
                      {application.priority}
                    </span>
                    {(Boolean(application.isDuplicate) || Number(application.duplicateCount || 0) > 0) && (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-300 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-300" title="Same Name, Mobile, or PAN exists in CRM">
                        <Copy className="h-3 w-3 text-amber-600" />
                        Duplicate ({application.duplicateCount || 1})
                      </span>
                    )}
                  </div>

                  <p className="mt-1 truncate text-xs text-slate-500">{application.id} | {application.phone || "No phone"}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="font-bold text-slate-950">{formatCurrency(application.sanctionAmount || application.loanAmount)}</span>
                    {application.sanctionAmount > 0 && application.sanctionAmount !== application.loanAmount && (
                      <span className="text-xs text-slate-500">Requested {formatCurrency(application.loanAmount)}</span>
                    )}
                    {application.agreementNumber && (
                      <span className="text-xs text-slate-500">Agreement: {application.agreementNumber}</span>
                    )}
                  </div>
                </div>

                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${stageClasses[application.stage] || "border-slate-200 bg-slate-50 text-slate-700"}`}>
                      {application.stage}
                    </span>
                    <span className="text-xs text-slate-500">{nextAction(application)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                    <WorkflowSteps application={application} />
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>Docs <b className="text-slate-800">{application.documentVerifiedCount}/{application.documentTotalCount}</b></span>
                      <span>Sanction <b className="text-slate-800">{application.sanctionEmailStatus || "Not sent"}</b></span>
                      {application.customerDecision === "accepted" ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          Sanction Accepted
                        </span>
                      ) : application.customerDecision === "rejected" ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-700">
                          <X className="h-3.5 w-3.5 text-rose-600" />
                          Sanction Rejected
                        </span>
                      ) : application.sanctionEmailStatus === "sent" ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                          <Clock className="h-3.5 w-3.5 text-amber-600 animate-pulse" />
                          Awaiting Decision
                        </span>
                      ) : null}
                      <span>Sanction WA <b className="text-slate-800">{deliveryLabel(application.sanctionWhatsappStatus)}</b></span>
                      <span>Digio <b className="text-slate-800">{application.loanAgreementProviderStatus || application.loanAgreementStatus || "Not sent"}</b></span>
                      <span>AA Finvu <b className={application.accountAggregatorStatus === "COMPLETED" || application.accountAggregatorStatus === "ACTIVE" ? "text-emerald-700 font-bold" : "text-slate-800"}>{application.accountAggregatorStatus || "Not initiated"}</b></span>
                    </div>
                  </div>
                  {application.sanctionWhatsappError && (
                    <AppTooltip label={application.sanctionWhatsappError}>
                      <p className="truncate text-xs text-red-600">
                        {application.sanctionWhatsappError}
                      </p>
                    </AppTooltip>
                  )}
                  {application.decisionNotes && (
                    <AppTooltip label={application.decisionNotes}>
                      <p className="truncate text-xs text-slate-500">{application.decisionNotes}</p>
                    </AppTooltip>
                  )}
                </div>

                <div className="flex flex-wrap justify-start gap-2 xl:justify-end">
                  <AppTooltip label="Open lead details">
                    <Link
                      to={`/leads/${encodeURIComponent(application.id)}`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-blue-600 text-white transition hover:bg-blue-700"
                      aria-label={`Open ${application.name}`}
                    >
                      <Eye className="h-4 w-4" />
                    </Link>
                  </AppTooltip>
                  <AppTooltip label="Open Account Aggregator (Bank Statement & Cash Flow)">
                    <Link
                      to={`/leads/${encodeURIComponent(application.id)}`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-indigo-200 bg-indigo-50 text-indigo-700 transition hover:bg-indigo-100"
                      aria-label={`Open Account Aggregator for ${application.name}`}
                    >
                      <Building2 className="h-4 w-4" />
                    </Link>
                  </AppTooltip>
                  <AppTooltip label="Open credit decision section">
                    <Link
                      to={`/leads/${encodeURIComponent(application.id)}?section=credit`}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100"
                      aria-label={`Open credit decision for ${application.name}`}
                    >
                      <FileCheck2 className="h-4 w-4" />
                    </Link>
                  </AppTooltip>
                  {application.sanctionPdfPath && (
                    <AppTooltip label="Download sanction PDF">
                      <button
                        type="button"
                        onClick={() => openDocument(application.sanctionPdfPath)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
                        aria-label={`Download sanction for ${application.name}`}
                      >
                        <Download className="h-4 w-4" />
                      </button>
                    </AppTooltip>
                  )}
                  {application.signingUrl && (
                    <AppTooltip label="Open Digio signing link">
                      <a
                        href={application.signingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-amber-700 transition hover:bg-amber-100"
                        aria-label={`Open signing link for ${application.name}`}
                      >
                        <FileSignature className="h-4 w-4" />
                      </a>
                    </AppTooltip>
                  )}
                  {application.signedAgreementPdfPath && (
                    <AppTooltip label="Download signed agreement">
                      <button
                        type="button"
                        onClick={() => openDocument(application.signedAgreementPdfPath)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-green-200 bg-green-50 text-green-700 transition hover:bg-green-100"
                        aria-label={`Download signed agreement for ${application.name}`}
                      >
                        <FileText className="h-4 w-4" />
                      </button>
                    </AppTooltip>
                  )}
                  {application.loanAgreementStatus === "signed" && !application.accountingHandoffAt && (
                    <AppTooltip label="Send signed lead to accountant queue">
                      <button
                        type="button"
                        onClick={() => sendToAccountant(application)}
                        disabled={handoffLeadId === application.id}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-purple-200 bg-purple-50 text-purple-700 transition hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-60"
                        aria-label={`Send ${application.name} to accountant`}
                      >
                        {handoffLeadId === application.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </button>
                    </AppTooltip>
                  )}
                  {isAdmin && (
                    <AppTooltip label="Delete application">
                      <button
                        type="button"
                        onClick={() => handleDelete(application.id)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-rose-200 bg-rose-50 text-rose-700 transition hover:bg-rose-100 cursor-pointer"
                        aria-label={`Delete ${application.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </AppTooltip>
                  )}
                </div>
              </div>
            </article>
          ))}

          {!isLoading && applications.length === 0 && (
            <div className="px-5 py-14 text-center">
              <AlertCircle className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-semibold text-slate-800">No credit applications found</p>
              <p className="mt-1 text-sm text-slate-500">Try another tab, priority, or search by application ID / agreement number.</p>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <span>Page {safePage} of {totalPages} - {totalItems} application{totalItems === 1 ? "" : "s"}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={safePage <= 1 || isRefreshing}
              className="inline-flex items-center gap-1 rounded-full border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={safePage >= totalPages || isRefreshing}
              className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </section>

      <ConfirmationModal
        isOpen={Boolean(deleteAppId)}
        onClose={() => setDeleteAppId(null)}
        onConfirm={confirmDeleteApp}
        isLoading={isDeletingApp}
        title="Delete Credit Application"
        description={`Are you sure you want to permanently delete application #${deleteAppId}? All related documents, activity logs, and records will be removed.`}
        confirmText="Delete Application"
        cancelText="Cancel"
        variant="danger"
        iconType="delete"
      />
    </div>
  );
}
