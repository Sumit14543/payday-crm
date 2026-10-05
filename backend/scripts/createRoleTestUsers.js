const crypto = require('crypto');
const { connectDatabase, query } = require('../config/db');

async function createRoleTestUsers() {
  try {
    await connectDatabase();

    const testUsers = [
      {
        email: 'test.telecaller@waqtmoney.in',
        name: 'Test Telecaller User',
        role: 'telecaller',
        password: 'WaqtTest@2026##',
      },
      {
        email: 'test.collection@waqtmoney.in',
        name: 'Test Collection User',
        role: 'collection',
        password: 'WaqtTest@2026##',
      },
      {
        email: 'test.credit@waqtmoney.in',
        name: 'Test Credit Manager User',
        role: 'credit-manager',
        password: 'WaqtTest@2026##',
      },
      {
        email: 'test.accountant@waqtmoney.in',
        name: 'Test Accountant User',
        role: 'accountant',
        password: 'WaqtTest@2026##',
      },
      {
        email: 'test.admin@waqtmoney.in',
        name: 'Test Product Admin User',
        role: 'product-admin',
        password: 'WaqtTest@2026##',
      },
    ];

    console.log(`\n======================================================`);
    console.log(`         SEEDING ROLE-SPECIFIC TEST USERS             `);
    console.log(`======================================================`);

    for (const u of testUsers) {
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.pbkdf2Sync(String(u.password), salt, 120000, 32, 'sha256').toString('hex');

      const existing = await query('SELECT id FROM crm_users WHERE email = ? AND role = ?', [u.email, u.role]);

      if (existing.length > 0) {
        await query(
          'UPDATE crm_users SET name = ?, password_salt = ?, password_hash = ?, is_active = 1, on_duty = 1, updated_at = CURRENT_TIMESTAMP WHERE email = ? AND role = ?',
          [u.name, salt, hash, u.email, u.role]
        );
        console.log(`✅ Updated: ${u.email} [Role: ${u.role}]`);
      } else {
        await query(
          'INSERT INTO crm_users (name, email, role, password_salt, password_hash, is_active, on_duty, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
          [u.name, u.email, u.role, salt, hash]
        );
        console.log(`✅ Created: ${u.email} [Role: ${u.role}]`);
      }
    }

    console.log(`======================================================\n`);
  } catch (err) {
    console.error('❌ Error seeding test users:', err.message);
  } finally {
    process.exit(0);
  }
}

createRoleTestUsers();
