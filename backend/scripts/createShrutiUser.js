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

  // 1. shruti@waqtmoney.in -> Shruti@@waqtmoney##
  await query(
    `INSERT INTO crm_users (email, name, role, password_salt, password_hash, is_active)
     VALUES ('shruti@waqtmoney.in', 'Shruti Singh', 'credit-manager', ?, ?, 1)
     ON DUPLICATE KEY UPDATE
       name = 'Shruti Singh',
       password_salt = VALUES(password_salt),
       password_hash = VALUES(password_hash),
       is_active = 1`,
    [salt, hashShruti]
  );

  // 2. Delete any non-Shruti credit manager accounts
  await query(`
    DELETE FROM crm_users 
    WHERE (role = 'credit-manager' AND email <> 'shruti@waqtmoney.in')
       OR email IN ('credit@waqtfinance.com', 'test.credit@waqtmoney.in', 'credit@geetpay.com', 'credit@loaninwallet.com')
  `);

  console.log('✅ Shruti credentials set and legacy credit manager accounts purged successfully.');
  process.exit(0);
}

main().catch(err => {
  console.error('Error creating user:', err);
  process.exit(1);
});
