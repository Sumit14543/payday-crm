const { query } = require('../config/db');
const { likeParams } = require('../utils/strings');

// 15-second In-Memory Cache for loans list queries
const loansListCache = new Map();
const LOANS_CACHE_TTL_MS = 15 * 1000;

function invalidateLoansCache() {
  loansListCache.clear();
}

async function findAll({ search = '', status = 'all', page = 1, limit = 50, pageSize } = {}) {
  const effectiveLimit = pageSize || limit;
  const parsedPage = Math.max(Number(page) || 1, 1);
  const parsedLimit = Math.min(Math.max(Number(effectiveLimit) || 50, 1), 5000);
  const offset = (parsedPage - 1) * parsedLimit;

  const cacheKey = `${search}:${status}:${parsedPage}:${parsedLimit}`;
  const cached = loansListCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < LOANS_CACHE_TTL_MS)) {
    return cached.data;
  }

  const clauses = [];
  const params = [];

  if (search) {
    clauses.push('(l.id LIKE ? OR c.name LIKE ? OR l.customer_id LIKE ?)');
    params.push(...likeParams(search, 3));
  }

  if (status !== 'all') {
    clauses.push('l.status = ?');
    params.push(status);
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  // Calculate total count for server-side pagination
  const countSql = `
    SELECT COUNT(*) AS total
    FROM loans l
    LEFT JOIN customers c ON c.id = l.customer_id
    ${whereClause}
  `;
  const countRows = await query(countSql, params);
  const total = Number(countRows?.[0]?.total || 0);

  const queryParams = [...params, parsedLimit, offset];

  const loans = await query(`
    SELECT
      l.id, c.name AS customer, l.customer_id AS customerId, l.principal, l.interest_rate AS interestRate,
      l.total_amount AS totalAmount,
      COALESCE(
        (
          SELECT SUM(r.amount)
          FROM loan_repayments r
          WHERE (r.loan_id = l.id OR r.loan_id = TRIM(LEADING 'LN' FROM l.id) OR r.loan_id = CONCAT('LN', TRIM(LEADING 'LN' FROM l.id)))
            AND r.status IN ('received', 'success', 'paid', 'settled')
        ),
        0
      ) AS amountPaid,
      l.balance,
      COALESCE(
        (SELECT DATE(COALESCE(disbursed_at, paid_at)) FROM lead_accounting_payments WHERE (disbursed_at IS NOT NULL OR paid_at IS NOT NULL) AND (loan_id = l.id OR loan_id = TRIM(LEADING 'LN' FROM l.id)) ORDER BY id DESC LIMIT 1),
        (SELECT DATE(COALESCE(disbursed_at, paid_at)) FROM lead_accounting_payments WHERE (disbursed_at IS NOT NULL OR paid_at IS NOT NULL) AND (rs.lead_id IS NOT NULL AND lead_id = rs.lead_id) ORDER BY id DESC LIMIT 1),
        (SELECT DATE(COALESCE(sub.disbursement_date, sub.created_at)) FROM lead_sanctions sub WHERE sub.id = ls.id),
        (SELECT DATE(la_sub.created_at) FROM loan_applications la_sub WHERE la_sub.application_id = rs.application_id OR la_sub.id = rs.lead_id LIMIT 1),
        DATE(l.start_date),
        DATE(l.created_at),
        NULL
      ) AS startDate,
      COALESCE(
        (SELECT DATE(COALESCE(disbursed_at, paid_at)) FROM lead_accounting_payments WHERE (disbursed_at IS NOT NULL OR paid_at IS NOT NULL) AND (loan_id = l.id OR loan_id = TRIM(LEADING 'LN' FROM l.id)) ORDER BY id DESC LIMIT 1),
        (SELECT DATE(COALESCE(disbursed_at, paid_at)) FROM lead_accounting_payments WHERE (disbursed_at IS NOT NULL OR paid_at IS NOT NULL) AND (rs.lead_id IS NOT NULL AND lead_id = rs.lead_id) ORDER BY id DESC LIMIT 1),
        (SELECT DATE(COALESCE(sub.disbursement_date, sub.created_at)) FROM lead_sanctions sub WHERE sub.id = ls.id),
        (SELECT DATE(la_sub.created_at) FROM loan_applications la_sub WHERE la_sub.application_id = rs.application_id OR la_sub.id = rs.lead_id LIMIT 1),
        DATE(l.start_date),
        DATE(l.created_at),
        NULL
      ) AS disbursedDate,
      COALESCE(
        (SELECT NULLIF(TRIM(account_number), '') FROM lead_accounting_payments WHERE (account_number IS NOT NULL AND account_number <> '') AND (loan_id = l.id OR loan_id = TRIM(LEADING 'LN' FROM l.id)) ORDER BY id DESC LIMIT 1),
        (SELECT NULLIF(TRIM(account_number), '') FROM lead_accounting_payments WHERE (account_number IS NOT NULL AND account_number <> '') AND (rs.lead_id IS NOT NULL AND lead_id = rs.lead_id) ORDER BY id DESC LIMIT 1),
        NULLIF(TRIM(ls.account_number), ''),
        (SELECT NULLIF(TRIM(account_number), '') FROM loan_applications la_sub WHERE (la_sub.application_id = rs.application_id OR la_sub.id = rs.lead_id OR la_sub.application_id = lap.application_id OR la_sub.id = lap.lead_id) AND la_sub.account_number IS NOT NULL AND la_sub.account_number <> '' ORDER BY la_sub.id DESC LIMIT 1)
      ) AS accountNumber,
      COALESCE(
        (SELECT NULLIF(TRIM(ifsc_code), '') FROM lead_accounting_payments WHERE (ifsc_code IS NOT NULL AND ifsc_code <> '') AND (loan_id = l.id OR loan_id = TRIM(LEADING 'LN' FROM l.id)) ORDER BY id DESC LIMIT 1),
        (SELECT NULLIF(TRIM(ifsc_code), '') FROM lead_accounting_payments WHERE (ifsc_code IS NOT NULL AND ifsc_code <> '') AND (rs.lead_id IS NOT NULL AND lead_id = rs.lead_id) ORDER BY id DESC LIMIT 1),
        NULLIF(TRIM(ls.ifsc_code), ''),
        (SELECT NULLIF(TRIM(ifsc_code), '') FROM loan_applications la_sub WHERE (la_sub.application_id = rs.application_id OR la_sub.id = rs.lead_id OR la_sub.application_id = lap.application_id OR la_sub.id = lap.lead_id) AND la_sub.ifsc_code IS NOT NULL AND la_sub.ifsc_code <> '' ORDER BY la_sub.id DESC LIMIT 1)
      ) AS ifscCode,
      COALESCE(
        (SELECT NULLIF(TRIM(bank_name), '') FROM lead_accounting_payments WHERE (bank_name IS NOT NULL AND bank_name <> '') AND (loan_id = l.id OR loan_id = TRIM(LEADING 'LN' FROM l.id)) ORDER BY id DESC LIMIT 1),
        (SELECT NULLIF(TRIM(bank_name), '') FROM lead_accounting_payments WHERE (bank_name IS NOT NULL AND bank_name <> '') AND (rs.lead_id IS NOT NULL AND lead_id = rs.lead_id) ORDER BY id DESC LIMIT 1),
        NULLIF(TRIM(ls.bank_name), ''),
        (SELECT NULLIF(TRIM(bank_name), '') FROM loan_applications la_sub WHERE (la_sub.application_id = rs.application_id OR la_sub.id = rs.lead_id OR la_sub.application_id = lap.application_id OR la_sub.id = lap.lead_id) AND la_sub.bank_name IS NOT NULL AND la_sub.bank_name <> '' ORDER BY la_sub.id DESC LIMIT 1)
      ) AS bankName,
      DATE_FORMAT(l.due_date, '%Y-%m-%d') AS dueDate, l.status, l.payment_status AS paymentStatus,
      DATE_FORMAT(l.next_payment_date, '%Y-%m-%d') AS nextPaymentDate, l.next_payment_amount AS nextPaymentAmount,
      l.created_at AS createdAt, l.updated_at AS updatedAt,
      COALESCE(
        (
          SELECT MAX(received_at)
          FROM loan_repayments r
          WHERE (r.loan_id = l.id OR r.loan_id = TRIM(LEADING 'LN' FROM l.id) OR r.loan_id = CONCAT('LN', TRIM(LEADING 'LN' FROM l.id)))
            AND r.status IN ('received', 'success', 'paid', 'settled')
        ),
        (
          SELECT MAX(created_at)
          FROM loan_repayments r2
          WHERE (r2.loan_id = l.id OR r2.loan_id = TRIM(LEADING 'LN' FROM l.id) OR r2.loan_id = CONCAT('LN', TRIM(LEADING 'LN' FROM l.id)))
            AND r2.status IN ('received', 'success', 'paid', 'settled')
        )
      ) AS lastPaymentDate,
      COALESCE(
        (SELECT NULLIF(TRIM(reference), '') FROM lead_accounting_payments WHERE (reference IS NOT NULL AND reference <> '') AND (loan_id = l.id OR loan_id = TRIM(LEADING 'LN' FROM l.id)) ORDER BY id DESC LIMIT 1),
        (SELECT NULLIF(TRIM(transaction_id), '') FROM lead_accounting_payments WHERE (transaction_id IS NOT NULL AND transaction_id <> '') AND (loan_id = l.id OR loan_id = TRIM(LEADING 'LN' FROM l.id)) ORDER BY id DESC LIMIT 1),
        (SELECT NULLIF(TRIM(reference), '') FROM lead_accounting_payments WHERE (reference IS NOT NULL AND reference <> '') AND (rs.lead_id IS NOT NULL AND lead_id = rs.lead_id) ORDER BY id DESC LIMIT 1),
        (SELECT NULLIF(TRIM(transaction_id), '') FROM lead_accounting_payments WHERE (transaction_id IS NOT NULL AND transaction_id <> '') AND (rs.lead_id IS NOT NULL AND lead_id = rs.lead_id) ORDER BY id DESC LIMIT 1)
      ) AS utrNumber,
      COALESCE(
        (SELECT NULLIF(TRIM(COALESCE(transfer_type, method)), '') FROM lead_accounting_payments WHERE (transfer_type IS NOT NULL OR method IS NOT NULL) AND (loan_id = l.id OR loan_id = TRIM(LEADING 'LN' FROM l.id)) ORDER BY id DESC LIMIT 1),
        (SELECT NULLIF(TRIM(COALESCE(transfer_type, method)), '') FROM lead_accounting_payments WHERE (transfer_type IS NOT NULL OR method IS NOT NULL) AND (rs.lead_id IS NOT NULL AND lead_id = rs.lead_id) ORDER BY id DESC LIMIT 1)
      ) AS transferType,
      COALESCE(ls.processing_fee, ROUND(l.principal * 0.10)) AS processingFee,
      COALESCE(ls.gst_amount, ROUND(l.principal * 0.10 * 0.18)) AS gstAmount,
      COALESCE(ls.repayment_amount, ROUND(l.principal * 1.12)) AS repaymentAmount,
      (COALESCE(ls.repayment_amount, ROUND(l.principal * 1.12)) - l.principal) AS interestAmount,
      COALESCE(ls.agreement_number, l.id) AS agreementNumber
    FROM loans l
    LEFT JOIN customers c ON c.id = l.customer_id
    LEFT JOIN loan_repayment_schedule rs ON rs.installment_number = 1 AND rs.loan_id = l.id
    LEFT JOIN (
      SELECT loan_id, MAX(lead_id) AS lead_id, MAX(application_id) AS application_id
      FROM lead_accounting_payments
      WHERE loan_id IS NOT NULL
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
          OR sub.agreement_number = l.id
        )
      ORDER BY 
        (sub.agreement_number = TRIM(LEADING 'LN' FROM l.id)) DESC,
        sub.created_at DESC,
        sub.id DESC
      LIMIT 1
    )
    ${whereClause}
    ORDER BY COALESCE(l.start_date, l.created_at) DESC, l.id DESC
    LIMIT ? OFFSET ?
  `, queryParams);

  if (!loans || loans.length === 0) {
    const emptyResult = [];
    emptyResult.loans = [];
    emptyResult.total = total;
    emptyResult.page = parsedPage;
    emptyResult.limit = parsedLimit;
    emptyResult.totalPages = Math.ceil(total / parsedLimit);
    return emptyResult;
  }

  // Fetch repayments ONLY for the current paginated loans
  const loanIds = loans.map((l) => l.id).filter(Boolean);
  const loanIdPlaceholders = loanIds.map(() => '?').join(',');
  const repayments = loanIds.length
    ? await query(`
        SELECT loan_id, amount, received_at 
        FROM loan_repayments 
        WHERE status = 'received' AND loan_id IN (${loanIdPlaceholders})
        ORDER BY loan_id, received_at ASC, id ASC
      `, loanIds)
    : [];

  const repaymentsByLoan = {};
  repayments.forEach(r => {
    if (!repaymentsByLoan[r.loan_id]) {
      repaymentsByLoan[r.loan_id] = [];
    }
    repaymentsByLoan[r.loan_id].push(r);
  });

  const getLocalDate = (dStr) => {
    if (!dStr) return '';
    const d = new Date(dStr);
    const offset = 330;
    const localTime = d.getTime() + (offset * 60 * 1000);
    return new Date(localTime).toISOString().slice(0, 10);
  };
  
  const today = getLocalDate(new Date().toISOString());
  const currentMonthStr = new Date().toISOString().slice(0, 7);

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
    
    const startStr = getLocalDate(l.startDate);
    const npStr = getLocalDate(l.nextPaymentDate);
    const dueStr = getLocalDate(l.dueDate);
    if (!l.nextPaymentDate || npStr === startStr || (Number(l.amountPaid || 0) === 0 && npStr < dueStr)) {
      l.nextPaymentDate = l.dueDate;
    }

    l.utrNumber = l.utrNumber || l.transactionId || l.disbursementUtr || null;
    l.transactionId = l.utrNumber;
    l.disbursementUtr = l.utrNumber;
    l.disbursedDate = l.disbursedDate || l.startDate || null;
    l.accountNumber = l.accountNumber || null;
    l.ifscCode = l.ifscCode || null;
    l.bankName = l.bankName || null;

    l.todayRoi = todayRoi;
    l.monthRoi = monthRoi;
    l.totalRoi = totalRoi;
    l.repayments = reps.map(r => ({
      amount: Number(r.amount || 0),
      receivedAt: r.received_at
    }));
  });

  loans.total = total;
  loans.page = parsedPage;
  loans.limit = parsedLimit;
  loans.totalPages = Math.ceil(total / parsedLimit);

  loansListCache.set(cacheKey, { data: loans, timestamp: Date.now() });
  return loans;
}

async function findById(id) {
  const rows = await query(`
    SELECT
      l.id, c.name AS customer, l.customer_id AS customerId, l.principal, l.interest_rate AS interestRate,
      l.total_amount AS totalAmount,
      COALESCE(
        (
          SELECT SUM(r.amount)
          FROM loan_repayments r
          WHERE (
            r.loan_id = l.id
            OR TRIM(LEADING 'LN' FROM REPLACE(REPLACE(REPLACE(UPPER(r.loan_id), ' ', ''), '-', ''), '_', '')) = TRIM(LEADING 'LN' FROM REPLACE(REPLACE(REPLACE(UPPER(l.id), ' ', ''), '-', ''), '_', ''))
          ) AND r.status IN ('received', 'success', 'paid', 'settled')
        ),
        0
      ) AS amountPaid,
      l.balance,
      COALESCE(
        (SELECT DATE(COALESCE(disbursed_at, paid_at)) FROM lead_accounting_payments WHERE (disbursed_at IS NOT NULL OR paid_at IS NOT NULL) AND (TRIM(loan_id) = TRIM(l.id) OR UPPER(TRIM(loan_id)) = UPPER(TRIM(l.id))) ORDER BY id DESC LIMIT 1),
        (SELECT DATE(COALESCE(disbursed_at, paid_at)) FROM lead_accounting_payments WHERE (disbursed_at IS NOT NULL OR paid_at IS NOT NULL) AND (rs.lead_id IS NOT NULL AND lead_id = rs.lead_id) ORDER BY id DESC LIMIT 1),
        (SELECT DATE(COALESCE(sub.disbursement_date, sub.created_at)) FROM lead_sanctions sub WHERE sub.id = ls.id),
        (SELECT DATE(la_sub.created_at) FROM loan_applications la_sub WHERE la_sub.application_id = rs.application_id OR la_sub.id = rs.lead_id LIMIT 1),
        DATE(l.start_date),
        DATE(l.created_at),
        NULL
      ) AS startDate,
      COALESCE(
        (SELECT DATE(COALESCE(disbursed_at, paid_at)) FROM lead_accounting_payments WHERE (disbursed_at IS NOT NULL OR paid_at IS NOT NULL) AND (TRIM(loan_id) = TRIM(l.id) OR UPPER(TRIM(loan_id)) = UPPER(TRIM(l.id))) ORDER BY id DESC LIMIT 1),
        (SELECT DATE(COALESCE(disbursed_at, paid_at)) FROM lead_accounting_payments WHERE (disbursed_at IS NOT NULL OR paid_at IS NOT NULL) AND (rs.lead_id IS NOT NULL AND lead_id = rs.lead_id) ORDER BY id DESC LIMIT 1),
        (SELECT DATE(COALESCE(sub.disbursement_date, sub.created_at)) FROM lead_sanctions sub WHERE sub.id = ls.id),
        (SELECT DATE(la_sub.created_at) FROM loan_applications la_sub WHERE la_sub.application_id = rs.application_id OR la_sub.id = rs.lead_id LIMIT 1),
        DATE(l.start_date),
        DATE(l.created_at),
        NULL
      ) AS disbursedDate,
      COALESCE(
        (SELECT NULLIF(TRIM(account_number), '') FROM lead_accounting_payments WHERE (account_number IS NOT NULL AND account_number <> '') AND (TRIM(loan_id) = TRIM(l.id) OR UPPER(TRIM(loan_id)) = UPPER(TRIM(l.id))) ORDER BY id DESC LIMIT 1),
        (SELECT NULLIF(TRIM(account_number), '') FROM lead_accounting_payments WHERE (account_number IS NOT NULL AND account_number <> '') AND (rs.lead_id IS NOT NULL AND lead_id = rs.lead_id) ORDER BY id DESC LIMIT 1),
        NULLIF(TRIM(ls.account_number), ''),
        (SELECT NULLIF(TRIM(account_number), '') FROM loan_applications la_sub WHERE (la_sub.application_id = rs.application_id OR la_sub.id = rs.lead_id OR la_sub.application_id = lap.application_id OR la_sub.id = lap.lead_id) AND la_sub.account_number IS NOT NULL AND la_sub.account_number <> '' ORDER BY la_sub.id DESC LIMIT 1)
      ) AS accountNumber,
      COALESCE(
        (SELECT NULLIF(TRIM(ifsc_code), '') FROM lead_accounting_payments WHERE (ifsc_code IS NOT NULL AND ifsc_code <> '') AND (TRIM(loan_id) = TRIM(l.id) OR UPPER(TRIM(loan_id)) = UPPER(TRIM(l.id))) ORDER BY id DESC LIMIT 1),
        (SELECT NULLIF(TRIM(ifsc_code), '') FROM lead_accounting_payments WHERE (ifsc_code IS NOT NULL AND ifsc_code <> '') AND (rs.lead_id IS NOT NULL AND lead_id = rs.lead_id) ORDER BY id DESC LIMIT 1),
        NULLIF(TRIM(ls.ifsc_code), ''),
        (SELECT NULLIF(TRIM(ifsc_code), '') FROM loan_applications la_sub WHERE (la_sub.application_id = rs.application_id OR la_sub.id = rs.lead_id OR la_sub.application_id = lap.application_id OR la_sub.id = lap.lead_id) AND la_sub.ifsc_code IS NOT NULL AND la_sub.ifsc_code <> '' ORDER BY la_sub.id DESC LIMIT 1)
      ) AS ifscCode,
      COALESCE(
        (SELECT NULLIF(TRIM(bank_name), '') FROM lead_accounting_payments WHERE (bank_name IS NOT NULL AND bank_name <> '') AND (TRIM(loan_id) = TRIM(l.id) OR UPPER(TRIM(loan_id)) = UPPER(TRIM(l.id))) ORDER BY id DESC LIMIT 1),
        (SELECT NULLIF(TRIM(bank_name), '') FROM lead_accounting_payments WHERE (bank_name IS NOT NULL AND bank_name <> '') AND (rs.lead_id IS NOT NULL AND lead_id = rs.lead_id) ORDER BY id DESC LIMIT 1),
        NULLIF(TRIM(ls.bank_name), ''),
        (SELECT NULLIF(TRIM(bank_name), '') FROM loan_applications la_sub WHERE (la_sub.application_id = rs.application_id OR la_sub.id = rs.lead_id OR la_sub.application_id = lap.application_id OR la_sub.id = lap.lead_id) AND la_sub.bank_name IS NOT NULL AND la_sub.bank_name <> '' ORDER BY la_sub.id DESC LIMIT 1)
      ) AS bankName,
      DATE_FORMAT(l.due_date, '%Y-%m-%d') AS dueDate, l.status, l.payment_status AS paymentStatus,
      DATE_FORMAT(l.next_payment_date, '%Y-%m-%d') AS nextPaymentDate, l.next_payment_amount AS nextPaymentAmount,
      c.email AS customerEmail, c.phone AS customerPhone, c.credit_score AS customerCreditScore,
      l.created_at AS createdAt, l.updated_at AS updatedAt,
      COALESCE(
        (
          SELECT MAX(received_at)
          FROM loan_repayments r
          WHERE (r.loan_id = l.id OR r.loan_id = TRIM(LEADING 'LN' FROM l.id) OR r.loan_id = CONCAT('LN', TRIM(LEADING 'LN' FROM l.id)))
            AND r.status IN ('received', 'success', 'paid', 'settled')
        ),
        (
          SELECT MAX(created_at)
          FROM loan_repayments r2
          WHERE (r2.loan_id = l.id OR r2.loan_id = TRIM(LEADING 'LN' FROM l.id) OR r2.loan_id = CONCAT('LN', TRIM(LEADING 'LN' FROM l.id)))
            AND r2.status IN ('received', 'success', 'paid', 'settled')
        )
      ) AS lastPaymentDate,
      COALESCE(
        (SELECT NULLIF(TRIM(reference), '') FROM lead_accounting_payments WHERE (reference IS NOT NULL AND reference <> '') AND (TRIM(loan_id) = TRIM(l.id) OR UPPER(TRIM(loan_id)) = UPPER(TRIM(l.id))) ORDER BY id DESC LIMIT 1),
        (SELECT NULLIF(TRIM(transaction_id), '') FROM lead_accounting_payments WHERE (transaction_id IS NOT NULL AND transaction_id <> '') AND (TRIM(loan_id) = TRIM(l.id) OR UPPER(TRIM(loan_id)) = UPPER(TRIM(l.id))) ORDER BY id DESC LIMIT 1),
        (SELECT NULLIF(TRIM(reference), '') FROM lead_accounting_payments WHERE (reference IS NOT NULL AND reference <> '') AND (rs.lead_id IS NOT NULL AND lead_id = rs.lead_id) ORDER BY id DESC LIMIT 1),
        (SELECT NULLIF(TRIM(transaction_id), '') FROM lead_accounting_payments WHERE (transaction_id IS NOT NULL AND transaction_id <> '') AND (rs.lead_id IS NOT NULL AND lead_id = rs.lead_id) ORDER BY id DESC LIMIT 1)
      ) AS utrNumber,
      COALESCE(
        (SELECT NULLIF(TRIM(COALESCE(transfer_type, method)), '') FROM lead_accounting_payments WHERE (transfer_type IS NOT NULL OR method IS NOT NULL) AND (TRIM(loan_id) = TRIM(l.id) OR UPPER(TRIM(loan_id)) = UPPER(TRIM(l.id))) ORDER BY id DESC LIMIT 1),
        (SELECT NULLIF(TRIM(COALESCE(transfer_type, method)), '') FROM lead_accounting_payments WHERE (transfer_type IS NOT NULL OR method IS NOT NULL) AND (rs.lead_id IS NOT NULL AND lead_id = rs.lead_id) ORDER BY id DESC LIMIT 1)
      ) AS transferType,
      COALESCE(ls.processing_fee, ROUND(l.principal * 0.10)) AS processingFee,
      COALESCE(ls.gst_amount, ROUND(l.principal * 0.10 * 0.18)) AS gstAmount,
      COALESCE(ls.repayment_amount, ROUND(l.principal * 1.12)) AS repaymentAmount,
      (COALESCE(ls.repayment_amount, ROUND(l.principal * 1.12)) - l.principal) AS interestAmount,
      COALESCE(ls.agreement_number, l.id) AS agreementNumber
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
    WHERE l.id = ?
  `, [id]);

  if (!rows.length) return null;
  const l = rows[0];

  const repayments = await query(`
    SELECT amount, received_at 
    FROM loan_repayments 
    WHERE loan_id = ? AND status = 'received' 
    ORDER BY received_at ASC, id ASC
  `, [id]);

  const principal = Number(l.principal || 0);
  let cumulativePaid = 0;
  let todayRoi = 0;
  let monthRoi = 0;
  let totalRoi = 0;

  const getLocalDate = (dStr) => {
    if (!dStr) return '';
    const d = new Date(dStr);
    const offset = 330;
    const localTime = d.getTime() + (offset * 60 * 1000);
    return new Date(localTime).toISOString().slice(0, 10);
  };
  
  const today = getLocalDate(new Date().toISOString());
  const currentMonthStr = new Date().toISOString().slice(0, 7);

  repayments.forEach(r => {
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

  const startStr = getLocalDate(l.startDate);
  const npStr = getLocalDate(l.nextPaymentDate);
  const dueStr = getLocalDate(l.dueDate);
  if (!l.nextPaymentDate || npStr === startStr || (Number(l.amountPaid || 0) === 0 && npStr < dueStr)) {
    l.nextPaymentDate = l.dueDate;
  }

  l.utrNumber = l.utrNumber || l.transactionId || l.disbursementUtr || null;
  l.transactionId = l.utrNumber;
  l.disbursementUtr = l.utrNumber;
  l.disbursedDate = l.disbursedDate || l.startDate || null;
  l.accountNumber = l.accountNumber || null;
  l.ifscCode = l.ifscCode || null;
  l.bankName = l.bankName || null;

  l.todayRoi = todayRoi;
  l.monthRoi = monthRoi;
  l.totalRoi = totalRoi;
  l.repayments = repayments.map(r => ({
    amount: Number(r.amount || 0),
    receivedAt: r.received_at
  }));

  return l;
}

module.exports = { findAll, findById, invalidateLoansCache };
