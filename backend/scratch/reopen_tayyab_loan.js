require('../config/env');
const { connectDatabase, query } = require('../config/db');

(async () => {
  try {
    await connectDatabase();
    console.log('Connected to DB');

    const loanId = 'LNWQTMN04569';

    // 1. Inspect loan
    const loans = await query('SELECT * FROM loans WHERE id = ?', [loanId]);
    console.log('--- Loans table ---');
    console.log(loans);

    // 2. Inspect collection cases
    const cases = await query('SELECT * FROM collection_cases WHERE loan_id = ?', [loanId]);
    console.log('--- Collection cases table ---');
    console.log(cases);

    // 3. Inspect repayments for this loan
    const reps = await query('SELECT * FROM loan_repayments WHERE loan_id = ?', [loanId]);
    console.log('--- Repayments table ---');
    console.log(reps);

    // 4. Calculate total paid and new balance
    const totalPaid = reps.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const totalDue = loans.length ? Number(loans[0].total_amount || 26000) : 26000;
    const newBalance = Math.max(0, totalDue - totalPaid);
    const newStatus = newBalance > 0 ? 'Overdue' : 'Paid Off';
    const newPaymentStatus = newBalance > 0 ? 'Partial' : 'Paid';

    console.log(`Calculated Total Due: ${totalDue}, Total Paid: ${totalPaid}, New Balance: ${newBalance}, New Status: ${newStatus}`);

    if (newBalance > 0) {
      // Reopen Loan
      await query(`
        UPDATE loans
        SET balance = ?, status = ?, payment_status = ?
        WHERE id = ?
      `, [newBalance, newStatus, newPaymentStatus, loanId]);

      // Reopen Collection Case
      await query(`
        UPDATE collection_cases
        SET status = 'Active', total_due = ?
        WHERE loan_id = ?
      `, [newBalance, loanId]);

      // Reopen Loan Application if exists
      if (loans.length && loans[0].customer_id) {
        await query(`
          UPDATE loan_applications
          SET status = 'disbursed', is_active_application = 1
          WHERE id = ? OR application_id = ? OR source_lead_id = ?
        `, [loans[0].customer_id, loans[0].customer_id, loans[0].customer_id]);
      }

      console.log(`SUCCESS: Reopened loan ${loanId} with balance ₹${newBalance} and status ${newStatus}!`);
    } else {
      console.log('Balance is 0 or less, loan remains Paid Off.');
    }

    process.exit(0);
  } catch (err) {
    console.error('Error reopening loan:', err);
    process.exit(1);
  }
})();
