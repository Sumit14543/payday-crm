const referenceModel = require('../models/referenceModel');
const collectionModel = require('../models/collectionModel');
const { success } = require('../utils/http');
const { normalizeAadhaarResponse } = require('../services/aadhaarService');

function normLoan(val) {
  return String(val || '').toUpperCase().replace(/[\s\-_]/g, '').replace(/^LN/, '');
}

function normPhone(val) {
  return String(val || '').replace(/\D/g, '').slice(-10);
}

function calculateDaysOverdue(dueDate, balance) {
  if (!balance || Number(balance) <= 0) return 0;
  if (!dueDate) return 0;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return 0;
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((today.getTime() - due.getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(0, diffDays);
}

function formatDob(aadhaarDob, laDob) {
  const ad = String(aadhaarDob || '').trim();
  if (/^\d{2}-\d{2}-\d{4}$/.test(ad)) {
    return ad.slice(0, 2) + ad.slice(3, 5) + ad.slice(6, 10);
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(ad)) {
    return ad.slice(8, 10) + ad.slice(5, 7) + ad.slice(0, 4);
  }
  if (ad) return ad;
  if (laDob) {
    const d = new Date(laDob);
    if (!Number.isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = String(d.getFullYear());
      return `${day}${month}${year}`;
    }
  }
  return '';
}

function extractGender(aadhaar, la, customer, cibil) {
  let g = aadhaar?.gender || la?.gender || customer?.gender || cibil?.gender || '';
  if (!g && aadhaar?.raw_response) {
    try {
      const raw = typeof aadhaar.raw_response === 'string' ? JSON.parse(aadhaar.raw_response) : aadhaar.raw_response;
      g = raw?.gender || raw?.sex || raw?.poi?.gender || '';
    } catch (e) {}
  }
  if (!g && la?.source_payload) {
    try {
      const payload = typeof la.source_payload === 'string' ? JSON.parse(la.source_payload) : la.source_payload;
      g = payload?.gender || payload?.sex || payload?.personalDetails?.gender || payload?.borrower?.gender || '';
    } catch (e) {}
  }
  return String(g || '').trim();
}

function extractPan(la, cibil, aadhaar, customer) {
  let val = la?.pan_number || la?.pan || cibil?.pan || customer?.pan || customer?.pan_number || '';
  if (!val && la?.source_payload) {
    try {
      const data = typeof la.source_payload === 'string' ? JSON.parse(la.source_payload) : la.source_payload;
      val = data?.pan || data?.panNumber || data?.pan_number || data?.pancard || data?.panCard || data?.borrowerPan || data?.borrower_pan || data?.income_tax_pan || data?.personalDetails?.pan || data?.personalDetails?.panNumber || data?.borrower?.pan || '';
    } catch (e) {}
  }
  if (!val && cibil?.raw_response) {
    try {
      const rawCibil = typeof cibil.raw_response === 'string' ? JSON.parse(cibil.raw_response) : cibil.raw_response;
      val = rawCibil?.pan || rawCibil?.pan_number || rawCibil?.PAN_Number || rawCibil?.PanNumber || '';
    } catch (e) {}
  }
  if (!val && cibil?.analysis_json) {
    try {
      const aJson = typeof cibil.analysis_json === 'string' ? JSON.parse(cibil.analysis_json) : cibil.analysis_json;
      val = aJson?.pan || aJson?.pan_number || aJson?.PAN_Number || aJson?.personalDetails?.pan || '';
    } catch (e) {}
  }
  if (!val && aadhaar?.raw_response) {
    try {
      const raw = typeof aadhaar.raw_response === 'string' ? JSON.parse(aadhaar.raw_response) : aadhaar.raw_response;
      val = raw?.pan || raw?.panNumber || raw?.pan_number || '';
    } catch (e) {}
  }
  const clean = String(val || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return clean.length >= 10 ? clean.slice(0, 10) : clean;
}

async function listTeam(req, res) {
  const rows = await referenceModel.all(`
    SELECT id, name, role, active_leads AS activeLeads, leads, commission, sales, status
    FROM team_members
    ORDER BY sales DESC
  `);
  return success(res, rows);
}

let collectionsListCache = {
  timestamp: 0,
  data: null,
};
const COLLECTIONS_CACHE_TTL_MS = 5 * 1000; // 5 seconds

function invalidateCollectionsCache() {
  collectionsListCache.data = null;
  if (typeof collectionModel.invalidateSummaryCache === 'function') {
    collectionModel.invalidateSummaryCache();
  }
}

async function listCollections(req, res) {
  const force = String(req.query?.refresh || req.body?.refresh || '').toLowerCase() === 'true';
  const page = parseInt(req.query?.page || req.body?.page || 0, 10);
  const limit = parseInt(req.query?.limit || req.body?.limit || 0, 10);

  if (!force && collectionsListCache.data && (Date.now() - collectionsListCache.timestamp < COLLECTIONS_CACHE_TTL_MS)) {
    if (page > 0 && limit > 0) {
      const total = collectionsListCache.data.length;
      const offset = (page - 1) * limit;
      const paginatedRows = collectionsListCache.data.slice(offset, offset + limit);
      return res.json({
        success: true,
        data: paginatedRows,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      });
    }
    return success(res, collectionsListCache.data);
  }


  let cases = [];
  let hasLastLoginAt = true;
  try {
    cases = await referenceModel.all(`
      SELECT
        cc.id,
        cc.loan_id AS loanId,
        cc.customer_id AS customerId,
        cc.customer,
        cc.phone,
        cc.total_due AS totalDue,
        cc.original_due_date,
        cc.last_contact_date,
        cc.last_payment_date,
        cc.status,
        cc.assigned_to AS assignedTo,
        cc.last_login_at
      FROM collection_cases cc
    `);
  } catch (err) {
    hasLastLoginAt = false;
    cases = await referenceModel.all(`
      SELECT
        cc.id,
        cc.loan_id AS loanId,
        cc.customer_id AS customerId,
        cc.customer,
        cc.phone,
        cc.total_due AS totalDue,
        cc.original_due_date,
        cc.last_contact_date,
        cc.last_payment_date,
        cc.status,
        cc.assigned_to AS assignedTo,
        NULL AS last_login_at
      FROM collection_cases cc
    `);
  }

  if (!cases || cases.length === 0) {
    return success(res, []);
  }

  const loanIdsSet = new Set();
  const customerIdsSet = new Set();
  const phonesSet = new Set();
  const cleanPhonesSet = new Set();
  const namesSet = new Set();

  for (const c of cases) {
    const rawLoanId = String(c.loanId || '').trim();
    if (rawLoanId) {
      loanIdsSet.add(rawLoanId);
      loanIdsSet.add(rawLoanId.toUpperCase());
      const nLoan = normLoan(rawLoanId);
      if (nLoan) {
        loanIdsSet.add(nLoan);
        loanIdsSet.add('LN' + nLoan);
      }
    }
    const rawCustId = String(c.customerId || '').trim();
    if (rawCustId) customerIdsSet.add(rawCustId);

    const rawCustName = String(c.customer || '').trim();
    if (rawCustName) namesSet.add(rawCustName);

    const rawPhone = String(c.phone || '').trim();
    if (rawPhone) {
      phonesSet.add(rawPhone);
      const cPhone = normPhone(rawPhone);
      if (cPhone) {
        cleanPhonesSet.add(cPhone);
        phonesSet.add(cPhone);
        phonesSet.add('+91' + cPhone);
        phonesSet.add('91' + cPhone);
      }
    }
  }

  const loanIdsList = Array.from(loanIdsSet);
  const dummy = ['__none__'];

  const [
    loansRows,
    schedulesRows,
    paymentsRows,
    repaymentsRows,
  ] = await Promise.all([
    referenceModel.all(`SELECT * FROM loans ORDER BY id DESC LIMIT 10000`).catch(() => []),
    referenceModel.all(`SELECT * FROM loan_repayment_schedule ORDER BY id DESC LIMIT 10000`).catch(() => []),
    referenceModel.all(`SELECT * FROM lead_accounting_payments ORDER BY id DESC LIMIT 10000`).catch(() => []),
    referenceModel.all(`
      SELECT loan_id, SUM(amount) AS totalPaid, MAX(payment_date) AS lastPaymentDate
      FROM loan_repayments
      WHERE status = 'Success'
      GROUP BY loan_id
    `).catch(() =>
      referenceModel.all(`
        SELECT loan_id, SUM(amount) AS totalPaid, MAX(received_at) AS lastPaymentDate
        FROM loan_repayments
        WHERE status IN ('received', 'success', 'paid', 'settled')
        GROUP BY loan_id
      `).catch(() => [])
    ),
  ]);

  const [
    customersRows,
    appsRows,
    aadhaarsRows,
    cibilsRows,
  ] = await Promise.all([
    referenceModel.all(`SELECT * FROM customers ORDER BY id DESC LIMIT 10000`).catch((err) => {
      console.error('[referenceController] customers query error:', err.message);
      return [];
    }),

    referenceModel.all(`SELECT * FROM loan_applications ORDER BY id DESC LIMIT 10000`).catch((err) => {
      console.error('[referenceController] loan_applications query error:', err.message);
      return [];
    }),

    referenceModel.all(`SELECT * FROM aadhaar_reports ORDER BY id DESC LIMIT 10000`).catch((err) => {
      console.error('[referenceController] aadhaar_reports query error:', err.message);
      return [];
    }),

    referenceModel.all(`SELECT * FROM cibil_reports ORDER BY id DESC LIMIT 10000`).catch((err) => {
      console.error('[referenceController] cibil_reports query error:', err.message);
      return [];
    }),
  ]);

  const loansById = new Map();
  const loansByNorm = new Map();
  for (const l of loansRows) {
    loansById.set(String(l.id), l);
    loansById.set(String(l.id).toUpperCase(), l);
    const n = normLoan(l.id);
    if (n && !loansByNorm.has(n)) loansByNorm.set(n, l);
  }

  const customersById = new Map();
  const customersByPhone = new Map();
  for (const c of customersRows) {
    customersById.set(String(c.id), c);
    const p = normPhone(c.phone);
    if (p && !customersByPhone.has(p)) customersByPhone.set(p, c);
  }

  const schedulesByLoanId = new Map();
  const schedulesByNormLoan = new Map();
  for (const s of schedulesRows) {
    if (!schedulesByLoanId.has(String(s.loan_id))) schedulesByLoanId.set(String(s.loan_id), s);
    const n = normLoan(s.loan_id);
    if (n && !schedulesByNormLoan.has(n)) schedulesByNormLoan.set(n, s);
  }

  const paymentsByLoanId = new Map();
  const paymentsByNormLoan = new Map();
  const paymentsByAppId = new Map();
  const paymentsByLeadId = new Map();
  for (const p of paymentsRows) {
    if (!paymentsByLoanId.has(String(p.loan_id))) paymentsByLoanId.set(String(p.loan_id), p);
    const n = normLoan(p.loan_id);
    if (n && !paymentsByNormLoan.has(n)) paymentsByNormLoan.set(n, p);
    if (p.application_id && !paymentsByAppId.has(String(p.application_id))) paymentsByAppId.set(String(p.application_id), p);
    if (p.lead_id && !paymentsByLeadId.has(String(p.lead_id))) paymentsByLeadId.set(String(p.lead_id), p);
  }

  const repaymentsByLoanId = new Map();
  const repaymentsByNormLoan = new Map();
  for (const r of repaymentsRows) {
    repaymentsByLoanId.set(String(r.loan_id), r);
    const n = normLoan(r.loan_id);
    if (n) {
      const existing = repaymentsByNormLoan.get(n);
      if (existing) {
        existing.totalPaid = Number(existing.totalPaid || 0) + Number(r.totalPaid || 0);
        if (r.lastPaymentDate && (!existing.lastPaymentDate || new Date(r.lastPaymentDate) > new Date(existing.lastPaymentDate))) {
          existing.lastPaymentDate = r.lastPaymentDate;
        }
      } else {
        repaymentsByNormLoan.set(n, { ...r });
      }
    }
  }

  const appsByAppId = new Map();
  const appsByLeadId = new Map();
  const appsBySourceLeadId = new Map();
  const appsByPhone = new Map();
  const appsByName = new Map();
  const appsByNormName = new Map();

  for (const a of appsRows) {
    const appId = String(a.application_id || '').trim();
    if (appId) {
      if (!appsByAppId.has(appId)) appsByAppId.set(appId, a);
      if (!appsByAppId.has(appId.toUpperCase())) appsByAppId.set(appId.toUpperCase(), a);
    }
    const id = String(a.id || '').trim();
    if (id && !appsByLeadId.has(id)) appsByLeadId.set(id, a);

    const sLeadId = String(a.source_lead_id || '').trim();
    if (sLeadId) {
      if (!appsBySourceLeadId.has(sLeadId)) appsBySourceLeadId.set(sLeadId, a);
      if (!appsBySourceLeadId.has(sLeadId.toUpperCase())) appsBySourceLeadId.set(sLeadId.toUpperCase(), a);
      if (!appsByLeadId.has(sLeadId)) appsByLeadId.set(sLeadId, a);
    }

    const p = normPhone(a.mobile);
    if (p && !appsByPhone.has(p)) appsByPhone.set(p, a);
    const rawP = String(a.mobile || '').replace(/\D/g, '');
    if (rawP && !appsByPhone.has(rawP)) appsByPhone.set(rawP, a);

    const name = String(a.full_name || '').toLowerCase().trim();
    if (name && !appsByName.has(name)) appsByName.set(name, a);
    const nName = name.replace(/[^a-z0-9]/g, '');
    if (nName && !appsByNormName.has(nName)) appsByNormName.set(nName, a);
  }

  const aadhaarByAppId = new Map();
  const aadhaarByLeadId = new Map();
  const aadhaarByPhone = new Map();
  const aadhaarByName = new Map();
  const aadhaarByNormName = new Map();
  for (const a of aadhaarsRows) {
    const appId = String(a.application_id || '').trim();
    if (appId) {
      if (!aadhaarByAppId.has(appId)) aadhaarByAppId.set(appId, a);
      if (!aadhaarByAppId.has(appId.toUpperCase())) aadhaarByAppId.set(appId.toUpperCase(), a);
    }
    const leadId = String(a.lead_id || '').trim();
    if (leadId) {
      if (!aadhaarByLeadId.has(leadId)) aadhaarByLeadId.set(leadId, a);
      if (!aadhaarByLeadId.has(leadId.toUpperCase())) aadhaarByLeadId.set(leadId.toUpperCase(), a);
    }
    const p = normPhone(a.mobile);
    if (p && !aadhaarByPhone.has(p)) aadhaarByPhone.set(p, a);
    const rawP = String(a.mobile || '').replace(/\D/g, '');
    if (rawP && !aadhaarByPhone.has(rawP)) aadhaarByPhone.set(rawP, a);

    const name = String(a.full_name || '').toLowerCase().trim();
    if (name && !aadhaarByName.has(name)) aadhaarByName.set(name, a);
    const nName = name.replace(/[^a-z0-9]/g, '');
    if (nName && !aadhaarByNormName.has(nName)) aadhaarByNormName.set(nName, a);
  }

  const cibilByPhone = new Map();
  const cibilByPan = new Map();
  const cibilByAppId = new Map();
  const cibilByLeadId = new Map();
  const cibilByName = new Map();
  const cibilByNormName = new Map();
  for (const c of cibilsRows) {
    const appId = String(c.application_id || '').trim();
    if (appId) {
      if (!cibilByAppId.has(appId)) cibilByAppId.set(appId, c);
      if (!cibilByAppId.has(appId.toUpperCase())) cibilByAppId.set(appId.toUpperCase(), c);
    }
    const leadId = String(c.lead_id || '').trim();
    if (leadId) {
      if (!cibilByLeadId.has(leadId)) cibilByLeadId.set(leadId, c);
      if (!cibilByLeadId.has(leadId.toUpperCase())) cibilByLeadId.set(leadId.toUpperCase(), c);
    }
    const p = normPhone(c.mobile);
    if (p && !cibilByPhone.has(p)) cibilByPhone.set(p, c);
    const rawP = String(c.mobile || '').replace(/\D/g, '');
    if (rawP && !cibilByPhone.has(rawP)) cibilByPhone.set(rawP, c);

    const pan = String(c.pan || '').toUpperCase().trim();
    if (pan && !cibilByPan.has(pan)) cibilByPan.set(pan, c);

    const name = String(c.full_name || '').toLowerCase().trim();
    if (name && !cibilByName.has(name)) cibilByName.set(name, c);
    const nName = name.replace(/[^a-z0-9]/g, '');
    if (nName && !cibilByNormName.has(nName)) cibilByNormName.set(nName, c);
  }

  const rows = cases.map((cc) => {
    const rawLoanId = String(cc.loanId || '');
    const nLoan = normLoan(rawLoanId);
    const loan = loansById.get(rawLoanId) || loansById.get(rawLoanId.toUpperCase()) || loansByNorm.get(nLoan) || null;

    const rawCustId = String(cc.customerId || '').trim();
    const cPhone = normPhone(cc.phone);
    const rawPhoneDigits = String(cc.phone || '').replace(/\D/g, '');
    const customer = customersById.get(rawCustId) || (cPhone ? customersByPhone.get(cPhone) : null) || null;

    const schedule = schedulesByLoanId.get(rawLoanId) || schedulesByNormLoan.get(nLoan) || null;
    const payment = paymentsByLoanId.get(rawLoanId) || paymentsByNormLoan.get(nLoan) || (schedule && (paymentsByAppId.get(String(schedule.application_id)) || paymentsByLeadId.get(String(schedule.lead_id)))) || null;

    const targetAppId = (schedule && schedule.application_id) || (payment && payment.application_id) || (rawCustId && rawCustId) || null;
    const targetLeadId = (schedule && schedule.lead_id) || (payment && payment.lead_id) || null;

    const rawCustName = String(cc.customer || '').toLowerCase().trim();
    const nCustName = rawCustName.replace(/[^a-z0-9]/g, '');

    const la = (targetAppId && appsByAppId.get(String(targetAppId).trim()))
      || (targetAppId && appsByAppId.get(String(targetAppId).trim().toUpperCase()))
      || (targetLeadId && appsByLeadId.get(String(targetLeadId).trim()))
      || (rawCustId && appsBySourceLeadId.get(rawCustId))
      || (rawCustId && appsByLeadId.get(rawCustId))
      || (rawCustId && appsByAppId.get(rawCustId))
      || (cPhone && appsByPhone.get(cPhone))
      || (rawPhoneDigits && appsByPhone.get(rawPhoneDigits))
      || (rawCustName && appsByName.get(rawCustName))
      || (nCustName && appsByNormName.get(nCustName))
      || null;

    const aadhaar = (targetAppId && aadhaarByAppId.get(String(targetAppId).trim()))
      || (targetLeadId && aadhaarByLeadId.get(String(targetLeadId).trim()))
      || (la && la.application_id && aadhaarByAppId.get(String(la.application_id).trim()))
      || (la && la.id && aadhaarByLeadId.get(String(la.id)))
      || (la && la.source_lead_id && aadhaarByLeadId.get(String(la.source_lead_id).trim()))
      || (cPhone && aadhaarByPhone.get(cPhone))
      || (rawPhoneDigits && aadhaarByPhone.get(rawPhoneDigits))
      || (rawCustName && aadhaarByName.get(rawCustName))
      || (nCustName && aadhaarByNormName.get(nCustName))
      || null;

    const cibil = (targetAppId && cibilByAppId.get(String(targetAppId).trim()))
      || (targetLeadId && cibilByLeadId.get(String(targetLeadId).trim()))
      || (la && la.application_id && cibilByAppId.get(String(la.application_id).trim()))
      || (la && la.id && cibilByLeadId.get(String(la.id)))
      || (la && la.source_lead_id && cibilByLeadId.get(String(la.source_lead_id).trim()))
      || (cPhone && cibilByPhone.get(cPhone))
      || (rawPhoneDigits && cibilByPhone.get(rawPhoneDigits))
      || (la && la.pan_number && cibilByPan.get(String(la.pan_number).toUpperCase().trim()))
      || (rawCustName && cibilByName.get(rawCustName))
      || (nCustName && cibilByNormName.get(nCustName))
      || null;

    const rep = repaymentsByLoanId.get(rawLoanId) || repaymentsByNormLoan.get(nLoan) || null;

    const dueDate = schedule?.due_date || loan?.next_payment_date || loan?.due_date || cc.original_due_date || null;
    const balance = loan?.balance !== undefined && loan?.balance !== null ? Number(loan.balance) : Number(cc.totalDue || 0);
    const daysOverdue = calculateDaysOverdue(dueDate, balance);
    const lastPaymentDate = rep?.lastPaymentDate || cc.last_payment_date || null;

    let emiStatus = loan?.payment_status || cc.status || 'Pending';
    if (balance <= 0) {
      emiStatus = 'Paid';
    } else {
      const loanDueDate = loan?.due_date || cc.original_due_date;
      const loanDaysOverdue = calculateDaysOverdue(loanDueDate, balance);
      if (loanDaysOverdue > 0) {
        emiStatus = 'Overdue';
      }
    }

    const loanPaid = Number(loan?.amount_paid || 0);
    const repPaid = Number(rep?.totalPaid || 0);
    const amountPaid = loanPaid > 0 ? loanPaid : (repPaid > 0 ? repPaid : 0);
    const totalAmount = Number(loan?.total_amount || cc.totalDue || 0);
    const overdueInterest = Math.max(0, (loan ? (Number(loan.balance || 0) + Number(loan.amount_paid || 0) - Number(loan.total_amount || 0)) : 0));
    const principal = Number(loan?.principal || payment?.amount || 0);
    const disbursementAmount = Number(payment?.amount || loan?.principal || 0);
    const disbursementDate = payment?.disbursed_at || loan?.start_date || null;

    const dobFormatted = formatDob(aadhaar?.dob, la?.dob);
    const address = (aadhaar?.address ? String(aadhaar.address).trim() : '')
      || (la?.office_address ? String(la.office_address).trim() : '')
      || (customer?.address ? String(customer.address).trim() : '')
      || (la?.city ? String(la.city).trim() : '')
      || '';

    const lastLoginVal = customer?.last_login_at || cc.last_login_at || la?.last_login_at || null;

    return {
      id: cc.id,
      loanId: cc.loanId,
      customerId: cc.customerId,
      customer: cc.customer,
      phone: cc.phone,
      totalDue: cc.totalDue,
      daysOverdue,
      dueDate,
      lastPaymentDate,
      status: cc.status,
      assignedTo: cc.assignedTo,
      memberCode: (la?.source_lead_id ? String(la.source_lead_id).trim() : '') || cc.customerId || '',
      borrowerName: (la?.full_name ? String(la.full_name).trim() : '') || cc.customer || '',
      gender: extractGender(aadhaar, la, customer, cibil),
      pan: extractPan(la, cibil, aadhaar, customer),
      aadhaar: la?.aadhaar_masked || la?.aadhaar_number || aadhaar?.aadhaar_masked || '',
      dob: dobFormatted,
      address,
      pincode: la?.pincode || '',
      rawResponse: aadhaar?.raw_response || '',
      sourcePayload: la?.source_payload || '',
      reference1Name: la?.reference1_name || '',
      reference1Phone: la?.reference1_mobile || '',
      reference1Relation: la?.reference1_relation || '',
      reference1Address: '',
      reference2Name: la?.reference2_name || '',
      reference2Phone: la?.reference2_mobile || '',
      reference2Relation: la?.reference2_relation || '',
      reference2Address: '',
      email: la?.email || la?.office_email || customer?.email || cibil?.email || '',
      companyName: la?.company_name || '',
      designation: la?.designation || '',
      experienceYears: la?.experience_years || '',
      employmentStatus: la?.employment_status || '',
      monthlyIncome: Number(la?.monthly_income || customer?.monthly_income || 0),
      loanPurpose: la?.loan_purpose || '',
      cibilScore: cibil?.score || null,
      loanType: la?.loan_type || '',
      bankName: la?.bank_name || '',
      bankAccountNumber: la?.account_number || '',
      ifscCode: la?.ifsc_code || '',
      principal,
      disbursementAmount,
      disbursementDate,
      baseRepayment: totalAmount,
      amountPaid,
      overdueInterest,
      baseOutstanding: balance,
      outstanding: balance,
      emiStatus,
      lastLoginAt: lastLoginVal,
      lastLogin: lastLoginVal,
    };
  });

  const { normalizeAadhaarResponse } = require('../services/aadhaarService');
  const mappedRows = rows.map((r) => {
    let rawAadhaar = null;
    if (r.rawResponse) {
      try {
        rawAadhaar = JSON.parse(r.rawResponse);
      } catch (e) {}
    }
    const norm = normalizeAadhaarResponse(rawAadhaar || {});

    let careOfFromAddress = '';
    if (r.address) {
      const match = r.address.match(/^(?:C\/O|S\/O|D\/O|W\/O)[\s,:]+([^,]+)/i);
      if (match) careOfFromAddress = match[1].trim();
    }

    const careOfRaw = norm.careOf || '';
    const cleanCareOf = careOfRaw ? careOfRaw.replace(/^(?:c\/o|s\/o|d\/o|w\/o)[\s,:]+/i, '').trim() : '';

    let payload = {};
    if (r.sourcePayload) {
      try {
        payload = typeof r.sourcePayload === 'string' ? JSON.parse(r.sourcePayload) : (r.sourcePayload || {});
      } catch (e) {}
    }

    const email = r.email || payload.email || payload.officeEmail || payload.office_email || payload.officialEmail || '';
    const companyName = r.companyName || payload.companyName || payload.company_name || payload.company || payload.employer || payload.employerName || payload.businessName || '';
    const expRaw = r.experienceYears || payload.experienceYears || payload.experience_years || payload.experience || payload.workExperience || payload.work_experience || payload.totalExperience || '';
    const experienceYears = expRaw ? (String(expRaw).toLowerCase().includes('year') ? String(expRaw) : `${expRaw} Years`) : '';
    const designation = r.designation || payload.designation || payload.jobTitle || payload.job_title || payload.occupation || '';
    const fatherName = norm.fatherName || payload.fatherName || payload.father_name || cleanCareOf || careOfFromAddress;
    const careOf = careOfRaw || (careOfFromAddress ? `C/O ${careOfFromAddress}` : '');
    const out = {
      ...r,
      email: email || '',
      companyName: companyName || '',
      designation: designation || '',
      experienceYears: experienceYears || '',
      gender: r.gender || norm.gender || '',
      fatherName: fatherName || '',
      careOf: careOf || '',
    };
    delete out.rawResponse;
    delete out.sourcePayload;
    return out;
  });

  const seenKeys = new Set();
  const uniqueMappedRows = [];
  for (const r of mappedRows) {
    const key = `${r.id}_${r.loanId}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueMappedRows.push(r);
    }
  }

  uniqueMappedRows.sort((a, b) => {
    const dDiff = (b.daysOverdue || 0) - (a.daysOverdue || 0);
    if (dDiff !== 0) return dDiff;
    const dateA = a.dueDate ? new Date(a.dueDate).getTime() : 0;
    const dateB = b.dueDate ? new Date(b.dueDate).getTime() : 0;
    return dateA - dateB;
  });

  collectionsListCache = {
    timestamp: Date.now(),
    data: uniqueMappedRows,
  };

  if (page > 0 && limit > 0) {
    const total = uniqueMappedRows.length;
    const offset = (page - 1) * limit;
    const paginatedRows = uniqueMappedRows.slice(offset, offset + limit);
    return res.json({
      success: true,
      data: paginatedRows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  }

  return success(res, uniqueMappedRows);
}

async function listCommission(req, res) {
  const rows = await referenceModel.all(`
    SELECT id, member_name AS memberName, volume, commission, clawback, payout
    FROM commissions
    ORDER BY commission DESC
  `);
  return success(res, rows);
}

async function listIncome(req, res) {
  const rows = await referenceModel.all(`
    SELECT id, source, today_amount AS today, month_amount AS month, trend
    FROM income_lines
    ORDER BY month_amount DESC
  `);
  return success(res, rows);
}

async function listInvoices(req, res) {
  const rows = await referenceModel.all(`
    SELECT id, payee, type, amount, status, due_date AS dueDate
    FROM invoices
    ORDER BY due_date ASC
  `);
  return success(res, rows);
}

module.exports = {
  invalidateCollectionsCache,
  listCollections,
  listCommission,
  listIncome,
  listInvoices,
  listTeam,
};
