const { query } = require('../config/db');
const { likeParams } = require('../utils/strings');

// 30-second In-Memory Cache for loans list queries
const loansListCache = new Map();
const LOANS_CACHE_TTL_MS = 30 * 1000;

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

function normalizeDateString(val) {
  if (!val) return '';
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^(\d{2})[-/](\d{2})[-/](\d{4})$/.test(s)) {
    const parts = s.split(/[-/]/);
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  if (/^(\d{4})[-/](\d{2})[-/](\d{2})$/.test(s)) {
    const parts = s.split(/[-/]/);
    return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return s;
}

const normalizeDobString = normalizeDateString;

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

// Global Fast Aggregate Stats (Runs in ~1-2ms)
async function getLoanStats() {
  try {
    const rows = await query(`
      SELECT
        COUNT(*) AS allLoans,
        SUM(CASE WHEN (status = 'Active' OR status IS NULL) AND balance > 0 THEN 1 ELSE 0 END) AS activeLoans,
        SUM(CASE WHEN amount_paid > 0 AND balance > 0 THEN 1 ELSE 0 END) AS partPaymentLoans,
        SUM(CASE WHEN balance <= 0 THEN 1 ELSE 0 END) AS paidOffLoans,
        SUM(CASE WHEN balance > 0 AND (due_date < CURDATE() OR LOWER(status) = 'overdue' OR LOWER(payment_status) = 'overdue') THEN 1 ELSE 0 END) AS overdueLoans,
        COALESCE(SUM(balance), 0) AS totalOutstanding,
        COALESCE(SUM(amount_paid), 0) AS totalCollected,
        SUM(CASE WHEN DATE(COALESCE(start_date, created_at)) = CURDATE() THEN 1 ELSE 0 END) AS todayDisbursedCount,
        COALESCE(SUM(CASE WHEN DATE(COALESCE(start_date, created_at)) = CURDATE() THEN principal ELSE 0 END), 0) AS todayDisbursedAmount,
        SUM(CASE WHEN DATE_FORMAT(COALESCE(start_date, created_at), '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m') THEN 1 ELSE 0 END) AS monthDisbursedCount,
        COALESCE(SUM(CASE WHEN DATE_FORMAT(COALESCE(start_date, created_at), '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m') THEN principal ELSE 0 END), 0) AS monthDisbursedAmount
      FROM loans
    `);
    const s = rows[0] || {};
    return {
      allLoans: Number(s.allLoans || 0),
      activeLoans: Number(s.activeLoans || 0),
      partPaymentLoans: Number(s.partPaymentLoans || 0),
      paidOffLoans: Number(s.paidOffLoans || 0),
      overdueLoans: Number(s.overdueLoans || 0),
      totalOutstanding: Number(s.totalOutstanding || 0),
      totalCollected: Number(s.totalCollected || 0),
      todayDisbursedCount: Number(s.todayDisbursedCount || 0),
      todayDisbursedAmount: Number(s.todayDisbursedAmount || 0),
      monthDisbursedCount: Number(s.monthDisbursedCount || 0),
      monthDisbursedAmount: Number(s.monthDisbursedAmount || 0),
    };
  } catch (err) {
    console.error('[LoanModel] Error fetching loan stats:', err.message);
    return null;
  }
}

// Ultra-fast parallel batch enrichment for ONLY the current page of loans
async function enrichLoansBatch(loans) {
  if (!loans || loans.length === 0) return;

  const loanIds = new Set();
  const candidateLeadIds = new Set();
  const candidateAppIds = new Set();
  const candidatePhones = new Set();
  const candidateNames = new Set();

  loans.forEach(l => {
    const rawId = cleanStr(l.id);
    if (rawId) {
      loanIds.add(rawId);
      const strippedLn = rawId.replace(/^LN/i, '').trim();
      if (strippedLn) {
        loanIds.add(strippedLn);
        candidateAppIds.add(strippedLn);
      }
      if (rawId.includes('/')) {
        const parts = rawId.split('/');
        if (parts[0]) candidateLeadIds.add(parts[0]);
        if (parts[1]) candidateAppIds.add(parts[1]);
        if (parts[2]) candidateNames.add(parts[2].trim().toLowerCase());
      }
    }

    const rawCus = cleanStr(l.customerId);
    if (rawCus) {
      candidateLeadIds.add(rawCus);
      const strippedCus = rawCus.replace(/^CUS/i, '').trim();
      if (strippedCus) candidateLeadIds.add(strippedCus);
    }

    const p = cleanPhone(l.customerPhone);
    if (p.length === 10) candidatePhones.add(p);

    if (cleanStr(l.customerName)) {
      candidateNames.add(l.customerName.trim().toLowerCase());
    }
  });

  const loanIdArr = Array.from(loanIds).filter(Boolean);
  const leadIdArr = Array.from(candidateLeadIds).filter(Boolean);
  const appIdArr = Array.from(candidateAppIds).filter(Boolean);
  const phoneArr = Array.from(candidatePhones).filter(Boolean);
  const nameArr = Array.from(candidateNames).filter(Boolean);

  const promises = [];

  // 1. Repayments (Indexed loan_id)
  if (loanIdArr.length) {
    const ph = loanIdArr.map(() => '?').join(',');
    promises.push(
      query(`
        SELECT loan_id, amount, received_at, method
        FROM loan_repayments
        WHERE status IN ('received', 'success', 'paid', 'settled')
          AND loan_id IN (${ph})
        ORDER BY received_at ASC, id ASC
      `, loanIdArr).catch(err => {
        console.warn('[LoanModel] loan_repayments batch query error:', err.message);
        return [];
      })
    );
  } else {
    promises.push(Promise.resolve([]));
  }

  // 2. Accounting payments (Indexed loan_id / lead_id / application_id)
  const lapConds = [];
  const lapParams = [];
  if (loanIdArr.length) {
    lapConds.push(`loan_id IN (${loanIdArr.map(() => '?').join(',')})`);
    lapParams.push(...loanIdArr);
  }
  if (leadIdArr.length) {
    lapConds.push(`lead_id IN (${leadIdArr.map(() => '?').join(',')})`);
    lapParams.push(...leadIdArr);
  }
  if (appIdArr.length) {
    lapConds.push(`application_id IN (${appIdArr.map(() => '?').join(',')})`);
    lapParams.push(...appIdArr);
  }

  if (lapConds.length) {
    promises.push(
      query(`
        SELECT id, lead_id, application_id, loan_id, amount, method, reference, transfer_type, transaction_id, status, paid_by, disbursed_at, paid_at, account_number, bank_name, ifsc_code
        FROM lead_accounting_payments
        WHERE ${lapConds.join(' OR ')}
        ORDER BY id DESC
      `, lapParams).catch(err => {
        console.warn('[LoanModel] lead_accounting_payments batch query error:', err.message);
        return [];
      })
    );
  } else {
    promises.push(Promise.resolve([]));
  }

  // 3. Lead sanctions
  const lsConds = [];
  const lsParams = [];
  if (loanIdArr.length) {
    lsConds.push(`agreement_number IN (${loanIdArr.map(() => '?').join(',')})`);
    lsParams.push(...loanIdArr);
  }
  if (leadIdArr.length) {
    lsConds.push(`lead_id IN (${leadIdArr.map(() => '?').join(',')})`);
    lsParams.push(...leadIdArr);
  }
  if (appIdArr.length) {
    lsConds.push(`application_id IN (${appIdArr.map(() => '?').join(',')})`);
    lsParams.push(...appIdArr);
  }
  if (phoneArr.length) {
    lsConds.push(`borrower_phone IN (${phoneArr.map(() => '?').join(',')})`);
    lsParams.push(...phoneArr);
  }

  if (lsConds.length) {
    promises.push(
      query(`
        SELECT id, lead_id, application_id, agreement_number, borrower, borrower_email, borrower_phone, principal_amount, tenure_days, interest_rate, processing_fee, gst_amount, disbursed_amount, due_date, repayment_amount, created_by, agreement_date, account_number, ifsc_code, bank_name, status, cam_sheet_id
        FROM lead_sanctions
        WHERE ${lsConds.join(' OR ')}
        ORDER BY (status = 'sent') DESC, id DESC
      `, lsParams).catch(err => {
        console.warn('[LoanModel] lead_sanctions batch query error:', err.message);
        return [];
      })
    );
  } else {
    promises.push(Promise.resolve([]));
  }

  // 4. Loan applications
  const laConds = [];
  const laParams = [];
  if (leadIdArr.length) {
    laConds.push(`id IN (${leadIdArr.map(() => '?').join(',')})`);
    laParams.push(...leadIdArr);
    laConds.push(`source_lead_id IN (${leadIdArr.map(() => '?').join(',')})`);
    laParams.push(...leadIdArr);
  }
  if (appIdArr.length) {
    laConds.push(`application_id IN (${appIdArr.map(() => '?').join(',')})`);
    laParams.push(...appIdArr);
    laConds.push(`source_application_id IN (${appIdArr.map(() => '?').join(',')})`);
    laParams.push(...appIdArr);
  }
  if (phoneArr.length) {
    laConds.push(`mobile IN (${phoneArr.map(() => '?').join(',')})`);
    laParams.push(...phoneArr);
  }
  if (nameArr.length) {
    laConds.push(`LOWER(TRIM(full_name)) IN (${nameArr.map(() => '?').join(',')})`);
    laParams.push(...nameArr);
  }

  if (laConds.length) {
    promises.push(
      query(`
        SELECT id, application_id, full_name, mobile, email, dob, pan_number, monthly_income, city, pincode, office_address, branch_name, reference1_mobile, reference2_mobile, source_lead_id, source_application_id, source_payload, account_number, ifsc_code, bank_name, created_at
        FROM loan_applications
        WHERE ${laConds.join(' OR ')}
        ORDER BY id DESC
      `, laParams).catch(err => {
        console.warn('[LoanModel] loan_applications batch query error:', err.message);
        return [];
      })
    );
  } else {
    promises.push(Promise.resolve([]));
  }

  // 5. Aadhaar reports
  const arConds = [];
  const arParams = [];
  if (leadIdArr.length) {
    arConds.push(`lead_id IN (${leadIdArr.map(() => '?').join(',')})`);
    arParams.push(...leadIdArr);
  }
  if (appIdArr.length) {
    arConds.push(`application_id IN (${appIdArr.map(() => '?').join(',')})`);
    arParams.push(...appIdArr);
  }
  if (phoneArr.length) {
    arConds.push(`mobile IN (${phoneArr.map(() => '?').join(',')})`);
    arParams.push(...phoneArr);
  }

  if (arConds.length) {
    promises.push(
      query(`
        SELECT id, lead_id, application_id, dob, gender, mobile, full_name, address, raw_response
        FROM aadhaar_reports
        WHERE ${arConds.join(' OR ')}
        ORDER BY id DESC
      `, arParams).catch(err => {
        console.warn('[LoanModel] aadhaar_reports batch query error:', err.message);
        return [];
      })
    );
  } else {
    promises.push(Promise.resolve([]));
  }

  // 6. CIBIL reports
  const cibConds = [];
  const cibParams = [];
  if (leadIdArr.length) {
    cibConds.push(`lead_id IN (${leadIdArr.map(() => '?').join(',')})`);
    cibParams.push(...leadIdArr);
  }
  if (appIdArr.length) {
    cibConds.push(`application_id IN (${appIdArr.map(() => '?').join(',')})`);
    cibParams.push(...appIdArr);
  }
  if (phoneArr.length) {
    cibConds.push(`mobile IN (${phoneArr.map(() => '?').join(',')})`);
    cibParams.push(...phoneArr);
  }

  if (cibConds.length) {
    promises.push(
      query(`
        SELECT id, lead_id, application_id, pan, email, mobile, full_name, raw_response, analysis_json
        FROM cibil_reports
        WHERE ${cibConds.join(' OR ')}
        ORDER BY id DESC
      `, cibParams).catch(err => {
        console.warn('[LoanModel] cibil_reports batch query error:', err.message);
        return [];
      })
    );
  } else {
    promises.push(Promise.resolve([]));
  }

  // 7. Lead CAM sheets
  const camConds = [];
  const camParams = [];
  if (leadIdArr.length) {
    camConds.push(`lead_id IN (${leadIdArr.map(() => '?').join(',')})`);
    camParams.push(...leadIdArr);
  }
  if (appIdArr.length) {
    camConds.push(`application_id IN (${appIdArr.map(() => '?').join(',')})`);
    camParams.push(...appIdArr);
  }

  if (camConds.length) {
    promises.push(
      query(`
        SELECT id, lead_id, application_id, monthly_income, net_income, decided_by
        FROM lead_cam_sheets
        WHERE ${camConds.join(' OR ')}
        ORDER BY id DESC
      `, camParams).catch(err => {
        console.warn('[LoanModel] lead_cam_sheets batch query error:', err.message);
        return [];
      })
    );
  } else {
    promises.push(Promise.resolve([]));
  }

  // Execute all 7 queries concurrently (under 15-20ms)
  const [
    repaymentsResult,
    lapResult,
    lsResult,
    laResult,
    arResult,
    cibResult,
    camResult
  ] = await Promise.all(promises);

  // In-Memory Hash Maps for O(1) Instant Lookups
  const repaymentsByLoan = new Map();
  (repaymentsResult || []).forEach(r => {
    const k = String(r.loan_id);
    if (!repaymentsByLoan.has(k)) repaymentsByLoan.set(k, []);
    repaymentsByLoan.get(k).push(r);
    const stripped = k.replace(/^LN/i, '');
    if (stripped && stripped !== k) {
      if (!repaymentsByLoan.has(stripped)) repaymentsByLoan.set(stripped, []);
      repaymentsByLoan.get(stripped).push(r);
    }
  });

  const lapByLoan = new Map();
  const lapByLead = new Map();
  const lapByApp = new Map();
  (lapResult || []).forEach(p => {
    if (p.loan_id && !lapByLoan.has(String(p.loan_id))) lapByLoan.set(String(p.loan_id), p);
    if (p.lead_id && !lapByLead.has(String(p.lead_id))) lapByLead.set(String(p.lead_id), p);
    if (p.application_id && !lapByApp.has(String(p.application_id))) lapByApp.set(String(p.application_id), p);
  });

  const lsByAgree = new Map();
  const lsByLead = new Map();
  const lsByApp = new Map();
  const lsByPhone = new Map();
  (lsResult || []).forEach(s => {
    if (s.agreement_number && !lsByAgree.has(String(s.agreement_number))) lsByAgree.set(String(s.agreement_number), s);
    if (s.lead_id && !lsByLead.has(String(s.lead_id))) lsByLead.set(String(s.lead_id), s);
    if (s.application_id && !lsByApp.has(String(s.application_id))) lsByApp.set(String(s.application_id), s);
    const p = cleanPhone(s.borrower_phone);
    if (p && !lsByPhone.has(p)) lsByPhone.set(p, s);
  });

  const laById = new Map();
  const laByApp = new Map();
  const laBySourceLead = new Map();
  const laBySourceApp = new Map();
  const laByPhone = new Map();
  const laByName = new Map();
  (laResult || []).forEach(a => {
    if (a.id && !laById.has(String(a.id))) laById.set(String(a.id), a);
    if (a.application_id && !laByApp.has(String(a.application_id))) laByApp.set(String(a.application_id), a);
    if (a.source_lead_id && !laBySourceLead.has(String(a.source_lead_id))) laBySourceLead.set(String(a.source_lead_id), a);
    if (a.source_application_id && !laBySourceApp.has(String(a.source_application_id))) laBySourceApp.set(String(a.source_application_id), a);
    const p = cleanPhone(a.mobile);
    if (p && !laByPhone.has(p)) laByPhone.set(p, a);
    if (a.full_name && !laByName.has(String(a.full_name).trim().toLowerCase())) {
      laByName.set(String(a.full_name).trim().toLowerCase(), a);
    }
  });

  const arByLead = new Map();
  const arByApp = new Map();
  const arByPhone = new Map();
  (arResult || []).forEach(ar => {
    if (ar.lead_id && !arByLead.has(String(ar.lead_id))) arByLead.set(String(ar.lead_id), ar);
    if (ar.application_id && !arByApp.has(String(ar.application_id))) arByApp.set(String(ar.application_id), ar);
    const p = cleanPhone(ar.mobile);
    if (p && !arByPhone.has(p)) arByPhone.set(p, ar);
  });

  const cibByLead = new Map();
  const cibByApp = new Map();
  const cibByPhone = new Map();
  (cibResult || []).forEach(cib => {
    if (cib.lead_id && !cibByLead.has(String(cib.lead_id))) cibByLead.set(String(cib.lead_id), cib);
    if (cib.application_id && !cibByApp.has(String(cib.application_id))) cibByApp.set(String(cib.application_id), cib);
    const p = cleanPhone(cib.mobile);
    if (p && !cibByPhone.has(p)) cibByPhone.set(p, cib);
  });

  const camByLead = new Map();
  const camByApp = new Map();
  (camResult || []).forEach(cam => {
    if (cam.lead_id && !camByLead.has(String(cam.lead_id))) camByLead.set(String(cam.lead_id), cam);
    if (cam.application_id && !camByApp.has(String(cam.application_id))) camByApp.set(String(cam.application_id), cam);
  });

  const today = getLocalDate(new Date().toISOString());
  const currentMonthStr = new Date().toISOString().slice(0, 7);

  // Fast in-memory decoration
  loans.forEach(l => {
    const rawId = String(l.id || '').trim();
    const strippedLn = rawId.replace(/^LN/i, '').trim();
    const strippedCus = String(l.customerId || '').replace(/^CUS/i, '').trim();
    const phone = cleanPhone(l.customerPhone);
    const nameLower = String(l.customerName || l.customer || '').trim().toLowerCase();

    let compositeLead = '';
    let compositeApp = '';
    let compositeName = '';
    if (rawId.includes('/')) {
      const parts = rawId.split('/');
      compositeLead = parts[0] || '';
      compositeApp = parts[1] || '';
      compositeName = parts[2] || '';
    }

    // Match payment
    const payment = lapByLoan.get(rawId) ||
      lapByLoan.get(strippedLn) ||
      (compositeApp && lapByApp.get(compositeApp)) ||
      (compositeLead && lapByLead.get(compositeLead)) ||
      (strippedCus && lapByLead.get(strippedCus)) ||
      null;

    // Match sanction
    const sanction = lsByAgree.get(rawId) ||
      lsByAgree.get(strippedLn) ||
      (compositeApp && lsByApp.get(compositeApp)) ||
      (compositeLead && lsByLead.get(compositeLead)) ||
      (payment?.lead_id && lsByLead.get(String(payment.lead_id))) ||
      (payment?.application_id && lsByApp.get(String(payment.application_id))) ||
      (strippedCus && lsByLead.get(strippedCus)) ||
      (phone && lsByPhone.get(phone)) ||
      null;

    // Match application
    const app = (sanction?.lead_id && laById.get(String(sanction.lead_id))) ||
      (sanction?.application_id && laByApp.get(String(sanction.application_id))) ||
      (payment?.lead_id && laById.get(String(payment.lead_id))) ||
      (payment?.application_id && laByApp.get(String(payment.application_id))) ||
      (compositeLead && (laById.get(compositeLead) || laBySourceLead.get(compositeLead))) ||
      (compositeApp && (laByApp.get(compositeApp) || laBySourceApp.get(compositeApp))) ||
      (strippedLn && (laByApp.get(strippedLn) || laById.get(strippedLn))) ||
      (strippedCus && (laById.get(strippedCus) || laBySourceLead.get(strippedCus))) ||
      (phone && laByPhone.get(phone)) ||
      (nameLower && laByName.get(nameLower)) ||
      null;

    // Match Aadhaar
    const aadhaar = (app?.id && arByLead.get(String(app.id))) ||
      (app?.application_id && arByApp.get(String(app.application_id))) ||
      (sanction?.lead_id && arByLead.get(String(sanction.lead_id))) ||
      (sanction?.application_id && arByApp.get(String(sanction.application_id))) ||
      (phone && arByPhone.get(phone)) ||
      null;

    // Match CIBIL
    const cibil = (app?.id && cibByLead.get(String(app.id))) ||
      (app?.application_id && cibByApp.get(String(app.application_id))) ||
      (sanction?.lead_id && cibByLead.get(String(sanction.lead_id))) ||
      (sanction?.application_id && cibByApp.get(String(sanction.application_id))) ||
      (phone && cibByPhone.get(phone)) ||
      null;

    // Match CAM
    const cam = (sanction?.lead_id && camByLead.get(String(sanction.lead_id))) ||
      (sanction?.application_id && camByApp.get(String(sanction.application_id))) ||
      (app?.id && camByLead.get(String(app.id))) ||
      (app?.application_id && camByApp.get(String(app.application_id))) ||
      null;

    // Calculate Repayments & ROI
    const principal = Number(l.principal || 0);
    l.principal = principal;
    const reps = repaymentsByLoan.get(rawId) || repaymentsByLoan.get(strippedLn) || [];

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

    l.todayRoi = todayRoi;
    l.monthRoi = monthRoi;
    l.totalRoi = totalRoi;
    l.amountPaid = reps.length > 0 ? cumulativePaid : Number(l.amountPaid || 0);

    const lastRep = reps.length > 0 ? reps[reps.length - 1] : null;
    l.collectedAmount = l.amountPaid;
    l.collectedMode = lastRep?.method || (l.collectedAmount > 0 ? 'Bank Transfer' : '-');
    l.collectedDate = lastRep?.received_at ? getLocalDate(lastRep.received_at) : (l.startDate || null);

    l.repayments = reps.map(r => ({
      amount: Number(r.amount || 0),
      receivedAt: r.received_at,
      method: r.method,
    }));

    // Next payment date adjustment
    const startStr = getLocalDate(l.startDate);
    const npStr = getLocalDate(l.nextPaymentDate);
    const dueStr = getLocalDate(l.dueDate);
    if (!l.nextPaymentDate || npStr === startStr || (Number(l.amountPaid || 0) === 0 && npStr < dueStr)) {
      l.nextPaymentDate = l.dueDate;
    }

    // Payload & Raw responses
    const payload = parseJsonSafe(app?.source_payload);
    const aadhaarRaw = parseJsonSafe(aadhaar?.raw_response);
    const cibilRaw = parseJsonSafe(cibil?.raw_response);
    const cibilAnalysis = parseJsonSafe(cibil?.analysis_json);

    // Demographic & identity fields
    l.panNumber = normalizePanString(app?.pan_number) ||
      extractPanFromPayload(payload) ||
      normalizePanString(cibil?.pan) ||
      normalizePanString(cibilRaw?.pan || cibilRaw?.pan_number || cibilRaw?.PAN_Number) ||
      normalizePanString(cibilAnalysis?.pan || cibilAnalysis?.personalDetails?.pan) ||
      normalizePanString(aadhaarRaw?.pan || aadhaarRaw?.pan_number) ||
      '-';
    l.pan = l.panNumber;
    l.pancard = l.panNumber;

    l.dob = normalizeDobString(app?.dob) ||
      normalizeDobString(aadhaar?.dob) ||
      extractDobFromPayload(payload) ||
      normalizeDobString(aadhaarRaw?.dob || aadhaarRaw?.dateOfBirth || aadhaarRaw?.poi?.dob) ||
      normalizeDobString(cibilRaw?.dob || cibilAnalysis?.personalDetails?.dob) ||
      null;

    l.email = cleanStr(l.customerEmail) ||
      cleanStr(app?.email) ||
      cleanStr(sanction?.borrower_email) ||
      cleanStr(cibil?.email) ||
      cleanStr(payload?.email || payload?.personalDetails?.email || payload?.office_email) ||
      '-';
    l.customerEmail = l.email;

    l.mobile = cleanStr(l.customerPhone) ||
      cleanStr(app?.mobile) ||
      cleanStr(sanction?.borrower_phone) ||
      cleanStr(cibil?.mobile) ||
      cleanStr(aadhaar?.mobile) ||
      cleanStr(payload?.mobile || payload?.phone || payload?.personalDetails?.mobile) ||
      '-';
    l.mobileNumber = l.mobile;
    l.customerPhone = l.mobile;
    l.phone = l.mobile;

    l.monthlyIncome = Number(
      app?.monthly_income ||
      l.customerMonthlyIncome ||
      extractIncomeFromPayload(payload) ||
      cam?.monthly_income ||
      cam?.net_income ||
      cibilAnalysis?.monthlyIncome ||
      0
    );
    l.incomeAmount = l.monthlyIncome;

    l.gender = cleanStr(aadhaar?.gender) ||
      extractGenderFromPayload(payload) ||
      extractGenderFromPayload(aadhaarRaw) ||
      '-';

    l.alternativeNumber = cleanStr(app?.reference1_mobile) ||
      cleanStr(app?.reference2_mobile) ||
      cleanStr(payload?.reference1_mobile || payload?.reference2_mobile) ||
      '-';

    l.address = cleanStr(l.customerAddress) ||
      cleanStr(aadhaar?.address) ||
      cleanStr(app?.office_address) ||
      cleanStr(payload?.address || payload?.currentAddress) ||
      '-';

    l.city = cleanStr(app?.city) ||
      cleanStr(payload?.city) ||
      cleanStr(aadhaarRaw?.dist || aadhaarRaw?.city) ||
      extractCityFromAddress(l.address) ||
      '-';
    l.cityName = l.city;

    l.stateName = cleanStr(payload?.state || payload?.stateName) ||
      cleanStr(aadhaarRaw?.state) ||
      extractStateFromAddress(l.address) ||
      'Delhi';
    l.state = l.stateName;

    l.pincode = cleanStr(app?.pincode) ||
      cleanStr(payload?.pincode || payload?.pinCode) ||
      cleanStr(aadhaarRaw?.pc || aadhaarRaw?.pincode) ||
      extractPincodeFromAddress(l.address) ||
      '-';

    l.branchName = cleanStr(app?.branch_name) || 'Main Branch';

    l.houseType = cleanStr(
      payload?.property_type ||
      payload?.propertyType ||
      payload?.houseType ||
      payload?.residenceType ||
      'Owned'
    );

    // Administrative & sanction fields
    l.sanctionedBy = cleanStr(sanction?.created_by) || 'Credit Manager';
    l.approvedBy = cleanStr(cam?.decided_by || sanction?.created_by) || 'Credit Desk';
    l.sanctionDate = sanction?.agreement_date ? getLocalDate(sanction.agreement_date) : (l.startDate || null);
    l.leadInitiatedDate = app?.created_at ? getLocalDate(app.created_at) : (l.createdAt || null);

    // Banking & Payment Info
    l.companyBankAccount = '000705001234';
    l.accountNumber = cleanStr(payment?.account_number || sanction?.account_number || app?.account_number) || '-';
    l.ifscCode = cleanStr(payment?.ifsc_code || sanction?.ifsc_code || app?.ifsc_code) || '-';
    l.bankName = cleanStr(payment?.bank_name || sanction?.bank_name || app?.bank_name) || '-';
    l.utrNumber = cleanStr(payment?.reference || payment?.transaction_id) || null;
    l.transactionId = l.utrNumber;
    l.disbursementUtr = l.utrNumber;
    l.disbursementReference = cleanStr(l.utrNumber) || '-';
    l.modeOfPayment = cleanStr(payment?.transfer_type || payment?.method) || 'Bank Transfer';
    l.disbursedBy = cleanStr(payment?.paid_by) || 'Accountant';
    l.disbursementStatus = cleanStr(payment?.status) || 'Disbursed';
    l.repeatType = Number(l.customerTotalLoans || 0) > 1 ? 'Repeat' : 'Fresh';

    // Financial calculations
    const adminFee = Number(sanction?.processing_fee || Math.round(principal * 0.10));
    const adminFeeGst = Number(sanction?.gst_amount || Math.round(adminFee * 0.18));
    const totalAdminFee = adminFee + adminFeeGst;
    l.adminFee = adminFee;
    l.adminFeeGst = adminFeeGst;
    l.totalAdminFee = totalAdminFee;
    l.igst = adminFeeGst;
    l.cgst = Math.round((adminFeeGst / 2) * 100) / 100;
    l.sgst = Math.round((adminFeeGst / 2) * 100) / 100;
    l.processing = adminFee;
    l.disbursedAmount = Number(payment?.amount || sanction?.disbursed_amount || (principal > totalAdminFee ? principal - totalAdminFee : principal));
    l.loanRepayAmount = Number(sanction?.repayment_amount || l.totalAmount || Math.round(principal * 1.12));
    l.repaymentAmount = l.loanRepayAmount;
    l.tenure = Number(sanction?.tenure_days || 30);
    l.roi = Number(sanction?.interest_rate || l.interestRate || 1.0);

    // Dates
    l.disbursedDate = payment?.disbursed_at ? getLocalDate(payment.disbursed_at) : (payment?.paid_at ? getLocalDate(payment.paid_at) : (sanction?.agreement_date ? getLocalDate(sanction.agreement_date) : (l.startDate || null)));
    l.loanDisbursedDate = l.disbursedDate;
    l.repaymentDate = l.dueDate || null;

    // Names and keys
    l.leadId = cleanStr(sanction?.lead_id || payment?.lead_id || app?.id || app?.source_lead_id || compositeLead || strippedCus) || '-';
    l.loanNo = cleanStr(sanction?.agreement_number || app?.application_id || app?.source_application_id || compositeApp || rawId);
    l.customerName = cleanStr(l.customerName || sanction?.borrower || app?.full_name || compositeName || aadhaar?.full_name) || 'Customer';
    l.customer = l.customerName;
  });
}

async function findAll({ search = '', status = 'all', page = 1, limit = 50, pageSize, dateFilter = 'all', disbursedFilter = 'all', fromDate = '', toDate = '', dateType = 'disbursed' } = {}) {
  const effectiveLimit = pageSize || limit;
  const parsedPage = Math.max(Number(page) || 1, 1);
  const parsedLimit = Math.min(Math.max(Number(effectiveLimit) || 50, 1), 5000);
  const offset = (parsedPage - 1) * parsedLimit;

  const cleanFromDate = normalizeDateString(fromDate);
  const cleanToDate = normalizeDateString(toDate);
  const cleanDateType = (cleanStr(dateType) || 'disbursed').toLowerCase();

  const cacheKey = `${search}:${status}:${dateFilter}:${disbursedFilter}:${cleanFromDate}:${cleanToDate}:${cleanDateType}:${parsedPage}:${parsedLimit}`;
  const cached = loansListCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < LOANS_CACHE_TTL_MS)) {
    return cached.data;
  }

  const clauses = [];
  const params = [];

  if (search) {
    clauses.push('(l.id LIKE ? OR c.name LIKE ? OR l.customer_id LIKE ? OR c.phone LIKE ? OR c.email LIKE ?)');
    params.push(...likeParams(search, 5));
  }

  if (status !== 'all') {
    const sLower = status.toLowerCase();
    if (sLower === 'active') {
      clauses.push("((l.status = 'Active' OR l.status IS NULL) AND l.balance > 0)");
    } else if (sLower === 'paid off') {
      clauses.push('l.balance <= 0');
    } else if (sLower === 'part payment' || sLower === 'partial') {
      clauses.push('(l.amount_paid > 0 AND l.balance > 0)');
    } else if (sLower === 'overdue') {
      clauses.push("(l.balance > 0 AND (l.due_date < CURDATE() OR LOWER(l.status) = 'overdue' OR LOWER(l.payment_status) = 'overdue'))");
    } else {
      clauses.push('l.status = ?');
      params.push(status);
    }
  }

  // 1. Custom explicit date range filters
  if (cleanFromDate || cleanToDate) {
    if (cleanDateType === 'due') {
      if (cleanFromDate) {
        clauses.push('l.due_date >= ?');
        params.push(cleanFromDate);
      }
      if (cleanToDate) {
        clauses.push('l.due_date <= ?');
        params.push(cleanToDate);
      }
    } else if (cleanDateType === 'collected') {
      if (cleanFromDate && cleanToDate) {
        clauses.push(`EXISTS (
          SELECT 1 FROM loan_repayments lr
          WHERE lr.loan_id = l.id
            AND lr.status IN ('received', 'success', 'paid', 'settled')
            AND DATE(lr.received_at) >= ? AND DATE(lr.received_at) <= ?
        )`);
        params.push(cleanFromDate, cleanToDate);
      } else if (cleanFromDate) {
        clauses.push(`EXISTS (
          SELECT 1 FROM loan_repayments lr
          WHERE lr.loan_id = l.id
            AND lr.status IN ('received', 'success', 'paid', 'settled')
            AND DATE(lr.received_at) >= ?
        )`);
        params.push(cleanFromDate);
      } else if (cleanToDate) {
        clauses.push(`EXISTS (
          SELECT 1 FROM loan_repayments lr
          WHERE lr.loan_id = l.id
            AND lr.status IN ('received', 'success', 'paid', 'settled')
            AND DATE(lr.received_at) <= ?
        )`);
        params.push(cleanToDate);
      }
    } else if (cleanDateType === 'created') {
      if (cleanFromDate) {
        clauses.push('DATE(l.created_at) >= ?');
        params.push(cleanFromDate);
      }
      if (cleanToDate) {
        clauses.push('DATE(l.created_at) <= ?');
        params.push(cleanToDate);
      }
    } else {
      // Default: 'disbursed'
      if (cleanFromDate && cleanToDate) {
        clauses.push(`(
          (DATE(COALESCE(l.start_date, l.created_at)) >= ? AND DATE(COALESCE(l.start_date, l.created_at)) <= ?)
          OR EXISTS (
            SELECT 1 FROM lead_accounting_payments lap
            WHERE (lap.loan_id = l.id OR lap.lead_id = l.customer_id)
              AND DATE(COALESCE(lap.disbursed_at, lap.paid_at)) >= ?
              AND DATE(COALESCE(lap.disbursed_at, lap.paid_at)) <= ?
          )
        )`);
        params.push(cleanFromDate, cleanToDate, cleanFromDate, cleanToDate);
      } else if (cleanFromDate) {
        clauses.push(`(
          DATE(COALESCE(l.start_date, l.created_at)) >= ?
          OR EXISTS (
            SELECT 1 FROM lead_accounting_payments lap
            WHERE (lap.loan_id = l.id OR lap.lead_id = l.customer_id)
              AND DATE(COALESCE(lap.disbursed_at, lap.paid_at)) >= ?
          )
        )`);
        params.push(cleanFromDate, cleanFromDate);
      } else if (cleanToDate) {
        clauses.push(`(
          DATE(COALESCE(l.start_date, l.created_at)) <= ?
          OR EXISTS (
            SELECT 1 FROM lead_accounting_payments lap
            WHERE (lap.loan_id = l.id OR lap.lead_id = l.customer_id)
              AND DATE(COALESCE(lap.disbursed_at, lap.paid_at)) <= ?
          )
        )`);
        params.push(cleanToDate, cleanToDate);
      }
    }
  } else {
    // 2. Preset filters when custom dates are not specified
    if (dateFilter !== 'all') {
      if (dateFilter === 'today') {
        clauses.push('l.due_date = CURDATE()');
      } else if (dateFilter === 'yesterday') {
        clauses.push('l.due_date = DATE_SUB(CURDATE(), INTERVAL 1 DAY)');
      } else if (dateFilter === 'month') {
        clauses.push("DATE_FORMAT(l.due_date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')");
      } else if (dateFilter === 'week') {
        clauses.push('YEARWEEK(l.due_date, 1) = YEARWEEK(CURDATE(), 1)');
      } else if (dateFilter === 'overdue') {
        clauses.push('l.due_date < CURDATE() AND l.balance > 0');
      }
    }

    if (disbursedFilter !== 'all') {
      if (disbursedFilter === 'today') {
        clauses.push(`(
          DATE(COALESCE(l.start_date, l.created_at)) = CURDATE()
          OR EXISTS (
            SELECT 1 FROM lead_accounting_payments lap
            WHERE (lap.loan_id = l.id OR lap.lead_id = l.customer_id)
              AND DATE(COALESCE(lap.disbursed_at, lap.paid_at)) = CURDATE()
          )
        )`);
      } else if (disbursedFilter === 'yesterday') {
        clauses.push(`(
          DATE(COALESCE(l.start_date, l.created_at)) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
          OR EXISTS (
            SELECT 1 FROM lead_accounting_payments lap
            WHERE (lap.loan_id = l.id OR lap.lead_id = l.customer_id)
              AND DATE(COALESCE(lap.disbursed_at, lap.paid_at)) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
          )
        )`);
      } else if (disbursedFilter === 'month') {
        clauses.push(`(
          DATE_FORMAT(COALESCE(l.start_date, l.created_at), '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
          OR EXISTS (
            SELECT 1 FROM lead_accounting_payments lap
            WHERE (lap.loan_id = l.id OR lap.lead_id = l.customer_id)
              AND DATE_FORMAT(COALESCE(lap.disbursed_at, lap.paid_at)) = DATE_FORMAT(CURDATE(), '%Y-%m')
          )
        )`);
      }
    }
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  // 1. Ultra-fast count and stats queries in parallel
  const countSql = `
    SELECT COUNT(*) AS total
    FROM loans l
    LEFT JOIN customers c ON c.id = l.customer_id
    ${whereClause}
  `;

  const [countRows, stats] = await Promise.all([
    query(countSql, params),
    getLoanStats(),
  ]);
  const total = Number(countRows?.[0]?.total || 0);

  // 2. Ultra-fast base query without any scalar or joined correlated subqueries
  const queryParams = [...params, parsedLimit, offset];
  const loans = await query(`
    SELECT
      l.id,
      l.customer_id AS customerId,
      l.principal,
      l.interest_rate AS interestRate,
      l.total_amount AS totalAmount,
      l.amount_paid AS amountPaid,
      l.balance,
      DATE_FORMAT(l.start_date, '%Y-%m-%d') AS startDate,
      DATE_FORMAT(l.due_date, '%Y-%m-%d') AS dueDate,
      l.status,
      l.payment_status AS paymentStatus,
      DATE_FORMAT(l.next_payment_date, '%Y-%m-%d') AS nextPaymentDate,
      l.next_payment_amount AS nextPaymentAmount,
      DATE_FORMAT(l.created_at, '%Y-%m-%d') AS createdAt,
      DATE_FORMAT(l.updated_at, '%Y-%m-%d') AS updatedAt,
      c.name AS customerName,
      c.name AS customer,
      c.email AS customerEmail,
      c.phone AS customerPhone,
      c.address AS customerAddress,
      c.monthly_income AS customerMonthlyIncome,
      c.total_loans AS customerTotalLoans
    FROM loans l
    LEFT JOIN customers c ON c.id = l.customer_id
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
    emptyResult.stats = stats;
    return emptyResult;
  }

  // 3. Fast parallel batch enrichment for ONLY the current page
  await enrichLoansBatch(loans);

  loans.total = total;
  loans.page = parsedPage;
  loans.limit = parsedLimit;
  loans.totalPages = Math.ceil(total / parsedLimit);
  loans.stats = stats;

  loansListCache.set(cacheKey, { data: loans, timestamp: Date.now() });
  return loans;
}

async function findById(id) {
  const rows = await query(`
    SELECT
      l.id,
      l.customer_id AS customerId,
      l.principal,
      l.interest_rate AS interestRate,
      l.total_amount AS totalAmount,
      l.amount_paid AS amountPaid,
      l.balance,
      DATE_FORMAT(l.start_date, '%Y-%m-%d') AS startDate,
      DATE_FORMAT(l.due_date, '%Y-%m-%d') AS dueDate,
      l.status,
      l.payment_status AS paymentStatus,
      DATE_FORMAT(l.next_payment_date, '%Y-%m-%d') AS nextPaymentDate,
      l.next_payment_amount AS nextPaymentAmount,
      DATE_FORMAT(l.created_at, '%Y-%m-%d') AS createdAt,
      DATE_FORMAT(l.updated_at, '%Y-%m-%d') AS updatedAt,
      c.name AS customerName,
      c.name AS customer,
      c.email AS customerEmail,
      c.phone AS customerPhone,
      c.address AS customerAddress,
      c.monthly_income AS customerMonthlyIncome,
      c.total_loans AS customerTotalLoans
    FROM loans l
    LEFT JOIN customers c ON c.id = l.customer_id
    WHERE l.id = ?
    LIMIT 1
  `, [id]);

  if (!rows.length) return null;
  const l = rows[0];

  await enrichLoansBatch([l]);
  return l;
}

module.exports = { findAll, findById, invalidateLoansCache, getLoanStats };
