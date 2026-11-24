import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ExternalLink, FlaskConical } from "lucide-react";
import { apiGet, apiPost } from "../lib/api";

const api = "/account-aggregator/uat";
const panel = "space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm";
const label = "grid gap-1.5 text-sm font-medium text-slate-700";
const field = "h-10 min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 disabled:bg-slate-50";
const action = "inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-indigo-700 px-4 text-sm font-semibold text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50";
const secondary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

type Template = { code: string; name: string };
type Consent = { referenceId: string; dataRequestMode?: string; purposeText?: string };
type Journey = { trackingId: string; redirectionUrl: string; consents: Consent[] };
type Account = { accountId: string; accountNumber?: string; fipId?: string };
type Session = { sessionId: string; status: string; analysisId?: string };
type Transaction = { date?: string; type?: string; amount?: string; balance?: string; narration?: string };
type Statement = {
  accountId: string; status?: string; accountNumber?: string; balance?: string; currency?: string;
  ifscCode?: string; fromDate?: string; toDate?: string; transactionCount: number; transactions: Transaction[];
};
type Report = { status?: string; cashFlow?: object; categorizedAccountCount?: number };

function localDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function AccountAggregatorUat() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateCode, setTemplateCode] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [vuaId, setVuaId] = useState("");
  const [journey, setJourney] = useState<Journey | null>(null);
  const [trackingId, setTrackingId] = useState("");
  const [referenceId, setReferenceId] = useState("");
  const [accountReferenceId, setAccountReferenceId] = useState("");
  const [fiReferenceId, setFiReferenceId] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState("");
  const [fromDate, setFromDate] = useState(() => {
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return localDate(start);
  });
  const [toDate, setToDate] = useState(() => localDate(new Date()));
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [analysisId, setAnalysisId] = useState("");
  const [statement, setStatement] = useState<Statement | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const consent = journey?.trackingId === trackingId ? journey.consents.find(item => item.referenceId === referenceId) : undefined;
  const idsReady = Boolean(trackingId.trim() && referenceId.trim());
  const needsFiReference = Boolean(accountReferenceId && accountReferenceId !== referenceId.trim());
  const fiIdsReady = idsReady && (!needsFiReference || Boolean(fiReferenceId.trim()));
  const completed = sessions.filter(item => item.status?.toUpperCase() === "COMPLETED");
  const getIds = () => ({ trackingId: trackingId.trim(), referenceId: referenceId.trim() });
  const getFiIds = () => ({ ...getIds(), referenceId: fiReferenceId.trim() || referenceId.trim() });

  async function loadTemplates(signal?: AbortSignal) {
    const response = await apiGet<{ templates: Template[] }>(`${api}/templates`, signal);
    setTemplates(response.templates);
    setTemplateCode(current => response.templates.some(item => item.code === current)
      ? current
      : response.templates.find(item => item.code === "CT003")?.code || response.templates[0]?.code || "");
  }

  useEffect(() => {
    const controller = new AbortController();
    loadTemplates(controller.signal).catch(error => {
      if (!controller.signal.aborted) setMessage({ text: error.message, error: true });
    });
    return () => controller.abort();
  }, []);

  async function run(label: string, task: () => Promise<string>) {
    if (busy) return;
    setBusy(label);
    setMessage(null);
    try {
      setMessage({ text: await task() });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "CRIF UAT request failed.", error: true });
    } finally {
      setBusy("");
    }
  }

  function clearSessions() {
    setSessions([]);
    setSessionId("");
    setAnalysisId("");
    setStatement(null);
    setReport(null);
  }

  function changeConsent(nextTrackingId: string, nextReferenceId: string) {
    setTrackingId(nextTrackingId);
    setReferenceId(nextReferenceId);
    setAccounts([]);
    setAccountReferenceId("");
    setFiReferenceId("");
    setAccountId("");
    clearSessions();
    setMessage(null);
  }

  function createConsent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run("Creating consent link", async () => {
      const next = await apiPost<Journey>(`${api}/consents`, { templateCode, phoneNumber, vuaId: vuaId.trim() });
      setJourney(next);
      changeConsent(next.trackingId, next.consents[0].referenceId);
      return "Consent link created. Open it, approve with your sandbox account, then return here.";
    });
  }

  function loadAccounts() {
    void run("Looking up accounts", async () => {
      const response = await apiPost<{ accounts: Account[]; referenceId: string }>(`${api}/accounts`, getIds());
      if (response.referenceId !== (accountReferenceId || referenceId.trim())) {
        setFiReferenceId("");
        clearSessions();
      }
      setAccounts(response.accounts);
      setAccountReferenceId(response.referenceId);
      setAccountId(response.accounts[0]?.accountId || "");
      setStatement(null);
      return response.accounts.length ? `${response.accounts.length} linked account(s) found.` : "No linked accounts returned yet. Check the sandbox consent and try again.";
    });
  }

  function selectSession(id: string, list: Session[] = sessions) {
    setSessionId(id);
    setAnalysisId(list.find(item => item.sessionId === id)?.analysisId || "");
    setStatement(null);
    setReport(null);
  }

  function loadSessions() {
    void run("Looking up FI sessions", async () => {
      const response = await apiPost<{ sessions: Session[] }>(`${api}/sessions`, { ...getFiIds(), fromDate, toDate });
      setSessions(response.sessions);
      const ready = response.sessions.find(item => item.status?.toUpperCase() === "COMPLETED");
      selectSession(ready?.sessionId || "", response.sessions);
      return ready ? "A completed FI session is ready to fetch." : "No completed FI session yet. Check again after CRIF finishes processing.";
    });
  }

  function requestFi() {
    void run("Requesting FI data", async () => {
      await apiPost(`${api}/fi-request`, getFiIds());
      return "FI request accepted. Check sessions for the completed result.";
    });
  }

  function loadStatement() {
    void run("Fetching the bank statement", async () => {
      const result = await apiPost<Statement>(`${api}/statement`, { ...getFiIds(), sessionId, accountId });
      setStatement(result);
      return result.status === "READY" ? "Bank statement received." : `Statement status is ${result.status || "unavailable"}.`;
    });
  }

  function loadAnalytics() {
    void run("Fetching analytics", async () => {
      const result = await apiPost<Report>(`${api}/analytics`, { ...getFiIds(), analysisId });
      setReport(result);
      return `Analytics status is ${result.status || "unavailable"}.`;
    });
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 sm:px-6">
      <header className="space-y-2">
        <Link to="/credit-manager" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Credit Manager Panel
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-950">
          <FlaskConical className="h-6 w-6 text-indigo-700" aria-hidden="true" /> Account Aggregator Test
        </h1>
        <p className="text-sm text-slate-600">CRIF UAT. Use a sandbox mobile number or enter the IDs of an existing UAT consent.</p>
      </header>

      {(busy || message) && (
        <div role={message?.error ? "alert" : "status"} className={`sticky top-2 z-10 rounded-md border px-4 py-3 text-sm shadow-sm ${message?.error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-indigo-200 bg-indigo-50 text-indigo-900"}`}>
          {busy ? `${busy}…` : message?.text}
        </div>
      )}

      <fieldset disabled={Boolean(busy)} className="grid min-w-0 gap-5 lg:grid-cols-2">
        <section className={panel}>
          <h2 className="text-base font-semibold text-slate-950">Create consent link</h2>
          <form onSubmit={createConsent} className="grid gap-4">
            <label className={label}>
              Consent template
              <select className={field} required value={templateCode} onChange={event => setTemplateCode(event.target.value)}>
                <option value="">Select a template</option>
                {templates.map(item => <option key={item.code} value={item.code}>{item.code} · {item.name}</option>)}
              </select>
            </label>
            <label className={label}>
              Sandbox mobile number
              <input className={field} type="tel" autoComplete="off" inputMode="numeric" pattern="[6-9][0-9]{9}" maxLength={10} required value={phoneNumber} onChange={event => setPhoneNumber(event.target.value)} />
            </label>
            <label className={label}>
              Sandbox VUA (optional)
              <input className={field} autoComplete="off" maxLength={128} value={vuaId} onChange={event => setVuaId(event.target.value)} />
            </label>
            <div className="flex flex-wrap gap-2">
              <button className={action} disabled={!templateCode} type="submit">Create consent link</button>
              <button className={secondary} type="button" onClick={() => void run("Checking UAT connection", async () => { await loadTemplates(); return "CRIF UAT returned the template list."; })}>Refresh templates</button>
            </div>
          </form>
          {journey && (
            <a href={journey.redirectionUrl} target="_blank" rel="noopener noreferrer" className={secondary}>
              Open consent link <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          )}
        </section>

        <section className={panel}>
          <h2 className="text-base font-semibold text-slate-950">Linked bank accounts</h2>
          <label className={label}>Tracking ID<input className={field} maxLength={128} value={trackingId} onChange={event => changeConsent(event.target.value, referenceId)} /></label>
          <label className={label}>Reference ID
            {journey?.trackingId === trackingId && journey.consents.length > 1 ? (
              <select className={field} value={referenceId} onChange={event => changeConsent(trackingId, event.target.value)}>
                {journey.consents.map(item => <option key={item.referenceId} value={item.referenceId}>{item.purposeText || item.referenceId}</option>)}
              </select>
            ) : (
              <input className={field} maxLength={128} value={referenceId} onChange={event => changeConsent(trackingId, event.target.value)} />
            )}
          </label>
          <button className={action} disabled={!idsReady} type="button" onClick={loadAccounts}>Fetch linked accounts</button>
          {needsFiReference && (
            <p className="text-sm text-amber-800">CRIF returned a different account reference <code className="break-all">{accountReferenceId}</code>. Confirm which reference to use and enter it under FI sessions.</p>
          )}
          {accounts.length > 0 && (
            <label className={label}>Account for statement
              <select className={field} value={accountId} onChange={event => { setAccountId(event.target.value); setStatement(null); }}>
                {accounts.map(item => <option key={item.accountId} value={item.accountId}>{item.accountNumber || item.accountId} {item.fipId ? `· ${item.fipId}` : ""}</option>)}
              </select>
            </label>
          )}
        </section>

        <section className={panel}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-950">FI sessions</h2>
            {consent?.dataRequestMode && <span className="text-xs font-medium text-slate-500">Mode {consent.dataRequestMode}</span>}
          </div>
          {needsFiReference && (
            <label className={label}>FI reference ID
              <input className={field} maxLength={128} value={fiReferenceId} onChange={event => { setFiReferenceId(event.target.value); clearSessions(); }} />
            </label>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className={label}>From date<input className={field} type="date" value={fromDate} onChange={event => { setFromDate(event.target.value); clearSessions(); }} /></label>
            <label className={label}>To date<input className={field} type="date" value={toDate} onChange={event => { setToDate(event.target.value); clearSessions(); }} /></label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={action} disabled={!fiIdsReady || !fromDate || !toDate || fromDate > toDate} type="button" onClick={loadSessions}>Check FI sessions</button>
            {consent?.dataRequestMode?.toUpperCase() !== "AUTOMATIC" && <button className={secondary} disabled={!fiIdsReady || !accounts.length} type="button" onClick={requestFi}>Start manual FI request</button>}
          </div>
          {sessions.length > 0 && (
            <label className={label}>FI session
              <select className={field} value={sessionId} onChange={event => selectSession(event.target.value)}>
                <option value="">Select a completed session</option>
                {sessions.map(item => <option key={item.sessionId} value={item.sessionId} disabled={!completed.includes(item)}>{item.status || "Unknown"} · {item.sessionId}</option>)}
              </select>
            </label>
          )}
        </section>

        <section className={panel}>
          <h2 className="text-base font-semibold text-slate-950">Statement and analytics</h2>
          <div>
            <button className={action} disabled={!fiIdsReady || !accountId || !sessionId} type="button" onClick={loadStatement}>Fetch bank statement</button>
            {(!accountId || !sessionId) && <p className="mt-2 text-sm text-slate-600">Select a linked account and a completed FI session.</p>}
          </div>
          <div className="flex flex-wrap items-end gap-3 border-t border-slate-200 pt-4">
            <label className={`${label} flex-1`}>CRIF analysis ID
              <input className={field} maxLength={128} value={analysisId} onChange={event => { setAnalysisId(event.target.value); setReport(null); }} />
            </label>
            <button className={secondary} disabled={!fiIdsReady || !analysisId.trim()} type="button" onClick={loadAnalytics}>Fetch analytics</button>
          </div>
        </section>
      </fieldset>

      {statement && (
        <section className={panel}>
          <h2 className="text-base font-semibold text-slate-950">Bank statement {statement.accountNumber}</h2>
          <p className="text-sm text-slate-600">{[statement.status, statement.ifscCode, statement.balance && `${statement.currency || ""} ${statement.balance}`.trim(), `${statement.transactionCount} transactions`].filter(Boolean).join(" · ")}</p>
          {statement.transactionCount > statement.transactions.length && <p className="text-sm text-slate-600">Showing the first {statement.transactions.length} transactions.</p>}
          {statement.transactions.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left text-sm">
                <thead className="border-b border-slate-200 text-slate-600"><tr>{["Date", "Description", "Type", "Amount", "Balance"].map(name => <th key={name} scope="col" className="p-2">{name}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {statement.transactions.map((item, index) => (
                    <tr key={index}>{[item.date, item.narration, item.type, item.amount, item.balance].map((value, column) => <td key={column} className="p-2 text-slate-700">{value || "—"}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {report && (
        <section className={panel}>
          <h2 className="text-base font-semibold text-slate-950">Analytics report</h2>
          <p className="text-sm text-slate-600">{report.status || "Status unavailable"}{report.categorizedAccountCount !== undefined ? ` · ${report.categorizedAccountCount} categorized account(s)` : ""}</p>
          {report.cashFlow && <pre className="max-h-96 overflow-auto rounded-md bg-slate-50 p-4 text-xs text-slate-900">{JSON.stringify(report.cashFlow, null, 2)}</pre>}
        </section>
      )}
    </main>
  );
}
