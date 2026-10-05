const { config } = require('../config/env');
const crypto = require('crypto');

function publicError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicMessage = message;
  throw error;
}

function publicGatewayError(message, statusCode, upstream = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicMessage = message;
  error.upstreamStatus = upstream.status;
  error.upstreamResponse = {
    data: upstream.data || null,
    error: upstream.error || null,
    requestId: upstream.requestId || '',
    status: upstream.status,
  };
  throw error;
}

function requestId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return crypto.randomBytes(16).toString('hex');
}

function cashfreeConfig() {
  const clientId = String(config.cashfree.clientId || '').trim();
  const clientSecret = String(config.cashfree.clientSecret || '').trim();
  if (!clientId || !clientSecret) {
    publicError('Cashfree credentials are not configured. Set CASHFREE_CLIENT_ID and CASHFREE_CLIENT_SECRET.', 503);
  }

  return {
    apiVersion: config.cashfree.apiVersion,
    baseUrl: String(config.cashfree.baseUrl || '').replace(/\/+$/, ''),
    clientId,
    clientSecret,
    notifyUrl: String(config.cashfree.notifyUrl || '').trim(),
    returnUrl: String(config.cashfree.returnUrl || '').trim(),
  };
}

function formatCashfreeDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  const pad = (part) => String(part).padStart(2, '0');
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteOffset = Math.abs(offsetMinutes);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(Math.floor(absoluteOffset / 60))}:${pad(absoluteOffset % 60)}`;
}

function buildLinkId(loanId) {
  const cleanLoanId = String(loanId || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 36) || 'loan';
  return `rp_${cleanLoanId}_${Date.now().toString(36)}`.slice(0, 50);
}

function applyTemplate(template, values = {}) {
  return String(template || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => (
    values[key] === undefined || values[key] === null ? match : encodeURIComponent(String(values[key]))
  ));
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function normalizeEmail(value) {
  const email = String(value || '').trim();
  return email.includes('@') ? email : '';
}

function cashfreeStatusCode(status) {
  if (status === 400 || status === 404 || status === 409 || status === 422 || status === 429) return status;
  if (status === 401 || status === 403) return 503;
  return 502;
}

function cashfreeErrorMessage(data, fallback) {
  const message = data?.message || data?.error_description || data?.error || data?.reason;
  if (Array.isArray(data?.errors) && data.errors.length) {
    const detail = data.errors
      .map((item) => item?.message || item?.description || item?.field)
      .filter(Boolean)
      .join(', ');
    if (detail) return detail;
  }
  return message || fallback;
}

async function createPaymentLink(payload = {}) {
  const settings = cashfreeConfig();
  const amount = Number(payload.amount);
  if (!Number.isFinite(amount) || amount <= 0) publicError('Payment link amount must be greater than zero.');

  const expiresAt = payload.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000);
  const linkId = payload.linkId || buildLinkId(payload.loanId);
  const templateValues = {
    application_id: payload.applicationId || '',
    applicationId: payload.applicationId || '',
    lead_id: payload.leadId || '',
    leadId: payload.leadId || '',
    link_id: linkId,
    linkId,
    loan_id: payload.loanId || '',
    loanId: payload.loanId || '',
    order_id: linkId,
    orderId: linkId,
  };
  const notifyUrl = applyTemplate(settings.notifyUrl, templateValues);
  const returnUrl = applyTemplate(settings.returnUrl, templateValues);
  const customerPhone = normalizePhone(payload.customerPhone);
  const customerEmail = normalizeEmail(payload.customerEmail);
  if (!customerPhone && !customerEmail) {
    publicError('Customer phone or email is required to create a Cashfree payment link.');
  }

  const body = {
    customer_details: {
      customer_email: customerEmail || undefined,
      customer_name: payload.customerName || 'Customer',
      customer_phone: customerPhone || undefined,
    },
    link_amount: amount,
    link_auto_reminders: false,
    link_currency: 'INR',
    link_expiry_time: formatCashfreeDate(expiresAt),
    link_id: linkId,
    link_meta: {
      notify_url: notifyUrl || undefined,
      return_url: returnUrl || undefined,
    },
    link_notify: {
      send_email: false,
      send_sms: false,
    },
    link_notes: {
      applicationId: payload.applicationId || '',
      leadId: payload.leadId || '',
      loanId: payload.loanId || '',
      source: 'crm_account_panel',
    },
    link_purpose: payload.purpose || `Repayment for loan ${payload.loanId}`,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  let response;
  try {
    response = await fetch(`${settings.baseUrl}/pg/links`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-version': settings.apiVersion,
        'x-client-id': settings.clientId,
        'x-client-secret': settings.clientSecret,
        'x-idempotency-key': requestId(),
        'x-request-id': requestId(),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    publicGatewayError(
      error.name === 'AbortError'
        ? 'Cashfree payment link request timed out. Please try again.'
        : 'Unable to reach Cashfree while creating the payment link.',
      502,
      {
        error: error.message,
      }
    );
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      publicGatewayError(`Cashfree returned a non-JSON response (${response.status}).`, 502, {
        error: text.slice(0, 300),
        requestId: response.headers.get('x-request-id') || response.headers.get('x-cf-request-id') || '',
        status: response.status,
      });
    }
  }

  if (!response.ok) {
    publicGatewayError(
      cashfreeErrorMessage(data, `Cashfree payment link creation failed (${response.status}).`),
      cashfreeStatusCode(response.status),
      {
        data,
        requestId: response.headers.get('x-request-id') || response.headers.get('x-cf-request-id') || '',
        status: response.status,
      }
    );
  }

  return {
    cashfreeResponse: data,
    expiresAt,
    cfLinkId: data?.cf_link_id ? String(data.cf_link_id) : '',
    gatewayLinkId: data?.link_id || linkId,
    linkUrl: data?.link_url || '',
    requestPayload: body,
    status: data?.link_status || data?.linkStatus || 'created',
  };
}

module.exports = {
  createPaymentLink,
};
