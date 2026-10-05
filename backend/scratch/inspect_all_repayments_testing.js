const { connectDatabase, query } = require('../config/db');

async function run() {
  try {
    await connectDatabase();
    console.log('=== AUDIT ALL REPAYMENTS ON TESTING SERVER ===');
    const reps = await query(
      "SELECT id, loan_id, amount, status, received_at FROM loan_repayments ORDER BY received_at DESC, id DESC"
    );
    reps.forEach(r => {
      console.log(`Repayment ID: ${r.id}, Loan: ${r.loan_id}, Amount: ${r.amount}, Status: ${r.status}, Received At: ${r.received_at}`);
    });
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
