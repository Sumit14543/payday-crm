const { query } = require('../config/db');
const { ensureCrmUserRoleSupportsProductAdmin } = require('./schema');

async function seed(tenant) {
  await ensureCrmUserRoleSupportsProductAdmin();
  await seedCrmUsers(tenant);
  await seedTeam();
  await seedFinanceTables();
}

// A database config mapping for tenants to easily configure custom user credentials
const TENANT_USER_SEEDS = {
  waqtfinance: {
    telecaller: {
      email: 'telecaller@waqtfinance.com',
      name: 'Waqt Telecaller',
      salt: '45fc08e36726dcad454fdc48a13b0c61',
      hash: '70db89d03407cd26e00725ffd1f9cbc9822b33cc36e6f7047d86c0fccd517b8c', // Default Admin@123
    },
    'credit-manager': {
      email: 'shrutisingh@waqtmoney.in',
      name: 'Shruti Singh',
      salt: '45fc08e36726dcad454fdc48a13b0c61',
      hash: '2b4ddded9506d7c47afa921cfc5696cf54ec1cdd3932851da1a042f0dcd0c537',
    },
    accountant: {
      email: 'account@waqtfinance.com',
      name: 'Waqt Accountant',
      salt: '45fc08e36726dcad454fdc48a13b0c61',
      hash: '70db89d03407cd26e00725ffd1f9cbc9822b33cc36e6f7047d86c0fccd517b8c',
    },
    collection: {
      email: 'collection@waqtfinance.com',
      name: 'Waqt Collection',
      salt: '45fc08e36726dcad454fdc48a13b0c61',
      hash: '70db89d03407cd26e00725ffd1f9cbc9822b33cc36e6f7047d86c0fccd517b8c',
    },
  },
  geetpay: {
    telecaller: {
      email: 'telecaller@geetpay.com',
      name: 'GeetPay Telecaller',
      salt: '45fc08e36726dcad454fdc48a13b0c61',
      hash: '70db89d03407cd26e00725ffd1f9cbc9822b33cc36e6f7047d86c0fccd517b8c', // Default Admin@123
    },
    'credit-manager': {
      email: 'shrutisingh@waqtmoney.in',
      name: 'Shruti Singh',
      salt: '45fc08e36726dcad454fdc48a13b0c61',
      hash: '2b4ddded9506d7c47afa921cfc5696cf54ec1cdd3932851da1a042f0dcd0c537',
    },
    accountant: {
      email: 'account@geetpay.com',
      name: 'GeetPay Accountant',
      salt: '45fc08e36726dcad454fdc48a13b0c61',
      hash: '70db89d03407cd26e00725ffd1f9cbc9822b33cc36e6f7047d86c0fccd517b8c',
    },
    collection: {
      email: 'collection@geetpay.com',
      name: 'GeetPay Collection',
      salt: '45fc08e36726dcad454fdc48a13b0c61',
      hash: '70db89d03407cd26e00725ffd1f9cbc9822b33cc36e6f7047d86c0fccd517b8c',
    },
  },
  loaninwallet: {
    telecaller: {
      email: 'telecaller@loaninwallet.com',
      name: 'LoanInWallet Telecaller',
      salt: '45fc08e36726dcad454fdc48a13b0c61',
      hash: '70db89d03407cd26e00725ffd1f9cbc9822b33cc36e6f7047d86c0fccd517b8c', // Default Admin@123
    },
    'credit-manager': {
      email: 'shrutisingh@waqtmoney.in',
      name: 'Shruti Singh',
      salt: '45fc08e36726dcad454fdc48a13b0c61',
      hash: '2b4ddded9506d7c47afa921cfc5696cf54ec1cdd3932851da1a042f0dcd0c537',
    },
    accountant: {
      email: 'account@loaninwallet.com',
      name: 'LoanInWallet Accountant',
      salt: '45fc08e36726dcad454fdc48a13b0c61',
      hash: '70db89d03407cd26e00725ffd1f9cbc9822b33cc36e6f7047d86c0fccd517b8c',
    },
    collection: {
      email: 'collection@loaninwallet.com',
      name: 'LoanInWallet Collection',
      salt: '45fc08e36726dcad454fdc48a13b0c61',
      hash: '70db89d03407cd26e00725ffd1f9cbc9822b33cc36e6f7047d86c0fccd517b8c',
    },
  },
};

async function seedCrmUsers(tenant) {
  const slug = tenant?.slug || 'waqtfinance';
  const name = tenant?.name || 'Waqt Finance';
  const roles = ['telecaller', 'credit-manager', 'accountant', 'collection', 'product-admin'];

  const customConfig = TENANT_USER_SEEDS[slug];

  for (const role of roles) {
    let email, userName, salt, hash;

    if (role === 'credit-manager') {
      email = 'shrutisingh@waqtmoney.in';
      userName = 'Shruti Singh';
      salt = '45fc08e36726dcad454fdc48a13b0c61';
      hash = '2b4ddded9506d7c47afa921cfc5696cf54ec1cdd3932851da1a042f0dcd0c537';
    } else if (customConfig && customConfig[role]) {
      email = customConfig[role].email;
      userName = customConfig[role].name;
      salt = customConfig[role].salt;
      hash = customConfig[role].hash;
    } else {
      const isWaqt = slug === 'waqtfinance';
      email = isWaqt ? (role === 'product-admin' ? 'support@waqtfinance.com' : `${role}@waqtfinance.com`) : `${role}@${slug}.com`;
      userName = isWaqt ? (role === 'product-admin' ? 'Waqt Support Admin' : `Waqt ${role}`) : `${name} ${role}`;
      salt = '45fc08e36726dcad454fdc48a13b0c61';
      hash = role === 'product-admin' ? 'aa685e02f752d8ed815bd246a6fd721ed2376e170b4758bf70ececdc431b4521' : '70db89d03407cd26e00725ffd1f9cbc9822b33cc36e6f7047d86c0fccd517b8c';
    }

    await query(
      `
        INSERT INTO crm_users (email, name, role, password_salt, password_hash, is_active)
        VALUES (?, ?, ?, ?, ?, 1)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          password_salt = VALUES(password_salt),
          password_hash = VALUES(password_hash),
          is_active = 1
      `,
      [email, userName, role, salt, hash],
    );
  }

  // Purge any unauthorized or legacy credit manager accounts
  await query(`
    DELETE FROM crm_users 
    WHERE (role = 'credit-manager' AND email <> 'shrutisingh@waqtmoney.in')
       OR email IN ('credit@waqtfinance.com', 'test.credit@waqtmoney.in', 'credit@geetpay.com', 'credit@loaninwallet.com', 'shruti@waqtmoney.in')
  `);

  // Also seed support telecaller account for all leads monitoring
  await query(
    `
      INSERT INTO crm_users (email, name, role, password_salt, password_hash, is_active)
      VALUES 
        ('support@waqtmoney.in', 'Waqt Support Telecaller', 'telecaller', '45fc08e36726dcad454fdc48a13b0c61', '70db89d03407cd26e00725ffd1f9cbc9822b33cc36e6f7047d86c0fccd517b8c', 1),
        ('support@waqtmoney.in', 'Waqt Support Admin', 'product-admin', '45fc08e36726dcad454fdc48a13b0c61', 'aa685e02f752d8ed815bd246a6fd721ed2376e170b4758bf70ececdc431b4521', 1)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        password_salt = VALUES(password_salt),
        password_hash = VALUES(password_hash),
        is_active = 1
    `
  );
}

async function seedTeam() {
  const [existing] = await query('SELECT COUNT(*) AS count FROM team_members');
  if (Number(existing.count) > 0) return;

  await query(`
    INSERT INTO team_members (id, name, role, active_leads, leads, commission, sales, status) VALUES
    ('T-001', 'Sarah Johnson', 'Loan Officer', 12, 42, 8500, 85000, 'Sales'),
    ('T-002', 'Mike Davis', 'Sales Agent', 8, 38, 7200, 72000, 'Sales'),
    ('T-003', 'Tom Anderson', 'Sales Agent', 6, 35, 6800, 68000, 'Sales'),
    ('T-004', 'Lisa White', 'Manager', 3, 29, 5500, 55000, 'Sales');
  `);
}

async function seedFinanceTables() {
  const [existing] = await query('SELECT COUNT(*) AS count FROM income_lines');
  if (Number(existing.count) > 0) return;

  await query(`
    INSERT INTO income_lines (id, source, today_amount, month_amount, trend) VALUES
    ('INC-001', 'ACH repayments', 3105, 45200, '+13.6%'),
    ('INC-002', 'Card payments', 2500, 18800, '+8.1%'),
    ('INC-003', 'Late fees', 420, 3000, '-2.4%');

    INSERT INTO commissions (id, member_name, volume, commission, clawback, payout) VALUES
    ('COM-001', 'Sarah Johnson', 18000, 2100, 0, 'Ready'),
    ('COM-002', 'Mike Davis', 14500, 1678, 205, 'Review'),
    ('COM-003', 'Tom Anderson', 12100, 1400, 0, 'Ready');

    INSERT INTO invoices (id, payee, type, amount, status, due_date) VALUES
    ('INV-001', 'Sarah Johnson', 'Commission', 2100, 'Ready', '2026-04-30'),
    ('INV-002', 'ACH Processor', 'Settlement fee', 840, 'Awaiting approval', '2026-05-01'),
    ('INV-003', 'Mike Davis', 'Commission', 1473, 'Review', '2026-04-30');
  `);
}

module.exports = { seed };
