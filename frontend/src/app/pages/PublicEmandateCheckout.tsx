import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ShieldCheck, CheckCircle2, AlertCircle, RefreshCw, Lock, Building2, CreditCard, ExternalLink } from "lucide-react";

declare global {
  interface Window {
    Cashfree?: any;
  }
}

type EmandatePublicData = {
  success: boolean;
  applicationId: string;
  customerName: string;
  customerMobile: string;
  customerEmail: string;
  amount: number;
  loanAmount: number;
  mandateMaxAmount: number;
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  authUrl?: string;
  emandateAuthUrl?: string;
  subscriptionId?: string;
  orderId?: string;
  paymentSessionId?: string;
  subscriptionSessionId?: string;
  env?: string;
  status?: string;
  message?: string;
};

export const PublicEmandateCheckout: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<EmandatePublicData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [paymentId, setPaymentId] = useState<string>("");
  const [methodNotice, setMethodNotice] = useState<string | null>(null);

  useEffect(() => {
    // Load Cashfree SDK Script
    let cfScript: HTMLScriptElement | null = document.createElement("script");
    cfScript.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    cfScript.async = true;
    document.body.appendChild(cfScript);

    fetchEmandateDetails();

    return () => {
      if (cfScript && document.body.contains(cfScript)) document.body.removeChild(cfScript);
    };
  }, [id]);

  const fetchEmandateDetails = async () => {
    if (!id) {
      setError("Invalid application ID");
      setLoading(false);
      return;
    }

    try {
      const endpoint = `/api/public/cashfree-emandate-details/${encodeURIComponent(id)}`;
      const response = await fetch(endpoint);
      const result: EmandatePublicData = await response.json();

      if (!response.ok || !result.success) {
        setError(result.message || "Failed to load eMandate registration details");
      } else {
        setData(result);
        if (result.subscriptionId) setPaymentId(result.subscriptionId);
        setIsCompleted(result.status === "ACTIVE");
        if (result.status === "REJECTED" || result.status === "FAILED") {
          setMethodNotice("Previous eMandate authorization failed or was cancelled. Click below to re-authorize.");
        }
      }
    } catch (err: any) {
      setError("Unable to connect to server. Please check your internet connection.");
    } finally {
      setLoading(false);
    }
  };

  const ensureCashfreeSDKLoaded = (): Promise<boolean> => {
    if (window.Cashfree) return Promise.resolve(true);
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
      script.async = true;
      script.onload = () => resolve(!!window.Cashfree);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleOpenPayment = async () => {
    setIsProcessing(true);
    setMethodNotice(null);

    let activeSessionId = data?.subscriptionSessionId || data?.paymentSessionId;
    let targetUrl = data?.authUrl || data?.emandateAuthUrl;

    if ((!activeSessionId || !targetUrl) && id) {
      try {
        const res = await fetch(`/api/public/cashfree-emandate-details/${encodeURIComponent(id)}`);
        const result: EmandatePublicData = await res.json();
        if (result && result.success) {
          setData(result);
          activeSessionId = result.subscriptionSessionId || result.paymentSessionId || activeSessionId;
          targetUrl = result.authUrl || result.emandateAuthUrl || targetUrl;
        }
      } catch (fetchErr) {
        console.warn("Dynamic session fetch error:", fetchErr);
      }
    }

    // 1. Direct redirect if explicit Cashfree external URL is available
    if (targetUrl && (targetUrl.includes('cashfree.com') || targetUrl.includes('http')) && !targetUrl.includes('/emandate/pay/')) {
      window.location.href = targetUrl;
      return;
    }

    // 2. Launch Cashfree SDK checkout with subsSessionId
    const isSDKReady = await ensureCashfreeSDKLoaded();
    if (activeSessionId && isSDKReady && window.Cashfree) {
      try {
        const cashfreeMode = (data?.env || "PROD") === "PROD" ? "production" : "sandbox";
        const cashfree = window.Cashfree({ mode: cashfreeMode });

        if (activeSessionId.startsWith("sub_session_") || activeSessionId.includes("sub_")) {
          cashfree.checkout({
            subsSessionId: activeSessionId,
          });
        } else {
          cashfree.checkout({
            paymentSessionId: activeSessionId,
          });
        }

        setTimeout(() => {
          setIsProcessing(false);
        }, 4000);
        return;
      } catch (err: any) {
        console.warn("Cashfree checkout SDK notice:", err);
      }
    }

    setIsProcessing(false);
    alert("Unable to start Cashfree Gateway. Please refresh the page or click 'Check eMandate Status' to retry.");
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount || 0);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center">
          <RefreshCw className="h-10 w-10 text-sky-600 animate-spin mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-600">Loading Cashfree eMandate Registration Portal...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-6 text-center shadow-lg">
          <AlertCircle className="h-12 w-12 text-rose-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-900 mb-1">Registration Unavailable</h2>
          <p className="text-sm text-slate-600 mb-6">{error}</p>
          <button
            type="button"
            onClick={() => fetchEmandateDetails()}
            className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition cursor-pointer"
          >
            Retry Loading Page
          </button>
        </div>
      </div>
    );
  }

  if (isCompleted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-emerald-200 p-8 text-center shadow-xl">
          <div className="h-16 w-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4 text-emerald-600">
            <CheckCircle2 className="h-10 w-10" />
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 mb-2">eMandate Registered ✓</h2>
          <p className="text-sm text-slate-600 mb-6 leading-relaxed">
            Thank you, <strong className="text-slate-800">{data?.customerName}</strong>! Your Repayment Auto-Debit eMandate via Cashfree for application <strong className="text-slate-800">{data?.applicationId}</strong> has been successfully authorized.
          </p>

          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 text-left text-xs space-y-2 mb-6 font-mono">
            <div className="flex justify-between"><span className="text-slate-500">Application ID:</span><span className="font-bold text-slate-800">{data?.applicationId}</span></div>

            <div className="flex justify-between"><span className="text-slate-500">Status:</span><span className="font-bold text-emerald-700">ACTIVE ✓</span></div>
            {paymentId && <div className="flex justify-between"><span className="text-slate-500">Cashfree Subscription ID:</span><span className="font-bold text-slate-800">{paymentId}</span></div>}
            <div className="flex justify-between"><span className="text-slate-500">Max Auto-Debit Limit:</span><span className="font-bold text-slate-800">{formatCurrency(data?.mandateMaxAmount || 50000)}</span></div>
          </div>

          <p className="text-xs text-slate-400">You may close this window. Your loan processor has been notified.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
      {/* Header Branding */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 bg-sky-700 text-white font-extrabold px-4 py-2 rounded-xl shadow-md text-sm">
          <Building2 className="h-4 w-4" /> Waqt Finance Repayments
        </div>
      </div>

      {/* Main Checkout Card */}
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
        {/* Card Header */}
        <div className="bg-gradient-to-r from-emerald-700 via-teal-800 to-slate-900 p-6 text-white text-center">
          <CreditCard className="h-10 w-10 mx-auto mb-2 text-emerald-200" />
          <h1 className="text-xl font-extrabold">Cashfree eMandate</h1>
          <p className="text-xs text-emerald-100 mt-1">Cashfree Auto-Debit Bank Authorization</p>
        </div>

        {/* Details Content */}
        <div className="p-6 space-y-4">
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80 space-y-2.5 text-xs text-slate-700">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <span className="text-slate-500">Applicant Name</span>
              <span className="font-bold text-slate-900">{data?.customerName}</span>
            </div>
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <span className="text-slate-500">Application Number</span>
              <span className="font-mono font-bold text-emerald-700">{data?.applicationId}</span>
            </div>
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <span className="text-slate-500">Mobile Number</span>
              <span className="font-semibold text-slate-800">{data?.customerMobile}</span>
            </div>
            {Boolean(data?.bankName || data?.accountNumber) && (
              <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                <span className="text-slate-500">Linked Bank Account</span>
                <span className="font-mono font-bold text-slate-900 text-right">
                  {data?.bankName ? `${data.bankName} ` : ''}
                  {data?.accountNumber ? `(${data.accountNumber.length > 4 ? '••••' + data.accountNumber.slice(-4) : data.accountNumber})` : ''}
                </span>
              </div>
            )}

            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <span className="text-slate-500">Max Auto-Debit Limit</span>
              <span className="font-extrabold text-emerald-700">{formatCurrency(data?.mandateMaxAmount || 50000)}</span>
            </div>
            <div className="flex justify-between items-center pt-1 text-slate-500">
              <span>Authorization Fee</span>
              <span className="font-mono font-bold text-emerald-600">₹0.00 (Free)</span>
            </div>
          </div>

          {methodNotice && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 leading-relaxed font-medium">
              <div className="flex items-center gap-1.5 font-bold mb-1 text-amber-800">
                <AlertCircle className="h-4 w-4 text-amber-600" /> Payment Method Notice
              </div>
              {methodNotice}
            </div>
          )}

          <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3.5 text-xs text-emerald-900 leading-relaxed">
            <div className="flex items-center gap-1.5 font-bold mb-1">
              <ShieldCheck className="h-4 w-4 text-emerald-600" /> Supported Payment & AutoPay Methods
            </div>
            Clicking below opens the Cashfree Gateway. You can authorize your Auto-Debit via <strong>Netbanking</strong>, <strong>Debit Card</strong>, or <strong>UPI AutoPay</strong>.
          </div>

          {/* Action Buttons */}
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={handleOpenPayment}
              disabled={isProcessing}
              className="w-full rounded-xl active:scale-98 text-white font-extrabold py-3.5 text-sm shadow-md transition disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer bg-emerald-600 hover:bg-emerald-700"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="h-5 w-5 animate-spin" /> Redirecting to Cashfree Gateway...
                </>
              ) : (
                <>
                  <ExternalLink className="h-4 w-4" /> Proceed to Official Cashfree Gateway
                </>
              )}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-100 p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
          <Lock className="h-3.5 w-3.5 text-slate-400" /> Cashfree Verified & Encrypted
        </div>
      </div>
    </div>
  );
};
