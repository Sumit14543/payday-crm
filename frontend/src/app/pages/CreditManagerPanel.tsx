import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  Eye,
  FileSearch,
  FileWarning,
  RefreshCw,
  Search,
  ShieldCheck,
  TrendingUp,
  X,
  Trash2,
  Maximize2,
  Star,
  Sparkles,
  Mail,
  Phone,
  Building2,
} from "lucide-react";
import { AppTooltip } from "../components/ui/app-tooltip";
import { NiceSelect } from "../components/ui/nice-select";
import { EmptyState, MetricCard, PriorityBadge, ProgressIndicator } from "../components/crm/DashboardPrimitives";
import { apiGet, apiDelete } from "../lib/api";
import { ConfirmationModal } from "../components/ui/ConfirmationModal";
import { useSmartPolling } from "../lib/useSmartPolling";
import { useAuth } from "../lib/auth";

type LeadQueueItem = {
  id: string;
  rawId?: string;
  name: string;
  email?: string;
  phone?: string;
  loanAmount: number | null;
  priority: string;
  status: string;
  monthlyIncome: number;
  panNumber?: string;
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  salarySlipCurrent?: string;
  aadhaarVerified?: number;
  submittedAt?: string;
  submittedBy?: string;
  handoffNotes?: string;
  latestCallDisposition?: string;
  latestCallAt?: string | null;
  documentTotalCount?: number;
  documentVerifiedCount?: number;
  pendingDocumentCount?: number;
  handoffAgeHours?: number;
};

type CreditTab = "all" | "new" | "high-priority" | "docs-gap" | "sla-risk" | "ready";

type CreditQueueResponse = {
  counts: {
    all: number;
    docsGap: number;
    highPriority: number;
    new: number;
    ready: number;
    slaRisk: number;
  };
  items: LeadQueueItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  stats: {
    averageReadiness: number;
    docsGapCount: number;
    highPriorityCount: number;
    readyCount: number;
    slaRiskCount: number;
    total: number;
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
  if (!value) return "Not provided";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
};

const formatUpdatedTime = (value: Date | null) => (
  value ? value.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "Not yet"
);

const getReadiness = (lead: LeadQueueItem) => {
  if (Number(lead.documentTotalCount || 0) > 0) {
    return Math.round((Number(lead.documentVerifiedCount || 0) / Number(lead.documentTotalCount || 1)) * 100);
  }

  const checks = [
    Boolean(lead.panNumber),
    Boolean(lead.aadhaarVerified),
    Boolean(lead.bankName && lead.accountNumber && lead.ifscCode),
    Boolean(lead.salarySlipCurrent),
    Number(lead.monthlyIncome || 0) >= 15000,
  ];

  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
};

const isHighPriority = (lead: LeadQueueItem) => ["High", "Urgent"].includes(lead.priority);
const hasDocsGap = (lead: LeadQueueItem) => Number(lead.pendingDocumentCount || 0) > 0;
const isSlaRisk = (lead: LeadQueueItem) => Number(lead.handoffAgeHours || 0) >= 24;
const isNewHandoff = (lead: LeadQueueItem) => Number(lead.handoffAgeHours || 0) <= 2;

const priorityClasses: Record<string, string> = {
  High: "bg-red-50 text-red-700",
  Low: "bg-slate-100 text-slate-700",
  Medium: "bg-amber-50 text-amber-700",
  Urgent: "bg-rose-50 text-rose-700",
};

export function CreditManagerPanel() {
  const { user, activeRole } = useAuth();
  const currentRole = activeRole || user?.role || "";
  const isAdmin = currentRole === "product-admin" || currentRole === "superadmin";

  const [leads, setLeads] = useState<LeadQueueItem[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [priorityFilter, setPriorityFilter] = useState("all");

  const [deleteLeadId, setDeleteLeadId] = useState<string | null>(null);
  const [isDeletingLead, setIsDeletingLead] = useState(false);

  const handleDelete = (id: string) => {
    setDeleteLeadId(id);
  };

  const confirmDeleteLead = async () => {
    if (!deleteLeadId) return;
    setIsDeletingLead(true);
    try {
      await apiDelete(`/leads/${deleteLeadId}`);
      refresh();
      setDeleteLeadId(null);
    } catch (err: any) {
      console.error("Failed to delete lead:", err);
    } finally {
      setIsDeletingLead(false);
    }
  };
  const [showFullImage, setShowFullImage] = useState(false);
  const [readinessFilter, setReadinessFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<CreditTab>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [counts, setCounts] = useState<CreditQueueResponse["counts"] | null>(null);
  const [pagination, setPagination] = useState<CreditQueueResponse["pagination"] | null>(null);
  const [serverStats, setServerStats] = useState<CreditQueueResponse["stats"] | null>(null);

  const loadCreditQueue = useCallback(async (signal: AbortSignal) => {
    try {
      setError("");
      const params = new URLSearchParams({
        page: String(currentPage),
        pageSize: String(PAGE_SIZE),
        tab: activeTab,
      });
      if (debouncedSearchTerm.trim()) params.set("search", debouncedSearchTerm.trim());
      if (priorityFilter !== "all") params.set("priority", priorityFilter);
      if (readinessFilter !== "all") params.set("readiness", readinessFilter);
      const data = await apiGet<CreditQueueResponse>(`/leads/credit-queue-v2?${params.toString()}`, signal);
      setLeads(data.items);
      setCounts(data.counts);
      setPagination(data.pagination);
      setServerStats(data.stats);
    } catch (requestError) {
      if (!signal.aborted) {
        setError(requestError instanceof Error ? requestError.message : "Unable to load credit queue");
      }
    }
  }, [activeTab, currentPage, debouncedSearchTerm, priorityFilter, readinessFilter]);

  const { isRefreshing, lastUpdatedAt, refresh } = useSmartPolling(loadCreditQueue, {
    enabled: true,
    intervalMs: 60_000,
  });

  useEffect(() => {
    setIsLoading(isRefreshing && !lastUpdatedAt);
  }, [isRefreshing, lastUpdatedAt]);

  const isMountedRef = useRef(false);

  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }
    refresh();
  }, [activeTab, currentPage, debouncedSearchTerm, priorityFilter, readinessFilter, refresh]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, priorityFilter, readinessFilter]);

  const stats = serverStats || {
    averageReadiness: 0,
    docsGapCount: 0,
    highPriorityCount: 0,
    readyCount: 0,
    slaRiskCount: 0,
    total: 0,
  };

  const tabCounts: Record<CreditTab, number> = {
    all: counts?.all || 0,
    "docs-gap": counts?.docsGap || 0,
    "high-priority": counts?.highPriority || 0,
    new: counts?.new || 0,
    ready: counts?.ready || 0,
    "sla-risk": counts?.slaRisk || 0,
  };
  const safePage = pagination?.page || currentPage;
  const totalPages = pagination?.totalPages || 1;
  const totalItems = pagination?.totalItems || 0;
  const hasActiveFilters = Boolean(searchTerm || debouncedSearchTerm || priorityFilter !== "all" || readinessFilter !== "all");
  const clearFilters = () => {
    setSearchTerm("");
    setDebouncedSearchTerm("");
    setPriorityFilter("all");
    setReadinessFilter("all");
    setCurrentPage(1);
  };

  const tabs: Array<{ id: CreditTab; label: string }> = [
    { id: "all", label: "All" },
    { id: "new", label: "New Handoffs" },
    { id: "high-priority", label: "High Priority" },
    { id: "docs-gap", label: "Docs Gap" },
    { id: "sla-risk", label: "SLA Risk" },
    { id: "ready", label: "Decision Ready" },
  ];

  return (
    <div className="w-full min-w-0 px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Credit workspace</p>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-extrabold text-slate-950 tracking-tight">Credit Manager Panel</h1>
          </div>
          <p className="mt-0.5 text-sm text-slate-500">Review telecaller handoffs, resolve document gaps, complete CAM decisions, and track approval movement.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/credit-applications"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <FileSearch className="h-4 w-4" />
            View All Applications
          </Link>
          <span className="text-xs text-slate-500">Auto-refresh: 60s - Last updated {formatUpdatedTime(lastUpdatedAt)}</span>
          <AppTooltip label="Refresh credit queue now">
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

      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        {[
          ["Pending reviews", String(stats.total), "Telecaller approved", "info"],
          ["Decision ready", String(stats.readyCount), "Docs verified", "success"],
          ["Docs gap", String(stats.docsGapCount), "Request or reject docs", "warning"],
          ["SLA risk", String(stats.slaRiskCount), "24h+ pending", "danger"],
          ["Avg readiness", `${stats.averageReadiness}%`, "Current queue", "teal"],
        ].map(([label, value, note, tone]) => (
          <MetricCard
            key={label as string}
            accent={tone as "info" | "success" | "warning" | "danger" | "teal"}
            metric={value as string}
            note={note as string}
            title={label as string}
            trend={tone === "danger" ? "Needs action" : "Live"}
          />
        ))}
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            <h2 className="text-base font-semibold text-slate-950">Credit Review Queue</h2>
          </div>
          <p className="mt-1 text-sm text-slate-500">Only telecaller-approved handoffs appear here. Open lead, review details, request missing documents, then complete decision.</p>
        </div>

        {error && <div className="m-5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="overflow-x-auto border-b border-slate-200 px-5 py-3">
          <div className="flex min-w-max gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
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

        <div className="grid grid-cols-1 gap-3 border-b border-slate-200 bg-slate-50/50 px-5 py-4 lg:grid-cols-[minmax(220px,1fr)_180px_180px_auto]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search lead, phone, PAN, telecaller..."
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
          <NiceSelect
            ariaLabel="Filter by readiness"
            value={readinessFilter}
            onValueChange={(value) => setReadinessFilter(value)}
            options={[
              { label: "All readiness", value: "all" },
              { label: "Decision ready", value: "ready" },
              { label: "Needs document/action", value: "gap" },
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

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                {["Lead", "Requested", "Readiness", "Priority", "Handoff/SLA", "Action"].map((head) => (
                  <th key={head} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">{head}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading && [0, 1, 2].map((item) => (
                <tr key={item}>
                  <td colSpan={6} className="px-5 py-4">
                    <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                  </td>
                </tr>
              ))}
              {!isLoading && leads.map((lead) => {
                const readiness = getReadiness(lead);
                const pendingDocs = Number(lead.pendingDocumentCount || 0);

                return (
                  <tr key={lead.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-slate-950">{lead.name}</p>
                      <p className="text-xs text-slate-500">{lead.id} - {lead.phone || "No phone"}</p>
                      {lead.handoffNotes && (
                        <p className="mt-1 max-w-72 truncate text-xs text-slate-500">{lead.handoffNotes}</p>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-sm font-semibold text-slate-950">{formatCurrency(lead.loanAmount)}</td>
                    <td className="px-5 py-3.5">
                      <ProgressIndicator value={readiness} total={100} label={`${readiness}%`} />
                      <p className={`mt-1 text-xs ${pendingDocs ? "text-amber-700" : "text-emerald-700"}`}>
                        Docs {Number(lead.documentVerifiedCount || 0)}/{Number(lead.documentTotalCount || 0)}
                        {pendingDocs ? ` - ${pendingDocs} pending` : " - ready"}
                      </p>
                    </td>
                    <td className="px-5 py-3.5">
                      <PriorityBadge priority={lead.priority} />
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-700">
                      <p className="font-medium text-slate-900">{lead.submittedBy || "Telecaller"}</p>
                      <p className="text-xs text-slate-500">{formatDate(lead.submittedAt)}</p>
                      <p className={`mt-1 text-xs font-semibold ${isSlaRisk(lead) ? "text-red-700" : "text-slate-500"}`}>
                        {Number(lead.handoffAgeHours || 0)}h pending
                      </p>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <AppTooltip label="Open credit review">
                          <Link
                            to={`/leads/${encodeURIComponent(lead.id)}`}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-blue-600 text-white transition hover:bg-blue-700"
                            aria-label={`Review ${lead.name}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                        </AppTooltip>
                        <AppTooltip label="Account Aggregator (Bank Statement & Cash Flow)">
                          <Link
                            to={`/leads/${encodeURIComponent(lead.id)}`}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-indigo-200 bg-indigo-50 text-indigo-700 transition hover:bg-indigo-100"
                            aria-label={`Open Account Aggregator for ${lead.name}`}
                          >
                            <Building2 className="h-4 w-4" />
                          </Link>
                        </AppTooltip>
                        <AppTooltip label="Open document checks">
                          <Link
                            to={`/leads/${encodeURIComponent(lead.id)}?section=documents`}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-amber-700 transition hover:bg-amber-100"
                            aria-label={`Open documents for ${lead.name}`}
                          >
                            <FileSearch className="h-4 w-4" />
                          </Link>
                        </AppTooltip>
                        <AppTooltip label={pendingDocs ? "Resolve document gaps before decision" : "Decision ready"}>
                          <Link
                            to={`/leads/${encodeURIComponent(lead.id)}?section=credit`}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100"
                            aria-label={`Open credit decision for ${lead.name}`}
                          >
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        </AppTooltip>
                        {isAdmin && (
                          <AppTooltip label="Delete lead">
                            <button
                              type="button"
                              onClick={() => handleDelete(lead.id)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-rose-200 bg-rose-50 text-rose-700 transition hover:bg-rose-100 cursor-pointer"
                              aria-label={`Delete ${lead.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </AppTooltip>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!isLoading && leads.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-sm text-slate-500">
                    <EmptyState
                      title={totalItems === 0 ? "No credit reviews waiting" : "No handoffs match these filters"}
                      description={totalItems === 0
                        ? "Telecaller-approved leads will appear here as soon as they are ready for review."
                        : "Adjust filters to find more handoff leads."}
                      action={hasActiveFilters ? (
                        <button type="button" onClick={clearFilters} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                          Reset filters
                        </button>
                      ) : null}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <span>Page {safePage} of {totalPages} - {totalItems} review{totalItems === 1 ? "" : "s"}</span>
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

      {/* Fullscreen Photo Lightbox Modal */}
      {showFullImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-2xl p-4 animate-in fade-in duration-200">
          <div className="relative max-w-xl w-full flex flex-col items-center">
            {/* Top Bar */}
            <div className="w-full flex items-center justify-between pb-3 text-white">
              <div className="flex items-center gap-2">
                <Building className="h-4.5 w-4.5 text-emerald-400" />
                <span className="text-sm font-bold text-slate-100">
                  {typeof window !== "undefined" && window.location.hostname.includes("testing")
                    ? "Test Credit Manager — Testing Panel"
                    : "Shruti Singh — Senior Credit Manager (WaqtMoney)"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowFullImage(false)}
                className="rounded-full bg-slate-800 p-2 text-white hover:bg-slate-700 transition"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Photo Box */}
            <div className="relative overflow-hidden rounded-3xl border-2 border-emerald-500/50 shadow-2xl bg-slate-900 max-h-[75vh] flex items-center justify-center">
              {typeof window !== "undefined" && window.location.hostname.includes("testing") ? (
                <div className="p-16 text-center text-slate-400">
                  <UserCircle className="h-24 w-24 mx-auto text-indigo-400 mb-2" />
                  <p className="text-base font-bold text-slate-200">Testing Sandbox Account</p>
                </div>
              ) : (
                <img
                  src="/shruti-avatar.jpg"
                  alt="Shruti Credit Manager Full View"
                  className="max-h-[70vh] w-auto object-contain rounded-2xl p-1"
                />
              )}
            </div>

            {/* Bottom Info Bar */}
            <div className="mt-4 flex flex-col items-center gap-2 text-center text-white">
              <div className="flex items-center gap-2 flex-wrap justify-center">
                <span className="rounded-full bg-emerald-500/20 border border-emerald-500/40 px-3.5 py-1 text-xs font-bold text-emerald-400">
                  {typeof window !== "undefined" && window.location.hostname.includes("testing")
                    ? "Credit Manager • Testing Sandbox"
                    : "Senior Credit Manager • WaqtMoney"}
                </span>
                <span className="rounded-full bg-slate-800 border border-slate-700 px-3.5 py-1 text-xs font-bold text-slate-300">
                  {typeof window !== "undefined" && window.location.hostname.includes("testing")
                    ? "Sandbox Environment"
                    : "1+ Years Experience"}
                </span>
                <span className="rounded-full bg-amber-400/10 border border-amber-400/30 px-3.5 py-1 text-xs font-bold text-amber-400">
                  ⭐ 4.9 Rating
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Official Credit Panel ID:{" "}
                <span className="text-slate-200 font-semibold">
                  {typeof window !== "undefined" && window.location.hostname.includes("testing")
                    ? "test.credit@waqtmoney.in"
                    : "shrutisingh@waqtmoney.in"}
                </span>{" "}
                • Contact:{" "}
                <span className="text-slate-200 font-semibold">
                  {typeof window !== "undefined" && window.location.hostname.includes("testing")
                    ? "Sandbox Mode"
                    : "+91 9217086608"}
                </span>
              </p>
              <button
                type="button"
                onClick={() => setShowFullImage(false)}
                className="mt-1 rounded-full bg-emerald-600 px-6 py-1.5 text-xs font-bold text-white shadow-lg hover:bg-emerald-500 transition"
              >
                Close Photo
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={Boolean(deleteLeadId)}
        onClose={() => setDeleteLeadId(null)}
        onConfirm={confirmDeleteLead}
        isLoading={isDeletingLead}
        title="Delete Lead Record"
        description={`Are you sure you want to permanently delete lead #${deleteLeadId}? All related documents, activity notes, and handoffs will be removed.`}
        confirmText="Delete Lead"
        cancelText="Cancel"
        variant="danger"
        iconType="delete"
      />
    </div>
  );
}
