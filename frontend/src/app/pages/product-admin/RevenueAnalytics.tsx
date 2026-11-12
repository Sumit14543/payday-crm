import { useState, useEffect, useMemo } from "react";
import { apiGetAll } from "../../lib/api";
import { createRevenueLedger, getRevenueDate, revenueReportCsv } from "../../lib/revenueLedger";
import { RevenueAnalyticsView } from "./RevenueAnalyticsView";

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

  const exportLedgerCsv = () => {
    const csvContent = String.fromCharCode(0xFEFF) + revenueReportCsv(ledger, activeFilterLabel, getTodayStr());
    const link = document.createElement("a");
    link.setAttribute("href", "data:text/csv;charset=utf-8," + encodeURIComponent(csvContent));
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

  const clearFilters = () => {
    setTableTimeframe("all");
    setTableFromDate("");
    setTableToDate("");
    setSearchQuery("");
    setStatusFilter("all");
    setCurrentPage(1);
  };

  return <RevenueAnalyticsView
    ledger={ledger} leads={leads} loading={loading} loadError={loadError}
    timeframe={tableTimeframe} fromDate={tableFromDate} toDate={tableToDate}
    search={searchQuery} status={statusFilter} activeFilterLabel={activeFilterLabel}
    page={safePage} totalPages={totalPages} itemsPerPage={itemsPerPage} displayedRows={displayedRows}
    onTimeframeChange={value => { setTableTimeframe(value); setCurrentPage(1); }}
    onFromChange={value => { setTableFromDate(value); setCurrentPage(1); }}
    onToChange={value => { setTableToDate(value); setCurrentPage(1); }}
    onSearchChange={value => { setSearchQuery(value); setCurrentPage(1); }}
    onStatusChange={value => { setStatusFilter(value); setCurrentPage(1); }}
    onClearFilters={clearFilters} onExport={exportLedgerCsv} onPrint={printLedger}
    onPrevious={() => setCurrentPage(Math.max(1, safePage - 1))}
    onNext={() => setCurrentPage(Math.min(totalPages, safePage + 1))}
  />;
}
