import { Link } from "react-router-dom";
import { LockKeyhole } from "lucide-react";
import { roleHomeRoutes, roleLabels, useAuth } from "../lib/auth";

export function Unauthorized() {
  const { user, activeRole } = useAuth();
  const role = activeRole || user?.role;

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-700">
          <LockKeyhole className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-xl font-bold text-slate-950">Access restricted</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          This page is not available for {role ? roleLabels[role] : "your current"} role.
        </p>
        {user && role && (
          <Link
            to={roleHomeRoutes[role]}
            className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Go to my workspace
          </Link>
        )}
      </div>
    </div>
  );
}
