const { query } = require('../config/db');

const DAY_MS = 24 * 60 * 60 * 1000;
const VALID_PAYMENT_STATUSES = ['received', 'success', 'paid', 'settled'];

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function sqlDate(date) {
  if (!date) return null;
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key) {
  const [year, month] = String(key || '').split('-').map(Number);
  if (!year || !month) return key || '';
  return new Date(year, month - 1, 1).toLocaleString('en-IN', { month: 'short', year: 'numeric' });
}

function daysBetween(start, end) {
  if (!start || !end || end <= start) return 0;
  return Math.ceil((end.getTime() - start.getTime()) / DAY_MS);
}

function overlapDays(startA, endA, startB, endB) {
  const start = startA > startB ? startA : startB;
  const end = endA < endB ? endA : endB;
  return daysBetween(start, end);
}

function money(value) {
  const numeric = Number(value || 0);
  return Number(numeric.toFixed(2));
}

function normalizeLoanId(id) {
  if (!id) return '';
  return String(id)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^LN/, '');
}

function normalizeRange(filters = {}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const from = toDate(filters.from || filters.dateFrom) || monthStart;
  const to = toDate(filters.to || filters.dateTo) || today;
  const rangeStart = from <= to ? from : to;
  const rangeEndInclusive = from <= to ? to : from;
  return {
    asOf: today,
    from: rangeStart,
    fromSql: sqlDate(rangeStart),
    to: rangeEndInclusive,
    toExclusive: addDays(rangeEndInclusive, 1),
    toSql: sqlDate(rangeEndInclusive),
  };
}

function emptyBucket(period) {
  return {
    accruedInterest: 0,
    bookedInterest: 0,
    days: 0,
    collectedInterest: 0,
    pendingInterest: 0,
    period,
    receivedInterest: 0,
  };
}

function allocateLoanInterestByPeriod(row, range, repaymentsByLoan, rangeOnly = false) {
  const start = toDate(row.startDate);
  const due = toDate(row.dueDate);
  if (!start || !due) return { dayBuckets: [], monthBuckets: [] };

  const accrualStart = addDays(start, 1);
  const accrualEndExclusive = addDays(due, 1);
  const totalDays = Math.max(0, daysBetween(accrualStart, accrualEndExclusive));
  if (!totalDays) return { dayBuckets: [], monthBuckets: [] };

  const interestDue = Number(row.interestDue || Math.max(0, Number(row.totalAmount || 0) - Number(row.principal || 0)));
  const dailyInterest = interestDue > 0
    ? interestDue / totalDays
    : (Number(row.principal || 0) * Number(row.interestRate || 0)) / 100;
  const collectedByMonth = (repaymentsByLoan[normalizeLoanId(row.loanId)] || []).reduce((acc, repayment) => {
    const receivedAt = toDate(repayment.receivedAt);
    if (!receivedAt) return acc;
    if (rangeOnly && (receivedAt < range.from || receivedAt >= range.toExclusive)) return acc;
    const key = monthKey(receivedAt);
    acc[key] = (acc[key] || 0) + Number(repayment.interestComponent || 0);
    return acc;
  }, {});
  const rangeStart = range.from > accrualStart ? range.from : accrualStart;
  const rangeEnd = range.toExclusive < accrualEndExclusive ? range.toExclusive : accrualEndExclusive;
  const days = [];

  for (let cursor = new Date(rangeStart); cursor < rangeEnd; cursor = addDays(cursor, 1)) {
    days.push({
      accruedInterest: money(dailyInterest),
      date: sqlDate(cursor),
      month: monthKey(cursor),
    });
  }

  const monthMap = days.reduce((acc, day) => {
    if (!acc[day.month]) {
      acc[day.month] = {
        accruedInterest: 0,
        days: 0,
        month: day.month,
      };
    }
    acc[day.month].accruedInterest += day.accruedInterest;
    acc[day.month].days += 1;
    return acc;
  }, {});

  if (rangeOnly) {
    Object.keys(collectedByMonth).forEach((month) => {
      if (!monthMap[month]) monthMap[month] = { accruedInterest: 0, days: 0, month };
    });
  }

  return {
    dayBuckets: days.map((day) => ({
      accruedInterest: day.accruedInterest,
      bookedInterest: day.accruedInterest,
      days: 1,
      period: day.date,
    })),
    monthBuckets: Object.values(monthMap).map((bucket) => ({
      accruedInterest: money(bucket.accruedInterest),
      bookedInterest: money(bucket.accruedInterest),
      collectedInterest: money(collectedByMonth[bucket.month] || 0),
      customerName: row.customerName || row.customerId || 'Customer',
      days: bucket.days,
      dueDate: row.dueDate,
      interestRate: Number(row.interestRate || 0),
      loanId: row.loanId,
      month: bucket.month,
      period: monthLabel(bucket.month),
      principal: Number(row.principal || 0),
      startDate: row.startDate,
    })),
  };
}

function summarizeReportRows(rows) {
  const totals = rows.reduce((acc, row) => {
    const accrued = Number(row.accruedInterest || 0);
    const booked = Number(row.bookedInterest || 0);
    const collected = Number(row.collectedInterest ?? row.receivedInterest ?? 0);
    acc.accruedInterest += accrued;
    acc.bookedInterest += booked;
    acc.collectedInterest += collected;
    acc.interestReceivable += Number(row.interestReceivable ?? row.pendingInterest ?? Math.max(0, accrued - collected));
    acc.pendingBookedInterest += Number(row.pendingBookedInterest ?? Math.max(0, booked - collected));
    acc.rangeAccruedInterest += Number(row.rangeAccruedInterest || 0);
    acc.rangeBookedInterest += Number(row.rangeBookedInterest || 0);
    acc.rangeInterestReceived += Number(row.rangeInterestReceived || 0);
    return acc;
  }, {
    accruedInterest: 0, bookedInterest: 0, collectedInterest: 0,
    interestReceivable: 0, pendingBookedInterest: 0,
    rangeAccruedInterest: 0, rangeBookedInterest: 0, rangeInterestReceived: 0,
  });
  Object.keys(totals).forEach((key) => { totals[key] = money(totals[key]); });
  totals.collectionRate = totals.accruedInterest > 0 ? Math.round((totals.collectedInterest / totals.accruedInterest) * 100) : 0;
  totals.bookedReceiptRate = totals.bookedInterest > 0 ? Math.round((totals.collectedInterest / totals.bookedInterest) * 100) : 0;
  return totals;
}

async function getInterestReports(filters = {}) {
  const range = normalizeRange(filters);
  // Opt in from the accountant panel; other report consumers keep their existing contract.
  const rangeOnly = filters.scope === 'range';
  const loans = await query(`
    SELECT
      loan.id AS loanId,
      loan.customer_id AS customerId,
      customer.name AS customerName,
      customer.phone AS phone,
      loan.principal,
      loan.interest_rate AS interestRate,
      loan.total_amount AS totalAmount,
      COALESCE(
        (
          SELECT SUM(r.amount)
          FROM loan_repayments r
          WHERE (
            r.loan_id = loan.id
            OR TRIM(LEADING 'LN' FROM REPLACE(REPLACE(REPLACE(UPPER(r.loan_id), ' ', ''), '-', ''), '_', '')) = TRIM(LEADING 'LN' FROM REPLACE(REPLACE(REPLACE(UPPER(loan.id), ' ', ''), '-', ''), '_', ''))
          ) AND r.status IN ('received', 'success', 'paid', 'settled')
        ),
        0
      ) AS amountPaid,
      loan.balance,
      COALESCE((SELECT DATE(disbursed_at) FROM lead_accounting_payments WHERE loan_id = loan.id ORDER BY id DESC LIMIT 1), loan.start_date) AS startDate,
      loan.due_date AS dueDate,
      loan.status,
      schedule.id AS scheduleId,
      schedule.principal_due AS principalDue,
      schedule.interest_due AS interestDue,
      schedule.fees_due AS feesDue,
      schedule.penalty_due AS penaltyDue,
      schedule.total_due AS totalDue,
      schedule.amount_paid AS scheduleAmountPaid,
      schedule.status AS scheduleStatus,
      schedule.paid_at AS paidAt
    FROM loans loan
    LEFT JOIN customers customer ON customer.id = loan.customer_id
    LEFT JOIN loan_repayment_schedule schedule
      ON schedule.id = (
        SELECT s2.id
        FROM loan_repayment_schedule s2
        WHERE s2.loan_id = loan.id
        ORDER BY s2.installment_number ASC, s2.id ASC
        LIMIT 1
      )
    ORDER BY loan.start_date DESC, loan.id DESC
  `);

  const repayments = await query(`
    SELECT
      loan_id AS loanId,
      amount,
      principal_component AS principalComponent,
      interest_component AS interestComponent,
      fees_component AS feesComponent,
      penalty_component AS penaltyComponent,
      received_at AS receivedAt,
      status
    FROM loan_repayments
    WHERE status IN (?)
  `, [VALID_PAYMENT_STATUSES]);

  const repaymentsByLoan = repayments.reduce((acc, repayment) => {
    const key = normalizeLoanId(repayment.loanId);
    if (key) {
      if (!acc[key]) acc[key] = [];
      acc[key].push(repayment);
    }
    return acc;
  }, {});

  const rows = loans.map((loan) => {
    const start = toDate(loan.startDate);
    const due = toDate(loan.dueDate);
    const accrualStart = start ? addDays(start, 1) : null;
    const interestDue = Number(loan.interestDue || Math.max(0, Number(loan.totalAmount || 0) - Number(loan.principal || 0)));
    const loanEnd = due ? addDays(due, 1) : addDays(range.asOf, 1);
    const totalDays = Math.max(1, daysBetween(accrualStart || range.asOf, loanEnd));
    const accruedDays = Math.min(totalDays, Math.max(0, daysBetween(accrualStart || range.asOf, addDays(range.asOf, 1))));
    const rangeDays = accrualStart ? overlapDays(accrualStart, loanEnd, range.from, range.toExclusive) : 0;
    const loanRepayments = repaymentsByLoan[normalizeLoanId(loan.loanId)] || [];
    const interestReceived = loanRepayments.reduce((sum, item) => sum + Number(item.interestComponent || 0), 0);
    const rangeInterestReceived = loanRepayments.reduce((sum, item) => {
      const receivedAt = toDate(item.receivedAt);
      if (!receivedAt || receivedAt < range.from || receivedAt >= range.toExclusive) return sum;
      return sum + Number(item.interestComponent || 0);
    }, 0);
    const rangeAccruedInterest = money((interestDue * rangeDays) / totalDays);
    const isBookedInRange = due && due >= range.from && due < range.toExclusive;
    if (rangeOnly && !rangeDays && !isBookedInRange && !rangeInterestReceived) return null;
    const accruedInterest = rangeOnly ? rangeAccruedInterest : money((interestDue * accruedDays) / totalDays);
    const bookedInterest = rangeOnly ? (isBookedInRange ? interestDue : 0) : interestDue;
    const collectedInterest = rangeOnly ? rangeInterestReceived : interestReceived;

    return {
      accruedInterest,
      balance: Number(loan.balance || 0),
      bookedInterest: money(bookedInterest),
      collectedInterest: money(collectedInterest),
      customerName: loan.customerName || loan.customerId || 'Customer',
      dueDate: loan.dueDate,
      interestRate: Number(loan.interestRate || 0),
      interestReceivable: money(Math.max(0, accruedInterest - collectedInterest)),
      loanId: loan.loanId,
      pendingBookedInterest: money(Math.max(0, bookedInterest - collectedInterest)),
      phone: loan.phone || '',
      principal: Number(loan.principal || 0),
      rangeAccruedInterest,
      rangeBookedInterest: isBookedInRange ? money(bookedInterest) : 0,
      rangeInterestReceived: money(rangeInterestReceived),
      startDate: loan.startDate,
      status: loan.status || '',
      totalInterestDays: totalDays,
    };
  }).filter(Boolean);

  const summary = rows.reduce((acc, row) => {
    acc.accruedInterest += row.accruedInterest;
    acc.bookedInterest += row.bookedInterest;
    acc.collectedInterest += row.collectedInterest;
    acc.interestReceivable += row.interestReceivable;
    acc.pendingBookedInterest += row.pendingBookedInterest;
    acc.rangeAccruedInterest += row.rangeAccruedInterest;
    acc.rangeBookedInterest += row.rangeBookedInterest;
    acc.rangeInterestReceived += row.rangeInterestReceived;
    return acc;
  }, {
    accruedInterest: 0,
    bookedInterest: 0,
    collectedInterest: 0,
    interestReceivable: 0,
    pendingBookedInterest: 0,
    rangeAccruedInterest: 0,
    rangeBookedInterest: 0,
    rangeInterestReceived: 0,
  });

  Object.keys(summary).forEach((key) => {
    summary[key] = money(summary[key]);
  });
  summary.collectionRate = summary.accruedInterest > 0
    ? Math.round((summary.collectedInterest / summary.accruedInterest) * 100)
    : 0;
  summary.bookedReceiptRate = summary.bookedInterest > 0
    ? Math.round((summary.collectedInterest / summary.bookedInterest) * 100)
    : 0;

  const dayBuckets = {};
  for (let cursor = new Date(range.from); cursor < range.toExclusive; cursor = addDays(cursor, 1)) {
    dayBuckets[sqlDate(cursor)] = emptyBucket(sqlDate(cursor));
  }
  const monthBuckets = {};
  const customerMonthWiseRows = [];

  loans.forEach((loan) => {
    const allocation = allocateLoanInterestByPeriod(loan, range, repaymentsByLoan, rangeOnly);
    allocation.dayBuckets.forEach((bucket) => {
      if (!dayBuckets[bucket.period]) return;
      dayBuckets[bucket.period].accruedInterest += bucket.accruedInterest;
      dayBuckets[bucket.period].bookedInterest += bucket.bookedInterest;
      dayBuckets[bucket.period].days += bucket.days;
    });
    allocation.monthBuckets.forEach((bucket) => {
      if (!monthBuckets[bucket.month]) monthBuckets[bucket.month] = emptyBucket(bucket.period);
      monthBuckets[bucket.month].accruedInterest += bucket.accruedInterest;
      monthBuckets[bucket.month].bookedInterest += bucket.bookedInterest;
      monthBuckets[bucket.month].days += bucket.days;
      customerMonthWiseRows.push({
        ...bucket,
        collectedInterest: money(bucket.collectedInterest),
        pendingInterest: money(Math.max(0, bucket.accruedInterest - bucket.collectedInterest)),
        receivedInterest: money(bucket.collectedInterest),
      });
    });
  });

  repayments.forEach((repayment) => {
    const receivedAt = toDate(repayment.receivedAt);
    if (!receivedAt || receivedAt < range.from || receivedAt >= range.toExclusive) return;
    const key = sqlDate(receivedAt);
    const interest = Number(repayment.interestComponent || 0);
    if (dayBuckets[key]) {
      dayBuckets[key].collectedInterest += interest;
      dayBuckets[key].receivedInterest += interest;
    }
    const month = monthKey(receivedAt);
    if (!monthBuckets[month]) monthBuckets[month] = emptyBucket(month);
    monthBuckets[month].collectedInterest += interest;
    monthBuckets[month].receivedInterest += interest;
  });

  const finalizeBucket = (bucket) => ({
    ...bucket,
    accruedInterest: money(bucket.accruedInterest),
    bookedInterest: money(bucket.bookedInterest),
    collectedInterest: money(bucket.collectedInterest),
    days: Number(bucket.days || 0),
    pendingInterest: money(Math.max(0, bucket.accruedInterest - bucket.collectedInterest)),
    receivedInterest: money(bucket.receivedInterest),
  });

  const reports = {
    accruedInterest: rows.map((row) => ({
      accruedInterest: row.accruedInterest,
      customerName: row.customerName,
      dueDate: row.dueDate,
      interestRate: row.interestRate,
      loanId: row.loanId,
      principal: row.principal,
      startDate: row.startDate,
      status: row.status,
    })),
    accruedVsCollected: rows.map((row) => ({
      accruedInterest: row.accruedInterest,
      collectedInterest: row.collectedInterest,
      collectionRate: row.accruedInterest > 0 ? Math.round((row.collectedInterest / row.accruedInterest) * 100) : 0,
      customerName: row.customerName,
      loanId: row.loanId,
      pendingInterest: row.interestReceivable,
    })),
    bookedVsReceived: rows.map((row) => ({
      bookedInterest: row.bookedInterest,
      customerName: row.customerName,
      loanId: row.loanId,
      pendingBookedInterest: row.pendingBookedInterest,
      receivedInterest: row.collectedInterest,
    })),
    dayWise: Object.values(dayBuckets).map(finalizeBucket).sort((a, b) => b.period.localeCompare(a.period)),
    customerMonthWise: customerMonthWiseRows.sort((a, b) => (
      b.month.localeCompare(a.month) || String(a.customerName).localeCompare(String(b.customerName))
    )),
    interestRealization: rows.filter((row) => row.collectedInterest > 0).map((row) => ({
      collectedInterest: row.collectedInterest,
      customerName: row.customerName,
      loanId: row.loanId,
      pendingInterest: row.interestReceivable,
    })),
    interestReceivable: rows.filter((row) => row.interestReceivable > 0).map((row) => ({
      accruedInterest: row.accruedInterest,
      collectedInterest: row.collectedInterest,
      customerName: row.customerName,
      dueDate: row.dueDate,
      interestReceivable: row.interestReceivable,
      loanId: row.loanId,
      phone: row.phone,
    })),
    monthWise: Object.values(monthBuckets).map(finalizeBucket).sort((a, b) => b.period.localeCompare(a.period)),
  };

  const reportSummaries = rangeOnly ? {
    accruedInterest: summary,
    accruedVsCollected: summary,
    bookedVsReceived: summary,
    interestRealization: summarizeReportRows(rows.filter((row) => row.collectedInterest > 0)),
    interestReceivable: summarizeReportRows(rows.filter((row) => row.interestReceivable > 0)),
    dayWise: summarizeReportRows(reports.dayWise),
    monthWise: summarizeReportRows(reports.monthWise),
    customerMonthWise: summarizeReportRows(reports.customerMonthWise),
  } : undefined;

  return {
    filters: { from: range.fromSql, to: range.toSql },
    reports,
    summary,
    ...(rangeOnly ? { reportSummaries } : {}),
  };
}

module.exports = { getInterestReports };
