const test = require('node:test'), assert = require('node:assert/strict');
const { AsyncLocalStorage } = require('node:async_hooks');
const { load, response } = require('./helpers/security-vm.cjs');

function fixture(options = {}) {
  const initial = { id: 10, lead_id: '71', application_id: 'APP-SYN', decision_token: 'SYN-TOKEN',
    customer_decision: 'pending', status: 'sent', created_at: '2026-11-16 10:00:00',
    borrower: 'Synthetic borrower', agreement_number: 'SYN-10', principal_amount: 10000,
    ...options.row };
  let rows = [initial, ...(options.extraRows || [])];
  let leadStatus = 'Recommended', activities = [], mails = 0, writes = 0;
  const local = new AsyncLocalStorage();
  let tail = Promise.resolve();
  async function withTransaction(callback) {
    if (local.getStore()) return callback();
    const before = tail; let release; tail = new Promise(resolve => { release = resolve; });
    await before;
    const snapshot = structuredClone({ rows, leadStatus, activities, writes });
    const tasks = [];
    let result;
    try { result = await local.run(tasks, callback); }
    catch (error) { ({ rows, leadStatus, activities, writes } = snapshot); throw error; }
    finally { release(); }
    await Promise.allSettled(tasks.map(task => task()));
    return result;
  }
  const db = {
    withTransaction, afterCommit(task) { local.getStore().push(task); return true; },
    query: async (sql, params) => {
      const text = sql.replace(/\s+/g, ' ').trim();
      if (/^UPDATE lead_sanctions SET customer_decision =/.test(text)) {
        const row = rows.find(row => row.id === params[5]);
        if (!row || row.customer_decision !== 'pending' || row.status === 'superseded' || row.superseded_by_sanction_id) return { affectedRows: 0 };
        Object.assign(row, { customer_decision: params[0], status: params[0] }); writes++;
        return { affectedRows: 1 };
      }
      if (/WHERE decision_token =/.test(text)) return structuredClone(rows.filter(row => row.decision_token === params[0]).slice(0, 1));
      if (/WHERE id =/.test(text)) return structuredClone(rows.filter(row => row.id === params[0]).slice(0, 1));
      if (/FROM lead_sanctions WHERE lead_id =/.test(text)) {
        const matches = rows.filter(row => row.lead_id === params[0] || row.application_id === params[1]).sort((a, b) => b.id - a.id);
        return structuredClone(matches.slice(0, 1));
      }
      throw new Error('Unexpected synthetic SQL: ' + text);
    },
  };
  const model = load('backend/models/sanctionModel.js', { '../config/db': db, '../utils/sanctionDates': { databaseDateOnly: value => value || '' } });
  const service = load('backend/services/customerSanctionDecisionService.js', {
    '../config/db': db, '../models/sanctionModel': model,
    '../models/leadModel': {
      findById: async () => ({ rawId: '71', id: 'APP-SYN', name: 'Synthetic borrower' }),
      updateStatus: async (_id, status) => { if (options.failLead) throw new Error('Synthetic lead failure'); leadStatus = status; },
    },
    '../models/activityModel': { createForLead: async (_lead, activity) => { if (options.failActivity) throw new Error('Synthetic activity failure'); activities.push(activity); } },
    './sanctionLetterService': { sendSanctionDecisionConfirmationEmail: async () => { if (options.failMail) throw new Error('Synthetic mail failure'); mails++; } },
  }, { console: { error() {} } });
  return { model, service, state: () => ({ rows, leadStatus, activities, mails, writes }) };
}

test('sanction preview leaves pending decision and lead untouched', async () => {
  const f = fixture(), value = await f.service.preview('SYN-TOKEN');
  assert.equal(value.pendingDecision, true); assert.equal(f.state().writes, 0);
  assert.equal(f.state().leadStatus, 'Recommended'); assert.equal(f.state().mails, 0);
});

for (const action of ['accept', 'reject']) test(`confirmed ${action} preserves the correct decision, status and one confirmation`, async () => {
  const f = fixture(), result = await f.service.record('SYN-TOKEN', action);
  const accepted = action === 'accept';
  assert.equal(result.customerDecision, accepted ? 'accepted' : 'rejected');
  assert.equal(f.state().leadStatus, accepted ? 'Approved' : 'Rejected');
  assert.equal(f.state().writes, 1); assert.equal(f.state().activities.length, 1);
  assert.equal(f.state().mails, 1); assert.equal(result.confirmationEmailSent, true);
});

test('simultaneous opposite responses use the persisted winner and do not duplicate activity/mail', async () => {
  const f = fixture();
  const results = await Promise.all([f.service.record('SYN-TOKEN', 'accept'), f.service.record('SYN-TOKEN', 'reject')]);
  assert.equal(results[0].customerDecision, results[1].customerDecision);
  assert.equal(f.state().rows[0].customer_decision, results[0].customerDecision);
  assert.equal(f.state().leadStatus, results[0].customerDecision === 'accepted' ? 'Approved' : 'Rejected');
  assert.equal(f.state().writes, 1); assert.equal(f.state().activities.length, 1); assert.equal(f.state().mails, 1);
  assert.equal(results.filter(result => result.alreadyDecided).length, 1);
});

test('repeat POST cannot reverse an already rejected sanction or approve its lead', async () => {
  const f = fixture(); await f.service.record('SYN-TOKEN', 'reject');
  const retry = await f.service.record('SYN-TOKEN', 'accept');
  assert.equal(retry.customerDecision, 'rejected'); assert.equal(retry.alreadyDecided, true);
  assert.equal(f.state().leadStatus, 'Rejected'); assert.equal(f.state().writes, 1);
});

for (const fail of ['failLead', 'failActivity']) test(`${fail}: decision and lead roll back together without confirmation mail`, async () => {
  const f = fixture({ [fail]: true });
  await assert.rejects(f.service.record('SYN-TOKEN', 'accept'), /Synthetic/);
  assert.equal(f.state().rows[0].customer_decision, 'pending'); assert.equal(f.state().leadStatus, 'Recommended');
  assert.equal(f.state().activities.length, 0); assert.equal(f.state().mails, 0);
});

test('mail outage does not report an uncommitted decision or undo committed customer acceptance', async () => {
  const f = fixture({ failMail: true }), result = await f.service.record('SYN-TOKEN', 'accept');
  assert.equal(result.success, true); assert.equal(result.confirmationEmailSent, false);
  assert.equal(f.state().rows[0].customer_decision, 'accepted'); assert.equal(f.state().leadStatus, 'Approved');
});

for (const row of [{ status: 'superseded' }, { superseded_by_sanction_id: 11 }]) test('superseded pending sanction cannot be accepted through an old token', async () => {
  const f = fixture({ row });
  await assert.rejects(f.service.preview('SYN-TOKEN'), error => error.statusCode === 409);
  await assert.rejects(f.service.record('SYN-TOKEN', 'accept'), error => error.statusCode === 409);
  assert.equal(f.state().writes, 0); assert.equal(f.state().mails, 0);
});

test('write boundary rejects an old token after resend, and rejects a newer replacement even before supersede flag', async () => {
  const f = fixture();
  await assert.rejects(f.model.updateCustomerDecision(10, { decision: 'accepted', expectedToken: 'SYN-OLD' }), error => error.statusCode === 409);
  const newer = fixture({ extraRows: [{ id: 11, lead_id: '71', application_id: 'APP-SYN', created_at: '2026-11-16 11:00:00', status: 'sent' }] });
  await assert.rejects(newer.model.updateCustomerDecision(10, { decision: 'accepted', expectedToken: 'SYN-TOKEN' }), error => error.statusCode === 409);
  assert.equal(newer.state().writes, 0);
});

test('missing or invalid action cannot default to customer rejection', async () => {
  const f = fixture();
  for (const action of ['', 'unexpected']) await assert.rejects(f.service.record('SYN-TOKEN', action), error => error.statusCode === 400);
  assert.equal(f.state().writes, 0);
});

test('old GET action links are read-only and HTML escapes borrower/agreement values', async () => {
  let reads = 0, writes = 0;
  const controller = load('backend/controllers/customerSanctionDecisionController.js', {
    '../services/customerSanctionDecisionService': {
      preview: async () => { reads++; return { pendingDecision: true, borrower: '<img src=x onerror=alert(1)>', agreementNumber: '<script>synthetic()</script>', principalAmount: 100 }; },
      record: async () => { writes++; },
    },
  });
  const res = response(); res.send = value => { res.body = value; return res; };
  await controller.handle({ method: 'GET', params: { token: 'SYN-TOKEN' }, query: { action: 'accept' }, headers: {}, tenant: { slug: 'geetpay' } }, res);
  assert.equal(reads, 1); assert.equal(writes, 0);
  assert.ok(!res.body.includes('<script>')); assert.ok(!res.body.includes('<img'));
  assert.ok(res.body.includes('method="post"')); assert.ok(res.body.includes('tenant=geetpay'));
  assert.equal(res.headers['Cache-Control'], 'no-store'); assert.equal(res.headers['Referrer-Policy'], 'no-referrer');
});

test('POST takes the explicit body action and returns actionable failure without success claims', async () => {
  let captured;
  const controller = load('backend/controllers/customerSanctionDecisionController.js', {
    '../services/customerSanctionDecisionService': { record: async (_token, action) => {
      captured = action; throw Object.assign(new Error('Choose an action'), { statusCode: 400, publicMessage: 'Choose an action' });
    } },
  });
  const res = response();
  await controller.handle({ method: 'POST', params: { token: 'SYN-TOKEN' }, body: {}, query: { action: 'accept' }, headers: { accept: 'application/json' }, get: () => '' }, res);
  assert.equal(captured, ''); assert.equal(res.statusCode, 400); assert.equal(res.body.success, false);
});

test('production database readiness failure never returns internal formatter details', async () => {
  const middleware = load('backend/middleware/databaseReady.js', {
    '../database/bootstrap': { bootstrap: async () => { throw new Error('SYN-INTERNAL-SQL-DETAIL'); } },
    '../config/db': { formatDatabaseError: () => 'SYN-USER-HOST-PORT-DATABASE' },
  }, { process: { env: { NODE_ENV: 'production' } } });
  const res = response(); await middleware({}, res, () => assert.fail('not ready'));
  assert.equal(res.statusCode, 503); assert.ok(!JSON.stringify(res.body).includes('SYN-'));
});
