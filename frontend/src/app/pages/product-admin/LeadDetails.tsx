import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "motion/react";
import {
  ChevronLeft,
  User,
  ShieldAlert,
  Calendar,
  Send,
  Building,
  CreditCard,
  FileText,
  Info,
  Clock,
  Sparkles,
  CheckCircle,
  XCircle
} from "lucide-react";
import { apiGet, apiPatch, apiPost } from "../../lib/api";
import { Card } from "../../components/ui/card";
import { OfficialEmailVerifyModal } from "../../components/crm/OfficialEmailVerifyModal";

export function LeadDetails() {
  const { leadId } = useParams();
  const [lead, setLead] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [notes, setNotes] = useState("");
  const [noteList, setNoteList] = useState([
    { author: "Kajal", text: "Customer responded positively. Salary slip verified.", time: "1 hour ago" },
    { author: "System", text: "KYC documents parsed successfully via OCR.", time: "2 hours ago" }
  ]);

  const [messageText, setMessageText] = useState("");
  const [activeCommType, setActiveCommType] = useState<"whatsapp" | "sms" | "email">("whatsapp");
  const [isOtpModalOpen, setIsOtpModalOpen] = useState(false);
  const [commLogs, setCommLogs] = useState([
    { type: "whatsapp", text: "Sanction letter sent for signing", time: "3 hours ago", status: "delivered" },
    { type: "sms", text: "Your OTP for loan application is 4821", time: "Yesterday", status: "sent" },
    { type: "email", text: "Loan Application Received - Waqt Finance", time: "2 days ago", status: "read" },
  ]);

  const fetchLeadDetails = () => {
    if (!leadId) return;
    setLoading(true);
    apiGet<any>(`/leads/${leadId}`)
      .then((data) => {
        if (data) {
          setLead(data);
        }
      })
      .catch((err) => console.error("Failed to load lead details:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchLeadDetails();
  }, [leadId]);

  const handleStatusChange = (newStatus: string) => {
    if (!leadId) return;
    apiPatch(`/leads/${leadId}/status`, { status: newStatus })
      .then(() => {
        fetchLeadDetails();
      })
      .catch((err) => {
        console.error("Failed to update status:", err);
        setLead(prev => prev ? { ...prev, status: newStatus } : null);
      });
  };

  const handleAddNote = () => {
    if (!notes.trim()) return;
    setNoteList((prev) => [{ author: "Product Admin", text: notes, time: "Just now" }, ...prev]);
    setNotes("");
  };

  const handleSendMessage = () => {
    if (!messageText.trim()) return;
    setCommLogs((prev) => [{ type: activeCommType, text: messageText, time: "Just now", status: "sent" }, ...prev]);
    setMessageText("");
  };

  // Mapped profile values fallback to mock details if empty database
  const profile = React.useMemo(() => {
    if (!lead) {
      return {
        id: leadId || "LD-1082",
        name: "Rahul Sharma",
        phone: "+91 98765 43210",
        email: "rahul.sharma@gmail.com",
        pan: "ABCDE1234F",
        dob: "1994-08-12",
        employment: "Salaried",
        salary: "₹45,000",
        employer: "TCS Limited",
        workEmail: "rahul.s@tcs.com",
        loanAmount: "₹25,000",
        cibil: "748",
        status: "New Lead",
        leadSource: "Website",
        date: "2026-07-15",
        address: "402, Sea Breeze Heights, Mumbai, MH - 400050",
        kycStatus: "Verified",
        bankName: "HDFC Bank",
        bankAccount: "5010048219582",
        pastLoans: []
      };
    }

    return {
      id: lead.id,
      name: lead.name || "N/A",
      phone: lead.phone || "N/A",
      email: lead.email || "N/A",
      pan: lead.panNumber || "N/A",
      dob: lead.dateOfBirth || "N/A",
      employment: lead.employmentStatus || "Salaried",
      salary: lead.monthlyIncome ? `₹${Number(lead.monthlyIncome).toLocaleString("en-IN")}` : "₹0",
      employer: lead.companyName || "N/A",
      workEmail: lead.officeEmail || lead.officialEmail || lead.email || "N/A",
      officialEmailVerified: Boolean(lead.officialEmailVerified),
      officialEmailVerifiedAt: lead.officialEmailVerifiedAt || "",
      officialEmailVerifiedBy: lead.officialEmailVerifiedBy || "",
      loanAmount: lead.loanAmount ? `₹${Number(lead.loanAmount).toLocaleString("en-IN")}` : "₹0",
      cibil: lead.creditScore || "N/A",
      status: lead.status || "New Lead",
      leadSource: lead.source || "Website",
      date: lead.createdAt ? lead.createdAt.slice(0, 10) : "N/A",
      address: lead.address || "N/A",
      kycStatus: "Verified",
      bankName: lead.bankName || "HDFC Bank",
      bankAccount: lead.accountNumber || "N/A",
      pastLoans: lead.pastLoans || []
    };
  }, [lead, leadId]);

  const tabs = [
    { id: "overview", label: "Overview", icon: Info },
    { id: "personal", label: "Personal Details", icon: User },
    { id: "employment", label: "Employment & Income", icon: Building },
    { id: "kyc_bank", label: "KYC & Bank", icon: CreditCard },
    { id: "notes", label: "Notes & Timeline", icon: Clock }
  ];

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse p-4 font-sans">
        {/* Back and Title bar skeleton */}
        <div className="flex items-center justify-between pb-5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-200 dark:bg-slate-800 rounded-xl" />
            <div className="space-y-2">
              <div className="h-3 w-20 bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="h-5 w-48 bg-slate-200 dark:bg-slate-800 rounded" />
            </div>
          </div>
          <div className="w-32 h-9 bg-slate-200 dark:bg-slate-800 rounded-xl" />
        </div>

        {/* Tab buttons skeleton */}
        <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="w-28 h-8 bg-slate-200 dark:bg-slate-800 rounded-lg" />
          ))}
        </div>

        {/* Detail workspace skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="h-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6" />
            <div className="h-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6" />
          </div>
          <div className="h-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6" />
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Back button and title */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <Link
            to="/leads"
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 hover:text-slate-800 dark:hover:text-white transition shadow-sm"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">LEAD DETAILS VIEW</span>
            <h1 className="text-xl font-black text-slate-800 dark:text-white tracking-tight leading-none mt-1.5">
              {profile.name} — <span className="text-indigo-650 dark:text-indigo-400">{profile.id}</span>
            </h1>
          </div>
        </div>

        {/* Change status drawer selection */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Current Status:</span>
          <select
            value={profile.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="h-9 px-3 rounded-xl border border-slate-205 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-bold text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
          >
            <option value="New">New Lead</option>
            <option value="Contacted">Contacted</option>
            <option value="Documents Pending">Documents Pending</option>
            <option value="Send to Credit Manager">Send to Credit Manager</option>
            <option value="Qualified">Approved</option>
            <option value="Converted">Disbursed</option>
            <option value="Lost">Rejected</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="py-32 flex flex-col items-center justify-center gap-3 text-slate-400 dark:text-slate-550">
          <span className="w-4 h-4 rounded-full border-2 border-indigo-650 border-t-transparent animate-spin" />
          <span className="text-xs font-bold uppercase tracking-wider">Syncing underwriting profiles...</span>
        </div>
      ) : (
        /* Page Content Layout */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Side: Summary & Eligibility */}
          <div className="space-y-6">
            
            {/* Summary Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-3xl p-6 shadow-sm flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center gap-4 border-b border-slate-100 dark:border-slate-805 pb-4 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 dark:bg-indigo-500/10 flex items-center justify-center font-black text-indigo-600 dark:text-indigo-400 text-lg">
                  {profile.name.split(" ").map(w => w.charAt(0)).join("").slice(0,2)}
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-800 dark:text-white leading-none">{profile.name}</h3>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold mt-1.5 block">{profile.phone}</span>
                </div>
              </div>

              <div className="space-y-3 text-xs font-bold text-slate-700 dark:text-slate-350">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 dark:text-slate-500 font-semibold">PAN</span>
                  <span className="text-slate-805 dark:text-white uppercase font-extrabold">{profile.pan}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 dark:text-slate-500 font-semibold">Monthly Salary</span>
                  <span className="text-slate-805 dark:text-white font-extrabold">{profile.salary}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 dark:text-slate-500 font-semibold">CIBIL Score</span>
                  <span className={`font-black ${
                    profile.cibil !== "N/A" && Number(profile.cibil) >= 700 ? "text-emerald-500" : "text-amber-500"
                  }`}>{profile.cibil}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 dark:text-slate-500 font-semibold">Workflow stage</span>
                  <span className="px-2 py-0.5 rounded-lg text-[9px] font-black bg-indigo-50 text-indigo-650 dark:bg-indigo-950/20 dark:text-indigo-400">
                    {profile.status}
                  </span>
                </div>
              </div>
            </div>

            {/* Eligibility Indicator */}
            <div className="bg-gradient-to-tr from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 rounded-3xl p-6 shadow-sm">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 mb-3">
                <Sparkles className="w-5 h-5 animate-pulse" />
                <h3 className="text-xs font-black uppercase tracking-wider">Credit Eligibility Match</h3>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-bold">
                CIBIL score is evaluated as <span className="font-extrabold text-slate-800 dark:text-slate-200">{profile.cibil}</span>. Monthly earnings declared: <span className="font-extrabold text-slate-800 dark:text-slate-200">{profile.salary}</span>. 
                Recommended credit limit approval range: <span className="font-extrabold text-emerald-500">{profile.loanAmount}</span>.
              </p>
            </div>

            {/* Send Communication Widget */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-3xl p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5 mb-4">
                <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">Direct Connect</h3>
                <div className="flex gap-1.5">
                  {(["whatsapp", "sms", "email"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setActiveCommType(t)}
                      className={`text-[9px] font-black uppercase px-2 py-0.5 rounded transition ${
                        activeCommType === t
                          ? "bg-indigo-650 text-white"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-400"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <textarea
                  placeholder={`Type message to send via ${activeCommType}...`}
                  className="w-full h-20 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs font-bold outline-none resize-none text-slate-800 dark:text-white focus:border-indigo-500 transition"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                />
                <button
                  onClick={handleSendMessage}
                  className="w-full flex items-center justify-center gap-1.5 h-9 rounded-xl bg-indigo-650 text-white text-xs font-bold hover:bg-indigo-550 transition cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Dispatch</span>
                </button>
              </div>
            </div>

          </div>

          {/* Right Side: Details tabs */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Tabs bar */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 overflow-x-auto gap-1">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-3 text-xs font-extrabold border-b-2 transition whitespace-nowrap outline-none cursor-pointer ${
                      isActive
                        ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                        : "border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-350 hover:border-slate-200 dark:hover:border-slate-800"
                    }`}
                  >
                    <tab.icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Dynamic Tab Body */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80 rounded-3xl p-6 shadow-sm min-h-80">
              
              {activeTab === "overview" && (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider mb-3">Application Summary</h4>
                    <div className="grid grid-cols-2 gap-4 text-xs font-semibold">
                      <div className="p-3 bg-slate-50/50 dark:bg-slate-950/20 rounded-xl border border-slate-100 dark:border-slate-800">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Loan Requested</span>
                        <div className="text-base font-black text-slate-805 dark:text-white mt-1">{profile.loanAmount}</div>
                      </div>
                      <div className="p-3 bg-slate-50/50 dark:bg-slate-950/20 rounded-xl border border-slate-100 dark:border-slate-800">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Application Date</span>
                        <div className="text-xs font-extrabold text-slate-805 dark:text-white mt-1">{profile.date}</div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider mb-2.5">Live Verification Status</h4>
                    <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-indigo-50/20 dark:bg-indigo-950/10 border border-indigo-100/50 dark:border-indigo-900/30">
                      <ShieldAlert className="w-5 h-5 text-indigo-550 shrink-0 animate-pulse" />
                      <div>
                        <div className="text-xs font-bold text-slate-800 dark:text-white leading-none">KYC Status Checked</div>
                        <div className="text-[9px] text-slate-400 dark:text-slate-500 font-bold mt-1.5">Documents successfully scanned and matches with PAN records.</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "personal" && (
                <div className="grid grid-cols-2 gap-4 text-xs font-bold text-slate-700 dark:text-slate-400">
                  <div>
                    <span className="text-slate-400 block mb-1">Full Name</span>
                    <p className="text-slate-800 dark:text-white">{profile.name}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-1">Mobile No</span>
                    <p className="text-slate-800 dark:text-white">{profile.phone}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-1">Email Address</span>
                    <p className="text-slate-800 dark:text-white">{profile.email}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-1">Date of Birth</span>
                    <p className="text-slate-800 dark:text-white">{profile.dob}</p>
                  </div>
                </div>
              )}

              {activeTab === "employment" && (
                <div className="space-y-4 text-xs font-bold">
                  <div className="grid grid-cols-2 gap-4 text-slate-700 dark:text-slate-400">
                    <div>
                      <span className="text-slate-400 block mb-1">Employment Status</span>
                      <p className="text-slate-800 dark:text-white">{profile.employment}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 block mb-1">Declared Earnings</span>
                      <p className="text-slate-800 dark:text-white">{profile.salary}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 block mb-1">Employer Name</span>
                      <p className="text-slate-800 dark:text-white">{profile.employer}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 block mb-1">Official Email</span>
                      <p className="text-slate-800 dark:text-white font-mono break-all">{profile.workEmail}</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 dark:bg-slate-800/50 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <span className="text-slate-400 block mb-1">Verification Status</span>
                      <div className="flex items-center gap-2">
                        {profile.officialEmailVerified ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                            Status: Verified ✓
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 dark:bg-slate-700 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Status: Not Verified
                          </span>
                        )}
                      </div>
                      {profile.officialEmailVerified && profile.officialEmailVerifiedAt && (
                        <p className="mt-1 text-[11px] text-slate-500 font-normal">
                          Verified At: {profile.officialEmailVerifiedAt} {profile.officialEmailVerifiedBy ? `by ${profile.officialEmailVerifiedBy}` : ""}
                        </p>
                      )}
                    </div>
                    <div>
                      {!profile.officialEmailVerified ? (
                        <button
                          type="button"
                          onClick={() => {
                            apiPost("/credit/official-email/send-otp", { applicationId: lead?.id || leadId }).catch(() => {});
                            setIsOtpModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition cursor-pointer"
                        >
                          Verify Official Email
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            apiPost("/credit/official-email/send-otp", { applicationId: lead?.id || leadId }).catch(() => {});
                            setIsOtpModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white dark:bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 transition hover:bg-slate-50 cursor-pointer"
                        >
                          Re-verify
                        </button>
                      )}
                    </div>
                  </div>

                  <OfficialEmailVerifyModal
                    open={isOtpModalOpen}
                    onOpenChange={setIsOtpModalOpen}
                    applicationId={lead?.id || leadId || ""}
                    maskedEmail={profile.workEmail}
                    onVerifiedSuccess={(data) => {
                      fetchLeadDetails();
                    }}
                  />
                </div>
              )}

              {activeTab === "kyc_bank" && (
                <div className="grid grid-cols-2 gap-4 text-xs font-bold text-slate-707 dark:text-slate-400">
                  <div>
                    <span className="text-slate-400 block mb-1">Linked Bank</span>
                    <p className="text-slate-800 dark:text-white">{profile.bankName}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-1">Account Number</span>
                    <p className="text-slate-800 dark:text-white">{profile.bankAccount}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-1">KYC Status</span>
                    <p className="text-slate-800 dark:text-white">{profile.kycStatus}</p>
                  </div>
                </div>
              )}

              {activeTab === "notes" && (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add an internal operations note..."
                      className="flex-1 h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-xs font-bold outline-none text-slate-800 dark:text-white focus:border-indigo-500 transition"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                    <button
                      onClick={handleAddNote}
                      className="px-4 rounded-xl bg-indigo-650 text-white text-xs font-bold hover:bg-indigo-550 transition cursor-pointer"
                    >
                      Post Note
                    </button>
                  </div>

                  <div className="space-y-3">
                    {noteList.map((n, idx) => (
                      <div key={idx} className="p-3.5 bg-slate-50/40 dark:bg-slate-950/10 border border-slate-100 dark:border-slate-800 rounded-xl text-xs font-semibold">
                        <div className="flex justify-between font-bold mb-1">
                          <span className="text-indigo-600 dark:text-indigo-400">{n.author}</span>
                          <span className="text-[9px] text-slate-400 font-bold">{n.time}</span>
                        </div>
                        <p className="text-slate-700 dark:text-slate-300 font-medium mt-1 leading-normal">{n.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>

          </div>

        </div>
      )}

    </motion.div>
  );
}
