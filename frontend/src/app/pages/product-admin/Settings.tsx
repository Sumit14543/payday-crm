import React, { useState } from "react";
import { motion } from "motion/react";
import {
  Settings as SettingsIcon,
  Sliders,
  Webhook,
  MessageSquare,
  Sparkles,
  ShieldCheck,
  CheckCircle,
  HelpCircle
} from "lucide-react";
import { getTenantBranding } from "../../lib/tenant";

export function Settings() {
  const branding = getTenantBranding();
  const [activeSubTab, setActiveSubTab] = useState("general");
  const [interestRate, setInterestRate] = useState("12.5%");
  const [penaltyRate, setPenaltyRate] = useState("₹250");
  const [webhookUrl, setWebhookUrl] = useState(`https://api.${branding.slug}.com/webhook/disburse`);
  const [isSaved, setIsSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const subTabs = [
    { id: "general", label: "Workspace Settings", icon: Sliders },
    { id: "loan", label: "Loan & EMI Parameters", icon: SettingsIcon },
    { id: "webhook", label: "Webhooks & API Keys", icon: Webhook },
    { id: "notifications", label: "SMS & Alert Gateways", icon: MessageSquare }
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      
      {/* Title */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">CRM Configurations Console</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-bold mt-1.5">Configure default interest rates, penalty rules, API webhooks, and routing workflows.</p>
        </div>
      </div>

      {/* Settings Panel Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        
        {/* Left Side Sub-tabs */}
        <div className="md:col-span-1 space-y-1">
          {subTabs.map((tab) => {
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold text-left transition-all ${
                  isActive
                    ? "bg-gradient-to-r from-violet-650 to-indigo-650 text-white shadow-md shadow-indigo-500/10"
                    : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/40 hover:text-slate-800 dark:hover:text-slate-202"
                }`}
              >
                <tab.icon className="w-4 h-4 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right Side Settings Form */}
        <div className="md:col-span-3 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-3xl p-6 shadow-sm">
          
          <form onSubmit={handleSave} className="space-y-6">
            
            {activeSubTab === "general" && (
              <div className="space-y-6">
                {/* Profile Avatar Card */}
                <div className="p-4 rounded-2xl bg-gradient-to-r from-violet-500/10 via-indigo-500/5 to-transparent border border-indigo-500/20 dark:border-indigo-500/30 flex flex-col sm:flex-row items-center gap-4">
                  <div className="relative w-20 h-20 rounded-2xl overflow-hidden ring-4 ring-white dark:ring-slate-900 shadow-xl shadow-indigo-500/20 shrink-0">
                    <img
                      src="/product-admin-avatar.jpg"
                      alt="Product Admin Profile"
                      className="w-full h-full object-cover object-top"
                    />
                    <span className="absolute bottom-1 right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
                  </div>
                  <div className="flex-1 text-center sm:text-left space-y-1">
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                      <h2 className="text-base font-black text-slate-900 dark:text-white">Bhupender Singh</h2>
                      <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30">
                        Admin
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Chief Operations Head & Lead Credit Architect</p>
                    <div className="flex flex-wrap justify-center sm:justify-start gap-3 pt-1 text-[10.5px] text-slate-400 font-bold">
                      <span>ID: WAQT-ADMIN-01</span>
                      <span>•</span>
                      <span>Access Level: Full Control</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider mb-3">Workspace Preferences</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Tenant Name</label>
                      <input
                        type="text"
                        className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs font-semibold outline-none focus:border-indigo-500 transition text-slate-800 dark:text-white"
                        defaultValue={branding.name}
                        disabled
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Base Currency</label>
                      <input
                        type="text"
                        className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs font-semibold outline-none focus:border-indigo-500 transition text-slate-800 dark:text-white"
                        defaultValue="INR (₹)"
                        disabled
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSubTab === "loan" && (
              <div className="space-y-4">
                <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider mb-3">Loan & EMI Parameters</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Default Annual Interest Rate</label>
                    <input
                      type="text"
                      className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs font-bold outline-none focus:border-indigo-500 transition text-slate-800 dark:text-white"
                      value={interestRate}
                      onChange={(e) => setInterestRate(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Bounce Penalty Fee</label>
                    <input
                      type="text"
                      className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs font-bold outline-none focus:border-indigo-505 transition text-slate-800 dark:text-white"
                      value={penaltyRate}
                      onChange={(e) => setPenaltyRate(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {activeSubTab === "webhook" && (
              <div className="space-y-4">
                <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider mb-3">API Integrations</h3>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Webhook Endpoint URL</label>
                  <input
                    type="url"
                    className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs font-bold outline-none focus:border-indigo-500 transition text-slate-800 dark:text-white"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Master Sandbox Key</label>
                  <input
                    type="password"
                    className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs font-bold outline-none focus:border-indigo-505 transition text-slate-800 dark:text-white"
                    defaultValue="••••••••••••••••••••••••"
                    disabled
                  />
                </div>
              </div>
            )}

            {activeSubTab === "notifications" && (
              <div className="space-y-4">
                <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider mb-3">Notification Provider Settings</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">WhatsApp Template</label>
                    <input
                      type="text"
                      className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs font-bold outline-none focus:border-indigo-505 transition text-slate-800 dark:text-white"
                      defaultValue="document_upload_link"
                      disabled
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">SMS Gateway</label>
                    <input
                      type="text"
                      className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs font-bold outline-none focus:border-indigo-505 transition text-slate-800 dark:text-white"
                      defaultValue="Authkey SMS"
                      disabled
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Save Button */}
            <div className="border-t border-slate-100 dark:border-slate-800 pt-4 flex items-center justify-between">
              {isSaved ? (
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle className="w-4 h-4" />
                  <span>Settings saved successfully!</span>
                </div>
              ) : <div />}
              
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center px-6 rounded-xl bg-indigo-650 text-white text-xs font-bold hover:bg-indigo-550 transition cursor-pointer"
              >
                Save Configurations
              </button>
            </div>

          </form>

        </div>

      </div>

    </motion.div>
  );
}
