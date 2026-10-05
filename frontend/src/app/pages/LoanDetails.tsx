import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Calendar, CheckCircle2, CreditCard, FileText, IndianRupee, Mail, Phone, RefreshCw, Send, User, UserPlus } from "lucide-react";
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
};

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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function statusBadge(status: string) {
  const tone =
    status === "Active"
      ? "bg-blue-50 text-blue-700 ring-blue-200"
      : status === "Paid Off"
        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
        : status === "Overdue"
          ? "bg-red-50 text-red-700 ring-red-200"
          : "bg-slate-50 text-slate-700 ring-slate-200";

  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${tone}`}>{status || "Unknown"}</span>;
}

function InfoRow({ label, value, className = "" }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
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
  const [isNocSending, setIsNocSending] = useState(false);

  const handleDownloadNocPdf = async () => {
    if (!loanId) return;
    try {
      const blob = await apiGetBlob(`/api/loans/${encodeURIComponent(loanId)}/noc/pdf`);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `NOC_${loanId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to download NOC PDF");
    }
  };

  const handleSendNocEmail = async () => {
    if (!loanId) return;
    setIsNocSending(true);
    try {
      await apiPost(`/loans/${encodeURIComponent(loanId)}/noc/send-email`, {});
      alert("NOC Certificate email sent successfully to borrower!");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to send NOC email");
    } finally {
      setIsNocSending(false);
    }
  };

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

  return (
    <div className="w-full min-w-0 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <Link to="/loan-management" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:text-blue-900">
          <ArrowLeft className="h-4 w-4" />
          Back to Loan Portfolio
        </Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Loan Details</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h2 className="text-3xl font-bold text-slate-950">{loan?.id || loanId}</h2>
              {loan ? statusBadge(loan.status) : null}
            </div>
            <p className="mt-1 text-sm text-slate-600">{loan?.customer || "Real loan record from CRM database"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {loan && (loan.status === "Paid Off" || loan.status === "Closed" || Number(loan.balance || 0) <= 0) && (currentRole === "credit-manager" || currentRole === "superadmin" || currentRole === "product-admin") && (
              <button
                type="button"
                onClick={handleInitiateReloan}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-600 px-3.5 text-sm font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-60 shadow-sm"
                disabled={isInitiating || isLoading}
              >
                <UserPlus className="h-4 w-4" />
                {isInitiating ? "Initiating..." : "Initiate Reloan"}
              </button>
            )}
            <button
              type="button"
              onClick={() => loadLoan()}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              disabled={isLoading || isInitiating}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {error && <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {isLoading && !loan ? (
        <div className="rounded-lg border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 shadow-sm">Loading loan details...</div>
      ) : loan ? (
        <>
          {loan && (loan.status === "Paid Off" || loan.status === "Closed" || Number(loan.balance || 0) <= 0) && (
            <div className="mb-6 rounded-lg border border-emerald-300 bg-emerald-50/90 p-5 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="flex items-center gap-2 text-base font-bold text-emerald-950">
                    <FileText className="h-5 w-5 text-emerald-700" />
                    No Objection Certificate (NOC / No Dues Certificate)
                  </h3>
                  <p className="mt-1 text-xs text-emerald-800">
                    This loan account is fully settled and closed. NOC certificate can be downloaded or emailed to the borrower.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadNocPdf}
                    className="inline-flex items-center gap-2 rounded-md bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-800"
                  >
                    <FileText className="h-4 w-4" />
                    Download NOC PDF
                  </button>
                  <button
                    type="button"
                    onClick={handleSendNocEmail}
                    disabled={isNocSending}
                    className="inline-flex items-center gap-2 rounded-md border border-emerald-300 bg-white px-3.5 py-2 text-xs font-semibold text-emerald-900 shadow-sm transition hover:bg-emerald-100 disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                    {isNocSending ? "Sending Email..." : "Resend NOC Email"}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-2 flex items-center justify-between text-sm text-slate-600">
                Total amount
                <IndianRupee className="h-5 w-5 text-blue-600" />
              </div>
              <p className="text-3xl font-bold text-slate-950">{formatCurrency(loan.totalAmount)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-2 flex items-center justify-between text-sm text-slate-600">
                Amount paid
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
              <p className="text-3xl font-bold text-slate-950">{formatCurrency(loan.amountPaid)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-2 flex items-center justify-between text-sm text-slate-600">
                Balance
                <CreditCard className="h-5 w-5 text-orange-600" />
              </div>
              <p className="text-3xl font-bold text-slate-950">{formatCurrency(loan.balance)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-2 flex items-center justify-between text-sm text-slate-600">
                Days until due
                <Calendar className="h-5 w-5 text-slate-600" />
              </div>
              <p className="text-3xl font-bold text-slate-950">{daysUntilDue}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <section className="xl:col-span-2 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-5 text-lg font-bold text-slate-950">Loan Information</h3>
              <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                <InfoRow label="Principal" value={formatCurrency(loan.principal)} />
                <InfoRow label="Interest Rate" value={`${Number(loan.interestRate || 0)}%`} />
                <InfoRow label="Total Amount" value={formatCurrency(loan.totalAmount)} />
                <InfoRow label="Disbursed Date" value={formatDate(loan.disbursedDate || loan.startDate)} />
                <InfoRow label="Due Date" value={formatDate(loan.dueDate)} />
                <InfoRow label="Payment Status" value={loan.paymentStatus || "Pending"} />
                <InfoRow label="Next Payment Date" value={formatDate(!loan.nextPaymentDate || loan.nextPaymentDate === loan.startDate || loan.nextPaymentDate === loan.disbursedDate ? loan.dueDate : loan.nextPaymentDate)} />
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

            <aside className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center gap-2">
                <User className="h-5 w-5 text-slate-600" />
                <h3 className="text-lg font-bold text-slate-950">Customer</h3>
              </div>
              <dl className="space-y-5">
                <InfoRow label="Name" value={loan.customer || "Customer not linked"} />
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</dt>
                  <dd className="mt-1 inline-flex items-center gap-2 text-sm font-medium text-slate-950">
                    <Phone className="h-4 w-4 text-slate-400" />
                    {loan.customerPhone || "-"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</dt>
                  <dd className="mt-1 inline-flex items-center gap-2 text-sm font-medium text-slate-950">
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
        <div className="rounded-lg border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 shadow-sm">Loan record not found.</div>
      )}
    </div>
  );
}
