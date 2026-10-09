const { query } = require('../config/db');

const DEFAULT_DOCUMENT_CHECKS = [
  { key: 'pan', label: 'PAN captured and name matched' },
  { key: 'aadhaar', label: 'Aadhaar / KYC verified' },
  { key: 'selfie', label: 'Selfie image verified' },
  { key: 'salary_slip_current', label: 'Current salary slip verified' },
  { key: 'salary_slip_previous', label: 'Previous salary slips reviewed' },
  { key: 'company_id_card', label: 'Company ID card verified' },
  { key: 'bank_details', label: 'Bank account and IFSC verified' },
  { key: 'cibil', label: 'CIBIL report available' },
];

const CALL_DISPOSITIONS = [
  'Connected',
  'Not reachable',
  'Switched off',
  'Callback requested',
  'Interested',
  'Not interested',
  'Wrong number',
  'Duplicate',
  'Language issue',
];

const TELECALLER_SLA = {
  callbackGraceMinutes: 0,
  docsBreachHours: 48,
  docsWarningHours: 24,
  firstCallMinutes: 15,
};

const VALID_TABS = new Set(['all', 'uncontacted', 'followups', 'docs-pending', 'ready-handoff', 'sent-credit']);
const VALID_STATUSES = new Set(['New', 'Contacted', 'Qualified', 'Document Collection', 'Documents Pending', 'Not Connected', 'Converted', 'Lost']);
const VALID_PRIORITIES = new Set(['Low', 'Medium', 'High', 'Urgent']);
const NO_DISPOSITION = '__none__';
const LEGACY_UPLOAD_BASE_URL = 'https://api.waqtmoney.com';
const WAQTFINANCE_UPLOAD_BASE_URL = 'https://waqtfinance.com/uploads';
const WAQTMONEY_UPLOAD_BASE_URL = 'https://api.waqtmoney.com';

function dateTimeSql(expression) {
  return `DATE_FORMAT(${expression}, '%Y-%m-%dT%H:%i:%s')`;
}

function sourceDisplaySql(sourceSystemExpression = 'la.source_system', sourceExpression = 'la.source', loanTypeExpression = 'la.loan_type') {
  return `COALESCE(NULLIF(TRIM(${sourceExpression}), ''), NULLIF(TRIM(${sourceSystemExpression}), ''), CONCAT('Manual - ', ${loanTypeExpression}))`;
}

function sourceSystemSql(sourceSystemExpression = 'la.source_system', sourceExpression = 'la.source') {
  return `LOWER(TRIM(COALESCE(NULLIF(TRIM(${sourceExpression}), ''), NULLIF(TRIM(${sourceSystemExpression}), ''), '')))`;
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
      : normalizedValue;
    return `${sourceBaseUrl}/${sourceRelativePath}`;
  }

  if (/^uploads\/lead-documents\//i.test(normalizedValue)) return `/${normalizedValue}`;
  if (/^uploads?\//i.test(normalizedValue)) return `${WAQTMONEY_UPLOAD_BASE_URL}/${normalizedValue}`;

  return normalizedValue ? `${LEGACY_UPLOAD_BASE_URL}/${normalizedValue}` : '';
}

function mapCallLog(row) {
  return {
    id: row.id,
    leadId: row.lead_id || '',
    applicationId: row.application_id || '',
    disposition: row.disposition || '',
    subDisposition: row.sub_disposition || '',
    notes: row.notes || '',
    callDurationSeconds: Number(row.call_duration_seconds || 0),
    nextFollowupAt: row.next_followup_at,
    actor: row.actor || 'CRM User',
    createdAt: row.created_at,
  };
}

function mapFollowup(row) {
  return {
    id: row.id,
    leadId: row.lead_id || '',
    applicationId: row.application_id || '',
    dueAt: row.due_at,
    reason: row.reason || '',
    status: row.status || 'open',
    notes: row.notes || '',
    actor: row.actor || 'CRM User',
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDocumentCheck(row) {
  return {
    id: row.id,
    leadId: row.lead_id || '',
    applicationId: row.application_id || '',
    key: row.document_key || '',
    label: row.label || '',
    status: row.status || 'pending',
    remark: row.remark || '',
    verifiedBy: row.verified_by || '',
    verifiedAt: row.verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapHandoff(row) {
  if (!row) return null;

  let checklistSnapshot = null;
  if (row.checklist_snapshot) {
    try {
      checklistSnapshot = JSON.parse(row.checklist_snapshot);
    } catch {
      checklistSnapshot = null;
    }
  }

  return {
    id: row.id,
    leadId: row.lead_id || '',
    applicationId: row.application_id || '',
    status: row.status || 'ready',
    checklistSnapshot,
    notes: row.notes || '',
    submittedBy: row.submitted_by || 'CRM User',
    submittedAt: row.submitted_at,
    reviewedBy: row.reviewed_by || '',
    reviewedAt: row.reviewed_at,
    decision: row.decision || '',
    decisionNotes: row.decision_notes || '',
  };
}

function leadKeys(lead) {
  return {
    applicationId: lead?.id || '',
    leadId: lead?.rawId || '',
  };
}

function mapCreditQueueLead(row) {
  const documentTotalCount = Math.max(Number(row.documentTotalCount || 0), DEFAULT_DOCUMENT_CHECKS.length);
  const documentVerifiedCount = Number(row.documentVerifiedCount || 0);

  return {
    id: row.id || '',
    rawId: row.rawId || '',
    name: row.name || '',
    email: row.email || '',
    phone: row.phone || '',
    loanAmount: row.loanAmount === null || row.loanAmount === undefined ? null : Number(row.loanAmount),
    priority: row.priority || 'Low',
    status: row.status || 'Document Collection',
    monthlyIncome: Number(row.monthlyIncome || 0),
    panNumber: row.panNumber || '',
    bankName: row.bankName || '',
    accountNumber: row.accountNumber || '',
    ifscCode: row.ifscCode || '',
    salarySlipCurrent: row.salarySlipCurrent || '',
    aadhaarVerified: Number(row.aadhaarVerified || 0),
    submittedBy: row.submittedBy || '',
    submittedAt: row.submittedAt,
    handoffNotes: row.handoffNotes || '',
    latestCallDisposition: row.latestCallDisposition || '',
    latestCallAt: row.latestCallAt,
    documentTotalCount,
    documentVerifiedCount,
    pendingDocumentCount: Math.max(0, documentTotalCount - documentVerifiedCount),
    handoffAgeHours: Number(row.handoffAgeHours || 0),
  };
}

function mapTelecallerWorkbenchLead(row) {
  const documentTotalCount = Math.max(Number(row.documentTotalCount || 0), DEFAULT_DOCUMENT_CHECKS.length);
  const documentVerifiedCount = Number(row.documentVerifiedCount || 0);
  const profileImageUrl = normalizeSourceDocumentPath(row.selfieImage, row.sourceSystem);

  return {
    id: row.id || '',
    rawId: row.rawId || '',
    name: row.name || '',
    email: row.email || '',
    phone: row.phone || '',
    loanAmount: row.loanAmount === null || row.loanAmount === undefined ? null : Number(row.loanAmount),
    source: row.source || '',
    sourceSystem: row.sourceSystem || '',
    sourceLeadId: row.sourceLeadId || '',
    sourceApplicationId: row.sourceApplicationId || '',
    sourceStatus: row.sourceStatus || '',
    status: row.status || 'New',
    priority: row.priority || 'Low',
    assignedTo: row.assignedTo || 'Unassigned',
    assignedRole: row.assignedRole || 'Telecaller',
    createdAt: row.createdAt,
    createdDate: row.createdDate,
    lastContact: row.lastContact,
    creditScore: Number(row.creditScore || 0),
    employmentStatus: row.employmentStatus || 'Pending review',
    monthlyIncome: Number(row.monthlyIncome || 0),
    city: row.city || '',
    panNumber: row.panNumber || '',
    loanType: row.loanType || '',
    profileImageUrl,
    selfieImage: profileImageUrl,
    latestCallDisposition: row.latestCallDisposition || '',
    latestCallAt: row.latestCallAt,
    nextFollowupAt: row.nextFollowupAt,
    documentVerifiedCount,
    documentTotalCount,
    pendingDocumentCount: Math.max(0, documentTotalCount - documentVerifiedCount),
    latestHandoffStatus: row.latestHandoffStatus || '',
    latestHandoffAt: row.latestHandoffAt,
    latestHandoffSubmittedBy: row.latestHandoffSubmittedBy || '',
    latestHandoffReviewedBy: row.latestHandoffReviewedBy || '',
    latestHandoffReviewedAt: row.latestHandoffReviewedAt,
    latestHandoffDecision: row.latestHandoffDecision || '',
    latestHandoffDecisionNotes: row.latestHandoffDecisionNotes || '',
    isDuplicate: Boolean(row.isDuplicate),
    duplicateCount: Number(row.duplicateCount || 0),
  };

}

function addMinutes(value, minutes) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function hoursSince(value, now = new Date()) {
  if (!value) return 0;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.max(0, (now.getTime() - date.getTime()) / 36e5);
}

function isDue(value, now = new Date()) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() <= now.getTime();
}

function creditStageForLead(lead) {
  const handoff = String(lead.latestHandoffStatus || '').toLowerCase();
  const decision = String(lead.latestHandoffDecision || '').toLowerCase();
  if (lead.status === 'Converted') return 'Disbursed';
  if (lead.status === 'closed' || lead.status === 'Closed') return 'Closed';
  if (lead.status === 'Qualified' || handoff === 'approved' || decision === 'approved') return 'Approved';
  if (lead.status === 'Lost' || handoff === 'rejected' || decision === 'rejected') return 'Rejected';
  if (handoff === 'ready') return 'Pending review';
  if (lead.latestHandoffStatus) return lead.latestHandoffStatus;
  return 'Not started';
}

const TERMINAL_STATUSES = new Set(['Converted', 'Lost', 'Closed', 'Rejected', 'disbursed', 'rejected', 'closed']);

function enrichTelecallerLead(lead, now = new Date()) {
  const isTerminal = TERMINAL_STATUSES.has(lead.status);
  const pendingDocumentCount = isTerminal ? 0 : Number(lead.pendingDocumentCount || 0);
  const documentTotalCount = Number(lead.documentTotalCount || 0);
  const noCallYet = !lead.latestCallDisposition;
  const firstCallDueAt = noCallYet ? addMinutes(lead.createdAt || lead.createdDate, TELECALLER_SLA.firstCallMinutes) : null;
  const callbackDue = !isTerminal && isDue(lead.nextFollowupAt, now) && hoursSince(lead.nextFollowupAt, now) <= 168;
  const docsAgeHours = pendingDocumentCount > 0 ? hoursSince(lead.createdAt || lead.createdDate, now) : 0;
  const docsWarning = !isTerminal && pendingDocumentCount > 0 && docsAgeHours >= TELECALLER_SLA.docsWarningHours;
  const docsBreach = !isTerminal && pendingDocumentCount > 0 && docsAgeHours >= TELECALLER_SLA.docsBreachHours;
  const firstCallBreach = !isTerminal && noCallYet && isDue(firstCallDueAt, now);
  const readyForHandoff = !isTerminal &&
    (lead.status === 'Qualified' || lead.status === 'approved' || (documentTotalCount > 0 && pendingDocumentCount === 0 && !lead.latestHandoffStatus));
  const sentToCredit = Boolean(lead.latestHandoffStatus) ||
    lead.assignedTo === 'Credit Manager' ||
    String(lead.assignedTo || '').toLowerCase().includes('shruti') ||
    lead.status === 'Send to Credit Manager' ||
    lead.status === 'send_to_credit';
  const slaBreached = !isTerminal && (firstCallBreach || callbackDue || docsBreach);
  const slaStatus = isTerminal ? 'Completed' : slaBreached ? 'Breached' : docsWarning ? 'Warning' : 'On Track';
  const nextAction = sentToCredit
    ? 'Await credit review'
    : readyForHandoff
      ? 'Send to credit'
      : callbackDue
        ? 'Call back now'
        : lead.nextFollowupAt
          ? 'Upcoming callback'
          : noCallYet
            ? 'First call due'
            : pendingDocumentCount > 0
              ? 'Collect documents'
              : 'Review lead';

  return {
    ...lead,
    creditStage: creditStageForLead(lead),
    firstCallDueAt: firstCallDueAt ? firstCallDueAt.toISOString() : null,
    hasNoDisposition: noCallYet,
    isCallbackDue: callbackDue,
    isDocsBreach: docsBreach,
    isDocsWarning: docsWarning,
    isFirstCallBreach: firstCallBreach,
    isReadyForHandoff: readyForHandoff,
    isSentToCredit: sentToCredit,
    nextAction,
    nextActionDueAt: callbackDue || lead.nextFollowupAt
      ? lead.nextFollowupAt
      : firstCallDueAt
        ? firstCallDueAt.toISOString()
        : null,
    slaStatus,
    slaBreached,
  };
}

async function ensureDefaultDocumentChecks(lead) {
  const { applicationId, leadId } = leadKeys(lead);
  if (!applicationId) return;

  await Promise.all(DEFAULT_DOCUMENT_CHECKS.map((item) => query(`
    INSERT INTO lead_document_checks (
      lead_id, application_id, document_key, label, status
    ) VALUES (?, ?, ?, ?, 'pending')
    ON DUPLICATE KEY UPDATE
      label = VALUES(label)
  `, [leadId, applicationId, item.key, item.label])));
}

let workbenchCache = {
  support: { timestamp: 0, data: null },
  normal: { timestamp: 0, data: null },
};
const WORKBENCH_CACHE_TTL_MS = 15 * 1000; // 15 seconds

function invalidateWorkbenchCache() {
  workbenchCache.support.data = null;
  workbenchCache.normal.data = null;
}

async function listTelecallerWorkbench(options = {}) {
  const isSupport = Boolean(options && (options.isSupportUser || options.isSupport));
  const cacheKey = isSupport ? 'support' : 'normal';

  if (workbenchCache[cacheKey].data && (Date.now() - workbenchCache[cacheKey].timestamp < WORKBENCH_CACHE_TTL_MS)) {
    return workbenchCache[cacheKey].data;
  }

  try {
    const leadModel = require('./leadModel');
    if (leadModel && typeof leadModel.autoAssignUnassignedLeads === 'function') {
      await leadModel.autoAssignUnassignedLeads();
    }
  } catch (e) {
    // Ignore error
  }

  const whereClause = isSupport ? '' : "WHERE la.created_at >= '2026-09-04'";

  const baseRows = await query(`
    SELECT
      COALESCE(NULLIF(la.application_id, ''), CONCAT('APP-', la.id)) AS id,
      CAST(la.id AS CHAR) AS rawId,
      COALESCE(NULLIF(la.full_name, ''), CONCAT('Applicant ', la.id)) AS name,
      COALESCE(la.email, '') AS email,
      la.mobile AS phone,
      la.loan_amount AS loanAmount,
      ${sourceDisplaySql()} AS source,
      ${sourceSystemSql()} AS sourceSystem,
      COALESCE(la.source_lead_id, '') AS sourceLeadId,
      COALESCE(la.source_application_id, '') AS sourceApplicationId,
      COALESCE(la.source_status, '') AS sourceStatus,
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
      COALESCE(NULLIF(la.priority, ''), CASE
        WHEN la.loan_amount >= 200000 THEN 'High'
        WHEN la.loan_amount >= 50000 THEN 'Medium'
        ELSE 'Low'
      END) AS priority,
      COALESCE(NULLIF(la.assigned_to, ''), 'Unassigned') AS assignedTo,
      CASE
        WHEN la.assigned_to IS NULL OR la.assigned_to = '' THEN 'Intake Queue'
        ELSE 'Telecaller'
      END AS assignedRole,
      ${dateTimeSql('la.created_at')} AS createdAt,
      ${dateTimeSql('la.created_at')} AS createdDate,
      0 AS creditScore,
      COALESCE(la.employment_status, 'Pending review') AS employmentStatus,
      COALESCE(la.monthly_income, 0) AS monthlyIncome,
      COALESCE(la.city, '') AS city,
      COALESCE(la.pan_number, '') AS panNumber,
      COALESCE(la.loan_type, '') AS loanType,
      COALESCE(la.selfie_image, '') AS selfieImage
    FROM loan_applications la
    ${whereClause}
    ORDER BY la.created_at DESC, la.id DESC
  `);

  if (!baseRows || !baseRows.length) return [];

  // Execute secondary data lookups concurrently via Promise.all
  const [callLogs, followups, docCounts, handoffs, mobileDups, panDups] = await Promise.all([
    query(`
      SELECT lcl.application_id, lcl.lead_id, lcl.disposition, ${dateTimeSql('lcl.created_at')} AS created_at
      FROM lead_call_logs lcl
      INNER JOIN (
        SELECT MAX(id) AS max_id
        FROM lead_call_logs
        GROUP BY COALESCE(NULLIF(application_id, ''), lead_id)
      ) latest ON lcl.id = latest.max_id
    `).catch(() => []),

    query(`
      SELECT lf.application_id, lf.lead_id, ${dateTimeSql('lf.due_at')} AS due_at
      FROM lead_followups lf
      WHERE lf.status IN ('open', 'scheduled')
      ORDER BY lf.due_at ASC
    `).catch(() => []),

    query(`
      SELECT application_id, COUNT(*) AS total_count, SUM(status = 'verified') AS verified_count
      FROM lead_document_checks
      GROUP BY application_id
    `).catch(() => []),

    query(`
      SELECT lch.application_id, lch.lead_id, lch.status, ${dateTimeSql('lch.submitted_at')} AS submitted_at,
             lch.submitted_by, lch.reviewed_by, ${dateTimeSql('lch.reviewed_at')} AS reviewed_at,
             lch.decision, lch.decision_notes
      FROM lead_credit_handoffs lch
      INNER JOIN (
        SELECT MAX(id) AS max_id
        FROM lead_credit_handoffs
        GROUP BY COALESCE(NULLIF(application_id, ''), lead_id)
      ) latest ON lch.id = latest.max_id
    `).catch(() => []),

    query(`
      SELECT mobile, COUNT(*) AS cnt FROM loan_applications WHERE mobile <> '' AND mobile IS NOT NULL GROUP BY mobile HAVING cnt > 1
    `).catch(() => []),

    query(`
      SELECT pan_number, COUNT(*) AS cnt FROM loan_applications WHERE pan_number <> '' AND pan_number IS NOT NULL GROUP BY pan_number HAVING cnt > 1
    `).catch(() => []),
  ]);

  // Build O(1) memory lookup maps
  const callMap = new Map();
  callLogs.forEach((c) => {
    if (c.application_id) callMap.set(c.application_id, c);
    if (c.lead_id) callMap.set(c.lead_id, c);
  });

  const followupMap = new Map();
  followups.forEach((f) => {
    const key = f.application_id || f.lead_id;
    if (key && !followupMap.has(key)) followupMap.set(key, f);
  });

  const docMap = new Map();
  docCounts.forEach((d) => {
    if (d.application_id) docMap.set(d.application_id, d);
  });

  const handoffMap = new Map();
  handoffs.forEach((h) => {
    if (h.application_id) handoffMap.set(h.application_id, h);
    if (h.lead_id) handoffMap.set(h.lead_id, h);
  });

  const dupMobileSet = new Set(mobileDups.map((m) => m.mobile));
  const dupPanSet = new Set(panDups.map((p) => p.pan_number));

  const rows = baseRows.map((row) => {
    const call = callMap.get(row.id) || callMap.get(row.rawId);
    const followup = followupMap.get(row.id) || followupMap.get(row.rawId);
    const doc = docMap.get(row.id);
    const handoff = handoffMap.get(row.id) || handoffMap.get(row.rawId);

    const isDup = (row.phone && dupMobileSet.has(row.phone)) || (row.panNumber && dupPanSet.has(row.panNumber));

    return {
      ...row,
      lastContact: call ? call.created_at : null,
      latestCallDisposition: call ? call.disposition : '',
      latestCallAt: call ? call.created_at : null,
      nextFollowupAt: followup ? followup.due_at : null,
      documentTotalCount: doc ? Number(doc.total_count || 0) : 0,
      documentVerifiedCount: doc ? Number(doc.verified_count || 0) : 0,
      latestHandoffStatus: handoff ? handoff.status : '',
      latestHandoffAt: handoff ? handoff.submitted_at : null,
      latestHandoffSubmittedBy: handoff ? handoff.submitted_by : '',
      latestHandoffReviewedBy: handoff ? handoff.reviewed_by : '',
      latestHandoffReviewedAt: handoff ? handoff.reviewed_at : null,
      latestHandoffDecision: handoff ? handoff.decision : '',
      latestHandoffDecisionNotes: handoff ? handoff.decision_notes : '',
      isDuplicate: isDup ? 1 : 0,
      duplicateCount: isDup ? 1 : 0,
    };
  });

  const finalLeads = rows
    .map(mapTelecallerWorkbenchLead)
    .map((lead) => enrichTelecallerLead(lead))
    .sort(sortTelecallerQueue);

  workbenchCache[cacheKey] = {
    timestamp: Date.now(),
    data: finalLeads,
  };

  return finalLeads;
}

function normalizeWorkbenchQuery(filters = {}) {
  const page = Math.max(1, Number.parseInt(filters.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(5, Number.parseInt(filters.pageSize, 10) || 10));
  const tab = VALID_TABS.has(filters.tab) ? filters.tab : 'all';
  const disposition = filters.disposition === NO_DISPOSITION || CALL_DISPOSITIONS.includes(filters.disposition)
    ? filters.disposition
    : 'all';
  const status = VALID_STATUSES.has(filters.status) ? filters.status : 'all';
  const priority = VALID_PRIORITIES.has(filters.priority) ? filters.priority : 'all';

  return {
    assignedTo: String(filters.assignedTo || 'all').trim() || 'all',
    disposition,
    page,
    pageSize,
    priority,
    search: String(filters.search || '').trim().toLowerCase(),
    sourceSystem: String(filters.sourceSystem || 'all').trim().toLowerCase() || 'all',
    status,
    tab,
    telecallerUser: String(filters.telecallerUser || '').trim(),
  };
}


function leadMatchesSearch(lead, search) {
  if (!search) return true;
  return [
    lead.id,
    lead.rawId,
    lead.name,
    lead.email,
    lead.phone,
    lead.source,
    lead.sourceSystem,
    lead.sourceLeadId,
    lead.sourceApplicationId,
    lead.sourceStatus,
    lead.assignedTo,
  ].some((value) => String(value || '').toLowerCase().includes(search));
}

function leadMatchesTab(lead, tab) {
  if (tab === 'all') return true;
  if (tab === 'uncontacted') return lead.status === 'New';
  if (tab === 'followups') return Boolean(lead.nextFollowupAt) && !TERMINAL_STATUSES.has(lead.status);
  if (tab === 'docs-pending') return Number(lead.pendingDocumentCount || 0) > 0 && !TERMINAL_STATUSES.has(lead.status);
  if (tab === 'ready-handoff') return Boolean(lead.isReadyForHandoff);
  if (tab === 'sent-credit') return Boolean(lead.isSentToCredit);
  return true;
}

function isLeadAssignedToTelecaller(assignedTo, user = {}) {
  if (!assignedTo) return false;
  const assigned = String(assignedTo).trim().toLowerCase();
  if (['unassigned', 'intake queue', 'none', '', 'null', 'undefined', 'credit manager', 'credit-manager'].includes(assigned) || assigned.includes('shruti')) {
    return false;
  }

  const userName = String(user.name || user.telecallerUser || '').trim().toLowerCase();
  const userEmail = String(user.email || user.telecallerEmail || '').trim().toLowerCase();
  const userEmailPrefix = userEmail.includes('@') ? userEmail.split('@')[0].trim() : '';

  if (userName && (assigned === userName || userName.includes(assigned) || assigned.includes(userName))) {
    return true;
  }
  if (userEmail && (assigned === userEmail || userEmail.includes(assigned))) {
    return true;
  }
  if (userEmailPrefix && (assigned === userEmailPrefix || userEmailPrefix.includes(assigned) || assigned.includes(userEmailPrefix))) {
    return true;
  }

  return false;
}

function leadMatchesFilters(lead, filters, { includeTab = true } = {}) {
  const leadDisposition = lead.latestCallDisposition || '';
  const assigned = lead.assignedTo || 'Unassigned';

  let matchesAssigned = true;
  if (filters.telecallerUser || filters.telecallerEmail) {
    const isSupportUser = String(filters.telecallerUser || '').toLowerCase().includes('support') ||
                          String(filters.telecallerEmail || '').toLowerCase().includes('support');
    if (!isSupportUser) {
      const isAssignedToMe = isLeadAssignedToTelecaller(assigned, { name: filters.telecallerUser, email: filters.telecallerEmail });

      const matchesFilterDropdown = filters.assignedTo === 'all' || assigned === filters.assignedTo;
      matchesAssigned = isAssignedToMe && matchesFilterDropdown;
    } else if (filters.assignedTo && filters.assignedTo !== 'all') {
      matchesAssigned = assigned === filters.assignedTo;
    }
  } else if (filters.assignedTo && filters.assignedTo !== 'all') {
    matchesAssigned = assigned === filters.assignedTo;
  }


  return leadMatchesSearch(lead, filters.search) &&
    (filters.status === 'all' || lead.status === filters.status) &&
    (filters.priority === 'all' || lead.priority === filters.priority) &&
    matchesAssigned &&
    (filters.sourceSystem === 'all' || String(lead.sourceSystem || '').toLowerCase() === filters.sourceSystem) &&
    (filters.disposition === 'all' ||
      (filters.disposition === NO_DISPOSITION ? !leadDisposition : leadDisposition === filters.disposition)) &&
    (!includeTab || leadMatchesTab(lead, filters.tab));
}

function sortTelecallerQueue(a, b) {
  const byCreatedAt = new Date(b.createdAt || b.createdDate || 0).getTime() - new Date(a.createdAt || a.createdDate || 0).getTime();
  if (byCreatedAt) return byCreatedAt;

  const priorityScore = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
  const queueScore = (lead) => {
    if (lead.slaBreached) return 0;
    if (lead.isCallbackDue) return 1;
    if (lead.hasNoDisposition && lead.status === 'New') return 2;
    if (Number(lead.pendingDocumentCount || 0) > 0) return 3;
    return 4;
  };
  const byQueue = queueScore(a) - queueScore(b);
  if (byQueue) return byQueue;
  const byPriority = (priorityScore[a.priority] ?? 4) - (priorityScore[b.priority] ?? 4);
  if (byPriority) return byPriority;
  return 0;
}

function countBy(items, keyFn) {
  return items.reduce((counts, item) => {
    const key = keyFn(item);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function isSameLocalDay(value, targetDate) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  return date.getFullYear() === targetDate.getFullYear() &&
    date.getMonth() === targetDate.getMonth() &&
    date.getDate() === targetDate.getDate();
}

function buildWorkbenchCounts(baseLeads, filteredWithoutTab) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const dispositionCounts = Object.fromEntries(CALL_DISPOSITIONS.map((item) => [item, 0]));
  dispositionCounts[NO_DISPOSITION] = 0;
  baseLeads.forEach((lead) => {
    const disposition = lead.latestCallDisposition || NO_DISPOSITION;
    if (dispositionCounts[disposition] === undefined) dispositionCounts[disposition] = 0;
    dispositionCounts[disposition] += 1;
  });

  return {
    disposition: dispositionCounts,
    priority: countBy(baseLeads, (lead) => lead.priority || 'Low'),
    sourceSystem: countBy(baseLeads, (lead) => lead.sourceSystem || 'manual'),
    stats: {
      callbackDue: baseLeads.filter((lead) => lead.isCallbackDue).length,
      docsPending: baseLeads.filter((lead) => Number(lead.pendingDocumentCount || 0) > 0).length,
      followupsDue: baseLeads.filter((lead) => Boolean(lead.nextFollowupAt)).length,
      newUncalled: baseLeads.filter((lead) => lead.status === 'New' && lead.hasNoDisposition).length,
      readyHandoff: baseLeads.filter((lead) => lead.isReadyForHandoff).length,
      sentCredit: baseLeads.filter((lead) => lead.isSentToCredit).length,
      slaBreached: baseLeads.filter((lead) => lead.slaBreached).length,
      todayLeads: baseLeads.filter((lead) => isSameLocalDay(lead.createdAt || lead.createdDate, today)).length,
      totalLeads: baseLeads.length,
      yesterdayLeads: baseLeads.filter((lead) => isSameLocalDay(lead.createdAt || lead.createdDate, yesterday)).length,
    },
    tabs: {
      all: filteredWithoutTab.length,
      'docs-pending': filteredWithoutTab.filter((lead) => leadMatchesTab(lead, 'docs-pending')).length,
      followups: filteredWithoutTab.filter((lead) => leadMatchesTab(lead, 'followups')).length,
      'ready-handoff': filteredWithoutTab.filter((lead) => leadMatchesTab(lead, 'ready-handoff')).length,
      'sent-credit': filteredWithoutTab.filter((lead) => leadMatchesTab(lead, 'sent-credit')).length,
      uncontacted: filteredWithoutTab.filter((lead) => leadMatchesTab(lead, 'uncontacted')).length,
    },
  };
}

async function listTelecallerWorkbenchV2(filters = {}) {
  const normalizedFilters = normalizeWorkbenchQuery(filters);
  const isSupport = Boolean(filters && (filters.isSupportUser || filters.isSupport));
  const allLeads = (await listTelecallerWorkbench({ isSupportUser: isSupport }))
    .map((lead) => enrichTelecallerLead(lead))
    .sort(sortTelecallerQueue);
  const baseLeads = allLeads.filter((lead) => leadMatchesFilters(lead, normalizedFilters, { includeTab: false }));
  const filteredWithoutTab = baseLeads;
  const filteredLeads = allLeads.filter((lead) => leadMatchesFilters(lead, normalizedFilters));

  const totalItems = filteredLeads.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / normalizedFilters.pageSize));
  const safePage = Math.min(normalizedFilters.page, totalPages);
  const start = (safePage - 1) * normalizedFilters.pageSize;

  return {
    counts: buildWorkbenchCounts(baseLeads, filteredWithoutTab),
    filters: normalizedFilters,
    items: filteredLeads.slice(start, start + normalizedFilters.pageSize),
    lastUpdatedAt: new Date().toISOString(),
    pagination: {
      page: safePage,
      pageSize: normalizedFilters.pageSize,
      totalItems,
      totalPages,
    },
  };
}

function getTelecallerPolicy(teamMembers = []) {
  return {
    allowedActions: ['call', 'log_disposition', 'request_documents', 'send_to_credit', 'mark_duplicate', 'mark_lost'],
    dispositions: CALL_DISPOSITIONS.map((disposition) => ({
      label: disposition,
      value: disposition,
    })),
    documentChecks: DEFAULT_DOCUMENT_CHECKS,
    noDispositionValue: NO_DISPOSITION,
    sla: TELECALLER_SLA,
    teamMembers,
  };
}

function periodStart(period = 'last30days', now = new Date()) {
  const date = new Date(now);
  if (period === 'last7days') date.setDate(date.getDate() - 7);
  else if (period === 'last3months') date.setMonth(date.getMonth() - 3);
  else if (period === 'last6months') date.setMonth(date.getMonth() - 6);
  else if (period === 'lastyear') date.setFullYear(date.getFullYear() - 1);
  else date.setDate(date.getDate() - 30);
  date.setHours(0, 0, 0, 0);
  return date;
}

function leadInPeriod(lead, start) {
  const date = new Date(lead.createdAt || lead.createdDate || 0);
  return Number.isNaN(date.getTime()) || date >= start;
}

function slaReasonForLead(lead) {
  if (lead.isFirstCallBreach) return 'First call missed';
  if (lead.isCallbackDue) return 'Callback due';
  if (lead.isDocsBreach) return 'Docs pending breach';
  if (lead.isDocsWarning) return 'Docs pending warning';
  return 'On track';
}

function makeRate(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

async function getTelecallerSlaReport(filters = {}) {
  const period = ['last7days', 'last30days', 'last3months', 'last6months', 'lastyear'].includes(filters.period)
    ? filters.period
    : 'last30days';
  const leads = (await listTelecallerWorkbench()).filter((lead) => leadInPeriod(lead, periodStart(period)));
  const breached = leads.filter((lead) => lead.slaBreached);
  const warnings = leads.filter((lead) => lead.slaStatus === 'Warning');
  const noDisposition = leads.filter((lead) => lead.hasNoDisposition);
  const callbackDue = leads.filter((lead) => lead.isCallbackDue);
  const firstCallBreached = leads.filter((lead) => lead.isFirstCallBreach);
  const docsBreached = leads.filter((lead) => lead.isDocsBreach);
  const readyHandoff = leads.filter((lead) => lead.isReadyForHandoff);
  const sentToCredit = leads.filter((lead) => lead.isSentToCredit);

  const byOwnerMap = new Map();
  leads.forEach((lead) => {
    const owner = lead.assignedTo || 'Unassigned';
    const current = byOwnerMap.get(owner) || {
      breached: 0,
      callbackDue: 0,
      docsBreached: 0,
      firstCallBreached: 0,
      name: owner,
      total: 0,
      warning: 0,
    };
    current.total += 1;
    if (lead.slaBreached) current.breached += 1;
    if (lead.slaStatus === 'Warning') current.warning += 1;
    if (lead.isCallbackDue) current.callbackDue += 1;
    if (lead.isDocsBreach) current.docsBreached += 1;
    if (lead.isFirstCallBreach) current.firstCallBreached += 1;
    byOwnerMap.set(owner, current);
  });

  const byReason = countBy(leads, slaReasonForLead);
  const byOwner = Array.from(byOwnerMap.values()).map((row) => ({
    ...row,
    breachRate: makeRate(row.breached, row.total),
  })).sort((a, b) => b.breached - a.breached || b.total - a.total);

  return {
    generatedAt: new Date().toISOString(),
    period,
    summary: {
      breachRate: makeRate(breached.length, leads.length),
      callbackDue: callbackDue.length,
      docsBreached: docsBreached.length,
      firstCallBreached: firstCallBreached.length,
      noDisposition: noDisposition.length,
      onTrack: leads.filter((lead) => lead.slaStatus === 'On Track').length,
      readyHandoff: readyHandoff.length,
      sentToCredit: sentToCredit.length,
      slaBreached: breached.length,
      totalLeads: leads.length,
      warning: warnings.length,
    },
    byOwner,
    byReason,
    breachedLeads: breached.slice(0, 50).map((lead) => ({
      assignedTo: lead.assignedTo,
      createdAt: lead.createdAt || lead.createdDate,
      id: lead.id,
      name: lead.name,
      nextAction: lead.nextAction,
      nextActionDueAt: lead.nextActionDueAt,
      phone: lead.phone,
      priority: lead.priority,
      reason: slaReasonForLead(lead),
      slaStatus: lead.slaStatus,
    })),
  };
}

let creditQueueCache = {
  timestamp: 0,
  data: null,
};
let creditApplicationsCache = {
  timestamp: 0,
  data: null,
};
const CREDIT_CACHE_TTL_MS = 15 * 1000; // 15 seconds

function invalidateCreditCache() {
  creditQueueCache.data = null;
  creditApplicationsCache.data = null;
}

async function listCreditQueue() {
  if (creditQueueCache.data && (Date.now() - creditQueueCache.timestamp < CREDIT_CACHE_TTL_MS)) {
    return creditQueueCache.data;
  }

  const [candidates, handoffs, docCounts, callLogs] = await Promise.all([
    query(`
      SELECT
        COALESCE(NULLIF(la.application_id, ''), CONCAT('APP-', la.id)) AS id,
        CAST(la.id AS CHAR) AS rawId,
        la.application_id,
        COALESCE(NULLIF(la.full_name, ''), CONCAT('Applicant ', la.id)) AS name,
        COALESCE(la.email, '') AS email,
        la.mobile AS phone,
        la.loan_amount AS loanAmount,
        COALESCE(NULLIF(la.priority, ''), CASE
          WHEN la.loan_amount >= 200000 THEN 'High'
          WHEN la.loan_amount >= 50000 THEN 'Medium'
          ELSE 'Low'
        END) AS priority,
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
        COALESCE(la.monthly_income, 0) AS monthlyIncome,
        COALESCE(la.pan_number, '') AS panNumber,
        COALESCE(la.bank_name, '') AS bankName,
        COALESCE(la.account_number, '') AS accountNumber,
        COALESCE(la.ifsc_code, '') AS ifscCode,
        COALESCE(la.salary_slip_current, '') AS salarySlipCurrent,
        COALESCE(la.aadhaar_verified, 0) AS aadhaarVerified,
        la.assigned_to,
        la.created_at
      FROM loan_applications la
      WHERE la.status NOT IN ('approved', 'rejected', 'disbursed', 'closed')
      ORDER BY la.created_at DESC, la.id DESC
    `).catch(() => []),

    query(`
      SELECT id, application_id, lead_id, status, submitted_by, submitted_at, notes,
             TIMESTAMPDIFF(HOUR, submitted_at, CURRENT_TIMESTAMP) AS handoffAgeHours
      FROM lead_credit_handoffs
      ORDER BY id ASC
    `).catch(() => []),

    query(`
      SELECT application_id, COUNT(*) AS total_count, SUM(status = 'verified') AS verified_count
      FROM lead_document_checks
      GROUP BY application_id
    `).catch(() => []),

    query(`
      SELECT id, application_id, lead_id, disposition, created_at
      FROM lead_call_logs
      ORDER BY id ASC
    `).catch(() => []),
  ]);

  if (!candidates || !candidates.length) {
    creditQueueCache = { timestamp: Date.now(), data: [] };
    return [];
  }

  const handoffMap = new Map();
  handoffs.forEach((h) => {
    if (h.application_id) handoffMap.set(String(h.application_id), h);
    if (h.lead_id) handoffMap.set(String(h.lead_id), h);
  });

  const docCountMap = new Map();
  docCounts.forEach((d) => {
    if (d.application_id) docCountMap.set(String(d.application_id), d);
  });

  const callLogMap = new Map();
  callLogs.forEach((cl) => {
    if (cl.application_id) callLogMap.set(String(cl.application_id), cl);
    if (cl.lead_id) callLogMap.set(String(cl.lead_id), cl);
  });

  const matchedRows = [];
  for (const la of candidates) {
    const h = handoffMap.get(la.id) || handoffMap.get(la.rawId) || handoffMap.get(String(la.application_id || ''));
    const isReadyHandoff = h && h.status === 'ready';
    const isSendToCredit = la.status === 'Send to Credit Manager';
    const isCreditManager = la.assigned_to === 'Credit Manager';
    const isShruti = String(la.assigned_to || '').toLowerCase().includes('shruti');

    if (!isReadyHandoff && !isSendToCredit && !isCreditManager && !isShruti) {
      continue;
    }

    const latestCall = callLogMap.get(la.id) || callLogMap.get(la.rawId) || callLogMap.get(String(la.application_id || ''));
    const docCount = docCountMap.get(la.id) || docCountMap.get(la.rawId) || docCountMap.get(String(la.application_id || ''));
    const submittedAt = (h && h.submitted_at) || la.created_at;

    matchedRows.push({
      ...la,
      submittedBy: (h && h.submitted_by) || la.assigned_to || 'Telecaller',
      submittedAt,
      handoffNotes: (h && h.notes) || '',
      handoffAgeHours: h && h.handoffAgeHours !== undefined ? Number(h.handoffAgeHours || 0) : Math.floor((Date.now() - new Date(submittedAt).getTime()) / (3600 * 1000)),
      latestCallDisposition: latestCall ? latestCall.disposition : null,
      latestCallAt: latestCall ? latestCall.created_at : null,
      documentTotalCount: docCount ? Number(docCount.total_count || 0) : 0,
      documentVerifiedCount: docCount ? Number(docCount.verified_count || 0) : 0,
    });
  }

  matchedRows.sort((a, b) => {
    const timeA = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
    const timeB = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
    if (timeB !== timeA) return timeB - timeA;
    const idDiff = Number(b.rawId || 0) - Number(a.rawId || 0);
    if (idDiff !== 0) return idDiff;
    const priorityWeight = (p) => {
      if (p === 'Urgent') return 0;
      if (p === 'High') return 1;
      if (p === 'Medium') return 2;
      return 3;
    };
    return priorityWeight(a.priority) - priorityWeight(b.priority);
  });

  const finalLeads = matchedRows.map(mapCreditQueueLead);
  creditQueueCache = {
    timestamp: Date.now(),
    data: finalLeads,
  };
  return finalLeads;
}

function normalizeCreditPagination(filters = {}, defaultPageSize = 10) {
  return {
    page: Math.max(1, Number.parseInt(filters.page, 10) || 1),
    pageSize: Math.min(100, Math.max(5, Number.parseInt(filters.pageSize, 10) || defaultPageSize)),
  };
}

function creditQueueMatchesSearch(lead, search) {
  if (!search) return true;
  return [
    lead.id,
    lead.rawId,
    lead.name,
    lead.email,
    lead.phone,
    lead.panNumber,
    lead.submittedBy,
  ].some((value) => String(value || '').toLowerCase().includes(search));
}

function creditQueueReadiness(lead) {
  const total = Number(lead.documentTotalCount || 0);
  if (total > 0) {
    return Math.round((Number(lead.documentVerifiedCount || 0) / total) * 100);
  }

  const checks = [
    Boolean(lead.panNumber),
    Boolean(lead.aadhaarVerified),
    Boolean(lead.bankName && lead.accountNumber && lead.ifscCode),
    Boolean(lead.salarySlipCurrent),
    Number(lead.monthlyIncome || 0) >= 15000,
  ];

  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

function creditQueueHasDocsGap(lead) {
  return Number(lead.pendingDocumentCount || 0) > 0;
}

function creditQueueIsSlaRisk(lead) {
  return Number(lead.handoffAgeHours || 0) >= 24;
}

function creditQueueIsNew(lead) {
  return Number(lead.handoffAgeHours || 0) <= 2;
}

function creditQueueMatchesTab(lead, tab) {
  if (tab === 'all') return true;
  if (tab === 'new') return creditQueueIsNew(lead);
  if (tab === 'high-priority') return ['High', 'Urgent'].includes(lead.priority);
  if (tab === 'docs-gap') return creditQueueHasDocsGap(lead);
  if (tab === 'sla-risk') return creditQueueIsSlaRisk(lead);
  if (tab === 'ready') return creditQueueReadiness(lead) >= 80 && !creditQueueHasDocsGap(lead);
  return true;
}

async function listCreditQueueV2(filters = {}) {
  const { page, pageSize } = normalizeCreditPagination(filters);
  const search = String(filters.search || '').trim().toLowerCase();
  const priority = String(filters.priority || 'all').trim();
  const readiness = String(filters.readiness || 'all').trim();
  const tab = ['all', 'new', 'high-priority', 'docs-gap', 'sla-risk', 'ready'].includes(filters.tab)
    ? filters.tab
    : 'all';
  const allLeads = await listCreditQueue();
  const baseLeads = allLeads.filter((lead) => (
    creditQueueMatchesSearch(lead, search) &&
    (priority === 'all' || lead.priority === priority) &&
    (readiness === 'all' ||
      (readiness === 'ready'
        ? creditQueueReadiness(lead) >= 80 && !creditQueueHasDocsGap(lead)
        : creditQueueReadiness(lead) < 80 || creditQueueHasDocsGap(lead)))
  ));
  const filteredLeads = baseLeads.filter((lead) => creditQueueMatchesTab(lead, tab));
  const totalItems = filteredLeads.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;

  return {
    counts: {
      all: baseLeads.length,
      docsGap: baseLeads.filter((lead) => creditQueueMatchesTab(lead, 'docs-gap')).length,
      highPriority: baseLeads.filter((lead) => creditQueueMatchesTab(lead, 'high-priority')).length,
      new: baseLeads.filter((lead) => creditQueueMatchesTab(lead, 'new')).length,
      ready: baseLeads.filter((lead) => creditQueueMatchesTab(lead, 'ready')).length,
      slaRisk: baseLeads.filter((lead) => creditQueueMatchesTab(lead, 'sla-risk')).length,
    },
    filters: { page: safePage, pageSize, priority, readiness, search, tab },
    items: filteredLeads.slice(start, start + pageSize),
    pagination: {
      page: safePage,
      pageSize,
      totalItems,
      totalPages,
    },
    stats: {
      averageReadiness: allLeads.length
        ? Math.round(allLeads.reduce((sum, lead) => sum + creditQueueReadiness(lead), 0) / allLeads.length)
        : 0,
      docsGapCount: allLeads.filter(creditQueueHasDocsGap).length,
      highPriorityCount: allLeads.filter((lead) => ['High', 'Urgent'].includes(lead.priority)).length,
      readyCount: allLeads.filter((lead) => creditQueueReadiness(lead) >= 80 && !creditQueueHasDocsGap(lead)).length,
      slaRiskCount: allLeads.filter(creditQueueIsSlaRisk).length,
      total: allLeads.length,
    },
  };
}

function mapCreditApplication(row) {
  const pendingDocuments = Math.max(0, Number(row.documentTotalCount || 0) - Number(row.documentVerifiedCount || 0));
  const leadStatus = row.status || 'Document Collection';
  const handoffStatus = row.handoffStatus || '';
  const sanctionStatus = row.sanctionEmailStatus || '';
  const agreementStatus = row.loanAgreementStatus || '';
  const accountingHandoffAt = row.accountingHandoffAt || null;
  const loanStatus = row.loanStatus || '';
  const loanBalance = row.loanBalance !== undefined && row.loanBalance !== null ? Number(row.loanBalance) : null;
  let stage = 'In Review';
  const isExplicitlyRejected = leadStatus === 'Lost' || handoffStatus === 'rejected' || row.decision === 'rejected';

  if (isExplicitlyRejected) {
    stage = 'Rejected';
  } else if (leadStatus === 'Converted' || loanStatus === 'Active' || loanStatus === 'Overdue') {
    stage = 'Disbursed';
  } else if (loanStatus === 'Paid Off' || (loanBalance !== null && loanBalance <= 0 && (leadStatus === 'closed' || leadStatus === 'Closed') && !row.sanctionId && !row.loanAgreementId)) {
    stage = 'Closed';
  } else if (agreementStatus === 'signed' && accountingHandoffAt) {
    stage = 'Sent to Accountant';
  } else if (agreementStatus === 'signed') {
    stage = 'Agreement Signed';
  } else if (agreementStatus === 'sent') {
    stage = 'Agreement Pending eSign';
  } else if (agreementStatus === 'failed') {
    stage = 'Agreement Failed';
  } else if (sanctionStatus === 'sent' || Boolean(row.sanctionId)) {
    stage = 'Sanction Sent';
  } else if (sanctionStatus === 'failed') {
    stage = 'Sanction Failed';
  } else if (leadStatus === 'Qualified' || handoffStatus === 'approved') {
    stage = 'Sent to Accountant';
  } else if (leadStatus === 'closed' || leadStatus === 'Closed') {
    stage = 'Closed';
  }

  return {
    id: row.id,
    rawId: row.rawId,
    name: row.name || '',
    email: row.email || '',
    phone: row.phone || '',
    loanAmount: Number(row.loanAmount || 0),
    priority: row.priority || 'Medium',
    status: leadStatus,
    assignedTo: row.assignedTo || '',
    monthlyIncome: Number(row.monthlyIncome || 0),
    panNumber: row.panNumber || '',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    submittedBy: row.submittedBy || '',
    submittedAt: row.submittedAt || null,
    reviewedBy: row.reviewedBy || '',
    reviewedAt: row.reviewedAt || null,
    decision: row.decision || '',
    decisionNotes: row.decisionNotes || '',
    handoffStatus,
    handoffAgeHours: Number(row.handoffAgeHours || 0),
    documentTotalCount: Number(row.documentTotalCount || 0),
    documentVerifiedCount: Number(row.documentVerifiedCount || 0),
    pendingDocumentCount: pendingDocuments,
    camSheetId: row.camSheetId || null,
    camStatus: row.camStatus || '',
    camVersion: row.camVersion || null,
    camCreatedAt: row.camCreatedAt || null,
    sanctionId: row.sanctionId || null,
    agreementNumber: row.agreementNumber || '',
    sanctionEmailStatus: sanctionStatus,
    sanctionSentAt: row.sanctionSentAt || null,
    sanctionPdfPath: row.sanctionPdfPath || '',
    sanctionWhatsappStatus: row.sanctionWhatsappStatus || 'pending',
    sanctionWhatsappError: row.sanctionWhatsappError || '',
    sanctionWhatsappSentAt: row.sanctionWhatsappSentAt || null,
    customerDecision: row.sanctionCustomerDecision || 'pending',
    customerDecisionAt: row.sanctionCustomerDecisionAt || null,
    customerDecisionIp: row.sanctionCustomerDecisionIp || '',
    sanctionAmount: Number(row.sanctionAmount || row.loanAmount || 0),
    disbursementAmount: Number(row.disbursementAmount || 0),
    repaymentAmount: Number(row.repaymentAmount || 0),
    loanAgreementId: row.loanAgreementId || null,
    loanAgreementStatus: agreementStatus,
    loanAgreementProviderStatus: row.loanAgreementProviderStatus || '',
    loanAgreementSentAt: row.loanAgreementSentAt || null,
    loanAgreementSignedAt: row.loanAgreementSignedAt || null,
    signingUrl: row.signingUrl || '',
    agreementPdfPath: row.agreementPdfPath || '',
    signedAgreementPdfPath: row.signedAgreementPdfPath || '',
    accountingHandoffAt: row.accountingHandoffAt || null,
    accountingHandoffBy: row.accountingHandoffBy || '',
    accountAggregatorStatus: row.accountAggregatorStatus || '',
    accountAggregatorFipName: row.accountAggregatorFipName || '',
    stage,
    isDuplicate: Boolean(row.isDuplicate),
    duplicateCount: Number(row.duplicateCount || 0),
  };
}

function makeLoanId(lead, agreementNumber = '') {
  const source = agreementNumber || lead?.id || lead?.rawId || Date.now();
  const compact = String(source).replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (compact.startsWith('LN')) return compact.slice(0, 32);
  return `LN${compact}`.slice(0, 32);
}

function todaySqlDate() {
  return sqlDateFromDate(new Date());
}

function sqlDateFromDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function sqlDate(value, fallback = todaySqlDate()) {
  if (!value) return fallback;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return sqlDateFromDate(value);
  }

  const text = String(value).trim();
  const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return sqlDateFromDate(parsed);
  }

  return fallback;
}

function mapAccountingQueueItem(row) {
  return {
    id: row.id || '',
    rawId: row.rawId || '',
    customerName: row.customerName || '',
    loanId: makeLoanId({ id: row.id, rawId: row.rawId }, row.agreementNumber),
    agreementNumber: row.agreementNumber || '',
    esignDate: row.esignDate || null,
    panNumber: row.panNumber || '',
    phone: row.phone || '',
    loanAmount: Number(row.loanAmount || 0),
    processingFee: Number(row.processingFee || 0),
    gstAmount: Number(row.gstAmount || 0),
    disbursementAmount: Number(row.disbursementAmount || 0),
    repaymentAmount: Number(row.repaymentAmount || 0),
    tenureDays: Number(row.tenureDays || 30),
    dueDate: row.dueDate || null,
    bankName: row.bankName || '',
    accountNumber: row.accountNumber || '',
    ifscCode: row.ifscCode || '',
    status: row.status || 'Qualified',
    signedAgreementId: row.signedAgreementId || null,
    sanctionId: row.sanctionId || null,
  };
}

function mapRecentAccountingPayment(row) {
  const profileImageUrl = normalizeSourceDocumentPath(row.selfieImage, row.sourceSystem);
  return {
    id: row.paymentId,
    leadId: row.leadId || '',
    applicationId: row.applicationId || '',
    customerName: row.customerName || '',
    phone: row.phone || '',
    profileImageUrl,
    selfieImage: profileImageUrl,
    loanId: row.loanId || '',
    agreementNumber: row.agreementNumber || '',
    principal: Number(row.principal || row.disbursementAmount || 0),
    disbursementAmount: Number(row.disbursementAmount || 0),
    repaymentAmount: Number(row.repaymentAmount || 0),
    balance: Number(row.balance || 0),
    transferType: row.transferType || row.method || '',
    transactionId: row.transactionId || row.reference || '',
    paymentStatus: row.paymentStatus || 'paid',
    loanStatus: row.loanStatus || '',
    repaymentStatus: row.repaymentStatus || '',
    paidBy: row.paidBy || '',
    disbursedAt: row.disbursedAt || row.paidAt || null,
    paidAt: row.paidAt || null,
    startDate: row.startDate || null,
    dueDate: row.dueDate || null,
    nextPaymentDate: row.nextPaymentDate || null,
    accountNumber: row.accountNumber || '',
    bankName: row.bankName || '',
    ifscCode: row.ifscCode || '',
  };
}

async function listCreditApplications(filters = {}) {
  const search = String(filters.search || '').trim().toLowerCase();
  const stage = String(filters.stage || 'all').trim();

  if (creditApplicationsCache.data && (Date.now() - creditApplicationsCache.timestamp < CREDIT_CACHE_TTL_MS)) {
    const cached = creditApplicationsCache.data;
    const searched = search
      ? cached.filter((item) => creditApplicationMatchesSearch(item, search))
      : cached;
    return searched.filter((item) => stage === 'all' || item.stage.toLowerCase().replace(/\s+/g, '-') === stage);
  }

  const baseRows = await query(`
    SELECT
      COALESCE(NULLIF(la.application_id, ''), CONCAT('APP-', la.id)) AS id,
      CAST(la.id AS CHAR) AS rawId,
      COALESCE(NULLIF(la.full_name, ''), CONCAT('Applicant ', la.id)) AS name,
      COALESCE(la.email, '') AS email,
      la.mobile AS phone,
      la.loan_amount AS loanAmount,
      COALESCE(NULLIF(la.priority, ''), CASE
        WHEN la.loan_amount >= 200000 THEN 'High'
        WHEN la.loan_amount >= 50000 THEN 'Medium'
        ELSE 'Low'
      END) AS priority,
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
      COALESCE(NULLIF(la.assigned_to, ''), 'Unassigned') AS assignedTo,
      COALESCE(la.monthly_income, 0) AS monthlyIncome,
      COALESCE(la.pan_number, '') AS panNumber,
      ${dateTimeSql('la.created_at')} AS createdAt,
      ${dateTimeSql('la.updated_at')} AS updatedAt
    FROM loan_applications la
    ORDER BY la.created_at DESC, la.id DESC
  `);

  if (!baseRows || !baseRows.length) return [];

  const [handoffs, cams, sanctions, agreements, accountingEvents, loansList, aaSessions, docCounts] = await Promise.all([
    query(`
      SELECT application_id, lead_id, status, submitted_by, ${dateTimeSql('submitted_at')} AS submitted_at,
             reviewed_by, ${dateTimeSql('reviewed_at')} AS reviewed_at, decision, decision_notes,
             TIMESTAMPDIFF(HOUR, submitted_at, CURRENT_TIMESTAMP) AS handoffAgeHours
      FROM lead_credit_handoffs
      ORDER BY id ASC
    `).catch(() => []),

    query(`
      SELECT id, application_id, lead_id, status, version, ${dateTimeSql('created_at')} AS created_at
      FROM lead_cam_sheets
      ORDER BY id ASC
    `).catch(() => []),

    query(`
      SELECT id, application_id, lead_id, agreement_number, email_status, ${dateTimeSql('sent_at')} AS sent_at,
             pdf_path, whatsapp_status, whatsapp_error, ${dateTimeSql('whatsapp_sent_at')} AS whatsapp_sent_at,
             principal_amount, disbursed_amount, repayment_amount
      FROM lead_sanctions
      ORDER BY id ASC
    `).catch(() => []),

    query(`
      SELECT id, application_id, lead_id, status, provider_status, ${dateTimeSql('sent_at')} AS sent_at,
             ${dateTimeSql('signed_at')} AS signed_at, signing_url, pdf_path, signed_pdf_path
      FROM lead_loan_agreements
      ORDER BY id ASC
    `).catch(() => []),

    query(`
      SELECT application_id, lead_id, ${dateTimeSql('occurred_at')} AS occurred_at, actor
      FROM lead_status_events
      WHERE stage_key = 'accounting_handoff'
      ORDER BY id ASC
    `).catch(() => []),

    query(`
      SELECT id, status, balance FROM loans
    `).catch(() => []),

    query(`
      SELECT application_id, tracking_id, status, fip_name
      FROM lead_account_aggregator_sessions
      ORDER BY id ASC
    `).catch(() => []),

    query(`
      SELECT application_id, COUNT(*) AS total_count, SUM(status = 'verified') AS verified_count
      FROM lead_document_checks
      GROUP BY application_id
    `).catch(() => []),
  ]);

  const extractNum = (str) => {
    const s = String(str || '').trim();
    const digits = s.replace(/^[A-Z\-]+/g, '').replace(/^0+/, '');
    return /^\d+$/.test(digits) ? digits : '';
  };

  const handoffMap = new Map();
  handoffs.forEach((h) => {
    if (h.application_id) handoffMap.set(String(h.application_id), h);
    if (h.lead_id) handoffMap.set(String(h.lead_id), h);
  });

  const camMap = new Map();
  cams.forEach((c) => {
    if (c.application_id) camMap.set(String(c.application_id), c);
    if (c.lead_id) camMap.set(String(c.lead_id), c);
  });

  const sanctionMap = new Map();
  sanctions.forEach((s) => {
    if (s.application_id) sanctionMap.set(String(s.application_id), s);
    if (s.lead_id) sanctionMap.set(String(s.lead_id), s);
  });

  const agreementMap = new Map();
  agreements.forEach((a) => {
    if (a.application_id) agreementMap.set(String(a.application_id), a);
    if (a.lead_id) agreementMap.set(String(a.lead_id), a);
  });

  const accountingMap = new Map();
  accountingEvents.forEach((se) => {
    if (se.application_id) accountingMap.set(String(se.application_id), se);
    if (se.lead_id) accountingMap.set(String(se.lead_id), se);
  });

  const loanMap = new Map();
  loansList.forEach((l) => {
    if (l.id) loanMap.set(String(l.id), l);
  });

  const aaMap = new Map();
  aaSessions.forEach((aa) => {
    if (aa.application_id) {
      const appStr = String(aa.application_id).trim();
      aaMap.set(appStr, aa);
      const n1 = extractNum(appStr);
      if (n1) aaMap.set(n1, aa);
    }
    if (aa.tracking_id) {
      const match = String(aa.tracking_id).match(/^AA_(?:TRK|TRACK)_([0-9]+)_/i);
      const n2 = match ? match[1] : '';
      if (n2) aaMap.set(n2, aa);
    }
  });

  const docMap = new Map();
  docCounts.forEach((d) => {
    if (d.application_id) docMap.set(String(d.application_id), d);
  });

  const enrichedRows = baseRows.map((row) => {
    const h = handoffMap.get(row.id) || handoffMap.get(row.rawId);
    const cam = camMap.get(row.id) || camMap.get(row.rawId);
    const sanction = sanctionMap.get(row.id) || sanctionMap.get(row.rawId);
    const agreement = agreementMap.get(row.id) || agreementMap.get(row.rawId);
    const accountingHandoff = accountingMap.get(row.id) || accountingMap.get(row.rawId);
    const l = loanMap.get(row.id) || loanMap.get(`LN${row.id}`) || loanMap.get(`LNWQTMN0${row.rawId}`) || loanMap.get(`LNWQTMN0${row.id}`);
    const aa = aaMap.get(row.id) || aaMap.get(row.rawId) || aaMap.get(extractNum(row.id)) || aaMap.get(extractNum(row.rawId));
    const doc = docMap.get(row.id) || docMap.get(row.rawId);

    return {
      ...row,
      handoffStatus: h ? h.status : '',
      submittedBy: h ? h.submitted_by : '',
      submittedAt: h ? h.submitted_at : null,
      reviewedBy: h ? h.reviewed_by : '',
      reviewedAt: h ? h.reviewed_at : null,
      decision: h ? h.decision : '',
      decisionNotes: h ? h.decision_notes : '',
      handoffAgeHours: h ? Number(h.handoffAgeHours || 0) : 0,
      documentTotalCount: doc ? Number(doc.total_count || 0) : 0,
      documentVerifiedCount: doc ? Number(doc.verified_count || 0) : 0,
      camSheetId: cam ? cam.id : null,
      camStatus: cam ? cam.status : '',
      camVersion: cam ? cam.version : null,
      camCreatedAt: cam ? cam.created_at : null,
      sanctionId: sanction ? sanction.id : null,
      agreementNumber: sanction ? sanction.agreement_number : '',
      sanctionEmailStatus: sanction ? sanction.email_status : '',
      sanctionSentAt: sanction ? sanction.sent_at : null,
      sanctionPdfPath: sanction ? sanction.pdf_path : '',
      sanctionWhatsappStatus: sanction ? sanction.whatsapp_status : 'pending',
      sanctionWhatsappError: sanction ? sanction.whatsapp_error : '',
      sanctionWhatsappSentAt: sanction ? sanction.whatsapp_sent_at : null,
      sanctionCustomerDecision: sanction ? sanction.customer_decision : 'pending',
      sanctionCustomerDecisionAt: sanction ? sanction.customer_decision_at : null,
      sanctionCustomerDecisionIp: sanction ? sanction.customer_decision_ip : '',
      sanctionAmount: sanction ? Number(sanction.principal_amount || 0) : Number(row.loanAmount || 0),
      disbursementAmount: sanction ? Number(sanction.disbursed_amount || 0) : 0,
      repaymentAmount: sanction ? Number(sanction.repayment_amount || 0) : 0,
      loanAgreementId: agreement ? agreement.id : null,
      loanAgreementStatus: agreement ? agreement.status : '',
      loanAgreementProviderStatus: agreement ? agreement.provider_status : '',
      loanAgreementSentAt: agreement ? agreement.sent_at : null,
      loanAgreementSignedAt: agreement ? agreement.signed_at : null,
      signingUrl: agreement ? agreement.signing_url : '',
      agreementPdfPath: agreement ? agreement.pdf_path : '',
      signedAgreementPdfPath: agreement ? agreement.signed_pdf_path : '',
      accountingHandoffAt: accountingHandoff ? accountingHandoff.occurred_at : null,
      accountingHandoffBy: accountingHandoff ? accountingHandoff.actor : '',
      loanStatus: l ? l.status : '',
      loanBalance: l && l.balance !== undefined && l.balance !== null ? Number(l.balance) : null,
      accountAggregatorStatus: aa ? aa.status : '',
      accountAggregatorFipName: aa ? aa.fip_name : '',
    };
  });

  const mapped = enrichedRows.map(mapCreditApplication);
  creditApplicationsCache = {
    timestamp: Date.now(),
    data: mapped,
  };

  const searched = search
    ? mapped.filter((item) => creditApplicationMatchesSearch(item, search))
    : mapped;

  return searched.filter((item) => stage === 'all' || item.stage.toLowerCase().replace(/\s+/g, '-') === stage);
}

function creditApplicationMatchesSearch(application, search) {
  if (!search) return true;
  return [
    application.id,
    application.rawId,
    application.name,
    application.email,
    application.phone,
    application.panNumber,
    application.agreementNumber,
    application.assignedTo,
    application.stage,
  ].some((value) => String(value || '').toLowerCase().includes(search));
}

function creditApplicationMatchesStage(application, stage) {
  if (stage === 'all') return true;
  if (stage === 'failed') return application.stage.includes('Failed');
  return application.stage.toLowerCase().replace(/\s+/g, '-') === stage;
}

async function listCreditApplicationsV2(filters = {}) {
  const { page, pageSize } = normalizeCreditPagination(filters);
  const search = String(filters.search || '').trim().toLowerCase();
  const priority = String(filters.priority || 'all').trim();
  const stage = String(filters.stage || 'all').trim();
  const allApplications = await listCreditApplications({ stage: 'all' });
  const baseApplications = allApplications.filter((application) => (
    creditApplicationMatchesSearch(application, search) &&
    (priority === 'all' || application.priority === priority)
  ));
  const filteredApplications = baseApplications.filter((application) => creditApplicationMatchesStage(application, stage));
  const totalItems = filteredApplications.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;

  const stageCounts = {
    all: baseApplications.length,
    disbursed: 0,
    'agreement-pending-esign': 0,
    'agreement-signed': 0,
    failed: 0,
    'in-review': 0,
    rejected: 0,
    'sanction-sent': 0,
    'sent-to-accountant': 0,
    closed: 0,
  };
  baseApplications.forEach((application) => {
    const slug = application.stage.toLowerCase().replace(/\s+/g, '-');
    if (stageCounts[slug] !== undefined) stageCounts[slug] += 1;
    if (application.stage.includes('Failed')) stageCounts.failed += 1;
  });

  return {
    counts: stageCounts,
    filters: { page: safePage, pageSize, priority, search, stage },
    items: filteredApplications.slice(start, start + pageSize),
    pagination: {
      page: safePage,
      pageSize,
      totalItems,
      totalPages,
    },
    stats: {
      inReview: allApplications.filter((app) => app.stage === 'In Review' || (app.stage || '').toLowerCase().includes('review')).length,
      sanctioned: allApplications.filter((app) => app.stage === 'Sanction Sent' || Boolean(app.sanctionId) || app.sanctionEmailStatus === 'sent').length,
      agreementPending: allApplications.filter((app) => app.stage === 'Agreement Pending eSign' || app.loanAgreementStatus === 'sent').length,
      agreementSigned: allApplications.filter((app) => app.stage === 'Agreement Signed' || app.loanAgreementStatus === 'signed').length,
      sentToAccountant: allApplications.filter((app) => app.stage === 'Sent to Accountant' || Boolean(app.accountingHandoffAt)).length,
    },
  };
}

async function listAccountingQueue() {
  const rows = await query(`
    SELECT
      COALESCE(NULLIF(la.application_id, ''), CONCAT('APP-', la.id)) AS id,
      CAST(la.id AS CHAR) AS rawId,
      COALESCE(NULLIF(la.full_name, ''), CONCAT('Applicant ', la.id)) AS customerName,
      COALESCE(la.pan_number, '') AS panNumber,
      la.mobile AS phone,
      CASE la.status
        WHEN 'approved' THEN 'Qualified'
        WHEN 'disbursed' THEN 'Converted'
        ELSE la.status
      END AS status,
      sanction.id AS sanctionId,
      sanction.agreement_number AS agreementNumber,
      sanction.principal_amount AS loanAmount,
      sanction.processing_fee AS processingFee,
      sanction.gst_amount AS gstAmount,
      sanction.disbursed_amount AS disbursementAmount,
      sanction.repayment_amount AS repaymentAmount,
      sanction.tenure_days AS tenureDays,
      sanction.due_date AS dueDate,
      COALESCE(NULLIF(sanction.bank_name, ''), la.bank_name, '') AS bankName,
      COALESCE(NULLIF(sanction.account_number, ''), la.account_number, '') AS accountNumber,
      COALESCE(NULLIF(sanction.ifsc_code, ''), la.ifsc_code, '') AS ifscCode,
      agreement.id AS signedAgreementId,
      agreement.signed_at AS esignDate
    FROM loan_applications la
    INNER JOIN lead_sanctions sanction
      ON sanction.id = COALESCE(
        (SELECT s2.id FROM lead_sanctions s2 WHERE la.application_id <> '' AND s2.application_id = la.application_id ORDER BY s2.created_at DESC, s2.id DESC LIMIT 1),
        (SELECT s2.id FROM lead_sanctions s2 WHERE s2.lead_id = CAST(la.id AS CHAR) ORDER BY s2.created_at DESC, s2.id DESC LIMIT 1)
      )
    INNER JOIN lead_loan_agreements agreement
      ON agreement.id = COALESCE(
        (SELECT a2.id FROM lead_loan_agreements a2 WHERE la.application_id <> '' AND a2.application_id = la.application_id AND a2.status = 'signed' ORDER BY a2.signed_at DESC, a2.id DESC LIMIT 1),
        (SELECT a2.id FROM lead_loan_agreements a2 WHERE a2.lead_id = CAST(la.id AS CHAR) AND a2.status = 'signed' ORDER BY a2.signed_at DESC, a2.id DESC LIMIT 1)
      )
    LEFT JOIN lead_accounting_payments payment
      ON payment.id = COALESCE(
        (SELECT p2.id FROM lead_accounting_payments p2 WHERE la.application_id <> '' AND p2.application_id = la.application_id ORDER BY p2.paid_at DESC, p2.id DESC LIMIT 1),
        (SELECT p2.id FROM lead_accounting_payments p2 WHERE p2.lead_id = CAST(la.id AS CHAR) ORDER BY p2.paid_at DESC, p2.id DESC LIMIT 1)
      )
    LEFT JOIN lead_status_events accounting_handoff
      ON accounting_handoff.id = COALESCE(
        (SELECT se2.id FROM lead_status_events se2 WHERE la.application_id <> '' AND se2.application_id = la.application_id AND se2.stage_key = 'accounting_handoff' ORDER BY se2.occurred_at DESC, se2.id DESC LIMIT 1),
        (SELECT se2.id FROM lead_status_events se2 WHERE se2.lead_id = CAST(la.id AS CHAR) AND se2.stage_key = 'accounting_handoff' ORDER BY se2.occurred_at DESC, se2.id DESC LIMIT 1)
      )
    WHERE la.status = 'approved'
      AND payment.id IS NULL
      AND accounting_handoff.id IS NOT NULL
      AND la.id NOT IN (1986, 127, '1986', '127')
      AND COALESCE(la.application_id, '') NOT IN ('LNWQTMN01986', 'LNWQTMN00127', 'WQTMN01986', 'WQTMN00127', 'WAQTFN-PD-1782455676578', 'WAQTMN-PD-890903924560')
      AND COALESCE(sanction.agreement_number, '') NOT IN ('LNWQTMN01986', 'LNWQTMN00127', 'WQTMN01986', 'WQTMN00127', '01986', '00127')
    ORDER BY accounting_handoff.occurred_at DESC, accounting_handoff.id DESC, agreement.signed_at DESC, sanction.created_at DESC
  `);

  const excludedSet = new Set([
    '1986', '127',
    'LNWQTMN01986', 'LNWQTMN00127',
    'WQTMN01986', 'WQTMN00127',
    '01986', '00127',
    'WAQTFN-PD-1782455676578', 'WAQTMN-PD-890903924560'
  ]);

  return rows
    .filter(r => !excludedSet.has(String(r.id)) && !excludedSet.has(String(r.rawId)) && !excludedSet.has(String(r.agreementNumber)))
    .map(mapAccountingQueueItem);
}

function accountingQueueMatchesSearch(lead, search) {
  if (!search) return true;
  return [
    lead.id,
    lead.rawId,
    lead.customerName,
    lead.loanId,
    lead.agreementNumber,
    lead.panNumber,
    lead.phone,
    lead.bankName,
    lead.accountNumber,
    lead.ifscCode,
  ].some((value) => String(value || '').toLowerCase().includes(search));
}

async function listAccountingQueueV2(filters = {}) {
  const { page, pageSize } = normalizeCreditPagination(filters, 10);
  const search = String(filters.search || '').trim().toLowerCase();
  const allLeads = await listAccountingQueue();
  const filteredLeads = allLeads.filter((lead) => accountingQueueMatchesSearch(lead, search));
  const totalItems = filteredLeads.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const statsSource = search ? filteredLeads : allLeads;

  return {
    filters: { page: safePage, pageSize, search },
    items: filteredLeads.slice(start, start + pageSize),
    pagination: {
      page: safePage,
      pageSize,
      totalItems,
      totalPages,
    },
    stats: {
      bankReadyCount: statsSource.filter((lead) => lead.bankName && lead.accountNumber && lead.ifscCode).length,
      feeTotal: statsSource.reduce((sum, lead) => sum + Number(lead.processingFee || 0) + Number(lead.gstAmount || 0), 0),
      totalDisbursement: statsSource.reduce((sum, lead) => sum + Number(lead.disbursementAmount || 0), 0),
      totalLoanAmount: statsSource.reduce((sum, lead) => sum + Number(lead.loanAmount || 0), 0),
      totalQueue: statsSource.length,
    },
  };
}

async function listRecentAccountingPayments(limit = 10) {
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const rows = await query(`
    SELECT
      payment.id AS paymentId,
      payment.lead_id AS leadId,
      payment.application_id AS applicationId,
      payment.loan_id AS loanId,
      payment.amount AS disbursementAmount,
      payment.method AS method,
      payment.reference AS reference,
      payment.transfer_type AS transferType,
      payment.transaction_id AS transactionId,
      payment.status AS paymentStatus,
      payment.paid_by AS paidBy,
      payment.disbursed_at AS disbursedAt,
      payment.paid_at AS paidAt,
      COALESCE(NULLIF(la1.full_name, ''), NULLIF(la2.full_name, ''), CONCAT('Applicant ', COALESCE(la1.id, la2.id)), payment.application_id, payment.lead_id) AS customerName,
      COALESCE(la1.mobile, la2.mobile, '') AS phone,
      COALESCE(la1.selfie_image, la2.selfie_image, '') AS selfieImage,
      COALESCE(la1.source_system, la2.source_system, '') AS sourceSystem,
      COALESCE(sanction.agreement_number, '') AS agreementNumber,
      COALESCE(loan1.status, loan2.status) AS loanStatus,
      CASE
        WHEN COALESCE(loan1.balance, loan2.balance, GREATEST(schedule.total_due - schedule.amount_paid, 0), sanction.repayment_amount, 0) <= 0 THEN 'Paid'
        WHEN COALESCE(loan1.amount_paid, loan2.amount_paid, schedule.amount_paid, 0) > 0 THEN 'Partial'
        WHEN COALESCE(loan1.due_date, loan2.due_date, schedule.due_date, sanction.due_date) < CURRENT_DATE THEN 'Overdue'
        WHEN COALESCE(loan1.due_date, loan2.due_date, schedule.due_date, sanction.due_date) = CURRENT_DATE THEN 'Due Today'
        WHEN schedule.status IS NOT NULL THEN 'Pending'
        ELSE NULL
      END AS repaymentStatus,
      COALESCE(loan1.principal, loan2.principal, sanction.principal_amount, payment.amount, 0) AS principal,
      COALESCE(loan1.total_amount, loan2.total_amount, schedule.total_due, sanction.repayment_amount, 0) AS repaymentAmount,
      COALESCE(loan1.balance, loan2.balance, GREATEST(schedule.total_due - schedule.amount_paid, 0), sanction.repayment_amount, 0) AS balance,
      COALESCE(loan1.start_date, loan2.start_date) AS startDate,
      COALESCE(loan1.due_date, loan2.due_date, schedule.due_date, sanction.due_date) AS dueDate,
      COALESCE(loan1.next_payment_date, loan2.next_payment_date, schedule.due_date, sanction.due_date) AS nextPaymentDate,
      COALESCE(payment.account_number, la1.account_number, la2.account_number, '') AS accountNumber,
      COALESCE(payment.bank_name, la1.bank_name, la2.bank_name, '') AS bankName,
      COALESCE(payment.ifsc_code, la1.ifsc_code, la2.ifsc_code, '') AS ifscCode
    FROM lead_accounting_payments payment
    LEFT JOIN loan_applications la1
      ON payment.application_id <> '' AND la1.application_id = payment.application_id
    LEFT JOIN loan_applications la2
      ON payment.lead_id <> '' AND (la2.id = payment.lead_id OR CAST(la2.id AS CHAR) = payment.lead_id)
    LEFT JOIN loans loan1
      ON loan1.id = payment.loan_id
    LEFT JOIN loans loan2
      ON TRIM(LEADING 'LN' FROM UPPER(loan2.id)) = TRIM(LEADING 'LN' FROM UPPER(payment.loan_id))
    LEFT JOIN loan_repayment_schedule schedule
      ON schedule.id = COALESCE(
        (SELECT s2.id FROM loan_repayment_schedule s2 WHERE payment.loan_id IS NOT NULL AND s2.loan_id = payment.loan_id ORDER BY s2.installment_number ASC, s2.due_date ASC, s2.id ASC LIMIT 1),
        (SELECT s2.id FROM loan_repayment_schedule s2 WHERE COALESCE(loan1.id, loan2.id) IS NOT NULL AND s2.loan_id = COALESCE(loan1.id, loan2.id) ORDER BY s2.installment_number ASC, s2.due_date ASC, s2.id ASC LIMIT 1),
        (SELECT s2.id FROM loan_repayment_schedule s2 WHERE payment.application_id <> '' AND s2.application_id = payment.application_id ORDER BY s2.installment_number ASC, s2.due_date ASC, s2.id ASC LIMIT 1),
        (SELECT s2.id FROM loan_repayment_schedule s2 WHERE payment.lead_id <> '' AND s2.lead_id = payment.lead_id ORDER BY s2.installment_number ASC, s2.due_date ASC, s2.id ASC LIMIT 1)
      )
    LEFT JOIN lead_sanctions sanction
      ON sanction.id = COALESCE(
        (SELECT s2.id FROM lead_sanctions s2 WHERE payment.application_id <> '' AND s2.application_id = payment.application_id ORDER BY s2.created_at DESC, s2.id DESC LIMIT 1),
        (SELECT s2.id FROM lead_sanctions s2 WHERE payment.lead_id <> '' AND s2.lead_id = payment.lead_id ORDER BY s2.created_at DESC, s2.id DESC LIMIT 1)
      )
    ORDER BY payment.disbursed_at DESC, payment.id DESC
    LIMIT ${safeLimit}
  `);

  return rows.map(mapRecentAccountingPayment);
}

async function listRecentAccountingPaymentsV2(filters = {}) {
  const { page, pageSize } = normalizeCreditPagination(filters, 6);
  const [countRow] = await query(`
    SELECT COUNT(*) AS totalItems
    FROM lead_accounting_payments
  `);
  const totalItems = Number(countRow?.totalItems || 0);
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;
  const rows = await query(`
    SELECT
      payment.id AS paymentId,
      payment.lead_id AS leadId,
      payment.application_id AS applicationId,
      payment.loan_id AS loanId,
      payment.amount AS disbursementAmount,
      payment.method AS method,
      payment.reference AS reference,
      payment.transfer_type AS transferType,
      payment.transaction_id AS transactionId,
      payment.status AS paymentStatus,
      payment.paid_by AS paidBy,
      payment.disbursed_at AS disbursedAt,
      payment.paid_at AS paidAt,
      COALESCE(NULLIF(la1.full_name, ''), NULLIF(la2.full_name, ''), CONCAT('Applicant ', COALESCE(la1.id, la2.id)), payment.application_id, payment.lead_id) AS customerName,
      COALESCE(la1.mobile, la2.mobile, '') AS phone,
      COALESCE(la1.selfie_image, la2.selfie_image, '') AS selfieImage,
      COALESCE(la1.source_system, la2.source_system, '') AS sourceSystem,
      COALESCE(sanction.agreement_number, '') AS agreementNumber,
      COALESCE(loan1.status, loan2.status) AS loanStatus,
      CASE
        WHEN COALESCE(loan1.balance, loan2.balance, GREATEST(schedule.total_due - schedule.amount_paid, 0), sanction.repayment_amount, 0) <= 0 THEN 'Paid'
        WHEN COALESCE(loan1.amount_paid, loan2.amount_paid, schedule.amount_paid, 0) > 0 THEN 'Partial'
        WHEN COALESCE(loan1.due_date, loan2.due_date, schedule.due_date, sanction.due_date) < CURRENT_DATE THEN 'Overdue'
        WHEN COALESCE(loan1.due_date, loan2.due_date, schedule.due_date, sanction.due_date) = CURRENT_DATE THEN 'Due Today'
        WHEN schedule.status IS NOT NULL THEN 'Pending'
        ELSE NULL
      END AS repaymentStatus,
      COALESCE(loan1.total_amount, loan2.total_amount, schedule.total_due, sanction.repayment_amount, 0) AS repaymentAmount,
      COALESCE(loan1.balance, loan2.balance, GREATEST(schedule.total_due - schedule.amount_paid, 0), sanction.repayment_amount, 0) AS balance,
      COALESCE(loan1.start_date, loan2.start_date) AS startDate,
      COALESCE(loan1.due_date, loan2.due_date, schedule.due_date, sanction.due_date) AS dueDate,
      COALESCE(loan1.next_payment_date, loan2.next_payment_date, schedule.due_date, sanction.due_date) AS nextPaymentDate,
      COALESCE(payment.account_number, la1.account_number, la2.account_number, '') AS accountNumber,
      COALESCE(payment.bank_name, la1.bank_name, la2.bank_name, '') AS bankName,
      COALESCE(payment.ifsc_code, la1.ifsc_code, la2.ifsc_code, '') AS ifscCode
    FROM lead_accounting_payments payment
    LEFT JOIN loan_applications la1
      ON payment.application_id <> '' AND la1.application_id = payment.application_id
    LEFT JOIN loan_applications la2
      ON payment.lead_id <> '' AND (la2.id = payment.lead_id OR CAST(la2.id AS CHAR) = payment.lead_id)
    LEFT JOIN loans loan1
      ON loan1.id = payment.loan_id
    LEFT JOIN loans loan2
      ON TRIM(LEADING 'LN' FROM UPPER(loan2.id)) = TRIM(LEADING 'LN' FROM UPPER(payment.loan_id))
    LEFT JOIN loan_repayment_schedule schedule
      ON schedule.id = COALESCE(
        (SELECT s2.id FROM loan_repayment_schedule s2 WHERE payment.loan_id IS NOT NULL AND s2.loan_id = payment.loan_id ORDER BY s2.installment_number ASC, s2.due_date ASC, s2.id ASC LIMIT 1),
        (SELECT s2.id FROM loan_repayment_schedule s2 WHERE COALESCE(loan1.id, loan2.id) IS NOT NULL AND s2.loan_id = COALESCE(loan1.id, loan2.id) ORDER BY s2.installment_number ASC, s2.due_date ASC, s2.id ASC LIMIT 1),
        (SELECT s2.id FROM loan_repayment_schedule s2 WHERE payment.application_id <> '' AND s2.application_id = payment.application_id ORDER BY s2.installment_number ASC, s2.due_date ASC, s2.id ASC LIMIT 1),
        (SELECT s2.id FROM loan_repayment_schedule s2 WHERE payment.lead_id <> '' AND s2.lead_id = payment.lead_id ORDER BY s2.installment_number ASC, s2.due_date ASC, s2.id ASC LIMIT 1)
      )
    LEFT JOIN lead_sanctions sanction
      ON sanction.id = COALESCE(
        (SELECT s2.id FROM lead_sanctions s2 WHERE payment.application_id <> '' AND s2.application_id = payment.application_id ORDER BY s2.created_at DESC, s2.id DESC LIMIT 1),
        (SELECT s2.id FROM lead_sanctions s2 WHERE payment.lead_id <> '' AND s2.lead_id = payment.lead_id ORDER BY s2.created_at DESC, s2.id DESC LIMIT 1)
      )
    ORDER BY payment.disbursed_at DESC, payment.id DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `);

  const [dueSoonStats] = await query(`
    SELECT COUNT(*) AS count
    FROM loans
    WHERE balance > 0
      AND due_date >= CURRENT_DATE
      AND due_date <= DATE_ADD(CURRENT_DATE, INTERVAL 7 DAY)
  `);

  const [overdueStats] = await query(`
    SELECT COUNT(*) AS count
    FROM loans
    WHERE balance > 0
      AND (LOWER(status) = 'overdue' OR due_date < CURRENT_DATE)
  `);

  const [disbursedStats] = await query(`
    SELECT COALESCE(SUM(amount), 0) AS totalDisbursed
    FROM lead_accounting_payments
    WHERE LOWER(status) = 'paid'
  `);

  return {
    filters: { page: safePage, pageSize },
    items: rows.map(mapRecentAccountingPayment),
    pagination: {
      page: safePage,
      pageSize,
      totalItems,
      totalPages,
    },
    stats: {
      dueSoonCount: Number(dueSoonStats?.count || 0),
      overdueCount: Number(overdueStats?.count || 0),
      totalDisbursed: Number(disbursedStats?.totalDisbursed || 0),
    },
  };
}

async function getWorkspace(lead) {
  await ensureDefaultDocumentChecks(lead);
  const { applicationId, leadId } = leadKeys(lead);
  const params = [leadId, applicationId];

  const [callLogs, followups, documentChecks, handoffs] = await Promise.all([
    query(`
      SELECT *
      FROM lead_call_logs
      WHERE lead_id = ? OR application_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 20
    `, params),
    query(`
      SELECT *
      FROM lead_followups
      WHERE lead_id = ? OR application_id = ?
      ORDER BY
        CASE status WHEN 'open' THEN 0 WHEN 'scheduled' THEN 1 ELSE 2 END,
        due_at ASC,
        id DESC
      LIMIT 20
    `, params),
    query(`
      SELECT *
      FROM lead_document_checks
      WHERE lead_id = ? OR application_id = ?
      ORDER BY id ASC
    `, params),
    query(`
      SELECT *
      FROM lead_credit_handoffs
      WHERE lead_id = ? OR application_id = ?
      ORDER BY submitted_at DESC, id DESC
      LIMIT 5
    `, params),
  ]);

  return {
    callLogs: callLogs.map(mapCallLog),
    documentChecks: documentChecks.map(mapDocumentCheck),
    followups: followups.map(mapFollowup),
    latestHandoff: mapHandoff(handoffs[0]),
    handoffs: handoffs.map(mapHandoff),
  };
}

async function createCallLog(lead, payload = {}) {
  const { applicationId, leadId } = leadKeys(lead);
  await query(`
    UPDATE lead_followups
    SET status = 'completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE (lead_id = ? OR application_id = ?)
      AND status IN ('open', 'scheduled')
  `, [leadId, applicationId]);

  const result = await query(`
    INSERT INTO lead_call_logs (
      lead_id, application_id, disposition, sub_disposition, notes,
      call_duration_seconds, next_followup_at, actor
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    leadId,
    applicationId,
    payload.disposition,
    payload.subDisposition || '',
    payload.notes || '',
    Number(payload.callDurationSeconds || 0),
    payload.nextFollowupAt || null,
    payload.user || payload.actor || 'CRM User',
  ]);

  if (payload.nextFollowupAt) {
    await query(`
      INSERT INTO lead_followups (
        lead_id, application_id, due_at, reason, status, notes, actor
      ) VALUES (?, ?, ?, ?, 'open', ?, ?)
    `, [
      leadId,
      applicationId,
      payload.nextFollowupAt,
      payload.followupReason || payload.disposition,
      payload.notes || '',
      payload.user || payload.actor || 'CRM User',
    ]);
  }

  // Automatic Lead Status Transition on Call Log Disposition:
  const disp = String(payload.disposition || '').trim();
  if (['Not interested', 'Duplicate', 'Wrong number', 'Language issue'].includes(disp)) {
    await query(`
      UPDATE loan_applications
      SET status = 'rejected', updated_at = CURRENT_TIMESTAMP
      WHERE (id = ? OR application_id = ?) AND status NOT IN ('disbursed', 'closed')
    `, [leadId, applicationId]);
  } else if (['Connected', 'Callback requested', 'Interested'].includes(disp)) {
    await query(`
      UPDATE loan_applications
      SET status = CASE WHEN status = 'draft' THEN 'submitted' ELSE status END, updated_at = CURRENT_TIMESTAMP
      WHERE (id = ? OR application_id = ?) AND status NOT IN ('disbursed', 'closed', 'rejected')
    `, [leadId, applicationId]);
  }

  const rows = await query('SELECT * FROM lead_call_logs WHERE id = ? LIMIT 1', [result.insertId]);
  return mapCallLog(rows[0]);
}

async function updateDocumentCheck(lead, payload = {}) {
  const { applicationId, leadId } = leadKeys(lead);
  const status = payload.status || 'pending';
  if (!['pending', 'uploaded', 'verified', 'rejected'].includes(status)) {
    const error = new Error('Invalid document check status.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  const isVerified = status === 'verified';

  await query(`
    INSERT INTO lead_document_checks (
      lead_id, application_id, document_key, label, status, remark, verified_by, verified_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      label = VALUES(label),
      status = VALUES(status),
      remark = VALUES(remark),
      verified_by = VALUES(verified_by),
      verified_at = VALUES(verified_at)
  `, [
    leadId,
    applicationId,
    payload.key,
    payload.label || payload.key,
    status,
    payload.remark || '',
    isVerified ? (payload.user || payload.actor || 'CRM User') : null,
    isVerified ? new Date() : null,
  ]);

  // Automatic Status Transition to Document Collection / Review when doc verified or uploaded:
  if (['uploaded', 'verified'].includes(status)) {
    await query(`
      UPDATE loan_applications
      SET status = CASE WHEN status IN ('draft', 'submitted') THEN 'review' ELSE status END, updated_at = CURRENT_TIMESTAMP
      WHERE (id = ? OR application_id = ?) AND status NOT IN ('disbursed', 'closed', 'rejected')
    `, [leadId, applicationId]);
  }

  const rows = await query(`
    SELECT *
    FROM lead_document_checks
    WHERE application_id = ? AND document_key = ?
    LIMIT 1
  `, [applicationId, payload.key]);

  invalidateCreditCache();
  return mapDocumentCheck(rows[0]);
}

async function createCreditHandoff(lead, payload = {}) {
  const { applicationId, leadId } = leadKeys(lead);
  const existing = await findLatestCreditHandoff(lead);
  if (existing && ['ready', 'approved'].includes(existing.status)) {
    const error = new Error(existing.status === 'ready'
      ? 'This lead is already waiting in the credit manager queue.'
      : 'This lead has already been approved by credit manager.');
    error.statusCode = 409;
    error.publicMessage = error.message;
    throw error;
  }

  const checklistSnapshot = payload.checklistSnapshot === undefined
    ? null
    : JSON.stringify(payload.checklistSnapshot);

  const result = await query(`
    INSERT INTO lead_credit_handoffs (
      lead_id, application_id, status, checklist_snapshot, notes, submitted_by
    ) VALUES (?, ?, 'ready', ?, ?, ?)
  `, [
    leadId,
    applicationId,
    checklistSnapshot,
    payload.notes || '',
    payload.user || payload.actor || 'CRM User',
  ]);

  // Automatic Status Transition to Send to Credit Manager (preserve telecaller assignment):
  await query(`
    UPDATE loan_applications
    SET status = 'send_to_credit', updated_at = CURRENT_TIMESTAMP
    WHERE (id = ? OR application_id = ?) AND status NOT IN ('disbursed', 'closed')
  `, [leadId, applicationId]);

  const rows = await query('SELECT * FROM lead_credit_handoffs WHERE id = ? LIMIT 1', [result.insertId]);
  invalidateCreditCache();
  return mapHandoff(rows[0]);
}

async function findLatestCreditHandoff(lead) {
  const { applicationId, leadId } = leadKeys(lead);
  const rows = await query(`
    SELECT *
    FROM lead_credit_handoffs
    WHERE lead_id = ? OR application_id = ?
    ORDER BY submitted_at DESC, id DESC
    LIMIT 1
  `, [leadId, applicationId]);

  return mapHandoff(rows[0]);
}

async function reviewLatestCreditHandoff(lead, payload = {}) {
  const { applicationId, leadId } = leadKeys(lead);
  const decision = payload.decision || 'approved';
  const status = decision === 'approved' ? 'approved' : 'rejected';

  const existingRows = await query(`
    SELECT id, status
    FROM lead_credit_handoffs
    WHERE lead_id = ? OR application_id = ?
    ORDER BY submitted_at DESC, id DESC
    LIMIT 1
  `, [leadId, applicationId]);

  if (!existingRows.length || existingRows[0].status !== 'ready') {
    const error = new Error('Lead is not in credit manager queue. Telecaller handoff is required before credit decision.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  await query(`
    UPDATE lead_credit_handoffs
    SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, decision = ?, decision_notes = ?
    WHERE id = ?
  `, [
    status,
    payload.user || payload.actor || 'Credit Manager',
    decision,
    payload.notes || '',
    existingRows[0].id,
  ]);

  const rows = await query(`
    SELECT *
    FROM lead_credit_handoffs
    WHERE lead_id = ? OR application_id = ?
    ORDER BY reviewed_at DESC, submitted_at DESC, id DESC
    LIMIT 1
  `, [leadId, applicationId]);

  invalidateCreditCache();
  return mapHandoff(rows[0]);
}

async function createAccountingPayment(lead, payload = {}) {
  const { applicationId, leadId } = leadKeys(lead);
  const transferType = String(payload.transferType || payload.method || '').trim().toUpperCase();
  const transactionId = String(payload.transactionId || payload.reference || '').trim();
  const loanId = makeLoanId(lead, payload.loanId || payload.agreementNumber);
  const paymentProofUrl = String(payload.paymentProofUrl || payload.proofUrl || '').trim();
  const notes = String(payload.notes || '').trim() || (paymentProofUrl ? `Payment proof: ${paymentProofUrl}` : '');

  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  const disbursedTimestamp = payload.disbursementDate
    ? `${sqlDate(payload.disbursementDate)} ${timeStr}`
    : `${todaySqlDate()} ${timeStr}`;

  const result = await query(`
    INSERT INTO lead_accounting_payments (
      lead_id, application_id, loan_id, amount, method, reference, transfer_type,
      transaction_id, notes, status, paid_by, disbursed_at, paid_at, account_number, bank_name, ifsc_code
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?, ?, ?, ?, ?)
  `, [
    leadId,
    applicationId,
    loanId,
    Number(payload.amount || lead.loanAmount || 0),
    transferType || 'Bank Transfer',
    transactionId,
    transferType,
    transactionId,
    notes,
    payload.user || payload.actor || 'Accountant',
    disbursedTimestamp,
    disbursedTimestamp,
    payload.accountNumber || lead.accountNumber || null,
    payload.bankName || lead.bankName || null,
    payload.ifscCode || lead.ifscCode || null,
  ]);

  const rows = await query('SELECT * FROM lead_accounting_payments WHERE id = ? LIMIT 1', [result.insertId]);
  const row = rows[0] || {};

  return {
    id: row.id,
    leadId: row.lead_id || '',
    applicationId: row.application_id || '',
    loanId: row.loan_id || '',
    amount: Number(row.amount || 0),
    method: row.method || '',
    reference: row.reference || '',
    transferType: row.transfer_type || row.method || '',
    transactionId: row.transaction_id || row.reference || '',
    notes: row.notes || '',
    status: row.status || 'paid',
    paidBy: row.paid_by || 'Accountant',
    disbursedAt: row.disbursed_at,
    paidAt: row.paid_at,
    accountNumber: row.account_number || '',
    bankName: row.bank_name || '',
    ifscCode: row.ifsc_code || '',
  };
}

async function hasAccountingPayment(lead) {
  const { applicationId, leadId } = leadKeys(lead);
  const rows = await query(`
    SELECT id
    FROM lead_accounting_payments
    WHERE lead_id = ? OR application_id = ?
    LIMIT 1
  `, [leadId, applicationId]);

  return Boolean(rows.length);
}

async function findPaymentByTransactionId(transactionId) {
  const rows = await query(`
    SELECT id, lead_id AS leadId, application_id AS applicationId, transaction_id AS transactionId
    FROM lead_accounting_payments
    WHERE transaction_id = ? OR reference = ?
    LIMIT 1
  `, [transactionId, transactionId]);

  return rows[0] || null;
}

async function activateLoanForDisbursement(lead, sanction, payload = {}) {
  const loanId = makeLoanId(lead, payload.loanId || sanction?.agreementNumber);
  
  // Lookup existing customer by phone, email, PAN, or Aadhaar for full security
  let customerId = '';
  const lookupClauses = [];
  const lookupParams = [];
  if (lead.phone) { lookupClauses.push('la.mobile = ?'); lookupParams.push(lead.phone); }
  if (lead.mobile) { lookupClauses.push('la.mobile = ?'); lookupParams.push(lead.mobile); }
  if (lead.email) { lookupClauses.push('la.email = ?'); lookupParams.push(lead.email); }
  if (lead.panNumber) { lookupClauses.push('la.pan_number = ?'); lookupParams.push(lead.panNumber); }
  if (lead.aadhaarNumber) { lookupClauses.push('la.aadhaar_number = ?'); lookupParams.push(lead.aadhaarNumber); }
  if (lead.aadhaarUniqueId) { lookupClauses.push('la.aadhaar_unique_id = ?'); lookupParams.push(lead.aadhaarUniqueId); }

  if (lookupClauses.length > 0) {
    const [matchedLead] = await query(`
      SELECT DISTINCT l.customer_id
      FROM loans l
      JOIN loan_repayment_schedule sched ON l.id = sched.loan_id
      JOIN loan_applications la ON (la.application_id = sched.application_id OR la.id = sched.lead_id)
      WHERE ${lookupClauses.join(' OR ')}
      LIMIT 1
    `, lookupParams);
    
    if (matchedLead && matchedLead.customer_id) {
      customerId = matchedLead.customer_id;
    }
  }

  // Fallback to match customers table by phone or email if not found via previous leads
  if (!customerId) {
    const [existingCust] = await query('SELECT id FROM customers WHERE phone = ? OR email = ? LIMIT 1', [lead.phone || lead.mobile || '', lead.email || '']);
    if (existingCust) {
      customerId = existingCust.id;
    } else {
      customerId = `CUS${String(lead.rawId || lead.id || '').replace(/[^a-z0-9]/gi, '').toUpperCase()}`.slice(0, 32);
    }
  }
  const startDate = payload.disbursementDate ? sqlDate(payload.disbursementDate) : todaySqlDate();
  let dueDate;
  let tenure;
  if (payload.dueDate) {
    dueDate = sqlDate(payload.dueDate);
    const [sY, sM, sD] = startDate.split('-').map(Number);
    const [dY, dM, dD] = dueDate.split('-').map(Number);
    const sDate = new Date(sY, sM - 1, sD);
    const dDate = new Date(dY, dM - 1, dD);
    tenure = Math.max(1, Math.round((dDate - sDate) / (1000 * 60 * 60 * 24)));
  } else {
    tenure = Number(payload.tenureDays || sanction?.tenureDays || 30);
    const [sYear, sMonth, sDay] = startDate.split('-').map(Number);
    const startJsDate = new Date(sYear, sMonth - 1, sDay);
    startJsDate.setDate(startJsDate.getDate() + tenure);
    dueDate = sqlDateFromDate(startJsDate);
  }
  const principal = Number(sanction?.principalAmount || lead.loanAmount || 0);
  const totalAmount = Number(sanction?.repaymentAmount || principal || 0);
  const nextPaymentAmount = totalAmount;

  await query(`
    INSERT INTO customers (
      id, name, email, phone, address, credit_score, total_loans, active_loans,
      total_borrowed, total_repaid, join_date, last_loan_date, risk_level,
      lifetime_value, monthly_income
    ) VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, 0, ?, ?, 'Medium', 0, ?)
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      email = VALUES(email),
      phone = VALUES(phone),
      active_loans = GREATEST(active_loans, 1),
      total_loans = GREATEST(total_loans, 1),
      total_borrowed = GREATEST(total_borrowed, VALUES(total_borrowed)),
      last_loan_date = VALUES(last_loan_date),
      monthly_income = VALUES(monthly_income)
  `, [
    customerId,
    lead.name || sanction?.borrower || 'Customer',
    lead.email || sanction?.borrowerEmail || '',
    lead.phone || sanction?.borrowerPhone || '',
    lead.address || '',
    Number(lead.creditScore || 0),
    principal,
    startDate,
    startDate,
    Number(lead.monthlyIncome || 0),
  ]);

  await query(`
    INSERT INTO loans (
      id, customer_id, principal, interest_rate, total_amount, amount_paid,
      balance, start_date, due_date, status, payment_status, next_payment_date,
      next_payment_amount
    ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, 'Active', 'Pending', ?, ?)
    ON DUPLICATE KEY UPDATE
      customer_id = VALUES(customer_id),
      principal = VALUES(principal),
      interest_rate = VALUES(interest_rate),
      total_amount = VALUES(total_amount),
      balance = VALUES(balance),
      start_date = VALUES(start_date),
      due_date = VALUES(due_date),
      status = 'Active',
      payment_status = 'Pending',
      next_payment_date = VALUES(next_payment_date),
      next_payment_amount = VALUES(next_payment_amount)
  `, [
    loanId,
    customerId,
    principal,
    Number(sanction?.interestRate || 0),
    totalAmount,
    totalAmount,
    startDate,
    dueDate,
    dueDate,
    nextPaymentAmount,
  ]);

  await query(`
    INSERT INTO loan_repayment_schedule (
      loan_id, customer_id, lead_id, application_id, installment_number,
      due_date, principal_due, interest_due, fees_due, penalty_due,
      total_due, amount_paid, status
    ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, 0, ?, 0, 'pending')
    ON DUPLICATE KEY UPDATE
      customer_id = VALUES(customer_id),
      lead_id = VALUES(lead_id),
      application_id = VALUES(application_id),
      due_date = VALUES(due_date),
      principal_due = VALUES(principal_due),
      interest_due = VALUES(interest_due),
      fees_due = VALUES(fees_due),
      total_due = VALUES(total_due),
      status = CASE
        WHEN status IN ('paid', 'waived') THEN status
        ELSE VALUES(status)
      END
  `, [
    loanId,
    customerId,
    lead.rawId || '',
    lead.id || '',
    dueDate,
    principal,
    Math.max(0, totalAmount - principal - Number(sanction?.processingFee || 0) - Number(sanction?.gstAmount || 0)),
    Number(sanction?.processingFee || 0) + Number(sanction?.gstAmount || 0),
    totalAmount,
  ]);

  if (sanction?.id) {
    await query('UPDATE lead_sanctions SET due_date = ?, tenure_days = ? WHERE id = ?', [dueDate, tenure, sanction.id]).catch(() => {});
  }

  const rows = await query('SELECT * FROM loans WHERE id = ? LIMIT 1', [loanId]);
  const activeLoan = rows[0] || null;

  await upsertCollectionCaseForLoan({
    loan: activeLoan || {
      id: loanId,
      customer_id: customerId,
      total_amount: totalAmount,
      due_date: dueDate,
    },
    lead,
    sanction,
  });

  return activeLoan;
}

async function upsertCollectionCaseForLoan({ loan, lead, sanction }) {
  if (!loan?.id) return null;

  const loanId = String(loan.id);
  const collectionCaseId = `COL${loanId.replace(/[^a-z0-9]/gi, '').toUpperCase()}`.slice(0, 32);
  const customerId = String(loan.customer_id || loan.customerId || '').slice(0, 32);
  const totalDue = Number(loan.total_amount || loan.totalAmount || sanction?.repaymentAmount || 0);
  const dueDate = sqlDate(loan.due_date || loan.dueDate || sanction?.dueDate);

  await query(`
    INSERT INTO collection_cases (
      id, loan_id, customer_id, customer, phone, total_due, days_overdue,
      original_due_date, last_contact_date, last_payment_date, status, assigned_to
    ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, NULL, NULL, 'Active', ?)
    ON DUPLICATE KEY UPDATE
      loan_id = VALUES(loan_id),
      customer_id = VALUES(customer_id),
      customer = VALUES(customer),
      phone = VALUES(phone),
      total_due = VALUES(total_due),
      original_due_date = VALUES(original_due_date),
      status = CASE
        WHEN status IN ('Closed', 'Paid Off') THEN status
        ELSE 'Active'
      END,
      assigned_to = VALUES(assigned_to)
  `, [
    collectionCaseId,
    loanId,
    customerId,
    lead.name || sanction?.borrower || 'Customer',
    lead.phone || sanction?.borrowerPhone || '',
    totalDue,
    dueDate,
    'Collections',
  ]);

  const rows = await query('SELECT * FROM collection_cases WHERE id = ? LIMIT 1', [collectionCaseId]);
  return rows[0] || null;
}

module.exports = {
  createCallLog,
  createAccountingPayment,
  createCreditHandoff,
  activateLoanForDisbursement,
  findPaymentByTransactionId,
  findLatestCreditHandoff,
  getWorkspace,
  hasAccountingPayment,
  listAccountingQueue,
  listAccountingQueueV2,
  listRecentAccountingPayments,
  listRecentAccountingPaymentsV2,
  listCreditQueue,
  listCreditApplications,
  listCreditApplicationsV2,
  listCreditQueueV2,
  listTelecallerWorkbench,
  listTelecallerWorkbenchV2,
  getTelecallerPolicy,
  getTelecallerSlaReport,
  isLeadAssignedToTelecaller,
  reviewLatestCreditHandoff,
  updateDocumentCheck,
  invalidateCreditCache,
};
