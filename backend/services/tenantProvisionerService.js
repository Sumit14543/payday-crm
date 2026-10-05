const { createDatabaseIfNeeded, getTenantPool, tenantLocalStorage } = require('../config/db');
const { migrate } = require('../database/schema');
const { seed } = require('../database/seed');

async function provisionTenant(tenant) {
  console.log(`Starting database provisioning for tenant: ${tenant.slug} (${tenant.db_name})`);

  // 1. Create database
  await createDatabaseIfNeeded(tenant.db_name);

  // 2. Get connection pool
  const pool = getTenantPool(tenant);

  // 3. Run schema migrations and seeds inside the tenant pool context
  await tenantLocalStorage.run({ pool, tenant }, async () => {
    let isProvisioned = false;
    try {
      isProvisioned = await new Promise((resolve) => {
        pool.query("SHOW TABLES LIKE 'crm_users'", (err, rows) => {
          resolve(!err && rows && rows.length > 0);
        });
      });
    } catch (e) {
      isProvisioned = false;
    }

    if (!isProvisioned || process.env.FORCE_MIGRATIONS === 'true' || process.argv.includes('--setup')) {
      console.log(`Running database schema migrations for ${tenant.slug}...`);
      await migrate();
      console.log(`Running database seeds for ${tenant.slug}...`);
      await seed(tenant);
    } else {
      console.log(`Running database schema incremental migrations for ${tenant.slug}...`);
      await migrate().catch((err) => console.warn(`Incremental migration warning for ${tenant.slug}:`, err.message));
      const { ensureOfficialEmailColumns, ensureRazorpayEmandateColumns, ensureCrmUserRoleSupportsProductAdmin, ensureSupportUsers } = require('../database/schema');
      await ensureOfficialEmailColumns().catch(() => {});
      await ensureRazorpayEmandateColumns().catch(() => {});
      await ensureCrmUserRoleSupportsProductAdmin().catch(() => {});
      await ensureSupportUsers().catch(() => {});
    }
  });


  console.log(`Tenant ${tenant.slug} provisioned successfully!`);
  return true;
}

module.exports = {
  provisionTenant,
};
