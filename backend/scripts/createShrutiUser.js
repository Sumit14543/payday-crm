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

  // 2. credit@waqtfinance.com -> Admin@123
  await query(
    `INSERT INTO crm_users (email, name, role, password_salt, password_hash, is_active)
     VALUES ('credit@waqtfinance.com', 'Waqt Credit Manager', 'credit-manager', ?, ?, 1)
     ON DUPLICATE KEY UPDATE
       name = 'Waqt Credit Manager',
       password_salt = VALUES(password_salt),
       password_hash = VALUES(password_hash),
       is_active = 1`,
    [salt, hashAdmin]
  );

  console.log('✅ Specific credentials set successfully.');
  process.exit(0);
}

main().catch(err => {
  console.error('Error creating user:', err);
  process.exit(1);
});
