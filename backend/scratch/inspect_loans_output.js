require('../config/env');
const { connectDatabase } = require('../config/db');
const loanModel = require('../models/loanModel');

async function inspect() {
  try {
    await connectDatabase();
    const loans = await loanModel.findAll();
    console.log("=== LOANS LIST FROM MODEL ===");
    loans.forEach(l => {
      console.log({
        id: l.id,
        startDate: l.startDate,
        createdAt: l.createdAt,
        principal: l.principal,
        amountPaid: l.amountPaid,
        processingFee: l.processingFee,
        gstAmount: l.gstAmount,
        todayRoi: l.todayRoi,
        todayPf: l.todayPf,
        monthRoi: l.monthRoi,
        totalRoi: l.totalRoi,
        todayPfCalculated: getTodayPf(l)
      });
    });
  } catch (err) {
    console.error(err);
  }
}

function getTodayPf(l) {
  const today = new Date().toISOString().slice(0, 10);
  const getLocalDateStr = (dStr) => {
    if (!dStr) return '';
    const d = new Date(dStr);
    const offset = 330;
    const localTime = d.getTime() + (offset * 60 * 1000);
    return new Date(localTime).toISOString().slice(0, 10);
  };
  const disbDate = l.startDate ? new Date(l.startDate) : (l.createdAt ? new Date(l.createdAt) : new Date());
  const disbDateStr = getLocalDateStr(disbDate.toISOString());
  return disbDateStr === today ? l.processingFee : 0;
}

inspect();
