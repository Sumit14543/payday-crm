import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import {
  Search,
  Filter,
  Eye,
  Phone,
  Mail,
  MapPin,
  UserPlus,
  TrendingUp,
  Users,
  CheckCircle,
  Clock,
  X,
  ChevronLeft,
  ChevronRight,
  Trash2,
  FileCheck2,
  RefreshCw,
  CalendarDays,
  PhoneCall,
  UserCheck,
  Copy,
  AlertCircle,
} from "lucide-react";


import { apiDelete, apiGet, resolveBackendUploadUrl } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useSmartPolling } from "../lib/useSmartPolling";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { AppTooltip } from "../components/ui/app-tooltip";
import { NiceSelect, type NiceSelectOption } from "../components/ui/nice-select";
import {
  Avatar,
  EmptyState,
  FilterChip,
  InsightCard,
  MetricCard,
  ProgressIndicator,
  StatusBadge,
} from "../components/crm/DashboardPrimitives";
import { DuplicateLeadsModal } from "../components/DuplicateLeadsModal";


type Lead = {
  id: string;
  rawId?: string;
  name: string;
  email: string;
  phone: string;
  loanAmount: number | null;
  source: string;
  sourceSystem?: string;
  sourceLeadId?: string;
  sourceApplicationId?: string;
  sourceStatus?: string;
  status: string;
  priority: string;
  assignedTo: string;
  assignedRole: string;
  createdAt?: string;
  createdDate: string;
  lastContact: string | null;
  creditScore: number;
  employmentStatus: string;
  monthlyIncome: number;
  city?: string;
  panNumber?: string;
  loanType?: string;
  profileImageUrl?: string;
  selfieImage?: string;
  latestCallDisposition?: string;
  latestCallAt?: string | null;
  nextFollowupAt?: string | null;
  documentVerifiedCount?: number;
  documentTotalCount?: number;
  isReloan?: number;
  pendingDocumentCount?: number;
  latestHandoffStatus?: string;
  latestHandoffAt?: string | null;
  latestHandoffReviewedBy?: string;
  latestHandoffReviewedAt?: string | null;
  latestHandoffDecision?: string;
  latestHandoffDecisionNotes?: string;
  creditStage?: string;
  firstCallDueAt?: string | null;
  hasNoDisposition?: boolean;
  isCallbackDue?: boolean;
  isDocsBreach?: boolean;
  isDocsWarning?: boolean;
  isFirstCallBreach?: boolean;
  isReadyForHandoff?: boolean;
  isSentToCredit?: boolean;
  nextAction?: string;
  nextActionDueAt?: string | null;
  slaBreached?: boolean;
  slaStatus?: string;
};

type TelecallerPolicy = {
  dispositions: NiceSelectOption[];
  noDispositionValue: string;
  teamMembers: Array<{ email: string; name: string; role: string }>;
};

type TelecallerWorkbenchResponse = {
  counts: {
    stats: {
      callbackDue?: number;
      docsPending?: number;
      followupsDue?: number;
      newUncalled?: number;
      readyHandoff?: number;
      sentCredit?: number;
      slaBreached?: number;
      todayLeads?: number;
      totalLeads?: number;
      yesterdayLeads?: number;
    };
    tabs: Record<LeadTab, number>;
  };
  items: Lead[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
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

const LEAD_STATUS_OPTIONS = ["New", "Contacted", "Qualified", "Document Collection", "Documents Pending", "Not Connected", "Converted", "Lost"];
const LEAD_PRIORITY_OPTIONS = ["High", "Medium", "Low", "Urgent"];
const CALL_DISPOSITION_OPTIONS = [
  "Connected",
  "Not reachable",
  "Switched off",
  "Callback requested",
  "Interested",
  "Not interested",
  "Wrong number",
  "Duplicate",
  "Language issue",
];
const NO_DISPOSITION_VALUE = "__none__";
const FOLLOW_UP_STATUSES = new Set(["Contacted", "Document Collection"]);
const UNCONTACTED_STATUSES = new Set(["New"]);
const PAGE_SIZE = 10;
type LeadTab = "all" | "uncontacted" | "followups" | "docs-pending" | "ready-handoff" | "sent-credit";

const parsePageParam = (value: string | null) => {
  const page = Number.parseInt(String(value || "1"), 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
};

const formatLeadDate = (value?: string | null) => {
  if (!value) return "Not provided";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const formatUpdatedTime = (value: Date | null) => (
  value ? value.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "Not yet"
);

const isDueTodayOrOverdue = (value?: string | null) => {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  return date.getTime() <= endOfToday.getTime();
};

const isSameLocalDay = (value: string | null | undefined, targetDate: Date) => {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  return date.getFullYear() === targetDate.getFullYear() &&
    date.getMonth() === targetDate.getMonth() &&
    date.getDate() === targetDate.getDate();
};

const formatSourceStatus = (value?: string | null) => {
  const text = String(value || "").trim();
  if (!text) return "";
  return `Source status: ${text}`;
};

const getLeadDisplayId = (lead: Lead) => (
  lead.sourceApplicationId || lead.sourceLeadId || lead.id
);

const resolveLeadImageUrl = (lead: Lead) => {
  const value = String(lead.profileImageUrl || lead.selfieImage || "").trim();
  if (!value) return "";
  if (/^(https?:\/\/|data:image\/|blob:)/i.test(value)) return value;
  return resolveBackendUploadUrl(value);
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

const getCreditManagerStage = (lead: Lead) => {
  const handoffStatus = String(lead.latestHandoffStatus || "").toLowerCase();
  const decision = String(lead.latestHandoffDecision || "").toLowerCase();

  if (lead.status === "Converted") {
    return {
      className: "bg-emerald-50 text-emerald-700",
      label: "Disbursed",
      tone: "success",
    };
  }

  if (lead.status === "Qualified" || handoffStatus === "approved" || decision === "approved") {
    return {
      className: "bg-green-50 text-green-700",
      label: "Approved",
      tone: "success",
    };
  }

  if (lead.status === "Lost" || handoffStatus === "rejected" || decision === "rejected") {
    return {
      className: "bg-red-50 text-red-700",
      label: "Rejected",
      tone: "danger",
    };
  }

  if (handoffStatus === "ready") {
    return {
      className: "bg-blue-50 text-blue-700",
      label: "Pending review",
      tone: "info",
    };
  }

  if (lead.latestHandoffStatus) {
    return {
      className: "bg-slate-100 text-slate-700",
      label: lead.latestHandoffStatus,
      tone: "muted",
    };
  }

  return null;
};

function StatNumber({ children, isLoading }: { children: ReactNode; isLoading: boolean }) {
  if (isLoading) {
    return <div className="h-9 w-20 animate-pulse rounded bg-gray-200" />;
  }

  return <p className="text-3xl font-bold text-gray-900">{children}</p>;
}

function LeadTableSkeletonRows({ columns }: { columns: number }) {
  return (
    <>
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <tr key={row}>
          {Array.from({ length: columns }).map((_, column) => (
            <td key={column} className="px-6 py-4">
              <div className={`h-4 animate-pulse rounded bg-gray-200 ${column === 1 || column === 2 ? "w-36" : "w-24"}`} />
              {(column === 1 || column === 2 || column === 7) && (
                <div className="mt-2 h-3 w-28 animate-pulse rounded bg-gray-100" />
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function Leads() {
  const location = useLocation();
  const { user, activeRole } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const statusParam = searchParams.get("status") || "all";
  const priorityParam = searchParams.get("priority") || "all";
  const dispositionParam = searchParams.get("disposition") || "all";
  const assignedToParam = searchParams.get("assignedTo") || "all";
  const tabParam = searchParams.get("tab") || "all";
  const sourceSystemParam = searchParams.get("sourceSystem") || "all";
  const pageParam = parsePageParam(searchParams.get("page"));
  const statusFilter = LEAD_STATUS_OPTIONS.includes(statusParam) ? statusParam : "all";
  const priorityFilter = LEAD_PRIORITY_OPTIONS.includes(priorityParam) ? priorityParam : "all";
  const dispositionFilter = CALL_DISPOSITION_OPTIONS.includes(dispositionParam) || dispositionParam === NO_DISPOSITION_VALUE ? dispositionParam : "all";
  const assignedToFilter = assignedToParam || "all";
  const sourceSystemFilter = sourceSystemParam || "all";
  const activeTab: LeadTab = ["all", "uncontacted", "followups", "docs-pending", "ready-handoff", "sent-credit"].includes(tabParam)
    ? tabParam as LeadTab
    : "all";
  const currentPage = pageParam;
  const [isLoading, setIsLoading] = useState(false);
  const [isPageTransitioning, setIsPageTransitioning] = useState(false);
  const [deletingLeadId, setDeletingLeadId] = useState<string | null>(null);
  const [leadPendingDelete, setLeadPendingDelete] = useState<Lead | null>(null);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(() => new Set());
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [selectedDuplicateLeadId, setSelectedDuplicateLeadId] = useState<string | null>(null);

  const handleOpenDuplicateModal = (leadId: string) => {
    setSelectedDuplicateLeadId(leadId);
    setDuplicateModalOpen(true);
  };

  const [apiError, setApiError] = useState("");
  const pageTransitionTimerRef = useRef<number | null>(null);
  const searchInputHydratedRef = useRef(false);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [workbenchCounts, setWorkbenchCounts] = useState<TelecallerWorkbenchResponse["counts"] | null>(null);
  const [workbenchPagination, setWorkbenchPagination] = useState<TelecallerWorkbenchResponse["pagination"] | null>(null);
  const [serverPagination, setServerPagination] = useState<{ page: number; limit: number; total: number; totalPages: number } | null>(null);
  const [policy, setPolicy] = useState<TelecallerPolicy | null>(null);
  const currentRole = activeRole || user?.role || "telecaller";
  const canRemoveLeads = currentRole === "superadmin" || currentRole === "product-admin";


  const isTelecaller = currentRole === "telecaller";
  const leadListReturnPath = `${location.pathname}${location.search}${location.hash}`;
  const leadListReturnState = useMemo(() => ({
    returnTo: {
      hash: location.hash,
      pathname: location.pathname,
      search: location.search,
    },
  }), [location.hash, location.pathname, location.search]);

  const getLeadDetailsPath = (leadId: string, section?: string) => {
    const params = new URLSearchParams();
    if (section) params.set("section", section);
    params.set("returnTo", leadListReturnPath);
    return `/leads/${encodeURIComponent(leadId)}?${params.toString()}`;
  };

  const updatePageParam = (page: number, replace = false) => {
    const nextParams = new URLSearchParams(searchParams);
    if (page <= 1) nextParams.delete("page");
    else nextParams.set("page", String(page));
    setSearchParams(nextParams, { replace });
  };

  const clearPageParam = (replace = false) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("page");
    setSearchParams(nextParams, { replace });
  };

  const loadLeads = useCallback(async (signal: AbortSignal) => {
    try {
      setApiError("");
      if (isTelecaller) {
        const params = new URLSearchParams({
          page: String(currentPage),
          pageSize: String(PAGE_SIZE),
          tab: activeTab,
        });
        if (searchTerm.trim()) params.set("search", searchTerm.trim());
        if (statusFilter !== "all") params.set("status", statusFilter);
        if (priorityFilter !== "all") params.set("priority", priorityFilter);
        if (dispositionFilter !== "all") params.set("disposition", dispositionFilter);
        if (assignedToFilter !== "all") params.set("assignedTo", assignedToFilter);
        if (sourceSystemFilter !== "all") params.set("sourceSystem", sourceSystemFilter);

        const data = await apiGet<TelecallerWorkbenchResponse>(`/leads/telecaller-workbench-v2?${params.toString()}`, signal);
        setLeads(data.items);
        setWorkbenchCounts(data.counts);
        setWorkbenchPagination(data.pagination);
        return;
      }

      const params = new URLSearchParams({
        page: String(currentPage),
        limit: String(PAGE_SIZE),
      });
      if (searchTerm.trim()) params.set("search", searchTerm.trim());
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (priorityFilter !== "all") params.set("priority", priorityFilter);
      if (assignedToFilter !== "all") params.set("assignedTo", assignedToFilter);
      if (sourceSystemFilter !== "all") params.set("sourceSystem", sourceSystemFilter);

      const data = await apiGet<Lead[]>(`/leads?${params.toString()}`, signal);
      setLeads(data);
      const paginationMeta = (data as any)?.pagination;
      if (paginationMeta) {
        setServerPagination(paginationMeta);
      } else {
        setServerPagination(null);
      }
      setWorkbenchCounts(null);
      setWorkbenchPagination(null);
    } catch (error) {
      if (!signal.aborted) {
        setApiError(error instanceof Error ? error.message : "Unable to load leads");
      }
    }
  }, [activeTab, assignedToFilter, currentPage, dispositionFilter, isTelecaller, priorityFilter, searchTerm, sourceSystemFilter, statusFilter]);

  useEffect(() => {
    if (!isTelecaller) return;
    const controller = new AbortController();
    apiGet<TelecallerPolicy>("/leads/telecaller-policy", controller.signal)
      .then(setPolicy)
      .catch(() => undefined);
    return () => controller.abort();
  }, [isTelecaller]);

  const {
    isRefreshing,
    lastUpdatedAt,
    refresh,
  } = useSmartPolling(loadLeads, {
    enabled: true,
    intervalMs: isTelecaller ? 60_000 : 90_000,
  });

  useEffect(() => {
    refresh();
  }, [activeTab, assignedToFilter, currentPage, dispositionFilter, priorityFilter, refresh, searchTerm, sourceSystemFilter, statusFilter]);

  useEffect(() => {
    if (!searchInputHydratedRef.current) {
      searchInputHydratedRef.current = true;
      return undefined;
    }

    const debounceTimer = window.setTimeout(() => {
      setSearchTerm(searchInput);
      clearPageParam(true);
    }, 300);

    return () => window.clearTimeout(debounceTimer);
  }, [searchInput]);

  useEffect(() => {
    setIsLoading(isRefreshing && !lastUpdatedAt);
  }, [isRefreshing, lastUpdatedAt]);

  useEffect(() => () => {
    if (pageTransitionTimerRef.current) {
      window.clearTimeout(pageTransitionTimerRef.current);
    }
  }, []);

  const teamMembers = (policy?.teamMembers?.length ? policy.teamMembers : [
    { email: "", name: user?.name || "Waqt Telecaller", role: "telecaller" },
  ]).map((member) => ({
    activeLeads: leads.filter((lead) => lead.assignedTo === member.name).length,
    name: member.name,
    role: member.role,
  }));

  const tabs: Array<{ id: LeadTab; label: string }> = isTelecaller
    ? [
      { id: "all", label: "All" },
      { id: "uncontacted", label: "New" },
      { id: "followups", label: "Follow Ups" },
      { id: "docs-pending", label: "Docs Pending" },
      { id: "ready-handoff", label: "Ready Handoff" },
      { id: "sent-credit", label: "Sent To Credit" },
    ]
    : [
      { id: "all", label: "All" },
      { id: "uncontacted", label: "Uncontacted" },
      { id: "followups", label: "Follow Ups" },
    ];

  const tableHeaders = isTelecaller
    ? [
      "Lead",
      "Customer",
      "Source",
      "Loan",
      "Next Action",
      "SLA",
      "Docs",
      "Owner",
      "Actions",
    ]
    : [
      "Lead ID",
      "Name",
      "Contact",
      "Loan Amount",
      "Source",
      "Status",
      "Priority",
      "Assigned To",
      "Actions",
    ];

  const resetPagination = (nextParams?: URLSearchParams) => {
    if (nextParams) {
      nextParams.delete("page");
      return;
    }

    clearPageParam(false);
  };
  const updateLeadFilters = (updates: Record<string, string>) => {
    const nextParams = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (!value || value === "all") {
        nextParams.delete(key);
      } else {
        nextParams.set(key, value);
      }
    });
    resetPagination(nextParams);
    setSearchParams(nextParams, { replace: false });
  };

  const getStatusBadge = (status: string) => {
    const baseClasses = "px-3 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1";
    switch (status) {
      case "New":
        return (
          <span className={`${baseClasses} bg-blue-100 text-blue-800`}>
            <Clock className="h-3 w-3" />
            {status}
          </span>
        );
      case "Contacted":
        return (
          <span className={`${baseClasses} bg-purple-100 text-purple-800`}>
            <Phone className="h-3 w-3" />
            {status}
          </span>
        );
      case "Qualified":
        return (
          <span className={`${baseClasses} bg-green-100 text-green-800`}>
            <CheckCircle className="h-3 w-3" />
            {status}
          </span>
        );
      case "Document Collection":
        return (
          <span className={`${baseClasses} bg-yellow-100 text-yellow-800`}>
            <Clock className="h-3 w-3" />
            {status}
          </span>
        );
      case "Documents Pending":
        return (
          <span className={`${baseClasses} bg-orange-100 text-orange-800`}>
            <Clock className="h-3 w-3" />
            {status}
          </span>
        );
      case "Not Connected":
        return (
          <span className={`${baseClasses} bg-purple-100 text-purple-800`}>
            <Clock className="h-3 w-3" />
            {status}
          </span>
        );
      case "Converted":
        return (
          <span className={`${baseClasses} bg-emerald-100 text-emerald-800`}>
            <CheckCircle className="h-3 w-3" />
            {status}
          </span>
        );
      case "Lost":
        return (
          <span className={`${baseClasses} bg-red-100 text-red-800`}>
            <X className="h-3 w-3" />
            {status}
          </span>
        );
      default:
        return (
          <span className={`${baseClasses} bg-gray-100 text-gray-800`}>
            {status}
          </span>
        );
    }
  };

  const getPriorityBadge = (priority: string) => {
    const baseClasses = "px-2 py-1 rounded text-xs font-medium";
    switch (priority) {
      case "High":
        return <span className={`${baseClasses} bg-red-100 text-red-800`}>{priority}</span>;
      case "Urgent":
        return <span className={`${baseClasses} bg-rose-100 text-rose-800`}>{priority}</span>;
      case "Medium":
        return <span className={`${baseClasses} bg-yellow-100 text-yellow-800`}>{priority}</span>;
      case "Low":
        return <span className={`${baseClasses} bg-gray-100 text-gray-800`}>{priority}</span>;
      default:
        return <span className={`${baseClasses} bg-gray-100 text-gray-800`}>{priority}</span>;
    }
  };

  const assignedToOptions = useMemo(() => {
    const names = [
      ...teamMembers.map((member) => member.name),
      ...leads.map((lead) => lead.assignedTo || "Unassigned"),
    ];
    return Array.from(new Set(names.filter(Boolean)));
  }, [leads, teamMembers]);

  const assignedFilterOptions = useMemo(() => [
    { label: "All Team Members", value: "all" },
    ...assignedToOptions.map((name) => ({ label: name, value: name })),
  ], [assignedToOptions]);

  const priorityFilterOptions = useMemo(() => [
    { label: "All Priority", value: "all" },
    ...LEAD_PRIORITY_OPTIONS.map((priority) => ({ label: priority, value: priority })),
  ], []);

  const dispositionFilterOptions = useMemo(() => [
    { label: "All Disposition", value: "all" },
    { label: "No Disposition", value: policy?.noDispositionValue || NO_DISPOSITION_VALUE },
    ...(policy?.dispositions?.length ? policy.dispositions : CALL_DISPOSITION_OPTIONS.map((disposition) => ({ label: disposition, value: disposition }))),
  ], [policy]);

  const statusFilterOptions = useMemo(() => [
    { label: "All Status", value: "all" },
    ...LEAD_STATUS_OPTIONS.map((status) => ({ label: status, value: status })),
  ], []);

  const matchesSearchFilter = useCallback((lead: Lead) => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return true;

    return (
      lead.name.toLowerCase().includes(query) ||
      lead.id.toLowerCase().includes(query) ||
      (lead.rawId || "").toLowerCase().includes(query) ||
      (lead.email || "").toLowerCase().includes(query) ||
      lead.phone.toLowerCase().includes(query) ||
      (lead.assignedTo || "").toLowerCase().includes(query) ||
      (lead.source || "").toLowerCase().includes(query) ||
      (lead.sourceSystem || "").toLowerCase().includes(query) ||
      (lead.sourceLeadId || "").toLowerCase().includes(query) ||
      (lead.sourceApplicationId || "").toLowerCase().includes(query) ||
      (lead.sourceStatus || "").toLowerCase().includes(query)
    );
  }, [searchTerm]);

  const matchesStatusFilter = useCallback((lead: Lead) => statusFilter === "all" || lead.status === statusFilter, [statusFilter]);
  const matchesPriorityFilter = useCallback((lead: Lead) => priorityFilter === "all" || lead.priority === priorityFilter, [priorityFilter]);
  const matchesDispositionFilter = useCallback((lead: Lead) => (
    dispositionFilter === "all" ||
    (dispositionFilter === NO_DISPOSITION_VALUE ? !lead.latestCallDisposition : lead.latestCallDisposition === dispositionFilter)
  ), [dispositionFilter]);
  const matchesAssignedFilter = useCallback((lead: Lead) => assignedToFilter === "all" || (lead.assignedTo || "Unassigned") === assignedToFilter, [assignedToFilter]);
  const matchesSourceSystemFilter = useCallback((lead: Lead) => sourceSystemFilter === "all" || (lead.sourceSystem || lead.source || "").toLowerCase() === sourceSystemFilter.toLowerCase(), [sourceSystemFilter]);
  const matchesTabFilter = useCallback((lead: Lead, tab: typeof activeTab) => (
    tab === "all" ||
    (tab === "uncontacted" && UNCONTACTED_STATUSES.has(lead.status)) ||
    (tab === "followups" && (FOLLOW_UP_STATUSES.has(lead.status) || Boolean(lead.nextFollowupAt))) ||
    (tab === "docs-pending" && hasPendingDocuments(lead)) ||
    (tab === "ready-handoff" && isReadyForHandoff(lead)) ||
    (tab === "sent-credit" && isSentToCredit(lead))
  ), []);

  const tabCountBaseLeads = useMemo(() => (
    leads.filter((lead) => (
      matchesSearchFilter(lead) &&
      matchesDispositionFilter(lead) &&
      matchesPriorityFilter(lead) &&
      matchesAssignedFilter(lead) &&
      matchesSourceSystemFilter(lead)
    ))
  ), [leads, matchesSearchFilter, matchesDispositionFilter, matchesPriorityFilter, matchesAssignedFilter, matchesSourceSystemFilter]);

  const baseFilteredLeads = useMemo(() => (
    leads.filter((lead) => (
      matchesSearchFilter(lead) &&
      matchesStatusFilter(lead) &&
      matchesDispositionFilter(lead) &&
      matchesPriorityFilter(lead) &&
      matchesAssignedFilter(lead) &&
      matchesSourceSystemFilter(lead)
    ))
  ), [leads, matchesSearchFilter, matchesStatusFilter, matchesDispositionFilter, matchesPriorityFilter, matchesAssignedFilter, matchesSourceSystemFilter]);

  const localTabCounts = useMemo(() => ({
    all: tabCountBaseLeads.length,
    "docs-pending": tabCountBaseLeads.filter((lead) => matchesTabFilter(lead, "docs-pending")).length,
    followups: tabCountBaseLeads.filter((lead) => matchesTabFilter(lead, "followups")).length,
    "ready-handoff": tabCountBaseLeads.filter((lead) => matchesTabFilter(lead, "ready-handoff")).length,
    "sent-credit": tabCountBaseLeads.filter((lead) => matchesTabFilter(lead, "sent-credit")).length,
    uncontacted: tabCountBaseLeads.filter((lead) => matchesTabFilter(lead, "uncontacted")).length,
  }), [tabCountBaseLeads, matchesTabFilter]);
  const tabCounts = isTelecaller && workbenchCounts?.tabs ? workbenchCounts.tabs : localTabCounts;

  const filteredLeads = useMemo(() => (
    baseFilteredLeads.filter((lead) => matchesTabFilter(lead, activeTab))
  ), [baseFilteredLeads, matchesTabFilter, activeTab]);
  const searchQuery = searchTerm.trim();
  const searchPreviewLeads = searchQuery
    ? leads.filter(matchesSearchFilter).slice(0, 5)
    : [];
  const searchMatchCount = searchQuery && isTelecaller && workbenchPagination
    ? workbenchPagination.totalItems
    : searchQuery
      ? leads.filter(matchesSearchFilter).length
      : isTelecaller && workbenchPagination
        ? workbenchPagination.totalItems
        : leads.length;

  const totalPages = isTelecaller
    ? workbenchPagination?.totalPages || 1
    : serverPagination?.totalPages || Math.max(1, Math.ceil(filteredLeads.length / PAGE_SIZE));
  const safeCurrentPage = isTelecaller
    ? workbenchPagination?.page || currentPage
    : serverPagination?.page || Math.min(currentPage, totalPages);
  const totalFilteredCount = isTelecaller
    ? workbenchPagination?.totalItems || 0
    : serverPagination?.total !== undefined ? serverPagination.total : filteredLeads.length;
  const paginatedLeads = isTelecaller || serverPagination
    ? leads
    : filteredLeads.slice(
      (safeCurrentPage - 1) * PAGE_SIZE,
      safeCurrentPage * PAGE_SIZE
    );
  const showTableLoader = isLoading || isPageTransitioning;

  useEffect(() => {
    const canClampPage = isTelecaller ? Boolean(workbenchPagination) : !isLoading;
    if (canClampPage && currentPage > totalPages) {
      updatePageParam(totalPages, true);
    }
  }, [currentPage, isLoading, isTelecaller, totalPages, workbenchPagination]);

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const serverStats = workbenchCounts?.stats || {};

  const stats = {
    docsPending: isTelecaller ? Number(serverStats.docsPending || 0) : leads.filter(hasPendingDocuments).length,
    followupsDue: isTelecaller ? Number(serverStats.followupsDue ?? serverStats.callbackDue ?? 0) : leads.filter((lead) => Boolean(lead.nextFollowupAt)).length,
    readyHandoff: isTelecaller ? Number(serverStats.readyHandoff || 0) : leads.filter(isReadyForHandoff).length,
    slaBreached: isTelecaller ? Number(serverStats.slaBreached || 0) : leads.filter((lead) => lead.slaBreached).length,
    sentCredit: isTelecaller ? Number(serverStats.sentCredit || 0) : leads.filter(isSentToCredit).length,
    creditApproved: leads.filter((lead) => getCreditManagerStage(lead)?.label === "Approved").length,
    creditPending: leads.filter((lead) => getCreditManagerStage(lead)?.label === "Pending review").length,
    creditRejected: leads.filter((lead) => getCreditManagerStage(lead)?.label === "Rejected").length,
    totalLeads: isTelecaller ? Number(serverStats.totalLeads || 0) : leads.length,
    newLeads: isTelecaller ? Number(serverStats.newUncalled || 0) : leads.filter(l => l.status === "New").length,
    qualifiedLeads: leads.filter(l => l.status === "Qualified").length,
    todayLeads: isTelecaller ? Number(serverStats.todayLeads || 0) : leads.filter((lead) => isSameLocalDay(lead.createdAt || lead.createdDate, today)).length,
    yesterdayLeads: isTelecaller ? Number(serverStats.yesterdayLeads || 0) : leads.filter((lead) => isSameLocalDay(lead.createdAt || lead.createdDate, yesterday)).length,
    conversionRate: "34%",
  };

  const teamMemberCards = teamMembers.map((member) => ({
    ...member,
    activeLeads: leads.filter((lead) => lead.assignedTo === member.name).length,
  }));

  const hasActiveFilters = Boolean(searchInput || searchTerm || statusFilter !== "all" || priorityFilter !== "all" || dispositionFilter !== "all" || assignedToFilter !== "all" || sourceSystemFilter !== "all");
  const activeFilterChips = [
    searchTerm ? { key: "search", label: `Search: ${searchTerm}`, clear: () => { setSearchInput(""); setSearchTerm(""); resetPagination(); } } : null,
    statusFilter !== "all" ? { key: "status", label: `Status: ${statusFilter}`, clear: () => updateLeadFilters({ status: "all" }) } : null,
    priorityFilter !== "all" ? { key: "priority", label: `Priority: ${priorityFilter}`, clear: () => updateLeadFilters({ priority: "all" }) } : null,
    dispositionFilter !== "all" ? { key: "disposition", label: `Disposition: ${dispositionFilter === NO_DISPOSITION_VALUE ? "No Disposition" : dispositionFilter}`, clear: () => updateLeadFilters({ disposition: "all" }) } : null,
    assignedToFilter !== "all" ? { key: "assignedTo", label: `Owner: ${assignedToFilter}`, clear: () => updateLeadFilters({ assignedTo: "all" }) } : null,
  ].filter(Boolean) as Array<{ clear: () => void; key: string; label: string }>;
  const currentPageLeadIds = paginatedLeads.map((lead) => lead.id);
  const allCurrentPageSelected = currentPageLeadIds.length > 0 && currentPageLeadIds.every((id) => selectedLeadIds.has(id));

  const clearFilters = () => {
    setSearchInput("");
    setSearchTerm("");
    setSearchParams({}, { replace: false });
  };

  const toggleLeadSelection = (leadId: string) => {
    setSelectedLeadIds((current) => {
      const next = new Set(current);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  };

  const toggleCurrentPageSelection = () => {
    setSelectedLeadIds((current) => {
      const next = new Set(current);
      if (allCurrentPageSelected) {
        currentPageLeadIds.forEach((id) => next.delete(id));
      } else {
        currentPageLeadIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const selectTab = (tab: typeof activeTab) => {
    updateLeadFilters({ status: "all", tab });
  };

  const changePage = (nextPage: number) => {
    const boundedPage = Math.min(totalPages, Math.max(1, nextPage));
    if (boundedPage === safeCurrentPage) return;

    if (pageTransitionTimerRef.current) {
      window.clearTimeout(pageTransitionTimerRef.current);
    }
    setIsPageTransitioning(true);
    updatePageParam(boundedPage, false);
    pageTransitionTimerRef.current = window.setTimeout(() => {
      setIsPageTransitioning(false);
      pageTransitionTimerRef.current = null;
    }, 300);
  };

  const handleDeleteLead = async () => {
    if (!leadPendingDelete) return;

    const leadId = leadPendingDelete.id;
    try {
      setDeletingLeadId(leadId);
      setApiError("");
      await apiDelete<{ id: string }>(`/leads/${encodeURIComponent(leadId)}`);
      setLeads((currentLeads) => currentLeads.filter((lead) => lead.id !== leadId));
      setLeadPendingDelete(null);
      toast.success("Lead and related records removed");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to remove lead";
      setApiError(message);
      toast.error(message);
    } finally {
      setDeletingLeadId(null);
    }
  };

  return (
    <div className="w-full min-w-0">
      <header className="bg-white border-b border-gray-200 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-5 h-5 border border-gray-300 rounded flex items-center justify-center">
              <div className="w-2 h-2 bg-gray-400"></div>
            </div>
            <h1 className="text-base font-medium text-gray-900">Lead Management</h1>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>Auto-refresh: {isTelecaller ? "60s" : "90s"} · Last updated {formatUpdatedTime(lastUpdatedAt)}</span>
            <AppTooltip label="Refresh leads now">
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
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        {apiError && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {apiError}
          </div>
        )}

        <section className="mb-6">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="crm-meta">Lead Management</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-normal text-foreground">
                {stats.totalLeads} leads require attention today
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone="info">New {stats.newLeads}</StatusBadge>
              <StatusBadge tone="warning">Pending Docs {stats.docsPending}</StatusBadge>
              <StatusBadge tone="danger">Breached SLA {stats.slaBreached}</StatusBadge>
              <StatusBadge tone="success">Ready Handoff {stats.readyHandoff}</StatusBadge>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
            <MetricCard accent="info" metric={isLoading ? "..." : stats.totalLeads} note="Live queue size" title={isTelecaller ? "Total Queue" : "Total Leads"} trend="+8%" />
            <MetricCard accent="success" metric={isLoading ? "..." : stats.newLeads} note="No call disposition" title={isTelecaller ? "New Uncalled" : "New Leads"} trend="+4%" />
            <MetricCard accent="purple" metric={isLoading ? "..." : isTelecaller ? stats.docsPending : stats.qualifiedLeads} note={isTelecaller ? "Applications missing docs" : "Qualified applicants"} title={isTelecaller ? "Docs Pending" : "Qualified"} trend="+6%" />
            <MetricCard accent="danger" metric={isLoading ? "..." : isTelecaller ? stats.slaBreached : stats.conversionRate} note={isTelecaller ? `Callback due ${stats.followupsDue}` : "Conversion health"} title={isTelecaller ? "SLA Breached" : "Conversion Rate"} trend="-2%" />
            <MetricCard accent="teal" metric={isLoading ? "..." : stats.todayLeads} note="Created today" title="Today Leads" trend="+12%" />
            <MetricCard accent="muted" metric={isLoading ? "..." : stats.yesterdayLeads} note="Created yesterday" title="Yesterday Leads" trend="0%" />
          </div>
        </section>

        <section className="mb-6 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="crm-meta">Operational Insights</p>
              <h3 className="text-base font-semibold text-foreground">Priority signals</h3>
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <InsightCard tone="danger" icon={<TrendingUp className="h-4 w-4" />} label={`${stats.slaBreached} SLA breached leads require action`} />
            <InsightCard tone="warning" icon={<FileCheck2 className="h-4 w-4" />} label={`${stats.docsPending} applications missing documents`} />
            <InsightCard tone="teal" icon={<CalendarDays className="h-4 w-4" />} label={`${stats.todayLeads} leads created today`} />
          </div>
        </section>

          {/* Team Members Section */}
          {!isTelecaller && <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Team Members & Roles</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {teamMemberCards.map((member) => (
                <div key={member.name} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-blue-600 font-semibold">
                        {member.name.split(' ').map(n => n[0]).join('')}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{member.name}</p>
                      <p className="text-xs text-gray-600">{member.role}</p>
                    </div>
                  </div>
                  <div className="text-sm text-gray-600">
                    <span className="font-medium text-gray-900">{member.activeLeads}</span> active leads
                  </div>
                </div>
              ))}
            </div>
          </div>}

          {/* Filters and Search */}
          <div className="mb-6 overflow-visible rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto border-b border-slate-200 px-4 py-3">
              <div className="flex min-w-max gap-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => selectTab(tab.id)}
                  className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold transition-colors ${
                    activeTab === tab.id
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                    activeTab === tab.id
                      ? "bg-white/20 text-white"
                      : "bg-white text-slate-600"
                  }`}>
                    {tabCounts[tab.id]}
                  </span>
                </button>
              ))}
              </div>
            </div>

            <div className="bg-slate-50/50 p-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start">
              <div className="relative min-w-0 flex-1">
                <div className={`rounded-lg border bg-white transition ${
                  searchFocused
                    ? "border-blue-400 shadow-sm ring-2 ring-blue-100"
                    : "border-slate-300 hover:border-slate-400"
                }`}>
                  <div className="flex h-11 items-center gap-2 px-3">
                    <Search className="h-4 w-4 shrink-0 text-slate-400" />
                    <div className="min-w-0 flex-1">
                      <input
                        type="text"
                        placeholder="Search leads by name, ID, phone or email"
                        value={searchInput}
                        onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)}
                        onChange={(e) => {
                          setSearchInput(e.target.value);
                        }}
                        onFocus={() => setSearchFocused(true)}
                        className="h-9 w-full border-0 bg-transparent p-0 text-sm text-slate-950 outline-none placeholder:text-slate-400"
                      />
                    </div>
                    {searchInput && (
                      <span className="hidden shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 sm:inline-flex">
                        {searchMatchCount}
                      </span>
                    )}
                    {searchInput && (
                      <AppTooltip label="Clear search">
                        <button
                          type="button"
                          onClick={() => {
                            setSearchInput("");
                            setSearchTerm("");
                            resetPagination();
                          }}
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                          aria-label="Clear search"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </AppTooltip>
                    )}
                  </div>
                </div>

                {searchFocused && searchQuery && (
                  <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                    <div className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Quick results
                    </div>
                    <div className="max-h-80 overflow-y-auto py-1">
                      {searchPreviewLeads.map((lead) => (
                        <Link
                          key={lead.id}
                          to={getLeadDetailsPath(lead.id)}
                          state={leadListReturnState}
                          className="flex items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-slate-950">
                              {lead.name || "Applicant"}
                              {lead.isReloan === 1 && (
                                <span className="ml-2 inline-flex items-center rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800 uppercase tracking-wide">
                                  Reloan
                                </span>
                              )}
                            </span>
                            <span className="block truncate text-xs text-slate-500">{getLeadDisplayId(lead)} - {lead.phone || "No phone"}</span>
                          </span>
                          <span className="shrink-0 rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">{lead.status}</span>
                        </Link>
                      ))}
                      {searchPreviewLeads.length === 0 && (
                        <div className="px-4 py-6 text-center text-sm text-slate-500">
                          No lead found for "{searchQuery}"
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:flex xl:shrink-0 xl:items-center">
              <div className="relative xl:w-56">
                <NiceSelect
                  ariaLabel="Filter by team member"
                  className="w-full"
                  value={assignedToFilter}
                  onValueChange={(value) => updateLeadFilters({ assignedTo: value })}
                  options={assignedFilterOptions}
                />
                {assignedToFilter !== "all" && (
                  <AppTooltip label="Clear team filter">
                    <button
                      onClick={() => updateLeadFilters({ assignedTo: "all" })}
                      className="absolute right-9 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                      aria-label="Clear team member filter"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </AppTooltip>
                )}
              </div>

              {isTelecaller && (
                <div className="relative xl:w-52">
                  <NiceSelect
                    ariaLabel="Filter by disposition"
                    className="w-full"
                    value={dispositionFilter}
                    onValueChange={(value) => updateLeadFilters({ disposition: value })}
                    options={dispositionFilterOptions}
                  />
                </div>
              )}

              <div className="relative xl:w-48">
                <NiceSelect
                  ariaLabel="Filter by priority"
                  className="w-full"
                  value={priorityFilter}
                  onValueChange={(value) => updateLeadFilters({ priority: value })}
                  options={priorityFilterOptions}
                />
              </div>

              <div className="relative flex items-center gap-2 xl:w-44">
                <Filter className="hidden h-5 w-5 shrink-0 text-gray-400 xl:block" />
                <NiceSelect
                  ariaLabel="Filter by status"
                  className="min-w-0 flex-1"
                  value={statusFilter}
                  onValueChange={(value) => updateLeadFilters({ status: value, tab: value !== "all" ? "all" : activeTab })}
                  options={statusFilterOptions}
                />
              </div>

              <button
                type="button"
                onClick={clearFilters}
                disabled={!hasActiveFilters}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400 disabled:shadow-none xl:w-28"
              >
                <X className="h-4 w-4" />
                Reset
              </button>
              </div>
              {activeFilterChips.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {activeFilterChips.map((chip) => (
                    <FilterChip key={chip.key} onRemove={chip.clear}>
                      {chip.label}
                    </FilterChip>
                  ))}
                </div>
              )}
              </div>
            </div>
          </div>

          {/* Leads Table */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            {selectedLeadIds.size > 0 && (
              <div className="flex items-center justify-between border-b border-border bg-primary/10 px-4 py-3 text-sm">
                <span className="font-semibold text-foreground">{selectedLeadIds.size} selected</span>
                <div className="flex items-center gap-2">
                  <button type="button" className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted">
                    Assign
                  </button>
                  <button type="button" className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted">
                    Export
                  </button>
                  <button type="button" onClick={() => setSelectedLeadIds(new Set())} className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted">
                    Clear
                  </button>
                </div>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="sticky top-0 z-10 bg-gray-50">
                  <tr>
                    <th className="w-12 px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label="Select all leads on this page"
                        checked={allCurrentPageSelected}
                        onChange={toggleCurrentPageSelection}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                    </th>
                    {tableHeaders.map((head) => (
                      <th key={head} className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        <span className="flex items-center gap-2">
                          {head}
                          {head !== "Actions" && <Filter className="h-3 w-3 text-gray-400" />}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {showTableLoader && <LeadTableSkeletonRows columns={tableHeaders.length} />}
                  {!showTableLoader && paginatedLeads.map((lead) => {
                    const creditStage = getCreditManagerStage(lead);
                    const slaClass = lead.slaStatus === "Breached"
                      ? "bg-red-50 text-red-700"
                      : lead.slaStatus === "Warning"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-emerald-50 text-emerald-700";

                    if (isTelecaller) {
                      return (
                        <tr key={lead.id} className="hover:bg-gray-50">
                          <td className="px-4 py-4">
                            <input
                              type="checkbox"
                              aria-label={`Select ${lead.name}`}
                              checked={selectedLeadIds.has(lead.id)}
                              onChange={() => toggleLeadSelection(lead.id)}
                              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold">
                            <Link
                              to={getLeadDetailsPath(lead.id)}
                              state={leadListReturnState}
                              className="text-blue-700 hover:text-blue-900 hover:underline"
                            >
                              {getLeadDisplayId(lead)}
                            </Link>
                            <div className="mt-1 text-xs text-slate-500">Created: {formatLeadDate(lead.createdAt || lead.createdDate)}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <Avatar name={lead.name} imageUrl={resolveLeadImageUrl(lead)} />
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-gray-900 flex items-center gap-2 flex-wrap">
                                  {lead.name}
                                  {lead.isReloan === 1 && (
                                    <span className="inline-flex items-center rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800 uppercase tracking-wide">
                                      Reloan
                                    </span>
                                  )}
                                </div>
                                {(Boolean(lead.isDuplicate) || Number(lead.duplicateCount || 0) > 0) && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenDuplicateModal(lead.id)}
                                    className="mt-0.5 text-[11px] font-bold text-amber-600 hover:text-amber-800 hover:underline flex items-center gap-1 cursor-pointer"
                                    title="Click to view all matching duplicate leads"
                                  >
                                    <AlertCircle className="h-3 w-3 shrink-0 text-amber-600" />
                                    Duplicate Record ({lead.duplicateCount || 1} match in CRM)
                                  </button>
                                )}




                                <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                                  <Phone className="h-3 w-3" />
                                  {lead.phone || "No phone"}
                                </div>
                                <div className="mt-1 flex max-w-[220px] items-center gap-1 truncate text-xs text-slate-500">
                                  <MapPin className="h-3 w-3 shrink-0" />
                                  <span className="truncate">{lead.city || "Not provided"}</span>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                            <div className="font-medium text-slate-900">{lead.source || "Not provided"}</div>
                            {formatSourceStatus(lead.sourceStatus) && (
                              <div className="mt-1 text-xs text-slate-500">{formatSourceStatus(lead.sourceStatus)}</div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-semibold text-gray-900">{formatCurrency(lead.loanAmount)}</div>
                            <div className="mt-1 text-xs text-slate-500">Payday Loan</div>
                            <div className="mt-1">{getPriorityBadge(lead.priority)}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-semibold text-slate-900">{lead.nextAction || "Review lead"}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {lead.latestCallDisposition
                                ? `Last call: ${lead.latestCallDisposition}${lead.latestCallAt ? ` on ${formatLeadDate(lead.latestCallAt)}` : ""}`
                                : "No disposition yet"}
                            </div>
                            {lead.nextActionDueAt && (
                              <div className="mt-1 text-xs font-medium text-amber-700">
                                Due: {formatLeadDate(lead.nextActionDueAt)}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${slaClass}`}>
                              {lead.slaStatus || "On Track"}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <ProgressIndicator
                              value={Number(lead.documentVerifiedCount || 0)}
                              total={Number(lead.documentTotalCount || 0)}
                              label={Number(lead.pendingDocumentCount || 0) > 0 ? "Pending" : "Ready"}
                            />
                            <div className={Number(lead.pendingDocumentCount || 0) > 0 ? "text-xs text-amber-700" : "text-xs text-emerald-700"}>
                              {Number(lead.pendingDocumentCount || 0) > 0 ? `${lead.pendingDocumentCount} pending` : "Ready"}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">{lead.creditStage || creditStage?.label || "Not started"}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{lead.assignedTo && lead.assignedTo !== "Unassigned" ? `Assign to ${lead.assignedTo}` : "Unassigned"}</div>
                            <div className="text-sm text-gray-500">{lead.assignedRole}</div>
                            <div className="mt-1">{getStatusBadge(lead.status)}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <div className="flex min-w-[130px] items-center gap-2">
                              <AppTooltip label="View details">
                                <Link
                                  to={getLeadDetailsPath(lead.id)}
                                  state={leadListReturnState}
                                  aria-label={`View details for ${lead.name}`}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-blue-600 text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
                                >
                                  <Eye className="h-4 w-4" />
                                </Link>
                              </AppTooltip>
                              <AppTooltip label="Call customer">
                                <a
                                  href={lead.phone ? `tel:${lead.phone}` : undefined}
                                  aria-label={`Call ${lead.name}`}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                                >
                                  <PhoneCall className="h-4 w-4" />
                                </a>
                              </AppTooltip>
                              <AppTooltip label="Open document checks">
                                <Link
                                  to={getLeadDetailsPath(lead.id, "documents")}
                                  state={leadListReturnState}
                                  aria-label={`Open documents for ${lead.name}`}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-amber-700 transition hover:bg-amber-100 hover:text-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-100"
                                >
                                  <FileCheck2 className="h-4 w-4" />
                                </Link>
                              </AppTooltip>
                              {canRemoveLeads && (
                                <AppTooltip label="Remove lead">
                                  <button
                                    type="button"
                                    aria-label={`Remove ${lead.name}`}
                                    onClick={() => setLeadPendingDelete(lead)}
                                    disabled={deletingLeadId === lead.id}
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-700 transition hover:bg-red-100 hover:text-red-800 focus:outline-none focus:ring-2 focus:ring-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </AppTooltip>
                              )}
                            </div>
                            {deletingLeadId === lead.id && (
                              <p className="mt-2 text-xs font-medium text-red-600">Removing...</p>
                            )}
                          </td>
                        </tr>
                      );
                    }

                    return (
                    <tr key={lead.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          aria-label={`Select ${lead.name}`}
                          checked={selectedLeadIds.has(lead.id)}
                          onChange={() => toggleLeadSelection(lead.id)}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold">
                        <Link
                          to={getLeadDetailsPath(lead.id)}
                          state={leadListReturnState}
                          className="text-blue-700 hover:text-blue-900 hover:underline"
                        >
                          {getLeadDisplayId(lead)}
                        </Link>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <Avatar name={lead.name} imageUrl={resolveLeadImageUrl(lead)} />
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900 flex items-center gap-2 flex-wrap">
                              {lead.name}
                              {lead.isReloan === 1 && (
                                <span className="inline-flex items-center rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800 uppercase tracking-wide">
                                  Reloan
                                </span>
                              )}
                            </div>
                            {(Boolean(lead.isDuplicate) || Number(lead.duplicateCount || 0) > 0) && (
                              <button
                                type="button"
                                onClick={() => handleOpenDuplicateModal(lead.id)}
                                className="mt-0.5 text-[11px] font-bold text-amber-600 hover:text-amber-800 hover:underline flex items-center gap-1 cursor-pointer"
                                title="Click to view all matching duplicate leads"
                              >
                                <AlertCircle className="h-3 w-3 shrink-0 text-amber-600" />
                                Duplicate Record ({lead.duplicateCount || 1} match in CRM)
                              </button>
                            )}




                            <div className="text-sm text-gray-500">Created: {formatLeadDate(lead.createdAt || lead.createdDate)}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1 text-sm text-gray-900 mb-1">
                          <MapPin className="h-3 w-3" />
                          {lead.city || "Not provided"}
                        </div>
                        <div className="flex items-center gap-1 text-sm text-gray-500">
                          <Phone className="h-3 w-3" />
                          {lead.phone}
                        </div>
                        {isTelecaller && lead.latestCallDisposition && (
                          <div className="mt-1 text-xs text-slate-500">
                            Last call: {lead.latestCallDisposition} {lead.latestCallAt ? `on ${formatLeadDate(lead.latestCallAt)}` : ""}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                        {formatCurrency(lead.loanAmount)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        <div className="font-medium text-slate-900">{lead.source || "Not provided"}</div>
                        {formatSourceStatus(lead.sourceStatus) && (
                          <div className="mt-1 text-xs text-slate-500">{formatSourceStatus(lead.sourceStatus)}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(lead.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getPriorityBadge(lead.priority)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{lead.assignedTo && lead.assignedTo !== "Unassigned" ? `Assign to ${lead.assignedTo}` : "Unassigned"}</div>
                        <div className="text-sm text-gray-500">{lead.assignedRole}</div>
                        {isTelecaller && (
                          <div className="mt-1 space-y-1 text-xs text-slate-500">
                            <div>
                              Docs: {Number(lead.documentVerifiedCount || 0)}/{Number(lead.documentTotalCount || 0)}
                            </div>
                            {lead.nextFollowupAt && (
                              <div className={isDueTodayOrOverdue(lead.nextFollowupAt) ? "font-semibold text-amber-700" : ""}>
                                Follow-up: {formatLeadDate(lead.nextFollowupAt)}
                              </div>
                            )}
                            {creditStage && (
                              <div>
                                <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${creditStage.className}`}>
                                  Credit: {creditStage.label}
                                </span>
                                <div className="mt-0.5 text-[11px] text-slate-500">
                                  {lead.latestHandoffReviewedAt
                                    ? `Reviewed ${formatLeadDate(lead.latestHandoffReviewedAt)}${lead.latestHandoffReviewedBy ? ` by ${lead.latestHandoffReviewedBy}` : ""}`
                                    : lead.latestHandoffAt
                                      ? `Sent ${formatLeadDate(lead.latestHandoffAt)}`
                                      : "Sent to credit manager"}
                                </div>
                                {creditStage.label === "Rejected" && lead.latestHandoffDecisionNotes && (
                                  <AppTooltip label={lead.latestHandoffDecisionNotes}>
                                    <div className="mt-0.5 max-w-[180px] truncate text-[11px] text-red-600">
                                      {lead.latestHandoffDecisionNotes}
                                    </div>
                                  </AppTooltip>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex min-w-[160px] items-center gap-2">
                        <AppTooltip label="View details">
                          <Link
                            to={getLeadDetailsPath(lead.id)}
                            state={leadListReturnState}
                            aria-label={`View details for ${lead.name}`}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-blue-600 text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                        </AppTooltip>
                        {isTelecaller && (
                          <AppTooltip label="Open document checks">
                            <Link
                              to={getLeadDetailsPath(lead.id, "documents")}
                              state={leadListReturnState}
                              aria-label={`Open documents for ${lead.name}`}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-amber-700 transition hover:bg-amber-100 hover:text-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-100"
                            >
                              <FileCheck2 className="h-4 w-4" />
                            </Link>
                          </AppTooltip>
                        )}
                        {canRemoveLeads && (
                          <AppTooltip label="Remove lead">
                            <button
                              type="button"
                              aria-label={`Remove ${lead.name}`}
                              onClick={() => setLeadPendingDelete(lead)}
                              disabled={deletingLeadId === lead.id}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-700 transition hover:bg-red-100 hover:text-red-800 focus:outline-none focus:ring-2 focus:ring-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </AppTooltip>
                        )}
                        </div>
                        {deletingLeadId === lead.id && (
                          <p className="mt-2 text-xs font-medium text-red-600">Removing...</p>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                  {!showTableLoader && paginatedLeads.length === 0 && (
                    <tr>
                      <td colSpan={tableHeaders.length + 1} className="px-6 py-12 text-sm text-gray-500">
                        <EmptyState
                          title={hasActiveFilters ? "No leads match these filters" : "No actionable leads found"}
                          description={hasActiveFilters
                            ? "Reset filters to see the full telecaller queue."
                            : activeTab === "docs-pending"
                              ? "Uploaded and verified files will appear in the ready handoff queue."
                              : activeTab === "ready-handoff"
                                ? "Verify all required documents first."
                                : activeTab === "sent-credit"
                                  ? "Sent-to-credit leads will appear here."
                                  : "New applications will appear here when they enter this queue."}
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
            <div className="flex flex-col gap-3 border-t border-gray-200 px-4 py-3 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between">
              <div>
                Page {safeCurrentPage} of {totalPages} - {totalFilteredCount} lead{totalFilteredCount === 1 ? "" : "s"}
              </div>
              <div className="flex items-center gap-2">
                <AppTooltip label="Previous page">
                  <button
                    onClick={() => changePage(safeCurrentPage - 1)}
                    disabled={safeCurrentPage === 1 || showTableLoader}
                    className="inline-flex items-center gap-1 rounded-full border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Previous
                  </button>
                </AppTooltip>
                <AppTooltip label="Next page">
                  <button
                    onClick={() => changePage(safeCurrentPage + 1)}
                    disabled={safeCurrentPage === totalPages || showTableLoader}
                    className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </AppTooltip>
              </div>
            </div>
          </div>
      </div>
      <AlertDialog
        open={Boolean(leadPendingDelete)}
        onOpenChange={(open) => {
          if (!open && !deletingLeadId) setLeadPendingDelete(null);
        }}
      >
        <AlertDialogContent className="border-red-100 bg-white">
          <AlertDialogHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600">
              <Trash2 className="h-5 w-5" />
            </div>
            <AlertDialogTitle className="text-slate-950">Remove this lead permanently?</AlertDialogTitle>
            <AlertDialogDescription className="leading-6 text-slate-600">
              {leadPendingDelete?.name ? `${leadPendingDelete.name} and all related records will be deleted. ` : ""}
              This removes activities, calls, follow-ups, document requests, verification checks, handoffs,
              payment records, Aadhaar/CIBIL records, and local uploaded files.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(deletingLeadId)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={Boolean(deletingLeadId)}
              onClick={(event) => {
                event.preventDefault();
                handleDeleteLead();
              }}
              className="bg-red-600 text-white hover:bg-red-700 focus:ring-red-600"
            >
              {deletingLeadId ? "Removing..." : "Remove Lead"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DuplicateLeadsModal
        isOpen={duplicateModalOpen}
        onClose={() => setDuplicateModalOpen(false)}
        leadId={selectedDuplicateLeadId}
        onFilterByPhone={(phone) => {
          setSearchInput(phone);
          setSearchTerm(phone);
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set("search", phone);
            next.set("page", "1");
            return next;
          });
        }}
      />
    </div>
  );
}

