const test = require('node:test');
const assert = require('node:assert/strict');
const { load, response, http } = require('./helpers/security-vm.cjs');
const { AsyncLocalStorage } = require('node:async_hooks');
const crypto = require('node:crypto');
function evidenceFixture() {
  const storage = new AsyncLocalStorage();
  const evidence = load('backend/utils/digioEvidence.js', { '../config/db': { tenantLocalStorage: storage } }, { process: { env: { AUTH_TOKEN_SECRET: 'synthetic-strong-evidence-key-never-real'.repeat(2) } } });
  return { storage, evidence };
}
test('disbursement accepts a genuine current signed agreement with matching sanction', async () => {
  let verified;
  const guard = load('backend/utils/disbursementEvidence.js', { './digioEvidence': evidenceFixture().evidence, '../models/loanAgreementModel': { updateProviderStatus: async () => {} }, '../services/digioService': { getDocument: async id => { verified = id; return { providerDocumentId: id, providerStatus: 'completed' }; } } }, { process: { env: { NODE_ENV: 'production' } } });
  await guard.assertDisbursementEvidence({ provider: 'digio', providerDocumentId: 'DID-SYN', signedPdfPath: '/uploads/agreements/signed/synthetic.pdf', sanctionId: 7, agreementNumber: 'AG-SYN' }, { id: 7, agreementNumber: 'AG-SYN' }); assert.equal(verified, 'DID-SYN');
});
test('dummy, obsolete, mismatched and provider-unsigned evidence cannot pass the disbursement gate', async () => {
  const agreement = { provider: 'digio', providerDocumentId: 'DID-SYN', signedPdfPath: '/uploads/agreements/signed/synthetic.pdf', sanctionId: 7, agreementNumber: 'AG-SYN' };
  const guard = load('backend/utils/disbursementEvidence.js', { './digioEvidence': evidenceFixture().evidence, '../services/digioService': { getDocument: async id => ({ providerDocumentId: id, providerStatus: 'unsigned' }) } }, { process: { env: { NODE_ENV: 'production' } } });
  for (const value of [null, { ...agreement, provider: 'dummy' }, { ...agreement, supersededAt: new Date() }, { ...agreement, sanctionId: 8 }, agreement]) await assert.rejects(guard.assertDisbursementEvidence(value, { id: 7, agreementNumber: 'AG-SYN' }), error => error.statusCode === 409);
});

test('previous provider-verified evidence preserves disbursement through provider outage and cannot move to a different agreement/company', async () => {
  const { storage, evidence } = evidenceFixture();
  const agreement = { id: 1, status: 'signed', providerStatus: 'completed', provider: 'digio', providerDocumentId: 'DID-SYN', signedPdfPath: '/uploads/agreements/signed/synthetic.pdf', sanctionId: 7, agreementNumber: 'AG-SYN' };
  agreement.metadata = { digioVerification: storage.run({ tenant: { slug: 'a' } }, () => evidence.issueEvidence(agreement, { providerDocumentId: 'DID-SYN', providerStatus: 'completed' })) };
  let reads = 0;
  const guard = load('backend/utils/disbursementEvidence.js', { './digioEvidence': evidence, '../services/digioService': { getDocument: async () => { reads++; throw Error('Synthetic provider outage'); } } }, { process: { env: { NODE_ENV: 'production' } } });
  await storage.run({ tenant: { slug: 'a' } }, () => guard.assertDisbursementEvidence(agreement, { id: 7, agreementNumber: 'AG-SYN' })); assert.equal(reads, 0);
  for (const changed of [{ ...agreement, providerDocumentId: 'DID-OTHER' }, { ...agreement, signedPdfPath: '/uploads/other.pdf' }, { ...agreement, metadata: { digioVerification: { ...agreement.metadata.digioVerification, signature: crypto.randomBytes(32).toString('hex') } } }]) await assert.rejects(storage.run({ tenant: { slug: 'a' } }, () => guard.assertDisbursementEvidence(changed, { id: 7, agreementNumber: 'AG-SYN' })), error => error.statusCode === 503);
  await assert.rejects(storage.run({ tenant: { slug: 'b' } }, () => guard.assertDisbursementEvidence(agreement, { id: 7, agreementNumber: 'AG-SYN' })), error => error.statusCode === 503);
});
test('CIBIL callback authorization is checked before any record or score is read or written', async () => {
  let reads = 0;
  const controller = load('backend/controllers/cibilController.js', {
    '../utils/tenantCache': { createTenantState: factory => factory }, '../models/activityModel': {}, '../models/cibilReportModel': {},
    '../models/leadModel': { findById: async () => { reads++; return null; } }, '../config/env': { config: {} }, '../services/cibilService': {}, '../services/openaiCibilAnalysisService': {}, '../utils/http': http,
    '../middleware/auth': { verifyProviderCallbackToken: () => null },
  });
  const res = response(); await controller.receiveScoreCallback({ tenant: { slug: 'a' }, query: {}, body: { score: 900, pan: 'SYNTHETIC' } }, res); assert.equal(res.statusCode, 401); assert.equal(reads, 0);
});
test('simultaneous CIBIL analyses with the same numeric report ID stay in their own company', async () => {
  const storage = new AsyncLocalStorage(), pools = { a: {}, b: {} }, waiting = {};
  const cache = load('backend/utils/tenantCache.js', { '../config/db': { tenantLocalStorage: storage } });
  const tenant = () => storage.getStore().tenant.slug;
  const controller = load('backend/controllers/cibilController.js', {
    '../utils/tenantCache': cache, '../models/activityModel': { createForLead: async () => {} },
    '../models/cibilReportModel': { findLatestByLead: async lead => ({ id: 1, applicationId: lead.id, leadId: lead.rawId, pdfUrl: 'https://example.invalid/' + tenant() + '.pdf' }), saveAnalysis: async (id, value) => ({ id, ...value, company: tenant() }) },
    '../models/leadModel': { findById: async () => ({ id: 'APP-' + tenant(), rawId: '1' }) },
    '../config/env': { config: { openai: { model: 'synthetic-only' } } }, '../services/cibilService': {},
    '../services/openaiCibilAnalysisService': { analyzeCibilPdf: () => new Promise(resolve => { waiting[tenant()] = resolve; }) }, '../utils/http': http,
  });
  const a = response(), b = response(); a.set = a.setHeader; b.set = b.setHeader;
  const run = (scope, res) => storage.run({ pool: pools[scope], tenant: { slug: scope } }, () => controller.analyzeLeadCibilReport({ params: { id: '1' }, body: {} }, res));
  const first = run('a', a), second = run('b', b);
  for (let i = 0; i < 12; i++) await Promise.resolve();
  assert.equal(typeof waiting.a, 'function'); assert.equal(typeof waiting.b, 'function');
  waiting.b({ analysis: { owner: 'b' } }); waiting.a({ analysis: { owner: 'a' } }); await Promise.all([first, second]);
  assert.equal(a.body.data.analysis.owner, 'a'); assert.equal(b.body.data.analysis.owner, 'b'); assert.equal(a.body.data.company, 'a'); assert.equal(b.body.data.company, 'b');
});
