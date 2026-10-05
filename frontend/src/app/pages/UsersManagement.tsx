import { useState, useEffect } from "react";
import { 
  Users, 
  Plus, 
  ShieldCheck, 
  Search, 
  UserCog, 
  Mail, 
  Lock, 
  User, 
  Building2, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  KeyRound,
  Eye,
  EyeOff
} from "lucide-react";
import { apiGet, apiPost, apiPatch } from "../lib/api";
import { ConfirmationModal } from "../components/ui/ConfirmationModal";

interface CRMUser {
  id: number;
  email: string;
  name: string;
  role: string;
  is_active: number;
  last_login_at: string | null;
  created_at: string;
}

interface Tenant {
  id: number;
  name: string;
  slug: string;
  status: string;
}

export function UsersManagement() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantSlug, setSelectedTenantSlug] = useState<string>("waqtfinance");
  const [users, setUsers] = useState<CRMUser[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Create User Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState("telecaller");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [isSubmittingNewUser, setIsSubmittingNewUser] = useState(false);

  // Reset Password Modal State
  const [selectedUserForPassword, setSelectedUserForPassword] = useState<CRMUser | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState("");
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);

  // Load tenants list
  useEffect(() => {
    async function loadTenants() {
      try {
        const res = await apiGet<Tenant[]>("/superadmin/tenants");
        // Always add default waqtfinance tenant at the top
        const waqtTenant: Tenant = { id: 0, name: "Waqt Finance (Default)", slug: "waqtfinance", status: "active" };
        setTenants([waqtTenant, ...res]);
      } catch (err) {
        console.error("Failed to load tenants:", err);
      }
    }
    loadTenants();
  }, []);

  // Load users of selected tenant
  const loadUsers = async () => {
    if (!selectedTenantSlug) return;
    setIsLoading(true);
    setError("");
    try {
      const res = await apiGet<CRMUser[]>(`/superadmin/users?tenantSlug=${selectedTenantSlug}`);
      setUsers(res || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load users for this company.");
      setUsers([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [selectedTenantSlug]);

  const [userPendingToggle, setUserPendingToggle] = useState<CRMUser | null>(null);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);

  const toggleUserStatus = (user: CRMUser) => {
    if (user.is_active) {
      setUserPendingToggle(user);
    } else {
      executeToggleStatus(user);
    }
  };

  const executeToggleStatus = async (userToToggle: CRMUser) => {
    const nextStatus = userToToggle.is_active ? 0 : 1;
    setError("");
    setSuccessMsg("");
    setIsTogglingStatus(true);
    try {
      await apiPatch(`/superadmin/users/${userToToggle.id}`, {
        tenantSlug: selectedTenantSlug,
        is_active: nextStatus
      });
      setSuccessMsg(`User ${userToToggle.name} status updated successfully.`);
      setUserPendingToggle(null);
      loadUsers();
    } catch (err: any) {
      setError(err?.message || "Failed to update user status.");
    } finally {
      setIsTogglingStatus(false);
    }
  };

  // Handle user creation
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    setIsSubmittingNewUser(true);
    try {
      await apiPost("/superadmin/users", {
        tenantSlug: selectedTenantSlug,
        email: newUserEmail,
        name: newUserName,
        role: newUserRole,
        password: newUserPassword
      });
      setSuccessMsg(`User '${newUserName}' created successfully!`);
      setIsCreateModalOpen(false);
      // Reset form
      setNewUserName("");
      setNewUserEmail("");
      setNewUserRole("telecaller");
      setNewUserPassword("");
      loadUsers();
    } catch (err: any) {
      setError(err?.message || "Failed to create user.");
    } finally {
      setIsSubmittingNewUser(false);
    }
  };

  // Handle password reset
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserForPassword) return;
    setError("");
    setSuccessMsg("");
    setIsSubmittingPassword(true);
    try {
      await apiPatch(`/superadmin/users/${selectedUserForPassword.id}`, {
        tenantSlug: selectedTenantSlug,
        password: newPasswordValue
      });
      setSuccessMsg(`Password reset successfully for ${selectedUserForPassword.name}.`);
      setSelectedUserForPassword(null);
      setNewPasswordValue("");
    } catch (err: any) {
      setError(err?.message || "Failed to reset password.");
    } finally {
      setIsSubmittingPassword(false);
    }
  };

  const filteredUsers = users.filter(user => 
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="w-full min-h-screen bg-slate-50 dark:bg-slate-950 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-slate-200 bg-white px-8 py-5 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
            <UserCog className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-xl font-extrabold text-slate-800 dark:text-white">
              User Management
              <span className="text-xs font-bold text-blue-600 bg-blue-500/10 dark:text-blue-400 dark:bg-blue-400/10 px-2.5 py-0.5 rounded-full ml-2">Super Admin</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Manage users, permissions, status and reset passwords for any tenant instance</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Company Selector */}
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-slate-400" />
            <select
              value={selectedTenantSlug}
              onChange={(e) => setSelectedTenantSlug(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            >
              {tenants.map(t => (
                <option key={t.slug} value={t.slug}>{t.name}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 text-xs font-bold text-white shadow-sm transition"
          >
            <Plus className="h-3.5 w-3.5" />
            New User
          </button>
        </div>
      </div>

      <div className="px-8 py-6 space-y-6">
        {/* Alerts */}
        {error && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 text-xs text-rose-700 dark:bg-rose-950/20 dark:border-rose-900 dark:text-rose-400 flex items-center gap-2">
            <XCircle className="h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-xs text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-900 dark:text-emerald-400 flex items-center gap-2 font-semibold animate-pulse">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Filters and List */}
        <div className="rounded-xl bg-white border border-slate-200/80 dark:bg-slate-900/60 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Search className="h-4 w-4" />
              </span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name, email or role..."
                className="h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 pl-9 pr-3 text-xs text-slate-800 dark:text-white placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div className="text-xs text-slate-400 font-medium">
              Showing {filteredUsers.length} of {users.length} users
            </div>
          </div>

          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                <RefreshCw className="h-6 w-6 animate-spin text-indigo-500" />
                <span className="text-xs font-semibold">Fetching live users list...</span>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs font-medium">
                No users found in this company database.
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-bold tracking-wider uppercase text-[10px]">
                    <th className="py-3 px-5">User Info</th>
                    <th className="py-3 px-5">Role</th>
                    <th className="py-3 px-5">Last Login</th>
                    <th className="py-3 px-5">Created At</th>
                    <th className="py-3 px-5">Status</th>
                    <th className="py-3 px-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/50 dark:divide-slate-800/40">
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors">
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-[11px] font-black text-indigo-700 dark:text-indigo-400 flex-shrink-0">
                            {user.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-extrabold text-slate-800 dark:text-white text-sm">{user.name}</div>
                            <div className="text-[10px] text-slate-400 font-medium flex items-center gap-1 mt-0.5">
                              <Mail className="h-3 w-3" /> {user.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-5">
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-bold uppercase text-[9px] text-slate-500">
                          {user.role}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-slate-400 dark:text-slate-500">
                        {user.last_login_at 
                          ? new Date(user.last_login_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) 
                          : "Never"}
                      </td>
                      <td className="py-3.5 px-5 text-slate-400 dark:text-slate-500">
                        {new Date(user.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </td>
                      <td className="py-3.5 px-5">
                        <button
                          onClick={() => toggleUserStatus(user)}
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase border transition-all ${
                            user.is_active 
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20" 
                              : "bg-rose-500/10 text-rose-600 border-rose-500/20 hover:bg-rose-500/20"
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${user.is_active ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
                          {user.is_active ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <button
                          onClick={() => setSelectedUserForPassword(user)}
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2.5 text-[10px] font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                        >
                          <KeyRound className="h-3 w-3" /> Reset Pass
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Create User Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 shadow-2xl p-6 relative overflow-hidden">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600">
                <Plus className="h-4 w-4" />
              </span>
              <h3 className="font-extrabold text-slate-800 dark:text-white text-sm">Add User to CRM</h3>
            </div>
            <p className="text-xs text-slate-400 mb-5 leading-5">
              Create a new user account inside the selected company database.
            </p>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-sm text-slate-800 dark:text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="e.g. john@waqtfinance.com"
                  className="h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-sm text-slate-800 dark:text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">CRM Role</label>
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value)}
                  className="h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-xs font-bold text-slate-700 dark:text-slate-300 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="telecaller">Telecaller (Sales)</option>
                  <option value="credit-manager">Credit Underwriter</option>
                  <option value="accountant">Accountant / Disbursals</option>
                  <option value="collection">Collections Agent</option>
                  <option value="superadmin">Super Admin</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-sm text-slate-800 dark:text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="flex-1 h-9 rounded-lg border border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingNewUser}
                  className="flex-1 h-9 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold disabled:opacity-50 transition"
                >
                  {isSubmittingNewUser ? "Creating..." : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {selectedUserForPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-xl bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 shadow-2xl p-6 relative overflow-hidden">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
                <KeyRound className="h-4 w-4" />
              </span>
              <h3 className="font-extrabold text-slate-800 dark:text-white text-sm">Reset Password</h3>
            </div>
            <p className="text-xs text-slate-400 mb-5 leading-5">
              Reset password for <strong className="text-slate-700 dark:text-white">{selectedUserForPassword.name}</strong>.
            </p>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">New Password</label>
                <input
                  type="password"
                  required
                  value={newPasswordValue}
                  onChange={(e) => setNewPasswordValue(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-sm text-slate-800 dark:text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedUserForPassword(null)}
                  className="flex-1 h-9 rounded-lg border border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPassword}
                  className="flex-1 h-9 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold disabled:opacity-50 transition"
                >
                  {isSubmittingPassword ? "Resetting..." : "Reset Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={Boolean(userPendingToggle)}
        onClose={() => setUserPendingToggle(null)}
        onConfirm={() => userPendingToggle && executeToggleStatus(userPendingToggle)}
        isLoading={isTogglingStatus}
        title="Deactivate CRM User Account"
        description={`Are you sure you want to deactivate ${userPendingToggle?.name} (${userPendingToggle?.email})? They will lose access to the CRM until reactivated.`}
        confirmText="Deactivate User"
        cancelText="Cancel"
        variant="warning"
        iconType="warning"
      />
    </div>
  );
}
