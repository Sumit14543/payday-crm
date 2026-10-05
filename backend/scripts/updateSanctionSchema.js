const { connectDatabase, query } = require('../config/db');

async function updateSanctionSchema() {
  await connectDatabase();
  console.log('--- ALTERING LEAD_SANCTIONS TABLE FOR CUSTOMER DECISION BUTTONS ---');

  try {
    await query(`
      ALTER TABLE lead_sanctions 
        ADD COLUMN customer_decision VARCHAR(50) NULL DEFAULT 'pending',
        ADD COLUMN customer_decision_at DATETIME NULL,
        ADD COLUMN customer_decision_notes TEXT NULL,
        ADD COLUMN decision_token VARCHAR(100) NULL
    `);
    console.log('Successfully added customer_decision columns to lead_sanctions!');
  } catch (err) {
    if (err.message.includes('Duplicate column')) {
      console.log('Columns already exist on lead_sanctions table.');
    } else {
      console.error('Error adding columns:', err.message);
    }
  }

  process.exit(0);
}

updateSanctionSchema();
