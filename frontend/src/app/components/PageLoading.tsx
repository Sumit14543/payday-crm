import { Loader2 } from "lucide-react";

type PageLoadingProps = {
  label?: string;
};

export function PageLoading({ label = "Loading panel..." }: PageLoadingProps) {
  return (
    <div className="w-full min-w-0 p-6 space-y-6 animate-pulse bg-slate-50/50 dark:bg-slate-950/40 min-h-[calc(100vh-4rem)]">
      {/* Top Animated Shimmer Progress Bar */}
      <div className="fixed top-0 left-0 right-0 z-50 h-1 overflow-hidden bg-emerald-100 dark:bg-emerald-950">
        <div className="h-full bg-emerald-600 animate-[shimmer_1.5s_infinite] w-full bg-[linear-gradient(90deg,transparent_0%,rgba(16,185,129,0.8)_50%,transparent_100%)]" />
      </div>

      {/* Header Banner Skeleton */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="h-4 w-32 rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-8 w-64 rounded bg-slate-300 dark:bg-slate-700" />
            <div className="h-3 w-96 rounded bg-slate-200 dark:bg-slate-800" />
          </div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-28 rounded-lg bg-slate-200 dark:bg-slate-800" />
            <div className="h-10 w-28 rounded-lg bg-slate-300 dark:bg-slate-700" />
          </div>
        </div>
      </div>

      {/* Metrics Cards Grid Skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex justify-between items-center">
              <div className="h-3 w-24 rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-4 w-4 rounded-full bg-slate-200 dark:bg-slate-800" />
            </div>
            <div className="h-8 w-36 rounded bg-slate-300 dark:bg-slate-700" />
            <div className="h-3 w-28 rounded bg-slate-200 dark:bg-slate-800" />
          </div>
        ))}
      </div>

      {/* Main Table / Console Skeleton */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <div className="h-10 w-72 rounded-lg bg-slate-200 dark:bg-slate-800" />
          <div className="flex gap-2">
            <div className="h-10 w-32 rounded-lg bg-slate-200 dark:bg-slate-800" />
            <div className="h-10 w-32 rounded-lg bg-slate-200 dark:bg-slate-800" />
          </div>
        </div>

        <div className="space-y-3 pt-2">
          {[1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="h-16 w-full rounded-lg bg-slate-100 dark:bg-slate-800/60" />
          ))}
        </div>
      </div>

      {/* Floating Center Indicator */}
      <div className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-xl dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
        <Loader2 className="h-4 w-4 animate-spin text-emerald-600 dark:text-emerald-400" />
        <span>{label}</span>
      </div>
    </div>
  );
}


