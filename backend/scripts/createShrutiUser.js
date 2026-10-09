const crypto = require('crypto');
const { bootstrap } = require('../database/bootstrap');
const { query } = require('../config/db');

async function main() {
  await bootstrap();
  const salt = '45fc08e36726dcad454fdc48a13b0c61';
  
  const passShruti = 'Shruti@@waqtmoney##';
  const hashShruti = crypto.pbkdf2Sync(passShruti, salt, 120000, 32, 'sha256').toString('hex');

  const passAdmin = 'Admin@123';
  const hashAdmin = crypto.pbkdf2Sync(passAdmin, salt, 120000, 32, 'sha256').toString('hex');

  // 1. shrutisingh@waqtmoney.in -> Shruti@@waqtmoney##
  await query(
    `INSERT INTO crm_users (email, name, role, password_salt, password_hash, is_active)
     VALUES ('shrutisingh@waqtmoney.in', 'Shruti Singh', 'credit-manager', ?, ?, 1)
     ON DUPLICATE KEY UPDATE
       name = 'Shruti Singh',
       password_salt = VALUES(password_salt),
       password_hash = VALUES(password_hash),
       is_active = 1`,
    [salt, hashShruti]
  );

  // 2. Delete any unauthorized credit manager accounts
  await query(`
    DELETE FROM crm_users 
    WHERE (role = 'credit-manager' AND email NOT IN ('shrutisingh@waqtmoney.in', 'test.credit@waqtmoney.in'))
       OR email IN ('credit@waqtfinance.com', 'credit@geetpay.com', 'credit@loaninwallet.com', 'shruti@waqtmoney.in')
  `);

  // 3. Ensure test.credit@waqtmoney.in exists for testing
  const passTest = 'WaqtTest@2026##';
  const hashTest = crypto.pbkdf2Sync(passTest, salt, 120000, 32, 'sha256').toString('hex');
  await query(
    `INSERT INTO crm_users (email, name, role, password_salt, password_hash, is_active)
     VALUES ('test.credit@waqtmoney.in', 'Test Credit Manager', 'credit-manager', ?, ?, 1)
     ON DUPLICATE KEY UPDATE
       name = 'Test Credit Manager',
       password_salt = VALUES(password_salt),
       password_hash = VALUES(password_hash),
       is_active = 1`,
    [salt, hashTest]
  );

  console.log('✅ Shruti and Test Credit Manager credentials set, and legacy accounts purged successfully.');
  process.exit(0);
}

main().catch(err => {
  console.error('Error creating user:', err);
  process.exit(1);
});
