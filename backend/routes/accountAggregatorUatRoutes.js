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

function mask(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits ? `XXXX${digits.slice(-4)}` : undefined;
}

router.get('/templates', asyncHandler(async (_req, res) => {
  const response = await request('/fiu-ws/template/consent/fetch?page=0&size=50', {}, 'template lookup');
  const templates = list(response.data?.details, 'template lookup')
    .filter(item => item?.status === 'ACTIVE' && typeof item.code === 'string')
    .map(({ code, name }) => ({ code, name }));
  return success(res, { templates });
}));

const initiateConsentHandler = asyncHandler(async (req, res) => {
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
    return success(res, { trackingId: data.trackingId || trackingId, redirectionUrl: url.href, consents, raw: data }, 'UAT consent created.', 201);
  } catch {
    throw uatError(502, 'CRIF UAT returned an incomplete consent link or reference.');
  }
});

const fetchAccountHandler = asyncHandler(async (req, res) => {
  const { trackingId, referenceId } = consentIds(req.body);
  const response = await request('/fiu-ws/consent/fetch/account', { trackingId, referenceId }, 'account lookup');
  const accounts = list(response.data?.accounts, 'account lookup')
    .filter(item => typeof item?.accountId === 'string' && item.accountId)
    .map(({ accountId, accountNumber, fipId }) => ({ accountId, accountNumber: mask(accountNumber), fipId }));
  return success(res, { accounts, referenceId: response.data.referenceId || referenceId, raw: response.data });
});

const sessionsHandler = asyncHandler(async (req, res) => {
  const ids = consentIds(req.body);
  const fromDate = dateField(req.body?.fromDate, 'start date');
  const toDate = dateField(req.body?.toDate, 'end date');
  if (fromDate > toDate) throw uatError(400, 'The start date must be on or before the end date.');

  const response = await request('/fiu-ws/fi/sessions', { ...ids, fromDate, toDate }, 'FI session lookup');
  const rawList = list(response.data?.sessionDetails || response.data?.sessions || response.data, 'FI session lookup');
  const sessions = rawList
    .filter(item => typeof (item?.sessionId || item?.id) === 'string')
    .map(item => ({
      sessionId: item?.sessionId || item?.id,
      status: item?.status,
      analysisId: item?.analysisId || item?.analysis_id || item?.analyticsId || item?.analyticsSessionId || item?.consentAnalyticsDetails?.analysisId || item?.reportId || item?.referenceId || '',
    }));
  return success(res, { sessions, raw: response.data });
});

const fiRequestHandler = asyncHandler(async (req, res) => {
  const response = await request('/fiu-ws/fi/initiate', consentIds(req.body), 'FI initiation', { retryUnauthorized: false });
  return success(res, { sessionId: response.data?.sessionId, status: response.data?.status, raw: response.data });
});

function extractTransactions(account) {
  if (!account) return [];
  const candidates = [
    account.data?.transactions?.transaction,
    account.data?.account?.transactions?.transaction,
    account.data?.account?.transactions,
    account.data?.transactions,
    account.account?.transactions?.transaction,
    account.account?.transactions,
    account.transactions?.transaction,
    account.transactions,
    account.data?.transaction,
    account.transaction
  ];

  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) return c;
    if (c && typeof c === 'object' && (c.amount !== undefined || c.narration !== undefined || c.type !== undefined || c.txnId !== undefined)) {
      return [c];
    }
  }

  // Deep recursive search for any array of transactions
  try {
    const queue = [account];
    let depth = 0;
    while (queue.length > 0 && depth < 200) {
      depth++;
      const curr = queue.shift();
      if (!curr || typeof curr !== 'object') continue;
      if (Array.isArray(curr)) {
        if (curr.length > 0 && curr[0] && typeof curr[0] === 'object' && (curr[0].amount !== undefined || curr[0].narration !== undefined || curr[0].type !== undefined)) {
          return curr;
        }
        for (const item of curr.slice(0, 5)) queue.push(item);
      } else {
        for (const key of Object.keys(curr)) {
          if (key.toLowerCase().includes('transaction') && Array.isArray(curr[key]) && curr[key].length > 0) {
            return curr[key];
          }
          queue.push(curr[key]);
        }
      }
    }
  } catch (e) {}

  return [];
}

const statementHandler = asyncHandler(async (req, res) => {
  const ids = consentIds(req.body);
  const sessionId = field(req.body?.sessionId, 'session ID');
  const accountId = field(req.body?.accountId, 'account ID');
  const response = await request('/fiu-ws/fi/fetch/JSON', { ...ids, sessionId, accountId }, 'statement fetch');
  const accountList = list(response, 'statement fetch');
  const account = accountList.find(item => item?.accountId === accountId) || accountList[0];
  if (!account) throw uatError(502, 'CRIF UAT returned no statement for the selected account.');

  const data = account.data || account;
  const rawTxns = extractTransactions(account);
  const summary = data?.summary || data?.account?.summary || account?.summary || {};
  const profile = data?.profile || data?.account?.profile || account?.profile || {};

  return success(res, {
    accountId: account.accountId || accountId,
    status: account.status || 'READY',
    accountNumber: mask(data?.maskedAccNumber || data?.accountNumber || account.accountNumber),
    balance: summary.currentBalance || summary.balance || '0.00',
    currency: summary.currency || 'INR',
    ifscCode: summary.ifscCode || summary.ifsc || 'N/A',
    fromDate: data?.transactions?.startDate || summary.openingDate,
    toDate: data?.transactions?.endDate,
    transactionCount: rawTxns.length,
    rawProfile: profile,
    rawSummary: summary,
    transactions: rawTxns.slice(0, 100).map(item => ({
      date: item?.valueDate || item?.transactionTimestamp || item?.date || item?.txnDate,
      type: item?.type || item?.transactionType || (item?.amount > 0 ? 'CREDIT' : 'DEBIT'),
      amount: String(item?.amount ?? item?.txnAmount ?? '0'),
      balance: String(item?.currentBalance ?? item?.balance ?? ''),
      narration: item?.narration || item?.description || item?.remark || item?.mode || 'Bank Transaction',
    })),
  });
});

const analyticsHandler = asyncHandler(async (req, res) => {
  const ids = consentIds(req.body);
  const analysisId = field(req.body?.analysisId, 'analysis ID');
  const response = await request('/fiu-ws/analytics/fetch', { ...ids, analysisId }, 'analytics fetch');
  const consumer = response.data?.analytics?.consumer;
  return success(res, {
    status: response.status,
    cashFlow: consumer?.cashFlow,
    categorizedAccountCount: response.data?.categorizedTransactions?.length,
    raw: response.data,
  });
});

// Friendly aliases:
router.post('/consents', initiateConsentHandler);
router.post('/accounts', fetchAccountHandler);
router.post('/sessions', sessionsHandler);
router.post('/fi-request', fiRequestHandler);
router.post('/statement', statementHandler);
router.post('/analytics', analyticsHandler);

// Exact CRIF Swagger Endpoint paths:
router.post('/fiu-ws/consent/initiate', initiateConsentHandler);
router.post('/fiu-ws/consent/fetch/account', fetchAccountHandler);
router.post('/fiu-ws/fi/sessions', sessionsHandler);
router.post('/fiu-ws/fi/initiate', fiRequestHandler);
router.post('/fiu-ws/fi/fetch/JSON', statementHandler);
router.post('/fiu-ws/analytics/fetch', analyticsHandler);

module.exports = router;
