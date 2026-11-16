const crypto = require('crypto');
const { query, queryMaster, tenantLocalStorage } = require('../config/db');
const initialized = new WeakMap(), defaultScope = {}, masterScope = {};
const digest = value => crypto.createHmac('sha256', String(process.env.AUTH_TOKEN_SECRET || '')).update(String(value)).digest('hex');
const tenantSlug = () => tenantLocalStorage.getStore()?.tenant?.slug || 'waqtfinance';
const database = master => master ? queryMaster : query;

async function ensureTables(master = false) {
  const scope = master ? masterScope : tenantLocalStorage.getStore()?.pool || defaultScope;
  if (!initialized.has(scope)) {
    const execute = database(master);
    const job = (async () => {
      await execute(`CREATE TABLE IF NOT EXISTS auth_sessions (
        id CHAR(64) PRIMARY KEY, user_id INT UNSIGNED NOT NULL, role VARCHAR(60) NOT NULL,
        tenant_slug VARCHAR(100) NOT NULL, credential_hash CHAR(64) NOT NULL,
        expires_at DATETIME NOT NULL, revoked_at DATETIME DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_auth_session_user (user_id, role), INDEX idx_auth_session_expiry (expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      await execute(`CREATE TABLE IF NOT EXISTS auth_challenges (
        id CHAR(64) PRIMARY KEY, user_id INT UNSIGNED NOT NULL, role VARCHAR(60) NOT NULL,
        tenant_slug VARCHAR(100) NOT NULL, otp_hash CHAR(64) NOT NULL,
        credential_hash CHAR(64) NOT NULL, expires_at DATETIME NOT NULL,
        attempts INT NOT NULL DEFAULT 0, resend_count INT NOT NULL DEFAULT 0,
        consumed_at DATETIME DEFAULT NULL, last_sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_auth_challenge_user (user_id, role), INDEX idx_auth_challenge_expiry (expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    })().catch(error => { initialized.delete(scope); throw error; });
    initialized.set(scope, job);
  }
  await initialized.get(scope);
}
function fail(message = 'Invalid or expired security session. Please log in again.', statusCode = 401) {
  const error = new Error(message); error.statusCode = statusCode; error.publicMessage = message; throw error;
}
function credentialHash(user) { return digest(`${user.password_salt || user.salt}:${user.password_hash || user.hash}`); }
async function findIdentity(user, master = Boolean(user.isMasterSuperadmin)) {
  const rows = await database(master)(master
    ? `SELECT id, email, name, 'superadmin' AS role, password_salt, password_hash FROM superadmins WHERE id = ? AND email = ? AND is_active = 1 LIMIT 1`
    : `SELECT id, email, name, role, password_salt, password_hash FROM crm_users WHERE id = ? AND email = ? AND role = ? AND is_active = 1 LIMIT 1`,
  master ? [user.id, user.email] : [user.id, user.email, user.role]);
  return rows[0] || null;
}
async function createSession(user, ttlMs) {
  const master = Boolean(user.isMasterSuperadmin), current = await findIdentity(user, master);
  if (!current || current.role !== user.role || (user.credentialVersion && user.credentialVersion !== credentialHash(current))) fail();
  await ensureTables(master);
  const id = crypto.randomBytes(32).toString('hex'), scope = master ? 'platform' : tenantSlug(), expiresAt = Date.now() + ttlMs;
  await database(master)(`INSERT INTO auth_sessions (id, user_id, role, tenant_slug, credential_hash, expires_at) VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))`,
    [id, current.id, current.role, scope, credentialHash(current), Math.floor(ttlMs / 1000)]);
  return { id: current.id, email: current.email, name: current.name, role: current.role, sessionId: id, tenant: scope, isMasterSuperadmin: master, expiresAt };
}
async function verifySession(claims) {
  const master = claims.isMasterSuperadmin === true;
  if (!master && claims.tenant !== tenantSlug()) return null;
  await ensureTables(master);
  const rows = await database(master)(`SELECT credential_hash FROM auth_sessions WHERE id = ? AND user_id = ? AND role = ? AND tenant_slug = ? AND revoked_at IS NULL AND expires_at > NOW() LIMIT 1`,
    [claims.sessionId, claims.id, claims.role, claims.tenant]);
  if (!rows[0]) return null;
  const current = await findIdentity(claims, master);
  if (!current || current.role !== claims.role || rows[0].credential_hash !== credentialHash(current)) return null;
  return { id: current.id, email: current.email, name: current.name, role: current.role, sessionId: claims.sessionId, tenant: claims.tenant, isMasterSuperadmin: master };
}
async function revokeSession(user) {
  if (user?.sessionId) await database(user.isMasterSuperadmin)(`UPDATE auth_sessions SET revoked_at = NOW() WHERE id = ? AND user_id = ?`, [user.sessionId, user.id]);
}
async function saveChallenge(user, otp, token, expiresAt) {
  const ttl = Math.max(0, Math.min(600, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));
  const master = Boolean(user.isMasterSuperadmin), current = await findIdentity(user, master);
  if (!current) fail();
  await ensureTables(master);
  const id = digest(token), execute = database(master);
  const existing = await execute('SELECT id FROM auth_challenges WHERE id = ? LIMIT 1', [id]);
  if (existing[0]) {
    const result = await execute(`UPDATE auth_challenges SET otp_hash = ?, expires_at = DATE_ADD(NOW(), INTERVAL ? SECOND), last_sent_at = NOW(), resend_count = resend_count + 1
      WHERE id = ? AND consumed_at IS NULL AND attempts < 3 AND resend_count < 2 AND last_sent_at < DATE_SUB(NOW(), INTERVAL 60 SECOND)`, [digest(`${token}:${otp}`), ttl, id]);
    if (result.affectedRows !== 1) fail('Please wait before requesting another OTP, or log in again.', 429);
  } else {
    await execute(`UPDATE auth_challenges SET consumed_at = NOW() WHERE user_id = ? AND role = ? AND consumed_at IS NULL`, [user.id, user.role]);
    await execute(`INSERT INTO auth_challenges (id, user_id, role, tenant_slug, otp_hash, credential_hash, expires_at) VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))`,
      [id, current.id, current.role, master ? 'platform' : tenantSlug(), digest(`${token}:${otp}`), credentialHash(current), ttl]);
  }
}
async function findChallenge(token) {
  if (!/^[a-f0-9]{64}$/.test(String(token || ''))) return null;
  for (const master of [false, true]) {
    await ensureTables(master);
    const rows = await database(master)(`SELECT * FROM auth_challenges WHERE id = ? AND consumed_at IS NULL AND expires_at > NOW() AND attempts < 3 LIMIT 1`, [digest(token)]);
    const row = rows[0];
    if (!row || (!master && row.tenant_slug !== tenantSlug())) continue;
    const users = await database(master)(`SELECT id, email, name, ${master ? "'superadmin' AS role" : 'role'}, password_salt, password_hash FROM ${master ? 'superadmins' : 'crm_users'} WHERE id = ? AND is_active = 1 LIMIT 1`, [row.user_id]);
    const user = users[0];
    if (!user || user.role !== row.role || credentialHash(user) !== row.credential_hash) return null;
    return { ...user, isMasterSuperadmin: master, challenge: row };
  }
  return null;
}
async function consumeChallenge(token, otp) {
  const found = await findChallenge(token);
  if (!found) fail();
  const execute = database(found.isMasterSuperadmin);
  const result = await execute(`UPDATE auth_challenges SET consumed_at = NOW() WHERE id = ? AND otp_hash = ? AND consumed_at IS NULL AND expires_at > NOW() AND attempts < 3`,
    [digest(token), digest(`${token}:${String(otp || '').trim()}`)]);
  if (result.affectedRows !== 1) {
    await execute(`UPDATE auth_challenges SET consumed_at = CASE WHEN attempts >= 2 THEN NOW() ELSE consumed_at END, attempts = attempts + 1 WHERE id = ? AND consumed_at IS NULL`, [digest(token)]);
    fail('Invalid or expired OTP. Please retry or log in again.');
  }
  const { password_salt, password_hash, challenge, ...user } = found;
  return { ...user, credentialVersion: challenge.credential_hash };
}
async function clearChallenge(token) {
  const found = await findChallenge(token);
  if (found) await database(found.isMasterSuperadmin)('UPDATE auth_challenges SET consumed_at = NOW() WHERE id = ?', [digest(token)]);
}
module.exports = { createSession, verifySession, revokeSession, saveChallenge, findChallenge, consumeChallenge, clearChallenge, ensureTables, tenantSlug };
