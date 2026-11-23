const { connectDatabase, query, withTransaction } = require('../config/db');

/**
 * Script to diagnose and heal misplaced reloan payments
 * Usage:
 *   node scripts/healMisplacedReloanPayments.js --dry-run   (Only preview affected loans)
 *   node scripts/healMisplacedReloanPayments.js --execute   (Execute the fix in a transaction)
 */

async function main() {
  const isExecute = process.argv.includes('--execute');
  const includeManual = process.argv.includes('--all-sources');

  console.log('===============================================================');
  console.log(` RELOAN MISPLACED PAYMENTS HEALER`);
  console.log(` Mode:    ${isExecute ? 'EXECUTE (Applying Fixes)' : 'DRY-RUN (Preview Only)'}`);
  console.log(` Filter:  ${includeManual ? 'ALL SOURCES (Website + Manual)' : 'WEBSITE ONLY (Excluding Manual CRM & Collection Payments)'}`);
  console.log('===============================================================\n');

  await connectDatabase();

  const websiteFilterSql = includeManual ? '' : `
    AND (
      rep.received_by IN ('Source Website', 'Cashfree Webhook', 'Website')
      OR rep.metadata LIKE '%"source":"integration"%'
      OR rep.metadata LIKE '%"gateway"%'
      OR rep.metadata LIKE '%"source":"cashfree_webhook"%'
    )
    AND (
      rep.metadata IS NULL 
      OR (
        rep.metadata NOT LIKE '%manual_repayment%' 
        AND rep.metadata NOT LIKE '%collection_panel%' 
        AND rep.metadata NOT LIKE '%bulk_excel_upload%'
      )
    )
    AND (rep.received_by IS NULL OR rep.received_by NOT IN ('Accountant', 'Collection Agent', 'Superadmin'))
  `;

  // Find all affected misplaced payments:
  // Condition:
  // 1. Payment reference explicitly indicates the target reloan (e.g. repay_LNWQTMN06011_...)
  //    OR payment was made on website after reloan creation and credited to the old closed loan.
  // 2. old_l is closed/paid off or overpaid (amount_paid > total_amount)
  // 3. new_l is the active reloan with remaining balance > 0
  const affectedRows = await query(`
    SELECT 
      c.id AS customer_id,
      c.name AS customer_name,
      c.phone AS customer_phone,
      old_l.id AS old_loan_id,
      old_l.total_amount AS old_total_due,
      old_l.amount_paid AS old_amount_paid,
      old_l.balance AS old_balance,
      old_l.status AS old_status,
      new_l.id AS new_reloan_id,
      new_l.total_amount AS new_total_due,
      new_l.amount_paid AS new_current_paid,
      new_l.balance AS new_current_balance,
      new_l.status AS new_status,
      new_l.start_date AS reloan_start_date,
      rep.id AS repayment_id,
      rep.amount AS payment_amount,
      rep.reference AS payment_reference,
      rep.received_at AS payment_date,
      rep.method AS payment_method,
      rep.received_by AS payment_received_by
    FROM loans old_l
    JOIN loans new_l 
      ON new_l.customer_id = old_l.customer_id 
      AND new_l.id <> old_l.id
    JOIN customers c 
      ON c.id = old_l.customer_id
    JOIN loan_repayments rep 
      ON rep.loan_id = old_l.id
    WHERE 
      -- Naya reloan abhi active hona chahiye
      new_l.balance > 0 
      AND LOWER(new_l.status) NOT IN ('paid off', 'closed', 'settled')
      -- Purana loan closed/paid off tha ya overpaid ho chuka hai
      AND (
        old_l.amount_paid > old_l.total_amount
        OR LOWER(old_l.status) IN ('paid off', 'closed', 'settled')
        OR old_l.balance <= 0
      )
      -- Payment naye reloan ke aane ke baad hui
      AND rep.received_at >= COALESCE(new_l.start_date, new_l.created_at)
      AND rep.status IN ('received', 'success', 'paid', 'settled')
      -- Intended target match:
      AND (
        -- Case A: Reference explicitly embeds the target reloan ID (repay_LNWQTMN..._)
        (rep.reference LIKE CONCAT('repay_', new_l.id, '_%'))
        OR
        -- Case B: Latest active reloan for customer if reference is standard
        (rep.reference NOT LIKE 'repay_LN%' AND new_l.id = (
          SELECT l3.id FROM loans l3
          WHERE l3.customer_id = old_l.customer_id AND l3.id <> old_l.id
            AND l3.balance > 0 AND LOWER(l3.status) NOT IN ('paid off', 'closed', 'settled')
          ORDER BY l3.created_at DESC LIMIT 1
        ))
      )
      ${websiteFilterSql}
    ORDER BY c.name, rep.received_at ASC
  `);

  if (!affectedRows || affectedRows.length === 0) {
    console.log('✓ No misplaced reloan payments found in the database. All loans are in sync!');
    process.exit(0);
  }

  console.log(`Found ${affectedRows.length} misplaced payment(s) across affected reloan cases:\n`);

  // Group by customer
  const casesByCustomer = new Map();
  affectedRows.forEach(row => {
    const key = `${row.customer_id}|${row.old_loan_id}|${row.new_reloan_id}`;
    if (!casesByCustomer.has(key)) {
      casesByCustomer.set(key, {
        customerName: row.customer_name,
        customerPhone: row.customer_phone,
        oldLoanId: row.old_loan_id,
        oldTotalDue: row.old_total_due,
        oldAmountPaid: row.old_amount_paid,
        newReloanId: row.new_reloan_id,
        newTotalDue: row.new_total_due,
        newAmountPaid: row.new_current_paid,
        newBalance: row.new_current_balance,
        reloanStartDate: row.reloan_start_date,
        payments: []
      });
    }
    casesByCustomer.get(key).payments.push({
      repaymentId: row.repayment_id,
      amount: row.payment_amount,
      reference: row.payment_reference,
      date: row.payment_date,
      method: row.payment_method,
      receivedBy: row.payment_received_by
    });
  });

  let index = 1;
  for (const [key, data] of casesByCustomer.entries()) {
    console.log(`Case #${index}: Customer: ${data.customerName} (${data.customerPhone})`);
    console.log(`  - Old Loan:   ${data.oldLoanId} (Total: ₹${data.oldTotalDue}, Paid: ₹${data.oldAmountPaid})`);
    console.log(`  - New Reloan: ${data.newReloanId} (Total: ₹${data.newTotalDue}, Currently Paid: ₹${data.newAmountPaid}, Balance: ₹${data.newBalance})`);
    console.log(`  - Misplaced Payments attached to Old Loan:`);
    let totalMisplaced = 0;
    data.payments.forEach(p => {
      console.log(`      * Payment ID ${p.repaymentId}: ₹${p.amount} | Source: ${p.receivedBy || 'Website'} | UTR: ${p.reference} | Date: ${p.date}`);
      totalMisplaced += Number(p.amount);
    });
    console.log(`  -> Total Amount to Shift: ₹${totalMisplaced}`);
    console.log(`  -> Projected Old Loan Paid:   ₹${Math.max(0, data.oldAmountPaid - totalMisplaced)} (Balance: ₹0, Status: Paid Off)`);
    console.log(`  -> Projected New Reloan Paid: ₹${data.newAmountPaid + totalMisplaced} (Balance: ₹${Math.max(0, data.newTotalDue - (data.newAmountPaid + totalMisplaced))})`);
    console.log('---------------------------------------------------------------');
    index++;
  }

  if (!isExecute) {
    console.log('\n[INFO] This was a preview. No changes were made to the database.');
    console.log('To apply these fixes and shift the payments to the active reloan, run:');
    console.log('  node scripts/healMisplacedReloanPayments.js --execute\n');
    process.exit(0);
  }

  console.log('\n[EXECUTE] Applying database updates within transactions...');

  for (const [key, data] of casesByCustomer.entries()) {
    await withTransaction(async () => {
      const repaymentIds = data.payments.map(p => p.repaymentId);

      // Find new schedule ID
      const [schedRow] = await query('SELECT id FROM loan_repayment_schedule WHERE loan_id = ? ORDER BY id ASC LIMIT 1', [data.newReloanId]);
      const newScheduleId = schedRow ? schedRow.id : null;

      // 1. Shift payments to new reloan
      const placeholders = repaymentIds.map(() => '?').join(',');
      await query(`
        UPDATE loan_repayments
        SET loan_id = ?,
            repayment_schedule_id = COALESCE(?, repayment_schedule_id)
        WHERE id IN (${placeholders})
      `, [data.newReloanId, newScheduleId, ...repaymentIds]);

      // 2. Recalculate Old Loan
      const [oldTotals] = await query(`
        SELECT COALESCE(SUM(amount), 0) AS totalPaid 
        FROM loan_repayments 
        WHERE loan_id = ? AND status IN ('received', 'success', 'paid', 'settled')
      `, [data.oldLoanId]);
      const oldPaid = Number(oldTotals.totalPaid || 0);
      const oldBalance = Math.max(0, Number(data.oldTotalDue) - oldPaid);
      const oldStatus = oldBalance <= 0 ? 'Paid Off' : 'Active';

      await query(`
        UPDATE loans 
        SET amount_paid = ?, balance = ?, status = ?, payment_status = ?
        WHERE id = ?
      `, [oldPaid, oldBalance, oldStatus, oldBalance <= 0 ? 'Paid' : 'Partial', data.oldLoanId]);

      // 3. Recalculate New Reloan
      const [newTotals] = await query(`
        SELECT COALESCE(SUM(amount), 0) AS totalPaid 
        FROM loan_repayments 
        WHERE loan_id = ? AND status IN ('received', 'success', 'paid', 'settled')
      `, [data.newReloanId]);
      const newPaid = Number(newTotals.totalPaid || 0);
      const newBalance = Math.max(0, Number(data.newTotalDue) - newPaid);
      const newStatus = newBalance <= 0 ? 'Paid Off' : 'Active';

      await query(`
        UPDATE loans 
        SET amount_paid = ?, balance = ?, status = ?, payment_status = ?, next_payment_amount = ?
        WHERE id = ?
      `, [newPaid, newBalance, newStatus, newBalance <= 0 ? 'Paid' : 'Partial', newBalance, data.newReloanId]);

      // 4. Sync Schedules & Collections
      await query(`
        UPDATE loan_repayment_schedule 
        SET amount_paid = ?, status = ?
        WHERE loan_id = ?
      `, [oldPaid, oldBalance <= 0 ? 'paid' : 'pending', data.oldLoanId]);

      await query(`
        UPDATE loan_repayment_schedule 
        SET amount_paid = ?, status = ?
        WHERE loan_id = ?
      `, [newPaid, newBalance <= 0 ? 'paid' : 'pending', data.newReloanId]);

      await query(`
        UPDATE collection_cases 
        SET total_due = ?, status = ?
        WHERE loan_id = ?
      `, [oldBalance, oldBalance <= 0 ? 'Paid Off' : 'Active', data.oldLoanId]);

      await query(`
        UPDATE collection_cases 
        SET total_due = ?, status = ?
        WHERE loan_id = ?
      `, [newBalance, newBalance <= 0 ? 'Paid Off' : 'Active', data.newReloanId]);

      console.log(`✓ Case fixed for ${data.customerName}: Payments shifted from ${data.oldLoanId} -> ${data.newReloanId}.`);
    });
  }

  console.log('\n===============================================================');
  console.log(' ALL AFFECTED RELOAN CASES HAVE BEEN SUCCESSFULLY HEALED!');
  console.log('===============================================================\n');
  process.exit(0);
}

main().catch(err => {
  console.error('[ERROR] Failed to heal misplaced payments:', err);
  process.exit(1);
});
