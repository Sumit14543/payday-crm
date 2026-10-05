import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Building2, ShieldCheck, CheckCircle2, ArrowRight } from "lucide-react";

export function AccountAggregatorTestJourney() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const trackingId = searchParams.get("trackingId") || `AA_TRK_${Date.now()}`;
  const digitalFlowRequestId = searchParams.get("digitalFlowRequestId") || `DF_REQ_${Date.now()}`;

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedBank, setSelectedBank] = useState("Finvu Bank Ltd.");
  const [otp, setOtp] = useState("111111");
  const [accountOtp, setAccountOtp] = useState("12345678");

  const handleBankSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStep(2);
  };

  const handleOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStep(3);
  };

  const handleFinalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Redirect to AA callback page
    navigate(`/account-aggregator/callback?trackingId=${encodeURIComponent(trackingId)}&digitalFlowRequestId=${encodeURIComponent(digitalFlowRequestId)}`);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl border border-slate-100 p-8">
        <div className="flex items-center justify-between border-b pb-4 mb-6">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Finvu Account Aggregator</h3>
              <p className="text-[10px] text-slate-500">CRIF Orchestrator UAT Simulator</p>
            </div>
          </div>
          <span className="rounded-full bg-indigo-50 text-indigo-700 px-2.5 py-1 text-[10px] font-bold border border-indigo-200">
            Step {step} of 3
          </span>
        </div>

        {step === 1 && (
          <form onSubmit={handleBankSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">Select Your Primary Bank (FIP)</label>
              <select
                value={selectedBank}
                onChange={(e) => setSelectedBank(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-3 text-xs font-semibold text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
              >
                <option value="Finvu Bank Ltd.">Finvu Bank Ltd. (UAT Sandbox)</option>
                <option value="Dhanagar Finvu Bank Ltd.">Dhanagar Finvu Bank Ltd.</option>
                <option value="HDFC Bank">HDFC Bank</option>
                <option value="ICICI Bank">ICICI Bank</option>
                <option value="State Bank of India">State Bank of India</option>
                <option value="Axis Bank">Axis Bank</option>
              </select>
            </div>

            <div className="rounded-xl bg-indigo-50/60 border border-indigo-100 p-3 text-xs text-indigo-900 leading-relaxed">
              <span className="font-bold">UAT Testing Note:</span> In CRIF UAT environment, select <b>Finvu Bank Ltd.</b> to auto-fetch test transactions.
            </div>

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-3 transition shadow-md"
            >
              <span>Continue to Login OTP</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleOtpSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Enter Finvu AA Login OTP</label>
              <p className="text-[11px] text-slate-500 mb-3">OTP sent to borrower registered mobile number</p>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                maxLength={6}
                className="w-full rounded-xl border border-slate-300 p-3 text-center text-lg font-mono font-bold tracking-widest text-slate-900 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
              <p className="text-[10px] text-indigo-600 font-semibold mt-1">Default UAT Test OTP: 111111</p>
            </div>

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-3 transition shadow-md"
            >
              <span>Verify & Fetch Accounts</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={handleFinalSubmit} className="space-y-4">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
              <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs mb-1">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Account Found: {selectedBank}</span>
              </div>
              <p className="text-xs text-slate-600 font-mono">Account No: XXXXXX4892 (Savings)</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Enter Account Linking OTP</label>
              <input
                type="text"
                value={accountOtp}
                onChange={(e) => setAccountOtp(e.target.value)}
                maxLength={8}
                className="w-full rounded-xl border border-slate-300 p-3 text-center text-lg font-mono font-bold tracking-widest text-slate-900 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
              />
              <p className="text-[10px] text-indigo-600 font-semibold mt-1">Default UAT Test OTP: 12345678</p>
            </div>

            <div className="text-[11px] text-slate-500 leading-relaxed">
              By clicking "Approve Consent", you agree to share 6 months bank statement data with <b>Waqt Finance</b> via CRIF Finvu AA.
            </div>

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-3.5 transition shadow-lg"
            >
              <ShieldCheck className="h-4 w-4" />
              <span>Approve & Share Bank Consent</span>
            </button>
          </form>
        )}

        <div className="mt-6 pt-4 border-t text-center text-[10px] text-slate-400">
          Tracking ID: <span className="font-mono text-slate-600">{trackingId}</span>
        </div>
      </div>
    </div>
  );
}
