import { useEffect, useState } from "react";
import { Building2, Download, Eye, Loader2 } from "lucide-react";
import { apiGet } from "../../lib/api";

type Transaction = { date: string; narration: string; type: string; amount: number | null; balance: number | null };
type AaStatement = {
  id: string;
  bankName: string;
  maskedAccountNumber: string;
  ifscCode: string;
  accountType: string;
  balance: number | null;
  fetchedAt: string | null;
  transactions: Transaction[];
};

const money = (value: number | null) => value === null ? "-" : value.toLocaleString("en-IN", { style: "currency", currency: "INR" });

function csvCell(value: unknown) {
  const text = String(value ?? "");
  // Bank narrations are external text. Keep spreadsheet formulas inert.
  const safe = /^[\s]*[=+@-]/.test(text) && typeof value !== "number" ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function downloadStatement(statement: AaStatement) {
  const rows: unknown[][] = [
    ["Account Aggregator bank statement"],
    ["Bank", statement.bankName], ["Account", statement.maskedAccountNumber],
    ["IFSC", statement.ifscCode], ["Saved at", statement.fetchedAt || ""],
    [], ["Date", "Narration", "Type", "Amount (INR)", "Balance (INR)"],
    ...statement.transactions.map(row => [row.date, row.narration, row.type, row.amount, row.balance]),
  ];
  const blob = new Blob(["\uFEFF", rows.map(row => row.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `AA_Statement_${statement.bankName}_${statement.maskedAccountNumber || statement.id}.csv`.replace(/[^a-zA-Z0-9_.-]/g, "_");
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function StatementCard({ statement }: { statement: AaStatement }) {
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const pages = Math.ceil(statement.transactions.length / pageSize);
  const savedDate = statement.fetchedAt ? new Date(statement.fetchedAt) : null;
  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">{statement.bankName} {statement.maskedAccountNumber}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{[statement.accountType, statement.ifscCode, `${statement.transactions.length} transactions`].filter(Boolean).join(" | ")}</p>
          {savedDate && !Number.isNaN(savedDate.getTime()) && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Saved {savedDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>}
        </div>
        {statement.transactions.length > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} aria-label={`View AA statement for ${statement.bankName} ${statement.maskedAccountNumber}`} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 dark:border-indigo-900 dark:text-indigo-300 dark:hover:bg-indigo-950"><Eye className="h-3.5 w-3.5" />{expanded ? "Hide statement" : "View statement"}</button>
            <button type="button" onClick={() => downloadStatement(statement)} aria-label={`Download AA statement for ${statement.bankName} ${statement.maskedAccountNumber}`} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"><Download className="h-3.5 w-3.5" />Download CSV</button>
          </div>
        )}
      </div>
      {!statement.transactions.length && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">Bank account details are available. Statement transactions have not been received yet.</p>}
      {expanded && (
        <div className="mt-3 space-y-2">
          <div className="max-h-96 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full min-w-[620px] text-left text-xs">
              <caption className="sr-only">Account Aggregator transactions for {statement.bankName} {statement.maskedAccountNumber}</caption>
              <thead className="sticky top-0 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><tr>{["Date", "Narration", "Type", "Amount", "Balance"].map(title => <th key={title} scope="col" className="px-3 py-2">{title}</th>)}</tr></thead>
              <tbody>{statement.transactions.slice(page * pageSize, (page + 1) * pageSize).map((row, index) => (
                <tr key={page * pageSize + index} className="border-t border-slate-100 text-slate-700 dark:border-slate-800 dark:text-slate-200">
                  <td className="whitespace-nowrap px-3 py-2">{row.date.replace("T", " ").slice(0, 16) || "-"}</td>
                  <td className="min-w-40 max-w-80 break-words px-3 py-2">{row.narration || "-"}</td>
                  <td className={`px-3 py-2 font-semibold ${row.type === "CREDIT" ? "text-emerald-600 dark:text-emerald-400" : ""}`}>{row.type || "-"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">{money(row.amount)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">{money(row.balance)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {pages > 1 && <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400"><button type="button" disabled={page === 0} onClick={() => setPage(value => value - 1)} className="rounded border px-3 py-1 disabled:opacity-40">Previous</button><span>Page {page + 1} of {pages}</span><button type="button" disabled={page + 1 === pages} onClick={() => setPage(value => value + 1)} className="rounded border px-3 py-1 disabled:opacity-40">Next</button></div>}
        </div>
      )}
    </div>
  );
}

export function CollectionAaStatements({ caseId, refresh }: { caseId: string; refresh: number }) {
  const [statements, setStatements] = useState<AaStatement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setStatements([]);
    setError("");
    setLoading(true);
    apiGet<AaStatement[]>(`/collections/${encodeURIComponent(caseId)}/account-aggregator-statements`, controller.signal)
      .then(data => { if (!controller.signal.aborted) setStatements(data || []); })
      .catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Unable to load Account Aggregator statements."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [caseId, refresh]);
  return (
    <div className="mb-5 space-y-2 border-b border-slate-100 pb-5 dark:border-slate-800" aria-label="Account Aggregator statements">
      <h4 className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200"><Building2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />Account Aggregator statements{statements.length > 0 && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">{statements.length}</span>}</h4>
      {loading ? <p role="status" className="flex items-center gap-2 py-2 text-xs text-slate-500 dark:text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Loading Account Aggregator statements...</p> : error ? <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error} Use Reload customer documents to try again.</p> : statements.length ? statements.map(statement => <StatementCard key={statement.id} statement={statement} />) : <p className="text-xs text-slate-500 dark:text-slate-400">No Account Aggregator statement available for this loan.</p>}
    </div>
  );
}
