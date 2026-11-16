const crypto = require('crypto');
const { query, tenantLocalStorage } = require('../config/db');
const leadModel = require('../models/leadModel');
const emailService = require('../services/emailService');
const { createCustomerActionToken } = require('../middleware/auth');
const { success } = require('../utils/http');
const initialized = new WeakMap(), defaultScope = {};
const company = () => tenantLocalStorage.getStore()?.tenant?.slug || 'waqtfinance';
function digest(value) {
  const key = String(process.env.AUTH_TOKEN_SECRET || '');
  if (key.length < 32) return fail('Secure checkout verification is unavailable.', 503);
  return crypto.createHmac('sha256', key).update('customer-checkout:' + value).digest('hex');
}
function fail(message = 'The code is invalid or expired. Request a new code.', statusCode = 400) { const error = new Error(message); error.statusCode = statusCode; error.publicMessage = message; throw error; }
const phoneOf = lead => String(lead?.phone || lead?.mobile || '').replace(/\D/g, '').slice(-10);
const emailOf = lead => String(lead?.email || '').trim().toLowerCase();
async function ensureTables() {
  const scope = tenantLocalStorage.getStore()?.pool || defaultScope;
  if (!initialized.has(scope)) initialized.set(scope, (async () => {
    await query(`CREATE TABLE IF NOT EXISTS customer_checkout_limits (
      application_id VARCHAR(120) PRIMARY KEY, last_sent_at DATETIME NOT NULL,
      hour_started_at DATETIME NOT NULL, sent_count INT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await query(`CREATE TABLE IF NOT EXISTS customer_checkout_challenges (
      id CHAR(64) PRIMARY KEY, application_id VARCHAR(120) NOT NULL, tenant_slug VARCHAR(100) NOT NULL,
      provider VARCHAR(30) NOT NULL, otp_hash CHAR(64) NOT NULL, phone_hash CHAR(64) NOT NULL,
      email_hash CHAR(64) NOT NULL, attempts INT NOT NULL DEFAULT 0,
      expires_at DATETIME NOT NULL, used_at DATETIME DEFAULT NULL,
      INDEX idx_checkout_expiry (expires_at), INDEX idx_checkout_application (application_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  })().catch(error => { initialized.delete(scope); throw error; }));
  await initialized.get(scope);
}
async function requestAccess(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const challengeToken = crypto.randomBytes(32).toString('hex');
  const provider = String(req.body?.provider || 'cashfree');
  if (!['cashfree', 'billdesk'].includes(provider)) return fail();
  const lead = await leadModel.findById(String(req.body?.applicationId || ''));
  const phone = String(req.body?.phone || '').replace(/\D/g, '').slice(-10);
  const email = emailOf(lead);
  // Unknown identifiers receive the same response, without sending email.
  const eligible = lead && phone.length === 10 && phone === phoneOf(lead)
    && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)
    && (!lead.emandateProvider || lead.emandateProvider === provider);
  if (eligible) {
    await ensureTables();
    await query("INSERT IGNORE INTO customer_checkout_limits (application_id, last_sent_at, hour_started_at, sent_count) VALUES (?, DATE_SUB(NOW(), INTERVAL 1 DAY), NOW(), 0)", [lead.id]);
    const budget = await query(`UPDATE customer_checkout_limits SET last_sent_at = NOW(),
      sent_count = IF(hour_started_at < DATE_SUB(NOW(), INTERVAL 1 HOUR), 1, sent_count + 1),
      hour_started_at = IF(hour_started_at < DATE_SUB(NOW(), INTERVAL 1 HOUR), NOW(), hour_started_at)
      WHERE application_id = ? AND last_sent_at < DATE_SUB(NOW(), INTERVAL 60 SECOND)
      AND (sent_count < 3 OR hour_started_at < DATE_SUB(NOW(), INTERVAL 1 HOUR))`, [lead.id]);
    if (budget.affectedRows === 1) {
      const otp = crypto.randomInt(100000, 1000000).toString();
      await query('UPDATE customer_checkout_challenges SET used_at = NOW() WHERE application_id = ? AND used_at IS NULL', [lead.id]);
      await query(`INSERT INTO customer_checkout_challenges (id, application_id, tenant_slug, provider, otp_hash, phone_hash, email_hash, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))`,
      [challengeToken, lead.id, company(), provider, digest(challengeToken + ':' + otp), digest(phone), digest(email)]);
      try {
        await emailService.sendMail({ to: email, subject: 'Verify access to your eMandate registration', text: `Your eMandate access code: ${otp}\nThis code expires in 10 minutes. Do not share it with anyone.\nApplication: ${lead.id}` });
      } catch {
        await query('UPDATE customer_checkout_challenges SET used_at = NOW() WHERE id = ?', [challengeToken]);
        return fail('Unable to send the access code. Retry after a minute or request a fresh secure link from your lending team.', 503);
      }
    } else {
      const active = await query('SELECT id FROM customer_checkout_challenges WHERE application_id = ? AND provider = ? AND used_at IS NULL AND expires_at > NOW() AND attempts < 3 ORDER BY expires_at DESC LIMIT 1', [lead.id, provider]);
      if (active[0]) return success(res, { challengeToken: active[0].id, expiresInSeconds: 600 }, 'Use the code already sent to your registered email, or wait a minute before requesting another code.');
    }
  }
  res.setHeader('Cache-Control', 'no-store');
  return success(res, { challengeToken, expiresInSeconds: 600 }, 'If these details match, a code has been sent to your registered email. Please wait a minute before requesting another code.');
}
async function verifyAccess(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const token = String(req.body?.challengeToken || ''), otp = String(req.body?.otp || '').trim();
  if (!/^[a-f0-9]{64}$/.test(token) || !/^\d{6}$/.test(otp)) return fail();
  await ensureTables();
  const rows = await query('SELECT * FROM customer_checkout_challenges WHERE id = ? AND used_at IS NULL AND expires_at > NOW() AND attempts < 3 LIMIT 1', [token]);
  const challenge = rows[0];
  if (!challenge || challenge.tenant_slug !== company()) return fail();
  const lead = await leadModel.findById(challenge.application_id);
  if (!lead || digest(phoneOf(lead)) !== challenge.phone_hash || digest(emailOf(lead)) !== challenge.email_hash || (lead.emandateProvider && lead.emandateProvider !== challenge.provider)) return fail();
  const result = await query('UPDATE customer_checkout_challenges SET used_at = NOW() WHERE id = ? AND otp_hash = ? AND used_at IS NULL AND expires_at > NOW() AND attempts < 3', [token, digest(token + ':' + otp)]);
  if (result.affectedRows !== 1) {
    await query('UPDATE customer_checkout_challenges SET attempts = attempts + 1 WHERE id = ? AND used_at IS NULL AND attempts < 3', [token]);
    return fail();
  }
  const access = createCustomerActionToken(lead.id, challenge.provider);
  res.setHeader('Cache-Control', 'no-store');
  return success(res, { access, tenant: company() });
}
module.exports = { requestAccess, verifyAccess };
