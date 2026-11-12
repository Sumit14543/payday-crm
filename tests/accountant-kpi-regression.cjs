const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { AsyncLocalStorage } = require('node:async_hooks');
const esbuild = require('../frontend/node_modules/esbuild');
const parser = require('../frontend/node_modules/@babel/parser');
const generate = require('../frontend/node_modules/@babel/generator').default;
const root = path.resolve(__dirname, '..');
const baselineRef = '67528b0cc5ca66e00bb9d6f151102011791b86f1';
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : ['2026-10-30T12:00:00Z'])); }
  static now() { return new FixedDate().getTime(); }
}
function source(file, baseline = false) {
  return baseline ? cp.execFileSync('git', ['show', `${baselineRef}:${file}`], { cwd: root, encoding: 'utf8', windowsHide: true }) : fs.readFileSync(path.join(root, file), 'utf8');
}
function load(file, overrides = {}, { globals = {}, fallback } = {}) {
  const filename = path.join(root, file), actualRequire = createRequire(filename);
  let code = source(file);
  if (/\.tsx?$/.test(file)) code = esbuild.transformSync(code, { loader: file.endsWith('.tsx') ? 'tsx' : 'ts', format: 'cjs', jsx: 'automatic', define: { 'import.meta.env': '{}' } }).code;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, console, __dirname: path.dirname(filename), __filename: filename,
    Date: FixedDate, URL, URLSearchParams, AbortController, Response, setTimeout, clearTimeout,
    require: name => Object.hasOwn(overrides, name) ? overrides[name] : fallback ? fallback(name) : actualRequire(name),
    ...globals,
  }, { filename });
  return module.exports;
}
function backend(queryImpl) {
  const tenantLocalStorage = new AsyncLocalStorage(), calls = [];
  const db = { tenantLocalStorage, query: async (sql, params = []) => {
    calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
    return queryImpl(sql, params);
  } };
  const cache = load('backend/utils/tenantCache.js', { '../config/db': db });
  return { calls, run: fn => tenantLocalStorage.run({ pool: {} }, fn), overrides: { '../config/db': db, '../utils/tenantCache': cache } };
}
function mutationCalls(file, baseline = false) {
  const calls = [];
  const ast = parser.parse(source(file, baseline), { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && /^(apiPost|apiPatch|apiDelete|apiPostForm)$/.test(node.callee.name)) calls.push(generate(node, { compact: true, comments: false }).code);
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'extra', 'comments', 'leadingComments', 'trailingComments', 'innerComments'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(ast);
  return calls;
}

const plain = value => JSON.parse(JSON.stringify(value));
const loans = [
  { loanId: 'LN1001', customerName: 'Alpha', principal: 1000, totalAmount: 1100, interestDue: 100, startDate: '2026-09-30', dueDate: '2026-10-10' },
  { loanId: 'LN1002', customerName: 'Beta', principal: 1000, totalAmount: 1200, interestDue: 200, startDate: '2026-10-10', dueDate: '2026-10-20' },
  { loanId: 'LN1003', customerName: 'Older loan', principal: 1000, totalAmount: 1100, interestDue: 100, startDate: '2026-08-01', dueDate: '2026-08-11' },
  { loanId: 'LN1004', customerName: 'Future loan', principal: 1000, totalAmount: 1100, interestDue: 100, startDate: '2026-10-31', dueDate: '2026-11-10' },
];
const repayments = [
  { loanId: '1001', interestComponent: 5, receivedAt: '2026-09-30' },
  { loanId: 'LN-1001', interestComponent: 20, receivedAt: '2026-10-05T00:00:00' },
  { loanId: 'LN1001', interestComponent: 15, receivedAt: '2026-10-10T23:59:59' },
  { loanId: 'LN1001', interestComponent: 40, receivedAt: '2026-10-11' },
  { loanId: 'LN1001', interestComponent: 10, receivedAt: '2026-10-25' },
  { loanId: 'LN1002', interestComponent: 30, receivedAt: '2026-10-12' },
  { loanId: 'LN1003', interestComponent: 30, receivedAt: '2026-10-13' },
];
const query = async sql => {
  if (/FROM loans loan/.test(sql)) return loans.map(row => ({ ...row }));
  if (/FROM loan_repayments\s+WHERE/.test(sql)) return repayments.map(row => ({ ...row }));
  throw new Error(`Unexpected query: ${sql}`);
};
const model = load('backend/models/accountReportModel.js', { '../config/db': { query } });
const range = (from = '2026-10-05', to = '2026-10-10') => ({ scope: 'range', from, to });

test('interest KPIs and loan rows use the selected range, including both date boundaries', async () => {
  const result = await model.getInterestReports(range());
  assert.deepEqual(plain(result.reports.accruedInterest.map(row => row.loanId)), ['LN1001']);
  assert.equal(result.summary.accruedInterest, 60);
  assert.equal(result.summary.bookedInterest, 100);
  assert.equal(result.summary.collectedInterest, 35);
  assert.equal(result.summary.interestReceivable, 25);
  assert.equal(result.summary.pendingBookedInterest, 65);
  assert.equal(result.summary.collectionRate, 58);
  assert.equal(result.summary.bookedReceiptRate, 35);
});

test('receivable and realization report filters have their own KPI totals', async () => {
  const result = await model.getInterestReports(range('2026-10-11', '2026-10-15'));
  assert.equal(result.summary.collectedInterest, 100);
  const receivable = result.reportSummaries.interestReceivable;
  assert.deepEqual(plain(result.reports.interestReceivable.map(row => row.loanId)), ['LN1002']);
  assert.equal(receivable.accruedInterest, 100);
  assert.equal(receivable.collectedInterest, 30);
  assert.equal(receivable.interestReceivable, 70);
  assert.equal(result.reportSummaries.interestRealization.collectedInterest, 100);
  assert.equal(result.reportSummaries.interestRealization.collectionRate, 100);
});

test('month and customer-month reports exclude receipts outside a partial-month filter', async () => {
  const result = await model.getInterestReports(range());
  for (const key of ['monthWise', 'dayWise', 'customerMonthWise']) {
    assert.equal(result.reportSummaries[key].accruedInterest, 60, key);
    assert.equal(result.reportSummaries[key].collectedInterest, 35, key);
    assert.equal(result.reports[key].reduce((sum, row) => sum + row.receivedInterest, 0), 35, key);
  }
});

test('customer-month report includes in-range receipts after the accrual period has ended', async () => {
  const result = await model.getInterestReports(range('2026-10-11', '2026-10-15'));
  const old = result.reports.customerMonthWise.find(row => row.loanId === 'LN1003');
  assert.ok(old);
  assert.equal(old.accruedInterest, 0);
  assert.equal(old.receivedInterest, 30);
  assert.equal(result.reportSummaries.customerMonthWise.collectedInterest, 100);
});

test('empty ranges reset all KPI amounts and rates to zero for every report type', async () => {
  const result = await model.getInterestReports(range('2026-12-01', '2026-12-03'));
  assert.equal(result.reports.accruedInterest.length, 0);
  for (const [key, summary] of Object.entries(result.reportSummaries)) {
    for (const [metric, amount] of Object.entries(summary)) assert.equal(amount, 0, `${key}.${metric}`);
  }
});

test('reversed date bounds preserve the normalized range and results', async () => {
  assert.deepEqual(plain(await model.getInterestReports(range('2026-10-10', '2026-10-05'))), plain(await model.getInterestReports(range())));
});

test('other report consumers retain the exact existing response and SQL without opting in', async () => {
  const filename = 'backend/models/accountReportModel.js';
  const baselineSource = source(filename, true);
  const module = { exports: {} };
  const traces = [[], []];
  const tracedQuery = index => async (sql, params) => {
    traces[index].push({ sql, params: plain(params || []) });
    return query(sql);
  };
  const current = load(filename, { '../config/db': { query: tracedQuery(0) } });
  vm.runInNewContext(baselineSource, { module, exports: module.exports, Date: FixedDate, require: name => {
    assert.equal(name, '../config/db'); return { query: tracedQuery(1) };
  } });
  for (const filters of [{}, { from: '2026-10-05', to: '2026-10-10' }, { from: '2026-12-01', to: '2026-12-03' }]) {
    assert.deepEqual(plain(await current.getInterestReports(filters)), plain(await module.exports.getInterestReports(filters)));
  }
  assert.deepEqual(traces[0], traces[1]);
});

const queueRows = Array.from({ length: 23 }, (_, i) => ({
  id: `APP-${5000 + i}`, rawId: String(5000 + i), customerName: `${i < 12 ? 'Alpha' : 'Beta'} ${i}`,
  loanAmount: 1000 + i, disbursementAmount: 900 + i, processingFee: 10, gstAmount: 2,
  bankName: 'Test Bank', accountNumber: `TEST-${i}`, ifscCode: i % 2 ? '' : 'TEST0000001',
}));
function queueFixture() {
  const h = backend(async sql => /FROM loan_applications la/.test(sql) ? queueRows.map(row => ({ ...row })) : []);
  const queue = load('backend/models/telecallerModel.js', { ...h.overrides, './leadModel': {} });
  return filters => h.run(() => queue.listAccountingQueueV2(filters));
}

test('queue KPI totals cover every search match across pages and reset when search is cleared', async () => {
  const request = queueFixture();
  const first = await request({ page: 1, pageSize: 5, search: '  ALPHA  ' });
  assert.equal(first.pagination.totalItems, 12);
  assert.equal(first.items.length, 5);
  assert.deepEqual(plain(first.stats), { bankReadyCount: 6, feeTotal: 144, totalDisbursement: 10866, totalLoanAmount: 12066, totalQueue: 12 });
  const last = await request({ page: 3, pageSize: 5, search: 'alpha' });
  assert.equal(last.items.length, 2);
  assert.deepEqual(plain(last.stats), plain(first.stats));
  const empty = await request({ page: 3, pageSize: 5, search: 'does-not-exist' });
  assert.ok(Object.values(empty.stats).every(value => value === 0));
  assert.equal((await request({ page: 1, pageSize: 5, search: '' })).stats.totalQueue, 23);
});

// Render the actual panel with a small hook runner and deterministic read-only APIs.
// No database, network, payment or loan mutation is performed by these tests.
function panelFixture() {
  const slots = [], effects = [], calls = [], timers = new Map();
  let cursor = 0, dirty = true, tree, timerId = 0, controller;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = {
    useState(initial) {
      const i = cursor++; slots[i] ||= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, next => { const value = typeof next === 'function' ? next(slots[i].value) : next; if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; } }];
    },
    useMemo(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { value: fn(), deps }; return slots[i].value; },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
  };
  const queue = queueFixture();
  const api = { apiGet: async (url) => {
    calls.push(url);
    const params = Object.fromEntries(new URL(url, 'http://fixture').searchParams);
    if (url.startsWith('/accounts/reports/interest')) return model.getInterestReports(params);
    if (url.startsWith('/leads/accounting-queue-v2')) return queue(params);
    return { items: [], pagination: { page: 1, totalPages: 1, totalItems: 0 }, stats: { dueSoonCount: 0, overdueCount: 0, totalDisbursed: 0 } };
  } };
  const jsx = (type, props) => ({ type, props: props || {} });
  const generic = new Proxy({}, { get: (_, key) => key === '__esModule' ? false : String(key) });
  const updated = new FixedDate();
  const panel = load('frontend/src/app/pages/AccountantPanel.tsx', {}, {
    fallback: name => {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name.endsWith('/lib/api')) return api;
      if (name.endsWith('/lib/useSmartPolling')) return { useSmartPolling: loader => ({ isRefreshing: false, lastUpdatedAt: updated, refresh: react.useCallback(() => {
        controller?.abort(); controller = new AbortController(); return loader(controller.signal);
      }, [loader]) }) };
      return generic;
    },
    globals: { window: { setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id) } },
  });
  function nodes(value) { if (arguments.length === 0) value = tree; if (!value || typeof value !== 'object') return []; if (Array.isArray(value)) return value.flatMap(nodes); return [value, ...nodes(value.props?.children)]; }
  function text(value) { if (value == null || typeof value === 'boolean') return ''; if (Array.isArray(value)) return value.map(text).join(' '); return typeof value === 'object' ? text(value.props?.children) : String(value); }
  return {
    calls, nodes,
    find: predicate => nodes().find(predicate),
    card: title => nodes().find(n => n.type === 'MetricCard' && n.props.title === title)?.props,
    async flush() {
      for (let n = 0; n < 40; n++) {
        if (dirty) { dirty = false; cursor = 0; tree = panel.AccountantPanel(); effects.splice(0).forEach(fn => fn()); }
        for (let tick = 0; tick < 12; tick++) await Promise.resolve();
        if (!dirty && !effects.length) return;
      }
      throw new Error('Panel did not settle');
    },
    async dates(from, to) {
      this.find(n => n.props?.['aria-label'] === 'Interest report from date').props.onChange({ target: { value: from } });
      this.find(n => n.props?.['aria-label'] === 'Interest report to date').props.onChange({ target: { value: to } });
      await this.flush();
    },
    async report(key) { this.find(n => n.props?.ariaLabel === 'Select interest report').props.onValueChange(key); await this.flush(); },
    async search(value) {
      this.find(n => n.type === 'input' && /Search customer/.test(n.props.placeholder || '')).props.onChange({ target: { value } });
      await this.flush(); const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); await this.flush();
    },
    async nextInterestPage() { this.find(n => n.type === 'button' && text(n.props.children).trim() === 'Next').props.onClick(); await this.flush(); },
  };
}

test('panel date/report filters update all four cards, including empty results', async () => {
  const h = panelFixture(); await h.flush();
  assert.ok(h.calls.some(url => url.includes('/accounts/reports/interest?') && url.includes('scope=range')));
  await h.dates('2026-10-05', '2026-10-10');
  assert.match(h.card('Accrued Interest').metric, /60/);
  assert.match(h.card('Interest Realized').metric, /35/);
  assert.match(h.card('Interest Receivable').metric, /25/);
  assert.match(h.card('Booked Pending').metric, /65/);
  await h.dates('2026-10-11', '2026-10-15'); await h.report('interestReceivable');
  assert.match(h.card('Interest Realized').metric, /30/);
  assert.match(h.card('Interest Receivable').metric, /70/);
  assert.equal(h.card('Accrued Interest').note, '30% collected');
  await h.dates('2026-12-01', '2026-12-03');
  for (const title of ['Accrued Interest', 'Interest Realized', 'Interest Receivable', 'Booked Pending']) assert.match(h.card(title).metric, /\D0$/);
});

test('panel search changes queue cards while report pagination keeps full filtered totals', async () => {
  const h = panelFixture(); await h.flush();
  await h.search('Alpha');
  assert.match(h.card('Ready loan amount').metric, /12,066/);
  assert.match(h.card('Net disbursement').metric, /10,866/);
  assert.equal(h.card('Bank ready').metric, '6');
  await h.search('no-match'); assert.match(h.card('Ready loan amount').metric, /\D0$/);
  await h.search(''); assert.equal(h.card('Ready loan amount').note, '23 signed agreements');
  await h.report('dayWise');
  const before = h.card('Accrued Interest').metric;
  await h.nextInterestPage(); assert.equal(h.card('Accrued Interest').metric, before);
});

test('accountant payment and repayment-link mutation requests are unchanged', () => {
  assert.deepEqual(mutationCalls('frontend/src/app/pages/AccountantPanel.tsx'), mutationCalls('frontend/src/app/pages/AccountantPanel.tsx', true));
});
