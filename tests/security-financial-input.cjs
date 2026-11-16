const test = require('node:test');
const assert = require('node:assert/strict');
const { load, response, http } = require('./helpers/security-vm.cjs');
const financial = require('../backend/utils/financialInput');
const booleans = require('../backend/utils/adminScope');
function fixture() {
  const receipts = [], settlements = [];
  const context = { loan: { id: 'SYN-1', totalAmount: 12000, amountPaid: 2000, balance: 10000 }, lead: { id: 'APP-SYN-1', rawId: '1' } };
  const repayment = {
    findLoanContext: async () => context,
    findByReference: async reference => receipts.find(receipt => receipt.reference === reference),
    createRepayment: async (_, payload) => { receipts.push(payload); return { id: receipts.length, ...payload }; },
    refreshLoanAfterRepayment: async (_, options) => { settlements.push(options); return { balance: options.closeFully ? 0 : 10000 - receipts.reduce((sum, row) => sum + row.amount, 0), loanStatus: options.closeFully ? 'Paid Off' : 'Active' }; },
    repaymentSummaryByLead: async () => ({}),
  };
  const controller = load('backend/controllers/loanController.js', {
    '../utils/financialInput': financial, '../utils/adminScope': booleans,
    '../models/loanModel': { invalidateLoansCache() {} }, '../models/repaymentModel': repayment,
    '../models/leadStatusModel': { createForLead: async () => {} }, '../services/sourceStatusWebhookService': { dispatchRepaymentEvent: async () => {} },
    '../config/db': { query: async () => [] }, '../utils/http': http, xlsx: {},
    '../utils/readImportRows': {},
  });
  return { receipts, settlements, record: async body => { const res = response(); await controller.recordRepayment({ params: { id: 'SYN-1' }, body, user: { name: 'Synthetic Accountant' } }, res); return res; } };
}
test('partial repayment and explicit string false retain the outstanding balance', async () => {
  const f = fixture(), res = await f.record({ amount: '2500.50', closeFully: 'false', reference: 'SYN-UTR-1' });
  assert.equal(res.body.success, true); assert.equal(res.body.data.balance, 7499.5); assert.equal(f.settlements[0].closeFully, false); assert.equal(f.receipts[0].amount, 2500.5);
});
test('valid full-close with omitted amount still records the remaining balance', async () => {
  const f = fixture(), res = await f.record({ closeFully: true }); assert.equal(res.body.data.amount, 10000); assert.equal(res.body.data.balance, 0); assert.equal(f.receipts[0].amount, 10000);
});
test('explicit full settlement with partial amount keeps the established waiver behavior', async () => {
  const f = fixture(), res = await f.record({ amount: 6000, closeFully: true }); assert.equal(res.body.data.amount, 6000); assert.equal(res.body.data.balance, 0);
});
test('negative, non-finite, over-precision and typed-object amounts cannot reach receipt or balance writes', async () => {
  for (const amount of [-1, '-1', NaN, Infinity, 'NaN', '1e10', '5.001', true, [], {}]) {
    const f = fixture();
    try { const res = await f.record({ amount, closeFully: true }); assert.equal(res.statusCode, 400); } catch (error) { assert.equal(error.statusCode, 400); }
    assert.equal(f.receipts.length, 0); assert.equal(f.settlements.length, 0);
  }
});
test('malformed close flags cannot settle a loan', async () => {
  for (const closeFully of ['yes', [], {}, 'falsex']) { const f = fixture(); await assert.rejects(f.record({ amount: 100, closeFully }), error => error.statusCode === 400); assert.equal(f.receipts.length, 0); }
});
test('replaying a manual UTR cannot create a second receipt or settle twice', async () => {
  const f = fixture(); assert.equal((await f.record({ amount: 100, reference: 'SYN-RETRY' })).statusCode, 200);
  assert.equal((await f.record({ amount: 100, reference: 'SYN-RETRY' })).statusCode, 409); assert.equal(f.receipts.length, 1); assert.equal(f.settlements.length, 1);
});
