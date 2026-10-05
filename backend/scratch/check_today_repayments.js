const { connectDatabase, query } = require('../config/db');

async function run() {
  try {
    await connectDatabase();
    console.log('Connected.');

    const todayLoans = await query(`
      SELECT 
        l.id, l.principal, l.amount_paid AS amountPaid, l.start_date AS startDate, l.updated_at AS updatedAt, l.status,
        COALESCE(ls.processing_fee, ROUND(l.principal * 0.10)) AS processingFee,
        COALESCE(ls.gst_amount, ROUND(l.principal * 0.10 * 0.18)) AS gstAmount,
        COALESCE(ls.repayment_amount, ROUND(l.principal * 1.12)) AS repaymentAmount
      FROM loans l
      LEFT JOIN lead_sanctions ls ON ls.id = (
        SELECT sub.id 
        FROM lead_sanctions sub
        WHERE sub.status = 'sent'
          AND (
            sub.agreement_number = TRIM(LEADING 'LN' FROM l.id)
            OR TRIM(LEADING '0' FROM TRIM(LEADING 'LNWQTMN' FROM l.id)) = sub.lead_id
          )
        LIMIT 1
      )
      WHERE DATE(l.updated_at) = '2026-07-22' OR DATE(l.start_date) = '2026-07-22' OR DATE(l.created_at) = '2026-07-22'
    `);

    console.log('--- REPAID OR CREATED TODAY (July 22, 2026) ---');
    todayLoans.forEach(l => {
      console.log(`ID: ${l.id}, Principal: ${l.principal}, AmountPaid: ${l.amountPaid}, StartDate: ${l.startDate}, UpdatedAt: ${l.updatedAt}, Status: ${l.status}, RepaymentAmount: ${l.repaymentAmount}`);
      const pf = l.processingFee;
      const gst = l.gstAmount;
      const roi = l.repaymentAmount - l.principal;
      console.log(`  -> ProcessingFee: ${pf}, GST: ${gst}, ROI Interest: ${roi}\n`);
    });

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

run();
