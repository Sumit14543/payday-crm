import React, { useState, useEffect, useCallback } from "react";
import {
  PhoneCall,
  ShieldCheck,
  Clock,
  AlertTriangle,
  Award,
  Download,
  RefreshCw,
  TrendingUp,
  UserCheck,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  Filter,
  Flame,
  Zap,
  UsersRound,
  ArrowUpRight,
} from "lucide-react";
import { apiGet } from "../lib/api";

type TelecallerMetrics = {
  rank: number;
  actor: string;
  totalCalls: number;
  interestedCalls: number;
  notReachableCalls: number;
  switchedOffCalls: number;
  callbackCalls: number;
  notInterestedCalls: number;
  wrongNumberCalls: number;
  languageIssueCalls: number;
  avgCallDurationSec: number;
  totalAssignedLeads: number;
  convertedLeads: number;
  conversionRate: number;
  lastCallAt?: string;
};

type CreditManagerMetrics = {
  rank: number;
  managerName: string;
  camCount: number;
  sanctionCount: number;
  totalReviewed: number;
  approvedCount: number;
  rejectedCount: number;
  approvalRate: number;
  avgApprovedAmount: number;
  avgProcessingMins: number;
};

type BottleneckAlerts = {
  uncontactedCount: number;
  pendingCreditCount: number;
  uncontactedLeads: Array<{
    id: string;
    name: string;
    phone: string;
    assignedTo: string;
    status: string;
    uncontactedMins: number;
  }>;
  pendingCreditReviews: Array<{
    id: string;
    name: string;
    phone: string;
    loanAmount: number;
    assignedTo: string;
    status: string;
    pendingMins: number;
  }>;
};

export function TeamPerformanceDashboard() {
  const [period, setPeriod] = useState<string>("last30days");
  const [telecallerData, setTelecallerData] = useState<{ summary?: any; telecallers?: TelecallerMetrics[] }>({});
  const [creditData, setCreditData] = useState<{ summary?: any; creditManagers?: CreditManagerMetrics[]; rejectionReasons?: any[] }>({});
  const [bottlenecks, setBottlenecks] = useState<BottleneckAlerts | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<"telecallers" | "credit" | "bottlenecks">("telecallers");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, cRes, bRes] = await Promise.all([
        apiGet<any>(`/performance/telecallers?period=${period}`),
        apiGet<any>(`/performance/credit-managers?period=${period}`),
        apiGet<BottleneckAlerts>(`/performance/bottlenecks`),
      ]);
      setTelecallerData(tRes || {});
      setCreditData(cRes || {});
      setBottlenecks(bRes || null);
    } catch (err) {
      console.error("Failed to load performance data:", err);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleExportCsv = () => {
    window.open(`/api/performance/export?period=${period}`, "_blank");
  };

  const telecallers = telecallerData.telecallers || [];
  const creditManagers = creditData.creditManagers || [];
  const tSummary = telecallerData.summary || {};
  const cSummary = creditData.summary || {};

  return (
    <div className="w-full min-w-0 space-y-6 pb-12">
      {/* Top Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-5 sm:px-6 lg:px-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              <Zap className="h-3.5 w-3.5" /> Performance Analytics
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
            Staff & Role Performance Tracker
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Real-time call throughput, lead conversion %, credit SLA turnaround time, and delay alerts.
          </p>
        </div>

        {/* Action Bar */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1 shadow-sm">
            {[
              { id: "today", label: "Today" },
              { id: "last7days", label: "Last 7 Days" },
              { id: "last30days", label: "Last 30 Days" },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  period === p.id
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
            title="Refresh Metrics"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>

          <button
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-3.5 py-2 text-xs font-semibold text-white dark:text-slate-950 shadow-sm hover:bg-slate-800 dark:hover:bg-slate-100 transition cursor-pointer"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </div>
      </header>

      <div className="px-4 sm:px-6 lg:px-8 space-y-6">
        {/* KPI Scorecards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Calls Logged</span>
              <div className="h-9 w-9 rounded-lg bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <PhoneCall className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-3 text-3xl font-extrabold text-slate-950 dark:text-white">{tSummary.totalCallsMade || 0}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Active staff: <strong className="text-slate-700 dark:text-slate-200">{tSummary.activeTelecallersCount || 0}</strong> telecallers
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Overall Conversion %</span>
              <div className="h-9 w-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-3 text-3xl font-extrabold text-slate-950 dark:text-white">{tSummary.overallConversionRate || 0}%</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Sent to credit: <strong className="text-slate-700 dark:text-slate-200">{tSummary.totalConvertedLeads || 0}</strong> leads
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Credit Review Avg SLA</span>
              <div className="h-9 w-9 rounded-lg bg-purple-50 dark:bg-purple-950/60 flex items-center justify-center text-purple-600 dark:text-purple-400">
                <Clock className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-3 text-3xl font-extrabold text-slate-950 dark:text-white">{cSummary.avgSlaMins || 18} <span className="text-base font-normal text-slate-500">mins</span></p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Approval rate: <strong className="text-slate-700 dark:text-slate-200">{cSummary.overallApprovalRate || 0}%</strong>
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">SLA Bottleneck Alerts</span>
              <div className="h-9 w-9 rounded-lg bg-amber-50 dark:bg-amber-950/60 flex items-center justify-center text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-3 text-3xl font-extrabold text-amber-600 dark:text-amber-400">
              {(bottlenecks?.uncontactedCount || 0) + (bottlenecks?.pendingCreditCount || 0)}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Uncontacted: <strong>{bottlenecks?.uncontactedCount || 0}</strong> | Stalled Credit: <strong>{bottlenecks?.pendingCreditCount || 0}</strong>
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-slate-200 dark:border-slate-800 flex gap-6">
          <button
            onClick={() => setActiveTab("telecallers")}
            className={`pb-3 text-sm font-semibold border-b-2 transition cursor-pointer ${
              activeTab === "telecallers"
                ? "border-emerald-600 text-emerald-600 dark:text-emerald-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            Telecallers Performance ({telecallers.length})
          </button>
          <button
            onClick={() => setActiveTab("credit")}
            className={`pb-3 text-sm font-semibold border-b-2 transition cursor-pointer ${
              activeTab === "credit"
                ? "border-emerald-600 text-emerald-600 dark:text-emerald-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            Credit Managers Scorecard ({creditManagers.length})
          </button>
          <button
            onClick={() => setActiveTab("bottlenecks")}
            className={`pb-3 text-sm font-semibold border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === "bottlenecks"
                ? "border-amber-600 text-amber-600 dark:text-amber-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            Delay & Bottleneck Alerts
            {((bottlenecks?.uncontactedCount || 0) + (bottlenecks?.pendingCreditCount || 0)) > 0 && (
              <span className="rounded-full bg-amber-500 text-white px-2 py-0.5 text-xs font-bold">
                {(bottlenecks?.uncontactedCount || 0) + (bottlenecks?.pendingCreditCount || 0)}
              </span>
            )}
          </button>
        </div>

        {/* Tab Content 1: Telecaller Performance */}
        {activeTab === "telecallers" && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-950 dark:text-white">Telecaller Daily Call Leaderboard</h2>
                <p className="text-xs text-slate-500">Track total calls, dispositions distribution, and conversion to credit stage.</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <th className="px-6 py-3.5">Rank</th>
                    <th className="px-6 py-3.5">Telecaller</th>
                    <th className="px-6 py-3.5 text-center">Total Calls</th>
                    <th className="px-6 py-3.5">Dispositions Breakdown</th>
                    <th className="px-6 py-3.5 text-center">Avg Duration</th>
                    <th className="px-6 py-3.5 text-center">Assigned / Converted</th>
                    <th className="px-6 py-3.5 text-right">Conversion %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                  {telecallers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                        No call activity logged for this period.
                      </td>
                    </tr>
                  ) : (
                    telecallers.map((t) => (
                      <tr key={t.actor} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-6 py-4 font-bold text-slate-400">
                          {t.rank === 1 ? <Award className="h-5 w-5 text-amber-500 inline" /> : `#${t.rank}`}
                        </td>
                        <td className="px-6 py-4 font-semibold text-slate-950 dark:text-white">
                          {t.actor}
                        </td>
                        <td className="px-6 py-4 text-center font-bold text-slate-900 dark:text-white">
                          {t.totalCalls}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1.5 text-xs">
                            <span className="rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 px-2 py-0.5 font-medium">
                              Interested: {t.interestedCalls}
                            </span>
                            <span className="rounded-md bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400 px-2 py-0.5 font-medium">
                              Callback: {t.callbackCalls}
                            </span>
                            <span className="rounded-md bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 px-2 py-0.5 font-medium">
                              Unreachable: {t.notReachableCalls}
                            </span>
                            <span className="rounded-md bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 px-2 py-0.5 font-medium">
                              Not Interested: {t.notInterestedCalls}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center text-slate-600 dark:text-slate-400">
                          {t.avgCallDurationSec}s
                        </td>
                        <td className="px-6 py-4 text-center font-medium text-slate-900 dark:text-white">
                          {t.totalAssignedLeads} / <span className="text-emerald-600 font-bold">{t.convertedLeads}</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold ${
                            t.conversionRate >= 40
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                              : t.conversionRate >= 20
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                              : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          }`}>
                            {t.conversionRate}%
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab Content 2: Credit Manager Performance */}
        {activeTab === "credit" && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs overflow-hidden space-y-6">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-base font-bold text-slate-950 dark:text-white">Credit Manager Decision & SLA Scorecard</h2>
              <p className="text-xs text-slate-500">Track total applications reviewed, approval/rejection rates, and average SLA processing time.</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <th className="px-6 py-3.5">Rank</th>
                    <th className="px-6 py-3.5">Credit Manager</th>
                    <th className="px-6 py-3.5 text-center">CAM Sheets</th>
                    <th className="px-6 py-3.5 text-center">Sanctions Generated</th>
                    <th className="px-6 py-3.5 text-center">Approved vs Rejected</th>
                    <th className="px-6 py-3.5 text-center">Avg Processing SLA</th>
                    <th className="px-6 py-3.5 text-right">Approval Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                  {creditManagers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                        No credit manager activity recorded for this period.
                      </td>
                    </tr>
                  ) : (
                    creditManagers.map((c) => (
                      <tr key={c.managerName} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="px-6 py-4 font-bold text-slate-400">#{c.rank}</td>
                        <td className="px-6 py-4 font-semibold text-slate-950 dark:text-white">
                          {c.managerName}
                        </td>
                        <td className="px-6 py-4 text-center font-medium text-slate-900 dark:text-white">
                          {c.camCount}
                        </td>
                        <td className="px-6 py-4 text-center font-medium text-slate-900 dark:text-white">
                          {c.sanctionCount}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="text-emerald-600 font-bold">{c.approvedCount} Approved</span> / <span className="text-rose-600 font-bold">{c.rejectedCount} Rejected</span>
                        </td>
                        <td className="px-6 py-4 text-center font-semibold text-purple-600 dark:text-purple-400">
                          {c.avgProcessingMins} mins
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-950 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                            {c.approvalRate}%
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab Content 3: Delay & Bottleneck Alerts */}
        {activeTab === "bottlenecks" && (
          <div className="space-y-6">
            {/* Uncontacted Leads Warning */}
            <div className="bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/50 rounded-xl p-6 shadow-xs">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-9 w-9 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-950 dark:text-white">Uncontacted Leads (&gt; 30 Mins Delay)</h3>
                  <p className="text-xs text-slate-500">Leads assigned to telecallers with no call log recorded for over 30 minutes.</p>
                </div>
              </div>

              {!bottlenecks?.uncontactedLeads || bottlenecks.uncontactedLeads.length === 0 ? (
                <p className="text-sm text-emerald-600 font-medium bg-emerald-50 dark:bg-emerald-950/40 p-4 rounded-lg">
                  ✓ Great job! No uncontacted leads exceeding the 30-minute SLA threshold.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800">
                  {bottlenecks.uncontactedLeads.map((item) => (
                    <div key={item.id} className="py-3 flex items-center justify-between text-sm">
                      <div>
                        <span className="font-bold text-slate-950 dark:text-white">{item.id} - {item.name}</span>
                        <span className="text-xs text-slate-500 ml-2">Phone: {item.phone}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Assigned: {item.assignedTo}</span>
                        <span className="rounded-full bg-amber-100 dark:bg-amber-950 px-2.5 py-0.5 text-xs font-bold text-amber-800 dark:text-amber-300">
                          {item.uncontactedMins} mins delayed
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pending Credit Reviews Warning */}
            <div className="bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-900/50 rounded-xl p-6 shadow-xs">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-9 w-9 rounded-lg bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-400 flex items-center justify-center">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-950 dark:text-white">Stalled Credit Reviews (&gt; 2 Hours Delay)</h3>
                  <p className="text-xs text-slate-500">Applications pending in Credit Review for over 2 hours without sanction decision.</p>
                </div>
              </div>

              {!bottlenecks?.pendingCreditReviews || bottlenecks.pendingCreditReviews.length === 0 ? (
                <p className="text-sm text-emerald-600 font-medium bg-emerald-50 dark:bg-emerald-950/40 p-4 rounded-lg">
                  ✓ Great job! No applications stalled in Credit Manager review queue.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800">
                  {bottlenecks.pendingCreditReviews.map((item) => (
                    <div key={item.id} className="py-3 flex items-center justify-between text-sm">
                      <div>
                        <span className="font-bold text-slate-950 dark:text-white">{item.id} - {item.name}</span>
                        <span className="text-xs text-slate-500 ml-2">Loan: ₹{item.loanAmount?.toLocaleString("en-IN") || 0}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Assigned: {item.assignedTo}</span>
                        <span className="rounded-full bg-rose-100 dark:bg-rose-950 px-2.5 py-0.5 text-xs font-bold text-rose-800 dark:text-rose-300">
                          {Math.round(item.pendingMins / 60)}h {item.pendingMins % 60}m pending
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
