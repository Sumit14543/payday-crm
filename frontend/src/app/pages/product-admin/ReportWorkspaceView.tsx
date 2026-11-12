import type { ReactNode } from "react";
import { Activity, AlertTriangle, ArrowLeft, Banknote, Briefcase, CheckCircle2, ChevronDown, Download, FileSpreadsheet, FileText, Filter, Phone, Printer, RefreshCw, Repeat, Search, ShieldAlert, Users, UserPlus, DollarSign, type LucideIcon } from "lucide-react";
import { NiceSelect } from "../../components/ui/nice-select";
import "./Reports.css";

export const reportPeriodOptions = [
  { label: "Today", value: "today" }, { label: "Yesterday", value: "yesterday" },
  { label: "This Month", value: "thismonth" }, { label: "Last Month", value: "lastmonth" },
  { label: "Last 30 Days", value: "last30days" }, { label: "Last 90 Days", value: "last90days" },
  { label: "Last 6 Months", value: "last6months" }, { label: "Year to Date", value: "yeartodate" },
  { label: "All Time", value: "alltime" },
  { label: "Last 3 Months", value: "last3months" }, { label: "Last Year", value: "lastyear" },
];
const icons: Record<string, LucideIcon> = { Activity, AlertTriangle, Banknote, Briefcase, CheckCircle2, FileText, Phone, RefreshCw, Repeat, ShieldAlert, Users, UserPlus, DollarSign };
const descriptions: Record<string, string> = {
  "payment-report": "Payment transactions, recovery amounts and customer due dates.",
  "lead-report": "Lead activity, ownership and application status.",
  "application-report": "Applications, requested amounts and credit handoffs.",
  "loan-report": "Loan accounts, disbursements and outstanding balances.",
  "reloan-report": "Repeat borrowers, reloan cycles and application history.",
  "disbursement-report": "Funded loans, disbursement amounts and repayment schedules.",
  "collection-report": "Collection accounts, outstanding balances and repayment status.",
  "due-report": "Upcoming customer dues and outstanding repayments.",
  "dpd-bucket-report": "Overdue accounts, days past due and collection priorities.",
  "interest-accrued-report": "Principal balances and accrued interest by loan account.",
  "outstanding-report": "Unpaid balances and overdue exposure across loan accounts.",
  "employee-performance": "Employee assignments, SLA performance and follow-up health.",
  "customer-report": "Customer interest, collections and pending balances.",
  "recovery-report": "Recoveries, outstanding debt and payment commitments.",
  "audit-log-report": "System activity, operator actions and audit history.",
  "cibil-report": "Borrower accounts and credit bureau reporting details.",
};

export function ReportMetricCard({ title, metric, note, accent = "blue", icon: Icon = FileText, trend }: {
  title: string; metric: ReactNode; note?: string; accent?: string; icon?: LucideIcon; trend?: string;
}) {
  return <div role="group" aria-label={title} className="reports-metric" data-tone={accent}>
    <div className="reports-metric__heading"><p>{title}</p><span aria-hidden="true"><Icon size={18} strokeWidth={1.8} /></span></div>
    <div className="reports-metric__value">{metric}</div>
    {note && <p className="reports-metric__note">{note}</p>}
    {trend && <span className="reports-metric__trend">{trend}</span>}
  </div>;
}

type Props = {
  title: string; reportType: string; isLoading: boolean; apiError: string;
  summaryCards: { label: string; value: string; note: string; color: string; icon: string }[];
  selectedPeriod: string; searchQuery: string; statusFilter: string; priorityFilter: string;
  isExportDropdownOpen: boolean;
  onPeriodChange: (value: string) => void; onSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void; onPriorityChange: (value: string) => void;
  onExportToggle: (value: boolean) => void; onBack: () => void;
  onExportCsv: () => void; onExportJson: () => void; onPrint: () => void;
  children: ReactNode;
};

export function ReportWorkspaceView(props: Props) {
  const { reportType, title, selectedPeriod, statusFilter, priorityFilter, searchQuery } = props;
  const showStatus = ["lead-report", "loan-report", "reloan-report", "collection-report", "outstanding-report", "recovery-report"].includes(reportType);
  const showPriority = ["lead-report", "application-report", "dpd-bucket-report"].includes(reportType);
  const disabled = props.isLoading || Boolean(props.apiError);
  return <div className="reports-workspace" aria-busy={props.isLoading}>
    <div className="reports-breadcrumb print:hidden"><button type="button" onClick={props.onBack}><ArrowLeft size={14} aria-hidden="true" /> All reports</button><span aria-hidden="true">/</span><span>{title}</span></div>
    <div className="reports-heading">
      <div className="reports-heading__identity"><span className="reports-heading__icon" aria-hidden="true"><FileSpreadsheet size={23} /></span><div><h1>{title}</h1><p>{descriptions[reportType] || "Explore report records for your selected period."}</p></div></div>
      <div className="reports-actions print:hidden">
        <button type="button" className="reports-button" disabled={disabled} onClick={props.onPrint}><Printer size={16} aria-hidden="true" /> Print / PDF</button>
        <div className="reports-export" onKeyDown={event => { if (event.key === "Escape") props.onExportToggle(false); }}>
          <button type="button" className="reports-button reports-button--primary" disabled={disabled} aria-expanded={props.isExportDropdownOpen} aria-controls="report-export-options" onClick={() => props.onExportToggle(!props.isExportDropdownOpen)}><Download size={16} aria-hidden="true" /> Export report <ChevronDown size={15} aria-hidden="true" /></button>
          {props.isExportDropdownOpen && <><div className="reports-export__backdrop" onClick={() => props.onExportToggle(false)} /><div id="report-export-options" className="reports-export__menu" role="group" aria-label="Report export options">
            <button type="button" onClick={() => { props.onExportCsv(); props.onExportToggle(false); }}><FileSpreadsheet size={17} aria-hidden="true" /><span>Export CSV<small>Open in Excel or Google Sheets</small></span></button>
            <button type="button" onClick={() => { props.onExportJson(); props.onExportToggle(false); }}><FileText size={17} aria-hidden="true" /><span>Export JSON<small>Download report data</small></span></button>
          </div></>}
        </div>
      </div>
    </div>

    {props.apiError && <div role="alert" className="reports-error"><strong>Unable to load report</strong><p>{props.apiError}</p></div>}

    <section className="reports-filters print:hidden" aria-label="Report filters">
      <div className="reports-filter-controls">
        <label className="reports-search"><span>Search records</span><div><Search size={16} aria-hidden="true" /><input aria-label="Search report records" type="search" value={searchQuery} onChange={event => props.onSearchChange(event.target.value)} placeholder="Search details..." /></div></label>
        <div className="reports-filter-field"><span>Period</span><NiceSelect ariaLabel="Select period" value={selectedPeriod} onValueChange={props.onPeriodChange} options={reportPeriodOptions} /></div>
        {showStatus && <div className="reports-filter-field"><span>Status</span><NiceSelect ariaLabel="Filter status" value={statusFilter} onValueChange={props.onStatusChange} options={[{ label: "All Statuses", value: "all" }, ...["New", "Contacted", "Paid", "Overdue", "PTP", "Broken PTP"].map(value => ({ label: value, value }))]} /></div>}
        {showPriority && <div className="reports-filter-field"><span>Priority</span><NiceSelect ariaLabel="Filter priority" value={priorityFilter} onValueChange={props.onPriorityChange} options={[{ label: "All Priorities", value: "all" }, ...["High", "Medium", "Low"].map(value => ({ label: value, value }))]} /></div>}
      </div>
      <div className="reports-filter-summary" aria-label="Active report filters"><Filter size={14} aria-hidden="true" /><span><strong>Showing:</strong> {reportPeriodOptions.find(option => option.value === selectedPeriod)?.label || selectedPeriod}{showStatus && statusFilter !== "all" ? ` · ${statusFilter}` : ""}{showPriority && priorityFilter !== "all" ? ` · ${priorityFilter} priority` : ""}{searchQuery.trim() ? ` · Search: ${searchQuery.trim()}` : ""}</span></div>
    </section>

    {props.summaryCards.length > 0 && <section className="reports-metrics print:hidden" data-count={props.summaryCards.length} aria-label="Report period summary">
      {props.summaryCards.map(card => <ReportMetricCard key={card.label} title={card.label} metric={props.isLoading ? "…" : card.value} note={card.note} accent={card.color} icon={icons[card.icon] || FileText} />)}
    </section>}
    {props.children}
  </div>;
}
