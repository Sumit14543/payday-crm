const { query } = require('../config/db');
const { ensureCrmUserRoleSupportsProductAdmin } = require('./schema');

async function seed(tenant) {
  await ensureCrmUserRoleSupportsProductAdmin();
  await seedCrmUsers(tenant);
  await seedTeam();
  await seedFinanceTables();
}

// A database config mapping for tenants to easily configure custom user credentials
async function seedCrmUsers() {
  // New tenant users are created through explicit, authenticated provisioning.
  // Never install source-known credentials or purge operational identities here.
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
