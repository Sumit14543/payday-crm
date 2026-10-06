const { createToken } = require('../middleware/auth');

const payload = {
  email: 'shrutisingh@waqtmoney.in',
  name: 'Shruti Singh',
  role: 'credit-manager'
};

const token = createToken(payload);

const url = 'https://payday-api.waqtmoney.com/api/loans';

fetch(url, {
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
.then(res => {
  console.log('API Response Status:', res.status);
  return res.text();
})
.then(text => {
  try {
    const data = JSON.parse(text);
    if (!data || !data.success) {
      console.error('API returned failure:', data);
      return;
    }

    const loansList = data.data;
    console.log(`Successfully fetched ${loansList.length} loans from live production API.\n`);

    let todayPf = 0, todayGst = 0, todayRoi = 0, todayTotal = 0;
    let monthPf = 0, monthGst = 0, monthRoi = 0, monthTotal = 0;
    let totalPf = 0, totalGst = 0, totalRoi = 0, grandTotal = 0;

    const targetMonth = '2026-07';
    const todayStr = '2026-07-22'; // active business date in the system

    loansList.forEach((l) => {
      const principal = Number(l.principal || 0);
      const amountPaid = Number(l.amountPaid || 0);
      
      // Calculate PF and GST using the system default mapping (10% PF and 18% GST on PF)
      // which is exactly equal to (Loan Amount - Disbursed Amount)
      const pf = Number(l.processingFee !== undefined && l.processingFee !== null ? l.processingFee : Math.round(principal * 0.10));
      const gst = Number(l.gstAmount !== undefined && l.gstAmount !== null ? l.gstAmount : Math.round(pf * 0.18));
      const repaymentAmount = Number(l.repaymentAmount !== undefined && l.repaymentAmount !== null ? l.repaymentAmount : Math.round(principal + principal * 0.12));
      const roi = repaymentAmount - principal;

      // Disbursement date
      const dt = l.startDate || l.createdAt;
      const startMonth = dt ? dt.slice(0, 7) : '';
      const startDateStr = dt ? dt.slice(0, 10) : '';

      // Accumulate Processing Fee + GST
      totalPf += pf;
      totalGst += gst;

      if (startMonth === targetMonth) {
        monthPf += pf;
        monthGst += gst;
      }
      if (startDateStr === todayStr) {
        todayPf += pf;
        todayGst += gst;
      }

      // ROI is realized only if amountPaid > 0 (repayment is collected)
      if (amountPaid > 0) {
        const repDt = l.updatedAt || dt;
        const repMonth = repDt ? repDt.slice(0, 7) : '';
        const repDateStr = repDt ? repDt.slice(0, 10) : '';

        totalRoi += roi;
        if (repMonth === targetMonth) {
          monthRoi += roi;
        }
        if (repDateStr === todayStr) {
          todayRoi += roi;
        }
      }
    });

    const todayPFRevenue = todayPf + todayGst;
    todayTotal = todayPFRevenue + todayRoi;

    const monthPFRevenue = monthPf + monthGst;
    monthTotal = monthPFRevenue + monthRoi;

    const totalPFRevenue = totalPf + totalGst;
    grandTotal = totalPFRevenue + totalRoi;

    console.log('==================================================');
    console.log(`REVENUE SPLIT SUMMARY FOR ALL ${loansList.length} CUSTOMER LOANS`);
    console.log('==================================================');
    
    console.log('\n--- TODAY (2026-07-22) ---');
    console.log(`Processing Fee Revenue (PF):    ₹${todayPf.toLocaleString('en-IN')}`);
    console.log(`GST on Processing Fees (18%):   ₹${todayGst.toLocaleString('en-IN')}`);
    console.log(`Revenue by Processing Fees (A):  ₹${todayPFRevenue.toLocaleString('en-IN')}`);
    console.log(`Repayment Revenue (ROI) (B):    ₹${todayRoi.toLocaleString('en-IN')}`);
    console.log(`TODAY TOTAL REVENUE (A + B):    ₹${todayTotal.toLocaleString('en-IN')}`);

    console.log('\n--- THIS MONTH (July 2026) ---');
    console.log(`Processing Fee Revenue (PF):    ₹${monthPf.toLocaleString('en-IN')}`);
    console.log(`GST on Processing Fees (18%):   ₹${monthGst.toLocaleString('en-IN')}`);
    console.log(`Revenue by Processing Fees (A):  ₹${monthPFRevenue.toLocaleString('en-IN')}`);
    console.log(`Repayment Revenue (ROI) (B):    ₹${monthRoi.toLocaleString('en-IN')}`);
    console.log(`MONTHLY TOTAL REVENUE (A + B):  ₹${monthTotal.toLocaleString('en-IN')}`);

    console.log('\n--- LIFETIME & GRAND TOTALS ---');
    console.log(`Processing Fee Revenue (PF):    ₹${totalPf.toLocaleString('en-IN')}`);
    console.log(`GST on Processing Fees (18%):   ₹${totalGst.toLocaleString('en-IN')}`);
    console.log(`Revenue by Processing Fees (A):  ₹${totalPFRevenue.toLocaleString('en-IN')}`);
    console.log(`Repayment Revenue (ROI) (B):    ₹${totalRoi.toLocaleString('en-IN')}`);
    console.log(`LIFETIME TOTAL REVENUE (A + B):  ₹${grandTotal.toLocaleString('en-IN')}`);
    console.log('==================================================\n');
  } catch (err) {
    console.error('Failed to parse response JSON. Raw text starts with:', text.slice(0, 200));
  }
})
.catch(err => {
  console.error('Error fetching API:', err);
});
