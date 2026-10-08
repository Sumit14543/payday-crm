const { query } = require('../config/db');
const { likeParams } = require('../utils/strings');

// 15-second In-Memory Cache for loans list queries
const loansListCache = new Map();
const LOANS_CACHE_TTL_MS = 15 * 1000;

function invalidateLoansCache() {
  loansListCache.clear();
}

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
  'Uttarakhand', 'West Bengal', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Chandigarh',
  'Puducherry', 'Andaman and Nicobar', 'Dadra and Nagar Haveli', 'Daman and Diu', 'Lakshadweep'
];

function cleanStr(val) {
  if (val === null || val === undefined) return '';
  const s = String(val).trim();
  return (s === 'null' || s === 'undefined' || s === '-') ? '' : s;
}

function cleanPhone(val) {
  const digits = String(val || '').replace(/\D/g, '');
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

function parseJsonSafe(val) {
  if (!val) return null;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
}

function normalizePanString(val) {
  if (!val) return '';
  const clean = String(val).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return clean.length >= 10 ? clean.slice(0, 10) : clean;
}

function normalizeDobString(val) {
  if (!val) return '';
  const s = String(val).trim();
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD-MM-YYYY or DD/MM/YYYY
  if (/^(\d{2})[-/](\d{2})[-/](\d{4})$/.test(s)) {
    const parts = s.split(/[-/]/);
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  // YYYY/MM/DD
  if (/^(\d{4})[-/](\d{2})[-/](\d{2})$/.test(s)) {
    const parts = s.split(/[-/]/);
    return `${parts[0]}-${parts[1]}-${parts[2]}`;
  }
  // Date parseable
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return s;
}

function extractStateFromAddress(addr) {
  if (!addr) return '';
  const str = String(addr);
  for (const st of INDIAN_STATES) {
    const reg = new RegExp(`\\b${st}\\b`, 'i');
    if (reg.test(str)) return st;
  }
  return '';
}

function extractPincodeFromAddress(addr) {
  if (!addr) return '';
  const match = String(addr).match(/\b(\d{6})\b/);
  return match ? match[1] : '';
}

function extractCityFromAddress(addr) {
  if (!addr) return '';
  const parts = String(addr).split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length >= 3) {
    // Usually city is the 2nd to last or 3rd to last item before state and pin
    const candidate = parts[parts.length - 2].replace(/\d+/g, '').trim();
    if (candidate && candidate.length < 30) return candidate;
  }
  return '';
}

function extractPanFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return '';
  return normalizePanString(
    payload.pan ||
    payload.panNumber ||
    payload.pan_number ||
    payload.pancard ||
    payload.panCard ||
    payload.borrowerPan ||
    payload.borrower_pan ||
    payload.income_tax_pan ||
    payload.personalDetails?.pan ||
    payload.personalDetails?.panNumber ||
    payload.personalDetails?.pan_number ||
    payload.borrower?.pan ||
    payload.documents?.panNumber ||
    payload.kyc?.panNumber
  );
}

function extractDobFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return '';
  return normalizeDobString(
    payload.dob ||
    payload.dateOfBirth ||
    payload.date_of_birth ||
    payload.birthDate ||
    payload.birth_date ||
    payload.personalDetails?.dob ||
    payload.personalDetails?.dateOfBirth ||
    payload.borrower?.dob ||
    payload.kyc?.dob ||
    payload.poi?.dob
  );
}

function extractIncomeFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return 0;
  const inc = payload.monthly_income ||
    payload.monthlyIncome ||
    payload.monthly_salary ||
    payload.net_monthly_income ||
    payload.salary ||
    payload.income ||
    payload.inhandSalary ||
    payload.inhand_salary ||
    payload.employmentDetails?.monthlyIncome ||
    payload.employmentDetails?.salary ||
    payload.employment?.monthlyIncome;
  return Number(inc || 0);
}

function extractGenderFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const g = cleanStr(
    payload.gender ||
    payload.sex ||
    payload.personalDetails?.gender ||
    payload.borrower?.gender ||
    payload.poi?.gender
  );
  if (!g) return '';
  if (/^m/i.test(g)) return 'Male';
  if (/^f/i.test(g)) return 'Female';
  return g;
}

function getLocalDate(dStr) {
  if (!dStr) return '';
  const d = new Date(dStr);
  if (Number.isNaN(d.getTime())) return '';
  const offset = 330; // UTC+5:30 in minutes
  const localTime = d.getTime() + (offset * 60 * 1000);
  return new Date(localTime).toISOString().slice(0, 10);
}

// Batch enrichment function across all related tables
async function enrichLoansBatch(loans) {
  if (!loans || loans.length === 0) return;

  // 1. Initial local extraction from payload columns already selected
  loans.forEach(l => {
    // Composite loan id unpack: "116392247/WAQTMN270/SHANUKU"
    if (String(l.id || '').includes('/')) {
      const parts = String(l.id).split('/');
      if (!l.leadId && parts[0]) l.leadId = parts[0];
      if (!l.loanNo || l.loanNo === l.id) l.loanNo = parts[1] || l.id;
      if (!l.customer && parts[2]) l.customer = parts[2];
      if (!l.customerName && parts[2]) l.customerName = parts[2];
    }

    const payload = parseJsonSafe(l.sourcePayload);
    const aadhaarRaw = parseJsonSafe(l.aadhaarRawResponse);
    const cibilRaw = parseJsonSafe(l.cibilRawResponse);
    const cibilAnalysis = parseJsonSafe(l.cibilAnalysisJson);

    // PAN Number
    if (!cleanStr(l.panNumber)) {
      l.panNumber = extractPanFromPayload(payload) ||
        normalizePanString(cibilRaw?.pan || cibilRaw?.pan_number || cibilRaw?.PAN_Number) ||
        normalizePanString(cibilAnalysis?.pan || cibilAnalysis?.pan_number || cibilAnalysis?.PAN_Number || cibilAnalysis?.personalDetails?.pan) ||
        normalizePanString(aadhaarRaw?.pan || aadhaarRaw?.pan_number);
    } else {
      l.panNumber = normalizePanString(l.panNumber);
    }

    // DOB
    if (!cleanStr(l.dob)) {
      l.dob = extractDobFromPayload(payload) ||
        normalizeDobString(aadhaarRaw?.dob || aadhaarRaw?.dateOfBirth || aadhaarRaw?.poi?.dob) ||
        normalizeDobString(cibilRaw?.dob || cibilRaw?.dateOfBirth || cibilAnalysis?.personalDetails?.dob);
    } else {
      l.dob = normalizeDobString(l.dob);
    }

    // Monthly Income
    if (!Number(l.monthlyIncome || 0)) {
      l.monthlyIncome = extractIncomeFromPayload(payload) ||
        Number(cibilAnalysis?.monthlyIncome || cibilAnalysis?.inhandSalary || 0);
    } else {
      l.monthlyIncome = Number(l.monthlyIncome);
    }

    // Email
    if (!cleanStr(l.email)) {
      l.email = cleanStr(payload?.email || payload?.personalDetails?.email || payload?.office_email || cibilAnalysis?.personalDetails?.email);
    }

    // Mobile
    if (!cleanStr(l.mobile)) {
      l.mobile = cleanStr(payload?.mobile || payload?.phone || payload?.personalDetails?.mobile || payload?.borrower?.phone);
    }

    // Alternative Number
    if (!cleanStr(l.alternativeNumber)) {
      l.alternativeNumber = cleanStr(
        payload?.reference1_mobile ||
        payload?.reference2_mobile ||
        payload?.references?.[0]?.mobile ||
        payload?.primaryReference?.mobile ||
        payload?.secondaryReference?.mobile
      );
    }

    // Gender
    if (!cleanStr(l.gender)) {
      l.gender = extractGenderFromPayload(payload) ||
        extractGenderFromPayload(aadhaarRaw) ||
        extractGenderFromPayload(cibilRaw);
    }

    // Address & Location
    if (!cleanStr(l.address)) {
      l.address = cleanStr(
        payload?.address ||
        payload?.currentAddress ||
        payload?.permanentAddress ||
        aadhaarRaw?.address ||
        aadhaarRaw?.poa?.address
      );
    }

    if (!cleanStr(l.city)) {
      l.city = cleanStr(
        payload?.city ||
        aadhaarRaw?.dist ||
        aadhaarRaw?.vtc ||
        aadhaarRaw?.city ||
        extractCityFromAddress(l.address)
      );
    }

    if (!cleanStr(l.pincode)) {
      l.pincode = cleanStr(
        payload?.pincode ||
        payload?.pinCode ||
        aadhaarRaw?.pc ||
        aadhaarRaw?.pincode ||
        extractPincodeFromAddress(l.address)
      );
    }

    if (!cleanStr(l.stateName) || l.stateName === '-') {
      l.stateName = cleanStr(
        payload?.state ||
        payload?.stateName ||
        aadhaarRaw?.state ||
        extractStateFromAddress(l.address) ||
        'Delhi'
      );
    }

    // House Type
    if (!cleanStr(l.houseType) || l.houseType === 'Owned') {
      l.houseType = cleanStr(
        payload?.property_type ||
        payload?.propertyType ||
        payload?.houseType ||
        payload?.residenceType ||
        'Owned'
      );
    }
  });

  // 2. Fallback secondary batch query if any loan is still missing crucial fields
  const missingLoans = loans.filter(l => (
    !cleanStr(l.email) ||
    !cleanStr(l.mobile) ||
    !cleanStr(l.dob) ||
    !cleanStr(l.panNumber) ||
    !Number(l.monthlyIncome || 0)
  ));

  if (missingLoans.length > 0) {
    const candidateLeadIds = new Set();
    const candidateAppIds = new Set();
    const candidatePhones = new Set();
    const candidateNames = new Set();

    missingLoans.forEach(l => {
      if (cleanStr(l.leadId)) candidateLeadIds.add(String(l.leadId).trim());
      if (cleanStr(l.customerId)) {
        const rawCus = String(l.customerId).trim();
        candidateLeadIds.add(rawCus);
        const strippedCus = rawCus.replace(/^CUS/i, '').trim();
        if (strippedCus) candidateLeadIds.add(strippedCus);
      }
      if (cleanStr(l.id)) {
        const rawId = String(l.id).trim();
        candidateAppIds.add(rawId);
        const strippedLn = rawId.replace(/^LN/i, '').trim();
        if (strippedLn) candidateAppIds.add(strippedLn);
        if (rawId.includes('/')) {
          const parts = rawId.split('/');
          if (parts[0]) candidateLeadIds.add(parts[0]);
          if (parts[1]) candidateAppIds.add(parts[1]);
        }
      }
      if (cleanStr(l.loanNo)) candidateAppIds.add(String(l.loanNo).trim());
      const p = cleanPhone(l.mobile || l.phone || l.customerPhone);
      if (p.length === 10) candidatePhones.add(p);
      if (cleanStr(l.customerName)) candidateNames.add(String(l.customerName).trim().toLowerCase());
      if (cleanStr(l.customer)) candidateNames.add(String(l.customer).trim().toLowerCase());
    });

    const leadIdArr = Array.from(candidateLeadIds).filter(Boolean);
    const appIdArr = Array.from(candidateAppIds).filter(Boolean);
    const phoneArr = Array.from(candidatePhones).filter(Boolean);
    const nameArr = Array.from(candidateNames).filter(Boolean);

    const appConds = [];
    const appParams = [];
    if (leadIdArr.length) {
      appConds.push(`id IN (${leadIdArr.map(() => '?').join(',')})`);
      appParams.push(...leadIdArr);
      appConds.push(`source_lead_id IN (${leadIdArr.map(() => '?').join(',')})`);
      appParams.push(...leadIdArr);
    }
    if (appIdArr.length) {
      appConds.push(`application_id IN (${appIdArr.map(() => '?').join(',')})`);
      appParams.push(...appIdArr);
      appConds.push(`source_application_id IN (${appIdArr.map(() => '?').join(',')})`);
      appParams.push(...appIdArr);
    }
    if (phoneArr.length) {
      appConds.push(`mobile IN (${phoneArr.map(() => '?').join(',')})`);
      appParams.push(...phoneArr);
    }
    if (nameArr.length) {
      appConds.push(`LOWER(TRIM(full_name)) IN (${nameArr.map(() => '?').join(',')})`);
      appParams.push(...nameArr);
    }

    if (appConds.length) {
      try {
        const extraApps = await query(`
          SELECT 
            id, application_id, full_name, mobile, email, dob, pan_number, monthly_income,
            city, pincode, office_address, branch_name, reference1_mobile, reference2_mobile,
            source_lead_id, source_application_id, source_payload, account_number, ifsc_code, bank_name
          FROM loan_applications
          WHERE ${appConds.join(' OR ')}
          ORDER BY id DESC
        `, appParams);

        if (extraApps && extraApps.length > 0) {
          missingLoans.forEach(l => {
            const strippedCus = String(l.customerId || '').replace(/^CUS/i, '').trim();
            const p = cleanPhone(l.mobile || l.phone);
            const lName = String(l.customerName || l.customer || '').trim().toLowerCase();

            // Match against extra applications
            const matchedApp = extraApps.find(app => (
              (cleanStr(l.leadId) && (String(app.id) === String(l.leadId) || String(app.source_lead_id) === String(l.leadId))) ||
              (cleanStr(l.loanNo) && (String(app.application_id) === String(l.loanNo) || String(app.source_application_id) === String(l.loanNo))) ||
              (strippedCus && (String(app.id) === strippedCus || String(app.source_lead_id) === strippedCus)) ||
              (p && cleanPhone(app.mobile) === p) ||
              (lName && String(app.full_name || '').trim().toLowerCase() === lName)
            ));

            if (matchedApp) {
              const extraPayload = parseJsonSafe(matchedApp.source_payload);
              if (!cleanStr(l.panNumber)) {
                l.panNumber = normalizePanString(matchedApp.pan_number) || extractPanFromPayload(extraPayload);
              }
              if (!cleanStr(l.dob)) {
                l.dob = normalizeDobString(matchedApp.dob) || extractDobFromPayload(extraPayload);
              }
              if (!cleanStr(l.email)) {
                l.email = cleanStr(matchedApp.email) || cleanStr(extraPayload?.email);
              }
              if (!cleanStr(l.mobile)) {
                l.mobile = cleanStr(matchedApp.mobile) || cleanStr(extraPayload?.mobile);
              }
              if (!Number(l.monthlyIncome || 0)) {
                l.monthlyIncome = Number(matchedApp.monthly_income || 0) || extractIncomeFromPayload(extraPayload);
              }
              if (!cleanStr(l.city)) {
                l.city = cleanStr(matchedApp.city) || cleanStr(extraPayload?.city);
              }
              if (!cleanStr(l.pincode)) {
                l.pincode = cleanStr(matchedApp.pincode) || cleanStr(extraPayload?.pincode);
              }
              if (!cleanStr(l.alternativeNumber)) {
                l.alternativeNumber = cleanStr(matchedApp.reference1_mobile) || cleanStr(matchedApp.reference2_mobile);
              }
              if (!cleanStr(l.accountNumber)) {
                l.accountNumber = cleanStr(matchedApp.account_number);
              }
              if (!cleanStr(l.ifscCode)) {
                l.ifscCode = cleanStr(matchedApp.ifsc_code);
              }
              if (!cleanStr(l.bankName)) {
                l.bankName = cleanStr(matchedApp.bank_name);
              }
              if (!cleanStr(l.branchName) || l.branchName === 'Head Office') {
                l.branchName = cleanStr(matchedApp.branch_name) || 'Head Office';
              }
            }
          });
        }
      } catch (err) {
        console.error('[LoanModel] Error in secondary fallback loan_applications query:', err.message);
      }
    }
  }

  // 3. Final normalization of all fields for Collection & Disbursement views
  loans.forEach(l => {
    const principal = Number(l.principal || 0);
    l.principal = principal;

    // Financial & admin fee calculations
    const adminFee = Number(l.adminFee || l.processingFee || Math.round(principal * 0.10));
    const adminFeeGst = Number(l.adminFeeGst || l.gstAmount || Math.round(adminFee * 0.18));
    const totalAdminFee = Number(l.totalAdminFee || (adminFee + adminFeeGst));
    const igst = Number(l.igst || adminFeeGst);
    const cgst = Number(l.cgst || Math.round((adminFeeGst / 2) * 100) / 100);
    const sgst = Number(l.sgst || Math.round((adminFeeGst / 2) * 100) / 100);
    const processing = Number(l.processing || adminFee);
    const disbursedAmount = Number(l.disbursedAmount || (principal > totalAdminFee ? principal - totalAdminFee : principal));
    const loanRepayAmount = Number(l.loanRepayAmount || l.repaymentAmount || l.totalAmount || Math.round(principal * 1.12));

    l.adminFee = adminFee;
    l.adminFeeGst = adminFeeGst;
    l.totalAdminFee = totalAdminFee;
    l.igst = igst;
    l.cgst = cgst;
    l.sgst = sgst;
    l.processing = processing;
    l.disbursedAmount = disbursedAmount;
    l.loanRepayAmount = loanRepayAmount;
    l.repaymentAmount = loanRepayAmount;

    // Contact & demographic fallbacks
    l.leadId = cleanStr(l.leadId) || '-';
    l.loanNo = cleanStr(l.loanNo) || l.id;
    l.customerName = cleanStr(l.customerName) || cleanStr(l.customer) || 'Customer';
    l.customer = l.customerName;
    l.email = cleanStr(l.email) || '-';
    l.customerEmail = l.email;
    l.mobile = cleanStr(l.mobile) || cleanStr(l.mobileNumber) || '-';
    l.mobileNumber = l.mobile;
    l.customerPhone = l.mobile;
    l.phone = l.mobile;
    l.panNumber = cleanStr(l.panNumber) || '-';
    l.pan = l.panNumber;
    l.pancard = l.panNumber;
    l.dob = cleanStr(l.dob) || null;
    l.monthlyIncome = Number(l.monthlyIncome || 0);
    l.incomeAmount = l.monthlyIncome;

    l.gender = cleanStr(l.gender) || '-';
    l.alternativeNumber = cleanStr(l.alternativeNumber) || '-';
    l.houseType = cleanStr(l.houseType) || 'Owned';
    l.address = cleanStr(l.address) || '-';
    l.city = cleanStr(l.city) || '-';
    l.cityName = l.city;
    l.stateName = cleanStr(l.stateName) || '-';
    l.state = l.stateName;
    l.pincode = cleanStr(l.pincode) || '-';
    l.branchName = cleanStr(l.branchName) || 'Main Branch';

    // Bank & transaction details
    l.companyBankAccount = '000705001234';
    l.accountNumber = cleanStr(l.accountNumber) || '-';
    l.ifscCode = cleanStr(l.ifscCode) || '-';
    l.bankName = cleanStr(l.bankName) || '-';
    l.utrNumber = cleanStr(l.utrNumber) || null;
    l.transactionId = l.utrNumber;
    l.disbursementUtr = l.utrNumber;
    l.disbursementReference = cleanStr(l.disbursementReference) || l.utrNumber || '-';
    l.modeOfPayment = cleanStr(l.transferType) || 'Bank Transfer';
    l.disbursementStatus = cleanStr(l.disbursementStatus) || 'Disbursed';
    l.repeatType = cleanStr(l.repeatType) || 'Fresh';

    // Dates & personnel
    l.disbursedDate = l.disbursedDate || l.startDate || null;
    l.loanDisbursedDate = l.disbursedDate;
    l.repaymentDate = l.dueDate || null;
    l.leadInitiatedDate = l.leadInitiatedDate || l.createdAt || null;
    l.sanctionDate = l.sanctionDate || l.startDate || null;
    l.sanctionedBy = cleanStr(l.sanctionedBy) || 'Credit Manager';
    l.approvedBy = cleanStr(l.approvedBy) || 'Credit Desk';
    l.disbursedBy = cleanStr(l.disbursedBy) || 'Accountant';
    l.tenure = Number(l.tenure || 30);
    l.roi = Number(l.interestRate || l.roi || 1.0);

    // Collection specific fields
    l.collectedAmount = Number(l.amountPaid || 0);
    l.collectedMode = cleanStr(l.collectedMode) || (l.collectedAmount > 0 ? 'Bank Transfer' : '-');
    l.collectedDate = l.collectedDate || l.lastPaymentDate || null;

    // Clean up large raw payload strings so network responses stay fast
    delete l.sourcePayload;
    delete l.aadhaarRawResponse;
    delete l.cibilRawResponse;
    delete l.cibilAnalysisJson;
  });
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
      l.id,
      COALESCE(NULLIF(TRIM(c.name), ''), NULLIF(TRIM(ls.borrower), ''), NULLIF(TRIM(la.full_name), ''), '') AS customer,
      l.customer_id AS customerId,
      l.principal,
      l.interest_rate AS interestRate,
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
        NULLIF(TRIM(la.account_number), '')
      ) AS accountNumber,
      COALESCE(
        (SELECT NULLIF(TRIM(ifsc_code), '') FROM lead_accounting_payments WHERE (ifsc_code IS NOT NULL AND ifsc_code <> '') AND (loan_id = l.id OR loan_id = TRIM(LEADING 'LN' FROM l.id)) ORDER BY id DESC LIMIT 1),
        (SELECT NULLIF(TRIM(ifsc_code), '') FROM lead_accounting_payments WHERE (ifsc_code IS NOT NULL AND ifsc_code <> '') AND (rs.lead_id IS NOT NULL AND lead_id = rs.lead_id) ORDER BY id DESC LIMIT 1),
        NULLIF(TRIM(ls.ifsc_code), ''),
        NULLIF(TRIM(la.ifsc_code), '')
      ) AS ifscCode,
      COALESCE(
        (SELECT NULLIF(TRIM(bank_name), '') FROM lead_accounting_payments WHERE (bank_name IS NOT NULL AND bank_name <> '') AND (loan_id = l.id OR loan_id = TRIM(LEADING 'LN' FROM l.id)) ORDER BY id DESC LIMIT 1),
        (SELECT NULLIF(TRIM(bank_name), '') FROM lead_accounting_payments WHERE (bank_name IS NOT NULL AND bank_name <> '') AND (rs.lead_id IS NOT NULL AND lead_id = rs.lead_id) ORDER BY id DESC LIMIT 1),
        NULLIF(TRIM(ls.bank_name), ''),
        NULLIF(TRIM(la.bank_name), '')
      ) AS bankName,
      DATE_FORMAT(l.due_date, '%Y-%m-%d') AS dueDate,
      l.status,
      l.payment_status AS paymentStatus,
      DATE_FORMAT(l.next_payment_date, '%Y-%m-%d') AS nextPaymentDate,
      l.next_payment_amount AS nextPaymentAmount,
      l.created_at AS createdAt,
      l.updated_at AS updatedAt,
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
      COALESCE(rs.lead_id, lap.lead_id, ls.lead_id, la.id, la.source_lead_id, '') AS leadId,
      COALESCE(ls.agreement_number, la.application_id, la.source_application_id, l.id) AS loanNo,
      COALESCE(NULLIF(TRIM(c.name), ''), NULLIF(TRIM(ls.borrower), ''), NULLIF(TRIM(la.full_name), ''), '') AS customerName,
      COALESCE(NULLIF(TRIM(c.email), ''), NULLIF(TRIM(la.email), ''), NULLIF(TRIM(ls.borrower_email), ''), NULLIF(TRIM(cib.email), ''), '') AS email,
      COALESCE(NULLIF(TRIM(c.phone), ''), NULLIF(TRIM(la.mobile), ''), NULLIF(TRIM(ls.borrower_phone), ''), NULLIF(TRIM(cib.mobile), ''), NULLIF(TRIM(ar.mobile), ''), '') AS mobile,
      COALESCE(NULLIF(TRIM(la.reference1_mobile), ''), NULLIF(TRIM(la.reference2_mobile), ''), '') AS alternativeNumber,
      COALESCE(NULLIF(TRIM(ar.gender), ''), '') AS gender,
      COALESCE(DATE_FORMAT(la.dob, '%Y-%m-%d'), NULLIF(TRIM(ar.dob), ''), '') AS dob,
      COALESCE(NULLIF(TRIM(la.pan_number), ''), NULLIF(TRIM(cib.pan), ''), '') AS panNumber,
      COALESCE(la.monthly_income, c.monthly_income, 0) AS monthlyIncome,
      COALESCE(NULLIF(TRIM(c.address), ''), NULLIF(TRIM(ar.address), ''), NULLIF(TRIM(la.office_address), ''), '') AS address,
      COALESCE(NULLIF(TRIM(la.pincode), ''), '') AS pincode,
      COALESCE(NULLIF(TRIM(la.city), ''), '') AS city,
      COALESCE(NULLIF(TRIM(la.branch_name), ''), 'Head Office') AS branchName,
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
      ) AS disbursementReference,
      la.source_payload AS sourcePayload,
      ar.raw_response AS aadhaarRawResponse,
      cib.raw_response AS cibilRawResponse,
      cib.analysis_json AS cibilAnalysisJson
    FROM loans l
    LEFT JOIN customers c ON c.id = l.customer_id
    LEFT JOIN loan_repayment_schedule rs ON rs.installment_number = 1 AND (
      rs.loan_id = l.id
      OR rs.loan_id = TRIM(LEADING 'LN' FROM l.id)
      OR CONCAT('LN', rs.loan_id) = l.id
      OR (l.id LIKE '%/%' AND rs.loan_id = SUBSTRING_INDEX(SUBSTRING_INDEX(l.id, '/', 2), '/', -1))
      OR (l.id LIKE '%/%' AND rs.loan_id = SUBSTRING_INDEX(l.id, '/', 1))
    )
    LEFT JOIN (
      SELECT 
        loan_id, 
        MAX(lead_id) AS lead_id, 
        MAX(application_id) AS application_id,
        MAX(amount) AS amount,
        MAX(account_number) AS account_number,
        MAX(ifsc_code) AS ifsc_code,
        MAX(bank_name) AS bank_name,
        MAX(reference) AS reference,
        MAX(transaction_id) AS transaction_id,
        MAX(transfer_type) AS transfer_type,
        MAX(method) AS method,
        MAX(paid_by) AS paid_by,
        MAX(status) AS status,
        MAX(disbursed_at) AS disbursed_at,
        MAX(paid_at) AS paid_at
      FROM lead_accounting_payments
      WHERE loan_id IS NOT NULL AND loan_id <> ''
      GROUP BY loan_id
    ) lap ON (
      lap.loan_id = l.id 
      OR lap.loan_id = TRIM(LEADING 'LN' FROM l.id)
      OR CONCAT('LN', lap.loan_id) = l.id
      OR (l.id LIKE '%/%' AND lap.loan_id = SUBSTRING_INDEX(SUBSTRING_INDEX(l.id, '/', 2), '/', -1))
      OR (l.id LIKE '%/%' AND lap.loan_id = SUBSTRING_INDEX(l.id, '/', 1))
    )
    LEFT JOIN lead_sanctions ls ON ls.id = (
      SELECT sub.id 
      FROM lead_sanctions sub
      WHERE (sub.status = 'sent' OR sub.status IS NOT NULL)
        AND (
          sub.agreement_number = l.id
          OR sub.agreement_number = TRIM(LEADING 'LN' FROM l.id)
          OR CONCAT('LN', sub.agreement_number) = l.id
          OR (l.id LIKE '%/%' AND sub.agreement_number = SUBSTRING_INDEX(SUBSTRING_INDEX(l.id, '/', 2), '/', -1))
          OR (l.id LIKE '%/%' AND sub.lead_id = SUBSTRING_INDEX(l.id, '/', 1))
          OR (rs.lead_id IS NOT NULL AND sub.lead_id = rs.lead_id)
          OR (rs.application_id IS NOT NULL AND sub.application_id = rs.application_id)
          OR (lap.lead_id IS NOT NULL AND sub.lead_id = lap.lead_id)
          OR (lap.application_id IS NOT NULL AND sub.application_id = lap.application_id)
          OR (l.customer_id IS NOT NULL AND sub.lead_id = TRIM(LEADING 'CUS' FROM l.customer_id))
          OR (l.customer_id IS NOT NULL AND sub.lead_id = l.customer_id)
          OR (c.phone IS NOT NULL AND c.phone <> '' AND sub.borrower_phone = c.phone)
          OR (c.email IS NOT NULL AND c.email <> '' AND sub.borrower_email = c.email)
        )
      ORDER BY 
        (sub.agreement_number = TRIM(LEADING 'LN' FROM l.id)) DESC,
        (sub.agreement_number = l.id) DESC,
        (sub.status = 'sent') DESC,
        sub.created_at DESC,
        sub.id DESC
      LIMIT 1
    )
    LEFT JOIN loan_applications la ON la.id = (
      SELECT sub_la.id FROM loan_applications sub_la
      WHERE 
         (sub_la.application_id IS NOT NULL AND sub_la.application_id <> '' AND (
            sub_la.application_id = rs.application_id
            OR sub_la.application_id = lap.application_id
            OR sub_la.application_id = ls.application_id
            OR sub_la.application_id = l.id
            OR sub_la.application_id = TRIM(LEADING 'LN' FROM l.id)
            OR (l.id LIKE '%/%' AND sub_la.application_id = SUBSTRING_INDEX(SUBSTRING_INDEX(l.id, '/', 2), '/', -1))
            OR sub_la.application_id = l.customer_id
            OR sub_la.application_id = TRIM(LEADING 'CUS' FROM l.customer_id)
         ))
         OR (sub_la.id IS NOT NULL AND (
            sub_la.id = rs.lead_id
            OR sub_la.id = lap.lead_id
            OR sub_la.id = ls.lead_id
            OR sub_la.id = TRIM(LEADING 'CUS' FROM l.customer_id)
            OR sub_la.id = l.customer_id
            OR (l.id LIKE '%/%' AND sub_la.id = SUBSTRING_INDEX(l.id, '/', 1))
            OR sub_la.id = TRIM(LEADING 'LN' FROM l.id)
         ))
         OR (sub_la.source_lead_id IS NOT NULL AND sub_la.source_lead_id <> '' AND (
            sub_la.source_lead_id = rs.lead_id
            OR sub_la.source_lead_id = lap.lead_id
            OR sub_la.source_lead_id = ls.lead_id
            OR sub_la.source_lead_id = TRIM(LEADING 'CUS' FROM l.customer_id)
            OR sub_la.source_lead_id = l.customer_id
            OR (l.id LIKE '%/%' AND sub_la.source_lead_id = SUBSTRING_INDEX(l.id, '/', 1))
         ))
         OR (sub_la.source_application_id IS NOT NULL AND sub_la.source_application_id <> '' AND (
            sub_la.source_application_id = rs.application_id
            OR sub_la.source_application_id = lap.application_id
            OR sub_la.source_application_id = ls.application_id
            OR sub_la.source_application_id = TRIM(LEADING 'LN' FROM l.id)
            OR (l.id LIKE '%/%' AND sub_la.source_application_id = SUBSTRING_INDEX(SUBSTRING_INDEX(l.id, '/', 2), '/', -1))
         ))
         OR (c.phone IS NOT NULL AND c.phone <> '' AND sub_la.mobile = c.phone)
         OR (c.email IS NOT NULL AND c.email <> '' AND sub_la.email = c.email)
      ORDER BY 
         (sub_la.application_id = ls.application_id) DESC,
         (sub_la.id = ls.lead_id) DESC,
         sub_la.id DESC
      LIMIT 1
    )
    LEFT JOIN lead_cam_sheets cam ON cam.id = (
      SELECT sub_cam.id FROM lead_cam_sheets sub_cam
      WHERE (ls.cam_sheet_id IS NOT NULL AND sub_cam.id = ls.cam_sheet_id)
         OR (sub_cam.application_id IS NOT NULL AND sub_cam.application_id = COALESCE(rs.application_id, lap.application_id, ls.application_id, la.application_id))
         OR (sub_cam.lead_id IS NOT NULL AND sub_cam.lead_id = CAST(COALESCE(rs.lead_id, lap.lead_id, ls.lead_id, la.id) AS CHAR))
      ORDER BY sub_cam.id DESC LIMIT 1
    )
    LEFT JOIN aadhaar_reports ar ON ar.id = (
      SELECT sub_ar.id FROM aadhaar_reports sub_ar
      WHERE (sub_ar.application_id IS NOT NULL AND sub_ar.application_id = COALESCE(rs.application_id, lap.application_id, ls.application_id, la.application_id))
         OR (sub_ar.lead_id IS NOT NULL AND sub_ar.lead_id = CAST(COALESCE(rs.lead_id, lap.lead_id, ls.lead_id, la.id) AS CHAR))
         OR (c.phone IS NOT NULL AND c.phone <> '' AND sub_ar.mobile = c.phone)
         OR (la.mobile IS NOT NULL AND la.mobile <> '' AND sub_ar.mobile = la.mobile)
      ORDER BY sub_ar.id DESC LIMIT 1
    )
    LEFT JOIN cibil_reports cib ON cib.id = (
      SELECT sub_cib.id FROM cibil_reports sub_cib
      WHERE (sub_cib.application_id IS NOT NULL AND sub_cib.application_id = COALESCE(rs.application_id, lap.application_id, ls.application_id, la.application_id))
         OR (sub_cib.lead_id IS NOT NULL AND sub_cib.lead_id = CAST(COALESCE(rs.lead_id, lap.lead_id, ls.lead_id, la.id) AS CHAR))
         OR (c.phone IS NOT NULL AND c.phone <> '' AND sub_cib.mobile = c.phone)
         OR (la.mobile IS NOT NULL AND la.mobile <> '' AND sub_cib.mobile = la.mobile)
         OR (la.pan_number IS NOT NULL AND la.pan_number <> '' AND sub_cib.pan = la.pan_number)
      ORDER BY sub_cib.id DESC LIMIT 1
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

    l.todayRoi = todayRoi;
    l.monthRoi = monthRoi;
    l.totalRoi = totalRoi;

    const lastRep = reps.length > 0 ? reps[reps.length - 1] : null;
    l.collectedAmount = Number(l.amountPaid || 0);
    l.collectedMode = lastRep?.method || null;
    l.collectedDate = lastRep?.received_at ? getLocalDate(lastRep.received_at) : (l.lastPaymentDate || null);

    l.repayments = reps.map(r => ({
      amount: Number(r.amount || 0),
      receivedAt: r.received_at,
      method: r.method,
    }));
  });

  // Comprehensive multi-source fallback enrichment for all missing fields
  await enrichLoansBatch(loans);

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
      l.id,
      COALESCE(NULLIF(TRIM(c.name), ''), NULLIF(TRIM(ls.borrower), ''), NULLIF(TRIM(la.full_name), ''), '') AS customer,
      l.customer_id AS customerId,
      l.principal,
      l.interest_rate AS interestRate,
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
        NULLIF(TRIM(la.account_number), '')
      ) AS accountNumber,
      COALESCE(
        (SELECT NULLIF(TRIM(ifsc_code), '') FROM lead_accounting_payments WHERE (ifsc_code IS NOT NULL AND ifsc_code <> '') AND (loan_id = l.id OR loan_id = TRIM(LEADING 'LN' FROM l.id)) ORDER BY id DESC LIMIT 1),
        (SELECT NULLIF(TRIM(ifsc_code), '') FROM lead_accounting_payments WHERE (ifsc_code IS NOT NULL AND ifsc_code <> '') AND (rs.lead_id IS NOT NULL AND lead_id = rs.lead_id) ORDER BY id DESC LIMIT 1),
        NULLIF(TRIM(ls.ifsc_code), ''),
        NULLIF(TRIM(la.ifsc_code), '')
      ) AS ifscCode,
      COALESCE(
        (SELECT NULLIF(TRIM(bank_name), '') FROM lead_accounting_payments WHERE (bank_name IS NOT NULL AND bank_name <> '') AND (loan_id = l.id OR loan_id = TRIM(LEADING 'LN' FROM l.id)) ORDER BY id DESC LIMIT 1),
        (SELECT NULLIF(TRIM(bank_name), '') FROM lead_accounting_payments WHERE (bank_name IS NOT NULL AND bank_name <> '') AND (rs.lead_id IS NOT NULL AND lead_id = rs.lead_id) ORDER BY id DESC LIMIT 1),
        NULLIF(TRIM(ls.bank_name), ''),
        NULLIF(TRIM(la.bank_name), '')
      ) AS bankName,
      DATE_FORMAT(l.due_date, '%Y-%m-%d') AS dueDate,
      l.status,
      l.payment_status AS paymentStatus,
      DATE_FORMAT(l.next_payment_date, '%Y-%m-%d') AS nextPaymentDate,
      l.next_payment_amount AS nextPaymentAmount,
      c.email AS customerEmail,
      c.phone AS customerPhone,
      c.credit_score AS customerCreditScore,
      l.created_at AS createdAt,
      l.updated_at AS updatedAt,
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
      COALESCE(rs.lead_id, lap.lead_id, ls.lead_id, la.id, la.source_lead_id, '') AS leadId,
      COALESCE(ls.agreement_number, la.application_id, la.source_application_id, l.id) AS loanNo,
      COALESCE(NULLIF(TRIM(c.name), ''), NULLIF(TRIM(ls.borrower), ''), NULLIF(TRIM(la.full_name), ''), '') AS customerName,
      COALESCE(NULLIF(TRIM(c.email), ''), NULLIF(TRIM(la.email), ''), NULLIF(TRIM(ls.borrower_email), ''), NULLIF(TRIM(cib.email), ''), '') AS email,
      COALESCE(NULLIF(TRIM(c.phone), ''), NULLIF(TRIM(la.mobile), ''), NULLIF(TRIM(ls.borrower_phone), ''), NULLIF(TRIM(cib.mobile), ''), NULLIF(TRIM(ar.mobile), ''), '') AS mobile,
      COALESCE(NULLIF(TRIM(la.reference1_mobile), ''), NULLIF(TRIM(la.reference2_mobile), ''), '') AS alternativeNumber,
      COALESCE(NULLIF(TRIM(ar.gender), ''), '') AS gender,
      COALESCE(DATE_FORMAT(la.dob, '%Y-%m-%d'), NULLIF(TRIM(ar.dob), ''), '') AS dob,
      COALESCE(NULLIF(TRIM(la.pan_number), ''), NULLIF(TRIM(cib.pan), ''), '') AS panNumber,
      COALESCE(la.monthly_income, c.monthly_income, 0) AS monthlyIncome,
      COALESCE(NULLIF(TRIM(c.address), ''), NULLIF(TRIM(ar.address), ''), NULLIF(TRIM(la.office_address), ''), '') AS address,
      COALESCE(NULLIF(TRIM(la.pincode), ''), '') AS pincode,
      COALESCE(NULLIF(TRIM(la.city), ''), '') AS city,
      COALESCE(NULLIF(TRIM(la.branch_name), ''), 'Head Office') AS branchName,
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
      ) AS disbursementReference,
      la.source_payload AS sourcePayload,
      ar.raw_response AS aadhaarRawResponse,
      cib.raw_response AS cibilRawResponse,
      cib.analysis_json AS cibilAnalysisJson
    FROM loans l
    LEFT JOIN customers c ON c.id = l.customer_id
    LEFT JOIN loan_repayment_schedule rs ON rs.installment_number = 1 AND (
      rs.loan_id = l.id
      OR rs.loan_id = TRIM(LEADING 'LN' FROM l.id)
      OR CONCAT('LN', rs.loan_id) = l.id
      OR (l.id LIKE '%/%' AND rs.loan_id = SUBSTRING_INDEX(SUBSTRING_INDEX(l.id, '/', 2), '/', -1))
      OR (l.id LIKE '%/%' AND rs.loan_id = SUBSTRING_INDEX(l.id, '/', 1))
    )
    LEFT JOIN (
      SELECT 
        loan_id, 
        MAX(lead_id) AS lead_id, 
        MAX(application_id) AS application_id,
        MAX(amount) AS amount,
        MAX(account_number) AS account_number,
        MAX(ifsc_code) AS ifsc_code,
        MAX(bank_name) AS bank_name,
        MAX(reference) AS reference,
        MAX(transaction_id) AS transaction_id,
        MAX(transfer_type) AS transfer_type,
        MAX(method) AS method,
        MAX(paid_by) AS paid_by,
        MAX(status) AS status,
        MAX(disbursed_at) AS disbursed_at,
        MAX(paid_at) AS paid_at
      FROM lead_accounting_payments
      WHERE loan_id IS NOT NULL AND loan_id <> ''
      GROUP BY loan_id
    ) lap ON (
      lap.loan_id = l.id 
      OR lap.loan_id = TRIM(LEADING 'LN' FROM l.id)
      OR CONCAT('LN', lap.loan_id) = l.id
      OR (l.id LIKE '%/%' AND lap.loan_id = SUBSTRING_INDEX(SUBSTRING_INDEX(l.id, '/', 2), '/', -1))
      OR (l.id LIKE '%/%' AND lap.loan_id = SUBSTRING_INDEX(l.id, '/', 1))
    )
    LEFT JOIN lead_sanctions ls ON ls.id = (
      SELECT sub.id 
      FROM lead_sanctions sub
      WHERE (sub.status = 'sent' OR sub.status IS NOT NULL)
        AND (
          sub.agreement_number = l.id
          OR sub.agreement_number = TRIM(LEADING 'LN' FROM l.id)
          OR CONCAT('LN', sub.agreement_number) = l.id
          OR (l.id LIKE '%/%' AND sub.agreement_number = SUBSTRING_INDEX(SUBSTRING_INDEX(l.id, '/', 2), '/', -1))
          OR (l.id LIKE '%/%' AND sub.lead_id = SUBSTRING_INDEX(l.id, '/', 1))
          OR (rs.lead_id IS NOT NULL AND sub.lead_id = rs.lead_id)
          OR (rs.application_id IS NOT NULL AND sub.application_id = rs.application_id)
          OR (lap.lead_id IS NOT NULL AND sub.lead_id = lap.lead_id)
          OR (lap.application_id IS NOT NULL AND sub.application_id = lap.application_id)
          OR (l.customer_id IS NOT NULL AND sub.lead_id = TRIM(LEADING 'CUS' FROM l.customer_id))
          OR (l.customer_id IS NOT NULL AND sub.lead_id = l.customer_id)
          OR (c.phone IS NOT NULL AND c.phone <> '' AND sub.borrower_phone = c.phone)
          OR (c.email IS NOT NULL AND c.email <> '' AND sub.borrower_email = c.email)
        )
      ORDER BY 
        (sub.agreement_number = TRIM(LEADING 'LN' FROM l.id)) DESC,
        (sub.agreement_number = l.id) DESC,
        (sub.status = 'sent') DESC,
        sub.created_at DESC,
        sub.id DESC
      LIMIT 1
    )
    LEFT JOIN loan_applications la ON la.id = (
      SELECT sub_la.id FROM loan_applications sub_la
      WHERE 
         (sub_la.application_id IS NOT NULL AND sub_la.application_id <> '' AND (
            sub_la.application_id = rs.application_id
            OR sub_la.application_id = lap.application_id
            OR sub_la.application_id = ls.application_id
            OR sub_la.application_id = l.id
            OR sub_la.application_id = TRIM(LEADING 'LN' FROM l.id)
            OR (l.id LIKE '%/%' AND sub_la.application_id = SUBSTRING_INDEX(SUBSTRING_INDEX(l.id, '/', 2), '/', -1))
            OR sub_la.application_id = l.customer_id
            OR sub_la.application_id = TRIM(LEADING 'CUS' FROM l.customer_id)
         ))
         OR (sub_la.id IS NOT NULL AND (
            sub_la.id = rs.lead_id
            OR sub_la.id = lap.lead_id
            OR sub_la.id = ls.lead_id
            OR sub_la.id = TRIM(LEADING 'CUS' FROM l.customer_id)
            OR sub_la.id = l.customer_id
            OR (l.id LIKE '%/%' AND sub_la.id = SUBSTRING_INDEX(l.id, '/', 1))
            OR sub_la.id = TRIM(LEADING 'LN' FROM l.id)
         ))
         OR (sub_la.source_lead_id IS NOT NULL AND sub_la.source_lead_id <> '' AND (
            sub_la.source_lead_id = rs.lead_id
            OR sub_la.source_lead_id = lap.lead_id
            OR sub_la.source_lead_id = ls.lead_id
            OR sub_la.source_lead_id = TRIM(LEADING 'CUS' FROM l.customer_id)
            OR sub_la.source_lead_id = l.customer_id
            OR (l.id LIKE '%/%' AND sub_la.source_lead_id = SUBSTRING_INDEX(l.id, '/', 1))
         ))
         OR (sub_la.source_application_id IS NOT NULL AND sub_la.source_application_id <> '' AND (
            sub_la.source_application_id = rs.application_id
            OR sub_la.source_application_id = lap.application_id
            OR sub_la.source_application_id = ls.application_id
            OR sub_la.source_application_id = TRIM(LEADING 'LN' FROM l.id)
            OR (l.id LIKE '%/%' AND sub_la.source_application_id = SUBSTRING_INDEX(SUBSTRING_INDEX(l.id, '/', 2), '/', -1))
         ))
         OR (c.phone IS NOT NULL AND c.phone <> '' AND sub_la.mobile = c.phone)
         OR (c.email IS NOT NULL AND c.email <> '' AND sub_la.email = c.email)
      ORDER BY 
         (sub_la.application_id = ls.application_id) DESC,
         (sub_la.id = ls.lead_id) DESC,
         sub_la.id DESC
      LIMIT 1
    )
    LEFT JOIN lead_cam_sheets cam ON cam.id = (
      SELECT sub_cam.id FROM lead_cam_sheets sub_cam
      WHERE (ls.cam_sheet_id IS NOT NULL AND sub_cam.id = ls.cam_sheet_id)
         OR (sub_cam.application_id IS NOT NULL AND sub_cam.application_id = COALESCE(rs.application_id, lap.application_id, ls.application_id, la.application_id))
         OR (sub_cam.lead_id IS NOT NULL AND sub_cam.lead_id = CAST(COALESCE(rs.lead_id, lap.lead_id, ls.lead_id, la.id) AS CHAR))
      ORDER BY sub_cam.id DESC LIMIT 1
    )
    LEFT JOIN aadhaar_reports ar ON ar.id = (
      SELECT sub_ar.id FROM aadhaar_reports sub_ar
      WHERE (sub_ar.application_id IS NOT NULL AND sub_ar.application_id = COALESCE(rs.application_id, lap.application_id, ls.application_id, la.application_id))
         OR (sub_ar.lead_id IS NOT NULL AND sub_ar.lead_id = CAST(COALESCE(rs.lead_id, lap.lead_id, ls.lead_id, la.id) AS CHAR))
         OR (c.phone IS NOT NULL AND c.phone <> '' AND sub_ar.mobile = c.phone)
         OR (la.mobile IS NOT NULL AND la.mobile <> '' AND sub_ar.mobile = la.mobile)
      ORDER BY sub_ar.id DESC LIMIT 1
    )
    LEFT JOIN cibil_reports cib ON cib.id = (
      SELECT sub_cib.id FROM cibil_reports sub_cib
      WHERE (sub_cib.application_id IS NOT NULL AND sub_cib.application_id = COALESCE(rs.application_id, lap.application_id, ls.application_id, la.application_id))
         OR (sub_cib.lead_id IS NOT NULL AND sub_cib.lead_id = CAST(COALESCE(rs.lead_id, lap.lead_id, ls.lead_id, la.id) AS CHAR))
         OR (c.phone IS NOT NULL AND c.phone <> '' AND sub_cib.mobile = c.phone)
         OR (la.mobile IS NOT NULL AND la.mobile <> '' AND sub_cib.mobile = la.mobile)
         OR (la.pan_number IS NOT NULL AND la.pan_number <> '' AND sub_cib.pan = la.pan_number)
      ORDER BY sub_cib.id DESC LIMIT 1
    )
    WHERE l.id = ?
    LIMIT 1
  `, [id]);

  if (!rows.length) return null;
  const l = rows[0];

  const repayments = await query(`
    SELECT amount, received_at, method
    FROM loan_repayments 
    WHERE loan_id = ? AND status IN ('received', 'success', 'paid', 'settled')
    ORDER BY received_at ASC, id ASC
  `, [id]);

  const principal = Number(l.principal || 0);
  let cumulativePaid = 0;
  let todayRoi = 0;
  let monthRoi = 0;
  let totalRoi = 0;

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

  l.todayRoi = todayRoi;
  l.monthRoi = monthRoi;
  l.totalRoi = totalRoi;
  l.repayments = repayments.map(r => ({
    amount: Number(r.amount || 0),
    receivedAt: r.received_at,
    method: r.method,
  }));

  const lastRep = repayments.length > 0 ? repayments[repayments.length - 1] : null;
  l.collectedAmount = Number(l.amountPaid || 0);
  l.collectedMode = lastRep?.method || null;
  l.collectedDate = lastRep?.received_at ? getLocalDate(lastRep.received_at) : (l.lastPaymentDate || null);

  await enrichLoansBatch([l]);

  return l;
}

module.exports = { findAll, findById, invalidateLoansCache };
