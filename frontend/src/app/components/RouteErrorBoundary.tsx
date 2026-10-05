import { useEffect } from "react";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";
import { isRouteErrorResponse, Link, useRouteError } from "react-router-dom";
import { roleHomeRoutes, useAuth } from "../lib/auth";

function getErrorMessage(error: unknown) {
  if (isRouteErrorResponse(error)) {
    return error.statusText || error.data?.message || `Request failed (${error.status})`;
  }

  if (error instanceof Error) return error.message;
  return "Something went wrong while loading this page.";
}

export function RouteErrorBoundary() {
  const error = useRouteError();
  const { user, activeRole } = useAuth();
  const role = activeRole || user?.role;
  const homePath = user && role ? roleHomeRoutes[role] : "/login";

  useEffect(() => {
    const msg = getErrorMessage(error).toLowerCase();
    if (
      msg.includes("dynamically imported module") || 
      msg.includes("failed to fetch") || 
      msg.includes("importing a module script failed") ||
      msg.includes("loading chunk")
    ) {
      const lastReload = Number(sessionStorage.getItem("chunk_reload_timestamp") || 0);
      const now = Date.now();
      if (now - lastReload > 5_000) {
        sessionStorage.setItem("chunk_reload_timestamp", String(now));
        const url = new URL(window.location.href);
        url.searchParams.set("_r", String(now));
        window.location.href = url.toString();
      }
    }
  }, [error]);

  const handleManualReload = () => {
    sessionStorage.removeItem("chunk_reload_retry");
    sessionStorage.removeItem("chunk_error_reloaded");
    sessionStorage.removeItem("chunk_reload_timestamp");
    const url = new URL(window.location.href);
    url.searchParams.set("_r", String(Date.now()));
    window.location.href = url.toString();
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-950">Page could not be loaded</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">{getErrorMessage(error)}</p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleManualReload}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <RefreshCw className="h-4 w-4" />
            Reload
          </button>
          <Link
            to={homePath}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            <Home className="h-4 w-4" />
            Go home
          </Link>
        </div>
      </section>
    </main>
  );
}
