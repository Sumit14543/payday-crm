const { connectDatabase, query } = require('../config/db');

async function fixPayment() {
  const loanNo = process.argv[2] || 'LNWQTMN03021R1';
  const correctAmount = Number(process.argv[3] || 13100);

  console.log(`[FixScript] Connecting to DB to update loan: ${loanNo} with correct amount: ₹${correctAmount}...`);
  await connectDatabase();

  const loans = await query('SELECT * FROM loans WHERE loan_no = ? OR id = ? LIMIT 1', [loanNo, loanNo]);
  if (!loans.length) {
    console.error(`Loan ${loanNo} not found in database!`);
    process.exit(1);
  }

  const loan = loans[0];
  console.log(`Found loan ID ${loan.id} (${loan.customer_name}). Current amount_paid: ₹${loan.amount_paid}`);

  // 1. Update loan_repayments table
  const repayments = await query('SELECT * FROM loan_repayments WHERE loan_id = ? ORDER BY id DESC LIMIT 1', [loan.id]);
  if (repayments.length > 0) {
    await query('UPDATE loan_repayments SET amount = ?, principal_component = ? WHERE id = ?', [
      correctAmount,
      correctAmount,
      repayments[0].id
    ]);
    console.log(`Updated repayment #${repayments[0].id} amount to ₹${correctAmount}`);
  }

  // 2. Update loans table
  await query('UPDATE loans SET amount_paid = ?, balance = 0, status = "Paid Off", payment_status = "Paid" WHERE id = ?', [
    correctAmount,
    loan.id
  ]);

  // 3. Update collection_cases table
  await query('UPDATE collection_cases SET status = "Paid Off" WHERE loan_id = ? OR customer_id = ?', [
    loan.id,
    loan.customer_id
  ]);

  console.log(`SUCCESS: Loan ${loanNo} updated successfully to Amount Paid = ₹${correctAmount}`);
  process.exit(0);
}

fixPayment().catch((err) => {
  console.error('Error fixing repayment:', err);
  process.exit(1);
});
