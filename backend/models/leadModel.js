const fs = require('fs');
const path = require('path');
const { UPLOADS_ROOT } = require('../config/uploads');
const { query } = require('../config/db');
const { clean, generateApplicationId, likeParams } = require('../utils/strings');
const crmUserModel = require('./crmUserModel');

const TEXT_COLLATION = 'utf8mb4_unicode_ci';
const LEGACY_UPLOAD_BASE_URL = 'https://api.waqtmoney.com';
const WAQTFINANCE_UPLOAD_BASE_URL = 'https://waqtfinance.com/uploads';
const WAQTMONEY_UPLOAD_BASE_URL = 'https://api.waqtmoney.com';
const STATUS_TO_DB = {
  Contacted: 'submitted',
  Converted: 'disbursed',
  Closed: 'closed',
  'Document Collection': 'review',
  'Documents Pending': 'documents_pending',
  'In Process': 'review',
  Lost: 'rejected',
  New: 'draft',
  'Not Connected': 'not_connected',
  Pending: 'draft',
  Qualified: 'approved',
  Approved: 'approved',
  Rejected: 'rejected',
  'Send to Credit Manager': 'send_to_credit',
};
const PRIORITIES = new Set(['Low', 'Medium', 'High', 'Urgent']);
const SOURCE_SYSTEMS = new Set(['waqtfinance', 'waqtmoney', 'geetpay', 'loaninwallet', 'salarywaves']);

function sourceDisplaySql(sourceSystemExpression = 'source_system', sourceExpression = 'source', loanTypeExpression = 'loan_type') {
  return `COALESCE(NULLIF(TRIM(${sourceExpression}), ''), NULLIF(TRIM(${sourceSystemExpression}), ''), CONCAT('Manual - ', ${loanTypeExpression}))`;
}

function sourceSystemSql(sourceSystemExpression = 'source_system', sourceExpression = 'source') {
  return `LOWER(TRIM(COALESCE(NULLIF(TRIM(${sourceExpression}), ''), NULLIF(TRIM(${sourceSystemExpression}), ''), '')))`;
}

function defaultPrioritySql() {
  return `CASE
    WHEN loan_amount >= 200000 THEN 'High'
    WHEN loan_amount >= 50000 THEN 'Medium'
    ELSE 'Low'
  END`;
}

function textSql(expression) {
  return `CONVERT(${expression} USING utf8mb4) COLLATE ${TEXT_COLLATION}`;
}

function dateTimeSql(expression) {
  return `DATE_FORMAT(${expression}, '%Y-%m-%dT%H:%i:%s')`;
}

function normalizeRelativePath(value) {
  return String(value || '').trim().replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/^\/+/, '');
}

function sourceDocumentBaseUrl(sourceSystem) {
  const normalizedSource = String(sourceSystem || '').trim().toLowerCase();
  if (normalizedSource === 'waqtfinance') return WAQTFINANCE_UPLOAD_BASE_URL;
  if (normalizedSource === 'waqtmoney') return WAQTMONEY_UPLOAD_BASE_URL;
  return '';
}

function normalizeSourceDocumentPath(value, sourceSystem) {
  const rawValue = String(value || '').trim();
  if (!rawValue) return '';
  if (/^(https?:\/\/|data:image\/|blob:)/i.test(rawValue) || rawValue.startsWith('/uploads/')) return rawValue;

  const normalizedValue = normalizeRelativePath(rawValue);

  const sourceBaseUrl = sourceDocumentBaseUrl(sourceSystem);
  if (sourceBaseUrl) {
    const normalizedSource = String(sourceSystem || '').trim().toLowerCase();
    const sourceRelativePath = normalizedSource === 'waqtfinance'
      ? normalizeRelativePath(rawValue).replace(/^uploads?\//i, '')
      : normalizeRelativePath(rawValue);
    return `${sourceBaseUrl}/${sourceRelativePath}`;
  }

  if (/^uploads\/lead-documents\//i.test(normalizedValue)) {
    return `/${normalizedValue}`;
  }

  if (/^uploads?\//i.test(normalizedValue)) {
    return `${WAQTMONEY_UPLOAD_BASE_URL}/${normalizedValue}`;
  }

  if (/^uploads?\//i.test(normalizedValue)) {
    return `${LEGACY_UPLOAD_BASE_URL}/${normalizedValue}`;
  }

  return rawValue;
}

function normalizeLeadFilePath(value) {
  const rawValue = String(value || '').trim();
  if (!rawValue) return '';
  if (/^(https?:\/\/|data:image\/|blob:)/i.test(rawValue) || rawValue.startsWith('/uploads/')) return rawValue;

  const normalizedValue = normalizeRelativePath(rawValue);
  if (/^uploads?\//i.test(normalizedValue)) {
    return `${LEGACY_UPLOAD_BASE_URL}/${normalizedValue}`;
  }

  return rawValue;
}

function normalizeLeadFileFields(lead) {
  if (!lead) return lead;

  const normalizedLead = {
    ...lead,
    salarySlipCurrent: normalizeSourceDocumentPath(lead.salarySlipCurrent, lead.sourceSystem),
    salarySlipPrevious: normalizeSourceDocumentPath(lead.salarySlipPrevious, lead.sourceSystem),
    salarySlipOld: normalizeSourceDocumentPath(lead.salarySlipOld, lead.sourceSystem),
    companyIdCard: normalizeSourceDocumentPath(lead.companyIdCard, lead.sourceSystem),
    selfieImage: normalizeSourceDocumentPath(lead.selfieImage, lead.sourceSystem),
    videoKyc: normalizeSourceDocumentPath(lead.videoKyc, lead.sourceSystem),
  };

  return {
    ...normalizedLead,
    profileImageUrl: normalizedLead.selfieImage || '',
  };
}

function firstClean(...values) {
  for (const value of values) {
    const cleaned = clean(value || '');
    if (cleaned) return cleaned;
  }

  return '';
}

function isActiveApplicationStatus(dbStatus) {
  return !['closed', 'rejected'].includes(String(dbStatus || '').trim().toLowerCase());
}

function leadSqlWhere(whereClause = '') {
  return `
    SELECT
      ${textSql("COALESCE(NULLIF(application_id, ''), CONCAT('APP-', id))")} AS id,
      ${textSql("CAST(id AS CHAR)")} AS rawId,
      ${textSql("COALESCE(NULLIF(full_name, ''), CONCAT('Applicant ', id))")} AS name,
      ${textSql("COALESCE(email, '')")} AS email,
      ${textSql("mobile")} AS phone,
      ${textSql("mobile")} AS mobile,
      loan_amount AS loanAmount,
      COALESCE(loan_amount, 0) AS disbursedAmount,
      COALESCE(loan_amount, 0) AS approvedAmount,
      0 AS todayCollected,
      0 AS yesterdayCollected,
      0 AS thisMonthCollected,
      0 AS totalCollected,
      ${dateTimeSql('created_at')} AS disbursementDate,
      ${dateTimeSql('updated_at')} AS closedDate,
      ${textSql(sourceDisplaySql())} AS source,
      ${textSql(`CASE status
        WHEN 'draft' THEN 'New'
        WHEN 'submitted' THEN 'Contacted'
        WHEN 'review' THEN 'Document Collection'
        WHEN 'documents_pending' THEN 'Documents Pending'
        WHEN 'not_connected' THEN 'Not Connected'
        WHEN 'approved' THEN 'Qualified'
        WHEN 'rejected' THEN 'Lost'
        WHEN 'disbursed' THEN 'Converted'
        WHEN 'closed' THEN 'Closed'
        WHEN 'send_to_credit' THEN 'Send to Credit Manager'
        ELSE 'New'
      END`)} AS status,
      ${textSql(`COALESCE(NULLIF(priority, ''), ${defaultPrioritySql()})`)} AS priority,
      ${textSql("COALESCE(NULLIF(assigned_to, ''), 'Unassigned')")} AS assignedTo,
      ${textSql(`CASE
        WHEN assigned_to IS NULL OR assigned_to = '' THEN 'Intake Queue'
        ELSE 'Telecaller'
      END`)} AS assignedRole,
      ${dateTimeSql('created_at')} AS createdAt,
      ${dateTimeSql('created_at')} AS createdDate,
      NULL AS lastContact,
      0 AS creditScore,
      '' AS cibilReportUrl,
      ${textSql("COALESCE(employment_status, 'Pending review')")} AS employmentStatus,
      COALESCE(monthly_income, 0) AS monthlyIncome,
      ${textSql("COALESCE(city, '')")} AS city,
      ${textSql("COALESCE(pincode, '')")} AS pincode,
      ${textSql("COALESCE(pan_number, '')")} AS panNumber,
      ${textSql("COALESCE(uan_number, '')")} AS uanNumber,
      ${textSql("loan_type")} AS loanType,
      ${textSql("COALESCE(loan_purpose, '')")} AS loanPurpose,
      ${textSql("COALESCE(office_address, '')")} AS address,
      ${textSql("COALESCE(dob, '')")} AS dateOfBirth,
      ${textSql("COALESCE(company_name, '')")} AS companyName,
      ${textSql("COALESCE(designation, '')")} AS designation,
      ${textSql("COALESCE(NULLIF(office_email, ''), email, '')")} AS officeEmail,
      ${textSql("COALESCE(NULLIF(office_email, ''), email, '')")} AS officialEmail,
      COALESCE(official_email_verified, 0) AS officialEmailVerified,
      ${dateTimeSql("official_email_verified_at")} AS officialEmailVerifiedAt,
      ${textSql("COALESCE(official_email_verified_by, '')")} AS officialEmailVerifiedBy,
      ${textSql("COALESCE(emandate_provider, 'cashfree')")} AS emandateProvider,
      ${textSql("COALESCE(emandate_status, 'PENDING')")} AS emandateStatus,
      ${textSql("COALESCE(emandate_id, '')")} AS emandateId,
      ${textSql("COALESCE(emandate_auth_url, '')")} AS emandateAuthUrl,
      ${textSql("COALESCE(emandate_bank_name, '')")} AS emandateBankName,
      COALESCE(emandate_max_amount, 0) AS emandateMaxAmount,
      ${dateTimeSql("emandate_registered_at")} AS emandateRegisteredAt,
      ${textSql("COALESCE(bank_name, '')")} AS bankName,
      ${textSql("COALESCE(branch_name, '')")} AS branchName,
      ${textSql("COALESCE(account_holder, '')")} AS accountHolder,
      ${textSql("COALESCE(account_number, '')")} AS accountNumber,
      ${textSql("COALESCE(ifsc_code, '')")} AS ifscCode,
      ${textSql("COALESCE(salary_slip_current, '')")} AS salarySlipCurrent,
      ${textSql("COALESCE(salary_slip_previous, '')")} AS salarySlipPrevious,
      ${textSql("COALESCE(salary_slip_old, '')")} AS salarySlipOld,
      ${textSql("COALESCE(company_id_card, '')")} AS companyIdCard,
      ${textSql("COALESCE(selfie_image, '')")} AS selfieImage,
      ${textSql("COALESCE(video_kyc, '')")} AS videoKyc,
      ${textSql("COALESCE(aadhaar_unique_id, '')")} AS aadhaarUniqueId,
      ${textSql("COALESCE(aadhaar_number, '')")} AS aadhaarNumber,
      ${textSql("COALESCE(aadhaar_masked, '')")} AS aadhaarMasked,
      COALESCE(aadhaar_verified, 0) AS aadhaarVerified,
      ${textSql(sourceSystemSql())} AS sourceSystem,
      ${textSql("COALESCE(source_lead_id, '')")} AS sourceLeadId,
      ${textSql("COALESCE(source_application_id, '')")} AS sourceApplicationId,
      ${textSql("COALESCE(source_status, '')")} AS sourceStatus,
      ${textSql("COALESCE(reference1_name, '')")} AS reference1Name,
      ${textSql("COALESCE(reference1_mobile, '')")} AS reference1Mobile,
      ${textSql("COALESCE(reference1_relation, '')")} AS reference1Relation,
      ${textSql("COALESCE(reference2_name, '')")} AS reference2Name,
      ${textSql("COALESCE(reference2_mobile, '')")} AS reference2Mobile,
      ${textSql("COALESCE(reference2_relation, '')")} AS reference2Relation,
      ${textSql("COALESCE(additional_references, '')")} AS additionalReferences,
      COALESCE(is_active_application, 1) AS isActiveApplication,
      COALESCE(is_reloan, 0) AS isReloan,
      previous_loan_id AS previousLoanId,
      0 AS isDuplicate,
      0 AS duplicateCount,
      ${dateTimeSql('updated_at')} AS updatedAt
    FROM loan_applications
    ${whereClause ? `WHERE ${whereClause}` : ''}
  `;
}

function leadSql() {
  return leadSqlWhere();
}

function leadListSql() {
  return leadSql();
}

async function findAll(filters = {}) {
  await autoAssignUnassignedLeads();
  const { search = '', status = 'all', assignedTo = 'all', limit } = filters;
  const clauses = [];
  const params = [];

  if (search) {
    clauses.push('(application_id LIKE ? OR full_name LIKE ? OR email LIKE ? OR mobile LIKE ? OR pan_number LIKE ? OR city LIKE ?)');
    params.push(...likeParams(search, 6));
  }

  if (status !== 'all') {
    clauses.push(`(CASE status
      WHEN 'draft' THEN 'New'
      WHEN 'submitted' THEN 'Contacted'
      WHEN 'review' THEN 'Document Collection'
      WHEN 'documents_pending' THEN 'Documents Pending'
      WHEN 'not_connected' THEN 'Not Connected'
      WHEN 'approved' THEN 'Qualified'
      WHEN 'rejected' THEN 'Lost'
      WHEN 'disbursed' THEN 'Converted'
      WHEN 'closed' THEN 'Closed'
      WHEN 'send_to_credit' THEN 'Send to Credit Manager'
      ELSE 'New'
    END) = ?`);
    params.push(status);
  }

  if (assignedTo !== 'all') {
    clauses.push("COALESCE(NULLIF(assigned_to, ''), 'Unassigned') = ?");
    params.push(assignedTo);
  }

  if (filters.priority && filters.priority !== 'all') {
    clauses.push("priority = ?");
    params.push(filters.priority);
  }

  if (filters.sourceSystem && filters.sourceSystem !== 'all') {
    clauses.push("(LOWER(source_system) = ? OR LOWER(source) = ?)");
    params.push(String(filters.sourceSystem).trim().toLowerCase(), String(filters.sourceSystem).trim().toLowerCase());
  }

  if (filters.telecallerUser || filters.telecallerEmail) {
    const userName = String(filters.telecallerUser || '').trim().toLowerCase();
    const userEmail = String(filters.telecallerEmail || '').trim().toLowerCase();
    const userPrefix = userEmail.includes('@') ? userEmail.split('@')[0].trim() : '';

    const isSupportUser = userName.includes('support') || userEmail.includes('support');

    if (!isSupportUser) {
      clauses.push(`(
        LOWER(COALESCE(assigned_to, '')) = ? OR
        LOWER(COALESCE(assigned_to, '')) = ? OR
        LOWER(COALESCE(assigned_to, '')) = ? OR
        (? <> '' AND LOWER(COALESCE(assigned_to, '')) LIKE CONCAT('%', ?, '%')) OR
        (? <> '' AND ? LIKE CONCAT('%', LOWER(COALESCE(assigned_to, '')), '%'))
      ) AND LOWER(COALESCE(assigned_to, '')) NOT IN ('unassigned', 'intake queue', '', 'none', 'null')`);

      params.push(userName, userEmail, userPrefix, userName, userName, userPrefix, userPrefix);
    }
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  // Server-side total count calculation
  const countSql = `
    SELECT COUNT(*) AS total FROM loan_applications
    ${whereClause}
  `;
  const countRows = await query(countSql, params);
  const total = Number(countRows?.[0]?.total || 0);

  const parsedLimit = Math.min(Math.max(Number(limit || filters.pageSize) || 50, 1), 500);
  const parsedPage = Math.max(Number(filters.page) || 1, 1);
  const offset = (parsedPage - 1) * parsedLimit;

  const idSql = `
    SELECT id FROM loan_applications
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `;

  const queryParams = [...params, parsedLimit, offset];
  const idsRes = await query(idSql, queryParams);
  if (!idsRes || idsRes.length === 0) {
    const emptyResult = [];
    emptyResult.total = total;
    emptyResult.page = parsedPage;
    emptyResult.limit = parsedLimit;
    emptyResult.totalPages = Math.ceil(total / parsedLimit);
    return emptyResult;
  }

  const ids = idsRes.map((r) => r.id);
  const detailSql = `
    ${leadSqlWhere(`id IN (${ids.join(',')})`)}
    ORDER BY createdAt DESC
  `;

  let rows;
  try {
    rows = await query(detailSql);
  } catch (err) {
    if (err.message && (err.message.includes('official_email_verified') || err.message.includes('Unknown column'))) {
      const { ensureOfficialEmailColumns } = require('../database/schema');
      await ensureOfficialEmailColumns();
      rows = await query(detailSql);
    } else {
      throw err;
    }
  }
  const normalizedRows = rows.map(normalizeLeadFileFields);
  const enriched = await enrichDuplicates(normalizedRows);
  if (Array.isArray(enriched)) {
    enriched.total = total;
    enriched.page = parsedPage;
    enriched.limit = parsedLimit;
    enriched.totalPages = Math.ceil(total / parsedLimit);
  }
  return enriched;
}

async function enrichDuplicates(leads) {
  if (!leads) return leads;
  const isArray = Array.isArray(leads);
  const rawLeads = isArray ? leads : [leads];
  if (rawLeads.length === 0) return isArray ? [] : null;

  const mobiles = Array.from(new Set(rawLeads.map((l) => String(l.mobile || l.phone || '').trim()).filter(Boolean)));
  const pans = Array.from(new Set(rawLeads.map((l) => String(l.panNumber || l.pan_number || '').trim()).filter(Boolean)));
  const names = Array.from(new Set(rawLeads.map((l) => String(l.name || l.fullName || l.full_name || '').trim().toLowerCase()).filter(Boolean)));

  if (mobiles.length === 0 && pans.length === 0 && names.length === 0) {
    return leads;
  }

  const mobileCountsMap = {};
  const panCountsMap = {};
  const nameCountsMap = {};

  const queryPromises = [];

  if (mobiles.length > 0) {
    const placeholders = mobiles.map(() => '?').join(',');
    queryPromises.push(
      query(
        `SELECT mobile, COUNT(*) AS cnt FROM loan_applications WHERE mobile IN (${placeholders}) GROUP BY mobile`,
        mobiles
      ).then((mRows) => {
        (mRows || []).forEach((r) => { mobileCountsMap[r.mobile] = Number(r.cnt || 0); });
      }).catch(() => {})
    );
  }

  if (pans.length > 0) {
    const placeholders = pans.map(() => '?').join(',');
    queryPromises.push(
      query(
        `SELECT pan_number, COUNT(*) AS cnt FROM loan_applications WHERE pan_number IN (${placeholders}) GROUP BY pan_number`,
        pans
      ).then((pRows) => {
        (pRows || []).forEach((r) => { panCountsMap[r.pan_number] = Number(r.cnt || 0); });
      }).catch(() => {})
    );
  }

  if (names.length > 0) {
    const placeholders = names.map(() => '?').join(',');
    queryPromises.push(
      query(
        `SELECT TRIM(LOWER(full_name)) AS name_lower, COUNT(*) AS cnt FROM loan_applications WHERE TRIM(LOWER(full_name)) IN (${placeholders}) GROUP BY TRIM(LOWER(full_name))`,
        names
      ).then((nRows) => {
        (nRows || []).forEach((r) => { nameCountsMap[r.name_lower] = Number(r.cnt || 0); });
      }).catch(() => {})
    );
  }

  await Promise.all(queryPromises);

  const enriched = rawLeads.map((lead) => {
    const mob = String(lead.mobile || lead.phone || '').trim();
    const pan = String(lead.panNumber || lead.pan_number || '').trim();
    const nm = String(lead.name || lead.fullName || lead.full_name || '').trim().toLowerCase();

    const mCnt = mob && mobileCountsMap[mob] ? mobileCountsMap[mob] : 0;
    const pCnt = pan && panCountsMap[pan] ? panCountsMap[pan] : 0;
    const nCnt = nm && nameCountsMap[nm] ? nameCountsMap[nm] : 0;

    const dupMobile = mCnt > 1 ? mCnt - 1 : 0;
    const dupPan = pCnt > 1 ? pCnt - 1 : 0;
    const dupName = nCnt > 1 ? nCnt - 1 : 0;

    const duplicateCount = Math.max(dupMobile, dupPan, dupName);
    const isDuplicate = duplicateCount > 0 ? 1 : 0;

    return {
      ...lead,
      isDuplicate,
      duplicateCount,
    };
  });

  return isArray ? enriched : enriched[0];
}

async function findById(id) {
  const isNum = !isNaN(Number(id));
  const whereClause = isNum
    ? 'id = ? OR application_id = ?'
    : 'application_id = ?';
  const params = isNum ? [id, id] : [id];

  let rows;
  try {
    rows = await query(`${leadSqlWhere(whereClause)} LIMIT 1`, params);
  } catch (err) {
    if (err.message && (err.message.includes('official_email_verified') || err.message.includes('Unknown column'))) {
      const { ensureOfficialEmailColumns } = require('../database/schema');
      await ensureOfficialEmailColumns();
      rows = await query(`${leadSqlWhere(whereClause)} LIMIT 1`, params);
    } else {
      throw err;
    }
  }

  if (!rows || !rows[0]) return null;
  const lead = normalizeLeadFileFields(rows[0]);
  
  lead.references = referencesFromLeadColumns(lead);
  return await enrichDuplicates(lead);
}

function referencesFromLeadColumns(lead) {
  const referenceRows = [
    {
      fullName: lead.reference1Name,
      mobile: lead.reference1Mobile,
      relation: lead.reference1Relation,
      referenceType: 'primary',
    },
    {
      fullName: lead.reference2Name,
      mobile: lead.reference2Mobile,
      relation: lead.reference2Relation,
      referenceType: 'secondary',
    },
  ];

  let extra = [];
  if (lead.additionalReferences) {
    try {
      extra = typeof lead.additionalReferences === 'string'
        ? JSON.parse(lead.additionalReferences)
        : (Array.isArray(lead.additionalReferences) ? lead.additionalReferences : []);
    } catch (e) {}
  }

  const all = [
    ...referenceRows.filter((reference) => reference.fullName || reference.mobile || reference.relation),
    ...(Array.isArray(extra) ? extra : []),
  ];

  return all.map((reference, index) => ({
    id: reference.id || `${lead.rawId || lead.id}-inline-reference-${index + 1}`,
    leadId: lead.id,
    applicationId: lead.id,
    rawLeadId: lead.rawId,
    fullName: reference.fullName || reference.name || '',
    mobile: reference.mobile || reference.phone || '',
    relation: reference.relation || reference.relationship || '',
    referenceType: reference.referenceType || (index === 0 ? 'primary' : index === 1 ? 'secondary' : `reference_${index + 1}`),
    createdAt: lead.createdAt,
    updatedAt: lead.createdAt,
  }));
}

async function getStats() {
  const [stats] = await query(`
    SELECT
      COUNT(*) AS totalLeads,
      SUM(CASE WHEN status IN ('draft', 'pending') THEN 1 ELSE 0 END) AS newLeads,
      SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS qualifiedLeads
    FROM loan_applications
  `);

  return {
    totalLeads: Number(stats?.totalLeads || 0),
    newLeads: Number(stats?.newLeads || 0),
    qualifiedLeads: Number(stats?.qualifiedLeads || 0),
  };
}

async function getNextRoundRobinTelecaller() {
  try {
    const telecallers = await crmUserModel.listActiveTelecallers();
    if (!telecallers || telecallers.length === 0) {
      return '';
    }

    if (telecallers.length === 1) {
      return telecallers[0].name || '';
    }

    const recentAssigned = await query(`
      SELECT assigned_to
      FROM loan_applications
      WHERE assigned_to IS NOT NULL
        AND TRIM(assigned_to) <> ''
        AND LOWER(TRIM(assigned_to)) NOT IN ('unassigned', 'intake queue', 'none', 'null')
      ORDER BY id DESC
      LIMIT 50
    `);

    let lastIndex = -1;
    if (recentAssigned && recentAssigned.length > 0) {
      for (const row of recentAssigned) {
        const val = String(row.assigned_to || '').trim().toLowerCase();
        if (!val) continue;

        const foundIdx = telecallers.findIndex((t) => {
          const tName = String(t.name || '').trim().toLowerCase();
          const tEmail = String(t.email || '').trim().toLowerCase();
          const tId = String(t.id || '');
          const tPrefix = tEmail.includes('@') ? tEmail.split('@')[0].trim() : '';

          return (
            val === tName ||
            val === tEmail ||
            val === tId ||
            (tName && (val.includes(tName) || tName.includes(val))) ||
            (tPrefix && (val.includes(tPrefix) || tPrefix.includes(val)))
          );
        });

        if (foundIdx !== -1) {
          lastIndex = foundIdx;
          break;
        }
      }
    }

    const nextIndex = (lastIndex + 1) % telecallers.length;
    return telecallers[nextIndex].name || '';
  } catch (error) {
    console.error('Error in getNextRoundRobinTelecaller:', error);
    return '';
  }
}

function isLeadExplicitlyAssigned(assignedTo) {
  const val = String(assignedTo || '').trim().toLowerCase();
  if (!val) return false;

  const unassignedValues = [
    'unassigned', 'intake queue', 'intake', 'none', 'null', 'undefined',
    'website', 'system', 'testing form', 'integration api', 'public form',
    'waqtmoney', 'waqtfinance', 'geetpay', 'loaninwallet', 'salarywaves'
  ];

  return !unassignedValues.includes(val);
}

function isTelecallerActive(assignedTo, activeTelecallers = []) {
  const val = String(assignedTo || '').trim().toLowerCase();
  if (!val || ['unassigned', 'intake queue', 'intake', 'none', 'null', 'website', 'system', 'testing form', 'integration api', 'public form', 'waqtmoney', 'waqtfinance', 'geetpay', 'credit manager', 'credit-manager', 'shruti'].includes(val)) {
    return false;
  }

  return activeTelecallers.some((t) => {
    const tName = String(t.name || '').trim().toLowerCase();
    const tEmail = String(t.email || '').trim().toLowerCase();
    const tId = String(t.id || '');
    const tPrefix = tEmail.includes('@') ? tEmail.split('@')[0].trim() : '';

    return (
      val === tName ||
      val === tEmail ||
      val === tId ||
      (tName && (val.includes(tName) || tName.includes(val))) ||
      (tPrefix && (val.includes(tPrefix) || tPrefix.includes(val)))
    );
  });
}

async function autoAssignUnassignedLeads() {
  try {
    const telecallers = await crmUserModel.listActiveTelecallers();
    if (!telecallers || telecallers.length === 0) {
      return 0;
    }

    const unassignedRows = await query(`
      SELECT id, assigned_to
      FROM loan_applications
      WHERE assigned_to IS NULL
         OR TRIM(assigned_to) = ''
         OR LOWER(TRIM(assigned_to)) IN (
           'unassigned', 'intake queue', 'intake', 'none', 'null', 'undefined',
           'website', 'system', 'testing form', 'integration api', 'public form',
           'waqtmoney', 'waqtfinance', 'geetpay', 'loaninwallet', 'salarywaves'
         )
      ORDER BY id ASC
    `);

    if (!unassignedRows || unassignedRows.length === 0) {
      return 0;
    }

    // Find current starting telecaller index once
    const recentAssigned = await query(`
      SELECT assigned_to
      FROM loan_applications
      WHERE assigned_to IS NOT NULL
        AND TRIM(assigned_to) <> ''
        AND LOWER(TRIM(assigned_to)) NOT IN ('unassigned', 'intake queue', 'none', 'null', 'credit manager', 'credit-manager', 'shruti')
      ORDER BY id DESC
      LIMIT 50
    `);

    let lastIndex = -1;
    if (recentAssigned && recentAssigned.length > 0) {
      for (const row of recentAssigned) {
        const val = String(row.assigned_to || '').trim().toLowerCase();
        if (!val) continue;

        const foundIdx = telecallers.findIndex((t) => {
          const tName = String(t.name || '').trim().toLowerCase();
          const tEmail = String(t.email || '').trim().toLowerCase();
          const tId = String(t.id || '');
          const tPrefix = tEmail.includes('@') ? tEmail.split('@')[0].trim() : '';

          return (
            val === tName ||
            val === tEmail ||
            val === tId ||
            (tName && (val.includes(tName) || tName.includes(val))) ||
            (tPrefix && (val.includes(tPrefix) || tPrefix.includes(val)))
          );
        });

        if (foundIdx !== -1) {
          lastIndex = foundIdx;
          break;
        }
      }
    }

    // Group leads by telecaller name for batch updates
    const assignmentsByTelecaller = new Map();
    let currentIndex = (lastIndex + 1) % telecallers.length;

    for (const row of unassignedRows) {
      const assignedName = telecallers[currentIndex]?.name || '';
      if (!assignedName) break;

      if (!assignmentsByTelecaller.has(assignedName)) {
        assignmentsByTelecaller.set(assignedName, []);
      }
      assignmentsByTelecaller.get(assignedName).push(row.id);
      currentIndex = (currentIndex + 1) % telecallers.length;
    }

    let assignedCount = 0;
    for (const [telecallerName, leadIds] of assignmentsByTelecaller.entries()) {
      if (leadIds.length > 0) {
        const placeholders = leadIds.map(() => '?').join(',');
        await query(
          `UPDATE loan_applications SET assigned_to = ? WHERE id IN (${placeholders})`,
          [telecallerName, ...leadIds]
        );
        assignedCount += leadIds.length;
      }
    }

    return assignedCount;
  } catch (error) {
    console.error('Error in autoAssignUnassignedLeads:', error);
    return 0;
  }
}

async function create(payload) {
  await autoAssignUnassignedLeads();
  const applicationId = await generateApplicationId(payload.sourceSystem);
  const dbStatus = validateStatus(payload.status || 'Pending');

  let assignedTo = clean(payload.assignedTo || '');
  if (!isLeadExplicitlyAssigned(assignedTo)) {
    assignedTo = await getNextRoundRobinTelecaller();
  }

  await query(`
    INSERT INTO loan_applications (
      application_id, loan_type, full_name, mobile, email, dob, pan_number, uan_number,
      aadhaar_number, aadhaar_unique_id, employment_status, monthly_income, city, pincode, loan_amount,
      loan_purpose, company_name, designation, office_email, office_address,
      reference1_name, reference1_mobile, reference1_relation, reference2_name, reference2_mobile,
      reference2_relation, bank_name, branch_name, account_holder, account_number, ifsc_code,
      priority, assigned_to, status, is_active_application
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    applicationId,
    payload.loanType || 'payday',
    clean(payload.name),
    clean(payload.phone),
    clean(payload.email || ''),
    optionalDate(payload.dob || payload.dateOfBirth),
    clean(payload.panNumber || payload.pan || ''),
    clean(payload.uanNumber || ''),
    clean(payload.aadhaarNumber || payload.aadhaar || ''),
    clean(payload.aadhaarUniqueId || payload.aadhaarUid || ''),
    payload.employmentStatus || 'salaried',
    Number(payload.monthlyIncome || 0),
    clean(payload.city || ''),
    clean(payload.pincode || ''),
    Number(payload.loanAmount),
    clean(payload.loanPurpose || ''),
    clean(payload.companyName || ''),
    clean(payload.designation || ''),
    clean(payload.officeEmail || ''),
    clean(payload.officeAddress || payload.address || ''),
    clean(payload.reference1Name || ''),
    clean(payload.reference1Mobile || ''),
    clean(payload.reference1Relation || ''),
    clean(payload.reference2Name || ''),
    clean(payload.reference2Mobile || ''),
    clean(payload.reference2Relation || ''),
    clean(payload.bankName || ''),
    clean(payload.branchName || ''),
    clean(payload.accountHolder || ''),
    clean(payload.accountNumber || ''),
    clean(payload.ifscCode || ''),
    PRIORITIES.has(payload.priority) ? payload.priority : 'Medium',
    assignedTo,
    dbStatus,
    isActiveApplicationStatus(dbStatus) ? 1 : 0,
  ]);

  return findById(applicationId);
}

function activeLookupClauses(payload = {}) {
  const lookup = {
    phone: clean(payload.phone || payload.mobile || ''),
    email: clean(payload.email || '').toLowerCase(),
    pan: clean(payload.pan || payload.panNumber || '').toUpperCase(),
    aadhaar: clean(payload.aadhaar || payload.aadhaarNumber || payload.aadhaarUniqueId || payload.aadhaarUid || ''),
  };

  const clauses = [];
  const params = [];

  if (lookup.phone) {
    clauses.push('mobile = ?');
    params.push(lookup.phone);
  }
  if (lookup.email) {
    clauses.push('LOWER(email) = ?');
    params.push(lookup.email);
  }
  if (lookup.pan) {
    clauses.push('UPPER(pan_number) = ?');
    params.push(lookup.pan);
  }
  if (lookup.aadhaar) {
    clauses.push('(aadhaar_number = ? OR aadhaar_unique_id = ?)');
    params.push(lookup.aadhaar, lookup.aadhaar);
  }

  return { clauses, params };
}

async function findActiveApplication(payload = {}) {
  const { clauses, params } = activeLookupClauses(payload);
  if (!clauses.length) {
    const error = new Error('Provide phone, email, pan, or aadhaar to check active application.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  const rows = await query(`
    SELECT application_id AS applicationId
    FROM loan_applications
    WHERE (${clauses.join(' OR ')})
      AND COALESCE(is_active_application, 1) = 1
      AND LOWER(status) NOT IN ('rejected', 'closed', 'cancelled', 'deleted', 'trash')
      AND LOWER(COALESCE(source_status, '')) NOT IN ('rejected', 'closed', 'cancelled', 'deleted', 'trash')
    ORDER BY updated_at DESC, id DESC
    LIMIT 1
  `, params);

  if (!rows.length) return null;
  return findById(rows[0].applicationId);
}

async function checkActiveLoanOrApplication(payload = {}) {
  const { phone, email, pan } = payload;
  const lookupPayload = {};
  if (phone) lookupPayload.phone = phone;
  if (payload.mobile) lookupPayload.mobile = payload.mobile;
  if (email) lookupPayload.email = email;
  if (pan) lookupPayload.pan = pan;
  if (payload.panNumber) lookupPayload.panNumber = payload.panNumber;

  const { clauses, params } = activeLookupClauses(lookupPayload);
  if (!clauses.length) {
    const error = new Error('Provide phone, email, or pan to check active application.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  const rows = await query(`
    SELECT status, source_status AS sourceStatus
    FROM loan_applications
    WHERE (${clauses.join(' OR ')})
    ORDER BY updated_at DESC, id DESC
  `, params);

  return rows;
}

function normalizeSourceSystem(value) {
  const sourceSystem = clean(value).toLowerCase();
  if (!SOURCE_SYSTEMS.has(sourceSystem)) {
    const error = new Error('sourceSystem must be one of: waqtfinance, waqtmoney, geetpay, loaninwallet, salarywaves.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  return sourceSystem;
}

function requiredSourceFields(payload) {
  return ['sourceSystem', 'sourceLeadId', 'name', 'phone', 'loanAmount']
    .filter((field) => payload[field] === undefined || payload[field] === null || String(payload[field]).trim() === '');
}

function optionalDate(value) {
  const text = clean(value);
  return text || null;
}

function sourcePayloadJson(payload) {
  return JSON.stringify(payload.rawPayload === undefined ? payload : payload.rawPayload);
}

function sourceStatusFromPayload(payload = {}) {
  const rawPayload = payload.rawPayload && typeof payload.rawPayload === 'object' ? payload.rawPayload : {};
  return clean(
    payload.sourceStatus ||
    payload.sourceLeadStatus ||
    payload.applicationStatus ||
    payload.leadStatus ||
    rawPayload.sourceStatus ||
    rawPayload.sourceLeadStatus ||
    rawPayload.applicationStatus ||
    rawPayload.leadStatus ||
    rawPayload.status ||
    '',
  );
}

function normalizeReferenceType(value, index) {
  const fallback = index === 0 ? 'primary' : index === 1 ? 'secondary' : `reference_${index + 1}`;
  const normalized = clean(value || fallback).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  if (['primary', 'reference1', 'reference_1', 'ref1', 'ref_1', 'first', 'first_reference'].includes(normalized)) {
    return 'primary';
  }
  if (['secondary', 'reference2', 'reference_2', 'ref2', 'ref_2', 'second', 'second_reference'].includes(normalized)) {
    return 'secondary';
  }
  return normalized;
}

function normalizeSourceReferences(payload = {}) {
  const rawPayload = payload.rawPayload && typeof payload.rawPayload === 'object' ? payload.rawPayload : {};
  const payloadSources = [payload, rawPayload];
  const explicitReferences = payloadSources.flatMap((source) => (
    Array.isArray(source.references)
      ? source.references
      : Array.isArray(source.referenceDetails)
        ? source.referenceDetails
        : Array.isArray(source.loanReferences)
          ? source.loanReferences
          : []
  ));
  const references = explicitReferences.map((reference, index) => ({
    referenceType: normalizeReferenceType(reference.referenceType || reference.reference_type || reference.type, index),
    fullName: clean(reference.fullName || reference.full_name || reference.name || reference.referenceName || reference.reference_name || ''),
    mobile: clean(reference.mobile || reference.phone || reference.mobileNumber || reference.mobile_number || reference.referenceMobile || reference.reference_mobile || ''),
    relation: clean(reference.relation || reference.relationship || reference.referenceRelation || reference.reference_relation || ''),
  }));

  const legacyReferences = payloadSources.flatMap((source) => [
    {
      referenceType: 'primary',
      fullName: source.reference1Name || source.reference1_name || source.ref1Name || source.ref1_name || source.reference1?.fullName || source.reference1?.full_name || source.reference1?.name,
      mobile: source.reference1Mobile || source.reference1_mobile || source.ref1Mobile || source.ref1_mobile || source.reference1?.mobile || source.reference1?.phone || source.reference1?.mobileNumber || source.reference1?.mobile_number,
      relation: source.reference1Relation || source.reference1_relation || source.ref1Relation || source.ref1_relation || source.reference1?.relation || source.reference1?.relationship,
    },
    {
      referenceType: 'secondary',
      fullName: source.reference2Name || source.reference2_name || source.ref2Name || source.ref2_name || source.reference2?.fullName || source.reference2?.full_name || source.reference2?.name,
      mobile: source.reference2Mobile || source.reference2_mobile || source.ref2Mobile || source.ref2_mobile || source.reference2?.mobile || source.reference2?.phone || source.reference2?.mobileNumber || source.reference2?.mobile_number,
      relation: source.reference2Relation || source.reference2_relation || source.ref2Relation || source.ref2_relation || source.reference2?.relation || source.reference2?.relationship,
    },
  ]);

  for (const reference of legacyReferences) {
    const normalized = {
      referenceType: reference.referenceType,
      fullName: clean(reference.fullName || ''),
      mobile: clean(reference.mobile || ''),
      relation: clean(reference.relation || ''),
    };
    if (!normalized.fullName && !normalized.mobile && !normalized.relation) continue;

    const existingIndex = references.findIndex((item) => item.referenceType === normalized.referenceType);
    if (existingIndex >= 0) {
      references[existingIndex] = {
        ...references[existingIndex],
        fullName: normalized.fullName || references[existingIndex].fullName,
        mobile: normalized.mobile || references[existingIndex].mobile,
        relation: normalized.relation || references[existingIndex].relation,
      };
    } else {
      references.push(normalized);
    }
  }

  return references.filter((reference) => reference.fullName || reference.mobile || reference.relation);
}

async function normalizeUnworkedImportedLeadStatus(sourceSystem, sourceLeadId) {
  await query(`
    UPDATE loan_applications la
    SET la.status = 'draft'
    WHERE la.source_system = ?
      AND la.source_lead_id = ?
      AND la.status = 'submitted'
      AND la.ingested_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM lead_call_logs lcl
        WHERE lcl.application_id = la.application_id
          OR lcl.lead_id = CAST(la.id AS CHAR)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM lead_credit_handoffs lch
        WHERE lch.application_id = la.application_id
          OR lch.lead_id = CAST(la.id AS CHAR)
      )
  `, [sourceSystem, sourceLeadId]);
}

async function upsertFromSource(payload = {}) {
  const missing = requiredSourceFields(payload);
  if (missing.length) {
    const error = new Error(`Missing required field(s): ${missing.join(', ')}`);
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  const sourceSystem = normalizeSourceSystem(payload.sourceSystem);
  const sourceLeadId = clean(payload.sourceLeadId);
  const sourceApplicationId = clean(payload.sourceApplicationId || '');
  const sourceStatus = sourceStatusFromPayload(payload);
  const sourceReferences = normalizeSourceReferences(payload);
  const primaryReference = sourceReferences.find((reference) => reference.referenceType === 'primary') || {};
  const secondaryReference = sourceReferences.find((reference) => reference.referenceType === 'secondary') || {};
  const existingRows = (sourceSystem && sourceLeadId) ? await query(`
    SELECT application_id AS applicationId
    FROM loan_applications
    WHERE source_system = ? AND source_lead_id = ?
    LIMIT 1
  `, [sourceSystem, sourceLeadId]) : [];
  if (!existingRows.length) {
    const activeApplication = await findActiveApplication(payload);
    if (activeApplication) {
      const error = new Error('You already have an active application.');
      error.statusCode = 409;
      error.publicMessage = error.message;
      throw error;
    }
  }

  const applicationId = existingRows[0]?.applicationId || await generateApplicationId(sourceSystem);
  let assignedTo = clean(payload.assignedTo || payload.assigned_to || '');
  const telecallers = await crmUserModel.listActiveTelecallers();
  if (!isTelecallerActive(assignedTo, telecallers)) {
    assignedTo = await getNextRoundRobinTelecaller();
  }

  const values = [
    applicationId,
    payload.loanType || 'payday',
    clean(payload.name),
    clean(payload.phone),
    clean(payload.email || ''),
    optionalDate(payload.dob || payload.dateOfBirth),
    clean(payload.panNumber || payload.pan || ''),
    clean(payload.uanNumber || ''),
    clean(payload.aadhaarNumber || ''),
    clean(payload.aadhaarUniqueId || payload.aadhaar_uid || payload.aadhaarUid || ''),
    payload.employmentStatus || 'salaried',
    Number(payload.monthlyIncome || 0),
    clean(payload.city || ''),
    clean(payload.pincode || ''),
    Number(payload.loanAmount || 0),
    clean(payload.loanPurpose || ''),
    clean(payload.companyName || ''),
    clean(payload.designation || ''),
    clean(payload.officeEmail || ''),
    clean(payload.officeAddress || payload.address || ''),
    primaryReference.fullName || '',
    primaryReference.mobile || '',
    primaryReference.relation || '',
    secondaryReference.fullName || '',
    secondaryReference.mobile || '',
    secondaryReference.relation || '',
    clean(payload.bankName || ''),
    clean(payload.branchName || ''),
    clean(payload.accountHolder || ''),
    clean(payload.accountNumber || ''),
    clean(payload.ifscCode || ''),
    firstClean(payload.salarySlipCurrent, payload.salary_slip_current, payload.currentSalarySlip, payload.current_salary_slip),
    firstClean(payload.salarySlipPrevious, payload.salary_slip_previous, payload.previousSalarySlip, payload.previous_salary_slip),
    firstClean(payload.salarySlipOld, payload.salary_slip_old, payload.oldSalarySlip, payload.old_salary_slip),
    firstClean(payload.companyIdCard, payload.company_id_card, payload.companyId, payload.company_id),
    firstClean(payload.selfieImage, payload.selfie_image, payload.selfie),
    firstClean(payload.videoKyc, payload.video_kyc, payload.videoKYC, payload.videoKycUrl, payload.video_kyc_url),
    sourceSystem,
    sourceSystem,
    sourceLeadId,
    sourceApplicationId,
    sourceStatus,
    sourcePayloadJson(payload),
    assignedTo,
    1,
  ];

  await query(`
    INSERT INTO loan_applications (
      application_id, loan_type, full_name, mobile, email, dob, pan_number, uan_number,
      aadhaar_number, aadhaar_unique_id, employment_status, monthly_income, city, pincode, loan_amount,
      loan_purpose, company_name, designation, office_email, office_address,
      reference1_name, reference1_mobile, reference1_relation, reference2_name, reference2_mobile,
      reference2_relation, bank_name, branch_name, account_holder, account_number, ifsc_code, salary_slip_current,
      salary_slip_previous, salary_slip_old, company_id_card, selfie_image, video_kyc,
      source, source_system, source_lead_id, source_application_id, source_status, source_payload, ingested_at,
      assigned_to, status, is_active_application
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, 'draft', ?)
    ON DUPLICATE KEY UPDATE
      assigned_to = COALESCE(NULLIF(assigned_to, ''), VALUES(assigned_to)),
      loan_type = VALUES(loan_type),
      full_name = VALUES(full_name),
      mobile = VALUES(mobile),
      email = VALUES(email),
      dob = VALUES(dob),
      pan_number = VALUES(pan_number),
      uan_number = VALUES(uan_number),
      aadhaar_number = VALUES(aadhaar_number),
      aadhaar_unique_id = VALUES(aadhaar_unique_id),
      employment_status = VALUES(employment_status),
      monthly_income = VALUES(monthly_income),
      city = VALUES(city),
      pincode = VALUES(pincode),
      loan_amount = VALUES(loan_amount),
      loan_purpose = VALUES(loan_purpose),
      company_name = VALUES(company_name),
      designation = VALUES(designation),
      office_email = VALUES(office_email),
      office_address = VALUES(office_address),
      reference1_name = COALESCE(NULLIF(VALUES(reference1_name), ''), reference1_name),
      reference1_mobile = COALESCE(NULLIF(VALUES(reference1_mobile), ''), reference1_mobile),
      reference1_relation = COALESCE(NULLIF(VALUES(reference1_relation), ''), reference1_relation),
      reference2_name = COALESCE(NULLIF(VALUES(reference2_name), ''), reference2_name),
      reference2_mobile = COALESCE(NULLIF(VALUES(reference2_mobile), ''), reference2_mobile),
      reference2_relation = COALESCE(NULLIF(VALUES(reference2_relation), ''), reference2_relation),
      bank_name = VALUES(bank_name),
      branch_name = VALUES(branch_name),
      account_holder = VALUES(account_holder),
      account_number = VALUES(account_number),
      ifsc_code = VALUES(ifsc_code),
      salary_slip_current = VALUES(salary_slip_current),
      salary_slip_previous = VALUES(salary_slip_previous),
      salary_slip_old = VALUES(salary_slip_old),
      company_id_card = VALUES(company_id_card),
      selfie_image = VALUES(selfie_image),
      video_kyc = VALUES(video_kyc),
      source = VALUES(source),
      source_system = VALUES(source_system),
      source_application_id = VALUES(source_application_id),
      source_status = VALUES(source_status),
      source_payload = VALUES(source_payload),
      is_active_application = CASE
        WHEN status IN ('closed', 'rejected') THEN 0
        ELSE 1
      END,
      ingested_at = CURRENT_TIMESTAMP
  `, values);

  await normalizeUnworkedImportedLeadStatus(sourceSystem, sourceLeadId);

  const refreshedRows = (sourceSystem && sourceLeadId) ? await query(`
    SELECT application_id AS applicationId
    FROM loan_applications
    WHERE source_system = ? AND source_lead_id = ?
    LIMIT 1
  `, [sourceSystem, sourceLeadId]) : [];

  const targetAppId = refreshedRows[0]?.applicationId || applicationId;

  await autoAssignUnassignedLeads();

  const lead = await findById(targetAppId);
  return {
    created: !existingRows.length,
    lead,
  };
}


async function updateStatus(id, status) {
  const dbStatus = STATUS_TO_DB[status];
  if (!dbStatus) {
    const error = new Error('Invalid lead status.');
    error.statusCode = 400;
    error.publicMessage = 'Invalid lead status.';
    throw error;
  }

  const lead = await findById(id);
  if (!lead) return null;

  await query('UPDATE loan_applications SET status = ?, is_active_application = ? WHERE id = ?', [
    dbStatus,
    isActiveApplicationStatus(dbStatus) ? 1 : 0,
    lead.rawId,
  ]);
  return findById(id);
}

function validateStatus(status) {
  if (status === undefined) return undefined;
  const dbStatus = STATUS_TO_DB[status];
  if (!dbStatus) {
    const error = new Error('Invalid lead status.');
    error.statusCode = 400;
    error.publicMessage = 'Invalid lead status.';
    throw error;
  }

  return dbStatus;
}

function validatePriority(priority) {
  if (priority === undefined) return undefined;
  if (!PRIORITIES.has(priority)) {
    const error = new Error('Invalid lead priority.');
    error.statusCode = 400;
    error.publicMessage = 'Invalid lead priority.';
    throw error;
  }

  return priority;
}

async function updateOperations(id, payload = {}) {
  const lead = await findById(id);
  if (!lead) return null;

  const updates = [];
  const params = [];
  const dbStatus = validateStatus(payload.status);
  const priority = validatePriority(payload.priority);

  if (dbStatus !== undefined) {
    updates.push('status = ?');
    params.push(dbStatus);
    updates.push('is_active_application = ?');
    params.push(isActiveApplicationStatus(dbStatus) ? 1 : 0);
  }

  if (priority !== undefined) {
    updates.push('priority = ?');
    params.push(priority);
  }

  if (payload.assignedTo !== undefined) {
    const rawAssigned = clean(payload.assignedTo);
    const assignedLower = rawAssigned.toLowerCase();
    if (assignedLower === 'credit manager' || assignedLower.includes('shruti') || assignedLower === 'credit-manager') {
      // Preserve existing telecaller assignment (Kajal/Nandini) and transition status to send_to_credit
      if (payload.status === undefined) {
        updates.push('status = ?');
        params.push('send_to_credit');
        updates.push('is_active_application = ?');
        params.push(1);
      }
    } else {
      updates.push('assigned_to = ?');
      params.push(rawAssigned === 'Unassigned' ? '' : rawAssigned);
    }
  }

  if (!updates.length) return lead;

  params.push(lead.rawId);
  await query(`UPDATE loan_applications SET ${updates.join(', ')} WHERE id = ?`, params);

  const updatedLead = await findById(id);
  return updatedLead;
}

async function updateContactInfo(id, { email, phone }) {
  const lead = await findById(id);
  if (!lead) return null;

  const updates = [];
  const params = [];

  if (email && String(email).trim()) {
    const cleanedEmail = String(email).trim().toLowerCase();
    updates.push('email = ?');
    params.push(cleanedEmail);
    try {
      await query(`UPDATE lead_sanctions SET email_to = ?, borrower_email = ? WHERE lead_id = ? OR application_id = ?`, [cleanedEmail, cleanedEmail, lead.rawId, lead.id]);
    } catch (e) {
      console.warn('Failed to sync lead_sanctions email:', e.message);
    }
  }

  if (phone && String(phone).trim()) {
    updates.push('mobile = ?');
    params.push(String(phone).trim());
  }

  if (!updates.length) return lead;

  params.push(lead.rawId);
  await query(`UPDATE loan_applications SET ${updates.join(', ')} WHERE id = ?`, params);
  return findById(id);
}

async function updateReferences(id, referencesData) {
  const lead = await findById(id);
  if (!lead) return null;

  let referencesList = [];
  if (Array.isArray(referencesData)) {
    referencesList = referencesData;
  } else if (referencesData && typeof referencesData === 'object') {
    if (Array.isArray(referencesData.references)) {
      referencesList = referencesData.references;
    } else {
      referencesList = [
        {
          fullName: referencesData.reference1Name || referencesData.primary?.fullName || '',
          mobile: referencesData.reference1Mobile || referencesData.primary?.mobile || '',
          relation: referencesData.reference1Relation || referencesData.primary?.relation || '',
          referenceType: 'primary',
        },
        {
          fullName: referencesData.reference2Name || referencesData.secondary?.fullName || '',
          mobile: referencesData.reference2Mobile || referencesData.secondary?.mobile || '',
          relation: referencesData.reference2Relation || referencesData.secondary?.relation || '',
          referenceType: 'secondary',
        },
      ];
    }
  }

  const cleanRef = (ref, defaultType) => ({
    fullName: String(ref.fullName || ref.name || '').trim(),
    mobile: String(ref.mobile || ref.phone || '').trim(),
    relation: String(ref.relation || ref.relationship || '').trim(),
    referenceType: ref.referenceType || defaultType,
  });

  const ref1 = referencesList[0] ? cleanRef(referencesList[0], 'primary') : { fullName: '', mobile: '', relation: '', referenceType: 'primary' };
  const ref2 = referencesList[1] ? cleanRef(referencesList[1], 'secondary') : { fullName: '', mobile: '', relation: '', referenceType: 'secondary' };

  const extraReferences = referencesList.slice(2).map((ref, i) => cleanRef(ref, ref.referenceType || `reference_${i + 3}`)).filter(r => r.fullName || r.mobile || r.relation);

  const additionalJson = extraReferences.length ? JSON.stringify(extraReferences) : null;

  await query(
    `UPDATE loan_applications 
     SET reference1_name = ?, reference1_mobile = ?, reference1_relation = ?,
         reference2_name = ?, reference2_mobile = ?, reference2_relation = ?,
         additional_references = ?
     WHERE id = ?`,
    [ref1.fullName, ref1.mobile, ref1.relation, ref2.fullName, ref2.mobile, ref2.relation, additionalJson, lead.rawId]
  );

  return findById(id);
}

async function addReference(id, referenceData) {
  const lead = await findById(id);
  if (!lead) return null;

  const fullName = String(referenceData.fullName || referenceData.name || '').trim();
  const relation = String(referenceData.relation || referenceData.relationship || '').trim();
  const mobile = String(referenceData.mobile || referenceData.phone || '').trim();
  const referenceType = referenceData.referenceType || '';

  if (!fullName && !mobile && !relation) {
    return lead;
  }

  // 1. If reference1 is empty or missing name/mobile, populate reference1
  if (!lead.reference1Name && !lead.reference1Mobile) {
    await query(
      `UPDATE loan_applications 
       SET reference1_name = ?, reference1_mobile = ?, reference1_relation = ? 
       WHERE id = ?`,
      [fullName, mobile, relation, lead.rawId]
    );
    return findById(id);
  }

  // 2. If reference2 is empty or missing name/mobile, populate reference2
  if (!lead.reference2Name && !lead.reference2Mobile) {
    await query(
      `UPDATE loan_applications 
       SET reference2_name = ?, reference2_mobile = ?, reference2_relation = ? 
       WHERE id = ?`,
      [fullName, mobile, relation, lead.rawId]
    );
    return findById(id);
  }

  // 3. Otherwise, append to additional_references JSON
  let extra = [];
  if (lead.additionalReferences) {
    try {
      extra = typeof lead.additionalReferences === 'string'
        ? JSON.parse(lead.additionalReferences)
        : (Array.isArray(lead.additionalReferences) ? lead.additionalReferences : []);
    } catch (e) {}
  }

  const nextIndex = extra.length + 3;
  extra.push({
    fullName,
    relation,
    mobile,
    referenceType: referenceType || `reference_${nextIndex}`,
  });

  await query(
    `UPDATE loan_applications SET additional_references = ? WHERE id = ?`,
    [JSON.stringify(extra), lead.rawId]
  );

  return findById(id);
}

async function updateOfficialEmailVerification(id, { verified = 1, verifiedAt = new Date(), verifiedBy = 'Credit User' } = {}) {
  const lead = await findById(id);
  if (!lead) return null;

  const formattedDate = verifiedAt instanceof Date
    ? verifiedAt.toISOString().slice(0, 19).replace('T', ' ')
    : String(verifiedAt || '').trim();

  try {
    await query(`
      UPDATE loan_applications
      SET official_email_verified = ?,
          official_email_verified_at = ?,
          official_email_verified_by = ?
      WHERE id = ? OR application_id = ?
    `, [verified ? 1 : 0, formattedDate, String(verifiedBy || 'Credit User').trim(), lead.rawId, lead.id]);
  } catch (err) {
    if (err.message && (err.message.includes('official_email_verified') || err.message.includes('Unknown column'))) {
      const { ensureOfficialEmailColumns } = require('../database/schema');
      await ensureOfficialEmailColumns();
      await query(`
        UPDATE loan_applications
        SET official_email_verified = ?,
            official_email_verified_at = ?,
            official_email_verified_by = ?
        WHERE id = ? OR application_id = ?
      `, [verified ? 1 : 0, formattedDate, String(verifiedBy || 'Credit User').trim(), lead.rawId, lead.id]);
    } else {
      throw err;
    }
  }

  return findById(id);
}

async function updateOfficialEmail(id, officeEmail) {
  const lead = await findById(id);
  if (!lead) return null;

  const cleanedEmail = String(officeEmail || '').trim().toLowerCase();

  try {
    await query(`
      UPDATE loan_applications
      SET office_email = ?,
          official_email_verified = 0,
          official_email_verified_at = NULL,
          official_email_verified_by = NULL
      WHERE id = ? OR application_id = ?
    `, [cleanedEmail, lead.rawId, lead.id]);
  } catch (err) {
    if (err.message && (err.message.includes('official_email_verified') || err.message.includes('Unknown column') || err.message.includes('office_email'))) {
      const { ensureOfficialEmailColumns } = require('../database/schema');
      await ensureOfficialEmailColumns();
      await query(`
        UPDATE loan_applications
        SET office_email = ?,
            official_email_verified = 0,
            official_email_verified_at = NULL,
            official_email_verified_by = NULL
        WHERE id = ? OR application_id = ?
      `, [cleanedEmail, lead.rawId, lead.id]);
    } else {
      throw err;
    }
  }

  return findById(id);
}

async function updateEmandateStatus(id, { status = 'PENDING', provider = undefined, mandateId = undefined, refId = undefined, planName = undefined, authUrl = undefined, bankName = undefined, paymentMode = undefined, upiId = undefined, accountNumber = undefined, maxAmount = undefined, registeredAt = undefined } = {}) {
  const lead = await findById(id);
  if (!lead) return null;

  const updates = [];
  const params = [];

  if (provider !== undefined) {
    updates.push('emandate_provider = ?');
    params.push(String(provider).toLowerCase());
  }

  if (status !== undefined) {
    updates.push('emandate_status = ?');
    params.push(String(status).toUpperCase());
  }

  if (mandateId !== undefined) {
    updates.push('emandate_id = ?');
    params.push(mandateId ? String(mandateId).trim() : null);
  }

  if (refId !== undefined) {
    updates.push('emandate_ref_id = ?');
    params.push(refId ? String(refId).trim() : null);
  }

  if (planName !== undefined) {
    updates.push('emandate_plan_name = ?');
    params.push(planName ? String(planName).trim() : null);
  }

  if (authUrl !== undefined) {
    updates.push('emandate_auth_url = ?');
    params.push(authUrl ? String(authUrl).trim() : null);
  }

  if (bankName !== undefined) {
    updates.push('emandate_bank_name = ?');
    params.push(bankName ? String(bankName).trim() : null);
  }

  if (paymentMode !== undefined) {
    updates.push('emandate_payment_mode = ?');
    params.push(paymentMode ? String(paymentMode).trim() : null);
  }

  if (upiId !== undefined) {
    updates.push('emandate_upi_id = ?');
    params.push(upiId ? String(upiId).trim() : null);
  }

  if (accountNumber !== undefined) {
    updates.push('emandate_account_number = ?');
    params.push(accountNumber ? String(accountNumber).trim() : null);
  }

  if (maxAmount !== undefined && maxAmount !== null) {
    updates.push('emandate_max_amount = ?');
    params.push(Number(maxAmount) || 0);
  }

  if (registeredAt !== undefined) {
    const formattedDate = registeredAt instanceof Date
      ? registeredAt.toISOString().slice(0, 19).replace('T', ' ')
      : registeredAt ? String(registeredAt).trim() : null;
    updates.push('emandate_registered_at = ?');
    params.push(formattedDate);
  }

  if (!updates.length) return lead;

  params.push(lead.rawId, lead.id);

  try {
    await query(`UPDATE loan_applications SET ${updates.join(', ')} WHERE id = ? OR application_id = ?`, params);
  } catch (err) {
    if (err.message && (err.message.includes('emandate_status') || err.message.includes('Unknown column'))) {
      const { ensureRazorpayEmandateColumns } = require('../database/schema');
      await ensureRazorpayEmandateColumns();
      await query(`UPDATE loan_applications SET ${updates.join(', ')} WHERE id = ? OR application_id = ?`, params);
    } else {
      throw err;
    }
  }

  return findById(id);
}

async function updateCibilReportUrl({ leadId, applicationId, mobile, pan, pdfUrl }) {
  if (!pdfUrl || (!leadId && !applicationId && (!mobile || !pan))) return 0;

  const clauses = [];
  const params = [pdfUrl];

  if (leadId) {
    clauses.push('id = ?');
    params.push(leadId);
  }

  if (applicationId) {
    clauses.push('application_id = ?');
    params.push(applicationId);
  }

  if (!leadId && !applicationId && mobile && pan) {
    clauses.push('(mobile = ? AND pan_number = ?)');
    params.push(mobile, pan);
  }

  const result = await query(`
    UPDATE loan_applications
    SET cibil_report_url = ?
    WHERE (${clauses.join(' OR ')})
  `, params);

  return result.affectedRows || 0;
}

function localUploadPath(value) {
  if (!value || /^https?:\/\//i.test(value)) return '';

  const cleanValue = String(value).replace(/\\/g, '/');
  const relativePath = cleanValue.startsWith('/uploads/')
    ? cleanValue.replace(/^\/uploads\//, '')
    : cleanValue.replace(/^uploads\//, '');
  const resolvedPath = path.resolve(UPLOADS_ROOT, relativePath);

  if (!resolvedPath.startsWith(UPLOADS_ROOT + path.sep)) return '';
  return resolvedPath;
}

async function removeLocalUploadFile(value) {
  const filePath = localUploadPath(value);
  if (!filePath) return false;

  try {
    await fs.promises.unlink(filePath);
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') return false;
    throw error;
  }
}

async function removeCascade(id) {
  const lead = await findById(id);
  if (!lead) return null;

  const applicationId = lead.id || '';
  const leadId = lead.rawId || '';
  const uploadedRows = await query(`
    SELECT uploaded_file AS uploadedFile
    FROM lead_document_requests
    WHERE lead_id = ? OR application_id = ?
  `, [leadId, applicationId]);
  const sanctionRows = await query(`
    SELECT pdf_path AS pdfPath
    FROM lead_sanctions
    WHERE lead_id = ? OR application_id = ?
  `, [leadId, applicationId]);
  const agreementRows = await query(`
    SELECT pdf_path AS pdfPath, signed_pdf_path AS signedPdfPath
    FROM lead_loan_agreements
    WHERE lead_id = ? OR application_id = ?
  `, [leadId, applicationId]);
  const filesToRemove = [
    lead.salarySlipCurrent,
    lead.salarySlipPrevious,
    lead.salarySlipOld,
    lead.selfieImage,
    lead.videoKyc,
    ...uploadedRows.map((row) => row.uploadedFile),
    ...sanctionRows.map((row) => row.pdfPath),
    ...agreementRows.flatMap((row) => [row.pdfPath, row.signedPdfPath]),
  ].filter(Boolean);

  const counts = {};
  const deleteByLead = async (table) => {
    const result = await query(`DELETE FROM ${table} WHERE lead_id = ? OR application_id = ?`, [leadId, applicationId]);
    counts[table] = result.affectedRows || 0;
  };

  await deleteByLead('lead_accounting_payments');
  await deleteByLead('lead_loan_agreements');
  await deleteByLead('lead_sanctions');
  await deleteByLead('lead_esign_requests');
  await deleteByLead('lead_cam_sheets');
  await deleteByLead('lead_credit_handoffs');
  await deleteByLead('lead_document_requests');
  await deleteByLead('lead_document_checks');
  await deleteByLead('lead_followups');
  await deleteByLead('lead_call_logs');
  await deleteByLead('lead_status_events');
  await deleteByLead('lead_activities');
  await deleteByLead('aadhaar_reports');
  const cibilClauses = [];
  const cibilParams = [];
  if (leadId) {
    cibilClauses.push('lead_id = ?');
    cibilParams.push(leadId);
  }
  if (applicationId) {
    cibilClauses.push('application_id = ?');
    cibilParams.push(applicationId);
  }
  if (!cibilClauses.length && lead.phone && lead.panNumber) {
    cibilClauses.push('(mobile = ? AND pan = ?)');
    cibilParams.push(lead.phone, lead.panNumber);
  }
  if (cibilClauses.length) {
    const cibilResult = await query(`DELETE FROM cibil_reports WHERE ${cibilClauses.join(' OR ')}`, cibilParams);
    counts.cibil_reports = cibilResult.affectedRows || 0;
  } else {
    counts.cibil_reports = 0;
  }

  const leadResult = await query('DELETE FROM loan_applications WHERE id = ?', [lead.rawId]);
  counts.loan_applications = leadResult.affectedRows || 0;

  let removedFiles = 0;
  for (const file of Array.from(new Set(filesToRemove))) {
    if (await removeLocalUploadFile(file)) removedFiles += 1;
  }

  return {
    counts,
    lead,
    removedFiles,
  };
}

async function getDuplicateLeads(leadId) {
  const targetLead = await findById(leadId);
  if (!targetLead) return { target: null, duplicates: [] };

  const mobile = String(targetLead.phone || targetLead.mobile || '').trim();
  const cleanMobile = mobile.replace(/[^0-9]/g, '').slice(-10);
  const pan = String(targetLead.panNumber || targetLead.pan_number || '').trim();
  const fullName = String(targetLead.name || targetLead.full_name || '').trim().toLowerCase();
  const rawId = String(targetLead.rawId || targetLead.id || '').trim();
  const appId = String(targetLead.id || '').trim();

  const conditions = [];
  const params = [];

  if (mobile) {
    if (cleanMobile && cleanMobile.length >= 10) {
      conditions.push("(la.mobile = ? OR RIGHT(REPLACE(REPLACE(REPLACE(la.mobile, ' ', ''), '-', ''), '+91', ''), 10) = ?)");
      params.push(mobile, cleanMobile);
    } else {
      conditions.push('la.mobile = ?');
      params.push(mobile);
    }
  }
  if (pan) {
    conditions.push('UPPER(TRIM(la.pan_number)) = UPPER(TRIM(?))');
    params.push(pan);
  }
  if (fullName) {
    conditions.push('TRIM(LOWER(la.full_name)) = TRIM(LOWER(?))');
    params.push(fullName);
  }

  if (conditions.length === 0) {
    return { target: targetLead, duplicates: [] };
  }

  const whereClause = `(${conditions.join(' OR ')}) AND la.id <> ? AND la.application_id <> ?`;
  params.push(rawId, appId);

  const sql = `
    SELECT
      COALESCE(NULLIF(la.application_id, ''), CONCAT('APP-', la.id)) AS id,
      CAST(la.id AS CHAR) AS rawId,
      COALESCE(NULLIF(la.full_name, ''), CONCAT('Applicant ', la.id)) AS name,
      COALESCE(la.email, '') AS email,
      la.mobile AS phone,
      la.loan_amount AS loanAmount,
      CASE la.status
        WHEN 'draft' THEN 'New'
        WHEN 'submitted' THEN 'Contacted'
        WHEN 'review' THEN 'Document Collection'
        WHEN 'documents_pending' THEN 'Documents Pending'
        WHEN 'not_connected' THEN 'Not Connected'
        WHEN 'approved' THEN 'Qualified'
        WHEN 'rejected' THEN 'Lost'
        WHEN 'disbursed' THEN 'Converted'
        WHEN 'closed' THEN 'Closed'
        WHEN 'send_to_credit' THEN 'Send to Credit Manager'
        ELSE 'New'
      END AS status,
      COALESCE(la.pan_number, '') AS panNumber,
      COALESCE(NULLIF(la.assigned_to, ''), 'Unassigned') AS assignedTo,
      ${dateTimeSql('la.created_at')} AS createdAt,
      CASE WHEN (la.mobile <> '' AND (la.mobile = ? OR (LENGTH(?) >= 10 AND RIGHT(REPLACE(REPLACE(REPLACE(la.mobile, ' ', ''), '-', ''), '+91', ''), 10) = ?))) THEN 1 ELSE 0 END AS matchedByMobile,
      CASE WHEN (la.pan_number <> '' AND UPPER(TRIM(la.pan_number)) = UPPER(TRIM(?))) THEN 1 ELSE 0 END AS matchedByPan,
      CASE WHEN (TRIM(COALESCE(la.full_name, '')) <> '' AND TRIM(LOWER(la.full_name)) = TRIM(LOWER(?))) THEN 1 ELSE 0 END AS matchedByName
    FROM loan_applications la
    WHERE ${whereClause}
    ORDER BY la.created_at DESC
  `;

  const queryParams = [mobile, cleanMobile || mobile, cleanMobile || mobile, pan, fullName, ...params];
  const rows = await query(sql, queryParams);

  const duplicates = rows.map((r) => {
    const reasons = [];
    if (r.matchedByMobile) reasons.push('Same Mobile');
    if (r.matchedByPan) reasons.push('Same PAN');
    if (r.matchedByName) reasons.push('Same Name');

    return {
      id: r.id,
      rawId: r.rawId,
      name: r.name,
      email: r.email,
      phone: r.phone,
      panNumber: r.panNumber,
      loanAmount: Number(r.loanAmount || 0),
      status: r.status,
      assignedTo: r.assignedTo,
      createdAt: r.createdAt,
      matchedReasons: reasons,
    };
  });

  return {
    target: {
      id: targetLead.id,
      name: targetLead.name,
      phone: targetLead.phone,
      panNumber: targetLead.panNumber,
    },
    duplicates,
  };
}

module.exports = {
  addReference,
  autoAssignUnassignedLeads,
  create,
  findAll,
  findActiveApplication,
  checkActiveLoanOrApplication,
  findById,
  getDuplicateLeads,
  getNextRoundRobinTelecaller,
  getStats,
  removeCascade,
  updateCibilReportUrl,
  updateContactInfo,
  updateEmandateStatus,
  updateOfficialEmail,
  updateOfficialEmailVerification,
  updateOperations,
  updateReferences,
  updateStatus,
  upsertFromSource,
};


