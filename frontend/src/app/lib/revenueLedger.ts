import { accountingDateOnly } from "./accountingDateOnly";

type Repayment = {
  amount?: number | string;
  receivedAt?: string | Date | null;
  received_at?: string | Date | null;
  date?: string | Date | null;
  status?: string;
};

export type RevenueLoan = {
  id?: string;
  loanId?: string;
  agreementNumber?: string;
  customer?: string;
  customerName?: string;
  name?: string;
  principal?: number | string;
  amountPaid?: number | string;
  balance?: number | string | null;
  repaymentAmount?: number | string | null;
  totalAmount?: number | string | null;
  processingFee?: number | string | null;
  processing?: number | string | null;
  totalAdminFee?: number | string | null;
  totalRoi?: number | string | null;
  status?: string;
  disbursedDate?: string | Date | null;
  disbursedAt?: string | Date | null;
  startDate?: string | Date | null;
  createdAt?: string | Date | null;
  repayments?: Repayment[];
};

export type RevenueFilters = {
  timeframe: "today" | "yesterday" | "month" | "all" | "custom";
  from?: string;
  to?: string;
  search?: string;
  status?: "all" | "realized" | "partial" | "pending";
};

export type RevenueLedgerRow = {
  id: string;
  customer: string;
  agreementId: string;
  principal: number;
  roi: number;
  fees: number;
  totalIncome: number;
  status: "realized" | "partial" | "pending";
};

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const numeric = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const eligibleStatuses = new Set(["received", "success", "paid", "settled"]);

export function getRevenueDate(value?: string | Date | null): string {
  if (!value) return "";
  if (typeof value === "string") return accountingDateOnly(value);
  return Number.isNaN(value.getTime()) ? "" : accountingDateOnly(value.toISOString());
}

function paymentTimestamp(value?: string | Date | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  if (typeof value !== "string" && Number.isNaN(value.getTime())) return Number.POSITIVE_INFINITY;
  const str = typeof value === "string" ? value.trim() : value.toISOString();
  const local = /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?)?$/.test(str);
  const timestamp = Date.parse(local ? `${str.length === 10 ? `${str}T00:00:00` : str.replace(" ", "T")}+05:30` : str);
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}

export function revenueLoanStatus(loan: RevenueLoan): RevenueLedgerRow["status"] {
  const status = String(loan.status || "").trim().toLowerCase();
  const paid = numeric(loan.amountPaid);
  const target = numeric(loan.repaymentAmount ?? loan.totalAmount ?? numeric(loan.principal) * 1.12);
  if (["paid off", "closed", "paid", "settled"].includes(status)
    || (loan.balance !== null && loan.balance !== undefined && loan.balance !== "" && Number.isFinite(Number(loan.balance)) && Number(loan.balance) <= 0)
    || (target > 0 && paid >= target)) return "realized";
  return paid > 0 ? "partial" : "pending";
}

export function createRevenueLedger(loans: RevenueLoan[], filters: RevenueFilters, now = new Date()) {
  const today = getRevenueDate(now);
  const yesterday = new Date(`${today}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayDate = yesterday.toISOString().slice(0, 10);
  const invalidRange = filters.timeframe === "custom" && Boolean(filters.from && filters.to && filters.from > filters.to);
  const inRange = (date: string) => {
    if (invalidRange) return false;
    if (filters.timeframe === "all") return true;
    if (!date) return false;
    if (filters.timeframe === "today") return date === today;
    if (filters.timeframe === "yesterday") return date === yesterdayDate;
    if (filters.timeframe === "month") return date.slice(0, 7) === today.slice(0, 7);
    return (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to);
  };
  const search = String(filters.search || "").trim().toLowerCase();
  const rows: RevenueLedgerRow[] = [];
  let undatedRoi = 0;

  for (const loan of loans) {
    const customer = loan.customer || loan.customerName || loan.name || "Customer";
    const agreementId = loan.agreementNumber || loan.id || loan.loanId || "-";
    const status = revenueLoanStatus(loan);
    if (search && !`${customer} ${agreementId}`.toLowerCase().includes(search)) continue;
    if (filters.status && filters.status !== "all" && status !== filters.status) continue;

    const principal = numeric(loan.principal);
    const disbursedInRange = inRange(getRevenueDate(loan.disbursedDate || loan.disbursedAt || loan.startDate || loan.createdAt));
    const repayments = (loan.repayments || []).filter(payment => !payment.status || eligibleStatuses.has(payment.status.trim().toLowerCase()))
      .map((payment, index) => ({ payment, index, date: payment.receivedAt || payment.received_at || payment.date }))
      .sort((a, b) => paymentTimestamp(a.date) - paymentTimestamp(b.date) || a.index - b.index);
    let cumulativePaid = 0;
    let roi = 0;
    let repaymentInRange = false;
    for (const { payment, date } of repayments) {
      const before = Math.max(0, cumulativePaid - principal);
      cumulativePaid += numeric(payment.amount);
      const realized = Math.max(0, cumulativePaid - principal) - before;
      if (inRange(getRevenueDate(date))) {
        repaymentInRange = true;
        roi += realized;
      }
    }

    // A lifetime snapshot cannot establish when undated interest was received.
    if (!repayments.length) {
      const lifetimeRoi = numeric(loan.totalRoi ?? Math.max(0, numeric(loan.amountPaid) - principal));
      if (filters.timeframe === "all") roi = lifetimeRoi;
      else undatedRoi += lifetimeRoi;
    }
    if (invalidRange || (filters.timeframe !== "all" && !disbursedInRange && !repaymentInRange)) continue;
    const fees = disbursedInRange ? numeric(loan.processingFee ?? loan.processing ?? loan.totalAdminFee) : 0;
    rows.push({ id: loan.id || agreementId, customer, agreementId, principal: disbursedInRange ? principal : 0,
      roi: money(roi), fees: money(fees), totalIncome: money(roi + fees), status });
  }

  const totals = rows.reduce((sum, row) => ({
    count: sum.count + 1,
    principal: money(sum.principal + row.principal),
    roi: money(sum.roi + row.roi),
    fees: money(sum.fees + row.fees),
    totalIncome: money(sum.totalIncome + row.totalIncome),
    realized: sum.realized + Number(row.status === "realized"),
    partial: sum.partial + Number(row.status === "partial"),
    pending: sum.pending + Number(row.status === "pending"),
  }), { count: 0, principal: 0, roi: 0, fees: 0, totalIncome: 0, realized: 0, partial: 0, pending: 0 });
  return { rows, totals, invalidRange, undatedRoi: money(undatedRoi) };
}

export function revenueLedgerCsv(rows: RevenueLedgerRow[]): string {
  const headers = ["Borrower Name", "Agreement ID", "Principal Disbursed", "ROI Revenue (Interest)", "PF Revenue (Fee)", "Total Income", "Status"];
  const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  return [headers.map(escape).join(","), ...rows.map(row => [row.customer, row.agreementId, row.principal, row.roi, row.fees, row.totalIncome, row.status.toUpperCase()].map(escape).join(","))].join("\n");
}
