import type { Pagination } from '../lib/api';

export function PartialDataNotice({ rows }: { rows: unknown[] }) {
  const pagination = (rows as unknown[] & { pagination?: Pagination }).pagination;
  if (!pagination || pagination.total <= rows.length) return null;
  return (
    <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
      Showing {rows.length.toLocaleString()} of {pagination.total.toLocaleString()} records. Charts, totals and exports calculated from this list cover the loaded records only.
    </div>
  );
}
