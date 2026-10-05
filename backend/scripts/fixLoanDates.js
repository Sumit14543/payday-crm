const { connectDatabase, query } = require('../config/db');

async function fixLoanDates() {
  const loanId = process.argv[2] || 'LNWQTMN03724';
  const newDisbursedDate = process.argv[3] || '2026-08-23';
  const newDueDate = process.argv[4] || '2026-08-31';

  console.log(`[FixScript] Fixing loan dates for: ${loanId}...`);
  console.log(`Target Disbursed Date: ${newDisbursedDate}`);
  console.log(`Target Due Date: ${newDueDate}`);

  await connectDatabase();

  const loans = await query('SELECT * FROM loans WHERE id = ? OR id = ? LIMIT 1', [
    loanId,
    loanId.replace(/^LN/i, '')
  ]);

  if (!loans.length) {
    console.error(`Loan ${loanId} not found in loans table!`);
  } else {
    const loan = loans[0];
    console.log(`Found loan ${loan.id}. Updating start_date and due_date...`);
    await query('UPDATE loans SET start_date = ?, due_date = ? WHERE id = ?', [
      newDisbursedDate,
      newDueDate,
      loan.id
    ]);
  }

  // 1. Update lead_accounting_payments table
  const paymentsResult = await query(
    `UPDATE lead_accounting_payments 
     SET disbursed_at = CONCAT(?, ' 00:00:00'), paid_at = CONCAT(?, ' 00:00:00') 
     WHERE TRIM(LEADING 'LN' FROM UPPER(loan_id)) = TRIM(LEADING 'LN' FROM UPPER(?)) 
        OR application_id = 'WAQTMN-PD-011931'`,
    [newDisbursedDate, newDisbursedDate, loanId]
  );
  console.log(`Updated lead_accounting_payments: ${paymentsResult.affectedRows || 0} rows`);

  // 2. Update loan_repayment_schedule table
  const scheduleResult = await query(
    `UPDATE loan_repayment_schedule 
     SET due_date = ? 
     WHERE TRIM(LEADING 'LN' FROM UPPER(loan_id)) = TRIM(LEADING 'LN' FROM UPPER(?)) 
        OR application_id = 'WAQTMN-PD-011931'`,
    [newDueDate, loanId]
  );
  console.log(`Updated loan_repayment_schedule: ${scheduleResult.affectedRows || 0} rows`);

  // 3. Update collection_cases table
  const collectionResult = await query(
    `UPDATE collection_cases 
     SET original_due_date = ? 
     WHERE TRIM(LEADING 'LN' FROM UPPER(loan_id)) = TRIM(LEADING 'LN' FROM UPPER(?)) 
        OR customer_id = 'WAQTMN-PD-011931'`,
    [newDueDate, loanId]
  );
  console.log(`Updated collection_cases: ${collectionResult.affectedRows || 0} rows`);

  // 4. Update lead_sanctions table
  const sanctionResult = await query(
    `UPDATE lead_sanctions 
     SET disbursement_date = ? 
     WHERE application_id = 'WAQTMN-PD-011931' 
        OR agreement_number = ? 
        OR agreement_number = ?`,
    [newDisbursedDate, loanId, loanId.replace(/^LN/i, '')]
  );
  console.log(`Updated lead_sanctions: ${sanctionResult.affectedRows || 0} rows`);

  console.log(`SUCCESS: Loan dates updated successfully for ${loanId}!`);
  process.exit(0);
}

fixLoanDates().catch((err) => {
  console.error('Error fixing loan dates:', err);
  process.exit(1);
});
