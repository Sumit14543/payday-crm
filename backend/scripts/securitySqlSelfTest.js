// Runs only against a confirmed separate testing database. Never bootstraps the
// application, sends email, calls providers, or touches real financial tables.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), assert = require('assert/strict');
function values(root, mode) {
  const result = {};
  for (const name of ['.env', '.env.' + mode]) {
    const file = path.join(root, name);
    if (fs.existsSync(file)) for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*?)\s*$/);
      if (match) result[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
  return result;
}
let step = 'database isolation';
async function main() {
  const candidate = path.resolve(__dirname, '..'), live = path.resolve(process.env.CRM_LIVE_ROOT || '/home/waqtmoney/public_html/payday-api');
  assert.notEqual(candidate, live);
  const production = values(live, 'production'), testing = values(path.join(live, '../testing-api'), 'development');
  step = 'confirm distinct database names';
  assert.ok(testing.DB_NAME && production.DB_NAME && testing.DB_NAME !== production.DB_NAME);
  const mysql = require(path.join(candidate, 'node_modules/mysql'));
  const master = production.DB_MASTER_NAME || `${production.DB_PREFIX || ''}payday_crm_master`;
  assert.match(master, /^[a-zA-Z0-9_-]+$/);
  const readOnly = mysql.createConnection({ host: production.DB_HOST || 'localhost', port: Number(production.DB_PORT || 3306), user: production.DB_USER, password: production.DB_PASSWORD ?? production.DB_PASS, database: production.DB_NAME });
  step = 'read active production database mappings';
  try {
    const companies = await new Promise((resolve, reject) => readOnly.query('SELECT db_name FROM `' + master + '`.tenants WHERE status = "active"', (error, rows) => error ? reject(error) : resolve(rows)));
    assert.ok(!companies.some(company => company.db_name === testing.DB_NAME), 'Testing database maps to a production company');
  } finally { readOnly.end(); }
  for (const key of ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_NAME', 'DB_PASSWORD', 'DB_PASS']) process.env[key] = testing[key] || '';
  process.env.DB_PASSWORD = testing.DB_PASSWORD ?? testing.DB_PASS ?? '';
  process.env.CORS_ORIGIN = 'https://synthetic-security-test.invalid';
  process.env.NODE_ENV = 'production'; process.env.DB_AUTO_CREATE = 'false'; delete process.env.PORT;
  const db = require(path.join(candidate, 'config/db'));
  step = 'initialize isolated pool';
  db.queryMaster = async () => { const error = new Error('Master access blocked in synthetic test'); error.code = 'MASTER_ACCESS_BLOCKED'; throw error; };
  const tenant = { slug: 'security-probe', db_name: testing.DB_NAME };
  const pool = db.getTenantPool(tenant);
  let userId, createdTable = false, otpCode;
  const suffix = crypto.randomBytes(10).toString('hex'), email = 'security-probe-' + suffix + '@waqtfinance.com';
  const table = 'security_probe_' + suffix;
  const stub = (file, exports) => { const key = require.resolve(path.join(candidate, file)); require.cache[key] = { id: key, filename: key, loaded: true, exports }; };
  stub('services/emailService.js', { sendTelecallerOtpEmail: async value => { assert.equal(value.toEmail, email); otpCode = value.otpCode; } });
  stub('models/auditModel.js', { create: async () => {} });
  stub('services/geocodingService.js', { getAddressFromLatLng: async () => { throw new Error('Unexpected external call'); } });
  global.fetch = async () => { throw new Error('External calls are prohibited'); };
  const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
  const checks = [];
  try {
    await db.tenantLocalStorage.run({ pool, tenant }, async () => {
      const current = await db.query('SELECT DATABASE() AS name'); assert.equal(current[0].name, testing.DB_NAME);
      step = 'synthetic identity';
      const password = crypto.randomBytes(32).toString('base64url'), salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('hex');
      const inserted = await db.query('INSERT INTO crm_users (email, name, role, password_salt, password_hash, is_active) VALUES (?, ?, ?, ?, ?, 1)', [email, 'Synthetic Security Probe', 'collection', salt, hash]); userId = inserted.insertId;
      const controller = require(path.join(candidate, 'controllers/authController'));
      const auth = require(path.join(candidate, 'middleware/auth')), sessions = require(path.join(candidate, 'services/authSessions'));
      const req = { tenant, ip: '127.0.0.1', headers: {}, body: { email, password, role: 'collection' } };
      step = 'fresh password and OTP login';
      const first = response(); await controller.login(req, first);
      assert.equal(first.body.data.requiresOtp, true); assert.equal(first.body.data.tenant, tenant.slug); assert.match(otpCode, /^\d{6}$/);
      const second = response(); await controller.verifyTelecallerOtp({ ...req, body: { tempToken: first.body.data.tempToken, otp: otpCode } }, second);
      const token = second.body.data.token, ticket = second.body.data.documentToken, claims = auth.verifyToken(token);
      assert.equal(second.body.data.user.tenant, tenant.slug); assert.ok(await sessions.verifySession(claims));
      assert.equal(auth.verifyToken(ticket), null); assert.ok(auth.verifyToken(ticket, 'crm-documents')); checks.push('fresh SQL-backed password/OTP login and separate document ticket');
      const challenge = await db.query('SELECT consumed_at FROM auth_challenges WHERE user_id = ? AND tenant_slug = ?', [userId, tenant.slug]); assert.ok(challenge[0].consumed_at); checks.push('OTP consumed in MySQL');
      step = 'session invalidation';
      await db.query('UPDATE crm_users SET is_active = 0 WHERE id = ? AND email = ?', [userId, email]); assert.equal(await sessions.verifySession(claims), null);
      await db.query('UPDATE crm_users SET is_active = 1 WHERE id = ? AND email = ?', [userId, email]);
      await sessions.revokeSession(claims); assert.equal(await sessions.verifySession(claims), null); checks.push('disabled staff and logout reject an issued session');
      step = 'synthetic transaction';
      await db.query('CREATE TABLE `' + table + '` (id INT PRIMARY KEY, balance DECIMAL(12,2) NOT NULL) ENGINE=InnoDB'); createdTable = true;
      await db.query('INSERT INTO `' + table + '` (id, balance) VALUES (1, 100.00)'); let notified = 0;
      await assert.rejects(db.withTransaction(async () => { await db.query('UPDATE `' + table + '` SET balance = 110.00 WHERE id = 1'); db.afterCommit(() => { notified++; }); throw new Error('Synthetic rollback'); }), /Synthetic rollback/);
      let rows = await db.query('SELECT balance FROM `' + table + '` WHERE id = 1'); assert.equal(Number(rows[0].balance), 100); assert.equal(notified, 0);
      await db.withTransaction(async () => { await db.query('UPDATE `' + table + '` SET balance = 125.00 WHERE id = 1'); db.afterCommit(() => { notified++; }); });
      rows = await db.query('SELECT balance FROM `' + table + '` WHERE id = 1'); assert.equal(Number(rows[0].balance), 125); assert.equal(notified, 1); checks.push('real MySQL named-lock transaction rollback, commit and deferred notification');
    });
  } finally {
    try { await db.tenantLocalStorage.run({ pool, tenant }, async () => {
      if (userId) {
        for (const name of ['auth_sessions', 'auth_challenges']) await db.query('DELETE FROM ' + name + ' WHERE user_id = ? AND tenant_slug = ?', [userId, tenant.slug]).catch(error => { if (error.code !== 'ER_NO_SUCH_TABLE') throw error; });
        await db.query('DELETE FROM crm_users WHERE id = ? AND email = ?', [userId, email]);
      }
      if (createdTable) { assert.match(table, /^security_probe_[a-f0-9]{20}$/); await db.query('DROP TABLE `' + table + '`'); }
    }); } finally { await new Promise(resolve => pool.end(resolve)); }
  }
  console.log(JSON.stringify({ securitySqlSelfTest: 'passed', checks, productionFinancialWrites: false, emailsSent: false, providerCalls: false, syntheticRowsRemoved: true }, null, 2));
}
main().catch(error => { console.error(JSON.stringify({ securitySqlSelfTest: 'failed', step, code: error.code || error.name, location: String(error.stack || '').split('\n').slice(1, 4) })); process.exitCode = 1; });
