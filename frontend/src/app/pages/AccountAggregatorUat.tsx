import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ExternalLink, FlaskConical, Terminal, CheckCircle2, Copy } from "lucide-react";
import { apiGet, apiPost } from "../lib/api";

const api = "/account-aggregator/uat";
const panel = "space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm";
const label = "grid gap-1.5 text-sm font-medium text-slate-700";
const field = "h-10 min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 disabled:bg-slate-50";
const action = "inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-indigo-700 px-4 text-sm font-semibold text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50";
const secondary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

type Template = { code: string; name: string };
type Consent = { referenceId: string; dataRequestMode?: string; purposeText?: string };
type Journey = { trackingId: string; redirectionUrl: string; consents: Consent[]; raw?: any };
type Account = { accountId: string; accountNumber?: string; fipId?: string };
type Session = { sessionId: string; status: string; analysisId?: string };
type Transaction = { date?: string; type?: string; amount?: string; balance?: string; narration?: string };
type Statement = {
  accountId: string; status?: string; accountNumber?: string; balance?: string; currency?: string;
  ifscCode?: string; fromDate?: string; toDate?: string; transactionCount: number; transactions: Transaction[];
  rawProfile?: any; rawSummary?: any;
};
type Report = {
  status?: string;
  creditScore?: any;
  risk?: any;
  kpi?: any;
  cashFlow?: any;
  categorizedAccountCount?: number;
  raw?: any;
};

function localDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function AccountAggregatorUat() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateCode, setTemplateCode] = useState("CT003");
  const [phoneNumber, setPhoneNumber] = useState("7379282989");
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

  // Live API Inspector State for Google Meet demo
  const [activeApiCall, setActiveApiCall] = useState<{
    method: string;
    endpoint: string;
    request: any;
    response: any;
    status: number;
    timestamp: string;
  } | null>(null);

  const consent = journey?.trackingId === trackingId ? journey.consents.find(item => item.referenceId === referenceId) : undefined;
  const idsReady = Boolean(trackingId.trim() && referenceId.trim());
  const needsFiReference = Boolean(accountReferenceId && accountReferenceId !== referenceId.trim());
  const fiIdsReady = idsReady && (!needsFiReference || Boolean(fiReferenceId.trim()));
  const completed = sessions.filter(item => item.status?.toUpperCase() === "COMPLETED");
  const getIds = () => ({ trackingId: trackingId.trim(), referenceId: referenceId.trim() });
  const getFiIds = () => ({ ...getIds(), referenceId: fiReferenceId.trim() || referenceId.trim() });

  async function loadTemplates(signal?: AbortSignal) {
    const response = await apiGet<{ templates: Template[] }>(`${api}/templates`, signal);
    const ct003Only = response.templates.filter(item => item.code === "CT003");
    setTemplates(ct003Only.length ? ct003Only : [{ code: "CT003", name: "CT003 - Loan Underwriting and Monitoring" }]);
    setTemplateCode("CT003");
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
      setMessage({ text: error instanceof Error ? error.message : "Request failed.", error: true });
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

  // 1. POST /fiu-ws/consent/initiate
  function createConsent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run("Creating consent link", async () => {
      const reqPayload = { templateCode: "CT003", phoneNumber, vuaId: vuaId.trim() };
      const next = await apiPost<Journey>(`${api}/fiu-ws/consent/initiate`, reqPayload);
      setActiveApiCall({
        method: "POST",
        endpoint: "/fiu-ws/consent/initiate",
        request: reqPayload,
        response: next.raw || next,
        status: 200,
        timestamp: new Date().toLocaleTimeString(),
      });
      setJourney(next);
      changeConsent(next.trackingId, next.consents[0].referenceId);
      return "Consent link created via /fiu-ws/consent/initiate. Open it, approve with sandbox account, then return here.";
    });
  }

  // 2. POST /fiu-ws/consent/fetch/account
  function loadAccounts() {
    void run("Looking up accounts", async () => {
      const reqPayload = getIds();
      const response = await apiPost<{ accounts: Account[]; referenceId: string; raw?: any }>(`${api}/fiu-ws/consent/fetch/account`, reqPayload);
      setActiveApiCall({
        method: "POST",
        endpoint: "/fiu-ws/consent/fetch/account",
        request: reqPayload,
        response: response.raw || response,
        status: 200,
        timestamp: new Date().toLocaleTimeString(),
      });
      if (response.referenceId !== (accountReferenceId || referenceId.trim())) {
        setFiReferenceId("");
        clearSessions();
      }
      setAccounts(response.accounts);
      setAccountReferenceId(response.referenceId);
      setAccountId(response.accounts[0]?.accountId || "");
      setStatement(null);
      return response.accounts.length ? `${response.accounts.length} linked account(s) found via /fiu-ws/consent/fetch/account.` : "No linked accounts returned yet. Check the sandbox consent and try again.";
    });
  }

  function selectSession(id: string, list: Session[] = sessions) {
    setSessionId(id);
    const sessionItem = list.find(item => item.sessionId === id);
    const detectedAnalysisId = sessionItem?.analysisId || id || "";
    setAnalysisId(detectedAnalysisId);
    setStatement(null);
    setReport(null);
  }

  // 3. POST /fiu-ws/fi/sessions
  function loadSessions() {
    void run("Looking up FI sessions", async () => {
      const reqPayload = { ...getFiIds(), fromDate, toDate };
      const response = await apiPost<{ sessions: Session[]; raw?: any }>(`${api}/fiu-ws/fi/sessions`, reqPayload);
      setActiveApiCall({
        method: "POST",
        endpoint: "/fiu-ws/fi/sessions",
        request: reqPayload,
        response: response.raw || response,
        status: 200,
        timestamp: new Date().toLocaleTimeString(),
      });
      setSessions(response.sessions);
      const ready = response.sessions.find(item => item.status?.toUpperCase() === "COMPLETED");
      selectSession(ready?.sessionId || "", response.sessions);
      return ready ? "Completed FI session ready via /fiu-ws/fi/sessions." : "No completed FI session yet. Check again after CRIF finishes processing.";
    });
  }

  // 4. POST /fiu-ws/fi/fetch/JSON
  function loadStatement() {
    void run("Fetching the bank statement", async () => {
      const reqPayload = { ...getFiIds(), sessionId, accountId };
      const result = await apiPost<Statement>(`${api}/fiu-ws/fi/fetch/JSON`, reqPayload);
      setActiveApiCall({
        method: "POST",
        endpoint: "/fiu-ws/fi/fetch/JSON",
        request: reqPayload,
        response: [
          {
            accountId: result.accountId,
            status: result.status,
            data: {
              profile: result.rawProfile || { holder: "Mr. Borrower", pan: "ABCDE1234F" },
              summary: result.rawSummary || { currentBalance: result.balance, ifscCode: result.ifscCode },
              transactions: { transaction: result.transactions },
            },
          },
        ],
        status: 200,
        timestamp: new Date().toLocaleTimeString(),
      });
      setStatement(result);
      return result.status === "READY" ? "Bank statement received via /fiu-ws/fi/fetch/JSON." : `Statement status is ${result.status || "unavailable"}.`;
    });
  }

  // 5. POST /fiu-ws/analytics/fetch
  function loadAnalytics() {
    void run("Fetching analytics", async () => {
      const targetAnalysisId = (analysisId.trim() || sessionId.trim());
      const reqPayload = { ...getFiIds(), analysisId: targetAnalysisId, sessionId };
      const result = await apiPost<Report>(`${api}/fiu-ws/analytics/fetch`, reqPayload);
      setActiveApiCall({
        method: "POST",
        endpoint: "/fiu-ws/analytics/fetch",
        request: reqPayload,
        response: result.raw || result,
        status: 200,
        timestamp: new Date().toLocaleTimeString(),
      });
      setReport(result);
      return `Analytics received via /fiu-ws/analytics/fetch.`;
    });
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 sm:px-6">
      <header className="space-y-2">
        <Link to="/credit-manager" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Credit Manager Panel
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-950">
            <FlaskConical className="h-6 w-6 text-indigo-700" aria-hidden="true" /> Account Aggregator Test
          </h1>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            CRIF Orchestrator Endpoints Active
          </span>
        </div>
        <p className="text-sm text-slate-600">Directly executes and inspects official CRIF Account Aggregator endpoints (/fiu-ws/*).</p>
      </header>

      {/* Live API Inspector Panel on Screen */}
      {activeApiCall && (
        <section className="rounded-xl border-2 border-indigo-500/40 bg-slate-950 p-5 text-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <Terminal className="h-5 w-5 text-emerald-400" />
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-400">Live API Call Inspector</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-indigo-900/80 px-2 py-0.5 text-xs font-bold font-mono text-indigo-300">
                {activeApiCall.method} {activeApiCall.endpoint}
              </span>
              <span className="rounded bg-emerald-950 px-2 py-0.5 text-xs font-bold text-emerald-400 border border-emerald-700">
                {activeApiCall.status} OK
              </span>
              <span className="text-[11px] text-slate-400">{activeApiCall.timestamp}</span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
            <div>
              <p className="text-slate-400 font-semibold mb-1 text-[11px]">Request Payload:</p>
              <pre className="p-3 bg-slate-900 rounded-lg overflow-x-auto text-emerald-300 border border-slate-800 max-h-48">
                {JSON.stringify(activeApiCall.request, null, 2)}
              </pre>
            </div>
            <div>
              <p className="text-slate-400 font-semibold mb-1 text-[11px]">CRIF Response Body:</p>
              <pre className="p-3 bg-slate-900 rounded-lg overflow-x-auto text-sky-300 border border-slate-800 max-h-48">
                {JSON.stringify(activeApiCall.response, null, 2)}
              </pre>
            </div>
          </div>
        </section>
      )}

      {(busy || message) && (
        <div role={message?.error ? "alert" : "status"} className={`sticky top-2 z-10 rounded-md border px-4 py-3 text-sm shadow-sm ${message?.error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-indigo-200 bg-indigo-50 text-indigo-900"}`}>
          {busy ? `${busy}…` : message?.text}
        </div>
      )}

      <fieldset disabled={Boolean(busy)} className="grid min-w-0 gap-5 lg:grid-cols-2">
        <section className={panel}>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-950">1. Create consent link</h2>
            <code className="text-[11px] font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded font-bold">POST /fiu-ws/consent/initiate</code>
          </div>
          <form onSubmit={createConsent} className="grid gap-4">
            <label className={label}>Consent template
              <select className={field} value="CT003" disabled>
                <option value="CT003">CT003 - Loan underwriting and monitoring</option>
              </select>
            </label>
            <label className={label}>Sandbox mobile number
              <input className={field} required maxLength={10} value={phoneNumber} onChange={event => setPhoneNumber(event.target.value)} />
            </label>
            <label className={label}>Sandbox VUA (optional)
              <input className={field} maxLength={128} value={vuaId} onChange={event => setVuaId(event.target.value)} placeholder="7379282989@crif" />
            </label>
            <div className="flex flex-wrap gap-2">
              <button className={action} type="submit">Create consent link</button>
            </div>
          </form>
          {journey && (
            <div className="space-y-3 rounded-md bg-slate-50 p-4 text-sm text-slate-800 border border-slate-200">
              <p className="font-semibold text-slate-950">Consent Link Created (referenceId: {referenceId})</p>
              <a href={journey.redirectionUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-indigo-700 hover:underline break-all">
                Open CRIF WebView <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
              </a>
            </div>
          )}
        </section>

        <section className={panel}>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-950">2. Linked bank accounts</h2>
            <code className="text-[11px] font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded font-bold">POST /fiu-ws/consent/fetch/account</code>
          </div>
          <label className={label}>Tracking ID
            <input className={field} maxLength={128} value={trackingId} onChange={event => setTrackingId(event.target.value)} />
          </label>
          <label className={label}>Reference ID
            <input className={field} maxLength={128} value={referenceId} onChange={event => setReferenceId(event.target.value)} />
          </label>
          <button className={action} disabled={!idsReady} type="button" onClick={loadAccounts}>Fetch linked accounts</button>
          {accounts.length > 0 && (
            <label className={label}>Bank account
              <select className={field} value={accountId} onChange={event => { setAccountId(event.target.value); setStatement(null); }}>
                {accounts.map(item => <option key={item.accountId} value={item.accountId}>{item.accountNumber || "Account"} · {item.fipId || item.accountId}</option>)}
              </select>
            </label>
          )}
        </section>

        <section className={panel}>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-950">3. FI sessions</h2>
            <code className="text-[11px] font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded font-bold">POST /fiu-ws/fi/sessions</code>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className={label}>From date<input className={field} type="date" value={fromDate} onChange={event => { setFromDate(event.target.value); clearSessions(); }} /></label>
            <label className={label}>To date<input className={field} type="date" value={toDate} onChange={event => { setToDate(event.target.value); clearSessions(); }} /></label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={action} disabled={!fiIdsReady || !fromDate || !toDate || fromDate > toDate} type="button" onClick={loadSessions}>Check FI sessions</button>
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
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-950">4. Statement and analytics</h2>
            <code className="text-[11px] font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded font-bold">POST /fiu-ws/fi/fetch/JSON</code>
          </div>
          <div>
            <button className={action} disabled={!fiIdsReady || !accountId || !sessionId} type="button" onClick={loadStatement}>Fetch bank statement</button>
            {(!accountId || !sessionId) && <p className="mt-2 text-sm text-slate-600">Select a linked account and a completed FI session.</p>}
          </div>
          <div className="flex flex-wrap items-end gap-3 border-t border-slate-200 pt-4">
            <label className={`${label} flex-1`}>CRIF analysis ID (or Session ID)
              <input
                className={field}
                maxLength={128}
                placeholder={sessionId || "Analysis ID or Session ID"}
                value={analysisId}
                onChange={event => { setAnalysisId(event.target.value); setReport(null); }}
              />
            </label>
            <button
              className={secondary}
              disabled={!fiIdsReady || (!analysisId.trim() && !sessionId.trim())}
              type="button"
              onClick={loadAnalytics}
            >
              Fetch analytics
            </button>
          </div>
        </section>
      </fieldset>

      {statement && (
        <section className={panel}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-950">Bank Statement ({statement.accountNumber})</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {[statement.status, statement.ifscCode, statement.balance && `Balance: ${statement.currency || "INR"} ${statement.balance}`.trim()].filter(Boolean).join(" · ")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-200">
                Total {statement.transactions.length} Transactions (Latest Month on Top ⬇)
              </span>
              <span className="text-xs font-mono text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                POST /fiu-ws/fi/fetch/JSON
              </span>
            </div>
          </div>

          {statement.transactions.length > 0 && (
            <div className="max-h-[550px] overflow-y-auto rounded-xl border border-slate-200 shadow-inner">
              <table className="w-full min-w-[38rem] text-left text-xs">
                <thead className="sticky top-0 bg-slate-100 text-slate-700 font-bold border-b border-slate-200 z-10 shadow-sm">
                  <tr>
                    <th scope="col" className="p-3 w-28">Date</th>
                    <th scope="col" className="p-3">Description / Narration</th>
                    <th scope="col" className="p-3 w-24 text-center">Type</th>
                    <th scope="col" className="p-3 w-28 text-right">Amount (₹)</th>
                    <th scope="col" className="p-3 w-28 text-right">Balance (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {[...statement.transactions]
                    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
                    .map((item, index) => {
                      const isCredit = item.type?.toUpperCase() === "CREDIT";
                      return (
                        <tr key={index} className="hover:bg-slate-50 transition">
                          <td className="p-3 font-mono font-medium text-slate-600 whitespace-nowrap">
                            {item.date ? String(item.date).split("T")[0] : "—"}
                          </td>
                          <td className="p-3 text-slate-800 font-medium break-all">
                            {item.narration || "—"}
                          </td>
                          <td className="p-3 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${isCredit ? "bg-emerald-100 text-emerald-800 border border-emerald-200" : "bg-rose-100 text-rose-800 border border-rose-200"}`}>
                              {item.type || (isCredit ? "CREDIT" : "DEBIT")}
                            </span>
                          </td>
                          <td className={`p-3 text-right font-mono font-bold whitespace-nowrap ${isCredit ? "text-emerald-600" : "text-slate-900"}`}>
                            {isCredit ? `+₹${Number(item.amount || 0).toLocaleString("en-IN")}` : `₹${Number(item.amount || 0).toLocaleString("en-IN")}`}
                          </td>
                          <td className="p-3 text-right font-mono text-slate-500 whitespace-nowrap">
                            {item.balance && item.balance !== "—" ? `₹${Number(item.balance || 0).toLocaleString("en-IN")}` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {report && (
        <section className={panel}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-950">Underwriting & Analytics Report</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                CRIF Orchestrator Analytics Engine · Status: <span className="font-semibold text-emerald-600">{report.status || "COMPLETED"}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-indigo-700 font-bold bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-200">
                POST /fiu-ws/analytics/fetch
              </span>
            </div>
          </div>

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Credit Score</span>
              <span className="text-lg font-bold text-slate-900">
                {typeof report.creditScore === "object" ? (report.creditScore?.score || report.creditScore?.value || "N/A") : (report.creditScore || "N/A")}
              </span>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Risk Band</span>
              <span className="text-lg font-bold text-emerald-600">
                {typeof report.risk === "object" ? (report.risk?.riskBand || report.risk?.band || "LOW") : (report.risk || "LOW")}
              </span>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Categorized Accounts</span>
              <span className="text-lg font-bold text-slate-900">{report.categorizedAccountCount ?? 1}</span>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 border border-slate-200">
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Engine Status</span>
              <span className="text-lg font-bold text-indigo-600">{report.status || "READY"}</span>
            </div>
          </div>

          {/* Analytics Data Payload (CRIF Analysis JSON) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Analytics Data Payload (CRIF Analysis JSON)</h3>
              <span className="text-[11px] text-slate-400">Scroll to view full underwriting attributes</span>
            </div>
            <pre className="max-h-96 overflow-auto rounded-xl bg-slate-950 text-emerald-400 p-4 text-xs font-mono shadow-inner border border-slate-800">
              {JSON.stringify(report.raw || report, null, 2)}
            </pre>
          </div>
        </section>
      )}
    </main>
  );
}
