const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { statementsFromRows } = require('../backend/services/accountAggregatorStatements');

function load(file, overrides) {
  const filename = path.resolve(__dirname, '..', file);
  const actualRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, console, __dirname: path.dirname(filename), __filename: filename,
    require: name => Object.hasOwn(overrides, name) ? overrides[name] : actualRequire(name),
  }, { filename });
  return module.exports;
}
const tx = (narration, amount = 100) => ({ date: '2026-11-01', narration, type: 'CREDIT', amount, transactionalBalance: 0 });
const row = (id, rawFiData) => ({ id, rawAnalyticsJson: JSON.stringify({ rawFiData }), createdAt: '2026-11-16' });
const account = (accountNumberMasked, transactions) => ({ accountDetails: { bankName: 'Test Bank', accountNumberMasked, balance: 0 }, transactions });

test('saved multi-bank FI data keeps each bank transactions separate and ignores copied root transactions', () => {
  const data = row(2, {
    0: { bankName: 'Axis Bank', data: { Summary: { maskedAccNumber: '123456789012', ifsc: 'UTIB0000001', currentBalance: '1,500.25' }, Transactions: { Transaction: [tx('Axis only', '1,000')] } } },
    1: { data: { account: { summary: { maskedAccNumber: 'XXXX5678', ifsc: 'UBIN0000001' }, transactions: { transaction: [tx('Union only', 200)] } } } },
    accountDetails: { bankName: 'Root summary', accountNumberMasked: 'XXXX9012' }, transactions: [tx('Copied root')],
  });
  const result = statementsFromRows([data]);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map(x => x.bankName), ['Axis Bank', 'Union Bank of India']);
  assert.deepEqual(result.map(x => x.transactions.map(t => t.narration)), [['Axis only'], ['Union only']]);
  assert.equal(result[0].maskedAccountNumber, 'XXXX9012');
  assert.equal(result[0].balance, 1500.25);
  assert.equal(result[0].transactions[0].amount, 1000);
  assert.equal(result[0].transactions[0].balance, 0);
  assert.ok(!JSON.stringify(result).includes('123456789012'));
});

test('legacy payload, single transaction and account arrays are supported', () => {
  const result = statementsFromRows([
    row(3, account('XXXX1111', [tx('Legacy')])),
    row(2, [{ Account: { Summary: { accountNumber: '00002222', bankName: 'Other Bank' }, Transactions: { Transaction: { txnDate: '2026-10-01', description: 'Single', txnType: 'DR', txnAmount: '10.50' } } } }]),
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[1].transactions[0].type, 'DEBIT');
  assert.equal(result[1].transactions[0].amount, 10.5);
  assert.equal(result[1].transactions[0].balance, null);
});

test('newest populated statement wins while a later empty placeholder does not erase existing transactions', () => {
  const result = statementsFromRows([
    row(5, account('XXXX1111', [])), row(4, account('00001111', [tx('Keep existing')])), row(3, account('XXXX1111', [tx('Old version')])),
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].transactions[0].narration, 'Keep existing');
  assert.equal(statementsFromRows([row(6, account('XXXX1111', []))])[0].transactions.length, 0);
  assert.deepEqual(statementsFromRows([{ id: 1, rawAnalyticsJson: 'broken JSON' }, row(2, {}), row(3, { accountDetails: { accountNumberMasked: 'Pending FIP Sync' }, transactions: [] })]), []);
});

test('loan lookup uses only recorded application/loan relationships and does not call AA provider APIs', async () => {
  const queries = [];
  const model = load('backend/models/accountAggregatorModel.js', {
    '../config/db': { query: async (sql, params) => { queries.push({ sql, params: Array.from(params) }); return [row(1, account('XXXX1111', [tx('Safe')]))]; } },
  });
  for (const id of ['', '  ', undefined, null]) assert.equal((await model.findStatementsForLoan(id)).length, 0);
  assert.equal(queries.length, 0);
  const statements = await model.findStatementsForLoan('LOAN-A-R2');
  assert.equal(statements.length, 1);
  assert.deepEqual(queries[0].params, ['LOAN-A-R2', 'LOAN-A-R2']);
  assert.match(queries[0].sql, /analytics\.application_id = application\.application_id/);
  assert.match(queries[0].sql, /analytics\.application_id = CAST\(application\.id AS CHAR\)/);
  assert.match(queries[0].sql, /schedule\.loan_id = \?/);
  assert.match(queries[0].sql, /payment\.loan_id = \?/);
  assert.doesNotMatch(queries[0].sql, /phone|mobile|full_name|LIKE|INSERT|UPDATE|DELETE/i);
});

test('collection controller checks the selected case before loading statements and disables response caching', async () => {
  let selectedCase = null;
  const calls = [];
  const controller = load('backend/controllers/collectionController.js', {
    '../models/collectionModel': { findCaseById: async () => selectedCase },
    '../models/leadStatusModel': {}, '../models/repaymentModel': {}, '../models/documentRequestModel': {},
    '../models/accountAggregatorModel': { findStatementsForLoan: async id => { calls.push(id); return [{ id: 'aa-1' }]; } },
    '../services/sourceStatusWebhookService': {}, './referenceController': {}, '../config/uploads': {},
  });
  const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, status() { return this; }, json(body) { this.body = body; return this; } };
  await assert.rejects(controller.getAccountAggregatorStatements({ params: { caseId: 'MISSING' } }, res), error => error.statusCode === 404);
  assert.deepEqual(calls, []);
  selectedCase = { loanId: 'LOAN-A-R2' };
  await controller.getAccountAggregatorStatements({ params: { caseId: 'CASE-A' } }, res);
  assert.deepEqual(calls, ['LOAN-A-R2']);
  assert.equal(res.headers['Cache-Control'], 'private, no-store');
  assert.equal(res.body.success, true);
});

test('AA statement route requires collection access without expanding permissions on consent/reset endpoints', () => {
  const routes = [];
  const router = {};
  for (const method of ['get', 'post', 'patch']) router[method] = (path, ...handlers) => routes.push({ path, handlers });
  const handler = () => {};
  load('backend/routes/collectionRoutes.js', {
    express: { Router: () => router }, '../controllers/collectionController': { getAccountAggregatorStatements: handler },
    '../controllers/referenceController': {}, '../middleware/auth': { requireRole: roles => ({ roles: Array.from(roles) }) },
    '../utils/asyncHandler': value => value, '../config/uploads': { ensureUploadDir: () => '/test-uploads' },
  });
  const route = routes.find(x => x.path === '/:caseId/account-aggregator-statements');
  assert.deepEqual(route.handlers[0].roles, ['collection']);
  assert.equal(route.handlers[1], handler);
});
