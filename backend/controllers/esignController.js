const activityModel = require('../models/activityModel');
const auditModel = require('../models/auditModel');
const camSheetModel = require('../models/camSheetModel');
const esignModel = require('../models/esignModel');
const leadModel = require('../models/leadModel');
const leadStatusModel = require('../models/leadStatusModel');
const { notFound, requireFields, success } = require('../utils/http');

const CAM_RECOMMENDATIONS = new Set(['Approve', 'Approve with Conditions', 'Reject', 'Request More Information']);
const CAM_STATUSES = new Set(['draft', 'approved', 'rejected']);

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function publicError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.publicMessage = message;
  throw error;
}

function validateCamPayload(lead, payload = {}, options = {}) {
  const status = String(options.status || payload.status || 'draft');
  if (!CAM_STATUSES.has(status)) publicError('Invalid CAM status.');

  const recommendation = String(payload.recommendation || '').trim();
  if (recommendation && !CAM_RECOMMENDATIONS.has(recommendation)) publicError('Invalid CAM recommendation.');

  const approvedAmount = toFiniteNumber(payload.approvedAmount);
  const recommendedAmount = toFiniteNumber(payload.recommendedAmount);
  const totalRepayment = toFiniteNumber(payload.totalRepayment);
  const loanTermDays = toFiniteNumber(payload.loanTermDays, 30);
  const interestRate = toFiniteNumber(payload.interestRate);
  const processingFeeRate = toFiniteNumber(payload.processingFeeRate);

  if (approvedAmount < 0 || recommendedAmount < 0 || totalRepayment < 0) publicError('CAM amounts cannot be negative.');
  if (loanTermDays <= 0) publicError('CAM loan term must be greater than zero.');
  if (interestRate < 0 || processingFeeRate < 0) publicError('CAM rates cannot be negative.');

  if (status === 'approved') {
    if (!approvedAmount) publicError('CAM approved amount must be greater than zero.');
  }
}

async function getLeadOr404(res, leadId) {
  const lead = await leadModel.findById(leadId);
  if (!lead) {
    notFound(res, 'Lead not found');
    return null;
  }

  return lead;
}

function isExpired(request) {
  return request?.expiresAt && new Date(request.expiresAt).getTime() < Date.now();
}

async function getLeadCamSheet(req, res) {
  const lead = await getLeadOr404(res, req.params.id);
  if (!lead) return null;

  const camSheet = await camSheetModel.findLatestByLead(lead);
  return success(res, camSheet);
}

async function saveLeadCamSheet(req, res) {
  const lead = await getLeadOr404(res, req.params.id);
  if (!lead) return null;

  validateCamPayload(lead, req.body || {}, { status: req.body?.status || 'draft' });

  const camSheet = await camSheetModel.createForLead(lead, req.body || {}, {
    status: req.body?.status || 'draft',
    user: req.body?.user || req.user?.name || 'Credit Manager',
  });

  await activityModel.createForLead(lead, {
    type: 'note',
    description: `CAM sheet ${camSheet.status} as version ${camSheet.version}`,
    user: req.body?.user || req.user?.name || 'Credit Manager',
    metadata: {
      camSheetId: camSheet.id,
      version: camSheet.version,
      status: camSheet.status,
      recommendation: camSheet.recommendation,
    },
  });
  await auditModel.create(req, {
    action: 'lead.cam_save',
    entityType: 'lead_cam_sheet',
    entityId: String(camSheet.id),
    lead,
    metadata: {
      version: camSheet.version,
      status: camSheet.status,
      recommendation: camSheet.recommendation,
    },
  });

  return success(res, camSheet, 'CAM sheet saved.', 201);
}

async function getLatestLeadEsign(req, res) {
  const lead = await getLeadOr404(res, req.params.id);
  if (!lead) return null;

  const esign = await esignModel.findLatestByLead(lead);
  return success(res, esign);
}

async function createLeadEsign(req, res) {
  const lead = await getLeadOr404(res, req.params.id);
  if (!lead) return null;

  const esign = await esignModel.createForLead(lead, {
    ...req.body,
    user: req.body?.user || req.user?.name || 'Credit Manager',
  });

  await leadStatusModel.createForLead(lead, {
    source: 'dummy_esign',
    actor: req.body?.user || req.user?.name || 'Credit Manager',
    actorRole: req.user?.role || 'credit-manager',
    sourceKey: `dummy-esign-sent:${esign.id}`,
    stageKey: 'agreement_sent_for_esign',
    publicStatus: 'Agreement sent for eSign',
    title: 'Agreement sent for eSign',
    description: 'Your loan agreement has been sent for electronic signature.',
    metadata: {
      esignRequestId: esign.id,
      status: esign.status,
      expiresAt: esign.expiresAt,
    },
  });

  await activityModel.createForLead(lead, {
    type: 'document',
    description: 'Dummy eSign request generated for customer agreement',
    user: req.body?.user || req.user?.name || 'Credit Manager',
    metadata: {
      esignRequestId: esign.id,
      status: esign.status,
      expiresAt: esign.expiresAt,
    },
  });
  await auditModel.create(req, {
    action: 'lead.esign_generate',
    entityType: 'lead_esign_request',
    entityId: String(esign.id),
    lead,
    metadata: {
      status: esign.status,
      expiresAt: esign.expiresAt,
    },
  });

  return success(res, esign, 'eSign request generated.', 201);
}

async function getPublicEsign(req, res) {
  const request = await esignModel.findByToken(req.params.token);
  if (!request) return notFound(res, 'eSign request not found');

  const lead = await leadModel.findById(request.applicationId || request.leadId);
  const camSheet = lead ? await camSheetModel.findLatestByLead(lead) : null;

  return success(res, {
    request: {
      ...request,
      isExpired: isExpired(request),
      dummyOtp: esignModel.DUMMY_OTP,
    },
    lead,
    camSheet,
  });
}

async function signPublicEsign(req, res) {
  requireFields(req.body || {}, ['otp']);

  const request = await esignModel.findByToken(req.params.token);
  if (!request) return notFound(res, 'eSign request not found');

  if (request.status === 'signed') {
    return success(res, { request }, 'Agreement is already signed.');
  }

  if (isExpired(request)) {
    const error = new Error('This eSign link has expired.');
    error.statusCode = 410;
    error.publicMessage = error.message;
    throw error;
  }

  if (String(req.body.otp).trim() !== esignModel.DUMMY_OTP || req.body.consentAccepted !== true) {
    const error = new Error('Valid OTP and consent are required to complete eSign.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  const signedRequest = await esignModel.markSigned(req.params.token, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  const lead = await leadModel.findById(signedRequest.applicationId || signedRequest.leadId);

  if (lead) {
    await leadStatusModel.createForLead(lead, {
      source: 'dummy_esign',
      actor: signedRequest.signerName || 'Customer',
      actorRole: 'customer',
      sourceKey: `dummy-esign-signed:${signedRequest.id}`,
      stageKey: 'agreement_signed',
      publicStatus: 'Agreement signed',
      title: 'Agreement signed',
      description: 'Your signed agreement has been received and is pending disbursement review.',
      occurredAt: signedRequest.signedAt || new Date(),
      metadata: {
        esignRequestId: signedRequest.id,
        signedAt: signedRequest.signedAt,
      },
    });
    await activityModel.createForLead(lead, {
      type: 'document',
      description: 'Customer completed dummy eSign agreement',
      user: signedRequest.signerName || 'Customer',
      metadata: {
        esignRequestId: signedRequest.id,
        signedAt: signedRequest.signedAt,
      },
    });
    await auditModel.create(req, {
      action: 'lead.esign_signed',
      entityType: 'lead_esign_request',
      entityId: String(signedRequest.id),
      lead,
      metadata: {
        signedAt: signedRequest.signedAt,
      },
    });
  }

  return success(res, { request: signedRequest }, 'Agreement signed successfully.');
}

module.exports = {
  createLeadEsign,
  getLatestLeadEsign,
  getLeadCamSheet,
  getPublicEsign,
  saveLeadCamSheet,
  signPublicEsign,
};
