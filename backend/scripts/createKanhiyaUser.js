const crypto = require('crypto');
const { connectDatabase, query } = require('../config/db');

async function createKanhiyaUser() {
  try {
    await connectDatabase();

    const email = 'kanhiayakumar@waqtfinance.com';
    const name = 'Kanhiya Kumar';
    const role = 'collection';
    const password = 'Kanhiaya@#2016##';

    const salt = 'cf0af1027e1f5b00788a041c6f8f62f7';
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
    console.log(`         KANHIYA KUMAR COLLECTION ACCOUNT READY        `);
    console.log(`======================================================`);
    console.log(`Email:    ${email}`);
    console.log(`Name:     ${name}`);
    console.log(`Role:     ${role} (Collection Agent)`);
    console.log(`Password: ${password}`);
    console.log(`======================================================\n`);

    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to create Kanhiya collection account:', err);
    process.exit(1);
  }
}

createKanhiyaUser();
