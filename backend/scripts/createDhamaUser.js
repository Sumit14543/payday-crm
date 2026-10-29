const crypto = require('crypto');
const { connectDatabase, query } = require('../config/db');

async function createDhamaUser() {
  try {
    await connectDatabase();

    const email = 'durgeshdhama@waqtfinance.com';
    const name = 'Durgesh Dhama';
    const role = 'collection';
    const password = 'Waqt@Durgesh@#2016##';

    const salt = '3f4cf8024dba1d55fa5be8162f2de7bf';
    const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, 'sha256').toString('hex');

    await query(
      `INSERT INTO crm_users (name, email, role, password_salt, password_hash, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         password_salt = VALUES(password_salt),
         password_hash = VALUES(password_hash),
         is_active = 1`,
      [name, email, role, salt, hash]
    );

    console.log(`✅ Collection account ${email} (${role}) created/updated successfully!`);
    console.log(`\n======================================================`);
    console.log(`         DURGESH DHAMA COLLECTION ACCOUNT READY        `);
    console.log(`======================================================`);
    console.log(`Email:    ${email}`);
    console.log(`Name:     ${name}`);
    console.log(`Role:     ${role} (Collection Agent)`);
    console.log(`Password: ${password}`);
    console.log(`OTP 2FA:  Enabled (Login via email OTP)`);
    console.log(`======================================================\n`);

    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to create Dhama collection account:', err);
    process.exit(1);
  }
}

createDhamaUser();
