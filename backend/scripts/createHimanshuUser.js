const crypto = require('crypto');
const { connectDatabase, query } = require('../config/db');

async function createHimanshuUser() {
  try {
    await connectDatabase();

    const email = 'himanshukumar@waqtfinance.com';
    const name = 'Himanshu';
    const role = 'collection';
    const password = process.env.USER_PASSWORD || process.argv[2];
    if (!password) {
      console.error('Usage: node createHimanshuUser.js <password>');
      process.exit(1);
    }

    const salt = '45fc08e36726dcad454fdc48a13b0c61';
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
    console.log(`         HIMANSHU COLLECTION ACCOUNT READY             `);
    console.log(`======================================================`);
    console.log(`Email:    ${email}`);
    console.log(`Name:     ${name}`);
    console.log(`Role:     ${role} (Collection Agent)`);
    // password omitted for security
    console.log(`OTP 2FA:  Enabled (Login via email OTP)`);
    console.log(`======================================================\n`);

    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to create Himanshu collection account:', err);
    process.exit(1);
  }
}

createHimanshuUser();
