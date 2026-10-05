const { query } = require('../config/db');

const VALID_DISPOSITIONS = new Set([
  'Connected',
  'Not Connected',
  'Switched Off',
  'Busy',
  'Wrong Number',
  'Call Back Requested',
  'Promise To Pay',
  'Dispute',
  'Refused To Pay',
]);

function clean(value) {
  return String(value ?? '').trim();
}

function sqlDateTime(value) {
  const text = clean(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function sqlDate(value) {
  const text = clean(value);
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (part) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function mapCase(row) {
  if (!row) return null;
  return {
    id: row.id,
    loanId: row.loan_id || row.loanId || '',
    customerId: row.customer_id || row.customerId || '',
    customer: row.customer || '',
    phone: row.phone || '',
    totalDue: Number(row.total_due || row.totalDue || 0),
    daysOverdue: Number(row.days_overdue || row.daysOverdue || 0),
    originalDueDate: row.original_due_date || row.originalDueDate || null,
    lastContactDate: row.last_contact_date || row.lastContactDate || null,
    lastPaymentDate: row.last_payment_date || row.lastPaymentDate || null,
    status: row.status || 'Active',
    assignedTo: row.assigned_to || row.assignedTo || 'Collections',
  };
}

async function findCaseById(caseId) {
  const rows = await query('SELECT * FROM collection_cases WHERE id = ? LIMIT 1', [caseId]);
  return mapCase(rows[0]);
}

let summaryCache = {
  timestamp: 0,
  data: null,
};
const SUMMARY_CACHE_TTL_MS = 15 * 1000; // 15 seconds cache

function invalidateSummaryCache() {
  summaryCache.data = null;
}

let lastSyncOverdueTimestamp = 0;
let syncOverdueInProgress = false;
const SYNC_OVERDUE_THROTTLE_MS = 2 * 60 * 1000; // 2 minutes throttle

async function getSummary(options = {}) {
  const force = options?.force === true;
  if (!force && summaryCache.data && (Date.now() - summaryCache.timestamp < SUMMARY_CACHE_TTL_MS)) {
    return summaryCache.data;
  }

  const [
    [caseStats = {}],
    [totalCollectedStats = {}],
    [todayStats = {}],
    [thisMonthStats = {}],
    [followupStats = {}],
    [ptpStats = {}],
  ] = await Promise.all([
    query(`
      SELECT
        COUNT(*) AS activeCases,
        SUM(CASE 
          WHEN COALESCE(loan.balance, cc.total_due, 0) > 0 THEN COALESCE(loan.balance, cc.total_due, 0)
          ELSE 0 
        END) AS totalOutstanding,
        SUM(CASE WHEN DATE(COALESCE(loan.due_date, cc.original_due_date)) = CURDATE() THEN 1 ELSE 0 END) AS dueToday,
        SUM(CASE WHEN DATEDIFF(CURDATE(), COALESCE(loan.due_date, cc.original_due_date)) > 0 THEN 1 ELSE 0 END) AS overdueAccounts,
        SUM(CASE WHEN DATEDIFF(CURDATE(), COALESCE(loan.due_date, cc.original_due_date)) BETWEEN 0 AND 30 THEN 1 ELSE 0 END) AS bucket0To30,
        SUM(CASE WHEN DATEDIFF(CURDATE(), COALESCE(loan.due_date, cc.original_due_date)) BETWEEN 31 AND 60 THEN 1 ELSE 0 END) AS bucket31To60,
        SUM(CASE WHEN DATEDIFF(CURDATE(), COALESCE(loan.due_date, cc.original_due_date)) BETWEEN 61 AND 90 THEN 1 ELSE 0 END) AS bucket61To90,
        SUM(CASE WHEN DATEDIFF(CURDATE(), COALESCE(loan.due_date, cc.original_due_date)) > 90 THEN 1 ELSE 0 END) AS bucket90Plus,
        SUM(COALESCE(loan.total_amount, cc.total_due, 0)) AS totalRepayable,
        SUM(COALESCE(loan.amount_paid, 0)) AS caseCollected
      FROM collection_cases cc
      LEFT JOIN loans loan ON loan.id = cc.loan_id
      WHERE cc.status NOT IN ('Closed', 'Paid Off')
    `),
    query(`
      SELECT COALESCE(SUM(amount_paid), 0) AS grandTotalCollected FROM loans
    `),
    query(`
      SELECT COALESCE(SUM(amount), 0) AS collectionToday, COUNT(*) AS paymentsToday
      FROM loan_repayments
      WHERE DATE(COALESCE(received_at, created_at)) = CURDATE()
        AND LOWER(TRIM(status)) IN ('received', 'success', 'paid', 'settled', 'completed', 'approved')
    `),
    query(`
      SELECT COALESCE(SUM(amount), 0) AS collectionThisMonth, COUNT(*) AS paymentsThisMonth
      FROM loan_repayments
      WHERE MONTH(COALESCE(received_at, created_at)) = MONTH(CURDATE())
        AND YEAR(COALESCE(received_at, created_at)) = YEAR(CURDATE())
        AND LOWER(TRIM(status)) IN ('received', 'success', 'paid', 'settled', 'completed', 'approved')
    `),
    query(`
      SELECT COUNT(DISTINCT f.id) AS pendingFollowups
      FROM collection_followups f
      JOIN collection_cases cc ON cc.id = f.case_id
      WHERE f.status = 'open' AND f.due_at <= NOW() AND cc.status NOT IN ('Closed', 'Paid Off')
    `),
    query(`
      SELECT
        COUNT(DISTINCT CASE WHEN p.status = 'active' THEN p.id END) AS activePtps,
        COUNT(DISTINCT CASE WHEN p.status = 'active' AND p.ptp_date < CURDATE() THEN p.id END) AS brokenPtps
      FROM collection_ptps p
      JOIN collection_cases cc ON cc.id = p.case_id
      WHERE cc.status NOT IN ('Closed', 'Paid Off')
    `),
  ]);

  let collectionThisMonth = Number(thisMonthStats.collectionThisMonth || 0);
  let paymentsThisMonth = Number(thisMonthStats.paymentsThisMonth || 0);
  const totalRepayable = Number(caseStats.totalRepayable || 0);
  const totalCollected = Number(totalCollectedStats.grandTotalCollected || caseStats.caseCollected || 0);

  const result = {
    activeCases: Number(caseStats.activeCases || 0),
    activePtps: Number(ptpStats.activePtps || 0),
    brokenPtps: Number(ptpStats.brokenPtps || 0),
    buckets: {
      '0-30': Number(caseStats.bucket0To30 || 0),
      '31-60': Number(caseStats.bucket31To60 || 0),
      '61-90': Number(caseStats.bucket61To90 || 0),
      '90+': Number(caseStats.bucket90Plus || 0),
    },
    collectionToday: Number(todayStats.collectionToday || 0),
    collectionThisMonth,
    dueToday: Number(caseStats.dueToday || 0),
    overdueAccounts: Number(caseStats.overdueAccounts || 0),
    paymentsToday: Number(todayStats.paymentsToday || 0),
    paymentsThisMonth,
    pendingFollowups: Number(followupStats.pendingFollowups || 0),
    recoveryRate: totalRepayable > 0 ? Math.round((totalCollected / totalRepayable) * 100) : 0,
    totalCollected,
    totalOutstanding: Number(caseStats.totalOutstanding || 0),
  };

  summaryCache = {
    timestamp: Date.now(),
    data: result,
  };

  return result;
}

function parseJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function getActivity(caseId) {
  const collectionCase = await findCaseById(caseId);
  const loanId = collectionCase ? collectionCase.loanId : '';
  const customerId = collectionCase ? collectionCase.customerId : '';

  const [calls, followups, ptps, payments] = await Promise.all([
    query(`
      SELECT id, case_id AS caseId, loan_id AS loanId, disposition, sub_disposition AS subDisposition,
        notes, next_action_at AS nextActionAt, actor, created_at AS createdAt
      FROM collection_call_logs
      WHERE case_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 30
    `, [caseId]),
    query(`
      SELECT id, case_id AS caseId, loan_id AS loanId, due_at AS dueAt, reason, status,
        notes, actor, completed_at AS completedAt, created_at AS createdAt
      FROM collection_followups
      WHERE case_id = ?
      ORDER BY due_at DESC, id DESC
      LIMIT 30
    `, [caseId]),
    query(`
      SELECT id, case_id AS caseId, loan_id AS loanId, amount, ptp_date AS ptpDate,
        status, kept_amount AS keptAmount, paid_at AS paidAt, broken_at AS brokenAt,
        notes, actor, created_at AS createdAt
      FROM collection_ptps
      WHERE case_id = ?
      ORDER BY ptp_date DESC, id DESC
      LIMIT 30
    `, [caseId]),
    query(`
      SELECT id, loan_id AS loanId, customer_id AS customerId, amount, method, reference, status, received_by AS receivedBy, received_at AS receivedAt, metadata, created_at AS createdAt
      FROM loan_repayments
      WHERE (
        loan_id = ?
        OR TRIM(LEADING 'LN' FROM REPLACE(REPLACE(REPLACE(UPPER(loan_id), ' ', ''), '-', ''), '_', '')) = TRIM(LEADING 'LN' FROM REPLACE(REPLACE(REPLACE(UPPER(?), ' ', ''), '-', ''), '_', ''))
        OR JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.caseId')) = ?
      )
      ORDER BY created_at DESC, id DESC
      LIMIT 30
    `, [loanId, loanId, caseId]),
  ]);

  const parsedPayments = (payments || []).map((p) => {
    const meta = parseJson(p.metadata) || {};
    return {
      id: p.id,
      loanId: p.loanId,
      customerId: p.customerId,
      amount: Number(p.amount || 0),
      method: p.method,
      reference: p.reference,
      status: p.status,
      receivedBy: p.receivedBy,
      receivedAt: p.receivedAt,
      metadata: meta,
      proofUrl: meta.proofUrl || '',
      proofOriginalName: meta.proofOriginalName || '',
      notes: meta.notes || '',
      createdAt: p.createdAt,
    };
  });

  return { calls, followups, ptps, payments: parsedPayments };
}

async function createCallLog(collectionCase, payload = {}) {
  const disposition = clean(payload.disposition);
  if (!VALID_DISPOSITIONS.has(disposition)) {
    const error = new Error('Select a valid collection disposition.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  const nextActionAt = sqlDateTime(payload.nextActionAt);
  const result = await query(`
    INSERT INTO collection_call_logs (
      case_id, loan_id, disposition, sub_disposition, notes, next_action_at, actor
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    collectionCase.id,
    collectionCase.loanId,
    disposition,
    clean(payload.subDisposition),
    clean(payload.notes),
    nextActionAt,
    clean(payload.actor) || 'Collection Agent',
  ]);

  await query('UPDATE collection_cases SET last_contact_date = CURDATE(), status = ? WHERE id = ?', [
    disposition === 'Promise To Pay' ? 'PTP' : 'Contacted',
    collectionCase.id,
  ]);

  return (await getActivity(collectionCase.id)).calls.find((item) => item.id === result.insertId) || null;
}

async function createFollowup(collectionCase, payload = {}) {
  const dueAt = sqlDateTime(payload.dueAt || payload.nextActionAt);
  if (!dueAt) {
    const error = new Error('Follow-up date and time is required.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  const result = await query(`
    INSERT INTO collection_followups (
      case_id, loan_id, due_at, reason, status, notes, actor
    ) VALUES (?, ?, ?, ?, 'open', ?, ?)
  `, [
    collectionCase.id,
    collectionCase.loanId,
    dueAt,
    clean(payload.reason) || 'follow_up',
    clean(payload.notes),
    clean(payload.actor) || 'Collection Agent',
  ]);

  return (await getActivity(collectionCase.id)).followups.find((item) => item.id === result.insertId) || null;
}

async function createPtp(collectionCase, payload = {}) {
  const amount = Number(payload.amount || 0);
  const ptpDate = sqlDate(payload.ptpDate);
  if (!Number.isFinite(amount) || amount <= 0) {
    const error = new Error('PTP amount must be greater than zero.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }
  if (!ptpDate) {
    const error = new Error('PTP date is required.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  const result = await query(`
    INSERT INTO collection_ptps (
      case_id, loan_id, amount, ptp_date, status, notes, actor
    ) VALUES (?, ?, ?, ?, 'active', ?, ?)
  `, [
    collectionCase.id,
    collectionCase.loanId,
    amount,
    ptpDate,
    clean(payload.notes),
    clean(payload.actor) || 'Collection Agent',
  ]);

  await query('UPDATE collection_cases SET status = ? WHERE id = ?', ['PTP', collectionCase.id]);

  return (await getActivity(collectionCase.id)).ptps.find((item) => item.id === result.insertId) || null;
}

async function updatePtpStatus(collectionCase, ptpId, payload = {}) {
  const status = clean(payload.status).toLowerCase();
  if (!['kept', 'broken', 'cancelled'].includes(status)) {
    const error = new Error('PTP status must be kept, broken, or cancelled.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  const keptAmount = Number(payload.keptAmount || 0);
  const result = await query(`
    UPDATE collection_ptps
    SET status = ?,
        kept_amount = CASE WHEN ? = 'kept' THEN ? ELSE kept_amount END,
        paid_at = CASE WHEN ? = 'kept' THEN COALESCE(paid_at, CURRENT_TIMESTAMP) ELSE paid_at END,
        broken_at = CASE WHEN ? = 'broken' THEN COALESCE(broken_at, CURRENT_TIMESTAMP) ELSE broken_at END,
        notes = COALESCE(NULLIF(?, ''), notes),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND case_id = ?
  `, [
    status,
    status,
    keptAmount,
    status,
    status,
    clean(payload.notes),
    ptpId,
    collectionCase.id,
  ]);

  if (!result.affectedRows) {
    const error = new Error('Promise to pay entry not found.');
    error.statusCode = 404;
    error.publicMessage = error.message;
    throw error;
  }

  if (status === 'broken') {
    await query('UPDATE collection_cases SET status = ? WHERE id = ?', ['Broken PTP', collectionCase.id]);
  }

  return (await getActivity(collectionCase.id)).ptps.find((item) => Number(item.id) === Number(ptpId)) || null;
}

async function getCollectionReports() {
  const [summary, rows, recentPayments, ptpRows] = await Promise.all([
    getSummary(),
    query(`
      SELECT
        DATE(received_at) AS paymentDate,
        COUNT(*) AS paymentCount,
        COALESCE(SUM(amount), 0) AS amount
      FROM loan_repayments
      WHERE received_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        AND status IN ('received', 'success', 'paid', 'settled')
      GROUP BY DATE(received_at)
      ORDER BY paymentDate DESC
    `),
    query(`
      SELECT
        r.id AS paymentId,
        r.loan_id AS loanId,
        COALESCE(MAX(NULLIF(c.name, '')), MAX(NULLIF(la.full_name, '')), MAX(NULLIF(cc.customer, '')), 'Borrower') AS customerName,
        COALESCE(MAX(NULLIF(c.phone, '')), MAX(NULLIF(la.mobile, '')), MAX(NULLIF(cc.phone, '')), '') AS phone,
        r.amount AS amount,
        r.principal_component AS principalComponent,
        r.interest_component AS interestComponent,
        COALESCE(r.received_at, r.created_at) AS receivedAt,
        r.status AS status,
        r.reference AS reference,
        r.received_by AS receivedBy
      FROM loan_repayments r
      LEFT JOIN loans l ON l.id = r.loan_id
      LEFT JOIN customers c ON c.id = COALESCE(r.customer_id, l.customer_id)
      LEFT JOIN collection_cases cc ON cc.loan_id = r.loan_id
      LEFT JOIN loan_applications la ON (la.application_id = r.application_id OR CAST(la.id AS CHAR) = r.lead_id)
      WHERE LOWER(TRIM(r.status)) IN ('received', 'success', 'paid', 'settled', 'completed', 'approved')
      GROUP BY r.id, r.loan_id, r.amount, r.principal_component, r.interest_component, r.received_at, r.created_at, r.status, r.reference, r.received_by
      ORDER BY COALESCE(r.received_at, r.created_at) DESC, r.id DESC
      LIMIT 200
    `),
    query(`
      SELECT status, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS amount
      FROM collection_ptps
      GROUP BY status
    `),
  ]);

  return {
    paymentTrend: rows.map((row) => ({
      amount: Number(row.amount || 0),
      paymentCount: Number(row.paymentCount || 0),
      paymentDate: row.paymentDate,
    })),
    recentPayments: recentPayments.map((row) => ({
      ...row,
      amount: Number(row.amount || 0),
      principalComponent: Number(row.principalComponent || 0),
      interestComponent: Number(row.interestComponent || 0),
    })),
    ptpSummary: ptpRows.reduce((acc, row) => {
      acc[row.status || 'unknown'] = {
        amount: Number(row.amount || 0),
        count: Number(row.count || 0),
      };
      return acc;
    }, {}),
    summary,
  };
}

async function syncOverdueLoans(options = {}) {
  const force = options?.force === true;
  if (!force && (Date.now() - lastSyncOverdueTimestamp < SYNC_OVERDUE_THROTTLE_MS)) {
    return;
  }
  if (syncOverdueInProgress) {
    return;
  }
  syncOverdueInProgress = true;
  try {
    // 0. Check for any missing loan records from active collection_cases
    const missingLoans = await query(`
      SELECT 
        cc.loan_id, 
        cc.customer_id, 
        cc.customer, 
        cc.phone, 
        cc.total_due, 
        cc.original_due_date
      FROM collection_cases cc
      LEFT JOIN loans loan ON loan.id = cc.loan_id
      WHERE loan.id IS NULL AND cc.status NOT IN ('Closed', 'Paid Off')
    `);

    if (missingLoans && missingLoans.length > 0) {
      for (const cc of missingLoans) {
        try {
          const principal = Number(cc.total_due || 0);
          const totalAmount = Number(cc.total_due || 0);
          const interestRate = 1.0;

          await query(`
            INSERT INTO loans (
              id, customer_id, principal, interest_rate, total_amount, amount_paid,
              balance, start_date, due_date, status, payment_status, next_payment_date,
              next_payment_amount
            ) VALUES (?, ?, ?, ?, ?, 0, ?, DATE_SUB(?, INTERVAL 30 DAY), ?, 'Active', 'Pending', ?, ?)
          `, [
            cc.loan_id,
            cc.customer_id,
            principal,
            interestRate,
            totalAmount,
            totalAmount,
            cc.original_due_date,
            cc.original_due_date,
            cc.original_due_date,
            totalAmount
          ]);
        } catch (err) {
          console.error(`[CollectionModel] Failed to heal missing loan record ${cc.loan_id}:`, err);
        }
      }
    }

    // 1. Fetch active loans using fast indexed query without correlated subqueries
    const activeLoans = await query(`
      SELECT 
        loan.id, 
        loan.customer_id, 
        loan.principal, 
        loan.interest_rate, 
        loan.total_amount, 
        loan.balance, 
        loan.start_date, 
        loan.due_date, 
        loan.status, 
        loan.payment_status
      FROM loans loan
      WHERE loan.status NOT IN ('Closed', 'Paid Off')
    `);

    if (!activeLoans || !activeLoans.length) {
      lastSyncOverdueTimestamp = Date.now();
      return;
    }

    // Batch fetch all repayment schedules and repayments for all active loans to avoid N+1 queries
    const activeLoanIds = activeLoans.map((l) => l.id);
    const [allSchedules, allRepayments] = await Promise.all([
      query(`
        SELECT id, loan_id, customer_id, installment_number, due_date, principal_due, interest_due, fees_due, penalty_due, total_due, amount_paid, status
        FROM loan_repayment_schedule
        WHERE loan_id IN (?)
        ORDER BY installment_number ASC
      `, [activeLoanIds]).catch(() => []),
      query(`
        SELECT loan_id, amount, principal_component, interest_component, fees_component, penalty_component, received_at, status
        FROM loan_repayments
        WHERE loan_id IN (?) AND status IN ('received', 'success', 'paid', 'settled')
        ORDER BY received_at DESC, id DESC
      `, [activeLoanIds]).catch(() => []),
    ]);

    const schedulesByLoan = new Map();
    for (const s of (allSchedules || [])) {
      const list = schedulesByLoan.get(s.loan_id) || [];
      list.push(s);
      schedulesByLoan.set(s.loan_id, list);
    }

    const repaymentsByLoan = new Map();
    for (const r of (allRepayments || [])) {
      const list = repaymentsByLoan.get(r.loan_id) || [];
      list.push(r);
      repaymentsByLoan.set(r.loan_id, list);
    }

    // 2. Loop through each active loan with in-memory map lookups
    for (const loan of activeLoans) {
      const loanId = loan.id;

      // Self-heal: If interest rate is 2.0 or 0.0, update to 1.0
      const dbInterestRate = Number(loan.interest_rate || 0);
      if (dbInterestRate === 2.0 || dbInterestRate === 0.0) {
        try {
          await query('UPDATE loans SET interest_rate = 1.0 WHERE id = ?', [loanId]);
          loan.interest_rate = 1.0;
        } catch (err) {
          console.error(`[CollectionModel] Failed to self-heal incorrect interest rate for loan ${loanId}:`, err);
        }
      }

      let schedules = schedulesByLoan.get(loanId) || [];

      // Self-heal: If schedule record is missing, create a default one
      if (!schedules || !schedules.length) {
        try {
          const principalDue = Number(loan.principal || loan.total_amount || 0);
          const interestDue = Math.max(0, Number(loan.total_amount || 0) - principalDue);
          await query(`
            INSERT INTO loan_repayment_schedule (
              loan_id, customer_id, installment_number, due_date, principal_due,
              interest_due, fees_due, penalty_due, total_due, amount_paid, status
            ) VALUES (?, ?, 1, ?, ?, ?, 0, 0, ?, 0, 'pending')
          `, [
            loanId,
            loan.customer_id,
            loan.due_date,
            principalDue,
            interestDue,
            loan.total_amount
          ]);

          schedules = await query(`
            SELECT id, loan_id, customer_id, installment_number, due_date, principal_due, interest_due, fees_due, penalty_due, total_due, amount_paid, status
            FROM loan_repayment_schedule
            WHERE loan_id = ?
            ORDER BY installment_number ASC
          `, [loanId]);
          schedulesByLoan.set(loanId, schedules);
        } catch (err) {
          console.error(`[CollectionModel] Failed to heal missing schedule record for loan ${loanId}:`, err);
          continue;
        }
      }

      if (!schedules || !schedules.length) continue;

      const repayments = repaymentsByLoan.get(loanId) || [];

    // Calculate total paid and penalty paid so far
    let totalPaid = repayments.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const totalPenaltyPaid = repayments.reduce((sum, r) => sum + Number(r.penalty_component || 0), 0);

    let totalAccruedPenalty = 0;
    let maxDaysOverdue = 0;

    // Typically 1 installment for payday loans, but support multiple
    for (const schedule of schedules) {
      const dueDateStr = schedule.due_date;
      const dueDate = new Date(dueDateStr);
      dueDate.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let daysOverdue = 0;
      let accruedPenalty = 0;

      if (today > dueDate) {
        // Calculate days overdue
        daysOverdue = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000)));
        if (daysOverdue > maxDaysOverdue) {
          maxDaysOverdue = daysOverdue;
        }

        // Calculate interest accrued day by day
        const interestRate = Number(loan.interest_rate || 1.0);
        
        // Base interest on the approved Principal amount (loan.principal)
        const principalAmount = Number(loan.principal || 0);

        // Repayments for this loan that were received after due date.
        // We only track the principal components of payments to reduce the daily principal balance.
        const postDueRepayments = repayments.map(r => ({
          amount: Number(r.principal_component || 0),
          date: new Date(r.received_at)
        }));
        postDueRepayments.forEach(r => r.date.setHours(0, 0, 0, 0));

        let currentDate = new Date(dueDate);
        currentDate.setDate(currentDate.getDate() + 1);

        while (currentDate <= today) {
          const paidBeforeOrOn = postDueRepayments
            .filter(r => r.date <= currentDate)
            .reduce((sum, r) => sum + r.amount, 0);

          const dailyPrincipalBalance = Math.max(0, principalAmount - paidBeforeOrOn);
          accruedPenalty += dailyPrincipalBalance * (interestRate / 100);

          currentDate.setDate(currentDate.getDate() + 1);
        }
        accruedPenalty = Math.round(accruedPenalty);
      }

      totalAccruedPenalty += accruedPenalty;

      // Update schedule fields
      const schedulePenaltyDue = Math.max(0, accruedPenalty - totalPenaltyPaid); // penalty due on this schedule
      const scheduleTotalDue = Number(schedule.principal_due) + Number(schedule.interest_due) + Number(schedule.fees_due) + schedulePenaltyDue;
      const scheduleAmountPaid = Math.min(scheduleTotalDue, totalPaid);
      const scheduleStatus = scheduleAmountPaid >= scheduleTotalDue ? 'paid' : (totalPaid > 0 ? 'partial' : (daysOverdue > 0 ? 'overdue' : 'pending'));

      await query(`
        UPDATE loan_repayment_schedule
        SET penalty_due = ?,
            total_due = ?,
            amount_paid = ?,
            status = ?,
            paid_at = CASE WHEN ? >= ? THEN COALESCE(paid_at, CURRENT_TIMESTAMP) ELSE paid_at END
        WHERE id = ?
      `, [
        schedulePenaltyDue,
        scheduleTotalDue,
        scheduleAmountPaid,
        scheduleStatus,
        scheduleAmountPaid,
        scheduleTotalDue,
        schedule.id
      ]);
    }

    // Update loan balance, status, payment_status
    let upToDateBalance = 0;
    let loanStatus = loan.status;
    let paymentStatus = loan.payment_status;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dueDate = new Date(loan.due_date);
    dueDate.setHours(0, 0, 0, 0);

    const startDate = new Date(loan.start_date);
    startDate.setHours(0, 0, 0, 0);

    // Determine the last payment date from repayments
    const lastPaymentDateObj = repayments.length > 0 && repayments[0].received_at
      ? new Date(repayments[0].received_at)
      : null;

    if (lastPaymentDateObj) {
      lastPaymentDateObj.setHours(0, 0, 0, 0);
    }

    const principal = Number(loan.principal || 0);
    const interestRate = Number(loan.interest_rate || 1.0);
    const totalRepayable = Number(loan.approved_repayment || loan.total_amount || 0);

    const totalDueWithPenalty = totalRepayable + totalAccruedPenalty;

    // Rule 1: If totalPaid covers Base Repayment (or loan is already marked Paid Off/Closed), it is FULLY PAID OFF with 0 balance!
    const isFullRepayPaid = Boolean(totalRepayable > 0 && totalPaid >= (totalRepayable - 100)); // 100 Rs settlement/rounding tolerance
    const isAlreadyPaidOff = (loan.status === 'Paid Off' || loan.status === 'Closed' || loan.payment_status === 'Paid' || Number(loan.balance || 0) <= 0 || isFullRepayPaid);

    if (isAlreadyPaidOff) {
      upToDateBalance = 0;
      loanStatus = loan.status === 'Closed' ? 'Closed' : 'Paid Off';
      paymentStatus = 'Paid';
    } else if (today <= dueDate) {
      // Active loan before or on due date with partial/no payment
      upToDateBalance = Math.max(0, Math.round(totalRepayable - totalPaid));
      loanStatus = 'Active';
      paymentStatus = totalPaid > 0 ? 'Partial' : 'Pending';
    } else {
      // Overdue loan after due date
      upToDateBalance = Math.max(0, Math.round(totalDueWithPenalty - totalPaid));
      loanStatus = 'Overdue';
      paymentStatus = totalPaid > 0 ? 'Partial' : 'Overdue';
    }

    await query(`
      UPDATE loans
      SET amount_paid = ?,
          balance = ?,
          status = ?,
          payment_status = ?,
          next_payment_amount = ?
      WHERE id = ?
    `, [totalPaid, upToDateBalance, loanStatus, paymentStatus, upToDateBalance, loanId]);

    // Update collection cases
    const lastPaymentDate = repayments.length > 0 && repayments[0].received_at
      ? repayments[0].received_at
      : (totalPaid > 0 ? new Date() : null);

    await query(`
      UPDATE collection_cases
      SET total_due = ?,
          days_overdue = ?,
          last_payment_date = COALESCE(last_payment_date, ?),
          status = CASE WHEN ? <= 0 THEN 'Paid Off' ELSE ? END
      WHERE loan_id = ?
         OR TRIM(LEADING 'LN' FROM REPLACE(REPLACE(REPLACE(UPPER(loan_id), ' ', ''), '-', ''), '_', '')) = TRIM(LEADING 'LN' FROM REPLACE(REPLACE(REPLACE(UPPER(?), ' ', ''), '-', ''), '_', ''))
    `, [
      upToDateBalance,
      maxDaysOverdue,
      lastPaymentDate,
      upToDateBalance,
      loanStatus === 'Overdue' ? 'Overdue' : 'Active',
      loanId,
      loanId
    ]);
  }
  lastSyncOverdueTimestamp = Date.now();
} finally {
  syncOverdueInProgress = false;
}
}

module.exports = {
  invalidateSummaryCache,
  createCallLog,
  createFollowup,
  createPtp,
  findCaseById,
  getActivity,
  getCollectionReports,
  getSummary,
  syncOverdueLoans,
  updatePtpStatus,
};
