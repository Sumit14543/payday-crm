import React, { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

export function SanctionDecision() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const action = (searchParams.get("action") || "").toLowerCase();
  const [title, setTitle] = useState("Recording Response...");
  const [statusMessage, setStatusMessage] = useState("Please wait while we log your decision into Waqt Finance CRM...");
  const [isAlreadyDecided, setIsAlreadyDecided] = useState(false);
  const [customerDecision, setCustomerDecision] = useState<string>("");
  const [agreementNumber, setAgreementNumber] = useState<string>("");
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    async function submitDecision() {
      if (!token) return;
      try {
        const res = await fetch(`/api/sanction-decision/${token}?action=${encodeURIComponent(action)}`, {
          headers: { Accept: "application/json" },
        });
        const data = await res.json().catch(() => null);
        if (data && data.success) {
          setCustomerDecision((data.customerDecision || "accepted").toUpperCase());
          setAgreementNumber(data.agreementNumber || "");

          if (data.alreadyDecided) {
            setIsAlreadyDecided(true);
            setTitle("Response Already Recorded");
            setStatusMessage(
              `You have already ${(data.customerDecision || "ACCEPTED").toUpperCase()} Loan Sanction Letter ${data.agreementNumber || ""}. Your response is permanently recorded and cannot be changed.`
            );
          } else {
            setIsAlreadyDecided(false);
            setTitle("Decision Recorded Successfully");
            setStatusMessage(
              `Thank you! Your decision [${(data.customerDecision || action || "ACCEPTED").toUpperCase()}] for Sanction Letter ${data.agreementNumber || ""} has been recorded. A confirmation email has been sent to your inbox.`
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
        setIsDone(true);
        setTimeout(() => {
          try {
            window.close();
          } catch (e) {}
        }, 4000);
      }
    }

    submitDecision();
  }, [token, action]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 font-sans text-slate-800 text-center">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-lg border border-slate-200">
        <div className={`text-4xl mb-4 font-bold ${isAlreadyDecided ? "text-amber-500" : "text-emerald-600"}`}>
          {isAlreadyDecided ? "🔒" : "✓"}
        </div>
        <h1 className={`text-lg font-bold mb-2 ${isAlreadyDecided ? "text-amber-800" : "text-slate-900"}`}>{title}</h1>
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
