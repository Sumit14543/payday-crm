import React, { useState, useEffect, useMemo } from "react";
import { apiGet } from "../../lib/api";

import { motion } from "motion/react";
import {
  IndianRupee,
  TrendingUp,
  Receipt,
  Download,
  Calendar,
  Layers,
  ArrowUpRight,
  Sparkles,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Building2,
  Percent,
  Wallet,
  Printer
} from "lucide-react";

const getLocalDateStr = (dtStr: string) => {
  if (!dtStr) return "";
  try {
    const date = new Date(dtStr);
    if (isNaN(date.getTime())) return "";
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  } catch {
    return dtStr.slice(0, 10);
  }
};

export function RevenueAnalytics() {
  const [timeframe, setTimeframe] = useState<"today" | "month" | "all">("month");
  const [tableTimeframe, setTableTimeframe] = useState<"today" | "yesterday" | "month" | "all" | "custom">("all");
  const [tableFromDate, setTableFromDate] = useState<string>("");
  const [tableToDate, setTableToDate] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [statusFilter, setStatusFilter] = useState<"all" | "realized" | "partial" | "pending">("all");

  // Dynamic Metrics State (ROI + PF + GST = Total Revenue)
  const [metrics, setMetrics] = useState({
    todayRoi: 0,
    todayPf: 0,
    todayGst: 0,
    todayTotal: 0,

    monthRoi: 0,
    monthPf: 0,
    monthGst: 0,
    monthTotal: 0,

    totalRoi: 0,
    totalPf: 0,
    totalGst: 0,
    grandTotal: 0
  });

  useEffect(() => {
    let active = true;
    apiGet<any[]>("/loans?page=1&limit=5000&pageSize=5000")
      .then((data) => {
        if (active && Array.isArray(data) && data.length > 0) {
          setLeads(data);
          
          // Calculate dynamic revenue metrics. PF & GST depend on Disbursement date. ROI depends on Repayment.
          const loans = data;

          if (loans.length > 0) {
            const today = getLocalDateStr(new Date().toISOString());
            const currentMonthStr = new Date().toISOString().slice(0, 7);

            let tRoi = 0, tPf = 0, tGst = 0;
            let mRoi = 0, mPf = 0, mGst = 0;
            let totRoi = 0, totPf = 0, totGst = 0;

            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();

            loans.forEach((l) => {
              const principal = Number(l.principal || 0);
              const amountPaid = Number(l.amountPaid || 0);
              
              const pf = Number(l.processingFee || Math.round(principal * 0.10));
              const gst = Number(l.gstAmount || Math.round(pf * 0.18));
              const roi = Number(l.interestAmount || (Number(l.repaymentAmount || 0) - principal) || 0);

              // PF and GST are booked on DISBURSEMENT (disbursedDate, startDate or createdAt)
              totPf += pf;
              totGst += gst;

              const disbDate = l.disbursedDate ? new Date(l.disbursedDate) : (l.startDate ? new Date(l.startDate) : (l.createdAt ? new Date(l.createdAt) : new Date()));
              const isToday = disbDate.toDateString() === now.toDateString();
              const isThisMonth = disbDate.getMonth() === currentMonth && disbDate.getFullYear() === currentYear;

              if (isToday) {
                tPf += pf;
                tGst += gst;
              }
              if (isThisMonth) {
                mPf += pf;
                mGst += gst;
              }

              // ROI is booked ONLY on REPAYMENT - retrieved directly from exact DB repayments subqueries
              tRoi += Number(l.todayRoi || 0);
              mRoi += Number(l.monthRoi || 0);
              totRoi += Number(l.totalRoi || 0);
            });

            setMetrics({
              todayRoi: tRoi,
              todayPf: tPf,
              todayGst: tGst,
              todayTotal: tRoi + tPf + tGst,

              monthRoi: mRoi,
              monthPf: mPf,
              monthGst: mGst,
              monthTotal: mRoi + mPf + mGst,

              totalRoi: totRoi,
              totalPf: totPf,
              totalGst: totGst,
              grandTotal: totRoi + totPf + totGst
            });
          }
          setLoading(false);

        } else if (active) {
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Failed to load revenue leads:", err);
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, []);

  const filteredLeads = useMemo(() => {
    const todayStr = getLocalDateStr(new Date().toISOString());
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = getLocalDateStr(yesterday.toISOString());
    const currentMonthStr = new Date().toISOString().slice(0, 7);

    const isDateInTimeframe = (dateStr: string) => {
      if (!dateStr) return false;
      if (tableTimeframe === "today") return dateStr === todayStr;
      if (tableTimeframe === "yesterday") return dateStr === yesterdayStr;
      if (tableTimeframe === "month") return dateStr.slice(0, 7) === currentMonthStr;
      if (tableTimeframe === "all") return true;
      if (tableTimeframe === "custom") {
        const start = tableFromDate ? tableFromDate : "1970-01-01";
        const end = tableToDate ? tableToDate : "9999-12-31";
        return dateStr >= start && dateStr <= end;
      }
      return false;
    };

    return leads.filter(l => {
      const matchesSearch = (l.customer || l.name || "").toLowerCase().includes(searchQuery.toLowerCase());
      
      const principal = Number(l.principal || 0);
      const amountPaid = Number(l.amountPaid || 0);
      const targetRepayment = Number(l.repaymentAmount || principal * 1.12);
      
      let status = "pending";
      if (amountPaid >= targetRepayment) {
        status = "realized";
      } else if (amountPaid > 0) {
        status = "partial";
      }

      const matchesStatus = statusFilter === "all" || status === statusFilter;
      if (!matchesSearch || !matchesStatus) return false;

      const disbDateStr = getLocalDateStr(l.startDate || l.createdAt);
      const isDisbInTimeframe = isDateInTimeframe(disbDateStr);
      const hasRepaymentInTimeframe = l.repayments && l.repayments.some((r: any) => isDateInTimeframe(getLocalDateStr(r.receivedAt)));

      return isDisbInTimeframe || hasRepaymentInTimeframe;
    });
  }, [leads, searchQuery, statusFilter, tableTimeframe, tableFromDate, tableToDate]);

  const formatCurrency = (val: number) => {
    return `₹${val.toLocaleString("en-IN")}`;
  };

  const exportRevenueCsv = () => {
    const csvContent =
      "data:text/csv;charset=utf-8," +
      ["Metric Category,Today (INR),This Month (INR),All-Time (INR)",
       `ROI Revenue,${metrics.todayRoi},${metrics.monthRoi},${metrics.totalRoi}`,
       `PF Revenue,${metrics.todayPf},${metrics.monthPf},${metrics.totalPf}`,
       `GST Collected (18%),${metrics.todayGst},${metrics.monthGst},${metrics.totalGst}`,
       `Total Revenue,${metrics.todayTotal},${metrics.monthTotal},${metrics.grandTotal}`
      ].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Revenue_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportLedgerCsv = () => {
    const todayStr = getLocalDateStr(new Date().toISOString());
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = getLocalDateStr(yesterday.toISOString());
    const currentMonthStr = new Date().toISOString().slice(0, 7);

    const isDateInTimeframe = (dateStr: string) => {
      if (!dateStr) return false;
      if (tableTimeframe === "today") return dateStr === todayStr;
      if (tableTimeframe === "yesterday") return dateStr === yesterdayStr;
      if (tableTimeframe === "month") return dateStr.slice(0, 7) === currentMonthStr;
      if (tableTimeframe === "all") return true;
      if (tableTimeframe === "custom") {
        const start = tableFromDate ? tableFromDate : "1970-01-01";
        const end = tableToDate ? tableToDate : "9999-12-31";
        return dateStr >= start && dateStr <= end;
      }
      return false;
    };

    const headers = ["Borrower Name", "Agreement ID", "Principal Disbursed", "ROI Revenue (Interest)", "PF Revenue (Fee)", "Total Income", "Status"];
    const rows = filteredLeads.map((l, idx) => {
      const itemPrincipal = Number(l.principal || 0);
      const pf = Number(l.processingFee || 0);
      
      const disbDateStr = getLocalDateStr(l.startDate || l.createdAt);
      const isDisbInTimeframe = isDateInTimeframe(disbDateStr);

      const principalVal = isDisbInTimeframe ? itemPrincipal : 0;
      const pfVal = isDisbInTimeframe ? pf : 0;

      let roiVal = 0;
      let cumulativePaid = 0;
      l.repayments?.forEach((r: any) => {
        const amount = Number(r.amount || 0);
        const prevCumulative = cumulativePaid;
        cumulativePaid += amount;
        
        const prevRoiRealized = Math.max(0, prevCumulative - itemPrincipal);
        const currentRoiRealized = Math.max(0, cumulativePaid - itemPrincipal);
        const roiRealizedThisPayment = currentRoiRealized - prevRoiRealized;
        
        const repDateStr = getLocalDateStr(r.receivedAt);
        if (isDateInTimeframe(repDateStr) && roiRealizedThisPayment > 0) {
          roiVal += roiRealizedThisPayment;
        }
      });

      const actualIncome = roiVal + pfVal;
      let statusText = l.amountPaid >= (l.repaymentAmount || itemPrincipal * 1.12) ? "REALIZED" : l.amountPaid > 0 ? "PARTIAL" : "PENDING";

      return [
        l.customer || l.name,
        l.agreementNumber || l.id || `DISB-${8090 - idx}`,
        principalVal,
        roiVal,
        pfVal,
        actualIncome,
        statusText
      ];
    });

    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" +
      [headers.join(","), ...rows.map(e => e.map(val => `"${val}"`).join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Revenue_Transactions_${tableTimeframe}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const printLedger = () => {
    document.body.classList.add("printing-ledger-only");
    window.print();
    setTimeout(() => {
      document.body.classList.remove("printing-ledger-only");
    }, 500);
  };

  const selectedTitle = timeframe === "today" ? "Today's" : timeframe === "month" ? "This Month's" : "All-Time";
  const selectedTotal = timeframe === "today" ? (metrics.todayRoi + metrics.todayPf) : timeframe === "month" ? (metrics.monthRoi + metrics.monthPf) : (metrics.totalRoi + metrics.totalPf);
  const selectedPf = timeframe === "today" ? metrics.todayPf : timeframe === "month" ? metrics.monthPf : metrics.totalPf;
  const selectedRoi = timeframe === "today" ? metrics.todayRoi : timeframe === "month" ? metrics.monthRoi : metrics.totalRoi;
  
  const selectedSubtitle = timeframe === "today"
    ? "Real-time monitoring of Processing Fees (PF) booked today, and Repayment Interest (ROI) realized today."
    : timeframe === "month"
    ? "Real-time monitoring of Processing Fees (PF) booked this month, and Repayment Interest (ROI) realized this month."
    : "Real-time monitoring of lifetime cumulative revenue split into Processing Fees (PF) booked at origination, and Repayment Interest (ROI) realized on collections.";

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-[1600px] mx-auto min-h-screen">
      
      {/* PAGE HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
              <IndianRupee className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                Revenue Analytics & Earnings Hub
                <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Live Audit
                </span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
                Real-time breakdown of ROI Interest, Processing Fees (PF), GST Tax Collections, and Grand Total Revenue
              </p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center p-1 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setTimeframe("today")}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                timeframe === "today"
                  ? "bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setTimeframe("month")}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                timeframe === "month"
                  ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              This Month
            </button>
            <button
              onClick={() => setTimeframe("all")}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                timeframe === "all"
                  ? "bg-white dark:bg-slate-800 text-violet-600 dark:text-violet-400 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              All Time
            </button>
          </div>

          <button
            onClick={exportRevenueCsv}
            className="flex items-center gap-2 px-4 h-10 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-extrabold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 shadow-sm transition"
          >
            <Download className="w-4 h-4 text-emerald-500" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* TIME-BOUND EXECUTIVE DASHBOARD REVENUE CARDS (3-COLUMN GRID) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* CARD 1: TOTAL REVENUE */}
        <div className="relative overflow-hidden bg-gradient-to-br from-indigo-50/60 via-purple-50/20 to-white dark:from-indigo-950/10 dark:via-purple-950/5 dark:to-slate-900 border border-indigo-100/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm shadow-indigo-100/50 hover:shadow-indigo-500/10 hover:shadow-md hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between min-h-[160px] group">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
          {/* Glowing Radial Background Mesh Effect */}
          <div className="absolute -right-10 -top-10 w-32 h-32 bg-gradient-to-br from-indigo-500/8 to-pink-500/8 rounded-full blur-2xl group-hover:scale-125 transition-transform duration-500 pointer-events-none" />
          
          <div className="relative z-10 flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {selectedTitle} Total Revenue
              </span>
              <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight mt-1">
                {formatCurrency(selectedTotal)}
              </h2>
            </div>
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/25 transition-transform duration-300 group-hover:scale-110">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="relative z-10 text-[10px] font-semibold text-slate-500 dark:text-slate-400 mt-4 leading-relaxed">
            {selectedSubtitle}
          </div>
        </div>

        {/* CARD 2: PROCESSING FEE REVENUE */}
        <div className="relative overflow-hidden bg-gradient-to-br from-cyan-50/60 via-blue-50/20 to-white dark:from-cyan-950/10 dark:via-blue-950/5 dark:to-slate-900 border border-cyan-100/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm shadow-cyan-100/50 hover:shadow-cyan-500/10 hover:shadow-md hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between min-h-[160px] group">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500" />
          {/* Glowing Radial Background Mesh Effect */}
          <div className="absolute -right-10 -top-10 w-32 h-32 bg-gradient-to-br from-cyan-500/8 to-blue-500/8 rounded-full blur-2xl group-hover:scale-125 transition-transform duration-500 pointer-events-none" />
          
          <div className="relative z-10 flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {selectedTitle} Processing Fee Revenue (PF)
              </span>
              <h2 className="text-3xl font-black text-cyan-600 dark:text-cyan-400 tracking-tight mt-1">
                {formatCurrency(selectedPf)}
              </h2>
            </div>
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/25 transition-transform duration-300 group-hover:scale-110">
              <Receipt className="w-5 h-5" />
            </div>
          </div>
          <div className="relative z-10 text-[10px] font-semibold text-slate-500 dark:text-slate-400 mt-4 leading-relaxed">
            Realized processing fee collections booked on loan disbursements during this timeframe.
          </div>
        </div>

        {/* CARD 3: REPAYMENT ROI INTEREST */}
        <div className="relative overflow-hidden bg-gradient-to-br from-emerald-50/60 via-teal-50/20 to-white dark:from-emerald-950/10 dark:via-teal-950/5 dark:to-slate-900 border border-emerald-100/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm shadow-emerald-100/50 hover:shadow-emerald-500/10 hover:shadow-md hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between min-h-[160px] group">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-green-500" />
          {/* Glowing Radial Background Mesh Effect */}
          <div className="absolute -right-10 -top-10 w-32 h-32 bg-gradient-to-br from-emerald-500/8 to-teal-500/8 rounded-full blur-2xl group-hover:scale-125 transition-transform duration-500 pointer-events-none" />
          
          <div className="relative z-10 flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {selectedTitle} Revenue by ROI
              </span>
              <h2 className="text-3xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight mt-1">
                {formatCurrency(selectedRoi)}
              </h2>
            </div>
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/25 transition-transform duration-300 group-hover:scale-110">
              <Percent className="w-5 h-5" />
            </div>
          </div>
          <div className="relative z-10 text-[10px] font-semibold text-slate-500 dark:text-slate-400 mt-4 leading-relaxed">
            Realized interest collections from loan payments received during this timeframe.
          </div>
        </div>

      </div>      {/* REQUESTED REVENUE METRICS MATRIX */}
      <div className="space-y-4">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-500" />
          Complete Revenue Analytics Matrix
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                   {/* SECTION 1: TODAY'S REVENUE BREAKDOWN */}
          <div className="space-y-4 p-5 rounded-3xl bg-gradient-to-br from-emerald-50/40 via-teal-50/20 to-white dark:from-emerald-950/5 dark:via-teal-950/3 dark:to-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-emerald-500/10 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
            <div className="absolute -right-6 -top-6 w-24 h-24 bg-gradient-to-br from-emerald-500/6 to-teal-500/6 rounded-full blur-xl group-hover:scale-125 transition-transform duration-500 pointer-events-none" />
            <div className="flex items-center justify-between">
              <h4 className="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-500" />
                Today's Revenue Metrics
              </h4>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                Daily Ledger
              </span>
            </div>

            <div className="space-y-3 pt-2">
              <div className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Revenue by Processing Fees (PF)</p>
                <p className="text-base font-black text-slate-900 dark:text-white mt-0.5">{formatCurrency(metrics.todayPf)}</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Revenue by ROI</p>
                  <p className="text-base font-black text-slate-900 dark:text-white mt-0.5">{formatCurrency(metrics.todayRoi)}</p>
                </div>
                <span className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black text-xs">
                  ROI
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/30 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Today's Total Revenue</p>
                  <p className="text-lg font-black text-emerald-650 dark:text-emerald-400 mt-0.5">
                    {formatCurrency(metrics.todayRoi + metrics.todayPf)}
                  </p>
                </div>
                <ArrowUpRight className="w-5 h-5 text-emerald-500" />
              </div>
            </div>
          </div>

          {/* SECTION 2: THIS MONTH'S REVENUE BREAKDOWN */}
          <div className="space-y-4 p-5 rounded-3xl bg-gradient-to-br from-indigo-50/40 via-purple-50/20 to-white dark:from-indigo-950/5 dark:via-purple-950/3 dark:to-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-indigo-500/10 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-indigo-500 to-purple-500" />
            <div className="absolute -right-6 -top-6 w-24 h-24 bg-gradient-to-br from-indigo-500/6 to-purple-500/6 rounded-full blur-xl group-hover:scale-125 transition-transform duration-500 pointer-events-none" />
            <div className="flex items-center justify-between">
              <h4 className="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-500" />
                This Month Revenue Metrics
              </h4>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                Monthly Target
              </span>
            </div>

            <div className="space-y-3 pt-2">
              <div className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Revenue by Processing Fees (PF)</p>
                <p className="text-base font-black text-slate-900 dark:text-white mt-0.5">{formatCurrency(metrics.monthPf)}</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Revenue by ROI</p>
                  <p className="text-base font-black text-slate-900 dark:text-white mt-0.5">{formatCurrency(metrics.monthRoi)}</p>
                </div>
                <span className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black text-xs">
                  ROI
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/30 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-400">This Month Total Revenue</p>
                  <p className="text-lg font-black text-indigo-650 dark:text-indigo-400 mt-0.5">
                    {formatCurrency(metrics.monthRoi + metrics.monthPf)}
                  </p>
                </div>
                <ArrowUpRight className="w-5 h-5 text-indigo-500" />
              </div>
            </div>
          </div>

          {/* SECTION 3: ALL-TIME & GRAND TOTAL REVENUE BREAKDOWN */}
          <div className="space-y-4 p-5 rounded-3xl bg-gradient-to-br from-violet-50/40 via-indigo-50/20 to-white dark:from-violet-950/5 dark:via-indigo-950/3 dark:to-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-violet-500/10 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden group">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-violet-600 to-indigo-600" />
            <div className="absolute -right-6 -top-6 w-24 h-24 bg-gradient-to-br from-violet-500/6 to-indigo-500/6 rounded-full blur-xl group-hover:scale-125 transition-transform duration-500 pointer-events-none" />
            <div className="flex items-center justify-between">
              <h4 className="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <Building2 className="w-4 h-4 text-violet-600" />
                Lifetime & Grand Totals
              </h4>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20">
                All-Time Enterprise
              </span>
            </div>

            <div className="space-y-3 pt-2">
              <div className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Revenue by Processing Fees (PF)</p>
                <p className="text-base font-black text-slate-900 dark:text-white mt-0.5">{formatCurrency(metrics.totalPf)}</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-950/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Revenue by ROI</p>
                  <p className="text-base font-black text-slate-900 dark:text-white mt-0.5">{formatCurrency(metrics.totalRoi)}</p>
                </div>
                <span className="w-9 h-9 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center font-black text-xs">
                  ROI
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-violet-600/15 via-indigo-600/15 to-transparent border border-violet-500/40 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-violet-700 dark:text-violet-300">Grand Total Revenue</p>
                  <p className="text-xl font-black text-violet-650 dark:text-violet-400 mt-0.5">
                    {formatCurrency(metrics.totalRoi + metrics.totalPf)}
                  </p>
                </div>
                <Sparkles className="w-6 h-6 text-violet-500" />
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* REVENUE TRANSACTION LEDGER TABLE */}
      <div id="printable-ledger-area" className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-indigo-500" />
              Live Revenue Transactions Ledger
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
              Individual loan disbursement income entries with exact ROI and Processing Fee audit
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 lg:justify-end">
            {/* Timeframe Selection Tabs inside the ledger table */}
            <div className="flex items-center p-1 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <button
                onClick={() => { setTableTimeframe("today"); setCurrentPage(1); }}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                  tableTimeframe === "today"
                    ? "bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                Today
              </button>
              <button
                onClick={() => { setTableTimeframe("yesterday"); setCurrentPage(1); }}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                  tableTimeframe === "yesterday"
                    ? "bg-white dark:bg-slate-800 text-amber-600 dark:text-amber-400 shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                Yesterday
              </button>
              <button
                onClick={() => { setTableTimeframe("month"); setCurrentPage(1); }}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                  tableTimeframe === "month"
                    ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                Month
              </button>
              <button
                onClick={() => { setTableTimeframe("all"); setCurrentPage(1); }}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                  tableTimeframe === "all"
                    ? "bg-white dark:bg-slate-800 text-violet-600 dark:text-violet-400 shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                All
              </button>
              <button
                onClick={() => { setTableTimeframe("custom"); setCurrentPage(1); }}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                  tableTimeframe === "custom"
                    ? "bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                Custom
              </button>
            </div>

            {tableTimeframe === "custom" && (
              <div className="flex items-center gap-2 p-1 rounded-2xl bg-slate-100 dark:bg-slate-950/30 border border-slate-200 dark:border-slate-800 animate-fadeIn">
                <input
                  type="date"
                  value={tableFromDate}
                  onChange={(e) => { setTableFromDate(e.target.value); setCurrentPage(1); }}
                  className="bg-transparent text-xs font-bold text-slate-700 dark:text-slate-200 outline-none px-2 py-1"
                />
                <span className="text-[10px] font-black text-slate-400">TO</span>
                <input
                  type="date"
                  value={tableToDate}
                  onChange={(e) => { setTableToDate(e.target.value); setCurrentPage(1); }}
                  className="bg-transparent text-xs font-bold text-slate-700 dark:text-slate-200 outline-none px-2 py-1"
                />
              </div>
            )}

            <select
              value={statusFilter}
              onChange={(e: any) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 text-xs font-semibold outline-none focus:border-indigo-500 text-slate-700 dark:text-slate-200"
            >
              <option value="all">All Statuses</option>
              <option value="realized">Realized</option>
              <option value="partial">Partial</option>
              <option value="pending">Pending</option>
            </select>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search borrower..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-10 pl-9 pr-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 text-xs font-semibold outline-none focus:border-indigo-500 text-slate-800 dark:text-slate-200 w-44"
              />
            </div>

            <button
              onClick={exportLedgerCsv}
              title="Export Ledger CSV"
              className="h-10 w-10 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/60 shadow-sm transition shrink-0"
            >
              <Download className="w-4 h-4 text-emerald-500" />
            </button>

            <button
              onClick={printLedger}
              title="Print Ledger"
              className="h-10 w-10 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/60 shadow-sm transition shrink-0"
            >
              <Printer className="w-4 h-4 text-indigo-500" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] font-black uppercase text-slate-400 tracking-wider bg-slate-50/50 dark:bg-slate-950/30">
                <th className="py-3 px-4">Disbursal ID & Borrower</th>
                <th className="py-3 px-4">Principal Disbursed</th>
                <th className="py-3 px-4">ROI Revenue (Interest)</th>
                <th className="py-3 px-4">PF Revenue (Fee)</th>
                <th className="py-3 px-4">Total Income</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-semibold text-slate-700 dark:text-slate-300">  {(() => {
    const todayStr = getLocalDateStr(new Date().toISOString());
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = getLocalDateStr(yesterday.toISOString());
    const currentMonthStr = new Date().toISOString().slice(0, 7);

    const isDateInTimeframe = (dateStr: string) => {
      if (!dateStr) return false;
      if (tableTimeframe === "today") return dateStr === todayStr;
      if (tableTimeframe === "yesterday") return dateStr === yesterdayStr;
      if (tableTimeframe === "month") return dateStr.slice(0, 7) === currentMonthStr;
      if (tableTimeframe === "all") return true;
      if (tableTimeframe === "custom") {
        const start = tableFromDate ? tableFromDate : "1970-01-01";
        const end = tableToDate ? tableToDate : "9999-12-31";
        return dateStr >= start && dateStr <= end;
      }
      return false;
    };

    const totalItems = filteredLeads.length;
    const displayed = filteredLeads.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    if (displayed.length === 0) {
      return (
        <tr>
          <td colSpan={6} className="py-4 px-6 text-center text-slate-400 font-medium">
            No transactions found for the selected filter & timeframe.
          </td>
        </tr>
      );
    }
    return displayed.map((item, idx) => {
      const itemPrincipal = Number(item.principal || 0);
      const pf = Number(item.processingFee || 0);
      
      const disbDateStr = getLocalDateStr(item.startDate || item.createdAt);
      const isDisbInTimeframe = isDateInTimeframe(disbDateStr);

      const principalVal = itemPrincipal;
      const pfVal = pf;

      let roiVal = 0;
      let cumulativePaid = 0;
      item.repayments?.forEach((r: any) => {
        const amount = Number(r.amount || 0);
        const prevCumulative = cumulativePaid;
        cumulativePaid += amount;
        
        const prevRoiRealized = Math.max(0, prevCumulative - itemPrincipal);
        const currentRoiRealized = Math.max(0, cumulativePaid - itemPrincipal);
        const roiRealizedThisPayment = currentRoiRealized - prevRoiRealized;
        
        const repDateStr = getLocalDateStr(r.receivedAt);
        if ((tableTimeframe === "all" || isDateInTimeframe(repDateStr)) && roiRealizedThisPayment > 0) {
          roiVal += roiRealizedThisPayment;
        }
      });

      const overallAmountPaid = Number(item.amountPaid || 0);
      const overallTargetRepayment = Number(item.repaymentAmount || itemPrincipal * 1.12);

      // Fallback for realized ROI if repayments array was empty or unlinked
      if (roiVal === 0 && overallAmountPaid > itemPrincipal) {
        roiVal = overallAmountPaid - itemPrincipal;
      }

      const actualIncome = roiVal + pfVal;

      const itemStatusLower = String(item.status || "").toLowerCase();
      const isRealized = itemStatusLower === "paid off" || 
                         itemStatusLower === "closed" || 
                         itemStatusLower === "paid" || 
                         Number(item.balance || 0) <= 0 || 
                         overallAmountPaid >= (overallTargetRepayment - 100);

      return (
        <tr key={idx} className="odd:bg-white even:bg-slate-50/30 hover:bg-indigo-50/30 dark:odd:bg-slate-950/10 dark:even:bg-slate-900/20 dark:hover:bg-indigo-950/10 transition-colors border-b border-slate-100 dark:border-slate-800/50">
          <td className="py-4 px-6">
            <div className="font-extrabold text-slate-900 dark:text-white text-sm">{item.customer || item.name}</div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">{item.agreementNumber || item.id || `DISB-${8090 - idx}`}</div>
          </td>
          <td className="py-4 px-6 font-extrabold text-slate-900 dark:text-slate-100">{formatCurrency(principalVal)}</td>
          <td className="py-4 px-6 text-emerald-600 dark:text-emerald-400 font-extrabold">{formatCurrency(roiVal)}</td>
          <td className="py-4 px-6 text-cyan-600 dark:text-cyan-400 font-extrabold">{formatCurrency(pfVal)}</td>
          <td className="py-4 px-6">
            <span className="inline-block font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/20 px-3 py-1.5 rounded-xl border border-indigo-100/50 dark:border-indigo-800/20 shadow-sm">
              {formatCurrency(actualIncome)}
            </span>
          </td>
          <td className="py-4 px-6">
            {isRealized ? (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/30">
                <CheckCircle2 className="w-3 h-3" /> Realized
              </span>
            ) : overallAmountPaid > 0 ? (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold uppercase bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400 border border-amber-200/50 dark:border-amber-800/30">
                <AlertCircle className="w-3 h-3" /> Partial
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold uppercase bg-slate-50 text-slate-600 dark:bg-slate-950/20 dark:text-slate-400 border border-slate-200 dark:border-slate-800/30">
                Pending
              </span>
            )}
          </td>
        </tr>
      );
    });
  })()}
</tbody>
          </table>
        </div>

        {(() => {
          const totalItems = filteredLeads.length;
          const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
          return (
            <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-4 text-xs font-semibold text-slate-500">
              <div>
                Showing <span className="text-slate-900 dark:text-white">{totalItems > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}</span> to{" "}
                <span className="text-slate-900 dark:text-white">{Math.min(totalItems, currentPage * itemsPerPage)}</span> of{" "}
                <span className="text-slate-900 dark:text-white">{totalItems}</span> transactions
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition"
                >
                  Previous
                </button>
                <span className="text-slate-900 dark:text-white">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition"
                >
                  Next
                </button>
              </div>
            </div>
          );
        })()}
      </div>
      {/* Stylesheet to isolate table during printing */}
      <style>{`
        @media print {
          body.printing-ledger-only * {
            visibility: hidden !important;
          }
          body.printing-ledger-only #printable-ledger-area,
          body.printing-ledger-only #printable-ledger-area * {
            visibility: visible !important;
          }
          body.printing-ledger-only #printable-ledger-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          /* Hide print buttons and search controls when printing */
          body.printing-ledger-only #printable-ledger-area button,
          body.printing-ledger-only #printable-ledger-area select,
          body.printing-ledger-only #printable-ledger-area input,
          body.printing-ledger-only #printable-ledger-area .flex.items-center.gap-3 {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
