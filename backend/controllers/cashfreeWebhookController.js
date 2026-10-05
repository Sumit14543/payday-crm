const crypto = require('crypto');
const { config } = require('../config/env');
const leadStatusModel = require('../models/leadStatusModel');
const paymentLinkModel = require('../models/paymentLinkModel');
const repaymentModel = require('../models/repaymentModel');
const sourceStatusWebhookService = require('../services/sourceStatusWebhookService');

const SUCCESS_STATUSES = new Set(['captured', 'paid', 'received', 'settled', 'success', 'successful']);
const FAILED_STATUSES = new Set(['cancelled', 'canceled', 'expired', 'failed', 'failure', 'terminated', 'user_dropped']);

function publicError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicMessage = message;
  throw error;
}

function rawBodyText(req) {
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  if (typeof req.body === 'string') return req.body;
  return JSON.stringify(req.body || {});
}

function timingSafeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function verifySignature(req, rawBody) {
  const signature = String(req.get('x-webhook-signature') || '').trim();
  const timestamp = String(req.get('x-webhook-timestamp') || '').trim();
  const secret = String(config.cashfree.clientSecret || '').trim();

  if (!secret) publicError('Cashfree webhook secret is not configured.', 503);
  if (!signature || !timestamp) publicError('Cashfree webhook signature headers are required.', 400);

  const numericTimestamp = Number(timestamp);
  if (Number.isFinite(numericTimestamp)) {
    const timestampMs = timestamp.length <= 10 ? numericTimestamp * 1000 : numericTimestamp;
    if (Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) {
      publicError('Cashfree webhook timestamp is outside the allowed window.', 400);
    }
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(timestamp + rawBody)
    .digest('base64');

  if (!timingSafeEqual(signature, expected)) {
    publicError('Invalid Cashfree webhook signature.', 400);
  }
}

function deepValue(source, paths) {
  for (const path of paths) {
    const value = path.split('.').reduce((current, key) => (
      current && current[key] !== undefined ? current[key] : undefined
    ), source);
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}

function parseWebhook(rawBody) {
  try {
    return JSON.parse(rawBody || '{}');
  } catch {
    publicError('Cashfree webhook payload must be valid JSON.', 400);
  }
}

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function extractEvent(payload = {}, req) {
  const data = payload.data || {};
  const status = normalizeStatus(deepValue(payload, [
    'data.payment.payment_status',
    'data.transaction.transaction_status',
    'data.link.link_status',
    'payment_status',
    'transaction_status',
    'link_status',
  ]));
  const linkId = String(deepValue(payload, [
    'data.link.link_id',
    'data.payment.payment_link_id',
    'data.transaction.link_id',
    'data.order.order_tags.link_id',
    'data.order.order_id',
    'link_id',
  ]) || '').trim();
  const reference = String(deepValue(payload, [
    'data.payment.cf_payment_id',
    'data.payment.payment_id',
    'data.transaction.cf_payment_id',
    'data.transaction.transaction_id',
    'cf_payment_id',
    'transaction_id',
  ]) || '').trim();
  const amount = Number(deepValue(payload, [
    'data.payment.payment_amount',
    'data.transaction.transaction_amount',
    'data.link.link_amount',
    'data.order.order_amount',
    'payment_amount',
    'transaction_amount',
    'link_amount',
  ]));

  return {
    amount: Number.isFinite(amount) ? amount : 0,
    eventId: String(req.get('x-webhook-event-id') || payload.event_id || payload.eventId || '').trim(),
    linkId,
    paidAt: deepValue(payload, [
      'data.payment.payment_time',
      'data.transaction.transaction_time',
      'data.link.link_paid_at',
      'payment_time',
    ]) || null,
    rawData: data,
    reference,
    status,
    type: String(payload.type || payload.event || '').trim(),
  };
}

function gatewayStatus(event) {
  if (SUCCESS_STATUSES.has(event.status)) return 'paid';
  if (FAILED_STATUSES.has(event.status)) return event.status;
  return event.status || 'received';
}

function isTestWebhook(payload, event) {
  const eventType = String(event.type || '').trim().toUpperCase();
  return Boolean(
    payload?.data?.test_object
    || payload?.data?.testObject
    || eventType === 'WEBHOOK'
  );
}

async function recordSuccessfulRepayment(paymentLink, event, payload) {
  const context = await repaymentModel.findLoanContext({ loanId: paymentLink.loanId });
  if (!context) publicError('Loan repayment account not found for this Cashfree link.', 404);

  const reference = event.reference || event.eventId || `cashfree:${event.linkId}`;
  const existing = await repaymentModel.findByReference(reference);
  if (existing) {
    const updatedLink = await paymentLinkModel.updateStatus(paymentLink.id, {
      metadata: {
        ...(paymentLink.metadata || {}),
        lastWebhookPayload: payload,
      },
      paidAt: existing.receivedAt || event.paidAt || new Date(),
      paymentReference: reference,
      status: 'paid',
    });
    const summary = await repaymentModel.repaymentSummaryByLead(context.lead);
    return {
      duplicate: true,
      loan: summary,
      paymentLink: updatedLink,
      repayment: existing,
    };
  }

  const repayment = await repaymentModel.createRepayment(context, {
    amount: event.amount > 0 ? event.amount : paymentLink.amount,
    method: 'Cashfree Payment Link',
    metadata: {
      gateway: 'cashfree',
      paymentLinkId: paymentLink.id,
      rawPayload: payload,
      source: 'cashfree_webhook',
    },
    paidAt: event.paidAt,
    receivedBy: 'Cashfree Webhook',
    reference,
  });
  const loanUpdate = await repaymentModel.refreshLoanAfterRepayment(context);
  const summary = await repaymentModel.repaymentSummaryByLead(context.lead);
  const publicStatus = loanUpdate.balance <= 0 ? 'Repayment completed' : 'Repayment received';
  const stageKey = loanUpdate.balance <= 0 ? 'closed' : 'repayment_active';

  await leadStatusModel.createForLead(context.lead, {
    actor: 'Cashfree',
    actorRole: 'gateway',
    description: loanUpdate.balance <= 0
      ? 'Your repayment has been received and the loan is closed.'
      : 'Your repayment has been received and your balance has been updated.',
    metadata: {
      amount: repayment.amount,
      balance: loanUpdate.balance,
      loanId: context.loan.id,
      paymentLinkId: paymentLink.id,
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

  await sourceStatusWebhookService.dispatchRepaymentEvent(context.lead, repayment, summary);

  const updatedLink = await paymentLinkModel.updateStatus(paymentLink.id, {
    metadata: {
      ...(paymentLink.metadata || {}),
      lastWebhookPayload: payload,
      loanUpdate,
    },
    paidAt: event.paidAt || new Date(),
    paymentReference: reference,
    status: 'paid',
  });

  return {
    duplicate: false,
    loan: summary,
    paymentLink: updatedLink,
    repayment,
  };
}

async function receiveCashfreeWebhook(req, res) {
  const rawBody = rawBodyText(req);
  verifySignature(req, rawBody);
  const payload = parseWebhook(rawBody);
  const event = extractEvent(payload, req);

  if (!event.linkId && isTestWebhook(payload, event)) {
    return res.status(200).json({
      success: true,
      data: {
        action: 'test_acknowledged',
      },
      message: 'Cashfree webhook endpoint is ready.',
    });
  }

  if (!event.linkId) publicError('Cashfree webhook link_id is required.', 400);

  const paymentLink = await paymentLinkModel.findByGatewayLinkId(event.linkId, 'cashfree');
  if (!paymentLink) publicError('Payment link not found for Cashfree webhook.', 404);

  if (!SUCCESS_STATUSES.has(event.status)) {
    const nextStatus = gatewayStatus(event);
    const updatedLink = await paymentLinkModel.updateStatus(paymentLink.id, {
      metadata: {
        ...(paymentLink.metadata || {}),
        lastWebhookPayload: payload,
      },
      status: nextStatus,
    });
    return res.status(200).json({
      success: true,
      data: {
        action: FAILED_STATUSES.has(event.status) ? 'link_status_updated' : 'ignored',
        paymentLink: updatedLink,
      },
      message: 'Cashfree webhook received.',
    });
  }

  const result = await recordSuccessfulRepayment(paymentLink, event, payload);
  return res.status(200).json({
    success: true,
    data: {
      action: result.duplicate ? 'duplicate_ignored' : 'repayment_recorded',
      ...result,
    },
    message: 'Cashfree repayment webhook processed.',
  });
}

module.exports = {
  receiveCashfreeWebhook,
};
