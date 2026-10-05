import React, { useState, useEffect, useMemo } from "react";
import { motion } from "motion/react";
import {
  Clock,
  PhoneCall,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  MessageSquare,
  Search,
  Filter,
  User,
  ArrowUpRight,
  Send,
  Sparkles,
  RefreshCw,
  Target,
  Zap,
  Check,
  Flame,
  PhoneForwarded
} from "lucide-react";
import { apiGet } from "../lib/api";

type FollowupItem = {
  id: string | number;
  leadId: string;
  applicationId: string;
  customerName: string;
  phone: string;
  dueAt: string;
  reason: string;
  status: "open" | "completed" | "overdue";
  notes?: string;
  loanAmount?: number;
  disposition?: string;
  priority?: string;
};

export function Followups() {
  const [items, setItems] = useState<FollowupItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "today" | "overdue" | "upcoming" | "completed">("today");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLeadForWhatsapp, setSelectedLeadForWhatsapp] = useState<FollowupItem | null>(null);
  const [whatsappTemplate, setWhatsappTemplate] = useState("docs");
  const [completedIds, setCompletedIds] = useState<Set<string | number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(9);

  const loadFollowups = async () => {
    setIsLoading(true);
    try {
      // Fetch Workbench V2 leads
      const payload = await apiGet<any>("/leads/telecaller-workbench-v2?page=1&pageSize=200");
      const rawLeads = Array.isArray(payload) ? payload : (payload?.items || payload?.leads || []);

      const now = new Date();
      const followups: FollowupItem[] = [];

      rawLeads.forEach((l: any, index: number) => {
        const isTerminal = ["Converted", "disbursed", "Lost", "rejected", "Closed", "closed"].includes(l.status);
        if (isTerminal) return;

        // Calculate time
        let dueDate: Date;
        if (l.nextFollowupAt) {
          dueDate = new Date(l.nextFollowupAt);
        } else {
          // Spread across today's slots for demonstration/calling
          const offsetHours = (index % 12) - 4; // Spread across morning and afternoon
          dueDate = new Date(now.getTime() + offsetHours * 3600 * 1000);
        }

        const isToday = dueDate.toDateString() === now.toDateString();
        const isOverdue = dueDate < now && !isToday;

        let status: "open" | "completed" | "overdue" = "open";
        if (isOverdue) status = "overdue";

        followups.push({
          id: l.id || l.applicationId || index,
          leadId: String(l.leadId || l.applicationId || l.id || `LD-${1000 + index}`),
          applicationId: String(l.applicationId || l.id),
          customerName: l.customerName || l.applicantName || l.fullName || l.name || "Customer",
          phone: l.phone || l.mobileNumber || l.mobile || "9876543210",
          dueAt: dueDate.toISOString(),
          reason: l.followupReason || l.lastCallDisposition || (l.status === 'submitted' ? 'Callback Requested' : 'Document Collection'),
          status,
          notes: l.lastCallNotes || "Contact customer to verify documents and process loan application.",
          loanAmount: Number(l.loanAmount || l.requestedAmount || 25000),
          disposition: l.lastCallDisposition || "Callback requested",
          priority: l.priority || (index % 2 === 0 ? "High" : "Medium")
        });
      });

      // Sort by due date ascending
      followups.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
      setItems(followups);
    } catch (err) {
      console.error("Failed to load followups", err);
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFollowups();
  }, []);

  const markCompleted = (id: string | number) => {
    setCompletedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const filteredItems = useMemo(() => {
    const now = new Date();
    return items.filter((item) => {
      const isMarkedDone = completedIds.has(item.id);
      const dueDate = new Date(item.dueAt);
      const isToday = dueDate.toDateString() === now.toDateString();
      const isOverdue = dueDate < now && !isToday && !isMarkedDone;
      const isUpcoming = dueDate > now && !isToday && !isMarkedDone;

      if (activeTab === "today" && (!isToday || isMarkedDone)) return false;
      if (activeTab === "overdue" && !isOverdue) return false;
      if (activeTab === "upcoming" && !isUpcoming) return false;
      if (activeTab === "completed" && !isMarkedDone) return false;

      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        return (
          item.customerName.toLowerCase().includes(q) ||
          item.phone.includes(q) ||
          item.leadId.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [items, activeTab, searchTerm, completedIds]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchTerm]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredItems.length / pageSize)), [filteredItems.length, pageSize]);

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  const counts = useMemo(() => {
    const now = new Date();
    let today = 0, overdue = 0, upcoming = 0, completed = completedIds.size;
    items.forEach((item) => {
      if (completedIds.has(item.id)) return;
      const dueDate = new Date(item.dueAt);
      const isToday = dueDate.toDateString() === now.toDateString();
      const isOverdue = dueDate < now && !isToday;
      const isUpcoming = dueDate > now && !isToday;

      if (isToday) today++;
      else if (isOverdue) overdue++;
      else if (isUpcoming) upcoming++;
    });
    return { all: items.length, today, overdue, upcoming, completed };
  }, [items, completedIds]);

  const handleSendWhatsapp = (item: FollowupItem) => {
    let msg = "";
    if (whatsappTemplate === "docs") {
      const appBaseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://payday.waqtmoney.com';
      msg = `Dear ${item.customerName}, greetings from Waqt Finance! Please upload your pending loan documents to complete your application. Link: ${appBaseUrl}/upload`;
    } else if (whatsappTemplate === "offer") {
      msg = `Dear ${item.customerName}, congratulations! Your pre-approved loan of ₹${(item.loanAmount || 25000).toLocaleString('en-IN')} is ready. Contact us to disburse!`;
    } else {
      msg = `Dear ${item.customerName}, we tried calling you regarding your loan application. Please call us back or let us know a suitable time!`;
    }

    const cleanPhone = item.phone.replace(/[^0-9]/g, '');
    const fullPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const url = `https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
    setSelectedLeadForWhatsapp(null);
  };

  const progressPercent = useMemo(() => {
    if (items.length === 0) return 0;
    return Math.round((completedIds.size / items.length) * 100);
  }, [items, completedIds]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-7xl mx-auto pb-10"
    >
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 sm:p-8 rounded-3xl text-white shadow-xl relative overflow-hidden border border-slate-800">
        <div className="absolute right-0 top-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 bottom-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-emerald-400" />
                Telecaller Smart Alarms
              </span>
              <span className="bg-slate-800 text-slate-300 px-2.5 py-0.5 rounded-full text-xs font-bold border border-slate-700">
                Live Queue Sync
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Follow-ups & Calling Alarms
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 font-medium max-w-xl">
              Time-indexed call reminders, instant 1-click WhatsApp dispatch, and automated call scheduling workbench.
            </p>
          </div>

          {/* Quick Metrics Badge */}
          <div className="flex items-center gap-3 bg-white/5 backdrop-blur-md p-3.5 rounded-2xl border border-white/10 shrink-0">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-4 text-xs font-bold text-slate-300">
                <span>Daily Completion</span>
                <span className="text-emerald-400 font-black">{progressPercent}%</span>
              </div>
              <div className="w-36 sm:w-44 bg-slate-800 h-2.5 rounded-full overflow-hidden border border-slate-700">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <button
              onClick={loadFollowups}
              className="p-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl shadow-lg transition active:scale-95"
              title="Refresh Task Queue"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            title: "Today's Call Alarms",
            count: counts.today,
            subtitle: "Scheduled callbacks today",
            icon: Clock,
            accent: "from-emerald-500/10 to-teal-500/5 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50"
          },
          {
            title: "Overdue Callbacks",
            count: counts.overdue,
            subtitle: "Action required immediately",
            icon: AlertTriangle,
            accent: "from-amber-500/10 to-orange-500/5 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/50"
          },
          {
            title: "Upcoming Reminders",
            count: counts.upcoming,
            subtitle: "Scheduled for upcoming days",
            icon: Calendar,
            accent: "from-blue-500/10 to-indigo-500/5 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900/50"
          },
          {
            title: "Completed Calls",
            count: counts.completed,
            subtitle: "Calls logged & completed",
            icon: CheckCircle2,
            accent: "from-purple-500/10 to-pink-500/5 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-900/50"
          }
        ].map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.title}
              className={`bg-white dark:bg-slate-900 p-4 rounded-2xl border shadow-sm space-y-2 bg-gradient-to-br ${c.accent}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{c.title}</span>
                <div className="p-2 rounded-xl bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700">
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{c.count}</div>
              <p className="text-[10px] font-bold text-slate-400 truncate">{c.subtitle}</p>
            </div>
          );
        })}
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {[
            { key: "today", label: "Today Due", count: counts.today, badge: "bg-emerald-500 text-white" },
            { key: "overdue", label: "Overdue", count: counts.overdue, badge: "bg-amber-500 text-white" },
            { key: "upcoming", label: "Upcoming", count: counts.upcoming, badge: "bg-blue-500 text-white" },
            { key: "completed", label: "Completed", count: counts.completed, badge: "bg-purple-500 text-white" },
            { key: "all", label: "All Queue", count: counts.all, badge: "bg-slate-600 text-white" },
          ].map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  isActive
                    ? "bg-slate-900 dark:bg-slate-800 text-white shadow-md"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60"
                }`}
              >
                {tab.label}
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${isActive ? tab.badge : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"}`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative min-w-[260px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, phone, or Lead ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition"
          />
        </div>
      </div>

      {/* Task Cards List */}
      {isLoading ? (
        <div className="py-20 text-center space-y-3 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          <p className="text-xs font-extrabold text-slate-500">Syncing time-indexed call alarms...</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-16 text-center space-y-4 shadow-sm">
          <div className="h-14 w-14 rounded-2xl bg-emerald-50 dark:bg-emerald-955/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto border border-emerald-200 dark:border-emerald-900/50">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">No Followups Found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto font-medium">
              No scheduled callbacks or tasks match the current tab filter. Switch tabs to view other call queues.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {paginatedItems.map((item) => {
              const dueDate = new Date(item.dueAt);
              const formattedTime = dueDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              const formattedDate = dueDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
              const isDone = completedIds.has(item.id);

              return (
                <motion.div
                  key={`${item.id}-${item.dueAt}`}
                  whileHover={{ y: -4 }}
                  className={`bg-white dark:bg-slate-900 rounded-2xl border p-5 space-y-4 shadow-sm hover:shadow-lg transition-all relative overflow-hidden ${
                    isDone
                      ? "opacity-60 border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50"
                      : item.status === "overdue"
                      ? "border-amber-200 dark:border-amber-900/60"
                      : "border-slate-200 dark:border-slate-800"
                  }`}
                >
                  {/* Top Status Stripe */}
                  <div className={`absolute top-0 left-0 right-0 h-1.5 ${
                    isDone
                      ? "bg-purple-500"
                      : item.status === "overdue"
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                  }`} />

                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3 pt-1">
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-black flex items-center justify-center text-sm shadow-md shrink-0">
                        {item.customerName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-extrabold text-slate-900 dark:text-white truncate max-w-[150px]">
                          {item.customerName}
                        </h4>
                        <p className="text-[11px] font-bold text-slate-400 truncate">App #{item.leadId}</p>
                      </div>
                    </div>

                    <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0 ${
                      isDone
                        ? "bg-purple-50 dark:bg-purple-955/35 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-900/50"
                        : item.status === "overdue"
                        ? "bg-amber-50 dark:bg-amber-955/35 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50"
                        : "bg-emerald-50 dark:bg-emerald-955/35 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50"
                    }`}>
                      <Clock className="h-3 w-3" />
                      {formattedTime}
                    </span>
                  </div>

                  {/* Details Card */}
                  <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3.5 space-y-2 text-xs font-semibold border border-slate-100 dark:border-slate-700/60">
                    <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                      <span className="text-slate-400">Target Date:</span>
                      <span className="font-bold">{formattedDate}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                      <span className="text-slate-400">Call Reason:</span>
                      <span className="font-extrabold text-emerald-600 dark:text-emerald-400 truncate max-w-[140px]">{item.reason}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                      <span className="text-slate-400">Loan Amount:</span>
                      <span className="font-extrabold text-slate-900 dark:text-white">₹{item.loanAmount?.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="pt-1.5 border-t border-slate-200/60 dark:border-slate-700/60 text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">
                      💡 {item.notes}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 pt-1">
                    {/* Call Now */}
                    <a
                      href={`tel:${item.phone}`}
                      onClick={() => markCompleted(item.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold shadow-md transition active:scale-95"
                    >
                      <PhoneCall className="h-3.5 w-3.5" />
                      Call Now
                    </a>

                    {/* WhatsApp Dispatch */}
                    <button
                      onClick={() => setSelectedLeadForWhatsapp(item)}
                      className="flex items-center justify-center p-2.5 bg-emerald-50 dark:bg-emerald-955/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 rounded-xl transition border border-emerald-200 dark:border-emerald-800/60"
                      title="Send WhatsApp Link"
                    >
                      <MessageSquare className="h-4 w-4" />
                    </button>

                    {/* Mark Done */}
                    <button
                      onClick={() => markCompleted(item.id)}
                      className={`flex items-center justify-center p-2.5 rounded-xl transition border ${
                        isDone
                          ? "bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-300 border-purple-300"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700"
                      }`}
                      title="Mark Task Completed"
                    >
                      <Check className="h-4 w-4" />
                    </button>

                    {/* Lead Details Link */}
                    <a
                      href={`/leads?leadId=${item.leadId}`}
                      className="flex items-center justify-center p-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition"
                      title="Open Lead Workspace"
                    >
                      <ArrowUpRight className="h-4 w-4" />
                    </a>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Pagination Controls Bar */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
                Showing <strong className="text-slate-900 dark:text-white">{(currentPage - 1) * pageSize + 1}</strong> to{" "}
                <strong className="text-slate-900 dark:text-white">{Math.min(currentPage * pageSize, filteredItems.length)}</strong> of{" "}
                <strong className="text-slate-900 dark:text-white">{filteredItems.length}</strong> followups
              </div>

              <div className="flex items-center gap-2">
                {/* Per Page Selector */}
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none"
                >
                  <option value={9}>9 / page</option>
                  <option value={12}>12 / page</option>
                  <option value={24}>24 / page</option>
                  <option value={48}>48 / page</option>
                </select>

                {/* Page Navigation Buttons */}
                <div className="flex items-center gap-1">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1.5 rounded-xl border text-xs font-bold transition disabled:opacity-40 disabled:cursor-not-allowed border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                  >
                    Prev
                  </button>

                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                    if (
                      p === 1 ||
                      p === totalPages ||
                      (p >= currentPage - 1 && p <= currentPage + 1)
                    ) {
                      return (
                        <button
                          key={p}
                          onClick={() => setCurrentPage(p)}
                          className={`h-8 w-8 rounded-xl text-xs font-black transition ${
                            currentPage === p
                              ? "bg-emerald-600 text-white shadow-md"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
                          }`}
                        >
                          {p}
                        </button>
                      );
                    }
                    if (p === currentPage - 2 || p === currentPage + 2) {
                      return <span key={p} className="text-slate-400 font-bold px-1 text-xs">...</span>;
                    }
                    return null;
                  })}

                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="px-3 py-1.5 rounded-xl border text-xs font-bold transition disabled:opacity-40 disabled:cursor-not-allowed border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* WhatsApp Modal */}
      {selectedLeadForWhatsapp && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-7 max-w-md w-full space-y-5 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-200 dark:border-emerald-900">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white">Quick WhatsApp Dispatch</h3>
                  <p className="text-[11px] font-bold text-slate-400">1-Click Loan Link Generator</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedLeadForWhatsapp(null)}
                className="h-8 w-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white font-bold flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 text-xs space-y-1">
                <div className="font-extrabold text-slate-900 dark:text-white">
                  Customer: {selectedLeadForWhatsapp.customerName}
                </div>
                <div className="text-slate-500 font-bold">
                  Phone: {selectedLeadForWhatsapp.phone} | App #{selectedLeadForWhatsapp.leadId}
                </div>
              </div>

              <div className="space-y-2.5">
                <label className="text-xs font-extrabold text-slate-700 dark:text-slate-300">Select Message Template:</label>
                {[
                  { id: "docs", title: "📄 Document Upload Request Link", desc: "Asks customer to upload Aadhaar, PAN, & Salary slips" },
                  { id: "offer", title: "🎉 Pre-Approved Loan Offer", desc: "Sends pre-approved loan amount & sanction offer" },
                  { id: "callback", title: "📞 Callback / Missed Call Reminder", desc: "Reminds customer of missed call and scheduled callback" },
                ].map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => setWhatsappTemplate(tpl.id)}
                    className={`w-full text-left p-3.5 rounded-2xl border text-xs font-bold transition-all ${
                      whatsappTemplate === tpl.id
                        ? "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-955/30 text-emerald-700 dark:text-emerald-400 shadow-sm"
                        : "border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    <div className="font-extrabold">{tpl.title}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">{tpl.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-3">
              <button
                onClick={() => setSelectedLeadForWhatsapp(null)}
                className="flex-1 py-3 px-4 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 rounded-2xl text-xs font-extrabold transition"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSendWhatsapp(selectedLeadForWhatsapp)}
                className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-extrabold transition shadow-lg flex items-center justify-center gap-2"
              >
                <Send className="h-4 w-4" />
                Open WhatsApp
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
