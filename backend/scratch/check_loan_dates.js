const { connectDatabase, query } = require('../config/db');

async function run() {
  try {
    await connectDatabase();
    console.log('Connected to DB.');

    // Fetch the dates of the latest loans
    const latestLoans = await query(`
      SELECT id, principal, start_date, created_at, updated_at, status, amount_paid
      FROM loans
      ORDER BY created_at DESC
      LIMIT 10
    `);

    console.log('--- LATEST 10 LOANS ---');
    latestLoans.forEach(l => {
      console.log(`ID: ${l.id}, Principal: ${l.principal}, StartDate: ${l.start_date}, CreatedAt: ${l.created_at}, UpdatedAt: ${l.updated_at}, Status: ${l.status}, AmountPaid: ${l.amount_paid}`);
    });

    // Group loans by start_date/created_at date
    const startGroups = await query(`
      SELECT DATE(COALESCE(start_date, created_at)) as date, COUNT(*) as count, SUM(principal) as total_principal
      FROM loans
      GROUP BY DATE(COALESCE(start_date, created_at))
      ORDER BY date DESC
      LIMIT 10
    `);
    console.log('\n--- LOANS BY DISBURSEMENT DATE ---');
    startGroups.forEach(g => {
      console.log(`Date: ${g.date}, Count: ${g.count}, Total Principal: ${g.total_principal}`);
    });

    // Group repayments by updated_at date (where amount_paid > 0)
    const repaymentGroups = await query(`
      SELECT DATE(updated_at) as date, COUNT(*) as count, SUM(amount_paid) as total_paid
      FROM loans
      WHERE amount_paid > 0
      GROUP BY DATE(updated_at)
      ORDER BY date DESC
      LIMIT 10
    `);
    console.log('\n--- REPAYMENTS BY DATE ---');
    repaymentGroups.forEach(g => {
      console.log(`Date: ${g.date}, Count: ${g.count}, Total Paid: ${g.total_paid}`);
    });

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

run();
