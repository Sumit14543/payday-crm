const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { load, response, http } = require('./helpers/security-vm.cjs');
const secret = 'synthetic-webhook-secret-never-a-real-credential';
const env = { NODE_ENV: 'production', RAZORPAY_WEBHOOK_SECRET: secret, RAZORPAY_KEY_ID: 'synthetic-id', RAZORPAY_KEY_SECRET: secret };
function cashfreeFixture(provider = { subscription_id: 'sub_SYN', subscription_status: 'ACTIVE' }) {
  const changes = [], requests = [];
  const { EventEmitter } = require('node:events');
  const client = { request(options, callback) { requests.push(options.path); const req = new EventEmitter(); req.write = () => {}; req.setTimeout = duration => { assert.equal(duration, 15000); }; req.destroy = error => req.emit('error', error); req.end = () => queueMicrotask(() => { if (provider instanceof Error) return req.emit('error', provider); const res = new EventEmitter(); res.statusCode = 200; callback(res); res.emit('data', JSON.stringify(provider)); res.emit('end'); }); return req; } };
  const controller = load('backend/controllers/cashfreeEmandateController.js', {
    http: client, https: client, '../config/db': { query: async () => [{ id: 'APP-SYN', rawId: '1' }] }, '../database/schema': {}, '../utils/customerAction': { assertCheckoutAccess() {}, assertStaffLead() {} },
    '../models/leadModel': { findById: async () => ({ id: 'APP-SYN', rawId: '1', mandateId: 'sub_SYN', emandateProvider: 'cashfree' }), updateEmandateStatus: async (id, value) => changes.push({ id, ...value }) }, '../models/auditModel': {}, '../services/emailService': {}, '../services/authkeyWhatsAppService': {},
  }, { process: { env: { NODE_ENV: 'production', CASHFREE_CLIENT_SECRET: secret } } });
  const body = { type: 'SUBSCRIPTION_STATUS_CHANGED', data: { subscription: { subscription_id: 'sub_SYN', subscription_status: 'ACTIVE' } } };
  const rawBody = Buffer.from(JSON.stringify(body)), timestamp = String(Date.now());
  const headers = { 'x-webhook-timestamp': timestamp, 'x-webhook-signature': crypto.createHmac('sha256', secret).update(timestamp + rawBody.toString()).digest('base64') };
  return { changes, requests, runPublic: async () => { const res = response(); await controller.getPublicCashfreeDetails({ params: { id: 'APP-SYN' }, query: {} }, res); return res; }, run: async (overrides = {}) => { const res = response(); await controller.handleCashfreeWebhook({ body, rawBody, headers, ...overrides }, res); return res; } };
}
test('Cashfree mandate rejects missing signatures and modified raw bytes before provider access', async () => {
  const f = cashfreeFixture(); assert.equal((await f.run({ headers: {} })).statusCode, 401); assert.equal((await f.run({ rawBody: Buffer.from('{}') })).statusCode, 401); assert.equal(f.requests.length, 0); assert.equal(f.changes.length, 0);
});
test('Cashfree mandate provider outage or reference mismatch cannot activate caller-supplied success', async () => {
  for (const provider of [new Error('Synthetic provider failure'), { subscription_id: 'sub_OTHER', subscription_status: 'ACTIVE' }]) { const f = cashfreeFixture(provider); assert.ok([503, 422].includes((await f.run()).statusCode)); assert.equal(f.changes.length, 0); }
});
test('valid Cashfree mandate callback preserves current provider-confirmed activation', async () => {
  const f = cashfreeFixture(); assert.equal((await f.run()).statusCode, 200); assert.equal(f.changes[0].status, 'ACTIVE');
});
test('customer status reads preserve a verified active mandate and do not create a replacement on provider outage', async () => {
  const active = cashfreeFixture(); const result = await active.runPublic(); assert.equal(result.statusCode, 200); assert.equal(result.body.status, 'ACTIVE'); assert.equal(active.requests.length, 1);
  const unavailable = cashfreeFixture(new Error('Synthetic outage')); assert.equal((await unavailable.runPublic()).statusCode, 503); assert.equal(unavailable.requests.length, 1); assert.equal(unavailable.changes.length, 0);
  const mismatch = cashfreeFixture({ subscription_id: 'sub_OTHER', subscription_status: 'ACTIVE' }); assert.equal((await mismatch.runPublic()).statusCode, 422); assert.equal(mismatch.changes.length, 0);
});
function razorFixture(provider, leadMandate = 'sub_SYN') {
  const changes = [], reads = [];
  const controller = load('backend/controllers/razorpayEmandateController.js', {
    '../config/db': { query: async () => [{ id: 'APP-SYN', mandateId: leadMandate }] },
    '../models/leadModel': { updateEmandateStatus: async (id, value) => changes.push({ id, ...value }) },
  }, { process: { env }, fetch: async url => { reads.push(url); return { ok: true, json: async () => provider }; }, AbortSignal });
  const body = { event: 'subscription.activated', payload: { subscription: { entity: { id: 'sub_SYN', status: 'active' } } } };
  const rawBody = Buffer.from(JSON.stringify(body));
  const headers = { 'x-razorpay-signature': crypto.createHmac('sha256', secret).update(rawBody).digest('hex') };
  return { changes, reads, run: async (overrides = {}) => { const res = response(); await controller.handleWebhook({ body, rawBody, headers, ...overrides }, res); return res; } };
}
test('Razorpay unsigned/tampered events are rejected before database or provider-driven status writes', async () => {
  const f = razorFixture({ id: 'sub_SYN', status: 'active' });
  assert.equal((await f.run({ headers: {} })).statusCode, 401);
  assert.equal((await f.run({ rawBody: Buffer.from('{}') })).statusCode, 401); assert.equal(f.changes.length, 0); assert.equal(f.reads.length, 0);
});
test('a signed Razorpay ACTIVE event uses current provider state rather than event-supplied status', async () => {
  const f = razorFixture({ id: 'sub_SYN', status: 'cancelled' }); const res = await f.run(); assert.equal(res.statusCode, 200); assert.equal(f.changes[0].status, 'REVOKED');
});
test('confirmed current Razorpay subscription preserves a valid authorization journey', async () => {
  const f = razorFixture({ id: 'sub_SYN', status: 'active' }); await f.run(); assert.equal(f.changes[0].status, 'ACTIVE');
});
test('Razorpay reference substitution cannot authorize another stored mandate', async () => {
  const f = razorFixture({ id: 'sub_SYN', status: 'active' }, 'token_OTHER'); await f.run(); assert.equal(f.changes.length, 0);
});
function aaFixture(status) {
  const writes = [], calls = [];
  const controller = load('backend/controllers/accountAggregatorController.js', {
    '../models/accountAggregatorModel': { findSessionByTrackingId: async () => ({ trackingId: 'saved-tracking', digitalFlowRequestId: 'saved-request', applicationId: 'APP-SYN' }), updateSessionStatus: async value => writes.push(value) },
    '../models/activityModel': {}, '../models/leadModel': {}, '../services/authkeyWhatsAppService': {}, '../services/emailService': {}, '../utils/http': http,
    '../services/crifAccountAggregatorService': { getDigitalFlowStatus: async value => { calls.push(value); if (status instanceof Error) throw status; return status; } },
  });
  return { writes, calls, run: async () => { const res = response(); await controller.verifyCallback({ query: { trackingId: 'saved-tracking', digitalFlowRequestId: 'attacker-request', status: 'ACTIVE', referenceId: 'attacker-reference' } }, res); return res; } };
}
test('AA provider outage fails closed and cannot fall back to query-supplied consent/analytics status', async () => {
  const f = aaFixture(new Error('Synthetic provider outage')); const res = await f.run(); assert.equal(res.statusCode, 503); assert.equal(f.writes.length, 0); assert.equal(f.calls[0].digitalFlowRequestId, 'saved-request');
});
test('AA callback syncs verified provider status and never returns consent identifiers', async () => {
  const f = aaFixture({ consentDetails: { status: 'REJECTED' } }); const res = await f.run(); assert.equal(f.writes[0].status, 'REJECTED'); assert.equal(res.body.data.status, 'REJECTED'); assert.equal(res.body.data.referenceId, undefined);
});
function digioFixture(status) {
  let signed = 0, downloads = 0;
  const agreement = { id: 1, providerDocumentId: 'DID-SYN', provider: 'digio', applicationId: 'APP-SYN', status: 'sent', agreementNumber: 'AG-SYN', signerName: 'Private Borrower', signedPdfPath: '' };
  const controller = load('backend/controllers/loanAgreementController.js', {
    '../utils/documentStorage': { privateDocumentName: name => 'synthetic-scope-' + name },
    fs: { existsSync: () => false, mkdirSync() {}, promises: { mkdir: async () => {}, writeFile: async () => {} }, writeFileSync() {} },
    '../models/activityModel': { createForLead: async () => {} }, '../models/auditModel': { create: async () => {} },
    '../models/leadModel': { findById: async () => null }, '../models/leadStatusModel': {}, '../models/sanctionModel': {}, '../services/loanAgreementService': {},
    '../models/loanAgreementModel': { findByProviderDocumentId: async () => agreement, markSigned: async (_, value) => { signed++; return { ...agreement, ...value, status: 'signed' }; } },
    '../services/digioService': { normalizeWebhookPayload: body => body, getDocument: async () => ({ providerDocumentId: 'DID-SYN', providerStatus: status }), downloadSignedDocument: async () => { downloads++; return Buffer.from('%PDF-1.4\nsynthetic\n%%EOF'); } },
    '../config/uploads': { uploadPath: (...parts) => '/synthetic/' + parts.join('/'), resolveUploadPath: () => null, syncUploadedFile() {} }, '../utils/http': http,
  });
  return { get signed() { return signed; }, get downloads() { return downloads; }, run: async () => { const res = response(); await controller.receiveDigioWebhook({ body: { providerDocumentId: 'DID-SYN', status: 'signed', documentBase64: Buffer.from('%PDF-FORGED').toString('base64') } }, res); return res; } };
}
test('Digio caller-supplied signed flag and PDF cannot override unsigned provider status', async () => {
  const f = digioFixture('unsigned'); const res = await f.run(); assert.equal(res.statusCode, 200); assert.equal(f.signed, 0); assert.equal(f.downloads, 0); assert.equal(res.body.data.agreement, undefined);
});
test('current signed Digio status downloads the provider PDF and acknowledges without private agreement data', async () => {
  const f = digioFixture('completed'); const res = await f.run(); assert.equal(res.statusCode, 200); assert.equal(f.signed, 1); assert.equal(f.downloads, 1); assert.equal(res.body.data.agreement, undefined);
});
test('BillDesk JOSE rejects tampering and accepts the configured signed/encrypted format', () => {
  const jose = load('backend/utils/billdeskJose.js', { https: {}, http: {} }, { process: { env: { BILLDESK_SIGNING_KEY: secret, BILLDESK_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef' } } });
  const signed = jose.createJosePayload({ auth_status: '0300', orderid: 'SYN-ORDER' });
  assert.equal(jose.parseJoseResponse(signed).orderid, 'SYN-ORDER');
  assert.throws(() => jose.parseJoseResponse(signed.slice(0, -6) + 'AAAAAA'));
});
