const { connectDatabase, query } = require('../config/db');

async function run() {
  try {
    await connectDatabase();
    console.log('Connected.');

    const sql = `
      SELECT
        l.id, c.name AS customer, l.principal,
        ls.processing_fee AS realPF, ls.gst_amount AS realGST,
        COALESCE(ls.processing_fee, ROUND(l.principal * 0.10)) AS processingFee,
        COALESCE(ls.gst_amount, ROUND(l.principal * 0.10 * 0.18)) AS gstAmount
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
            OR TRIM(LEADING '0' FROM TRIM(LEADING 'LNWQTMN' FROM TRIM(LEADING 'WQTMN' FROM TRIM(LEADING 'LN' FROM l.id)))) = sub.lead_id
          )
        ORDER BY 
          (sub.agreement_number = TRIM(LEADING 'LN' FROM l.id)) DESC,
          sub.created_at DESC,
          sub.id DESC
        LIMIT 1
      )
    `;

    const rows = await query(sql);
    console.log(`Total query results: ${rows.length}`);
    
    // Count how many have real matches (not null processing fee from lead_sanctions)
    const matchesCount = rows.filter(r => r.realPF !== null).length;
    console.log(`Matched with lead_sanctions: ${matchesCount} / ${rows.length}`);

    // Print first 10
    console.log('\n--- SAMPLE RESULTS (First 10) ---');
    console.log(rows.slice(0, 10));

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

run();
