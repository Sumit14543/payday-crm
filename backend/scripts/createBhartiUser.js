const crypto = require('crypto');
const { connectDatabase, query } = require('../config/db');

async function createBhartiUser() {
  try {
    await connectDatabase();

    const email = 'bhartigautam@waqtfinance.com';
    const name = 'Bharti Gautam';
    const role = 'telecaller';
    const password = 'Waqt@Bharti@#2016##';

    const salt = 'df901231e79d0392c3d5dd45205f147b';
    const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, 'sha256').toString('hex');

    await query(
      `INSERT INTO crm_users (name, email, role, password_salt, password_hash, is_active, on_duty, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         password_salt = VALUES(password_salt),
         password_hash = VALUES(password_hash),
         is_active = 1,
         on_duty = 1`,
      [name, email, role, salt, hash]
    );

    // Ensure user_product_mappings
    const rows = await query(`SELECT id FROM crm_users WHERE email = ?`, [email]);
    if (rows && rows[0]) {
      await query(
        `INSERT IGNORE INTO user_product_mappings (user_id, product_slug) VALUES (?, 'waqtfinance')`,
        [rows[0].id]
      );
    }

    console.log(`✅ Telecaller account ${email} (${role}) created/updated successfully!`);
    console.log(`\n======================================================`);
    console.log(`         BHARTI GAUTAM TELECALLER ACCOUNT READY        `);
    console.log(`======================================================`);
    console.log(`Email:    ${email}`);
    console.log(`Name:     ${name}`);
    console.log(`Role:     ${role} (Sales & Support Telecaller)`);
    console.log(`Password: ${password}`);
    console.log(`OTP 2FA:  Enabled (Login via email OTP)`);
    console.log(`======================================================\n`);

    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to create Bharti telecaller account:', err);
    process.exit(1);
  }
}

createBhartiUser();
