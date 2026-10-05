import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Filter,
  Layers,
  PieChart as PieChartIcon,
  RefreshCw,
  Send,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import { apiGet } from "../lib/api";
import { useAuth } from "../lib/auth";

type Lead = {
  id: string;
  name: string;
  source?: string;
  sourceSystem?: string;
  status: string;
  priority: string;
  loanAmount: number | null;
  createdDate: string;
  pendingDocumentCount?: number;
  documentVerifiedCount?: number;
  documentTotalCount?: number;
  latestHandoffStatus?: string;
};

type TimeRange = "all" | "today" | "7days" | "30days";

const SOURCE_COLOR_MAP: Record<string, string> = {
  WaqtMoney: "#2563eb",   // Royal Blue
  WaqtFinance: "#0d9488", // Teal
  "Direct Web": "#8b5cf6",// Purple
  Referral: "#f59e0b",    // Amber
  Organic: "#10b981",     // Emerald
  Other: "#64748b",       // Slate
};

const DEFAULT_COLORS = ["#2563eb", "#0d9488", "#8b5cf6", "#f59e0b", "#10b981", "#64748b"];

export function AnalyticsReports() {
  const { user, activeRole } = useAuth();
  const [rawLeads, setRawLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState("");
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const currentRole = user?.role === "superadmin" ? "superadmin" : (activeRole || user?.role || "telecaller");
  const isTelecaller = currentRole === "telecaller";

  const fetchLeads = () => {
    const controller = new AbortController();
    setIsLoading(true);
    setApiError("");

    apiGet<Lead[]>(isTelecaller ? "/leads/telecaller-workbench" : "/leads", controller.signal)
      .then((data) => {
        setRawLeads(Array.isArray(data) ? data : []);
        setLastUpdated(new Date());
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setApiError(error instanceof Error ? error.message : "Unable to load analytics data");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  };

  useEffect(() => {
    return fetchLeads();
  }, [isTelecaller]);

  // CRITICAL REQUIREMENT: Filter out any GeetPay leads from Telecaller Analytics
  const leads = useMemo(() => {
    return rawLeads.filter((lead) => {
      const src = (lead.source || lead.sourceSystem || "").trim().toLowerCase();
      // Explicitly reject geetpay
      if (src === "geetpay" || src.includes("geetpay")) return false;

      // Filter by time range if selected
      if (timeRange === "all" || !lead.createdDate) return true;
      const created = new Date(lead.createdDate).getTime();
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;

      if (timeRange === "today") return now - created <= dayMs;
      if (timeRange === "7days") return now - created <= 7 * dayMs;
      if (timeRange === "30days") return now - created <= 30 * dayMs;

      return true;
    });
  }, [rawLeads, timeRange]);

  // Normalized Source Wise Leads Data (GeetPay removed & clean labels)
  const sourceData = useMemo(() => {
    const counts: Record<string, number> = {};
    leads.forEach((lead) => {
      const raw = (lead.source || lead.sourceSystem || "").trim().toLowerCase();
      let formatted = "Direct Web";

      if (raw === "waqtmoney") formatted = "WaqtMoney";
      else if (raw === "waqtfinance") formatted = "WaqtFinance";
      else if (raw === "direct" || raw === "web" || raw === "website") formatted = "Direct Web";
      else if (raw === "referral") formatted = "Referral";
      else if (raw === "organic") formatted = "Organic";
      else if (raw && raw !== "unknown") {
        formatted = raw.charAt(0).toUpperCase() + raw.slice(1);
      }

      counts[formatted] = (counts[formatted] || 0) + 1;
    });

    const total = Math.max(1, leads.length);
    return Object.entries(counts)
      .map(([name, count]) => ({
        name,
        count,
        percentage: Math.round((count / total) * 100),
        color: SOURCE_COLOR_MAP[name] || DEFAULT_COLORS[0],
      }))
      .sort((a, b) => b.count - a.count);
  }, [leads]);

  // Lead Status Funnel Data
  const statusFunnel = useMemo(() => {
    const counts: Record<string, number> = {};
    leads.forEach((lead) => {
      const status = lead.status || "New";
      counts[status] = (counts[status] || 0) + 1;
    });

    const order = ["New", "In Progress", "Docs Pending", "Document Verification", "Ready For Credit", "Disbursed", "Rejected"];
    
    // Include all status values found, keeping preferred order
    const result: Array<{ name: string; count: number; color: string }> = [];
    const colorPalette = ["#3b82f6", "#8b5cf6", "#f59e0b", "#0284c7", "#10b981", "#059669", "#ef4444"];

    Object.keys(counts).forEach((statusKey) => {
      const idx = order.indexOf(statusKey);
      result.push({
        name: statusKey,
        count: counts[statusKey],
        color: idx >= 0 ? colorPalette[idx % colorPalette.length] : "#64748b",
      });
    });

    return result.sort((a, b) => b.count - a.count);
  }, [leads]);

  // Priority Breakdown Data for Donut Chart
  const priorityData = useMemo(() => {
    const counts: Record<string, number> = { High: 0, Medium: 0, Low: 0 };
    leads.forEach((lead) => {
      const p = (lead.priority || "Low").charAt(0).toUpperCase() + (lead.priority || "Low").slice(1).toLowerCase();
      if (p === "High" || p === "Urgent") counts.High = (counts.High || 0) + 1;
      else if (p === "Medium" || p === "Normal") counts.Medium = (counts.Medium || 0) + 1;
      else counts.Low = (counts.Low || 0) + 1;
    });

    return [
      { name: "High Priority", value: counts.High, color: "#ef4444" },
      { name: "Medium Priority", value: counts.Medium, color: "#f59e0b" },
      { name: "Low Priority", value: counts.Low, color: "#10b981" },
    ].filter((item) => item.value > 0);
  }, [leads]);

  // Key Telecaller Metrics
  const docsPending = useMemo(() => leads.filter((l) => Number(l.pendingDocumentCount || 0) > 0).length, [leads]);
  const docsReady = useMemo(
    () => leads.filter((l) => Number(l.documentTotalCount || 0) > 0 && Number(l.pendingDocumentCount || 0) === 0).length,
    [leads]
  );
  const sentToCredit = useMemo(() => leads.filter((l) => Boolean(l.latestHandoffStatus)).length, [leads]);
  const conversionBase = Math.max(1, leads.length);
  const handoffRate = Math.round((sentToCredit / conversionBase) * 100);

  // Export CSV Action
  const exportCSV = () => {
    if (!sourceData.length) return;
    const csvRows = [["Source", "Lead Count", "Percentage Share"]];
    sourceData.forEach((row) => csvRows.push([row.name, String(row.count), `${row.percentage}%`]));
    const blob = new Blob(["\uFEFF" + csvRows.map((r) => r.join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `telecaller_source_analytics_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full min-w-0 bg-slate-50/50 dark:bg-slate-950 min-h-screen pb-12">
      {/* Header Section */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-6 sm:px-6 lg:px-8 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Telecaller Analytics Workbench
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-500">
                Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <h1 className="mt-1.5 text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Lead Performance & Source Insights
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Real-time telemetry for active leads, source distributions, document readiness, and handoff velocity.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Time Filter Pills */}
            <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700">
              {[
                { id: "all", label: "All Time" },
                { id: "today", label: "Today" },
                { id: "7days", label: "7 Days" },
                { id: "30days", label: "30 Days" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setTimeRange(tab.id as TimeRange)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    timeRange === tab.id
                      ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              onClick={fetchLeads}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition shadow-xs disabled:opacity-50"
              title="Refresh Data"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin text-emerald-600" : ""}`} />
              Refresh
            </button>

            <button
              onClick={exportCSV}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition shadow-xs"
            >
              <Download className="h-3.5 w-3.5" />
              Export Report
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        {apiError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
            <span>{apiError}</span>
          </div>
        )}

        {/* 4 Premium KPI Metric Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Total Active Leads */}
          <div className="relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs transition hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Total Telecaller Leads
              </span>
              <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                <Users className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900 dark:text-white">
                {isLoading ? "-" : leads.length.toLocaleString()}
              </span>
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center">
                <TrendingUp className="h-3 w-3 mr-0.5 inline" /> Live Queue
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Active assigned leads (GeetPay excluded)
            </p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-500"></div>
          </div>

          {/* Docs Pending */}
          <div className="relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs transition hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Docs Pending
              </span>
              <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
                <FileText className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900 dark:text-white">
                {isLoading ? "-" : docsPending.toLocaleString()}
              </span>
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                Action required
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Upload or verification needed
            </p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 to-orange-500"></div>
          </div>

          {/* Ready Docs */}
          <div className="relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs transition hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Ready for Handoff
              </span>
              <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900 dark:text-white">
                {isLoading ? "-" : docsReady.toLocaleString()}
              </span>
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                Verified 100%
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Ready for Credit Manager evaluation
            </p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-500"></div>
          </div>

          {/* Handoff Conversion Rate */}
          <div className="relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs transition hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Handoff Rate
              </span>
              <div className="p-2 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400">
                <Send className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900 dark:text-white">
                {isLoading ? "-" : `${handoffRate}%`}
              </span>
              <span className="text-xs font-medium text-teal-600 dark:text-teal-400">
                {sentToCredit} leads sent
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Conversion to Credit Manager review
            </p>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-500 to-cyan-500"></div>
          </div>
        </div>

        {/* FEATURED: Source Wise Leads (Redesigned & GeetPay Removed) */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Main Bar Chart Container */}
          <div className="lg:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-slate-100 dark:border-slate-800 gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    Source Wise Leads
                  </h2>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Distribution of telecaller lead acquisition channels (GeetPay excluded)
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  Total Sources: {sourceData.length}
                </span>
              </div>
            </div>

            {/* Chart Graphic */}
            <div className="mt-6 h-80 w-full">
              {sourceData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sourceData} margin={{ top: 20, right: 20, left: -10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.6} />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#64748b", fontSize: 12, fontWeight: 600 }}
                      dy={10}
                    />
                    <YAxis
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#94a3b8", fontSize: 11 }}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(241, 245, 249, 0.6)" }}
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="rounded-lg bg-slate-900 text-white p-3 shadow-xl text-xs border border-slate-700">
                              <p className="font-bold text-sm text-blue-400">{data.name}</p>
                              <div className="mt-2 space-y-1">
                                <p className="flex justify-between gap-4 text-slate-300">
                                  <span>Leads:</span>
                                  <span className="font-semibold text-white">{data.count}</span>
                                </p>
                                <p className="flex justify-between gap-4 text-slate-300">
                                  <span>Share:</span>
                                  <span className="font-semibold text-emerald-400">{data.percentage}%</span>
                                </p>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="count" radius={[8, 8, 0, 0]} maxBarSize={60}>
                      {sourceData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                  No source data available for the selected range
                </div>
              )}
            </div>
          </div>

          {/* Side Panel: Detailed Source Breakdown */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs flex flex-col justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Filter className="h-4 w-4 text-emerald-600" />
                Source Volume Breakdown
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Proportional contribution by lead origin
              </p>

              <div className="mt-5 space-y-4">
                {sourceData.map((src) => (
                  <div key={src.name} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: src.color }}></span>
                        {src.name}
                      </span>
                      <span className="text-slate-900 dark:text-white font-bold">
                        {src.count} <span className="text-slate-400 font-normal">({src.percentage}%)</span>
                      </span>
                    </div>
                    {/* Progress Bar */}
                    <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${src.percentage}%`, backgroundColor: src.color }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
              <Link
                to="/leads"
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 rounded-lg transition"
              >
                <span>View Full Lead Queue</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>

        {/* Lead Status Funnel & Priority Distribution */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Status Funnel */}
          <div className="lg:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Layers className="h-4 w-4 text-indigo-600" />
                  Lead Status Funnel
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Current active pipeline leads categorized by status stage
                </p>
              </div>
            </div>

            <div className="mt-6 h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusFunnel} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.6} />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#64748b", fontSize: 11, fontWeight: 500 }}
                    dy={8}
                  />
                  <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <Tooltip
                    cursor={{ fill: "rgba(241, 245, 249, 0.6)" }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload;
                        return (
                          <div className="rounded-lg bg-slate-900 text-white p-2.5 shadow-lg text-xs">
                            <p className="font-semibold">{d.name}</p>
                            <p className="mt-1 text-emerald-400 font-bold">{d.count} Leads</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} fill="#059669" maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Priority Distribution (Donut Chart) */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs flex flex-col justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <PieChartIcon className="h-4 w-4 text-amber-500" />
                Priority Mix
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Lead urgency distribution in telecaller queue
              </p>

              <div className="mt-4 h-52 w-full flex items-center justify-center">
                {priorityData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={priorityData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {priorityData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const d = payload[0].payload;
                            return (
                              <div className="rounded-lg bg-slate-900 text-white p-2 shadow-md text-xs">
                                <span className="font-bold">{d.name}:</span> {d.value} leads
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-xs text-slate-400">No priority data</div>
                )}
              </div>

              {/* Priority Legend */}
              <div className="mt-2 space-y-2">
                {priorityData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }}></span>
                      {item.name}
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-white">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Recommended Actions & Telecaller Handoff Queue */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-600" />
                Recommended Operational Actions
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Actionable next steps derived from live document status and handoff queue
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 p-4">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 font-semibold text-sm">
                <FileText className="h-4 w-4" />
                <span>Document Verification ({docsPending})</span>
              </div>
              <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
                {docsPending} leads currently have pending document uploads or verification checks required before handoff.
              </p>
              <Link
                to="/leads?tab=docs-pending"
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:underline"
              >
                <span>Process pending docs</span>
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 p-4">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-semibold text-sm">
                <CheckCircle2 className="h-4 w-4" />
                <span>Ready for Credit Review ({docsReady})</span>
              </div>
              <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
                {docsReady} leads have completed all document checks and can be submitted directly to Credit Manager.
              </p>
              <Link
                to="/leads?tab=ready-handoff"
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:underline"
              >
                <span>Submit to Credit</span>
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 p-4">
              <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-semibold text-sm">
                <ShieldCheck className="h-4 w-4" />
                <span>In Credit Handoff ({sentToCredit})</span>
              </div>
              <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
                {sentToCredit} leads have been handed off and are currently under evaluation by the Credit team.
              </p>
              <Link
                to="/leads?tab=sent-credit"
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:underline"
              >
                <span>Track handoff status</span>
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
