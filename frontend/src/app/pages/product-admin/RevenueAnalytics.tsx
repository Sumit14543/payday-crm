import { PartialDataNotice } from "../../components/PartialDataNotice";
import { useState, useEffect, useMemo } from "react";
import { apiGetAll } from "../../lib/api";
import { createRevenueLedger, getRevenueDate, revenueLedgerCsv } from "../../lib/revenueLedger";
import { MetricCard } from "../../components/crm/DashboardPrimitives";

import { IndianRupee, Download, Search, Filter, CheckCircle2, AlertCircle, FileSpreadsheet, Printer } from "lucide-react";

const getTodayStr = () => getRevenueDate(new Date());

export function RevenueAnalytics() {
  const [tableTimeframe, setTableTimeframe] = useState<"today" | "yesterday" | "month" | "all" | "custom">("all");
  const [tableFromDate, setTableFromDate] = useState<string>("");
  const [tableToDate, setTableToDate] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [statusFilter, setStatusFilter] = useState<"all" | "realized" | "partial" | "pending">("all");

  useEffect(() => {
    const controller = new AbortController();
    apiGetAll<any[]>("/loans", controller.signal)
      .then(loans => {
        if (!controller.signal.aborted) {
          setLeads(loans);
          setLoading(false);
        }
      })
      .catch(error => {
        if (!controller.signal.aborted) {
          setLoadError(error instanceof Error ? error.message : "Unable to load revenue data.");
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, []);

  const ledger = useMemo(() => createRevenueLedger(leads, {
    timeframe: tableTimeframe, from: tableFromDate, to: tableToDate,
    search: searchQuery, status: statusFilter,
  }), [leads, searchQuery, statusFilter, tableTimeframe, tableFromDate, tableToDate]);
  const totalItems = ledger.rows.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const displayedRows = ledger.rows.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage);

  const formatCurrency = (val: number) => {
    return `₹${val.toLocaleString("en-IN")}`;
  };

  const exportLedgerCsv = () => {
    const csvContent = "data:text/csv;charset=utf-8," + String.fromCharCode(0xFEFF) + revenueLedgerCsv(ledger.rows);
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", "Revenue_Transactions_" + tableTimeframe + "_" + getTodayStr() + ".csv");
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

  const activeDateLabel = tableTimeframe === "custom"
    ? "Custom: " + (tableFromDate || "Start") + " to " + (tableToDate || "End")
    : { today: "Today", yesterday: "Yesterday", month: "This month", all: "All time" }[tableTimeframe];
  const activeFilterLabel = activeDateLabel
    + (statusFilter === "all" ? "" : " / " + statusFilter)
    + (searchQuery.trim() ? " / Search: " + searchQuery.trim() : "");

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
                  Filtered view
                </span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
                Revenue totals, transactions and exports for the selected filters
              </p>
            </div>
          </div>
        </div>

        <div aria-label="Active revenue filter" className="inline-flex max-w-full items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-xs font-semibold text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-300">
          <Filter className="h-4 w-4 shrink-0" />
          <span>Active filter: {activeFilterLabel}</span>
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
                  aria-label="Revenue from date"
                  value={tableFromDate}
                  onChange={(e) => { setTableFromDate(e.target.value); setCurrentPage(1); }}
                  className="bg-transparent text-xs font-bold text-slate-700 dark:text-slate-200 outline-none px-2 py-1"
                />
                <span className="text-[10px] font-black text-slate-400">TO</span>
                <input
                  type="date"
                  aria-label="Revenue to date"
                  value={tableToDate}
                  onChange={(e) => { setTableToDate(e.target.value); setCurrentPage(1); }}
                  className="bg-transparent text-xs font-bold text-slate-700 dark:text-slate-200 outline-none px-2 py-1"
                />
              </div>
            )}

            <select
              aria-label="Filter revenue status"
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
              disabled={loading || Boolean(loadError) || ledger.invalidRange}
              title="Export Ledger CSV"
              className="h-10 w-10 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/60 shadow-sm transition shrink-0"
            >
              <Download className="w-4 h-4 text-emerald-500" />
            </button>

            <button
              onClick={printLedger}
              disabled={loading || Boolean(loadError) || ledger.invalidRange}
              title="Print Ledger"
              className="h-10 w-10 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/60 shadow-sm transition shrink-0"
            >
              <Printer className="w-4 h-4 text-indigo-500" />
            </button>
          </div>
        </div>

        {loadError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{loadError}</p>}
        {ledger.invalidRange && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">From date must be on or before To date.</p>}
        <PartialDataNotice rows={leads} />
        <div aria-label="Filtered revenue totals" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { title: "Filtered transactions", metric: String(ledger.totals.count), note: ledger.totals.realized + " realized / " + ledger.totals.partial + " partial / " + ledger.totals.pending + " pending", accent: "info" as const },
            { title: "Principal disbursed", metric: formatCurrency(ledger.totals.principal), note: "Disbursements in selected dates", accent: "teal" as const },
            { title: "ROI revenue", metric: formatCurrency(ledger.totals.roi), note: "Interest received in selected dates", accent: "success" as const },
            { title: "PF revenue", metric: formatCurrency(ledger.totals.fees), note: "Fees booked in selected dates", accent: "info" as const },
            { title: "Total income", metric: formatCurrency(ledger.totals.totalIncome), note: "Filtered ROI + PF revenue", accent: "purple" as const },
          ].map(card => <MetricCard key={card.title} title={card.title} metric={loadError ? "Unavailable" : loading ? "…" : card.metric} note={card.note} accent={card.accent} />)}
        </div>
        <p className="text-xs text-slate-500">Totals cover all matching rows across every page. PF is dated by disbursement; ROI is dated by repayment.</p>
        {ledger.undatedRoi > 0 && !ledger.invalidRange && <p role="status" className="text-xs text-amber-700 dark:text-amber-400">Some lifetime interest has no repayment history and cannot be assigned to the selected dates. It is included only in All.</p>}

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
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-semibold text-slate-700 dark:text-slate-300">
              {displayedRows.length === 0 ? (
                <tr><td colSpan={6} className="py-4 px-6 text-center text-slate-400 font-medium">{loading ? "Loading revenue transactions..." : "No transactions found for the selected filter & timeframe."}</td></tr>
              ) : displayedRows.map(item => (
                <tr key={item.id} className="odd:bg-white even:bg-slate-50/30 hover:bg-indigo-50/30 dark:odd:bg-slate-950/10 dark:even:bg-slate-900/20 dark:hover:bg-indigo-950/10 transition-colors border-b border-slate-100 dark:border-slate-800/50">
                  <td className="py-4 px-6">
                    <div className="font-extrabold text-slate-900 dark:text-white text-sm">{item.customer}</div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">{item.agreementId}</div>
                  </td>
                  <td className="py-4 px-6 font-extrabold text-slate-900 dark:text-slate-100">{formatCurrency(item.principal)}</td>
                  <td className="py-4 px-6 text-emerald-600 dark:text-emerald-400 font-extrabold">{formatCurrency(item.roi)}</td>
                  <td className="py-4 px-6 text-cyan-600 dark:text-cyan-400 font-extrabold">{formatCurrency(item.fees)}</td>
                  <td className="py-4 px-6"><span className="inline-block font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/20 px-3 py-1.5 rounded-xl border border-indigo-100/50 dark:border-indigo-800/20 shadow-sm">{formatCurrency(item.totalIncome)}</span></td>
                  <td className="py-4 px-6">
                    {item.status === "realized" ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/30"><CheckCircle2 className="w-3 h-3" /> Realized</span>
                    ) : item.status === "partial" ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold uppercase bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400 border border-amber-200/50 dark:border-amber-800/30"><AlertCircle className="w-3 h-3" /> Partial</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold uppercase bg-slate-50 text-slate-600 dark:bg-slate-950/20 dark:text-slate-400 border border-slate-200 dark:border-slate-800/30">Pending</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-4 text-xs font-semibold text-slate-500">
          <div>Showing <span className="text-slate-900 dark:text-white">{totalItems > 0 ? (safePage - 1) * itemsPerPage + 1 : 0}</span> to <span className="text-slate-900 dark:text-white">{Math.min(totalItems, safePage * itemsPerPage)}</span> of <span className="text-slate-900 dark:text-white">{totalItems}</span> transactions</div>
          <div className="flex items-center gap-2">
            <button onClick={() => setCurrentPage(Math.max(1, safePage - 1))} disabled={safePage <= 1} className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition">Previous</button>
            <span className="text-slate-900 dark:text-white">Page {safePage} of {totalPages}</span>
            <button onClick={() => setCurrentPage(Math.min(totalPages, safePage + 1))} disabled={safePage >= totalPages} className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition">Next</button>
          </div>
        </div>
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
