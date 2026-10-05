const { connectDatabase, query } = require('../config/db');

async function run() {
  try {
    await connectDatabase();
    console.log('=== TEST AUDIT LOANS AND REPAYMENTS ===');
    
    const getLocalDate = (dStr) => {
      if (!dStr) return '';
      const d = new Date(dStr);
      const offset = 330;
      const localTime = d.getTime() + (offset * 60 * 1000);
      return new Date(localTime).toISOString().slice(0, 10);
    };
    
    const today = getLocalDate(new Date().toISOString());
    const currentMonthStr = new Date().toISOString().slice(0, 7);

    // Get all repayments
    const repayments = await query(`
      SELECT loan_id, amount, received_at, status 
      FROM loan_repayments 
      WHERE status = 'received' 
      ORDER BY loan_id, received_at ASC, id ASC
    `);

    const repaymentsByLoan = {};
    repayments.forEach(r => {
      if (!repaymentsByLoan[r.loan_id]) {
        repaymentsByLoan[r.loan_id] = [];
      }
      repaymentsByLoan[r.loan_id].push(r);
    });

    const loans = await query(`
      SELECT 
        l.id, l.principal, l.amount_paid AS amountPaid, l.start_date AS startDate, l.created_at AS createdAt,
        COALESCE(ls.processing_fee, ROUND(l.principal * 0.10)) AS processingFee
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

    console.log(`Today is ${today}`);
    console.log(`Month is ${currentMonthStr}`);
    console.log(`Total Loans: ${loans.length}`);
    console.log(`Total Repayments: ${repayments.length}`);

    let todayRoiSum = 0;
    let todayPfSum = 0;

    loans.forEach(l => {
      const principal = Number(l.principal || 0);
      const reps = repaymentsByLoan[l.id] || [];
      
      let cumulativePaid = 0;
      let todayRoi = 0;
      let monthRoi = 0;
      let totalRoi = 0;
      
      reps.forEach(r => {
        const amount = Number(r.amount || 0);
        const prevCumulative = cumulativePaid;
        cumulativePaid += amount;
        
        const prevRoiRealized = Math.max(0, prevCumulative - principal);
        const currentRoiRealized = Math.max(0, cumulativePaid - principal);
        const roiRealizedThisPayment = currentRoiRealized - prevRoiRealized;
        
        if (roiRealizedThisPayment > 0) {
          totalRoi += roiRealizedThisPayment;
          const repDateStr = getLocalDate(r.received_at);
          if (repDateStr === today) {
            todayRoi += roiRealizedThisPayment;
          }
          if (repDateStr.slice(0, 7) === currentMonthStr) {
            monthRoi += roiRealizedThisPayment;
          }
        }
      });

      // Calculate processing fee booked today
      const pf = Number(l.processingFee || l.principal * 0.10);
      const disbDate = l.startDate ? new Date(l.startDate) : (l.createdAt ? new Date(l.createdAt) : new Date());
      const disbDateStr = getLocalDate(disbDate.toISOString());
      
      let todayPf = 0;
      if (disbDateStr === today) {
        todayPf = pf;
      }

      todayRoiSum += todayRoi;
      todayPfSum += todayPf;

      if (todayRoi > 0 || todayPf > 0 || totalRoi > 0 || l.amountPaid > 0) {
        console.log(`Loan ID: ${l.id}, Principal: ${principal}, Paid: ${l.amountPaid}, startDate: ${l.startDate || l.createdAt}, todayRoi: ${todayRoi}, todayPf: ${todayPf}, totalRoi: ${totalRoi}`);
      }
    });

    console.log(`=== CALCULATED SUM FOR TODAY ===`);
    console.log(`todayRoiSum: ${todayRoiSum}`);
    console.log(`todayPfSum: ${todayPfSum}`);
    console.log(`todayTotal: ${todayRoiSum + todayPfSum}`);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
