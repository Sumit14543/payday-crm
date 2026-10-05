const { query } = require('../config/db');
const repaymentModel = require('./repaymentModel');
const sanctionModel = require('./sanctionModel');
const sourceTrackingSnapshotService = require('../services/sourceTrackingSnapshotService');
const sourceStatusWebhookService = require('../services/sourceStatusWebhookService');
const statusLifecycleService = require('../services/statusLifecycleService');

const STATUS_DEFINITIONS = {
  New: {
    stageKey: 'application_received',
    publicStatus: 'Application received',
    title: 'Application received',
    description: 'We have received your loan application.',
  },
  Contacted: {
    stageKey: 'telecaller_contacted',
    publicStatus: 'Contact in progress',
    title: 'Contact in progress',
    description: 'Our team has started contacting you for verification.',
  },
  'Document Collection': {
    stageKey: 'documents_review',
    publicStatus: 'Documents under review',
    title: 'Documents under review',
    description: 'Your documents and eligibility are being reviewed.',
  },
  Qualified: {
    stageKey: 'approved',
    publicStatus: 'Loan approved',
    title: 'Loan approved',
    description: 'Your loan has been approved and is moving to agreement/disbursement.',
  },
  Lost: {
    stageKey: 'rejected',
    publicStatus: 'Application closed',
    title: 'Application closed',
    description: 'Your application could not be approved at this stage.',
  },
  Converted: {
    stageKey: 'disbursed',
    publicStatus: 'Loan disbursed',
    title: 'Loan disbursed',
    description: 'Your loan amount has been disbursed.',
  },
  Closed: {
    stageKey: 'closed',
    publicStatus: 'Loan closed',
    title: 'Loan closed',
    description: 'Your loan is closed.',
  },
  'Documents Pending': {
    stageKey: 'documents_pending',
    publicStatus: 'Documents pending',
    title: 'Documents pending',
    description: 'Some documents are pending. Please submit the required documents.',
  },
  'Not Connected': {
    stageKey: 'not_connected',
    publicStatus: 'Not connected',
    title: 'Not connected',
    description: 'We were unable to reach you. Please expect a callback.',
  },
};

const DB_STATUS_TO_PUBLIC = {
  approved: 'Qualified',
  closed: 'Closed',
  disbursed: 'Converted',
  documents_pending: 'Documents Pending',
  draft: 'New',
  not_connected: 'Not Connected',
  rejected: 'Lost',
  review: 'Document Collection',
  submitted: 'New',
};

function normalizeStatus(status) {
  const value = String(status || '').trim();
  return STATUS_DEFINITIONS[value] ? value : DB_STATUS_TO_PUBLIC[value] || 'New';
}

function definitionFor(status) {
  const normalizedStatus = normalizeStatus(status);
  return {
    status: normalizedStatus,
    ...STATUS_DEFINITIONS[normalizedStatus],
  };
}

function parseMetadata(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function mapEvent(row) {
  return {
    id: row.id,
    leadId: row.lead_id || '',
    applicationId: row.application_id || '',
    status: row.status || 'New',
    stageKey: row.stage_key || '',
    publicStatus: row.public_status || '',
    title: row.title || '',
    description: row.description || '',
    actor: row.actor || 'System',
    actorRole: row.actor_role || '',
    source: row.source || 'system',
    sourceKey: row.source_key || '',
    metadata: parseMetadata(row.metadata),
    isCustomerVisible: Boolean(row.is_customer_visible),
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
  };
}

function mapPublicEvent(event) {
  return statusLifecycleService.enrichPublicEvent({
    id: event.id,
    status: event.status,
    stageKey: event.stageKey,
    publicStatus: event.publicStatus,
    title: event.title,
    description: event.description,
    occurredAt: event.occurredAt,
  });
}

async function createForLead(lead, event = {}) {
  if (!lead?.id) return null;

  const def = definitionFor(event.status || lead.status);
  const metadata = event.metadata === undefined ? null : JSON.stringify(event.metadata);
  const sourceKey = event.sourceKey || null;

  const result = await query(`
    INSERT INTO lead_status_events (
      lead_id, application_id, status, stage_key, public_status, title,
      description, actor, actor_role, source, source_key, metadata,
      is_customer_visible, occurred_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      metadata = VALUES(metadata),
      title = VALUES(title),
      description = VALUES(description),
      occurred_at = LEAST(occurred_at, VALUES(occurred_at))
  `, [
    lead.rawId || '',
    lead.id,
    def.status,
    event.stageKey || def.stageKey,
    event.publicStatus || def.publicStatus,
    event.title || def.title,
    event.description || def.description,
    event.actor || event.user || 'System',
    event.actorRole || '',
    event.source || 'system',
    sourceKey,
    metadata,
    event.isCustomerVisible === false ? 0 : 1,
    event.occurredAt || new Date(),
  ]);

  const rows = sourceKey
    ? await query('SELECT * FROM lead_status_events WHERE source_key = ? LIMIT 1', [sourceKey])
    : result.insertId
      ? await query('SELECT * FROM lead_status_events WHERE id = ? LIMIT 1', [result.insertId])
      : [];
  const mappedEvent = rows[0] ? mapEvent(rows[0]) : null;
  if (mappedEvent && result.affectedRows === 1) {
    await sourceStatusWebhookService.dispatchLeadStatusEvent(lead, {
      ...mapPublicEvent(mappedEvent),
      isCustomerVisible: mappedEvent.isCustomerVisible,
      sourceKey: mappedEvent.sourceKey,
    });
  }

  return mappedEvent;
}

async function recordStatusChange(lead, previousLead, event = {}) {
  if (!lead) return null;
  if (!event.force && previousLead?.status === lead.status) return null;

  return createForLead(lead, {
    ...event,
    status: event.status || lead.status,
    metadata: {
      ...(event.metadata || {}),
      from: previousLead?.status || null,
      to: lead.status,
    },
  });
}

async function findByLead(lead, options = {}) {
  const params = [lead.rawId || '', lead.id || ''];
  const clauses = ['(lead_id = ? OR application_id = ?)'];
  if (options.customerVisibleOnly) clauses.push('is_customer_visible = 1');

  const rows = await query(`
    SELECT *
    FROM lead_status_events
    WHERE ${clauses.join(' AND ')}
    ORDER BY occurred_at ASC, id ASC
  `, params);

  return rows.map(mapEvent);
}

function last10(value) {
  return String(value || '').replace(/\D/g, '').slice(-10);
}

async function findPublicTracking(applicationId, phone) {
  const rows = await query(`
    SELECT
      id,
      application_id AS applicationId,
      full_name AS name,
      mobile AS phone,
      loan_amount AS loanAmount,
      source_system AS sourceSystem,
      source_lead_id AS sourceLeadId,
      source_application_id AS sourceApplicationId,
      status,
      updated_at AS updatedAt
    FROM loan_applications
    WHERE application_id = ?
    LIMIT 1
  `, [applicationId]);
  const row = rows[0];
  if (!row) return null;
  if (!last10(phone) || last10(row.phone) !== last10(phone)) return null;

  const lead = {
    id: row.applicationId,
    rawId: String(row.id),
    name: row.name || '',
    phone: row.phone || '',
    loanAmount: row.loanAmount,
    sourceApplicationId: row.sourceApplicationId || '',
    sourceLeadId: row.sourceLeadId || '',
    sourceSystem: row.sourceSystem || '',
    status: normalizeStatus(row.status),
    updatedAt: row.updatedAt,
  };
  const timeline = await findByLead(lead, { customerVisibleOnly: true });
  const publicTimeline = timeline.map(mapPublicEvent);
  const current = definitionFor(lead.status);
  const lifecycle = statusLifecycleService.summarizeTimeline(publicTimeline, current);
  const repayment = await repaymentModel.repaymentSummaryByLead(lead);
  const sanction = await sanctionModel.findLatestByLead(lead);
  const disbursement = await repaymentModel.disbursementSummaryByLead(lead);

  const interestAccrued = sanction
    ? Math.max(0, Number(sanction.repaymentAmount || 0)
      - Number(sanction.principalAmount || 0)
      - Number(sanction.processingFee || 0)
      - Number(sanction.gstAmount || 0))
    : Number(repayment?.interestAccrued || 0);

  const finalLoanAmount = repayment?.principal 
    ? repayment.principal 
    : (sanction?.principalAmount ? Number(sanction.principalAmount) : Number(lead.loanAmount || 0));

  const finalInterestRate = repayment?.interestRate
    ? repayment.interestRate
    : (sanction ? Number(sanction.interestRate || 0) : 0);

  const finalTenureDays = sanction
    ? Number(sanction.tenureDays || 0)
    : (repayment?.startDate && repayment?.loanDueDate
        ? Math.round((new Date(repayment.loanDueDate) - new Date(repayment.startDate)) / (1000 * 60 * 60 * 24))
        : 0);

  const finalInterestAccrued = sanction
    ? interestAccrued
    : Number(repayment?.interestAccrued || (repayment ? Math.max(0, repayment.dueAmount - repayment.principal) : 0));

  return {
    applicationId: lead.id,
    customerName: lead.name,
    loanAmount: finalLoanAmount,
    currentStatus: lead.status,
    statusCode: lifecycle.statusCode,
    publicStatus: publicTimeline[publicTimeline.length - 1]?.publicStatus || current.publicStatus,
    progressPercent: lifecycle.progressPercent,
    nextExpectedAction: lifecycle.nextExpectedAction,
    isTerminalStatus: lifecycle.isTerminalStatus,
    lastUpdatedAt: publicTimeline[publicTimeline.length - 1]?.occurredAt || lead.updatedAt,
    disbursement,
    repayment,
    sanction: sanction ? {
      agreementNumber: sanction.agreementNumber,
      disbursedAmount: sanction.disbursedAmount,
      dueDate: sanction.dueDate,
      emailStatus: sanction.emailStatus,
      pdfAvailable: Boolean(sanction.pdfPath),
      pdfUrl: sourceTrackingSnapshotService.sanctionPdfUrl(lead, sanction),
      principalAmount: sanction.principalAmount,
      repaymentAmount: sanction.repaymentAmount,
      sentAt: sanction.sentAt,
      whatsappStatus: sanction.whatsappStatus,
    } : null,
    tenure_days: finalTenureDays,
    interest_rate: finalInterestRate,
    interest_accrued: finalInterestAccrued,
    timeline: publicTimeline,
  };
}

async function findSourceTracking({ sourceSystem, sourceLeadId, sourceApplicationId, mobile, pan }) {
  const clauses = [];
  const params = [];
  const normalizedMobile = last10(mobile);
  const normalizedPan = String(pan || '').trim().toUpperCase();

  if (sourceSystem && sourceLeadId) {
    clauses.push('(source_system = ? OR source_system = "" OR source_system IS NULL)');
    params.push(sourceSystem);
    clauses.push('source_lead_id = ?');
    params.push(sourceLeadId);
  } else if (sourceApplicationId) {
    clauses.push('(source_application_id = ? OR application_id = ? OR CAST(id AS CHAR) = ?)');
    params.push(sourceApplicationId, sourceApplicationId, sourceApplicationId);
  } else if (normalizedPan) {
    clauses.push('pan_number = ?');
    params.push(normalizedPan);
  } else if (normalizedMobile) {
    clauses.push("RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(mobile, ' ', ''), '-', ''), '+', ''), '(', ''), ')', ''), 10) = ?");
    params.push(normalizedMobile);
  } else {
    return null;
  }

  const rows = await query(`
    SELECT
      id,
      application_id AS applicationId,
      full_name AS name,
      mobile AS phone,
      email,
      COALESCE(pan_number, '') AS panNumber,
      loan_amount AS loanAmount,
      loan_type AS loanType,
      COALESCE((
        SELECT cr.score
        FROM cibil_reports cr
        WHERE
          cr.score IS NOT NULL
          AND (
            cr.lead_id = CAST(loan_applications.id AS CHAR)
            OR cr.application_id = loan_applications.application_id
            OR (
              loan_applications.pan_number <> ''
              AND cr.pan = loan_applications.pan_number
              AND loan_applications.mobile <> ''
              AND cr.mobile = loan_applications.mobile
            )
          )
        ORDER BY cr.created_at DESC, cr.id DESC
        LIMIT 1
      ), 0) AS cibilScore,
      status,
      source_system AS sourceSystem,
      source_lead_id AS sourceLeadId,
      source_application_id AS sourceApplicationId,
      source_status AS sourceStatus,
      ingested_at AS ingestedAt,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM loan_applications
    WHERE ${clauses.join(' AND ')}
    ORDER BY updated_at DESC, id DESC
    LIMIT 1
  `, params);
  const row = rows[0];
  if (!row) return null;

  const lead = {
    id: row.applicationId,
    rawId: String(row.id),
    name: row.name || '',
    phone: row.phone || '',
    loanAmount: row.loanAmount,
    sourceApplicationId: row.sourceApplicationId || '',
    sourceLeadId: row.sourceLeadId || '',
    sourceSystem: row.sourceSystem || '',
    status: normalizeStatus(row.status),
    updatedAt: row.updatedAt,
  };
  const timeline = await findByLead(lead, { customerVisibleOnly: true });
  const publicTimeline = timeline.map(mapPublicEvent);
  const current = definitionFor(lead.status);
  const lifecycle = statusLifecycleService.summarizeTimeline(publicTimeline, current);
  const repayment = await repaymentModel.repaymentSummaryByLead(lead);
  const sanction = await sanctionModel.findLatestByLead(lead);
  const disbursement = await repaymentModel.disbursementSummaryByLead(lead);

  const { repaymentBlock, sanctionBlock } = sourceTrackingSnapshotService.calculateLiveStatusBlocks(lead, sanction, disbursement, repayment);

  const finalLoanAmount = repaymentBlock
    ? repaymentBlock.principal
    : (sanctionBlock ? sanctionBlock.principalAmount : Number(lead.loanAmount || 0));

  const finalInterestRate = repaymentBlock
    ? repaymentBlock.interestRate
    : (sanctionBlock ? (Number(sanction.interestRate || 0).toFixed(2) + '%') : '0.00%');

  const finalTenureDays = repaymentBlock
    ? repaymentBlock.tenureDays
    : (sanctionBlock ? sanctionBlock.tenureDays : 0);

  const finalInterestAccrued = repaymentBlock
    ? repaymentBlock.interestAccrued
    : (sanctionBlock ? repaymentBlock?.interestAccrued || 0 : 0);

  return {
    applicationId: lead.id,
    crmLeadId: lead.rawId,
    customerName: lead.name,
    phone: lead.phone,
    email: row.email || '',
    pan_number: row.panNumber || '',
    loanAmount: finalLoanAmount,
    loanType: row.loanType || '',
    cibilScore: Number(row.cibilScore || 0),
    tenure_days: finalTenureDays,
    interest_rate: finalInterestRate,
    interest_accrued: finalInterestAccrued,
    sourceSystem: row.sourceSystem || '',
    sourceLeadId: row.sourceLeadId || '',
    sourceApplicationId: row.sourceApplicationId || '',
    sourceStatus: row.sourceStatus || '',
    crmStatus: lead.status,
    statusCode: lifecycle.statusCode,
    publicStatus: publicTimeline[publicTimeline.length - 1]?.publicStatus || current.publicStatus,
    currentStage: publicTimeline[publicTimeline.length - 1]?.stageKey || current.stageKey,
    statusTitle: publicTimeline[publicTimeline.length - 1]?.title || current.title,
    statusDescription: publicTimeline[publicTimeline.length - 1]?.description || current.description,
    progressPercent: lifecycle.progressPercent,
    nextExpectedAction: lifecycle.nextExpectedAction,
    isTerminalStatus: lifecycle.isTerminalStatus,
    ingestedAt: row.ingestedAt,
    createdAt: row.createdAt,
    lastUpdatedAt: publicTimeline[publicTimeline.length - 1]?.occurredAt || lead.updatedAt,
    disbursement,
    repayment: repaymentBlock,
    sanction: sanctionBlock,
    timeline: publicTimeline,
  };
}

module.exports = {
  createForLead,
  definitionFor,
  findByLead,
  findPublicTracking,
  findSourceTracking,
  normalizeStatus,
  recordStatusChange,
};
