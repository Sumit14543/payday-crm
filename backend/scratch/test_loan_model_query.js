const { connectDatabase, query } = require('../config/db');

async function run() {
  try {
    await connectDatabase();
    console.log('Connected.');

    const sql = `
      SELECT
        l.id, c.name AS customer, l.customer_id AS customerId, l.principal,
        COALESCE(ls.processing_fee, ROUND(l.principal * 0.10)) AS processingFee,
        COALESCE(ls.gst_amount, ROUND(l.principal * 0.10 * 0.18)) AS gstAmount,
        COALESCE(ls.repayment_amount, ROUND(l.principal * 1.12)) AS repaymentAmount,
        ls.id AS sanctionId, ls.lead_id AS sanctionLeadId
      FROM loans l
      LEFT JOIN customers c ON c.id = l.customer_id
      LEFT JOIN loan_repayment_schedule rs ON rs.installment_number = 1 AND rs.loan_id = l.id
      LEFT JOIN (
        SELECT loan_id, MAX(lead_id) AS lead_id, MAX(application_id) AS application_id
        FROM lead_accounting_payments
        GROUP BY loan_id
      ) lap ON lap.loan_id = l.id
      LEFT JOIN lead_sanctions ls ON ls.id = (
        SELECT sub.id 
        FROM lead_sanctions sub
        WHERE sub.status = 'sent'
          AND (
            sub.agreement_number = TRIM(LEADING 'LN' FROM l.id)
            OR sub.lead_id = rs.lead_id 
            OR sub.application_id = rs.application_id
            OR sub.lead_id = lap.lead_id
            OR sub.application_id = lap.application_id
            OR TRIM(LEADING '0' FROM TRIM(LEADING 'LNWQTMN' FROM l.id)) = sub.lead_id
          )
        ORDER BY 
          (sub.agreement_number = TRIM(LEADING 'LN' FROM l.id)) DESC,
          sub.created_at DESC,
          sub.id DESC
        LIMIT 1
      )
    `;

    const rows = await query(sql);
    console.log('Query results:', rows);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

run();
