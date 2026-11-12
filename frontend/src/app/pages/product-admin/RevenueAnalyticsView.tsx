import { Download, Search, Filter, Printer, ChevronLeft, ChevronRight, X, Info, ChartNoAxesCombined, ArrowLeftRight, Wallet, TrendingUp, ReceiptText, IndianRupee } from "lucide-react";
import { PartialDataNotice } from "../../components/PartialDataNotice";
import type { createRevenueLedger, RevenueFilters, RevenueLedgerRow, RevenueLoan } from "../../lib/revenueLedger";
import "./RevenueAnalytics.css";

type Props = {
  ledger: ReturnType<typeof createRevenueLedger>;
  leads: RevenueLoan[];
  loading: boolean;
  loadError: string;
  timeframe: RevenueFilters["timeframe"];
  fromDate: string;
  toDate: string;
  search: string;
  status: NonNullable<RevenueFilters["status"]>;
  activeFilterLabel: string;
  page: number;
  totalPages: number;
  itemsPerPage: number;
  displayedRows: RevenueLedgerRow[];
  onTimeframeChange: (value: RevenueFilters["timeframe"]) => void;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: NonNullable<RevenueFilters["status"]>) => void;
  onClearFilters: () => void;
  onExport: () => void;
  onPrint: () => void;
  onPrevious: () => void;
  onNext: () => void;
};

const timeframes = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "month", label: "Month" },
  { value: "all", label: "All" },
  { value: "custom", label: "Custom" },
] as const;
const formatCurrency = (value: number) => `₹${value.toLocaleString("en-IN")}`;

export function RevenueAnalyticsView(props: Props) {
  const { ledger, loading, loadError, timeframe, status, search, page, totalPages } = props;
  const totalItems = ledger.rows.length;
  const hasFilters = timeframe !== "all" || status !== "all" || Boolean(search.trim());
  const actionsDisabled = loading || Boolean(loadError) || ledger.invalidRange;
  const cards = [
    { title: "Filtered transactions", metric: String(ledger.totals.count), note: `${ledger.totals.realized} realized · ${ledger.totals.partial} partial · ${ledger.totals.pending} pending`, tone: "blue", icon: ArrowLeftRight },
    { title: "Principal disbursed", metric: formatCurrency(ledger.totals.principal), note: "Disbursed in selected period", tone: "teal", icon: Wallet },
    { title: "ROI revenue", metric: formatCurrency(ledger.totals.roi), note: "Interest received", tone: "green", icon: TrendingUp },
    { title: "PF revenue", metric: formatCurrency(ledger.totals.fees), note: "Processing fees booked", tone: "amber", icon: ReceiptText },
    { title: "Total income", metric: formatCurrency(ledger.totals.totalIncome), note: "Interest + processing fees", tone: "violet", icon: IndianRupee },
  ];

  return (
    <div id="printable-ledger-area" className="revenue-page" aria-busy={loading}>
      <header className="revenue-heading">
        <div className="revenue-heading__identity">
          <span className="revenue-heading__icon" aria-hidden="true"><ChartNoAxesCombined size={23} /></span>
          <div>
            <h1>Revenue <span>analytics</span></h1>
            <p>Track earnings, disbursements and loan transactions.</p>
          </div>
        </div>
        <div className="revenue-actions revenue-no-print">
          <button type="button" onClick={props.onPrint} disabled={actionsDisabled} title="Print Ledger" className="revenue-button">
            <Printer size={16} aria-hidden="true" /> Print
          </button>
          <button type="button" onClick={props.onExport} disabled={actionsDisabled} title="Export Ledger CSV" className="revenue-button revenue-button--primary">
            <Download size={16} aria-hidden="true" /> Export CSV
          </button>
        </div>
      </header>

      <section className="revenue-filters" aria-label="Revenue filters">
        <div className="revenue-filter-controls revenue-no-print">
          <div className="revenue-filter-row">
            <div className="revenue-period" role="group" aria-label="Revenue date period">
              {timeframes.map(period => (
                <button key={period.value} type="button" aria-pressed={timeframe === period.value} onClick={() => props.onTimeframeChange(period.value)}>
                  {period.label}
                </button>
              ))}
            </div>
            <div className="revenue-search-status">
              <div className="revenue-search">
                <Search size={16} aria-hidden="true" />
                <input type="search" aria-label="Search revenue transactions" placeholder="Search borrower..." value={search} onChange={e => props.onSearchChange(e.target.value)} />
              </div>
              <select aria-label="Filter revenue status" value={status} onChange={e => props.onStatusChange(e.target.value as Props["status"])}>
                <option value="all">All statuses</option>
                <option value="realized">Realized</option>
                <option value="partial">Partial</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          </div>
          {timeframe === "custom" && (
            <div className="revenue-date-range">
              <label>
                <span>From date</span>
                <input type="date" aria-label="Revenue from date" value={props.fromDate} aria-invalid={ledger.invalidRange || undefined} aria-describedby={ledger.invalidRange ? "revenue-date-error" : undefined} onChange={e => props.onFromChange(e.target.value)} />
              </label>
              <span className="revenue-date-range__separator" aria-hidden="true">—</span>
              <label>
                <span>To date</span>
                <input type="date" aria-label="Revenue to date" value={props.toDate} aria-invalid={ledger.invalidRange || undefined} aria-describedby={ledger.invalidRange ? "revenue-date-error" : undefined} onChange={e => props.onToChange(e.target.value)} />
              </label>
              <span className="revenue-date-hint">Includes both selected dates</span>
            </div>
          )}
        </div>
        <div className="revenue-filter-summary">
          <div aria-label="Active revenue filter" className="revenue-active-filter">
            <Filter size={14} aria-hidden="true" />
            <span><strong>Showing:</strong> {props.activeFilterLabel}</span>
          </div>
          <div className="revenue-filter-summary__end">
            <span>All amounts in INR</span>
            {hasFilters && <button type="button" className="revenue-clear revenue-no-print" onClick={props.onClearFilters}><X size={13} aria-hidden="true" /> Clear filters</button>}
          </div>
        </div>
      </section>

      {loadError && <p role="alert" className="revenue-notice revenue-notice--error">{loadError}</p>}
      {ledger.invalidRange && <p id="revenue-date-error" role="alert" className="revenue-notice revenue-notice--warning">From date must be on or before To date.</p>}
      <PartialDataNotice rows={props.leads} />

      <section aria-label="Filtered revenue totals" className="revenue-metrics">
        {cards.map(card => (
          <div key={card.title} role="group" aria-label={card.title} className={`revenue-metric revenue-metric--${card.tone}${card.tone === "violet" ? " revenue-metric--income" : ""}`}>
            <div className="revenue-metric__header">
              <p className="revenue-metric__label">{card.title}</p>
              <span className="revenue-metric__icon" aria-hidden="true"><card.icon size={17} strokeWidth={1.8} /></span>
            </div>
            <p className="revenue-metric__value">{loadError ? "Unavailable" : loading ? "…" : card.metric}</p>
            <p className="revenue-metric__note">{card.note}</p>
          </div>
        ))}
      </section>

      <section className="revenue-transactions" aria-labelledby="revenue-transactions-title">
        <div className="revenue-table-heading">
          <div className="revenue-table-title">
            <span className="revenue-table-title__icon" aria-hidden="true"><ArrowLeftRight size={16} /></span>
            <h2 id="revenue-transactions-title">Transactions</h2>
            <span className="revenue-count">{loading ? "…" : totalItems.toLocaleString("en-IN")}</span>
          </div>
          <p>All matching transactions across every page</p>
        </div>
        <div className="revenue-table-scroll" role="region" aria-label="Revenue transactions table" tabIndex={0}>
          <table className={`revenue-table${props.displayedRows.length === 0 ? " revenue-table--empty" : ""}`}>
            <thead>
              <tr>
                <th scope="col">Borrower / Loan ID</th>
                <th scope="col" className="revenue-number">Principal disbursed</th>
                <th scope="col" className="revenue-number revenue-roi">ROI <span>(interest)</span></th>
                <th scope="col" className="revenue-number revenue-fee">PF <span>(fee)</span></th>
                <th scope="col" className="revenue-number revenue-income">Total income</th>
                <th scope="col" className="revenue-status-column">Status</th>
              </tr>
            </thead>
            <tbody>
              {props.displayedRows.length === 0 ? (
                <tr><td colSpan={6} className="revenue-empty">
                  <Search size={24} aria-hidden="true" />
                  <p>{loading ? "Loading revenue transactions..." : loadError ? "Revenue data could not be loaded" : "No matching transactions"}</p>
                  {!loading && !loadError && <span>Try a different date range, status or borrower name.</span>}
                  {!loading && !loadError && hasFilters && <button type="button" className="revenue-button revenue-no-print" onClick={props.onClearFilters}>Clear filters</button>}
                </td></tr>
              ) : props.displayedRows.map(item => (
                <tr key={item.id}>
                  <td className="revenue-borrower"><div>{item.customer}</div><span>{item.agreementId}</span></td>
                  <td className="revenue-number">{formatCurrency(item.principal)}</td>
                  <td className={`revenue-number ${item.roi === 0 ? "revenue-zero" : "revenue-roi"}`}>{formatCurrency(item.roi)}</td>
                  <td className={`revenue-number ${item.fees === 0 ? "revenue-zero" : "revenue-fee"}`}>{formatCurrency(item.fees)}</td>
                  <td className="revenue-number revenue-income">{formatCurrency(item.totalIncome)}</td>
                  <td className="revenue-status-column">
                    <span className={`revenue-status revenue-status--${item.status}`}>
                      <span aria-hidden="true" />
                      {{ realized: "Realized", partial: "Partial", pending: "Pending" }[item.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="revenue-table-footer">
          <p>Showing <strong>{totalItems > 0 ? (page - 1) * props.itemsPerPage + 1 : 0}–{Math.min(totalItems, page * props.itemsPerPage)}</strong> of <strong>{totalItems.toLocaleString("en-IN")}</strong> transactions</p>
          <div className="revenue-pagination revenue-no-print">
            <span>Page <strong>{page}</strong> of <strong>{totalPages}</strong></span>
            <button type="button" aria-label="Previous page" onClick={props.onPrevious} disabled={page <= 1} className="revenue-button"><ChevronLeft size={15} aria-hidden="true" /> Previous</button>
            <button type="button" aria-label="Next page" onClick={props.onNext} disabled={page >= totalPages} className="revenue-button">Next <ChevronRight size={15} aria-hidden="true" /></button>
          </div>
        </footer>
      </section>

      <p className="revenue-footnote"><Info size={14} aria-hidden="true" /> Fees follow disbursement dates; interest follows repayment dates. Summary totals include every matching page.</p>
      {ledger.undatedRoi > 0 && !ledger.invalidRange && <p role="status" className="revenue-notice revenue-notice--warning">Some lifetime interest has no repayment history and cannot be assigned to the selected dates. It is included only in All.</p>}
    </div>
  );
}
