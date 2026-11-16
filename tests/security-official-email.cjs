const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { load, response } = require('./helpers/security-vm.cjs');
const secret = 'synthetic-only-official-email-hmac-secret';
function fixture(assignedTo = 'Agent A') {
  let verified = 0, used = false, attempts = 0;
  const queries = [];
  const row = { id: 1, official_email: 'staff@corporate.example.invalid', otp_hash: crypto.createHmac('sha256', secret).update('654321').digest('hex'), attempts: 0, max_attempts: 3, expires_at: new Date(Date.now() + 300000) };
  const controller = load('backend/controllers/officialEmailOtpController.js', {
    '../config/db': { query: async (sql, params = []) => {
      queries.push(sql);
      if (sql.startsWith('SELECT')) return used ? [] : [{ ...row, attempts }];
      if (sql.includes('attempts = attempts + 1')) { if (!used && attempts < 3) attempts++; if (attempts >= 3) used = true; return { affectedRows: 1 }; }
      if (sql.includes('AND otp_hash = ?')) { const ok = !used && attempts < 3 && params[1] === row.otp_hash; if (ok) used = true; return { affectedRows: ok ? 1 : 0 }; }
      return { affectedRows: 1 };
    } },
    '../models/leadModel': { findById: async () => ({ id: 'APP-SYN', rawId: '1', assignedTo }), updateOfficialEmailVerification: async () => { verified++; return { id: 'APP-SYN' }; } },
    '../models/auditModel': { create: async () => {} }, '../services/emailService': {}, '../database/schema': { ensureOfficialEmailColumns: async () => {} },
    '../services/officialEmailCheckerService': { verifyOfficialEmailDomain: async () => ({ isCorporateDomain: true }) },
    '../utils/leadAccess': require('../backend/utils/leadAccess'),
  }, { process: { env: { AUTH_TOKEN_SECRET: secret } } });
  return { queries, get verified() { return verified; }, run: async otp => { const res = response(); await controller.verifyOtp({ params: {}, query: {}, body: { applicationId: 'APP-SYN', otp }, user: { name: 'Agent A', role: 'telecaller' } }, res); return res; } };
}
test('valid official-email OTP preserves verification and is consumed once under concurrent requests', async () => {
  const f = fixture(), results = await Promise.all([f.run('654321'), f.run('654321')]); assert.equal(results.filter(res => res.statusCode === 200).length, 1); assert.equal(f.verified, 1);
});
test('invalid official-email attempts use an atomic database budget and cannot verify the lead', async () => {
  const f = fixture(); await Promise.all([f.run('111111'), f.run('222222'), f.run('333333')]); assert.notEqual((await f.run('654321')).statusCode, 200); assert.equal(f.verified, 0);
});
test('official-email body-selected lead IDs cannot edit another telecaller assignment', async () => {
  const f = fixture('Agent B'); await assert.rejects(f.run('654321'), error => error.statusCode === 403); assert.equal(f.verified, 0); assert.equal(f.queries.length, 0);
});
