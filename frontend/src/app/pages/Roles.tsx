import { useState } from "react";
import { ShieldCheck, ToggleLeft, ToggleRight, Info } from "lucide-react";

interface RolePermission {
  module: string;
  description: string;
  read: boolean;
  write: boolean;
  delete: boolean;
}

export function Roles() {
  const [activeRole, setActiveRole] = useState<string>("credit-manager");
  const [successMsg, setSuccessMsg] = useState("");

  const initialPermissions: Record<string, RolePermission[]> = {
    superadmin: [
      { module: "Company Directory", description: "Register, pause, and configure tenant CRM instances", read: true, write: true, delete: true },
      { module: "User Management", description: "Create, status-toggle, and reset passwords for all users", read: true, write: true, delete: true },
      { module: "Roles & Permissions", description: "Define system privilege limits and control overrides", read: true, write: true, delete: true },
      { module: "System Health Nodes", description: "View API logs, heartbeats, database status", read: true, write: true, delete: true },
      { module: "Security & Audits", description: "Review platform action logs and audit trails", read: true, write: true, delete: true },
    ],
    telecaller: [
      { module: "Leads Workbench", description: "View, update, and submit application leads", read: true, write: true, delete: false },
      { module: "Lead Details", description: "Record call notes, income files, and address proofs", read: true, write: true, delete: false },
      { module: "Analytics Reports", description: "Daily lead conversion and call stats charts", read: true, write: false, delete: false },
    ],
    "credit-manager": [
      { module: "Credit Review Queue", description: "Approve/Reject loans, evaluate risk parameters", read: true, write: true, delete: false },
      { module: "CAM Sheet Engine", description: "Generate credit assessment memory sheets", read: true, write: true, delete: false },
      { module: "Leads Workbench", description: "Review documentation updates and customer details", read: true, write: false, delete: false },
    ],
    accountant: [
      { module: "Disbursement Ledger", description: "Process payouts, download bank letters", read: true, write: true, delete: false },
      { module: "Payment Verification", description: "Verify client bank details and penny drops", read: true, write: true, delete: false },
      { module: "Loan servicing", description: "Update repayment schedules and loan closing details", read: true, write: true, delete: false },
    ],
    collection: [
      { module: "Collections Queue", description: "Call delinquent clients, request payment receipts", read: true, write: true, delete: false },
      { module: "Repayments Ledger", description: "Validate eNACH auto-debit statuses", read: true, write: false, delete: false },
    ]
  };

  const [permissions, setPermissions] = useState<Record<string, RolePermission[]>>(() => {
    const saved = localStorage.getItem("crm_permissions_matrix");
    return saved ? JSON.parse(saved) : initialPermissions;
  });

  const handleToggle = (moduleName: string, field: "read" | "write" | "delete") => {
    if (activeRole === "superadmin") {
      setSuccessMsg("Superadmin permissions are immutable for platform security.");
      setTimeout(() => setSuccessMsg(""), 3000);
      return;
    }
    const updated = { ...permissions };
    updated[activeRole] = updated[activeRole].map(p => {
      if (p.module === moduleName) {
        return { ...p, [field]: !p[field] };
      }
      return p;
    });
    setPermissions(updated);
    localStorage.setItem("crm_permissions_matrix", JSON.stringify(updated));
    setSuccessMsg(`Permissions updated for ${roleLabels[activeRole]}.`);
    setTimeout(() => setSuccessMsg(""), 3000);
  };

  const roleLabels: Record<string, string> = {
    superadmin: "Super Admin",
    telecaller: "Telecaller / Agent",
    "credit-manager": "Credit Underwriter",
    accountant: "Disbursement Officer",
    collection: "Recovery Officer"
  };

  return (
    <div className="w-full min-h-screen bg-slate-50 dark:bg-slate-950 pb-12">
      <div className="flex flex-col gap-4 border-b border-slate-200 bg-white px-8 py-5 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-xl font-extrabold text-slate-800 dark:text-white">
              Roles & Permissions
              <span className="text-xs font-bold text-blue-600 bg-blue-500/10 dark:text-blue-400 dark:bg-blue-400/10 px-2.5 py-0.5 rounded-full ml-2">Root Control</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Define access control policies, toggling read/write/delete permissions across platform modules</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 mt-6">
        {successMsg && (
          <div className="mb-4 p-3 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-400 text-xs font-bold animate-fadeIn border border-emerald-200/50">
            {successMsg}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Column: Roles list */}
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4 shadow-sm">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3">Select System Role</h3>
              <div className="space-y-2">
                {Object.keys(roleLabels).map((roleKey) => {
                  const isActive = activeRole === roleKey;
                  return (
                    <button
                      key={roleKey}
                      onClick={() => setActiveRole(roleKey)}
                      className={`w-full flex items-center justify-between p-3 rounded-xl text-left text-xs font-bold border transition-all ${
                        isActive
                          ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-600/10"
                          : "bg-transparent border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
                      }`}
                    >
                      <span>{roleLabels[roleKey]}</span>
                      {isActive && <ShieldCheck className="h-4 w-4 text-emerald-400" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Security Note card */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4 shadow-sm text-xs space-y-2">
              <div className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 font-bold">
                <Info className="h-4 w-4" />
                <span>Security Notice</span>
              </div>
              <p className="text-slate-400 leading-relaxed font-semibold">
                Changing permissions takes effect immediately for all active user sessions under the corresponding role. Changes are audited.
              </p>
            </div>
          </div>

          {/* Right Column: Module Access Control List */}
          <div className="lg:col-span-3 space-y-6">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
                <div>
                  <h3 className="font-extrabold text-slate-800 dark:text-white text-sm">
                    Access Rights: {roleLabels[activeRole]}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">Control feature toggles for {roleLabels[activeRole]}</p>
                </div>
                <div className="flex gap-4 text-xs font-bold text-slate-400">
                  <span className="w-16 text-center">Read</span>
                  <span className="w-16 text-center">Write</span>
                  <span className="w-16 text-center">Delete</span>
                </div>
              </div>

              <div className="space-y-4">
                {(permissions[activeRole] || []).map((perm) => (
                  <div
                    key={perm.module}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40 hover:bg-slate-50 dark:hover:bg-slate-900/60 transition"
                  >
                    <div>
                      <h4 className="font-bold text-slate-800 dark:text-white text-xs">{perm.module}</h4>
                      <p className="text-[11px] text-slate-400 font-semibold mt-0.5">{perm.description}</p>
                    </div>
                    <div className="flex items-center gap-4 text-slate-600 dark:text-slate-400 self-end sm:self-auto">
                      {/* READ Toggle */}
                      <button
                        onClick={() => handleToggle(perm.module, "read")}
                        className="w-16 flex justify-center hover:scale-105 transition"
                      >
                        {perm.read ? (
                          <ToggleRight className="h-7 w-7 text-emerald-500" />
                        ) : (
                          <ToggleLeft className="h-7 w-7 text-slate-400 dark:text-slate-700" />
                        )}
                      </button>

                      {/* WRITE Toggle */}
                      <button
                        onClick={() => handleToggle(perm.module, "write")}
                        className="w-16 flex justify-center hover:scale-105 transition"
                      >
                        {perm.write ? (
                          <ToggleRight className="h-7 w-7 text-emerald-500" />
                        ) : (
                          <ToggleLeft className="h-7 w-7 text-slate-400 dark:text-slate-700" />
                        )}
                      </button>

                      {/* DELETE Toggle */}
                      <button
                        onClick={() => handleToggle(perm.module, "delete")}
                        className="w-16 flex justify-center hover:scale-105 transition"
                      >
                        {perm.delete ? (
                          <ToggleRight className="h-7 w-7 text-emerald-500" />
                        ) : (
                          <ToggleLeft className="h-7 w-7 text-slate-400 dark:text-slate-700" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
