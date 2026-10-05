import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle, FileText, Lock, ShieldCheck } from "lucide-react";
import { toast } from "react-toastify";
import { apiGet, apiPost } from "../lib/api";
import { getTenantBranding } from "../lib/tenant";
import { setPublicFavicons } from "../lib/favicon";

type PublicLead = {
  id: string;
  name: string;
  email: string;
  phone: string;
  loanAmount: number | null;
  monthlyIncome: number;
  bankName?: string;
};

type PublicCamSheet = {
  approvedAmount: number;
  loanTermDays: number;
  interestRate: number;
  processingFeeRate: number;
  totalRepayment: number;
  recommendation: string;
  conditions: string;
};

type PublicESignRequest = {
  token: string;
  status: string;
  signerName: string;
  signerEmail: string;
  signerPhone: string;
  consentText: string;
  signedAt: string | null;
  expiresAt: string;
  isExpired: boolean;
  dummyOtp: string;
};

type PublicESignResponse = {
  request: PublicESignRequest;
  lead: PublicLead | null;
  camSheet: PublicCamSheet | null;
};

const formatCurrency = (value?: number | null) => {
  const numeric = Number(value || 0);
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(numeric);
};

const formatDate = (value?: string | null) => {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
};

export function ESign() {
  const branding = useMemo(() => getTenantBranding(), []);
  const isGeetPay = branding.slug === "geetpay";
  const { token = "" } = useParams();

  useEffect(() => {
    setPublicFavicons(isGeetPay ? "GeetPay eSign" : "PayDay Loan CRM - eSign", isGeetPay ? "geetpay" : "default");
  }, [isGeetPay]);
  const [payload, setPayload] = useState<PublicESignResponse | null>(null);
  const [error, setError] = useState("");
  const [otp, setOtp] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigning, setIsSigning] = useState(false);

  const isSigned = payload?.request.status === "signed";
  const isLocked = Boolean(isSigned || payload?.request.isExpired);
  const camSheet = payload?.camSheet;
  const lead = payload?.lead;

  const repaymentRows = useMemo(() => [
    ["Approved Amount", formatCurrency(camSheet?.approvedAmount || lead?.loanAmount)],
    ["Tenure", `${camSheet?.loanTermDays || 30} days`],
    ["Interest Rate", `${camSheet?.interestRate || 0}%`],
    ["Processing Fee", `${camSheet?.processingFeeRate || 0}%`],
    ["Total Repayment", formatCurrency(camSheet?.totalRepayment || camSheet?.approvedAmount || lead?.loanAmount)],
  ], [camSheet, lead]);

  useEffect(() => {
    if (!token) return;

    const controller = new AbortController();
    setIsLoading(true);
    setError("");
    apiGet<PublicESignResponse>(`/esign/${encodeURIComponent(token)}`, controller.signal)
      .then((data) => setPayload(data))
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Unable to load eSign request"))
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [token]);

  const submitSignature = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;

    try {
      setIsSigning(true);
      setError("");
      const response = await apiPost<{ request: PublicESignRequest }>(`/esign/${encodeURIComponent(token)}/sign`, {
        consentAccepted,
        otp,
      });
      setPayload((current) => current ? { ...current, request: response.request } : current);
      toast.success("Agreement signed successfully");
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Unable to complete eSign";
      setError(message);
      toast.error(message);
    } finally {
      setIsSigning(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="rounded-lg border border-slate-200 bg-white px-6 py-5 text-sm font-semibold text-slate-700 shadow-sm">
          Loading eSign agreement...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4">
          {isGeetPay ? (
            <div>
              <div className="flex h-14 w-[176px] items-center justify-center rounded-xl px-3 py-2" style={{ backgroundColor: "#ffffff" }}><img src={branding.logoUrl} alt={branding.name} className="h-full w-full object-contain" /></div>
              <p className="mt-1 text-center text-[10px] font-medium text-slate-500">A Product of Waqt Finance</p>
            </div>
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-xl p-1 bg-slate-900 border border-slate-700 shadow-sm shrink-0">
              <img src={branding.logoUrl} alt={branding.name} className="h-full w-full object-contain filter drop-shadow" />
            </div>
          )}
          <div>
            <h1 className="text-lg font-bold text-slate-950">{branding.name} eSign</h1>
            <p className="text-xs text-slate-500">Secure dummy signing flow for loan agreement</p>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl grid-cols-1 gap-6 px-4 py-8 lg:grid-cols-[1fr_360px]">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-600">Loan Agreement</p>
              <h2 className="mt-1 text-2xl font-bold text-slate-950">{lead?.name || "Customer"}</h2>
              <p className="mt-1 text-sm text-slate-500">Application: {lead?.id || "Not available"}</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
              isSigned ? "bg-green-100 text-green-800" : payload?.request.isExpired ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
            }`}>
              {isSigned ? "Signed" : payload?.request.isExpired ? "Expired" : "Pending Signature"}
            </span>
          </div>

          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {repaymentRows.map(([label, value]) => (
              <div key={label} className="rounded-md bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
                <p className="mt-1 text-lg font-bold text-slate-950">{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-lg border border-slate-200 p-4">
            <div className="mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-600" />
              <h3 className="text-sm font-semibold text-slate-950">Agreement Terms</h3>
            </div>
            <div className="space-y-2 text-sm leading-6 text-slate-600">
              <p>Customer confirms the approved loan amount, fee, tenure, and repayment obligations shown above.</p>
              <p>Customer authorizes Waqt Finance to process the loan after successful internal checks and disbursement approval.</p>
              <p>Conditions: {camSheet?.conditions || "No additional conditions recorded."}</p>
            </div>
          </div>

          {isSigned && (
            <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle className="h-4 w-4" />
                Agreement signed on {formatDate(payload?.request.signedAt)}
              </div>
            </div>
          )}
        </section>

        <aside className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            <div>
              <h3 className="font-semibold text-slate-950">Customer Consent</h3>
              <p className="text-xs text-slate-500">Dummy OTP: {payload?.request.dummyOtp}</p>
            </div>
          </div>

          <form onSubmit={submitSignature} className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              OTP
              <input
                value={otp}
                onChange={(event) => setOtp(event.target.value)}
                disabled={isLocked || isSigning}
                placeholder="Enter 6 digit OTP"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50"
              />
            </label>

            <label className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={consentAccepted}
                onChange={(event) => setConsentAccepted(event.target.checked)}
                disabled={isLocked || isSigning}
                className="mt-1"
              />
              <span>{payload?.request.consentText || "I consent to digitally sign this agreement."}</span>
            </label>

            <button
              type="submit"
              disabled={isLocked || isSigning || !consentAccepted || otp.trim().length < 6}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Lock className="h-4 w-4" />
              {isSigning ? "Signing..." : isSigned ? "Already Signed" : "Sign Agreement"}
            </button>
          </form>

          <div className="mt-5 space-y-2 border-t border-slate-200 pt-4 text-xs text-slate-500">
            <p>Signer: {payload?.request.signerName || lead?.name || "Customer"}</p>
            <p>Email: {payload?.request.signerEmail || lead?.email || "Not available"}</p>
            <p>Expires: {formatDate(payload?.request.expiresAt)}</p>
          </div>
        </aside>
      </main>
    </div>
  );
}
