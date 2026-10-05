import { Link } from "react-router-dom";
import { ArrowLeft, SearchX } from "lucide-react";

export function NotFound() {
  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
          <SearchX className="h-7 w-7 text-slate-500" />
        </div>
        <h1 className="mt-5 text-2xl font-bold text-slate-950">Page not found</h1>
        <p className="mt-2 text-sm text-slate-600">
          This CRM page is not available yet or the link is incorrect.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
