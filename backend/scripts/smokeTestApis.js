process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const app = require('../app');
const { config } = require('../config/env');
const { createToken } = require('../middleware/auth');
const { bootstrap } = require('../server');
const leadModel = require('../models/leadModel');

const users = {
  telecaller: {
    email: 'telecaller@waqtfinance.com',
    name: 'Smoke Telecaller',
    role: 'telecaller',
  },
  credit: {
    email: 'shrutisingh@waqtmoney.in',
    name: 'Shruti Singh',
    role: 'credit-manager',
  },
  accountant: {
    email: 'account@waqtfinance.com',
    name: 'Smoke Accountant',
    role: 'accountant',
  },
  collection: {
    email: 'collection@waqtfinance.com',
    name: 'Smoke Collection',
    role: 'collection',
  },
};

function listen(serverApp) {
  return new Promise((resolve) => {
    const server = serverApp.listen(0, () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function request(baseUrl, check) {
  const headers = check.token
    ? { Authorization: `Bearer ${check.token}` }
    : {};

  const response = await fetch(`${baseUrl}${check.path}`, {
    method: check.method || 'GET',
    headers,
  });
  const text = await response.text();
  let body = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return {
    ...check,
    ok: check.expected.includes(response.status),
    status: response.status,
    body,
  };
}

async function main() {
  await bootstrap();

  const tokens = {
    telecaller: createToken(users.telecaller),
    credit: createToken(users.credit),
    accountant: createToken(users.accountant),
    collection: createToken(users.collection),
  };

  const server = await listen(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const checks = [
      { name: 'root', path: '/', expected: [200] },
      { name: 'health', path: '/api/health', expected: [200] },
      { name: 'dashboard stats', path: '/api/dashboard/stats', token: tokens.telecaller, expected: [200] },
      { name: 'lead list', path: '/api/leads', token: tokens.telecaller, expected: [200] },
      { name: 'telecaller policy', path: '/api/leads/telecaller-policy', token: tokens.telecaller, expected: [200] },
      { name: 'telecaller sla report', path: '/api/leads/telecaller-sla-report?period=last30days', token: tokens.telecaller, expected: [200] },
      { name: 'telecaller workbench', path: '/api/leads/telecaller-workbench', token: tokens.telecaller, expected: [200] },
      { name: 'credit queue', path: '/api/leads/credit-queue', token: tokens.credit, expected: [200] },
      { name: 'credit applications', path: '/api/leads/credit-applications', token: tokens.credit, expected: [200] },
      { name: 'accounting queue', path: '/api/leads/accounting-queue', token: tokens.accountant, expected: [200] },
      { name: 'recent accounting payments', path: '/api/leads/accounting-payments/recent', token: tokens.accountant, expected: [200] },
      { name: 'customers', path: '/api/customers', token: tokens.credit, expected: [200] },
      { name: 'loans', path: '/api/loans', token: tokens.credit, expected: [200] },
      { name: 'team reference', path: '/api/team', token: tokens.telecaller, expected: [200] },
      { name: 'collections reference', path: '/api/collections', token: tokens.collection, expected: [200] },
      { name: 'commission reference', path: '/api/commission', token: tokens.accountant, expected: [200] },
      { name: 'income reference', path: '/api/income', token: tokens.accountant, expected: [200] },
      { name: 'invoices reference', path: '/api/invoices', token: tokens.accountant, expected: [200] },
      { name: 'integration auth required', path: '/api/integrations/leads', method: 'POST', expected: [401, 503] },
    ];

    const leads = await leadModel.findAll();
    const lead = leads[0];
    if (lead) {
      const leadId = encodeURIComponent(lead.id);
      checks.push(
        { name: 'lead detail', path: `/api/leads/${leadId}`, token: tokens.telecaller, expected: [200] },
        { name: 'lead activities', path: `/api/leads/${leadId}/activities`, token: tokens.telecaller, expected: [200] },
        { name: 'lead status events', path: `/api/leads/${leadId}/status-events`, token: tokens.telecaller, expected: [200] },
        { name: 'lead document requests', path: `/api/leads/${leadId}/document-requests`, token: tokens.telecaller, expected: [200] },
        { name: 'lead telecaller workspace', path: `/api/leads/${leadId}/telecaller-workspace`, token: tokens.telecaller, expected: [200] },
        { name: 'lead aadhaar report read', path: `/api/leads/${leadId}/aadhaar-report`, token: tokens.telecaller, expected: [200, 404] },
        { name: 'lead cibil report read', path: `/api/leads/${leadId}/cibil-report`, token: tokens.telecaller, expected: [200, 404] },
      );
      if (lead.phone) {
        checks.push({
          name: 'public tracking',
          path: `/api/tracking/${leadId}?phone=${encodeURIComponent(lead.phone)}`,
          expected: [200],
        });
      }
    }

    const results = [];
    for (const check of checks) {
      results.push(await request(baseUrl, check));
    }

    const failed = results.filter((result) => !result.ok);
    const providerConfig = {
      aadhaar: {
        ready: Boolean(config.bifrost.aadhaarApiUrl && config.bifrost.apiToken),
        urlConfigured: Boolean(config.bifrost.aadhaarApiUrl),
        tokenConfigured: Boolean(config.bifrost.apiToken),
      },
      cibil: {
        ready: Boolean(config.bifrost.apiUrl && config.bifrost.apiToken),
        urlConfigured: Boolean(config.bifrost.apiUrl),
        tokenConfigured: Boolean(config.bifrost.apiToken),
      },
      digio: {
        ready: Boolean(config.digio.clientId && config.digio.clientSecret),
        clientConfigured: Boolean(config.digio.clientId && config.digio.clientSecret),
      },
      smtp: {
        ready: Boolean(config.smtp.host && config.smtp.username && config.smtp.password),
        accountConfigured: Boolean(config.smtp.host && config.smtp.username && config.smtp.password),
      },
    };

    console.log(JSON.stringify({
      success: failed.length === 0,
      checked: results.length,
      failed: failed.map((result) => ({
        name: result.name,
        path: result.path,
        status: result.status,
        message: result.body && result.body.message ? result.body.message : undefined,
      })),
      providerConfig,
    }, null, 2));

    if (failed.length) {
      process.exitCode = 1;
    }
  } finally {
    await close(server);
  }

  process.exit(process.exitCode || 0);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
