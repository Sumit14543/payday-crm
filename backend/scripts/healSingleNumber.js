const { connectDatabase, query } = require('../config/db');

async function heal() {
  await connectDatabase();
  console.log('--- Database Connected ---');

  const phone = '7895184423';
  console.log(`Healing application status for phone number: ${phone}`);

  // Only update loan_applications matching this specific phone number
  const result = await query(`
    UPDATE loan_applications
    SET status = 'closed', is_active_application = 0
    WHERE mobile = ?
  `, [phone]);

  console.log(`Successfully updated ${result.affectedRows || 0} application records for phone number ${phone}.`);
  console.log('Done!');
  process.exit(0);
}

heal().catch(err => {
  console.error('Failed to run healing script:', err);
  process.exit(1);
});
