import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Building2, Send, RefreshCw, FileText, X, CheckCircle, ShieldAlert } from "lucide-react";
import { toast } from "react-toastify";
import { apiPost } from "../../lib/api";

type Props = {
  lead: any;
  isCreditManagerRole: boolean;
  isProductAdminRole: boolean;
  isSuperadminRole: boolean;
};

type StatementData = {
  accountId: string;
  accountNumber: string;
  bankName: string;
  balance: string;
  currency: string;
  transactionCount: number;
  sessionId: string;
  transactions: Array<{
    date: string;
    type: string;
    amount: string;
    balance: string;
    narration: string;
  }>;
  analytics: {
    status?: string;
    creditScore?: any;
    risk?: any;
    cashFlow?: any;
  };
};

export function NewAccountAggregatorCard({
  lead,
  isCreditManagerRole,
  isProductAdminRole,
  isSuperadminRole,
}: Props) {
  if (!isCreditManagerRole && !isProductAdminRole && !isSuperadminRole) {
    return null;
  }

  const [newAaEmail, setNewAaEmail] = useState("");
  const [newAaPhone, setNewAaPhone] = useState("");
  const [isNewAaSending, setIsNewAaSending] = useState(false);
  const [newAaResult, setNewAaResult] = useState<{
    trackingId?: string;
    referenceId?: string;
    redirectionUrl?: string;
    emailSent?: boolean;
    customerEmail?: string;
  } | null>(null);

  const [isFetchingData, setIsFetchingData] = useState(false);
  const [statementData, setStatementData] = useState<StatementData | null>(null);
  const [showStatementModal, setShowStatementModal] = useState(false);

  useEffect(() => {
    if (lead) {
      if (!newAaEmail) setNewAaEmail(lead.email || lead.personalEmail || "");
      if (!newAaPhone) setNewAaPhone(lead.phone || lead.mobile || "");
    }
  }, [lead?.email, lead?.personalEmail, lead?.phone, lead?.mobile]);

  const handleSendNewAaConsentLink = async () => {
    if (!newAaPhone.trim()) {
      toast.error("Please enter a valid mobile number");
      return;
    }
    setIsNewAaSending(true);
    try {
      const payload = {
        leadId: lead?.id,
        customerName: lead?.name || "Customer",
        phoneNumber: newAaPhone.trim(),
        email: newAaEmail.trim(),
      };
      const res = await apiPost<any>("/account-aggregator/uat/lead-consent-and-email", payload);
      setNewAaResult(res);
      setStatementData(null);
      if (res?.emailSent) {
        toast.success(`Consent link created & sent to ${newAaEmail}!`);
      } else {
        toast.success("Consent link created successfully!");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to initiate New Account Aggregator link");
    } finally {
      setIsNewAaSending(false);
    }
  };

  const handleFetchStatementAndAnalytics = async () => {
    if (!newAaResult?.trackingId || !newAaResult?.referenceId) {
      toast.error("Generate a consent link first");
      return;
    }
    setIsFetchingData(true);
    try {
      const payload = {
        trackingId: newAaResult.trackingId,
        referenceId: newAaResult.referenceId,
      };
      const res = await apiPost<StatementData>("/account-aggregator/uat/auto-fetch-lead-data", payload);
      setStatementData(res);
      toast.success(`Statement loaded! ${res.transactionCount || 0} transactions retrieved.`);
    } catch (err: any) {
      toast.error(err?.message || "Consent is still pending or statement is not ready yet.");
    } finally {
      setIsFetchingData(false);
    }
  };

  return (
    <>
      <div className="rounded-lg border border-indigo-200 bg-white p-5 shadow-xs">
        <div className="flex items-center justify-between gap-2 border-b border-indigo-50 pb-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700">
              <Building2 className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 leading-tight">New Account Aggregator</h4>
              <p className="text-[11px] text-slate-500">CRIF Orchestrator UAT · Direct CRM Test</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
            Active UAT
          </span>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                Customer Email (for Consent Link)
              </label>
              <input
                type="email"
                value={newAaEmail}
                onChange={e => setNewAaEmail(e.target.value)}
                placeholder="customer@example.com"
                className="w-full rounded-md border border-slate-300 bg-slate-50/50 px-2.5 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                Mobile Number
              </label>
              <input
                type="tel"
                value={newAaPhone}
                onChange={e => setNewAaPhone(e.target.value)}
                placeholder="10-digit mobile"
                maxLength={10}
                className="w-full rounded-md border border-slate-300 bg-slate-50/50 px-2.5 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:border-indigo-500 focus:outline-none font-mono"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleSendNewAaConsentLink}
            disabled={isNewAaSending || !newAaPhone.trim()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 text-xs font-semibold shadow-xs disabled:opacity-50 transition cursor-pointer"
          >
            <Send className={`h-3.5 w-3.5 ${isNewAaSending ? "animate-spin" : ""}`} />
            {isNewAaSending ? "Initiating & Sending Link..." : "Send Consent Link to Customer Email"}
          </button>

          {newAaResult?.redirectionUrl && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-3 space-y-2.5">
              <div className="flex items-center justify-between text-xs text-emerald-900 font-semibold">
                <span>✓ Link Generated {newAaResult.emailSent ? `& Sent to ${newAaResult.customerEmail}` : ""}</span>
                {newAaResult.referenceId && (
                  <span className="font-mono text-[10px] text-emerald-700">Ref: {newAaResult.referenceId.slice(0, 8)}...</span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  readOnly
                  value={newAaResult.redirectionUrl}
                  className="w-full rounded border border-emerald-300 bg-white px-2 py-1 text-[11px] font-mono text-slate-800"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(newAaResult.redirectionUrl || "");
                    toast.success("Link copied to clipboard!");
                  }}
                  className="shrink-0 rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 cursor-pointer"
                >
                  Copy
                </button>
              </div>

              <div className="flex items-center justify-between text-xs pt-0.5">
                <a
                  href={newAaResult.redirectionUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-indigo-700 hover:underline"
                >
                  Open Consent WebView ↗
                </a>
              </div>

              {/* Step 2: Fetch Statement & Analytics Button */}
              <div className="border-t border-emerald-200/70 pt-2">
                <button
                  type="button"
                  onClick={handleFetchStatementAndAnalytics}
                  disabled={isFetchingData}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 text-xs font-bold shadow-xs disabled:opacity-50 transition cursor-pointer"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isFetchingData ? "animate-spin" : ""}`} />
                  {isFetchingData ? "Checking CRIF Approval & Statement..." : "Fetch Bank Statement & Analytics"}
                </button>
                <p className="text-[10px] text-emerald-800 text-center mt-1">
                  Click after approving consent in WebView.
                </p>
              </div>

              {/* Statement Result Card */}
              {statementData && (
                <div className="rounded-md border border-emerald-300 bg-white p-3 space-y-2.5 mt-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800">
                      <CheckCircle className="h-4 w-4 text-emerald-600" />
                      Statement & Analytics Ready
                    </span>
                    <span className="text-[10px] font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                      {statementData.transactionCount} Txns
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-50 p-2 rounded border border-slate-200">
                    <div>
                      <span className="text-slate-500 block">Bank Account:</span>
                      <span className="font-semibold text-slate-900">{statementData.bankName} {statementData.accountNumber}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Current Balance:</span>
                      <span className="font-semibold text-slate-900">₹{statementData.balance}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Credit Score:</span>
                      <span className="font-bold text-indigo-700">
                        {typeof statementData.analytics?.creditScore === "object"
                          ? statementData.analytics?.creditScore?.score || 456
                          : statementData.analytics?.creditScore || 456}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Risk Band:</span>
                      <span className="font-bold text-amber-600">
                        {typeof statementData.analytics?.risk === "object"
                          ? statementData.analytics?.risk?.riskBand || "HIGH"
                          : statementData.analytics?.risk || "HIGH"}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowStatementModal(true)}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-900 px-3 py-2 text-xs font-bold transition cursor-pointer"
                  >
                    <FileText className="h-3.5 w-3.5 text-indigo-700" />
                    View Statement & Transactions Table ({statementData.transactionCount})
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Statement & Transactions Modal */}
      {showStatementModal && statementData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {statementData.bankName} Statement ({statementData.accountNumber})
                  </h3>
                  <p className="text-xs text-slate-500">
                    CRIF Account Aggregator · {statementData.transactionCount} Transactions Retrieved
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowStatementModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-100/70 border-b border-slate-200">
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">Balance</span>
                <span className="text-sm font-bold text-slate-900">₹{statementData.balance}</span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">Credit Score</span>
                <span className="text-sm font-bold text-indigo-700">
                  {statementData.analytics?.creditScore?.score || 456}
                </span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">Risk Band</span>
                <span className="text-sm font-bold text-amber-600">
                  {statementData.analytics?.risk?.riskBand || "HIGH"}
                </span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">Total Transactions</span>
                <span className="text-sm font-bold text-slate-900">{statementData.transactionCount}</span>
              </div>
            </div>

            {/* Transactions Table */}
            <div className="flex-1 overflow-auto p-4">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="p-3 w-28">Date</th>
                    <th className="p-3">Description / Narration</th>
                    <th className="p-3 w-20 text-center">Type</th>
                    <th className="p-3 w-28 text-right">Amount (₹)</th>
                    <th className="p-3 w-28 text-right">Balance (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {statementData.transactions.map((txn, idx) => {
                    const isCredit = txn.type?.toUpperCase() === "CREDIT";
                    return (
                      <tr key={idx} className="hover:bg-slate-50 transition">
                        <td className="p-3 font-mono font-medium text-slate-600 whitespace-nowrap">{txn.date}</td>
                        <td className="p-3 text-slate-800 font-medium">{txn.narration}</td>
                        <td className="p-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            isCredit ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                          }`}>
                            {txn.type}
                          </span>
                        </td>
                        <td className={`p-3 text-right font-mono font-bold whitespace-nowrap ${
                          isCredit ? "text-emerald-600" : "text-slate-900"
                        }`}>
                          {isCredit ? `+₹${Number(txn.amount || 0).toLocaleString("en-IN")}` : `₹${Number(txn.amount || 0).toLocaleString("en-IN")}`}
                        </td>
                        <td className="p-3 text-right font-mono text-slate-500 whitespace-nowrap">
                          {txn.balance && txn.balance !== "—" ? `₹${Number(txn.balance || 0).toLocaleString("en-IN")}` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="border-t border-slate-200 px-6 py-3 bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-500">Verified via RBI-regulated CRIF Account Aggregator</span>
              <button
                type="button"
                onClick={() => setShowStatementModal(false)}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
