import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Building2, Send } from "lucide-react";
import { toast } from "react-toastify";
import { apiPost } from "../../lib/api";

type Props = {
  lead: any;
  isCreditManagerRole: boolean;
  isProductAdminRole: boolean;
  isSuperadminRole: boolean;
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

  return (
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
          <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-3 space-y-2">
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
            <div className="flex items-center justify-between pt-1 text-xs">
              <a
                href={newAaResult.redirectionUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-indigo-700 hover:underline"
              >
                Open WebView ↗
              </a>
              <Link
                to={`/credit-manager/aa-test?trackingId=${encodeURIComponent(newAaResult.trackingId || "")}&referenceId=${encodeURIComponent(newAaResult.referenceId || "")}&mobile=${encodeURIComponent(newAaPhone || "")}`}
                target="_blank"
                className="inline-flex items-center gap-1 font-semibold text-emerald-800 hover:underline"
              >
                Open in AA Test Suite ↗
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
