require('../config/env');
const { connectDatabase, query } = require('../config/db');

async function checkRepayments() {
  try {
    await connectDatabase();
    
    // Get all repayments
    const repayments = await query("SELECT * FROM loan_repayments");
    console.log("=== ALL REPAYMENTS ===");
    repayments.forEach(r => {
      console.log(`ID: ${r.id}, Loan: ${r.loan_id}, Amount: ${r.amount}, status: ${r.status}, received_at: ${r.received_at}`);
    });

    // Get all loans
    const loans = await query("SELECT * FROM loans");
    console.log("\n=== ALL LOANS ===");
    loans.forEach(l => {
      console.log(`ID: ${l.id}, Principal: ${l.principal}, Paid: ${l.amount_paid}`);
    });
  } catch (err) {
    console.error("Error:", err);
  }
}

checkRepayments();
