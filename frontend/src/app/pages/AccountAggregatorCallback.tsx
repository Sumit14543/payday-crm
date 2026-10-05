import { useEffect, useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { CheckCircle2, AlertCircle, Clock, ShieldCheck, ArrowRight, Building2 } from "lucide-react";
import { apiGet } from "../lib/api";

export function AccountAggregatorCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const trackingId = searchParams.get("trackingId") || searchParams.get("tracking_id") || "";
  const digitalFlowRequestId = searchParams.get("digitalFlowRequestId") || searchParams.get("requestId") || "";

  const [status, setStatus] = useState<"loading" | "success" | "pending" | "error">("loading");
  const [message, setMessage] = useState("Verifying your Bank Account Consent with CRIF Finvu AA...");
  const [leadAppId, setLeadAppId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function checkConsentStatus() {
      if (!trackingId) {
        if (isMounted) {
          setStatus("pending");
          setMessage("Bank consent step completed! Your bank statement data will sync with Waqt Finance shortly.");
        }
        return;
      }

      try {
        setStatus("loading");
        setMessage("Consent received! Verifying bank account statement with CRIF Finvu...");

        const res = await apiGet<any>(`/account-aggregator/callback-verify?${searchParams.toString()}`);
        const data = res?.data || res;

        if (isMounted) {
          if (data?.applicationId) {
            setLeadAppId(data.applicationId);
          }
          const statusStr = String(data?.status || "").toUpperCase();
          if (["ACTIVE", "APPROVED", "COMPLETED", "SUCCESS"].includes(statusStr)) {
            setStatus("success");
            setMessage("Bank Account Consent & Transactions synced successfully with Waqt Finance!");
          } else if (["REJECTED", "EXPIRED", "FAILED", "REVOKED"].includes(statusStr)) {
            setStatus("error");
            setMessage("Bank Account Consent was declined or expired on CRIF Finvu.");
          } else {
            setStatus("pending");
            setMessage("Consent flow initiated. Bank consent is yet to be approved by customer on CRIF Finvu.");
          }
        }
      } catch (err) {
        if (isMounted) {
          setStatus("pending");
          setMessage("Consent request submitted. Verification will update once customer approves on CRIF Finvu.");
        }
      }
    }

    checkConsentStatus();
    return () => { isMounted = false; };
  }, [trackingId, searchParams]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-8 text-center">
        <div className="mb-6 flex justify-center">
          {status === "loading" && (
            <div className="h-16 w-16 rounded-full bg-blue-50 border-4 border-blue-200 border-t-blue-600 animate-spin" />
          )}
          {status === "success" && (
            <div className="h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-950 border-4 border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="h-10 w-10" />
            </div>
          )}
          {status === "pending" && (
            <div className="h-16 w-16 rounded-full bg-amber-100 dark:bg-amber-950 border-4 border-amber-200 dark:border-amber-800 flex items-center justify-center text-amber-600">
              <Clock className="h-10 w-10" />
            </div>
          )}
          {status === "error" && (
            <div className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-950 border-4 border-red-200 dark:border-red-800 flex items-center justify-center text-red-600">
              <AlertCircle className="h-10 w-10" />
            </div>
          )}
        </div>

        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
          {status === "loading" && "Processing Bank Consent..."}
          {status === "success" && "Consent Successful!"}
          {status === "pending" && "Consent Pending Approval"}
          {status === "error" && "Consent Declined or Expired"}
        </h2>

        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
          {message}
        </p>

        {leadAppId && status === "success" && (
          <Link
            to={`/leads/${encodeURIComponent(leadAppId)}`}
            className="mb-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 shadow-lg transition text-sm"
          >
            <Building2 className="h-5 w-5" />
            Return to Lead & View Bank Statement
            <ArrowRight className="h-4 w-4" />
          </Link>
        )}

        <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 text-xs text-slate-500 dark:text-slate-400 space-y-1 text-left">
          <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium mb-1">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Secured by RBI Regulated Finvu Account Aggregator
          </div>
          {trackingId && <div>Tracking ID: <span className="font-mono text-slate-700 dark:text-slate-300">{trackingId}</span></div>}
          <div>Environment: <span className="font-semibold text-slate-700 dark:text-slate-300">{typeof window !== 'undefined' && window.location.hostname.includes('payday.waqtmoney.com') ? 'CRIF Orchestrator Production' : 'CRIF Orchestrator UAT'}</span></div>
        </div>
      </div>
    </div>
  );
}
