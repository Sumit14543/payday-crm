const { connectDatabase, query, queryMaster } = require('../config/db');

async function heal() {
  await connectDatabase();
  console.log('--- Database Connected ---');

  let tenants = [];
  try {
    tenants = await queryMaster('SELECT * FROM tenants');
  } catch (e) {
    console.log('Could not load master tenants list, using default DB pool.');
  }

  const { config } = require('../config/env');
  const dbs = new Set(['waqtmoney_payday', config.db.database].filter(Boolean));
  for (const t of tenants) {
    if (t.db_name) dbs.add(t.db_name);
  }

  for (const db of dbs) {
    console.log(`\n--- Healing DB: ${db} ---`);

    // 1. Update applications matched via repayment schedule
    try {
      const result1 = await query(`
        UPDATE \`${db}\`.loan_applications la
        JOIN \`${db}\`.loan_repayment_schedule sched ON (la.application_id = sched.application_id OR la.id = sched.lead_id)
        JOIN \`${db}\`.loans l ON l.id = sched.loan_id
        SET la.status = 'closed', la.is_active_application = 0
        WHERE (l.status IN ('Paid Off', 'Closed') OR l.balance <= 0)
          AND (la.status <> 'closed' OR la.is_active_application <> 0)
      `);
      console.log(`Updated ${result1.affectedRows || 0} applications via schedule matching.`);
    } catch (e) {
      console.log(`[${db}] Schedule matching error: ${e.message}`);
    }

    // 2. Customer phone/email broad matching removed to prevent closing new re-loan applications of customers with old paid loans.

    // 3. Sync customer active_loans & total_repaid
    try {
      const result3 = await query(`
        UPDATE \`${db}\`.customers c
        SET c.active_loans = (
          SELECT COUNT(*) FROM \`${db}\`.loans l 
          WHERE l.customer_id = c.id AND l.status NOT IN ('Paid Off', 'Closed') AND l.balance > 0
        ),
        c.total_repaid = (
          SELECT COALESCE(SUM(l.amount_paid), 0) FROM \`${db}\`.loans l 
          WHERE l.customer_id = c.id
        )
      `);
      console.log(`Synced ${result3.affectedRows || 0} customer active_loans/repaid stats.`);
    } catch (e) {
      console.log(`[${db}] Customer stats sync error: ${e.message}`);
    }

    // 4. Sync repayment schedule status
    try {
      const result4 = await query(`
        UPDATE \`${db}\`.loan_repayment_schedule sched
        JOIN \`${db}\`.loans l ON l.id = sched.loan_id
        SET sched.status = 'paid'
        WHERE (l.status IN ('Paid Off', 'Closed') OR l.balance <= 0) AND sched.status <> 'paid'
      `);
      console.log(`Synced ${result4.affectedRows || 0} repayment schedule rows to paid.`);
    } catch (e) {
      console.log(`[${db}] Repayment schedule sync error: ${e.message}`);
    }
  }

  console.log('\nDatabase healing completed successfully.');
  process.exit(0);
}

heal().catch(err => {
  console.error('Failed to run healing script:', err);
  process.exit(1);
});
