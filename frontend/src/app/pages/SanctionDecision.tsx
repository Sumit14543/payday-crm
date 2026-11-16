import React, { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

type SanctionDetails = {
  borrower?: string; agreementNumber?: string; principalAmount?: number;
  disbursedAmount?: number; repaymentAmount?: number; dueDate?: string;
};

export function SanctionDecision() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const tenant = searchParams.get("tenant") || "";
  const [title, setTitle] = useState("Loading Sanction...");
  const [statusMessage, setStatusMessage] = useState("Please wait while we check your sanction response.");
  const [isAlreadyDecided, setIsAlreadyDecided] = useState(false);
  const [customerDecision, setCustomerDecision] = useState("");
  const [isDone, setIsDone] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [promptDetails, setPromptDetails] = useState<SanctionDetails | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [reloadCount, setReloadCount] = useState(0);
  const busy = useRef(false);
  const generation = useRef(0);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const apiUrl = '/api/sanction-decision/' + encodeURIComponent(token || '') + (tenant ? '?tenant=' + encodeURIComponent(tenant) : '');

  function recorded(data: any, already: boolean) {
    const accepted = data.customerDecision === "accepted";
    setErrorMessage("");
    setCustomerDecision(data.customerDecision.toUpperCase());
    setIsAlreadyDecided(already);
    setTitle(already ? "Response Already Recorded" : accepted ? "Decision Recorded Successfully" : "Loan Sanction Rejected");
    setStatusMessage('Your decision [' + data.customerDecision.toUpperCase() + '] for Sanction Letter ' + (data.agreementNumber || '') + ' is recorded.' + (data.confirmationEmailSent ? ' A confirmation email has been sent to your inbox.' : ''));
    setPromptDetails(null);
    setIsDone(true);
  }

  const executeDecision = async (decisionAction: string) => {
    if (!token || busy.current) return;
    busy.current = true;
    setIsSubmitting(true);
    setErrorMessage("");
    const current = generation.current;
    try {
      const res = await fetch(apiUrl, {
        method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ action: decisionAction }),
      });
      const data = await res.json().catch(() => null);
      if (current !== generation.current) return;
      if (!res.ok || !data?.success || !["accepted", "rejected"].includes(data.customerDecision)) {
        throw new Error(data?.message || 'We could not confirm your response. Check status before trying again.');
      }
      recorded(data, Boolean(data.alreadyDecided));
      closeTimer.current = setTimeout(() => { try { window.close(); } catch {} }, 5000);
    } catch (error) {
      if (current !== generation.current) return;
      const message = error instanceof Error ? error.message : 'We could not confirm your response. Please check status.';
      setTitle("Response Not Confirmed");
      setStatusMessage(message);
      setErrorMessage(message);
      setIsDone(false);
    } finally {
      if (current === generation.current) { busy.current = false; setIsSubmitting(false); }
    }
  };

  useEffect(() => {
    const current = ++generation.current;
    const abort = new AbortController();
    busy.current = false;
    setIsSubmitting(false);
    setIsDone(false);
    setErrorMessage("");
    setPromptDetails(null);
    setTitle("Loading Sanction...");
    setStatusMessage("Please wait while we check your sanction response.");
    async function init() {
      try {
        if (!token) throw new Error('Invalid sanction link. Please contact your loan officer.');
        // Old ?action= links remain usable, but always require a deliberate click.
        const res = await fetch(apiUrl, { headers: { Accept: "application/json" }, signal: abort.signal });
        const data = await res.json().catch(() => null);
        if (current !== generation.current) return;
        if (!res.ok || !data?.success) throw new Error(data?.message || 'Unable to load sanction. Please try again.');
        if (["accepted", "rejected"].includes(data.customerDecision)) recorded(data, true);
        else if (data.pendingDecision && data.customerDecision === "pending") {
          setPromptDetails(data);
          setTitle("Confirm Loan Sanction");
        } else throw new Error('Unable to confirm the sanction status. Please try again.');
      } catch (error) {
        if (current !== generation.current || abort.signal.aborted) return;
        const message = error instanceof Error ? error.message : 'Unable to load sanction. Please try again.';
        setTitle("Unable to Confirm Sanction"); setStatusMessage(message); setErrorMessage(message); setIsDone(false);
      }
    }
    init();
    return () => { generation.current++; abort.abort(); if (closeTimer.current) clearTimeout(closeTimer.current); };
  }, [token, tenant, reloadCount]);

  // Render interactive prompt card if customer clicked link without action query parameter
  if (promptDetails) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4 font-sans text-slate-800">
        <div className="max-w-md w-full bg-white p-6 sm:p-8 rounded-2xl shadow-xl border border-slate-200">
          <div className="text-center mb-5">
            <span className="inline-block px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold uppercase rounded-full border border-emerald-200 tracking-wider mb-2">
              Action Required
            </span>
            <h1 className="text-xl font-extrabold text-slate-900">Loan Sanction Letter</h1>
            <p className="text-xs text-slate-500 mt-1">Waqt Finance Private Limited</p>
          </div>

          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs space-y-2 mb-6">
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Borrower Name:</span>
              <span className="font-bold text-slate-900">{promptDetails.borrower || "Customer"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 font-medium">Agreement Number:</span>
              <span className="font-mono font-bold text-slate-900">{promptDetails.agreementNumber}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2">
              <span className="text-slate-500 font-medium">Sanction Amount:</span>
              <span className="font-extrabold text-emerald-600 text-sm">
                ₹{Number(promptDetails.principalAmount || 0).toLocaleString("en-IN")}
              </span>
            </div>
            {promptDetails.disbursedAmount ? (
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Net Disbursal:</span>
                <span className="font-semibold text-slate-800">
                  ₹{Number(promptDetails.disbursedAmount).toLocaleString("en-IN")}
                </span>
              </div>
            ) : null}
            {promptDetails.repaymentAmount ? (
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Total Repayment:</span>
                <span className="font-semibold text-slate-800">
                  ₹{Number(promptDetails.repaymentAmount).toLocaleString("en-IN")}
                </span>
              </div>
            ) : null}
          </div>

          <p className="text-xs text-slate-600 text-center font-medium mb-4">
            Please confirm your decision below to record your response into Waqt Finance CRM:
          </p>

          {errorMessage && <p role="alert" className="mb-4 text-xs text-rose-700">{errorMessage}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => executeDecision("accept")}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm py-3 px-4 rounded-xl shadow-md transition disabled:opacity-50 cursor-pointer text-center"
            >
              {isSubmitting ? "Recording..." : "✓ Accept Sanction"}
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => executeDecision("reject")}
              className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm py-3 px-4 rounded-xl shadow-md transition disabled:opacity-50 cursor-pointer text-center"
            >
              {isSubmitting ? "Recording..." : "✕ Reject"}
            </button>
          </div>

          <p className="mt-4 text-[11px] text-slate-400 text-center">
            Your decision is legally binding and recorded directly into the system.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 font-sans text-slate-800 text-center">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-lg border border-slate-200">
        <div className={`text-4xl mb-4 font-bold ${isAlreadyDecided ? "text-amber-500" : customerDecision === "REJECTED" ? "text-rose-600" : "text-emerald-600"}`}>
          {errorMessage ? "!" : isAlreadyDecided ? "🔒" : customerDecision === "REJECTED" ? "✕" : isDone ? "✓" : "…"}
        </div>
        <h1 className={`text-lg font-bold mb-2 ${isAlreadyDecided ? "text-amber-800" : customerDecision === "REJECTED" ? "text-rose-900" : "text-slate-900"}`}>{title}</h1>
        <p className="text-xs text-slate-600 leading-relaxed mb-4">{statusMessage}</p>
        
        {isAlreadyDecided && (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs p-3 rounded-lg mb-4 text-left">
            <p className="font-semibold">Note:</p>
            <p className="mt-0.5 text-[11px]">Sanction decisions are binding once recorded. Further clicks will not alter the recorded status.</p>
          </div>
        )}

        {errorMessage && <button type="button" onClick={() => setReloadCount(value => value + 1)} className="mb-4 rounded-lg bg-slate-800 px-4 py-2 text-sm text-white">Check status / Retry</button>}
        {isDone && <p className="text-[11px] text-slate-400">You may close this browser tab now.</p>}
      </div>
    </div>
  );
}
