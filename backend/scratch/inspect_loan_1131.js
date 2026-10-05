const { connectDatabase, query } = require('../config/db');

async function run() {
  try {
    await connectDatabase();
    console.log('=== AUDIT REPAYMENTS FOR LNWQTMN01131 ===');
    const reps = await query(
      "SELECT * FROM loan_repayments WHERE loan_id = 'LNWQTMN01131' ORDER BY received_at ASC, id ASC"
    );
    reps.forEach(r => {
      console.log(`Repayment ID: ${r.id}, Amount: ${r.amount}, Status: ${r.status}, Received At (Raw): ${r.received_at}`);
    });
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
