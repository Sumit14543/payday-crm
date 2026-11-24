const express = require('express');
const { randomUUID } = require('node:crypto');
const { requireRole } = require('../middleware/auth');
const { request, uatError } = require('../services/crifAccountAggregatorUatService');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/http');

const router = express.Router();
router.use(requireRole(['credit-manager', 'product-admin']), (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

function field(value, label, max = 128) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw uatError(400, `Enter a valid ${label}.`);
  }
  return value.trim();
}

function consentIds(body) {
  return {
    trackingId: field(body?.trackingId, 'tracking ID'),
    referenceId: field(body?.referenceId, 'reference ID'),
  };
}

function dateField(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw uatError(400, `Enter a valid ${label}.`);
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw uatError(400, `Enter a valid ${label}.`);
  }
  return value;
}

function list(value, action) {
  if (!Array.isArray(value)) throw uatError(502, `CRIF UAT returned an unexpected ${action} response.`);
  return value;
}

router.get('/templates', asyncHandler(async (_req, res) => {
  const response = await request('/fiu-ws/template/consent/fetch?page=0&size=50', {}, 'template lookup');
  const templates = list(response.data?.details, 'template lookup')
    .filter(item => item?.status === 'ACTIVE' && typeof item.code === 'string')
    .map(({ code, name }) => ({ code, name }));
  return success(res, { templates });
}));

router.post('/consents', asyncHandler(async (req, res) => {
  const templateCode = field(req.body?.templateCode, 'template code', 50);
  const phoneNumber = field(req.body?.phoneNumber, 'sandbox mobile number', 10);
  if (!/^[6-9]\d{9}$/.test(phoneNumber)) throw uatError(400, 'Enter a valid 10-digit sandbox mobile number.');
  const vuaId = req.body?.vuaId ? field(req.body.vuaId, 'sandbox VUA') : undefined;
  if (vuaId && !/^[^\s@]+@[a-zA-Z0-9.-]+$/.test(vuaId)) throw uatError(400, 'Enter a valid sandbox VUA.');
  const pan = req.body?.pan ? String(req.body.pan).trim().toUpperCase() : undefined;
  const email = req.body?.email ? String(req.body.email).trim() : undefined;
  const trackingId = req.body?.trackingId ? String(req.body.trackingId).trim() : `AA_UAT_${randomUUID()}`;

  let redirectionBackUrl;
  try {
    const callback = process.env.CRIF_UAT_REDIRECT_URL || new URL('/credit-manager/aa-test', process.env.CRIF_REDIRECT_URL || 'https://payday.waqtmoney.com');
    const url = new URL(callback);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
    redirectionBackUrl = url.href;
  } catch {
    throw uatError(503, 'Configure a valid HTTPS CRIF UAT return URL.');
  }

  const response = await request('/fiu-ws/consent/initiate', {
    templateCode, trackingId, phoneNumber, vuaId, pan, email, redirectionBackUrl,
  }, 'consent initiation', { retryUnauthorized: false });
  const data = response.data;
  const consents = list(data?.consents, 'consent initiation')
    .filter(item => typeof item?.referenceId === 'string' && item.referenceId)
    .map(({ referenceId, dataRequestMode, purposeText }) => ({ referenceId, dataRequestMode, purposeText }));

  try {
    const url = new URL(data?.redirectionUrl?.trim());
    if (url.protocol !== 'https:' || url.username || url.password || !consents.length) throw new Error();
    return success(res, { trackingId: data.trackingId || trackingId, redirectionUrl: url.href, consents }, 'UAT consent created.', 201);
  } catch {
    throw uatError(502, 'CRIF UAT returned an incomplete consent link or reference.');
  }
}));

router.post('/accounts', asyncHandler(async (req, res) => {
  const { trackingId, referenceId } = consentIds(req.body);
  const response = await request('/fiu-ws/consent/fetch/account', { trackingId, referenceId }, 'account lookup');
  const accounts = list(response.data?.accounts, 'account lookup')
    .filter(item => typeof item?.accountId === 'string' && item.accountId)
    .map(({ accountId, accountNumber, fipId }) => ({ accountId, accountNumber: mask(accountNumber), fipId }));
  return success(res, { accounts, referenceId: response.data.referenceId || referenceId });
}));

router.post('/sessions', asyncHandler(async (req, res) => {
  const ids = consentIds(req.body);
  const fromDate = dateField(req.body?.fromDate, 'start date');
  const toDate = dateField(req.body?.toDate, 'end date');
  if (fromDate > toDate) throw uatError(400, 'The start date must be on or before the end date.');

  const response = await request('/fiu-ws/fi/sessions', { ...ids, fromDate, toDate }, 'FI session lookup');
  const sessions = list(response.data?.sessionDetails, 'FI session lookup')
    .filter(item => typeof item?.sessionId === 'string' && item.sessionId)
    .map(({ sessionId, status, analysisId }) => ({ sessionId, status, analysisId }));
  return success(res, { sessions });
}));

router.post('/fi-request', asyncHandler(async (req, res) => {
  const response = await request('/fiu-ws/fi/initiate', consentIds(req.body), 'FI initiation', { retryUnauthorized: false });
  return success(res, { sessionId: response.data?.sessionId, status: response.data?.status });
}));

function mask(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits ? `XXXX${digits.slice(-4)}` : undefined;
}

router.post('/statement', asyncHandler(async (req, res) => {
  const ids = consentIds(req.body);
  const sessionId = field(req.body?.sessionId, 'session ID');
  const accountId = field(req.body?.accountId, 'account ID');
  const response = await request('/fiu-ws/fi/fetch/JSON', { ...ids, sessionId, accountId }, 'statement fetch');
  const account = list(response, 'statement fetch').find(item => item?.accountId === accountId);
  if (!account) throw uatError(502, 'CRIF UAT returned no statement for the selected account.');

  const data = account.data;
  const transactions = Array.isArray(data?.transactions?.transaction) ? data.transactions.transaction : [];
  return success(res, {
    accountId,
    status: account.status,
    accountNumber: mask(data?.maskedAccNumber),
    balance: data?.summary?.currentBalance,
    currency: data?.summary?.currency,
    ifscCode: data?.summary?.ifscCode,
    fromDate: data?.transactions?.startDate,
    toDate: data?.transactions?.endDate,
    transactionCount: transactions.length,
    transactions: transactions.slice(0, 100).map(item => ({
      date: item?.valueDate || item?.transactionTimestamp,
      type: item?.type,
      amount: item?.amount,
      balance: item?.currentBalance,
      narration: item?.narration,
    })),
  });
}));

router.post('/analytics', asyncHandler(async (req, res) => {
  const ids = consentIds(req.body);
  const analysisId = field(req.body?.analysisId, 'analysis ID');
  const response = await request('/fiu-ws/analytics/fetch', { ...ids, analysisId }, 'analytics fetch');
  const consumer = response.data?.analytics?.consumer;
  return success(res, {
    status: response.status,
    cashFlow: consumer?.cashFlow,
    categorizedAccountCount: response.data?.categorizedTransactions?.length,
  });
}));

module.exports = router;
