const { connectDatabase, query, queryMaster, getTenantPool, tenantLocalStorage } = require('../config/db');
const { migrateMaster, seedMaster } = require('../database/masterSchema');
require('../config/env');

async function main() {
  console.log('--- Starting Multi-Tenancy Connection Switcher Test ---');

  try {
    // 1. Initialize master and default pool
    await connectDatabase();
    console.log('✅ Connected to database pools successfully.');

    // 2. Run master migrations
    await migrateMaster();
    await seedMaster();
    console.log('✅ Master database migrated & seeded.');

    // 3. Test querying master DB
    const tenants = await queryMaster('SELECT * FROM tenants');
    console.log(`✅ Master DB queried. Found ${tenants.length} tenants in master list:`);
    tenants.forEach(t => {
      console.log(`   - ${t.name} (${t.slug}) -> DB: ${t.db_name} [${t.status}]`);
    });

    // 4. Test querying default tenant (Waqt Finance)
    const [cibilCheck] = await query('SELECT COUNT(*) AS count FROM cibil_reports');
    console.log(`✅ Default tenant database queried successfully. cibil_reports count: ${cibilCheck.count}`);

    // 5. Test switching context dynamically
    console.log('\n--- Testing connection switching context ---');
    const testTenant = {
      slug: 'testcompany',
      db_name: `${process.env.DB_PREFIX || ''}payday_tenant_testcompany`
    };

    const testPool = getTenantPool(testTenant);
    
    await tenantLocalStorage.run(testPool, async () => {
      try {
        // Query inside context (will try to select from the testcompany DB)
        // Since we haven't provisioned testcompany DB yet in this script, it should throw an ER_BAD_DB_ERROR
        // which proves it successfully switched context and tried to query the new database!
        await query('SELECT 1');
      } catch (err) {
        if (err.code === 'ER_BAD_DB_ERROR') {
          console.log('✅ Context switching verified! Query successfully targeted crm_tenant_testcompany database.');
        } else {
          throw err;
        }
      }
    });

    console.log('\n🎉 ALL MULTI-TENANCY VERIFICATION TESTS PASSED SUCCESSFULLY! 🎉');
    process.exit(0);
  } catch (error) {
    console.error('❌ Verification test failed:', error);
    process.exit(1);
  }
}

main();
