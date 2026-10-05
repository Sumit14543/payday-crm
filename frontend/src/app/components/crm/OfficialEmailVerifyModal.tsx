import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Mail, CheckCircle2, AlertCircle, RefreshCw, Lock } from "lucide-react";
import { apiPost } from "../../lib/api";

interface OfficialEmailVerifyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId: string;
  maskedEmail?: string;
  onVerifiedSuccess: (data: { officialEmailVerifiedAt: string; officialEmailVerifiedBy: string }) => void;
}

export function OfficialEmailVerifyModal({
  open,
  onOpenChange,
  applicationId,
  maskedEmail = "",
  onVerifiedSuccess,
}: OfficialEmailVerifyModalProps) {
  const [otp, setOtp] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [currentMaskedEmail, setCurrentMaskedEmail] = useState(maskedEmail);
  const [cooldown, setCooldown] = useState(60);

  useEffect(() => {
    if (maskedEmail) {
      setCurrentMaskedEmail(maskedEmail);
    }
  }, [maskedEmail]);

  useEffect(() => {
    if (!open) {
      setOtp("");
      setError(null);
      setSuccess(null);
    } else {
      setCooldown(60);
    }
  }, [open]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleOtpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, "").slice(0, 6);
    setOtp(val);
    if (error) setError(null);
  };

  const handleVerify = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (otp.length !== 6) {
      setError("Please enter the full 6-digit OTP code.");
      return;
    }

    setIsVerifying(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await apiPost<{
        success: boolean;
        message: string;
        officialEmailVerifiedAt: string;
        officialEmailVerifiedBy: string;
      }>("/credit/official-email/verify-otp", {
        applicationId,
        otp,
      });

      if (res.success) {
        setSuccess(res.message || "Official Email verified successfully!");
        onVerifiedSuccess({
          officialEmailVerifiedAt: res.officialEmailVerifiedAt,
          officialEmailVerifiedBy: res.officialEmailVerifiedBy,
        });
        setTimeout(() => {
          onOpenChange(false);
        }, 1200);
      } else {
        setError(res.message || "Failed to verify OTP.");
      }
    } catch (err: any) {
      const msg = err.message || "Verification failed. Please check the OTP and try again.";
      setError(msg);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || isResending) return;

    setIsResending(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await apiPost<{
        success: boolean;
        message: string;
        maskedEmail: string;
        resendCooldownSeconds: number;
      }>("/credit/official-email/resend-otp", {
        applicationId,
      });

      if (res.success) {
        if (res.maskedEmail) setCurrentMaskedEmail(res.maskedEmail);
        setCooldown(res.resendCooldownSeconds || 60);
        setSuccess("A new OTP code has been sent to the official email.");
        setOtp("");
      } else {
        setError(res.message || "Failed to resend OTP.");
      }
    } catch (err: any) {
      setError(err.message || "Unable to resend OTP. Please try again.");
    } finally {
      setIsResending(false);
    }
  };

  const [domainAnalysis, setDomainAnalysis] = useState<{
    domain: string;
    isCorporateDomain: boolean;
    isFreeEmail: boolean;
    isDisposable: boolean;
    hasMxRecords: boolean;
    primaryMx: string | null;
    qualityScore: number;
    riskLevel: string;
    recommendation: string;
  } | null>(null);
  const [isAnalyzingDomain, setIsAnalyzingDomain] = useState(false);

  useEffect(() => {
    if (open && applicationId) {
      setIsAnalyzingDomain(true);

      const runCheck = async () => {
        const endpoints = [
          "/credit/official-email/check-domain",
          "/leads/official-email/check-domain",
          "/official-email/check-domain",
        ];
        for (const endpoint of endpoints) {
          try {
            const res = await apiPost<any>(endpoint, { applicationId });
            const payload = res?.data || res;
            if (payload && payload.domain) {
              setDomainAnalysis(payload);
              break;
            }
          } catch {}
        }
        setIsAnalyzingDomain(false);
      };

      runCheck();
    }
  }, [open, applicationId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md w-[calc(100%-2rem)] max-h-[85vh] overflow-y-auto bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 gap-0">
        <DialogHeader className="text-center sm:text-left">
          <div className="mx-auto sm:mx-0 flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 mb-2 border border-blue-100 dark:border-blue-900/50">
            <Mail className="h-5 w-5" />
          </div>
          <DialogTitle className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Verify Official Email
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Send an optional One-Time Password (OTP) to verify customer mailbox access.
          </DialogDescription>
        </DialogHeader>

        {currentMaskedEmail && (
          <div className="rounded-xl border border-blue-100 dark:border-blue-900/60 bg-blue-50/70 dark:bg-blue-950/40 p-3 text-center sm:text-left my-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-blue-900 dark:text-blue-300 uppercase tracking-wider">
                OTP sent to:
              </p>
              {domainAnalysis && (
                <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md ${
                  domainAnalysis.isCorporateDomain ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-800' :
                  domainAnalysis.isFreeEmail ? 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-800' :
                  'bg-red-100 text-red-800 border border-red-300 dark:bg-red-950/80 dark:text-red-300 dark:border-red-800'
                }`}>
                  {domainAnalysis.isCorporateDomain ? '🏢 Corporate' : domainAnalysis.isFreeEmail ? '⚠️ Personal' : '🚨 Disposable'}
                </span>
              )}
            </div>
            <p className="text-xs font-bold text-blue-700 dark:text-blue-400 font-mono break-all">
              {currentMaskedEmail}
            </p>

            {/* DNS & Domain Analysis Result in Modal */}
            {isAnalyzingDomain && (
              <p className="text-[10px] text-blue-600 dark:text-blue-400 animate-pulse font-medium">Checking DNS MX records & Domain age...</p>
            )}
            {domainAnalysis && !isAnalyzingDomain && (
              <div className="pt-1.5 border-t border-blue-200/60 dark:border-blue-900/60 text-[10.5px] space-y-0.5 text-slate-700 dark:text-slate-300">
                <div className="flex items-center justify-between">
                  <span>DNS MX Status:</span>
                  <span className={`font-bold ${domainAnalysis.hasMxRecords ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {domainAnalysis.hasMxRecords ? `✓ Valid MX (${domainAnalysis.primaryMx || 'Active'})` : '✕ No MX Records'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Domain Quality Score:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{domainAnalysis.qualityScore}/100 ({domainAnalysis.riskLevel} Risk)</span>
                </div>
                <p className="text-[9.5px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 p-1.5 rounded border border-amber-200 dark:border-amber-900/60 font-medium">
                  💡 {domainAnalysis.recommendation}
                </p>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleVerify} className="space-y-3 mt-2.5 mb-0">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              Enter 6-Digit OTP
            </label>
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={otp}
                onChange={handleOtpChange}
                placeholder="• • • • • •"
                className="w-full text-center text-xl font-extrabold tracking-[0.4em] font-mono py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/50 transition outline-none text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800/80 focus:bg-white dark:focus:bg-slate-800"
                autoFocus
              />
              <Lock className="absolute right-3 top-3 h-4 w-4 text-slate-400 dark:text-slate-500 pointer-events-none" />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 p-2.5 text-xs text-red-700 dark:text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-start gap-2 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/40 p-2.5 text-xs text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          <div className="pt-1 flex flex-col gap-2">
            <button
              type="submit"
              disabled={isVerifying || otp.length !== 6}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isVerifying ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Verifying OTP...
                </>
              ) : (
                "Verify OTP"
              )}
            </button>

            <div className="text-center pt-1.5 border-t border-slate-100 dark:border-slate-800">
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">Didn't receive OTP?</p>
              <button
                type="button"
                onClick={handleResend}
                disabled={cooldown > 0 || isResending}
                className="inline-flex items-center gap-1.5 text-[11px] font-bold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 disabled:text-slate-400 dark:disabled:text-slate-600 disabled:cursor-not-allowed transition"
              >
                {isResending ? (
                  <>
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    Resending OTP...
                  </>
                ) : cooldown > 0 ? (
                  `Resend OTP (${cooldown}s)`
                ) : (
                  "Resend OTP"
                )}
              </button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
