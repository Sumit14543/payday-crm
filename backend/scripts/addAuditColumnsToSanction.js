const { connectDatabase, query } = require('../config/db');

async function addAuditColumns() {
  await connectDatabase();
  console.log('--- ADDING IP & USER AGENT AUDIT COLUMNS TO LEAD_SANCTIONS ---');

  try {
    await query(`
      ALTER TABLE lead_sanctions 
        ADD COLUMN customer_decision_ip VARCHAR(100) NULL,
        ADD COLUMN customer_decision_user_agent TEXT NULL
    `);
    console.log('Successfully added IP and User-Agent audit columns!');
  } catch (err) {
    if (err.message.includes('Duplicate column')) {
      console.log('Columns already exist on lead_sanctions table.');
    } else {
      console.error('Error adding columns:', err.message);
    }
  }

  process.exit(0);
}

addAuditColumns();
