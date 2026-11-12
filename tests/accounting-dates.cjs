const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');

if (!process.env.ACCOUNTING_DATE_TEST_CHILD) {
  for (const timezone of ['Asia/Kolkata', 'UTC', 'America/Los_Angeles']) {
    execFileSync(process.execPath, [__filename], {
      env: { ...process.env, TZ: timezone, ACCOUNTING_DATE_TEST_CHILD: '1' },
      stdio: 'inherit', windowsHide: true,
    });
  }
} else {
  const root = path.resolve(__dirname, '..');
  const esbuild = require('../frontend/node_modules/esbuild');
  const helper = { exports: {} };
  vm.runInNewContext(esbuild.transformSync(fs.readFileSync(path.join(root, 'frontend/src/app/lib/accountingDateOnly.ts'), 'utf8'), {
    loader: 'ts', format: 'cjs',
  }).code, { module: helper, exports: helper.exports, Date, Intl });
  const { accountingDateOnly } = helper.exports;
  assert.equal(accountingDateOnly('2026-12-07'), '2026-12-07');
  assert.equal(accountingDateOnly('2026-12-07 00:00:00'), '2026-12-07');
  assert.equal(accountingDateOnly('2026-12-06T18:30:00.000Z'), '2026-12-07');
  assert.equal(accountingDateOnly('2026-12-07T00:00:00+05:30'), '2026-12-07');
  assert.equal(accountingDateOnly('2026-12-31T18:30:00Z'), '2027-01-01');
  assert.equal(accountingDateOnly('2028-02-28T18:30:00Z'), '2028-02-29');
  assert.equal(accountingDateOnly(null), '');
  assert.equal(accountingDateOnly('invalid'), '');

  const source = fs.readFileSync(path.join(root, 'frontend/src/app/pages/AccountantPanel.tsx'), 'utf8');
  const extraction = source.match(/const leadDueIso = ([^;]+);/);
  assert.ok(extraction);
  const input = { lead: { dueDate: '2026-12-06T18:30:00.000Z' }, accountingDateOnly };
  vm.runInNewContext(`globalThis.dueDate = ${extraction[1]};`, input);
  assert.equal(input.dueDate, '2026-12-07');

  const databaseDue = new Date(2026, 11, 7);
  const originalTimestamp = new Date('2026-11-12T05:00:00Z');
  const traces = [];
  let savedLoan;
  const query = async (sql, params = []) => {
    traces.push({ sql, params });
    if (/FROM loan_applications la/.test(sql)) return [{
      id: 'APP-DATE', rawId: '90001', agreementNumber: 'LN-DATE',
      customerName: 'Date regression fixture', dueDate: databaseDue,
      loanAmount: 20000, disbursementAmount: 17640, repaymentAmount: 25000,
      tenureDays: 25, esignDate: originalTimestamp,
    }];
    if (/COUNT\(\*\) AS totalItems/.test(sql)) return [{ totalItems: 1 }];
    if (/payment.id AS paymentId/.test(sql)) return [{
      paymentId: 1, loanId: 'LN-DATE', startDate: new Date(2026, 10, 12),
      dueDate: databaseDue, nextPaymentDate: databaseDue, disbursedAt: originalTimestamp,
    }];
    if (/INSERT INTO loans/.test(sql)) savedLoan = {
      id: params[0], customer_id: params[1], total_amount: params[4],
      start_date: params[6], due_date: params[7], next_payment_date: params[8],
    };
    if (/SELECT \* FROM loans WHERE id/.test(sql)) return savedLoan ? [savedLoan] : [];
    return [];
  };
  const filename = path.join(root, 'backend/models/telecallerModel.js');
  const actualRequire = createRequire(filename);
  const model = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module: model, exports: model.exports, Date, console,
    require: name => {
      if (name === '../config/db') return { query };
      if (name === '../utils/tenantCache') return { createTenantCache: () => ({ clear() {}, get() {}, set() {}, getOrLoad: (_key, loader) => loader() }) };
      if (name === './leadModel') return {};
      return actualRequire(name);
    },
  });

  (async () => {
    const queue = JSON.parse(JSON.stringify(await model.exports.listAccountingQueueV2()));
    assert.equal(queue.items[0].dueDate, '2026-12-07');
    assert.equal(queue.items[0].esignDate, originalTimestamp.toISOString());
    const modalDue = accountingDateOnly(queue.items[0].dueDate);
    await model.exports.activateLoanForDisbursement(
      { id: 'APP-DATE', rawId: '90001', name: 'Date regression fixture' },
      { id: 1, agreementNumber: 'LN-DATE', principalAmount: 20000, repaymentAmount: 25000, tenureDays: 25 },
      { loanId: 'LN-DATE', disbursementDate: '2026-11-12', dueDate: modalDue, tenureDays: 25 },
    );
    assert.equal(savedLoan.due_date, '2026-12-07');
    assert.equal(savedLoan.next_payment_date, '2026-12-07');
    assert.equal(savedLoan.total_amount, 25000);
    assert.equal(traces.find(call => /INSERT INTO loan_repayment_schedule/.test(call.sql)).params[4], '2026-12-07');
    const sanctionUpdate = traces.find(call => /UPDATE lead_sanctions SET due_date/.test(call.sql));
    assert.equal(sanctionUpdate.params[0], '2026-12-07');
    assert.equal(sanctionUpdate.params[1], 25);

    const recent = JSON.parse(JSON.stringify(await model.exports.listRecentAccountingPaymentsV2()));
    assert.equal(recent.items[0].startDate, '2026-11-12');
    assert.equal(recent.items[0].dueDate, '2026-12-07');
    assert.equal(recent.items[0].nextPaymentDate, '2026-12-07');
    assert.equal(recent.items[0].disbursedAt, originalTimestamp.toISOString());
    console.log(`Accounting due date, tenure, schedule and timestamp checks passed (${process.env.TZ}).`);
  })().catch(error => { console.error(error); process.exitCode = 1; });
}
