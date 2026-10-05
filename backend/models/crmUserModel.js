const { query } = require('../config/db');

async function findActiveByEmailAndRole(email, role) {
  const rows = await query(
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
    [String(email || '').trim().toLowerCase(), role],
  );

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

async function markLogin(userId) {
  if (!userId) return;

  await query('UPDATE crm_users SET last_login_at = NOW() WHERE id = ?', [userId]);
}

async function saveLoginOtp(userId, otpCode, tempToken, expiresAt) {
  if (!userId) return;
  await query(
    `UPDATE crm_users SET login_otp_code = ?, login_otp_token = ?, login_otp_expires_at = ? WHERE id = ?`,
    [otpCode, tempToken, expiresAt, userId]
  );
}

async function findUserByOtpToken(tempToken) {
  if (!tempToken) return null;
  const rows = await query(
    `SELECT id, email, name, role, login_otp_code, login_otp_token, login_otp_expires_at
     FROM crm_users WHERE login_otp_token = ? AND is_active = 1 LIMIT 1`,
    [tempToken]
  );
  return rows[0] || null;
}

async function clearLoginOtp(userId) {
  if (!userId) return;
  await query(
    `UPDATE crm_users SET login_otp_code = NULL, login_otp_token = NULL, login_otp_expires_at = NULL WHERE id = ?`,
    [userId]
  );
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
};


