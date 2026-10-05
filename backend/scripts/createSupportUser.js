const crypto = require('crypto');
const { connectDatabase, query } = require('../config/db');

async function createSupportUser() {
  try {
    await connectDatabase();

    const usersToCreate = [
      {
        email: 'support@waqtmoney.in',
        name: 'Support Telecaller (All Leads)',
        role: 'telecaller',
        password: 'WaqtSupport@2026##',
      },
      {
        email: 'support@waqtfinance.com',
        name: 'Support Telecaller (All Leads)',
        role: 'telecaller',
        password: 'WaqtSupport@2026##',
      },
      {
        email: 'support@waqtmoney.in',
        name: 'Support Collection (All Leads)',
        role: 'collection',
        password: 'WaqtSupport@2026##',
      },
      {
        email: 'support@waqtfinance.com',
        name: 'Support Collection (All Leads)',
        role: 'collection',
        password: 'WaqtSupport@2026##',
      },
      {
        email: 'support@waqtmoney.in',
        name: 'Support Admin (All Leads)',
        role: 'product-admin',
        password: 'Bhupendra@#2026@#',
      },
      {
        email: 'support@waqtfinance.com',
        name: 'Support Admin (All Leads)',
        role: 'product-admin',
        password: 'Bhupendra@#2026@#',
      },
    ];

    for (const u of usersToCreate) {
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.pbkdf2Sync(String(u.password), salt, 120000, 32, 'sha256').toString('hex');

      const existing = await query('SELECT * FROM crm_users WHERE email = ? AND role = ?', [u.email, u.role]);

      if (existing.length > 0) {
        await query(
          'UPDATE crm_users SET name = ?, password_salt = ?, password_hash = ?, is_active = 1, on_duty = 1, updated_at = CURRENT_TIMESTAMP WHERE email = ? AND role = ?',
          [u.name, salt, hash, u.email, u.role]
        );
        console.log(`✅ Support account ${u.email} (${u.role}) updated successfully!`);
      } else {
        await query(
          'INSERT INTO crm_users (name, email, role, password_salt, password_hash, is_active, on_duty, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
          [u.name, u.email, u.role, salt, hash]
        );
        console.log(`✅ Support account ${u.email} (${u.role}) created successfully!`);
      }
    }

    console.log(`\n======================================================`);
    console.log(`         ALL-LEADS SUPPORT ACCOUNTS READY             `);
    console.log(`======================================================`);
    console.log(`Email 1:  support@waqtmoney.in`);
    console.log(`Email 2:  support@waqtfinance.com`);
    console.log(`Password: WaqtSupport@2026##`);
    console.log(`Role:     Product Admin (Sees 100% of Kajal, Nandini & All Leads)`);
    console.log(`======================================================\n`);
  } catch (err) {
    console.error('Failed to create/update support users:', err);
  } finally {
    process.exit(0);
  }
}

createSupportUser();
