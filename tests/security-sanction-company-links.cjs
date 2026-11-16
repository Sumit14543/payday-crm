const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { load, response } = require('./helpers/security-vm.cjs');
const token = 'a1'.repeat(16);
async function emailFor(tenant) {
  let mail;
  const service = load('backend/services/sanctionLetterService.js', {
    fs: {}, pdfkit: function () {}, sharp: () => {},
    '../config/uploads': { uploadPath: () => '/synthetic', ensureUploadDir: () => '/synthetic' },
    './emailService': { sendMail: async value => { mail = value; } },
    '../config/db': { getActiveBrand: () => ({ slug: tenant, name: 'Synthetic Company' }) },
    '../utils/sanctionDates': { formatSanctionDate: () => '16 Nov 2026' },
  }, { process: { env: { PUBLIC_APP_URL: 'https://payday.waqtmoney.com/' } } });
  // A source/lender label cannot override the database company.
  await service.emailSanctionLetter({ sourceSystem: 'waqtmoney', decisionToken: token, borrower: 'Synthetic', agreementNumber: 'SYN', emailTo: 'synthetic@example.invalid' }, '/synthetic.pdf');
  return [...mail.html.matchAll(/href="([^"]+)"/g)].map(match => match[1].replace(/&amp;/g, '&')).filter(url => url.includes('sanction-decision')).map(url => new URL(url));
}
function routing(owner = 'geetpay') {
  const queries = [], companies = [{ slug: 'geetpay', status: 'active' }, { slug: 'loaninwallet', status: 'active' }, { slug: 'salarywaves', status: 'active' }];
  const middleware = load('backend/middleware/tenantMiddleware.js', {
    '../config/env': { config: { integrations: { apiKeys: [] } } },
    '../config/db': {
      queryMaster: async (_sql, args) => args?.length ? companies.filter(company => company.slug === args[0]) : companies,
      getTenantPool: tenant => ({ query: (sql, args, callback) => { queries.push({ company: tenant.slug, sql, args }); callback(null, tenant.slug === owner && args[0] === token ? [{ id: 1 }] : []); } }),
      tenantLocalStorage: { run: (_context, callback) => callback() },
    },
  });
  const run = async (url, headers = {}) => {
    const req = { path: url, headers, query: {}, body: {}, get: name => name === 'host' ? 'payday-api.waqtmoney.com' : headers[name] };
    let next = false; await middleware(req, response(), () => { next = true; });
    assert.equal(next, true); return req.tenant;
  };
  return { run, queries };
}
for (const tenant of ['waqtfinance', 'geetpay', 'loaninwallet', 'salarywaves']) test(`${tenant}: real email template keeps the current database company on accept/reject links`, async () => {
  const links = await emailFor(tenant);
  assert.equal(links.length, 2);
  assert.deepEqual(links.map(url => url.searchParams.get('action')), ['accept', 'reject']);
  for (const url of links) {
    assert.equal(url.searchParams.get('tenant'), tenant); assert.equal(url.hostname, 'payday.waqtmoney.com');
    assert.equal(url.pathname, '/sanction-decision/' + token);
  }
});
test('old nondefault-company email token resolves its owning company without a tenant query', async () => {
  const f = routing(); assert.equal((await f.run('/api/sanction-decision/' + token)).slug, 'geetpay');
  assert.ok(f.queries.every(query => /SELECT id FROM lead_sanctions WHERE decision_token = \?/.test(query.sql)));
  assert.ok(f.queries.every(query => query.args.length === 1));
});
test('sanction, document and esign lookups keep separate token caches and query contracts', async () => {
  const f = routing();
  await f.run('/api/sanction-decision/' + token);
  const before = f.queries.length; await f.run('/api/document-upload/' + token);
  assert.ok(f.queries.length > before);
  assert.ok(f.queries.slice(before).every(query => query.sql.includes('lead_document_requests') && query.args.length === 2));
  const beforeEsign = f.queries.length; await f.run('/api/esign/' + token);
  assert.ok(f.queries.length > beforeEsign);
  assert.ok(f.queries.slice(beforeEsign).every(query => query.sql.includes('lead_esigns') && query.args.length === 1));
});
test('ordinary staff/company routes do not scan sanction tokens across databases', async () => {
  const f = routing(); assert.equal((await f.run('/api/leads', { 'x-tenant-slug': 'geetpay' })).slug, 'geetpay');
  assert.equal(f.queries.length, 0);
});
test('explicit company on a sanction request is retained without cross-company discovery', async () => {
  const f = routing('loaninwallet');
  assert.equal((await f.run('/api/sanction-decision/' + token, { 'x-tenant-slug': 'geetpay' })).slug, 'geetpay');
  assert.equal(f.queries.length, 0);
});
test('legacy sanction discovery is rate limited before tenant/database lookup', () => {
  const options = [];
  const limits = load('backend/middleware/rateLimiter.js', { 'express-rate-limit': { rateLimit: value => { options.push(value); return value; }, ipKeyGenerator: ip => ip } });
  const limit = limits.publicSanctionLimiter, res = response();
  assert.equal(limit.max, 60); assert.equal(limit.windowMs, 60000);
  limit.handler({}, res); assert.equal(res.statusCode, 429); assert.equal(res.body.success, false);
  const source = fs.readFileSync(path.resolve(__dirname, '../backend/app.js'), 'utf8');
  assert.ok(source.indexOf("app.use('/api/sanction-decision', publicSanctionLimiter)") < source.indexOf('app.use(tenantMiddleware)'));
});
