const { connectDatabase, query } = require('../config/db');

const casesToClose = [
  {
    loanId: 'WQTMN075',
    name: 'PRAVIN BABAN DONGRE',
    principal: 8820,
    paidAmount: 11100,
    disbursalDate: '2026-05-18',
    dueDate: '2026-05-29',
    closeDate: '2026-06-01 00:00:00',
  },
  {
    loanId: 'WQTMN076',
    name: 'VISHAL PANT',
    principal: 10584,
    paidAmount: 13440,
    disbursalDate: '2026-05-20',
    dueDate: '2026-06-01',
    closeDate: '2026-06-02 00:00:00',
  },
  {
    loanId: 'WQTMN085',
    name: 'ANSAR AHMAD KHAN',
    principal: 8820,
    paidAmount: 11100,
    disbursalDate: '2026-05-23',
    dueDate: '2026-06-03',
    closeDate: '2026-06-01 00:00:00',
  },
  {
    loanId: 'WQTMN096',
    name: 'KULDEEP SAINI',
    principal: 7056,
    paidAmount: 8400,
    disbursalDate: '2026-05-25',
    dueDate: '2026-05-30',
    closeDate: '2026-05-27 00:00:00',
  },
  {
    loanId: 'WQTMN097',
    name: 'OSHIN VISHNOI',
    principal: 17640,
    paidAmount: 21600,
    disbursalDate: '2026-05-25',
    dueDate: '2026-06-02',
    closeDate: '2026-06-03 00:00:00',
  },
];

async function updateCases() {
  try {
    await connectDatabase();
    console.log('Connected to Database.');

    for (const item of casesToClose) {
      console.log(`\n--- Processing Loan ID: ${item.loanId} (${item.name}) ---`);

      // 1. Search in loans table
      const loans = await query(`
        SELECT * FROM loans
        WHERE id = ? OR TRIM(LEADING 'LN' FROM REPLACE(REPLACE(REPLACE(UPPER(id), ' ', ''), '-', ''), '_', '')) = ?
      `, [item.loanId, item.loanId]);

      console.log(`Found ${loans.length} loans matching ${item.loanId}`);

      // 2. Search in collection_cases table
      const collections = await query(`
        SELECT * FROM collection_cases
        WHERE loan_id = ? OR TRIM(LEADING 'LN' FROM REPLACE(REPLACE(REPLACE(UPPER(loan_id), ' ', ''), '-', ''), '_', '')) = ?
      `, [item.loanId, item.loanId]);

      console.log(`Found ${collections.length} collection_cases matching ${item.loanId}`);

      // 3. Search in loan_applications table
      const apps = await query(`
        SELECT id, application_id, full_name, mobile, status FROM loan_applications
        WHERE source_lead_id = ? OR application_id = ? OR full_name LIKE ?
      `, [item.loanId, item.loanId, `%${item.name.split(' ')[0]}%`]);

      console.log(`Found ${apps.length} applications matching ${item.loanId} / ${item.name}`);

      // Perform Updates if found
      if (loans.length > 0) {
        for (const targetLoan of loans) {
          await query(`
            UPDATE loans
            SET amount_paid = ?,
                balance = 0,
                status = 'Paid Off',
                payment_status = 'Paid',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `, [item.paidAmount, targetLoan.id]);
          console.log(`Updated loans table for loan ID ${targetLoan.id}: amount_paid=${item.paidAmount}, balance=0, status=Paid Off`);

          const existingRepayments = await query(`
            SELECT * FROM loan_repayments WHERE loan_id = ?
          `, [targetLoan.id]);

          if (existingRepayments.length === 0) {
            await query(`
              INSERT INTO loan_repayments (
                loan_id, customer_id, amount, principal_component, interest_component,
                method, reference, status, received_by, received_at, metadata
              ) VALUES (?, ?, ?, ?, ?, 'Historical Settlement', ?, 'settled', 'System Admin', ?, ?)
            `, [
              targetLoan.id,
              targetLoan.customer_id || 'CUS-HISTORICAL',
              item.paidAmount,
              item.principal,
              item.paidAmount - item.principal,
              `REF-HISTORICAL-${item.loanId}`,
              item.closeDate,
              JSON.stringify({ note: 'Historical loan closure update' }),
            ]);
            console.log(`Inserted loan_repayment record for ${targetLoan.id} with date ${item.closeDate}`);
          } else {
            await query(`
              UPDATE loan_repayments
              SET amount = ?, received_at = ?, status = 'settled'
              WHERE loan_id = ?
            `, [item.paidAmount, item.closeDate, targetLoan.id]);
            console.log(`Updated existing loan_repayments record for ${targetLoan.id}`);
          }
        }
      }

      if (collections.length > 0) {
        for (const targetCol of collections) {
          await query(`
            UPDATE collection_cases
            SET total_due = 0,
                status = 'Paid Off',
                last_payment_date = ?
            WHERE id = ?
          `, [item.closeDate.slice(0, 10), targetCol.id]);
          console.log(`Updated collection_cases table for ID ${targetCol.id}: total_due=0, status=Paid Off, last_payment_date=${item.closeDate.slice(0, 10)}`);
        }
      }

      if (apps.length > 0) {
        for (const app of apps) {
          await query(`
            UPDATE loan_applications
            SET status = 'closed', is_active_application = 0
            WHERE id = ?
          `, [app.id]);
          console.log(`Updated loan_application ID ${app.id} to status='closed'`);
        }
      }
    }

    console.log('\nAll 5 historical cases processed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Error updating cases:', err);
    process.exit(1);
  }
}

updateCases();
