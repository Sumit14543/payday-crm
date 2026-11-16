const test = require('node:test');
const assert = require('node:assert/strict');
const { AsyncLocalStorage } = require('node:async_hooks');
const { load, response, http } = require('./helpers/security-vm.cjs');
function fixture() {
  const storage = new AsyncLocalStorage(), pools = { a: {}, b: {} }, states = { a: { rows: new Map() }, b: { rows: new Map() } }, emails = [], tokens = [];
  const lead = { id: 'APP-SYN', phone: '9000000001', email: 'borrower@example.invalid', emandateProvider: 'cashfree' };
  const current = () => states[storage.getStore().tenant.slug];
  const controller = load('backend/controllers/customerCheckoutController.js', {
    '../config/db': { tenantLocalStorage: storage, query: async (raw, params = []) => {
      const sql = raw.replace(/\s+/g, ' ').trim(), state = current();
      if (sql.startsWith('CREATE TABLE')) return {};
      if (sql.startsWith('INSERT IGNORE INTO customer_checkout_limits')) { state.limit ||= { last: 0, count: 0 }; return {}; }
      if (sql.startsWith('UPDATE customer_checkout_limits')) { if (state.limit.last > Date.now() - 60000 || state.limit.count >= 3) return { affectedRows: 0 }; state.limit.last = Date.now(); state.limit.count++; return { affectedRows: 1 }; }
      if (sql.startsWith('INSERT INTO customer_checkout_challenges')) { state.rows.set(params[0], { id: params[0], application_id: params[1], tenant_slug: params[2], provider: params[3], otp_hash: params[4], phone_hash: params[5], email_hash: params[6], expires: Date.now() + 600000, attempts: 0 }); return { affectedRows: 1 }; }
      const live = row => row && !row.used && row.expires > Date.now() && row.attempts < 3;
      if (sql.startsWith('SELECT id FROM customer_checkout_challenges')) return [...state.rows.values()].filter(live).map(row => ({ id: row.id }));
      if (sql.startsWith('SELECT * FROM customer_checkout_challenges')) { const row = state.rows.get(params[0]); return live(row) ? [{ ...row }] : []; }
      if (sql.startsWith('UPDATE customer_checkout_challenges') && sql.includes('WHERE application_id')) { for (const row of state.rows.values()) if (row.application_id === params[0]) row.used = true; return { affectedRows: 1 }; }
      if (sql.startsWith('UPDATE customer_checkout_challenges')) {
        const row = state.rows.get(params[0]); if (!live(row)) return { affectedRows: 0 };
        if (sql.includes('otp_hash = ?')) { assert.ok(sql.includes('used_at IS NULL AND expires_at > NOW() AND attempts < 3')); if (params[1] !== row.otp_hash) return { affectedRows: 0 }; row.used = true; }
        else if (sql.includes('attempts = attempts + 1')) row.attempts++;
        else row.used = true;
        return { affectedRows: 1 };
      }
      throw new Error('Unexpected SQL: ' + sql);
    } },
    '../models/leadModel': { findById: async id => id === lead.id ? lead : null },
    '../services/emailService': { sendMail: async message => { emails.push(message); } },
    '../middleware/auth': { createCustomerActionToken: (applicationId, provider) => { tokens.push({ purpose: 'customer-emandate', applicationId, provider }); return 'SYNTHETIC-CHECKOUT-ONLY'; } }, '../utils/http': http,
  }, { process: { env: { AUTH_TOKEN_SECRET: 'synthetic-only-checkout-key-with-more-than-32-characters' } } });
  const run = (scope, fn) => storage.run({ tenant: { slug: scope }, pool: pools[scope] }, fn);
  return { lead, states, emails, tokens,
    request: async (body = {}, scope = 'a') => run(scope, async () => { const res = response(); await controller.requestAccess({ body: { applicationId: lead.id, phone: lead.phone, ...body } }, res); return res; }),
    verify: async (challengeToken, otp, scope = 'a') => run(scope, async () => { const res = response(); await controller.verifyAccess({ body: { challengeToken, otp } }, res); return res; }),
    code: () => emails.at(-1).text.match(/code: (\d{6})/)[1],
  };
}
test('a customer can continue a legacy mandate link after registered-email proof without receiving staff/API credentials', async () => {
  const f = fixture(), request = await f.request(); assert.equal(f.emails[0].to, f.lead.email); assert.equal(request.body.data.email, undefined);
  const row = [...f.states.a.rows.values()][0]; assert.notEqual(row.otp_hash, f.code());
  const result = await f.verify(request.body.data.challengeToken, f.code()); assert.equal(result.body.data.access, 'SYNTHETIC-CHECKOUT-ONLY'); assert.equal(result.body.data.token, undefined); assert.equal(f.tokens[0].purpose, 'customer-emandate'); assert.equal(f.tokens[0].applicationId, f.lead.id);
});
test('legacy checkout verification is consumed once under concurrent requests', async () => {
  const f = fixture(), req = await f.request(), token = req.body.data.challengeToken, code = f.code();
  const results = await Promise.allSettled([f.verify(token, code), f.verify(token, code)]); assert.equal(results.filter(result => result.status === 'fulfilled').length, 1); assert.equal(f.tokens.length, 1);
});
test('unknown phone/ID does not send email, expose customer details or issue a checkout capability', async () => {
  const f = fixture(); for (const body of [{ phone: '9000000002' }, { applicationId: 'OTHER' }]) { const res = await f.request(body); assert.equal(res.statusCode, 200); assert.equal(res.body.data.customerName, undefined); await assert.rejects(f.verify(res.body.data.challengeToken, '111111')); } assert.equal(f.emails.length, 0); assert.equal(f.tokens.length, 0);
});
test('expired, exhausted or another-company challenges cannot disclose the checkout session', async () => {
  const f = fixture(), req = await f.request(), token = req.body.data.challengeToken, code = f.code();
  await assert.rejects(f.verify(token, code, 'b'));
  for (let i = 0; i < 3; i++) await assert.rejects(f.verify(token, '000000'));
  await assert.rejects(f.verify(token, code)); assert.equal(f.tokens.length, 0);
  f.states.a.rows.get(token).attempts = 0; f.states.a.rows.get(token).expires = 0; await assert.rejects(f.verify(token, code));
});
test('cooldown reuses the existing challenge so refreshing an old link does not invalidate the delivered code', async () => {
  const f = fixture(), first = await f.request(), code = f.code(), second = await f.request(); assert.equal(first.body.data.challengeToken, second.body.data.challengeToken); assert.equal(f.emails.length, 1); assert.equal((await f.verify(second.body.data.challengeToken, code)).statusCode, 200);
});
test('contact/provider changes invalidate an outstanding customer OTP', async () => {
  for (const [field, value] of [['email', 'changed@example.invalid'], ['phone', '9000000009'], ['emandateProvider', 'razorpay']]) { const f = fixture(), first = await f.request(), code = f.code(); f.lead[field] = value; await assert.rejects(f.verify(first.body.data.challengeToken, code)); assert.equal(f.tokens.length, 0); }
});
