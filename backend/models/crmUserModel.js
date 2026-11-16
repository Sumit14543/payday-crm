const { query } = require('../config/db');

async function findActiveByEmailAndRole(email, role) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  let rows = await query(
    `
      SELECT
        id,
        email,
        name,
        role,
        password_salt AS salt,
        password_hash AS hash
      FROM crm_users
      WHERE email = ?
        AND role = ?
        AND is_active = 1
      LIMIT 1
    `,
    [cleanEmail, role],
  );

  if ((!rows || !rows[0]) && role === 'superadmin') {
    try {
      const { queryMaster } = require('../config/db');
      const masterRows = await queryMaster(
        `SELECT id, email, name, 'superadmin' AS role, password_salt AS salt, password_hash AS hash FROM superadmins WHERE email = ? AND is_active = 1 LIMIT 1`,
        [cleanEmail]
      );
      if (masterRows && masterRows[0]) {
        masterRows[0].isMasterSuperadmin = true;
        return masterRows[0];
      }
    } catch (e) {}
  }

  return rows[0] || null;
}

async function listPublicUsers() {
  return query(`
    SELECT email, name, role
    FROM crm_users
    WHERE is_active = 1
    ORDER BY role, name
  `);
}

async function markLogin(userId, master = false) {
  if (master) return;
  if (!userId) return;

  try {
    await query('UPDATE crm_users SET last_login_at = NOW() WHERE id = ?', [userId]);
  } catch (e) {}
}

async function saveLoginOtp(userId, otpCode, tempToken, expiresAt, fullUser) {
  return require('../services/authSessions').saveChallenge({ ...fullUser, id: userId }, otpCode, tempToken, expiresAt);
}
async function findUserByOtpToken(tempToken) {
  return require('../services/authSessions').findChallenge(tempToken);
}
async function consumeLoginOtp(tempToken, otp) {
  return require('../services/authSessions').consumeChallenge(tempToken, otp);
}
async function clearLoginOtp(userId, tempToken) {
  if (tempToken) return require('../services/authSessions').clearChallenge(tempToken);
}

async function listActiveTelecallers() {
  return query(`
    SELECT id, email, name
    FROM crm_users
    WHERE role = 'telecaller'
      AND is_active = 1
      AND LOWER(email) NOT LIKE 'telecaller@%'
      AND LOWER(email) NOT LIKE 'support@%'
    ORDER BY id ASC
  `);
}

module.exports = {
  findActiveByEmailAndRole,
  listPublicUsers,
  listActiveTelecallers,
  markLogin,
  saveLoginOtp,
  findUserByOtpToken,
  clearLoginOtp,
  consumeLoginOtp,
};
