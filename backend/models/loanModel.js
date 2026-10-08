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
      DATE_FORMAT(
        COALESCE(
          (SELECT COALESCE(disbursed_at, paid_at) FROM lead_accounting_payments WHERE (disbursed_at IS NOT NULL OR paid_at IS NOT NULL) AND (loan_id = l.id OR loan_id = TRIM(LEADING 'LN' FROM l.id)) ORDER BY id DESC LIMIT 1),
          (SELECT COALESCE(disbursed_at, paid_at) FROM lead_accounting_payments WHERE (disbursed_at IS NOT NULL OR paid_at IS NOT NULL) AND (rs.lead_id IS NOT NULL AND lead_id = rs.lead_id) ORDER BY id DESC LIMIT 1),
          (SELECT COALESCE(sub.disbursement_date, sub.created_at) FROM lead_sanctions sub WHERE sub.id = ls.id),
          (SELECT la_sub.created_at FROM loan_applications la_sub WHERE la_sub.application_id = rs.application_id OR la_sub.id = rs.lead_id LIMIT 1),
          l.start_date,
          l.created_at,
          NULL
        ),
        '%Y-%m-%d'
      ) AS startDate,
      DATE_FORMAT(
        COALESCE(
          (SELECT COALESCE(disbursed_at, paid_at) FROM lead_accounting_payments WHERE (disbursed_at IS NOT NULL OR paid_at IS NOT NULL) AND (loan_id = l.id OR loan_id = TRIM(LEADING 'LN' FROM l.id)) ORDER BY id DESC LIMIT 1),
          (SELECT COALESCE(disbursed_at, paid_at) FROM lead_accounting_payments WHERE (disbursed_at IS NOT NULL OR paid_at IS NOT NULL) AND (rs.lead_id IS NOT NULL AND lead_id = rs.lead_id) ORDER BY id DESC LIMIT 1),
          (SELECT COALESCE(sub.disbursement_date, sub.created_at) FROM lead_sanctions sub WHERE sub.id = ls.id),
          (SELECT la_sub.created_at FROM loan_applications la_sub WHERE la_sub.application_id = rs.application_id OR la_sub.id = rs.lead_id LIMIT 1),
          l.start_date,
          l.created_at,
          NULL
        ),
        '%Y-%m-%d'
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
      COALESCE(ls.agreement_number, l.id) AS agreementNumber,
      COALESCE(rs.lead_id, lap.lead_id, ls.lead_id, '') AS leadId,
      COALESCE(ls.agreement_number, l.id) AS loanNo,
      COALESCE(c.name, ls.borrower, '') AS customerName,
      COALESCE(c.email, ls.borrower_email, '') AS email,
      COALESCE(c.phone, ls.borrower_phone, '') AS mobile,
      COALESCE(la.reference1_mobile, '') AS alternativeNumber,
      COALESCE(ar.gender, '') AS gender,
      DATE_FORMAT(la.dob, '%Y-%m-%d') AS dob,
      COALESCE(la.pan_number, '') AS panNumber,
      COALESCE(la.monthly_income, c.monthly_income, 0) AS monthlyIncome,
      COALESCE(la.property_type, 'Owned') AS houseType,
      COALESCE(c.address, ar.address, la.office_address, '') AS address,
      COALESCE(la.pincode, '') AS pincode,
      COALESCE(la.city, '') AS city,
      COALESCE(la.branch_name, 'Head Office') AS branchName,
      COALESCE(lap.amount, ls.disbursed_amount, l.principal - COALESCE(ls.processing_fee, ROUND(l.principal * 0.10)) - COALESCE(ls.gst_amount, ROUND(l.principal * 0.10 * 0.18))) AS disbursedAmount,
      COALESCE(ls.processing_fee, ROUND(l.principal * 0.10)) AS adminFee,
      COALESCE(ls.gst_amount, ROUND(l.principal * 0.10 * 0.18)) AS adminFeeGst,
      (COALESCE(ls.processing_fee, ROUND(l.principal * 0.10)) + COALESCE(ls.gst_amount, ROUND(l.principal * 0.10 * 0.18))) AS totalAdminFee,
      ROUND(COALESCE(ls.gst_amount, ROUND(l.principal * 0.10 * 0.18)) / 2, 2) AS cgst,
      ROUND(COALESCE(ls.gst_amount, ROUND(l.principal * 0.10 * 0.18)) / 2, 2) AS sgst,
      COALESCE(ls.gst_amount, ROUND(l.principal * 0.10 * 0.18)) AS igst,
      COALESCE(ls.tenure_days, DATEDIFF(l.due_date, l.start_date), 30) AS tenure,
      COALESCE(ls.created_by, 'Credit Manager') AS sanctionedBy,
      COALESCE(cam.decided_by, ls.created_by, 'Credit Desk') AS approvedBy,
      DATE_FORMAT(COALESCE(ls.agreement_date, ls.created_at), '%Y-%m-%d') AS sanctionDate,
      DATE_FORMAT(la.created_at, '%Y-%m-%d') AS leadInitiatedDate,
      COALESCE(
        (SELECT paid_by FROM lead_accounting_payments WHERE (loan_id = l.id OR loan_id = TRIM(LEADING 'LN' FROM l.id)) ORDER BY id DESC LIMIT 1),
        'Accountant'
      ) AS disbursedBy,
      IF(c.total_loans > 1, 'Repeat', 'Fresh') AS repeatType,
      COALESCE(
        (SELECT status FROM lead_accounting_payments WHERE (loan_id = l.id OR loan_id = TRIM(LEADING 'LN' FROM l.id)) ORDER BY id DESC LIMIT 1),
        'Disbursed'
      ) AS disbursementStatus,
      COALESCE(
        (SELECT reference FROM lead_accounting_payments WHERE (loan_id = l.id OR loan_id = TRIM(LEADING 'LN' FROM l.id)) ORDER BY id DESC LIMIT 1),
        (SELECT transaction_id FROM lead_accounting_payments WHERE (loan_id = l.id OR loan_id = TRIM(LEADING 'LN' FROM l.id)) ORDER BY id DESC LIMIT 1),
        ''
      ) AS disbursementReference
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
    LEFT JOIN loan_applications la ON la.id = (
      SELECT sub_la.id FROM loan_applications sub_la
      WHERE (sub_la.application_id = COALESCE(rs.application_id, lap.application_id, ls.application_id) AND sub_la.application_id <> '')
         OR (sub_la.id = CAST(COALESCE(rs.lead_id, lap.lead_id, ls.lead_id) AS CHAR) AND sub_la.id <> 0)
         OR (c.phone IS NOT NULL AND c.phone <> '' AND sub_la.mobile = c.phone)
      ORDER BY sub_la.id DESC LIMIT 1
    )
    LEFT JOIN lead_cam_sheets cam ON cam.id = (
      SELECT sub_cam.id FROM lead_cam_sheets sub_cam
      WHERE (ls.cam_sheet_id IS NOT NULL AND sub_cam.id = ls.cam_sheet_id)
         OR (sub_cam.application_id = COALESCE(rs.application_id, lap.application_id, ls.application_id) AND sub_cam.application_id <> '')
         OR (sub_cam.lead_id = CAST(COALESCE(rs.lead_id, lap.lead_id, ls.lead_id) AS CHAR) AND sub_cam.lead_id <> '')
      ORDER BY sub_cam.id DESC LIMIT 1
    )
    LEFT JOIN aadhaar_reports ar ON ar.id = (
      SELECT sub_ar.id FROM aadhaar_reports sub_ar
      WHERE (sub_ar.application_id = COALESCE(rs.application_id, lap.application_id, ls.application_id) AND sub_ar.application_id <> '')
         OR (sub_ar.lead_id = CAST(COALESCE(rs.lead_id, lap.lead_id, ls.lead_id) AS CHAR) AND sub_ar.lead_id <> '')
         OR (c.phone IS NOT NULL AND c.phone <> '' AND sub_ar.mobile = c.phone)
      ORDER BY sub_ar.id DESC LIMIT 1
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
        SELECT loan_id, amount, received_at, method 
        FROM loan_repayments 
        WHERE status IN ('received', 'success', 'paid', 'settled') AND loan_id IN (${loanIdPlaceholders})
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

    // Collection & Disbursement specific fields
    const lastRep = reps.length > 0 ? reps[reps.length - 1] : null;
    l.collectedAmount = Number(l.amountPaid || 0);
    l.collectedMode = lastRep?.method || null;
    l.collectedDate = lastRep?.received_at ? getLocalDate(lastRep.received_at) : (l.lastPaymentDate || null);

    if (String(l.id || '').includes('/')) {
      const parts = String(l.id).split('/');
      if (!l.leadId && parts[0]) l.leadId = parts[0];
      if (!l.loanNo || l.loanNo === l.id) l.loanNo = parts[1] || l.id;
      if (!l.customer && parts[2]) l.customer = parts[2];
      if (!l.customerName && parts[2]) l.customerName = parts[2];
    }

    l.companyBankAccount = '000705001234';
    l.loanRepayAmount = Number(l.repaymentAmount || l.totalAmount || 0);
    l.stateName = l.stateName || l.state || '-';
    l.cityName = l.cityName || l.city || '-';
    l.mobileNumber = l.mobileNumber || l.mobile || l.phone || '-';
    l.repaymentDate = l.dueDate || null;
    l.modeOfPayment = l.transferType || 'Bank Transfer';
    l.roi = Number(l.interestRate || l.roi || 0);
    l.processing = Number(l.processingFee || l.adminFee || 0);
    l.adminFee = Number(l.adminFee || l.processingFee || 0);
    l.adminFeeGst = Number(l.adminFeeGst || l.gstAmount || 0);
    l.totalAdminFee = Number(l.totalAdminFee || (l.adminFee + l.adminFeeGst) || 0);
    l.loanDisbursedDate = l.disbursedDate || l.startDate || null;

    l.repayments = reps.map(r => ({
      amount: Number(r.amount || 0),
      receivedAt: r.received_at,
      method: r.method,
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
