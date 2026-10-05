const mysql = require('mysql');
const { config } = require('../config/env');

const MASTER_DB_NAME = process.env.DB_MASTER_NAME || `${process.env.DB_PREFIX || ''}payday_crm_master`;

async function main() {
  console.log("=========================================");
  console.log("DIAGNOSTIC DATABASE REPORT");
  console.log("=========================================");
  console.log("Master Database Name:", MASTER_DB_NAME);

  const connectionMaster = mysql.createConnection({
    host: config.db.host,
    user: config.db.user,
    password: config.db.password,
    port: config.db.port,
    database: MASTER_DB_NAME,
  });

  connectionMaster.connect(async (err) => {
    if (err) {
      console.error("❌ Failed to connect to master database:", err.message);
      process.exit(1);
    }
    console.log("✅ Connected to master database successfully.");

    // Query tenants
    connectionMaster.query('SELECT id, name, slug, db_name, status FROM tenants', async (error, tenants) => {
      if (error) {
        console.error("❌ Failed to query tenants table:", error.message);
        connectionMaster.end();
        process.exit(1);
      }

      console.log(`\n📋 Tenants in Master Database (${tenants.length} found):`);
      tenants.forEach(t => {
        console.log(`   - ID: ${t.id} | Slug: ${t.slug} | Name: ${t.name} | DB Name: ${t.db_name} | Status: ${t.status}`);
      });

      // Let's also check default database config
      console.log(`\n⚙️ Default Env Database config.db.database: "${config.db.database}"`);

      // Query crm_users in each tenant DB
      const allTenants = [...tenants];
      if (!allTenants.some(t => t.slug === 'waqtfinance')) {
        allTenants.push({ slug: 'waqtfinance', name: 'Waqt Finance (Fallback)', db_name: config.db.database });
      }

      for (const tenant of allTenants) {
        console.log(`\n-----------------------------------------`);
        console.log(`🔍 Checking tenant: ${tenant.slug} (${tenant.db_name})`);
        
        const tenantConnection = mysql.createConnection({
          host: config.db.host,
          user: config.db.user,
          password: config.db.password,
          port: config.db.port,
          database: tenant.db_name,
        });

        await new Promise((resolve) => {
          tenantConnection.connect((tErr) => {
            if (tErr) {
              console.log(`   ❌ Connection failed: ${tErr.message}`);
              resolve();
              return;
            }
            console.log(`   ✅ Connected to tenant DB: ${tenant.db_name}`);

            tenantConnection.query('SHOW TABLES LIKE "crm_users"', (showErr, tables) => {
              if (showErr || tables.length === 0) {
                console.log(`   ⚠️  crm_users table does NOT exist in this DB.`);
                tenantConnection.end();
                resolve();
                return;
              }

              // Let's see columns of crm_users
              tenantConnection.query('DESCRIBE crm_users', (descErr, cols) => {
                if (descErr) {
                  console.log(`   ❌ Failed to describe columns:`, descErr.message);
                } else {
                  const colNames = cols.map(c => c.Field);
                  console.log(`   📋 Columns: ${colNames.join(', ')}`);
                }

                // Query telecallers
                tenantConnection.query(
                  'SELECT id, name, email, role, is_active, on_duty, last_assigned_at FROM crm_users WHERE role = "telecaller"',
                  (tcErr, users) => {
                    if (tcErr) {
                      console.log(`   ❌ Failed to query telecallers: ${tcErr.message}`);
                    } else {
                      console.log(`   👤 Telecallers (${users.length} found):`);
                      users.forEach(u => {
                        console.log(`      - [ID: ${u.id}] ${u.name} (${u.email}) | Active: ${u.is_active} | OnDuty: ${u.on_duty} | LastAssigned: ${u.last_assigned_at}`);
                      });
                    }

                    // Query mappings
                    tenantConnection.query('SHOW TABLES LIKE "user_product_mappings"', (mapTableErr, mapTables) => {
                      if (!mapTableErr && mapTables.length > 0) {
                        tenantConnection.query('SELECT * FROM user_product_mappings', (mapErr, mappings) => {
                          if (!mapErr) {
                            console.log(`   🔗 Product Mappings (${mappings.length} found):`);
                            mappings.forEach(m => {
                              console.log(`      - UserID: ${m.user_id} -> Product: ${m.product_slug}`);
                            });
                          }
                          tenantConnection.end();
                          resolve();
                        });
                      } else {
                        tenantConnection.end();
                        resolve();
                      }
                    });
                  }
                );
              });
            });
          });
        });
      }

      connectionMaster.end();
      console.log("\n=========================================");
      console.log("DIAGNOSTIC COMPLETED");
      console.log("=========================================");
      process.exit(0);
    });
  });
}

main();
