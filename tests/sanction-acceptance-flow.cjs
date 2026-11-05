const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const http = require('../backend/utils/http');
const uploads = { uploadPath: (...parts) => path.join('/test-uploads', ...parts), ensureUploadDir: () => '/test-uploads' };
function controller(name, overrides) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'backend/controllers', name), 'utf8'), {
    module, console,
    require: name => {
      if (Object.hasOwn(overrides, name)) return overrides[name];
      if (name === 'path') return path;
      if (name === '../utils/http') return http;
      if (name === '../config/uploads') return uploads;
      return {};
    },
  });
  return module.exports;
}
function response() {
  return { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}
function agreementHarness(sanction, leadStatus = 'Approved') {
  const calls = [];
  const api = controller('loanAgreementController.js', {
    '../models/leadModel': { findById: async () => ({ id: 'L1', status: leadStatus }) },
    '../models/sanctionModel': { findLatestByLead: async () => sanction },
    '../models/loanAgreementModel': {
      createForLead: async () => { calls.push('create'); return { id: 1 }; },
      updatePdf: async () => ({ id: 1 }), markSent: async () => ({ id: 1, status: 'sent' }),
    },
    '../services/loanAgreementService': { generateLoanAgreementPdf: async () => ({ absolutePath: '/test.pdf', relativePath: '/test.pdf' }) },
    '../services/digioService': { sendLoanAgreement: async () => { calls.push('digio'); return {}; } },
    '../models/leadStatusModel': { createForLead: async () => {} },
    '../models/activityModel': { createForLead: async () => {} },
    '../models/auditModel': { create: async () => {} },
  });
  return { send: () => api.sendLoanAgreementForEsign({ params: { id: 'L1' }, body: {} }, response()), calls };
}

for (const emailStatus of ['failed', 'pending', 'sent']) {
  test(`accepted sanction allows agreement with email status ${emailStatus}`, async () => {
    const h = agreementHarness({ customerDecision: 'accepted', status: 'accepted', emailStatus });
    const result = await h.send();
    assert.equal(result.statusCode, 201);
    assert.deepEqual(h.calls, ['create', 'digio']);
  });
}
for (const customerDecision of ['pending', 'rejected']) {
  test(`${customerDecision} sanction still blocks agreement even if email was sent`, async () => {
    const h = agreementHarness({ customerDecision, status: 'sent', emailStatus: 'sent' });
    await assert.rejects(h.send(), /must ACCEPT/);
    assert.deepEqual(h.calls, []);
  });
}
test('missing/superseded sanctions and rejected leads cannot send agreement', async () => {
  for (const [sanction, leadStatus] of [
    [null, 'Approved'],
    [{ customerDecision: 'accepted', status: 'superseded' }, 'Approved'],
    [{ customerDecision: 'accepted', status: 'accepted' }, 'Lost'],
  ]) {
    const h = agreementHarness(sanction, leadStatus);
    await assert.rejects(h.send());
    assert.deepEqual(h.calls, []);
  }
});

for (const deliveryFails of [false, true]) {
  test(`resend ${deliveryFails ? 'failure' : 'success'} resets acceptance and executes email updates`, async () => {
    const sanction = { id: 1, customerDecision: 'accepted', status: 'accepted', decisionToken: 'original-link', pdfPath: '/sanctions/test.pdf' };
    const queries = [];
    const multer = () => ({});
    multer.diskStorage = () => ({});
    const api = controller('sanctionController.js', {
      multer, fs: { existsSync: () => true },
      '../config/db': { query: async (...args) => queries.push(args) },
      '../models/leadModel': { findById: async () => ({ id: 'L1', rawId: 1, email: 'old@example.com' }) },
      '../models/sanctionModel': {
        findLatestByLead: async () => ({ ...sanction }),
        resetCustomerDecision: async id => {
          assert.equal(id, sanction.id);
          return Object.assign(sanction, { customerDecision: 'pending', status: 'sent', decisionToken: 'resent-link' });
        },
        updateDelivery: async (id, payload) => Object.assign(sanction, payload),
        updateWhatsappDelivery: async () => sanction,
      },
      '../services/sanctionLetterService': { emailSanctionLetter: async () => { if (deliveryFails) throw new Error('Mail provider unavailable'); } },
      '../services/authkeyWhatsAppService': { sendSanctionLetter: async () => ({ sent: true }) },
      '../models/activityModel': { createForLead: async () => {} },
      '../models/auditModel': { create: async () => {} },
    });
    const req = { params: { id: 'L1' }, body: { email: 'new@example.com' }, protocol: 'https', get: () => 'example.com' };
    if (deliveryFails) await assert.rejects(api.resendLeadSanction(req, response()), /Mail provider unavailable/);
    else assert.equal((await api.resendLeadSanction(req, response())).body.success, true);
    assert.equal(queries.length, 2);
    assert.equal(queries[0][1][0], 'new@example.com');
    assert.equal(sanction.customerDecision, 'pending');
    assert.equal(sanction.decisionToken, 'resent-link');
    assert.equal(sanction.status, 'sent');
    assert.equal(sanction.emailStatus, deliveryFails ? 'failed' : 'sent');
    const awaitingAcceptance = agreementHarness(sanction);
    await assert.rejects(awaitingAcceptance.send(), /must ACCEPT/);
    assert.deepEqual(awaitingAcceptance.calls, []);
    // The new acceptance unlocks agreement even if the resend email failed.
    sanction.customerDecision = 'accepted';
    sanction.status = 'accepted';
    assert.equal((await agreementHarness(sanction).send()).statusCode, 201);
  });
}

test('CRM eligibility follows acceptance independently of delivery and keeps role/status restrictions', () => {
  const source = fs.readFileSync(path.join(root, 'frontend/src/app/pages/LeadDetails.tsx'), 'utf8');
  const expression = source.match(/const canSendLoanAgreement = ([^;]+);/)[1];
  const enabled = (decision, emailStatus, role = true, status = 'accepted', leadStatus = 'Approved') => vm.runInNewContext(expression, {
    isCreditManagerRole: role, isSanctionCustomerAccepted: decision === 'accepted',
    latestSanction: { customerDecision: decision, emailStatus, status }, lead: { status: leadStatus },
  });
  assert.equal(enabled('accepted', 'failed'), true);
  assert.equal(enabled('accepted', 'pending'), true);
  assert.equal(enabled('pending', 'sent'), false);
  assert.equal(enabled('rejected', 'sent'), false);
  assert.equal(enabled('accepted', 'sent', false), false);
  assert.equal(enabled('accepted', 'sent', true, 'superseded'), false);
  assert.equal(enabled('accepted', 'sent', true, 'accepted', 'Lost'), false);
  assert.match(source, /latestSanction\.emailError && !isSanctionCustomerAccepted/);
  assert.match(source, /latestSanction\.whatsappError && !isSanctionCustomerAccepted/);
});
