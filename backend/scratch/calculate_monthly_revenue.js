const { connectDatabase, query } = require('../config/db');

async function run() {
  try {
    await connectDatabase();
    console.log('Connected to MySQL.');

    const now = new Date();
    // July 2026 is the current month in our dataset
    const targetMonth = '2026-07';
    console.log(`Analyzing database records for month: ${targetMonth}`);

    // Fetch all loans
    const loans = await query(`
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
    `);

    console.log(`Total loans in database: ${loans.length}`);

    let countDisbursedThisMonth = 0;
    let thisMonthPf = 0;
    let thisMonthGst = 0;
    
    let countCollectedThisMonth = 0;
    let thisMonthRoi = 0;

    loans.forEach(l => {
      const principal = Number(l.principal || 0);
      const amountPaid = Number(l.amountPaid || 0);
      const pf = Number(l.processingFee);
      const gst = Number(l.gstAmount);
      const repaymentAmount = Number(l.repaymentAmount);
      const roi = repaymentAmount - principal;

      // Check disbursement month
      const startDt = l.startDate ? new Date(l.startDate).toISOString().slice(0, 7) : '';
      if (startDt === targetMonth) {
        countDisbursedThisMonth++;
        thisMonthPf += pf;
        thisMonthGst += gst;
      }

      // Check repayment month
      if (amountPaid > 0) {
        const repDt = l.updatedAt ? new Date(l.updatedAt).toISOString().slice(0, 7) : '';
        if (repDt === targetMonth) {
          countCollectedThisMonth++;
          thisMonthRoi += roi;
        }
      }
    });

    const thisMonthPFRevenue = thisMonthPf + thisMonthGst;
    const thisMonthTotalRevenue = thisMonthPFRevenue + thisMonthRoi;

    console.log('\n======================================');
    console.log(`MONTHLY REVENUE REPORT: ${targetMonth}`);
    console.log('======================================');
    console.log(`Loans Disbursed in July 2026:      ${countDisbursedThisMonth}`);
    console.log(`Revenue by Processing Fees (PF):    ₹${thisMonthPf.toLocaleString('en-IN')}`);
    console.log(`GST on Processing Fees (18%):       ₹${thisMonthGst.toLocaleString('en-IN')}`);
    console.log(`Total Processing Fee Revenue:      ₹${thisMonthPFRevenue.toLocaleString('en-IN')} (A)`);
    console.log('--------------------------------------');
    console.log(`Repayments Received in July 2026:  ${countCollectedThisMonth}`);
    console.log(`Repayment Revenue (ROI Interest):   ₹${thisMonthRoi.toLocaleString('en-IN')} (B)`);
    console.log('--------------------------------------');
    console.log(`TOTAL MONTHLY REVENUE (A + B):      ₹${thisMonthTotalRevenue.toLocaleString('en-IN')}`);
    console.log('======================================\n');

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

run();
