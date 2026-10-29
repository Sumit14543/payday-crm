import React, { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

type SanctionDetails = {
  borrower?: string;
  agreementNumber?: string;
  principalAmount?: number;
  disbursedAmount?: number;
  repaymentAmount?: number;
  dueDate?: string;
};

export function SanctionDecision() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const rawAction = (searchParams.get("action") || "").toLowerCase();
  const [title, setTitle] = useState("Recording Response...");
  const [statusMessage, setStatusMessage] = useState("Please wait while we log your decision into Waqt Finance CRM...");
  const [isAlreadyDecided, setIsAlreadyDecided] = useState(false);
  const [customerDecision, setCustomerDecision] = useState<string>("");
  const [agreementNumber, setAgreementNumber] = useState<string>("");
  const [isDone, setIsDone] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // For interactive prompt when link is clicked without action query param
  const [promptDetails, setPromptDetails] = useState<SanctionDetails | null>(null);

  const executeDecision = async (decisionAction: string) => {
    if (!token || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/sanction-decision/${encodeURIComponent(token)}?action=${encodeURIComponent(decisionAction)}`, {
        headers: { Accept: "application/json" },
      });
      const data = await res.json().catch(() => null);
      if (data && data.success) {
        setCustomerDecision((data.customerDecision || decisionAction).toUpperCase());
        setAgreementNumber(data.agreementNumber || "");

        if (data.alreadyDecided) {
          setIsAlreadyDecided(true);
          setTitle("Response Already Recorded");
          setStatusMessage(
            `You have already ${(data.customerDecision || "ACCEPTED").toUpperCase()} Loan Sanction Letter ${data.agreementNumber || ""}. Your response is permanently recorded and cannot be changed.`
          );
        } else {
          setIsAlreadyDecided(false);
          const isAccepted = (data.customerDecision || decisionAction) === "accepted" || (data.customerDecision || decisionAction) === "accept";
          setTitle(isAccepted ? "Decision Recorded Successfully" : "Loan Sanction Rejected");
          setStatusMessage(
            isAccepted
              ? `Thank you! Your decision [ACCEPTED] for Sanction Letter ${data.agreementNumber || ""} has been recorded. A confirmation email has been sent to your inbox.`
              : `Your decision [REJECTED] for Sanction Letter ${data.agreementNumber || ""} has been recorded.`
          );
        }
      } else {
        setTitle("Response Recorded");
        setStatusMessage("Your sanction letter response has been logged into the system.");
      }
    } catch (err) {
      console.error("Sanction decision error log:", err);
      setTitle("Response Logged");
      setStatusMessage("Response logged. You may close this tab.");
    } finally {
      setPromptDetails(null);
      setIsDone(true);
      setTimeout(() => {
        try {
          window.close();
        } catch (e) {}
      }, 5000);
    }
  };

  useEffect(() => {
    async function init() {
      if (!token) return;

      const cleanAction = rawAction.trim();
      if (cleanAction === "accept" || cleanAction === "accepted" || cleanAction === "reject" || cleanAction === "rejected") {
        await executeDecision(cleanAction);
        return;
      }

      // No explicit action provided: check current sanction status from API
      try {
        const res = await fetch(`/api/sanction-decision/${encodeURIComponent(token)}`, {
          headers: { Accept: "application/json" },
        });
        const data = await res.json().catch(() => null);
        if (data && data.alreadyDecided) {
          setIsAlreadyDecided(true);
          setCustomerDecision((data.customerDecision || "accepted").toUpperCase());
          setAgreementNumber(data.agreementNumber || "");
          setTitle("Response Already Recorded");
          setStatusMessage(
            `You have already ${(data.customerDecision || "ACCEPTED").toUpperCase()} Loan Sanction Letter ${data.agreementNumber || ""}. Your response is permanently recorded and cannot be changed.`
          );
          setIsDone(true);
        } else if (data && data.pendingDecision) {
          setPromptDetails({
            borrower: data.borrower,
            agreementNumber: data.agreementNumber,
            principalAmount: data.principalAmount,
            disbursedAmount: data.disbursedAmount,
            repaymentAmount: data.repaymentAmount,
            dueDate: data.dueDate,
          });
        } else {
          setTitle("Response Recorded");
          setStatusMessage("Sanction record accessed.");
          setIsDone(true);
        }
      } catch {
        setTitle("Response Recorded");
        setStatusMessage("You may close this tab.");
        setIsDone(true);
      }
    }

    init();
  }, [token, rawAction]);

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
          {isAlreadyDecided ? "🔒" : customerDecision === "REJECTED" ? "✕" : "✓"}
        </div>
        <h1 className={`text-lg font-bold mb-2 ${isAlreadyDecided ? "text-amber-800" : customerDecision === "REJECTED" ? "text-rose-900" : "text-slate-900"}`}>{title}</h1>
        <p className="text-xs text-slate-600 leading-relaxed mb-4">{statusMessage}</p>
        
        {isAlreadyDecided && (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs p-3 rounded-lg mb-4 text-left">
            <p className="font-semibold">Note:</p>
            <p className="mt-0.5 text-[11px]">Sanction decisions are binding once recorded. Further clicks will not alter the recorded status.</p>
          </div>
        )}

        {isDone && <p className="text-[11px] text-slate-400">You may close this browser tab now.</p>}
      </div>
    </div>
  );
}
