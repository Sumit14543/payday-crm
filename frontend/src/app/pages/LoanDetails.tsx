import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  CreditCard,
  FileText,
  IndianRupee,
  Mail,
  Phone,
  RefreshCw,
  Send,
  User,
  UserPlus,
  X,
  Check,
  AlertCircle,
} from "lucide-react";
import { NiceSelect } from "../components/ui/nice-select";
import { apiGet, apiGetBlob, apiPost } from "../lib/api";
import { useAuth } from "../lib/auth";

type LoanDetail = {
  id: string;
  customer: string | null;
  customerId: string;
  principal: number;
  interestRate: number;
  totalAmount: number;
  amountPaid: number;
  balance: number;
  startDate: string;
  disbursedDate?: string | null;
  dueDate: string;
  status: string;
  paymentStatus: string;
  nextPaymentDate: string | null;
  nextPaymentAmount: number;
  utrNumber?: string | null;
  transactionId?: string | null;
  disbursementUtr?: string | null;
  transferType?: string | null;
  accountNumber?: string | null;
  ifscCode?: string | null;
  bankName?: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerCreditScore: number | null;
  lastPaymentDate?: string | null;
};

const PAYMENT_METHOD_OPTIONS = [
  { label: "Bank Transfer (IMPS/NEFT)", value: "Bank Transfer" },
  { label: "UPI", value: "UPI" },
  { label: "Cash", value: "Cash" },
  { label: "Cheque", value: "Cheque" },
  { label: "Payment Gateway", value: "Payment Gateway" },
];

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

function formatCurrency(value: number | null | undefined) {
  return money.format(Number(value || 0));
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
}

function statusBadge(status: string) {
  const isPaidOff = status === "Paid Off" || status === "Closed";
  const isActive = status === "Active";
  const isOverdue = status === "Overdue";

  const tone = isActive
    ? "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:ring-blue-800"
    : isPaidOff
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-800"
      : isOverdue
        ? "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/60 dark:text-red-300 dark:ring-red-800"
        : "bg-slate-50 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700";

  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${tone}`}>{status || "Unknown"}</span>;
}

function InfoRow({ label, value, className = "" }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className={`mt-1 text-sm font-medium text-slate-950 dark:text-slate-100 break-words ${className}`}>{value}</dd>
    </div>
  );
}

export function LoanDetails() {
  const { loanId } = useParams();
  const { user, activeRole } = useAuth();
  const currentRole = activeRole || user?.role || "telecaller";
  const navigate = useNavigate();
  const [loan, setLoan] = useState<LoanDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInitiating, setIsInitiating] = useState(false);

  // Repayment Modal
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("Bank Transfer");
  const [paymentReference, setPaymentReference] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [paymentNotes, setPaymentNotes] = useState<string>("");
  const [isFullSettlement, setIsFullSettlement] = useState<boolean>(true);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState<boolean>(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  const handleInitiateReloan = async () => {
    if (!loan?.customerId) return;
    if (
      !window.confirm(
        `Are you sure you want to initiate a Reloan for ${loan.customer}? This will clone their details and assign them directly to the Credit Queue.`
      )
    ) {
      return;
    }

    setIsInitiating(true);
    try {
      const response = await apiPost<{ id: string }>(`/customers/${encodeURIComponent(loan.customerId)}/reloan`, {});
      alert("Reloan lead created successfully! Redirecting to the lead details workspace...");
      navigate(`/leads/${response.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to initiate reloan");
    } finally {
      setIsInitiating(false);
    }
  };

  const openPaymentModal = (forceFull: boolean = true) => {
    if (!loan) return;
    const bal = Number(loan.balance || 0);
    setPaymentAmount(String(bal > 0 ? bal : loan.totalAmount));
    setIsFullSettlement(forceFull || bal <= 0);
    setPaymentMethod("Bank Transfer");
    setPaymentReference("");
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentNotes(forceFull ? "Full settlement recorded" : "Payment received");
    setPaymentError(null);
    setIsPaymentModalOpen(true);
  };

  const handleSubmitRepayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loan || !loanId) return;

    const numAmount = Number(paymentAmount);
    if (!isFullSettlement && (!Number.isFinite(numAmount) || numAmount <= 0)) {
      setPaymentError("Please enter a valid repayment amount greater than 0.");
      return;
    }

    setIsSubmittingPayment(true);
    setPaymentError(null);

    try {
      await apiPost(`/loans/${encodeURIComponent(loanId)}/repayment`, {
        amount: numAmount,
        method: paymentMethod,
        reference: paymentReference.trim() || `MAN-${Date.now()}`,
        notes: paymentNotes.trim(),
        paidAt: paymentDate,
        closeFully: isFullSettlement,
      });

      const msg = isFullSettlement
        ? `Loan settled and marked as Paid Off!`
        : `Payment of ₹${numAmount} recorded successfully!`;

      setActionSuccessMessage(msg);
      setIsPaymentModalOpen(false);
      loadLoan();
      setTimeout(() => setActionSuccessMessage(null), 6000);
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : "Failed to record payment.");
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const loadLoan = useCallback(
    async (signal?: AbortSignal) => {
      if (!loanId) {
        setError("Loan ID missing");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const data = await apiGet<LoanDetail>(`/loans/${encodeURIComponent(loanId)}`, signal);
        setLoan(data);
        setError(null);
      } catch (err) {
        if (!signal?.aborted) {
          setError(err instanceof Error ? err.message : "Unable to load loan details");
        }
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false);
        }
      }
    },
    [loanId]
  );

  useEffect(() => {
    const controller = new AbortController();
    loadLoan(controller.signal);
    return () => controller.abort();
  }, [loadLoan]);

  const daysUntilDue = useMemo(() => {
    if (!loan?.dueDate) return "-";
    const due = new Date(loan.dueDate).getTime();
    if (Number.isNaN(due)) return "-";
    return String(Math.ceil((due - Date.now()) / 86_400_000));
  }, [loan?.dueDate]);

  const isLoanSettled =
    loan && (loan.status === "Paid Off" || loan.status === "Closed" || Number(loan.balance || 0) <= 0);

  return (
    <div className="w-full min-w-0 px-4 py-6 sm:px-6 lg:px-8 text-slate-900 dark:text-slate-100">
      {/* Success Notification Banner */}
      {actionSuccessMessage && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{actionSuccessMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 dark:text-emerald-300 dark:hover:text-emerald-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="mb-6">
        <Link
          to="/loan-management"
          className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Loan Portfolio
        </Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400">
              Loan Account
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h2 className="text-3xl font-bold text-slate-950 dark:text-white">{loan?.id || loanId}</h2>
              {loan ? statusBadge(loan.status) : null}
            </div>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {loan?.customer || "Real loan record from CRM database"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">

            {/* Initiate Reloan if settled */}
            {isLoanSettled &&
              (currentRole === "credit-manager" ||
                currentRole === "superadmin" ||
                currentRole === "product-admin") && (
                <button
                  type="button"
                  onClick={handleInitiateReloan}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-3.5 text-sm font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-60 shadow-sm"
                  disabled={isInitiating || isLoading}
                >
                  <UserPlus className="h-4 w-4" />
                  {isInitiating ? "Initiating..." : "Initiate Reloan"}
                </button>
              )}

            <button
              type="button"
              onClick={() => loadLoan()}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 shadow-sm transition"
              disabled={isLoading || isInitiating}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/60 dark:text-red-300">
          {error}
        </div>
      )}

      {isLoading && !loan ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          <RefreshCw className="mx-auto mb-2 h-6 w-6 animate-spin text-blue-600" />
          Loading loan details...
        </div>
      ) : loan ? (
        <>
          {/* Stat Cards */}
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Total Amount Due
                <IndianRupee className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <p className="text-3xl font-black text-slate-950 dark:text-white">{formatCurrency(loan.totalAmount)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Amount Paid
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(loan.amountPaid)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Current Balance
                <CreditCard className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <p className="text-3xl font-black text-purple-700 dark:text-purple-400">
                {isLoanSettled ? "₹0 (Cleared)" : formatCurrency(loan.balance)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Days Until Due
                <Calendar className="h-5 w-5 text-slate-600 dark:text-slate-400" />
              </div>
              <p className="text-3xl font-black text-slate-950 dark:text-white">{daysUntilDue}</p>
            </div>
          </div>

          {/* Details Sections */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <section className="xl:col-span-2 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h3 className="mb-5 text-lg font-bold text-slate-950 dark:text-white">Loan Information</h3>
              <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                <InfoRow label="Principal" value={formatCurrency(loan.principal)} />
                <InfoRow label="Interest Rate" value={`${Number(loan.interestRate || 0)}%`} />
                <InfoRow label="Total Amount" value={formatCurrency(loan.totalAmount)} />
                <InfoRow label="Disbursed Date" value={formatDate(loan.disbursedDate || loan.startDate)} />
                <InfoRow label="Due Date" value={formatDate(loan.dueDate)} />
                <InfoRow label="Payment Date" value={loan.amountPaid > 0 || loan.lastPaymentDate ? formatDate(loan.lastPaymentDate) : "-"} />
                <InfoRow label="Payment Status" value={loan.paymentStatus || "Pending"} />
                <InfoRow
                  label="Next Payment Date"
                  value={formatDate(
                    !loan.nextPaymentDate ||
                      loan.nextPaymentDate === loan.startDate ||
                      loan.nextPaymentDate === loan.disbursedDate
                      ? loan.dueDate
                      : loan.nextPaymentDate
                  )}
                />
                <InfoRow label="Next Payment Amount" value={formatCurrency(loan.nextPaymentAmount)} />
                <InfoRow
                  label="UTR / Txn ID"
                  value={
                    loan.utrNumber || loan.transactionId || loan.disbursementUtr ? (
                      <span className="inline-block break-all font-mono text-xs font-semibold text-blue-400 bg-blue-950/70 border border-blue-800/80 px-2 py-1 rounded max-w-full select-all">
                        {loan.utrNumber || loan.transactionId || loan.disbursementUtr}
                      </span>
                    ) : (
                      "-"
                    )
                  }
                />
                <InfoRow label="Customer ID" value={loan.customerId} />
                <InfoRow
                  label="Bank Account"
                  value={
                    loan.accountNumber ? (
                      <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 select-all">
                        {loan.accountNumber}
                      </span>
                    ) : (
                      "-"
                    )
                  }
                />
                <InfoRow
                  label="IFSC Code"
                  value={
                    loan.ifscCode ? (
                      <span className="font-mono text-sm font-semibold uppercase text-slate-900 dark:text-slate-100 select-all">
                        {loan.ifscCode}
                      </span>
                    ) : (
                      "-"
                    )
                  }
                />
                {loan.bankName ? <InfoRow label="Bank Name" value={loan.bankName} /> : null}
              </dl>
            </section>

            <aside className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-5 flex items-center gap-2">
                <User className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                <h3 className="text-lg font-bold text-slate-950 dark:text-white">Customer Information</h3>
              </div>
              <dl className="space-y-5">
                <InfoRow label="Name" value={loan.customer || "Customer not linked"} />
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Phone
                  </dt>
                  <dd className="mt-1 inline-flex items-center gap-2 text-sm font-medium text-slate-950 dark:text-slate-100">
                    <Phone className="h-4 w-4 text-slate-400" />
                    {loan.customerPhone || "-"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Email
                  </dt>
                  <dd className="mt-1 inline-flex items-center gap-2 text-sm font-medium text-slate-950 dark:text-slate-100">
                    <Mail className="h-4 w-4 text-slate-400" />
                    {loan.customerEmail || "-"}
                  </dd>
                </div>
                <InfoRow label="Credit Score" value={loan.customerCreditScore || "-"} />
              </dl>
            </aside>
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          Loan record not found.
        </div>
      )}

      {/* Payment / Settlement Modal */}
      {isPaymentModalOpen && loan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 transition-all">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-slate-800/60">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-950 dark:text-white">Record Payment / Settle Loan</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Loan ID: <strong className="font-mono text-slate-700 dark:text-slate-300">{loan.id}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitRepayment} className="p-6 space-y-4">
              {paymentError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700 dark:border-red-800 dark:bg-red-950/60 dark:text-red-300 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{paymentError}</span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const bal = Number(loan.balance || 0);
                    setPaymentAmount(String(bal > 0 ? bal : loan.totalAmount));
                    setIsFullSettlement(true);
                  }}
                  className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 transition"
                >
                  Pay Full Balance ({formatCurrency(loan.balance)})
                </button>
                <button
                  type="button"
                  onClick={() => setIsFullSettlement(false)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 transition"
                >
                  Custom Amount
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                    Repayment Amount (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    required
                    value={paymentAmount}
                    onChange={(e) => {
                      setPaymentAmount(e.target.value);
                      if (Number(e.target.value) >= Number(loan.balance || 0)) {
                        setIsFullSettlement(true);
                      }
                    }}
                    placeholder="e.g. 5000"
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                    Payment Mode <span className="text-red-500">*</span>
                  </label>
                  <NiceSelect
                    ariaLabel="Payment Method"
                    value={paymentMethod}
                    onValueChange={setPaymentMethod}
                    className="w-full"
                    options={PAYMENT_METHOD_OPTIONS}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                    UTR / Ref Number
                  </label>
                  <input
                    type="text"
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    placeholder="e.g. 40291039401"
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                  <span className="text-[10px] text-slate-400">Leave blank to auto-generate reference</span>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                    Payment Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3.5 dark:border-emerald-900/60 dark:bg-emerald-950/30">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isFullSettlement}
                    onChange={(e) => setIsFullSettlement(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div>
                    <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                      Mark as Full Settlement (Paid Off)
                    </span>
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                      Closes loan account and sets status to "Paid Off".
                    </p>
                  </div>
                </label>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                  Notes / Remarks
                </label>
                <input
                  type="text"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="e.g. Cleared via customer transfer"
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  disabled={isSubmittingPayment}
                  className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPayment}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition shadow-sm"
                >
                  {isSubmittingPayment ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Recording...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      {isFullSettlement ? "Confirm Settlement (Paid Off)" : "Record Repayment"}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
