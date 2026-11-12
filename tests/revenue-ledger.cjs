const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const esbuild = require('../frontend/node_modules/esbuild');
const root = path.resolve(__dirname, '..');
function load(file, overrides = {}, globals = {}) {
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const code = esbuild.transformSync(source, { loader: file.endsWith('tsx') ? 'tsx' : 'ts', format: 'cjs', jsx: 'automatic' }).code;
  vm.runInNewContext(code, { module, exports: module.exports, Date, Intl, console, URLSearchParams, AbortController, ...globals,
    require: name => { if (!Object.hasOwn(overrides, name)) throw new Error(`Unexpected dependency: ${name}`); return overrides[name]; },
  });
  return module.exports;
}
const dateHelper = load('frontend/src/app/lib/accountingDateOnly.ts');
const ledger = load('frontend/src/app/lib/revenueLedger.ts', { './accountingDateOnly': dateHelper });
const { createRevenueLedger, revenueLoanStatus, revenueLedgerCsv, revenueReportCsv, getRevenueDate } = ledger;
const now = new Date('2026-11-12T12:00:00Z');
const fixtures = [
  { id: 'LN-OLD', customer: 'Older borrower', principal: 1000, processingFee: 118, startDate: '2026-10-01', amountPaid: 1200, totalAmount: 1200, balance: 0, status: 'Paid Off',
    repayments: [{ amount: 200, receivedAt: '2026-11-12T10:00:00+05:30' }, { amount: 1000, receivedAt: '2026-11-01T10:00:00+05:30' }] },
  { id: 'LN-NEW', customer: 'New borrower', principal: 2000, processingFee: 236, startDate: '2026-11-12', amountPaid: 0, totalAmount: 2500, balance: 2500, status: 'Active', repayments: [] },
  { id: 'LN-PART', customer: 'Partial borrower', principal: 1000, processingFee: 0, processing: 118, startDate: '2026-11-11', amountPaid: 500, totalAmount: 1200, balance: 700, status: 'Active', repayments: [{ amount: 500, receivedAt: '2026-11-12T12:00:00+05:30' }] },
];
const select = (filters, rows = fixtures) => createRevenueLedger(rows, filters, now);

test('custom date credits fees only on disbursement and ROI only on repayment', () => {
  const result = select({ timeframe: 'custom', from: '2026-11-12', to: '2026-11-12' });
  assert.equal(result.rows.length, 3);
  assert.equal(result.totals.principal, 2000);
  assert.equal(result.totals.fees, 236);
  assert.equal(result.totals.roi, 200);
  assert.equal(result.totals.totalIncome, 436);
  assert.equal(result.rows.find(row => row.id === 'LN-OLD').fees, 0);
});

test('lifetime ROI does not leak into an unrelated custom date', () => {
  const result = select({ timeframe: 'custom', from: '2026-10-01', to: '2026-10-01' });
  assert.equal(result.rows.length, 1);
  assert.equal(result.totals.roi, 0);
  assert.equal(result.totals.fees, 118);
  assert.equal(result.totals.totalIncome, 118);
});

test('repayments are allocated chronologically with principal recovered before ROI', () => {
  const result = select({ timeframe: 'custom', from: '2026-11-01', to: '2026-11-01' });
  assert.equal(result.totals.roi, 0);
  assert.equal(result.rows.length, 1);
  assert.equal(select({ timeframe: 'today' }).totals.roi, 200);
});

test('date bounds are inclusive and use the India reporting day', () => {
  const rows = [{ id: 'L1', principal: 100, processingFee: 0, amountPaid: 150, repayments: [
    { amount: 100, receivedAt: '2026-11-11T18:29:59Z' },
    { amount: 20, receivedAt: '2026-11-11T18:30:00Z' },
    { amount: 30, receivedAt: '2026-11-12T18:29:59Z' },
    { amount: 40, receivedAt: '2026-11-12T18:30:00Z' },
  ] }];
  assert.equal(select({ timeframe: 'custom', from: '2026-11-12', to: '2026-11-12' }, rows).totals.roi, 50);
  assert.equal(getRevenueDate('2026-11-11T18:30:00Z'), '2026-11-12');
  assert.equal(getRevenueDate('2026-11-12'), '2026-11-12');
});

test('today, yesterday, month, all and one-sided custom filters retain their meanings', () => {
  assert.equal(select({ timeframe: 'today' }).totals.totalIncome, 436);
  assert.equal(select({ timeframe: 'yesterday' }).totals.totalIncome, 0);
  assert.equal(select({ timeframe: 'month' }).totals.totalIncome, 436);
  assert.equal(select({ timeframe: 'all' }).totals.totalIncome, 554);
  assert.equal(select({ timeframe: 'custom', from: '2026-11-12' }).totals.totalIncome, 436);
  assert.equal(select({ timeframe: 'custom', to: '2026-10-01' }).totals.totalIncome, 118);
});

test('status filter uses the same classification as the table, including closed settlements', () => {
  const result = select({ timeframe: 'today', status: 'realized' });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].status, 'realized');
  assert.equal(result.totals.totalIncome, 200);
  assert.equal(revenueLoanStatus({ status: 'Settled', principal: 1000, amountPaid: 900, balance: 100 }), 'realized');
  assert.equal(revenueLoanStatus({ status: 'Active', principal: 1000, amountPaid: 0 }), 'pending');
  assert.equal(revenueLoanStatus({ status: 'Active', principal: 1000, totalAmount: 1200, amountPaid: 1150, balance: 50 }), 'partial');
});

test('search, dates and status combine without changing fee or income values', () => {
  const result = select({ timeframe: 'today', search: '  NEW BORROWER ', status: 'pending' });
  assert.equal(result.totals.count, 1);
  assert.equal(result.totals.principal, 2000);
  assert.equal(result.totals.totalIncome, 236);
  assert.equal(select({ timeframe: 'all', search: 'LN-NEW' }).totals.count, 1);
});

test('zero fees stay zero, empty results reset cards, and invalid ranges are flagged', () => {
  assert.equal(select({ timeframe: 'yesterday' }).rows[0].fees, 0);
  const empty = select({ timeframe: 'custom', from: '2030-01-01', to: '2030-01-02' });
  assert.ok(Object.values(empty.totals).every(value => value === 0));
  const invalid = select({ timeframe: 'custom', from: '2026-11-13', to: '2026-11-12' });
  assert.equal(invalid.invalidRange, true);
  assert.equal(invalid.rows.length, 0);
});

test('undated historical ROI stays in All instead of being assigned to a custom date', () => {
  const rows = [{ id: 'LEGACY', principal: 1000, amountPaid: 1300, totalRoi: 300, processingFee: 100, startDate: '2026-11-12' }];
  assert.equal(select({ timeframe: 'all' }, rows).totals.roi, 300);
  const custom = select({ timeframe: 'today' }, rows);
  assert.equal(custom.totals.roi, 0);
  assert.equal(custom.undatedRoi, 300);
});

test('failed repayment entries cannot generate realized revenue', () => {
  const rows = [{ id: 'FAILED', principal: 100, amountPaid: 110, repayments: [
    { amount: 100, receivedAt: '2026-11-01', status: 'received' },
    { amount: 999, receivedAt: '2026-11-12', status: 'failed' },
    { amount: 10, receivedAt: '2026-11-12', status: 'paid' },
  ] }];
  assert.equal(select({ timeframe: 'today' }, rows).totals.roi, 10);
});

test('card totals and CSV cover every filtered row rather than just the current page', () => {
  const rows = Array.from({ length: 23 }, (_, i) => ({ id: `LOAN-${i}`, customer: `Borrower ${i}`, principal: 100, processingFee: 10, startDate: '2026-11-12' }));
  const result = select({ timeframe: 'today' }, rows);
  assert.equal(result.totals.count, 23);
  assert.equal(result.totals.principal, 2300);
  assert.equal(result.totals.fees, 230);
  assert.equal(revenueLedgerCsv(result.rows).split('\n').length, 24);
  assert.equal(result.totals.totalIncome, result.rows.reduce((sum, row) => sum + row.totalIncome, 0));
});

test('CSV escapes borrower names and exports the same numbers as table rows', () => {
  const result = select({ timeframe: 'all' }, [{ ...fixtures[0], customer: 'Name, "quoted"' }]);
  const csv = revenueLedgerCsv(result.rows);
  assert.ok(csv.includes('"Name, ""quoted"""'));
  assert.ok(csv.includes('"1000","200","118","318","REALIZED"'));
});

test('report CSV puts the five filtered card values and status counts above transaction details', () => {
  const result = select({ timeframe: 'custom', from: '2026-11-12', to: '2026-11-12' });
  const csv = revenueReportCsv(result, 'Custom: 2026-11-12 to 2026-11-12', '2026-11-12');
  assert.ok(csv.startsWith('"Revenue Analytics"'));
  assert.ok(csv.includes('"Active filters","Custom: 2026-11-12 to 2026-11-12"'));
  assert.ok(csv.includes('"Export date","2026-11-12"'));
  assert.ok(csv.includes('"Currency","INR"'));
  assert.ok(csv.includes('"3","2000","200","236","436","",""'));
  assert.ok(csv.includes('"1","1","1","","","",""'));
  assert.ok(csv.indexOf('"Filtered transactions"') < csv.indexOf('"Borrower Name"'));
  assert.ok(csv.endsWith(revenueLedgerCsv(result.rows)));
});

test('export summary covers all matching pages and resets for an empty filter', () => {
  const rows = Array.from({ length: 23 }, (_, i) => ({ id: `LOAN-${i}`, principal: 100, processingFee: 10, startDate: '2026-11-12' }));
  const result = select({ timeframe: 'today' }, rows);
  const csv = revenueReportCsv(result, 'Today');
  assert.ok(csv.includes('"23","2300","0","230","230","",""'));
  assert.ok(csv.includes('"0","0","23","","","",""'));
  assert.ok(csv.includes('"LOAN-22"'));
  const empty = select({ timeframe: 'today', search: 'no matching borrower' }, rows);
  const emptyCsv = revenueReportCsv(empty, 'Today / Search: no matching borrower');
  assert.ok(emptyCsv.includes('"0","0","0","0","0","",""'));
  assert.ok(!emptyCsv.includes('"LOAN-'));
});

function panelFixture(rows = fixtures, fail = false) {
  const slots = [], effects = [], downloads = [], calls = [];
  let cursor = 0, dirty = true, tree;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = {
    useState(initial) {
      const i = cursor++; slots[i] ||= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, next => { const value = typeof next === 'function' ? next(slots[i].value) : next; if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; } }];
    },
    useMemo(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { value: fn(), deps }; return slots[i].value; },
    useEffect(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
  };
  const jsx = (type, props) => typeof type === 'function' ? type(props || {}) : ({ type, props: props || {} });
  const generic = new Proxy({}, { get: (_, key) => key === '__esModule' ? false : String(key) });
  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [now.getTime()])); } }
  const document = {
    body: { appendChild() {}, removeChild() {} },
    createElement() { return { setAttribute(key, value) { this[key] = value; }, click() { downloads.push(this); } }; },
  };
  const view = load('frontend/src/app/pages/product-admin/RevenueAnalyticsView.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'lucide-react': generic,
    '../../components/PartialDataNotice': generic,
    './RevenueAnalytics.css': {},
  });
  const page = load('frontend/src/app/pages/product-admin/RevenueAnalytics.tsx', {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    './RevenueAnalyticsView': view,
    '../../lib/revenueLedger': ledger,
    '../../lib/api': { apiGetAll: async (url, signal) => { calls.push({ url, signal }); if (fail) throw new Error('Synthetic report read failed'); return rows; } },
  }, { Date: FixedDate, document });
  function nodes(value) { if (arguments.length === 0) value = tree; if (!value || typeof value !== 'object') return []; if (Array.isArray(value)) return value.flatMap(nodes); return [value, ...nodes(value.props?.children)]; }
  function text(value) { if (value == null || typeof value === 'boolean') return ''; if (Array.isArray(value)) return value.map(text).join(' '); return typeof value === 'object' ? text(value.props?.children) : String(value); }
  return {
    downloads, calls, nodes,
    find: predicate => nodes().find(predicate),
    card(title) { const group = this.find(n => n.props?.['aria-label'] === title); return nodes(group).find(n => n.props?.className === 'revenue-metric__value')?.props.children; },
    async flush() {
      for (let i = 0; i < 40; i++) {
        if (dirty) { dirty = false; cursor = 0; tree = page.RevenueAnalytics(); effects.splice(0).forEach(fn => fn()); }
        for (let tick = 0; tick < 8; tick++) await Promise.resolve();
        if (!dirty && !effects.length) return;
      }
      throw new Error('Revenue screen did not settle');
    },
    async tab(label) { this.find(n => n.type === 'button' && text(n.props.children).trim() === label).props.onClick(); await this.flush(); },
    async input(label, value) { this.find(n => n.props?.['aria-label'] === label).props.onChange({ target: { value } }); await this.flush(); },
    async search(value) { this.find(n => n.props?.placeholder === 'Search borrower...').props.onChange({ target: { value } }); await this.flush(); },
  };
}

test('revenue screen updates cards, rows and CSV together when custom dates, status and search change', async () => {
  const h = panelFixture(); await h.flush();
  assert.equal(h.calls[0].url, '/loans');
  assert.ok(h.calls[0].signal instanceof AbortSignal);
  await h.tab('Custom');
  await h.input('Revenue from date', '2026-11-12');
  await h.input('Revenue to date', '2026-11-12');
  assert.equal(h.card('Filtered transactions'), '3');
  assert.match(h.card('Total income'), /436/);
  const table = h.find(n => n.type === 'tbody');
  assert.equal(h.nodes(table).filter(n => n.type === 'tr').length, 3);
  await h.input('Filter revenue status', 'realized');
  assert.equal(h.card('Filtered transactions'), '1');
  assert.match(h.card('Total income'), /200/);
  h.find(n => n.props?.title === 'Export Ledger CSV').props.onClick();
  const csv = decodeURIComponent(h.downloads.at(-1).href.split(',').slice(1).join(','));
  assert.ok(csv.includes('"1","0","200","0","200","",""'));
  assert.ok(csv.includes('"Active filters","Custom: 2026-11-12 to 2026-11-12 / realized"'));
  assert.ok(csv.includes('"Older borrower","LN-OLD","0","200","0","200","REALIZED"'));
  assert.ok(!csv.includes('New borrower'));
  await h.input('Filter revenue status', 'all');
  await h.search('new borrower');
  assert.equal(h.card('Filtered transactions'), '1');
  assert.match(h.card('Total income'), /236/);
  await h.search('not-a-borrower');
  assert.equal(h.card('Filtered transactions'), '0');
  assert.match(h.card('Total income'), /\D0$/);
});

test('screen pagination preserves complete filtered card totals and resets after changing filters', async () => {
  const rows = Array.from({ length: 23 }, (_, i) => ({ id: `LN-${i}`, customer: `Borrower ${i}`, principal: 100, processingFee: 10, startDate: '2026-11-12' }));
  const h = panelFixture(rows); await h.flush();
  assert.equal(h.card('Filtered transactions'), '23');
  await h.tab('Next');
  assert.equal(h.card('Filtered transactions'), '23');
  assert.match(h.card('Total income'), /230/);
  h.find(n => n.props?.title === 'Export Ledger CSV').props.onClick();
  const csv = decodeURIComponent(h.downloads.at(-1).href.split(',').slice(1).join(','));
  assert.ok(csv.includes('"23","2300","0","230","230","",""'));
  assert.ok(csv.includes('"Borrower 22","LN-22"'));
  await h.tab('Custom');
  await h.input('Revenue from date', '2030-01-02');
  await h.input('Revenue to date', '2030-01-01');
  assert.equal(h.card('Filtered transactions'), '0');
  assert.ok(h.find(n => n.props?.role === 'alert'));
  assert.equal(h.find(n => n.props?.title === 'Export Ledger CSV').props.disabled, true);
});

test('download preserves commas, quotes, Unicode and URI characters in borrower names and filters', async () => {
  const h = panelFixture([{ id: 'LN-SPECIAL', customer: 'रवि, "#A&B 50%"', principal: 100, processingFee: 10, startDate: '2026-11-12' }]);
  await h.flush();
  await h.search('#A&B 50%');
  h.find(n => n.props?.title === 'Export Ledger CSV').props.onClick();
  const download = h.downloads.at(-1);
  const csv = decodeURIComponent(download.href.slice(download.href.indexOf(',') + 1));
  assert.ok(!download.href.includes('#'), 'A borrower # cannot become a download URI fragment');
  assert.ok(csv.startsWith('\uFEFF"Revenue Analytics"'));
  assert.ok(csv.includes('"रवि, ""#A&B 50%""","LN-SPECIAL"'));
  assert.ok(csv.includes('"Active filters","All time / Search: #A&B 50%"'));
  assert.ok(csv.includes('"1","100","0","10","10","",""'));
});

test('failed report loads show unavailable cards and disable export', async () => {
  const h = panelFixture([], true); await h.flush();
  assert.equal(h.card('Total income'), 'Unavailable');
  assert.ok(h.find(n => n.props?.role === 'alert'));
  assert.equal(h.find(n => n.props?.title === 'Export Ledger CSV').props.disabled, true);
});

test('the entire revenue screen has one active filter and no separate fixed-period totals', async () => {
  const h = panelFixture(); await h.flush();
  const totals = h.find(n => n.props?.['aria-label'] === 'Filtered revenue totals');
  assert.equal(h.nodes(totals).filter(n => n.props?.role === 'group').length, 5);
  assert.equal(h.nodes().filter(n => n.type === 'button' && n.props.children === 'Today').length, 1);
  const activeLabel = () => JSON.stringify(h.find(n => n.props?.['aria-label'] === 'Active revenue filter').props.children);
  assert.match(activeLabel(), /All time/);
  await h.tab('Today');
  assert.match(activeLabel(), /Today/);
  assert.match(h.card('Total income'), /436/);
  await h.tab('Yesterday');
  assert.match(activeLabel(), /Yesterday/);
  assert.match(h.card('Total income'), /\D0$/);
  await h.tab('Custom');
  await h.input('Revenue from date', '2026-11-12');
  await h.input('Revenue to date', '2026-11-12');
  await h.input('Filter revenue status', 'pending');
  await h.search('new borrower');
  assert.match(activeLabel(), /Custom: 2026-11-12 to 2026-11-12 \/ pending \/ Search: new borrower/);
  assert.match(h.card('Total income'), /236/);
});
