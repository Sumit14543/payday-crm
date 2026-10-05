const crypto = require('crypto');
const { config } = require('../config/env');
const integrationLogModel = require('../models/integrationLogModel');
const sourceTrackingSnapshotService = require('./sourceTrackingSnapshotService');

function normalizeSourceSystem(value) {
  return String(value || '').trim().toLowerCase();
}

function signPayload(payloadText, secret) {
  if (!secret) return '';
  return `sha256=${crypto.createHmac('sha256', secret).update(payloadText).digest('hex')}`;
}

function sourceWebhookUrl(sourceSystem) {
  return config.integrations.statusWebhookUrls[normalizeSourceSystem(sourceSystem)] || '';
}

function sourceWebhookSecret(sourceSystem) {
  return config.integrations.statusWebhookSecrets[normalizeSourceSystem(sourceSystem)] || '';
}

function buildWebhookPayload(lead, event) {
  return {
    event: 'lead.status.updated',
    eventId: event.sourceKey || `lead-status-event:${event.id}`,
    applicationId: lead.id || '',
    crmLeadId: lead.rawId || '',
    sourceSystem: lead.sourceSystem || '',
    sourceLeadId: lead.sourceLeadId || '',
    sourceApplicationId: lead.sourceApplicationId || '',
    status: event.status || '',
    statusCode: event.statusCode || event.stageKey || '',
    publicStatus: event.publicStatus || '',
    title: event.title || '',
    description: event.description || '',
    progressPercent: event.progressPercent || 0,
    nextExpectedAction: event.nextExpectedAction || '',
    isTerminalStatus: Boolean(event.isTerminalStatus),
    occurredAt: event.occurredAt || new Date().toISOString(),
  };
}

function buildRepaymentWebhookPayload(lead, repayment, summary) {
  return {
    event: 'loan.repayment.updated',
    eventId: `repayment:${repayment.reference || repayment.id}`,
    applicationId: lead.id || '',
    crmLeadId: lead.rawId || '',
    sourceSystem: lead.sourceSystem || '',
    sourceLeadId: lead.sourceLeadId || '',
    sourceApplicationId: lead.sourceApplicationId || '',
    loanId: summary.loanId || repayment.loanId || '',
    repaymentId: repayment.id,
    reference: repayment.reference || '',
    amount: repayment.amount || 0,
    amountPaid: summary.amountPaid || 0,
    outstanding: summary.outstanding || 0,
    dueAmount: summary.dueAmount || 0,
    dueDate: summary.dueDate || null,
    lastPaymentAt: summary.lastPaymentAt || repayment.receivedAt || null,
    repaymentStatus: summary.repaymentStatus || '',
    loanStatus: summary.loanStatus || '',
    publicStatus: summary.outstanding <= 0 ? 'Repayment completed' : 'Repayment received',
  };
}

async function logWebhook({ lead, url, payload, responsePayload, status, statusCode, errorMessage }) {
  await integrationLogModel.create({
    crmApplicationId: lead.id || '',
    crmLeadId: lead.rawId || '',
    endpoint: url,
    errorMessage,
    requestPayload: payload,
    responsePayload,
    sourceApplicationId: lead.sourceApplicationId || '',
    sourceLeadId: lead.sourceLeadId || '',
    sourceSystem: lead.sourceSystem || '',
    status,
    statusCode,
    userAgent: 'payday-loan-crm-status-webhook',
  });
}

async function postWebhook(url, sourceSystem, payload) {
  const body = JSON.stringify(payload);
  const timestamp = new Date().toISOString();
  const signature = signPayload(body, sourceWebhookSecret(sourceSystem));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.integrations.statusWebhookTimeoutMs);

  try {
    const response = await fetch(url, {
      body,
      headers: {
        'content-type': 'application/json',
        'x-crm-webhook-event': payload.event,
        'x-crm-webhook-signature': signature,
        'x-crm-webhook-timestamp': timestamp,
        'x-crm-source-system': normalizeSourceSystem(sourceSystem),
      },
      method: 'POST',
      signal: controller.signal,
    });
    const responseText = await response.text().catch(() => '');
    return {
      ok: response.ok,
      responsePayload: responseText ? { body: responseText.slice(0, 2000) } : null,
      statusCode: response.status,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function dispatchLeadStatusEvent(lead, event) {
  const sourceSystem = normalizeSourceSystem(lead?.sourceSystem);
  const url = sourceWebhookUrl(sourceSystem);
  if (!sourceSystem || !url || !event?.isCustomerVisible) return;

  const snapshot = await sourceTrackingSnapshotService.buildForLead(lead);
  const payload = {
    ...buildWebhookPayload(lead, event),
    ...snapshot,
  };
  try {
    const result = await postWebhook(url, sourceSystem, payload);
    await logWebhook({
      lead,
      payload,
      responsePayload: result.responsePayload,
      status: result.ok ? 'webhook_success' : 'webhook_failed',
      statusCode: result.statusCode,
      url,
      errorMessage: result.ok ? '' : `Webhook returned HTTP ${result.statusCode}`,
    });
  } catch (error) {
    await logWebhook({
      lead,
      payload,
      responsePayload: null,
      status: 'webhook_failed',
      statusCode: error.name === 'AbortError' ? 408 : 0,
      url,
      errorMessage: error.name === 'AbortError'
        ? 'Webhook request timed out.'
        : error.message || 'Webhook request failed.',
    });
  }
}

async function dispatchRepaymentEvent(lead, repayment, summary) {
  const sourceSystem = normalizeSourceSystem(lead?.sourceSystem);
  const url = sourceWebhookUrl(sourceSystem);
  if (!sourceSystem || !url) return;

  const snapshot = await sourceTrackingSnapshotService.buildForLead(lead);
  const payload = {
    ...buildRepaymentWebhookPayload(lead, repayment, summary),
    sanction: snapshot.sanction || null,
    disbursement: snapshot.disbursement || null,
  };
  try {
    const result = await postWebhook(url, sourceSystem, payload);
    await logWebhook({
      lead,
      payload,
      responsePayload: result.responsePayload,
      status: result.ok ? 'webhook_success' : 'webhook_failed',
      statusCode: result.statusCode,
      url,
      errorMessage: result.ok ? '' : `Webhook returned HTTP ${result.statusCode}`,
    });
  } catch (error) {
    await logWebhook({
      lead,
      payload,
      responsePayload: null,
      status: 'webhook_failed',
      statusCode: error.name === 'AbortError' ? 408 : 0,
      url,
      errorMessage: error.name === 'AbortError'
        ? 'Webhook request timed out.'
        : error.message || 'Webhook request failed.',
    });
  }
}

module.exports = {
  buildRepaymentWebhookPayload,
  buildWebhookPayload,
  dispatchLeadStatusEvent,
  dispatchRepaymentEvent,
};
