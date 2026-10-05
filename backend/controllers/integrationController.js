const activityModel = require('../models/activityModel');
const fs = require('fs');
const integrationLogModel = require('../models/integrationLogModel');
const leadConsentModel = require('../models/leadConsentModel');
const leadModel = require('../models/leadModel');
const leadStatusModel = require('../models/leadStatusModel');
const repaymentModel = require('../models/repaymentModel');
const customerModel = require('../models/customerModel');
const { resolveUploadPath } = require('../config/uploads');
const sourceStatusWebhookService = require('../services/sourceStatusWebhookService');
const { notFound, success } = require('../utils/http');

const SUCCESS_REPAYMENT_STATUSES = new Set(['captured', 'paid', 'received', 'settled', 'success', 'successful']);

async function checkActiveApplication(req, res) {
  const payload = req.body || {};
  const rows = await leadModel.checkActiveLoanOrApplication(payload);

  if (!rows || !rows.length) {
    return res.json({ exists: false });
  }

  const hasDisbursed = rows.some((row) => String(row.status || '').toLowerCase() === 'disbursed');
  if (hasDisbursed) {
    return res.json({
      exists: true,
      message: 'Application already exists',
    });
  }

  const isClosedRejectedOrDeleted = (s) =>
    ['closed', 'rejected', 'cancelled', 'deleted', 'trash', 'lost'].includes(s);

  const hasActiveInFunnel = rows.some((row) => {
    const status = String(row.status || '').toLowerCase();
    const sourceStatus = String(row.sourceStatus || '').toLowerCase();
    return !isClosedRejectedOrDeleted(status) && !isClosedRejectedOrDeleted(sourceStatus);
  });

  if (hasActiveInFunnel) {
    return res.json({
      exists: true,
      message: 'Application already exists',
    });
  }

  return res.json({ exists: false });
}

function websiteCreatePayload(body = {}, integration = {}) {
  return {
    ...body,
    sourceSystem: body.sourceSystem || integration.sourceSystem || '',
    status: body.status || 'Pending',
  };
}

async function createWebsiteLead(req, res) {
  const requestPayload = req.body || {};
  const activeApplication = await leadModel.findActiveApplication(requestPayload);
  if (activeApplication) {
    return res.status(409).json({
      exists: true,
      message: 'You already have an active application.',
    });
  }

  const payload = websiteCreatePayload(requestPayload, req.integration);
  const result = payload.sourceSystem && payload.sourceLeadId
    ? await leadModel.upsertFromSource(payload)
    : { created: true, lead: await leadModel.create(payload) };

  const { lead } = result;
  return success(res, {
    action: result.created ? 'created' : 'updated',
    applicationId: lead.id,
    crmLeadId: lead.rawId,
    sourceApplicationId: lead.sourceApplicationId,
    sourceLeadId: lead.sourceLeadId,
    sourceSystem: lead.sourceSystem,
    status: lead.status,
  }, result.created ? 'Lead created successfully.' : 'Lead updated successfully.', result.created ? 201 : 200);
}

async function ingestLead(req, res) {
  const requestPayload = req.body || {};
  let result;

  try {
    result = await leadModel.upsertFromSource(requestPayload);
  } catch (error) {
    await integrationLogModel.create({
      endpoint: req.originalUrl || req.path,
      errorMessage: error.publicMessage || error.message,
      ipAddress: req.ip,
      requestPayload,
      sourceApplicationId: requestPayload.sourceApplicationId || '',
      sourceLeadId: requestPayload.sourceLeadId || '',
      sourceSystem: requestPayload.sourceSystem || req.integration?.sourceSystem || '',
      status: 'failed',
      statusCode: error.statusCode || 500,
      userAgent: req.get('user-agent') || '',
    });
    throw error;
  }

  const { lead } = result;

  if (result.created) {
    await activityModel.createForLead(lead, {
      type: 'status',
      description: `Lead ingested from ${lead.sourceSystem}`,
      user: 'Integration API',
      sourceKey: `source-ingested:${lead.sourceSystem}:${lead.sourceLeadId}`,
      metadata: {
        sourceApplicationId: lead.sourceApplicationId,
        sourceLeadId: lead.sourceLeadId,
        sourceSystem: lead.sourceSystem,
      },
    });
  }

  const consentCount = await leadConsentModel.saveFromPayload(lead, requestPayload, {
    ipAddress: req.ip,
    source: lead.sourceSystem || 'integration',
    userAgent: req.get('user-agent') || '',
  });

  await leadStatusModel.createForLead(lead, {
    source: 'integration',
    actor: 'Integration API',
    sourceKey: `source-status-created:${lead.sourceSystem}:${lead.sourceLeadId}`,
    metadata: {
      action: result.created ? 'created' : 'updated',
      sourceApplicationId: lead.sourceApplicationId,
      sourceLeadId: lead.sourceLeadId,
      sourceSystem: lead.sourceSystem,
    },
  });

  const responsePayload = {
    action: result.created ? 'created' : 'updated',
    applicationId: lead.id,
    crmLeadId: lead.rawId,
    savedConsents: consentCount,
    sourceApplicationId: lead.sourceApplicationId,
    sourceLeadId: lead.sourceLeadId,
    sourceSystem: lead.sourceSystem,
    status: lead.status,
  };
  const statusCode = result.created ? 201 : 200;

  await integrationLogModel.create({
    crmApplicationId: lead.id,
    crmLeadId: lead.rawId,
    endpoint: req.originalUrl || req.path,
    ipAddress: req.ip,
    requestPayload,
    responsePayload,
    sourceApplicationId: lead.sourceApplicationId,
    sourceLeadId: lead.sourceLeadId,
    sourceSystem: lead.sourceSystem,
    status: 'success',
    statusCode,
    userAgent: req.get('user-agent') || '',
  });

  return success(res, responsePayload, result.created ? 'Lead ingested successfully.' : 'Lead ingestion updated existing CRM lead.', statusCode);
}

async function getSourceLeadStatus(req, res) {
  const sourceSystem = String(req.query.sourceSystem || req.integration?.sourceSystem || '').trim().toLowerCase();
  const sourceLeadId = String(req.query.sourceLeadId || '').trim();
  const sourceApplicationId = String(req.query.sourceApplicationId || '').trim();
  const mobile = String(req.query.mobile || req.query.phone || '').trim();
  const pan = String(req.query.pan || req.query.panNumber || '').trim().toUpperCase();

  if (!sourceSystem) {
    const error = new Error('Missing required field(s): sourceSystem');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  if (!sourceLeadId && !sourceApplicationId && !mobile && !pan) {
    const error = new Error('Missing required field(s): sourceLeadId, sourceApplicationId, mobile, or pan');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  const tracking = await leadStatusModel.findSourceTracking({
    sourceApplicationId,
    sourceLeadId,
    sourceSystem,
    mobile,
    pan,
  });
  if (!tracking) return notFound(res, 'Source lead tracking record not found.');

  const targetMobile = mobile || tracking.mobile || sourceLeadId || sourceApplicationId;
  if (targetMobile) {
    customerModel.markCustomerLogin(targetMobile).catch(() => {});
  }

  return success(res, tracking);
}

async function recordCustomerLogin(req, res) {
  const identifier = String(req.body.mobile || req.body.phone || req.body.email || req.body.sourceLeadId || req.body.customerId || '').trim();
  if (!identifier) {
    return res.status(400).json({ success: false, message: 'Missing mobile, phone, email, or customerId.' });
  }
  await customerModel.markCustomerLogin(identifier);
  return success(res, { identifier, loggedInAt: new Date().toISOString() }, 'Customer login recorded successfully.');
}

async function downloadSourceSanctionPdf(req, res) {
  const sourceSystem = String(req.query.sourceSystem || req.integration?.sourceSystem || '').trim().toLowerCase();
  const sourceLeadId = String(req.query.sourceLeadId || '').trim();
  const sourceApplicationId = String(req.query.sourceApplicationId || '').trim();

  if (!sourceSystem) repaymentPublicError('Missing required field(s): sourceSystem');
  if (!sourceLeadId && !sourceApplicationId) repaymentPublicError('Missing required field(s): sourceLeadId or sourceApplicationId');

  const sanction = await sanctionModel.findLatestBySource({
    sourceApplicationId,
    sourceLeadId,
    sourceSystem,
  });
  if (!sanction || !sanction.pdfPath) return notFound(res, 'Sanction PDF not found.');

  const filePath = resolveUploadPath(sanction.pdfPath);
  if (!filePath || !fs.existsSync(filePath)) return notFound(res, 'Sanction PDF file not found.');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${sanction.agreementNumber || 'sanction-letter'}.pdf"`);
  return res.sendFile(filePath);
}

function repaymentPublicError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicMessage = message;
  throw error;
}

function normalizeRepaymentPayload(body = {}, integration = {}) {
  const sourceSystem = String(body.sourceSystem || integration.sourceSystem || '').trim().toLowerCase();
  const sourceLeadId = String(body.sourceLeadId || '').trim();
  const sourceApplicationId = String(body.sourceApplicationId || '').trim();
  const loanId = String(body.loanId || '').trim();
  const panNumber = String(body.panNumber || body.pan || '').trim().toUpperCase();
  const amount = Number(body.amount);
  const method = String(body.method || body.paymentMethod || '').trim() || 'Online';
  const reference = String(body.reference || body.transactionId || body.gatewayPaymentId || '').trim();
  const status = String(body.status || '').trim().toLowerCase();

  if (!sourceSystem) repaymentPublicError('Missing required field(s): sourceSystem');
  if (!loanId && !sourceLeadId && !sourceApplicationId && !panNumber) repaymentPublicError('Provide loanId, sourceLeadId, sourceApplicationId, or panNumber.');
  if (!Number.isFinite(amount) || amount <= 0) repaymentPublicError('Repayment amount must be greater than zero.');
  if (!reference) repaymentPublicError('Repayment reference is required.');
  if (status && !SUCCESS_REPAYMENT_STATUSES.has(status)) {
    repaymentPublicError(`Repayment status must be successful before posting to CRM. Received: ${status}`);
  }

  return {
    amount,
    gateway: String(body.gateway || '').trim(),
    loanId,
    method,
    panNumber,
    paidAt: body.paidAt || body.receivedAt || null,
    rawPayload: body,
    reference,
    sourceApplicationId,
    sourceLeadId,
    sourceSystem,
    status: status || 'success',
  };
}

async function postRepayment(req, res) {
  const requestPayload = req.body || {};
  const payload = normalizeRepaymentPayload(requestPayload, req.integration);
  let responsePayload = null;

  try {
    const context = await repaymentModel.findLoanContext(payload);
    if (!context) {
      repaymentPublicError('Loan repayment account not found for the provided source details.', 404);
    }

    const existing = await repaymentModel.findByReference(payload.reference);
    if (existing) {
      const summary = await repaymentModel.repaymentSummaryByLead(context.lead);
      responsePayload = {
        duplicate: true,
        loan: summary,
        repayment: existing,
      };
      await integrationLogModel.create({
        crmApplicationId: context.lead.id,
        crmLeadId: context.lead.rawId,
        endpoint: req.originalUrl || req.path,
        ipAddress: req.ip,
        requestPayload,
        responsePayload,
        sourceApplicationId: payload.sourceApplicationId,
        sourceLeadId: payload.sourceLeadId,
        sourceSystem: payload.sourceSystem,
        status: 'duplicate',
        statusCode: 200,
        userAgent: req.get('user-agent') || '',
      });
      return success(res, responsePayload, 'Repayment reference already recorded.');
    }

    const repayment = await repaymentModel.createRepayment(context, {
      amount: payload.amount,
      method: payload.method,
      metadata: {
        gateway: payload.gateway,
        rawPayload: payload.rawPayload,
        source: 'integration',
      },
      paidAt: payload.paidAt,
      receivedBy: 'Source Website',
      reference: payload.reference,
    });
    const loanUpdate = await repaymentModel.refreshLoanAfterRepayment(context);
    const summary = await repaymentModel.repaymentSummaryByLead(context.lead);
    const publicStatus = loanUpdate.balance <= 0 ? 'Repayment completed' : 'Repayment received';
    const stageKey = loanUpdate.balance <= 0 ? 'closed' : 'repayment_active';

    await leadStatusModel.createForLead(context.lead, {
      actor: 'Source Website',
      actorRole: 'customer',
      description: loanUpdate.balance <= 0
        ? 'Your repayment has been received and the loan is closed.'
        : 'Your repayment has been received and your balance has been updated.',
      metadata: {
        amount: repayment.amount,
        balance: loanUpdate.balance,
        loanId: context.loan.id,
        paymentStatus: loanUpdate.paymentStatus,
        reference: repayment.reference,
        totalPaid: loanUpdate.totalPaid,
      },
      publicStatus,
      source: 'repayment',
      sourceKey: `repayment:${repayment.reference}`,
      stageKey,
      status: context.lead.status || 'Converted',
      title: publicStatus,
    });

    await activityModel.createForLead(context.lead, {
      type: 'payment',
      description: `Website payment of ₹${repayment.amount} received (${payload.reference || 'ONLINE'})`,
      user: 'Source Website',
      metadata: {
        amount: repayment.amount,
        balance: loanUpdate.balance,
        gateway: payload.gateway,
        reference: repayment.reference,
      },
    });

    await sourceStatusWebhookService.dispatchRepaymentEvent(context.lead, repayment, summary);


    responsePayload = {
      duplicate: false,
      loan: summary,
      repayment,
    };
    await integrationLogModel.create({
      crmApplicationId: context.lead.id,
      crmLeadId: context.lead.rawId,
      endpoint: req.originalUrl || req.path,
      ipAddress: req.ip,
      requestPayload,
      responsePayload,
      sourceApplicationId: payload.sourceApplicationId,
      sourceLeadId: payload.sourceLeadId,
      sourceSystem: payload.sourceSystem,
      status: 'success',
      statusCode: 201,
      userAgent: req.get('user-agent') || '',
    });

    return success(res, responsePayload, 'Repayment recorded successfully.', 201);
  } catch (error) {
    await integrationLogModel.create({
      endpoint: req.originalUrl || req.path,
      errorMessage: error.publicMessage || error.message,
      ipAddress: req.ip,
      requestPayload,
      responsePayload,
      sourceApplicationId: payload.sourceApplicationId,
      sourceLeadId: payload.sourceLeadId,
      sourceSystem: payload.sourceSystem,
      status: 'failed',
      statusCode: error.statusCode || 500,
      userAgent: req.get('user-agent') || '',
    });
    throw error;
  }
}

module.exports = {
  checkActiveApplication,
  createWebsiteLead,
  downloadSourceSanctionPdf,
  getSourceLeadStatus,
  ingestLead,
  postRepayment,
  recordCustomerLogin,
};
