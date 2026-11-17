// Production frontend bundles in Chrome, entirely intercepted synthetic traffic.
// No live API request, real credential, customer data or financial write.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const puppeteer = require('../backend/node_modules/puppeteer-core');
const root = path.resolve(__dirname, '..');
const appOrigin = 'https://payday.waqtmoney.com', apiOrigin = 'https://payday-api.waqtmoney.com';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const rows = Array.from({ length: 30 }, (_, i) => ({
  id: `SYN-${i + 1}`, rawId: String(i + 1), name: `Fixture Borrower ${String(i + 1).padStart(3, '0')}`,
  sourceApplicationId: `SYN-${i + 1}`, email: `synthetic-${i}@example.invalid`, phone: '', source: 'Synthetic', sourceSystem: 'synthetic',
  priority: 'Low', status: 'New', assignedTo: 'Synthetic Agent', assignedRole: 'Telecaller', createdDate: '2026-11-17', createdAt: '2026-11-17T09:00:00',
  loanAmount: 1000, pendingDocumentCount: 8, documentTotalCount: 8, documentVerifiedCount: 0, hasNoDisposition: true,
  latestCallDisposition: '', nextAction: 'First call due', slaStatus: 'On Track', profileImageUrl: '',
}));
function workbench(url) {
  const query = url.searchParams, size = Number(query.get('pageSize') || 10), page = Number(query.get('page') || 1);
  const search = (query.get('search') || '').toLowerCase();
  const filtered = rows.filter(row => row.name.toLowerCase().includes(search));
  return { counts: { tabs: { all: filtered.length, uncontacted: filtered.length }, disposition: { __none__: filtered.length },
    stats: { totalLeads: filtered.length, newUncalled: filtered.length }, priority: { Low: filtered.length }, sourceSystem: { synthetic: filtered.length } },
    items: filtered.slice((page - 1) * size, page * size),
    pagination: { page, pageSize: size, totalItems: filtered.length, totalPages: Math.max(1, Math.ceil(filtered.length / size)) }, lastUpdatedAt: '2026-11-17T09:00:00Z' };
}
async function openFixture(browser, dist, { candidate = true, authenticated = true, apiDelayMs = 250, workbenchReply, loginFlow = false, failCodePrefetch = false } = {}) {
  const context = await browser.createBrowserContext(), page = await context.newPage();
  await page.setViewport({ width: 1365, height: 900 });
  const requests = [], pageErrors = [], unsafeRequests = []; let expired = false, codeFailureSent = false;
  const records = new WeakMap();
  page.on('requestfailed', request => { const record = records.get(request); if (record) record.failed = true; });
  if (loginFlow) await page.evaluateOnNewDocument(() => {
    navigator.geolocation.getCurrentPosition = (_success, failure) => failure?.({ code: 1, message: 'Synthetic test location unavailable' });
  });
  if (authenticated) await page.evaluateOnNewDocument(() => localStorage.setItem('paydayops.auth.user', JSON.stringify({ token: 'SYN-BROWSER-SESSION', user: { name: 'Synthetic Agent', email: 'agent@example.invalid', role: 'telecaller', tenant: 'synthetic-company' } })));
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', async request => {
    try {
      const url = new URL(request.url()), record = { path: url.pathname, origin: url.origin, method: request.method(), start: Date.now(), query: url.searchParams.toString() };
      requests.push(record);
      records.set(request, record);
      const respond = async data => { if (record.failed) return; await request.respond(data); record.end = Date.now(); };
      if (![appOrigin, apiOrigin].includes(url.origin)) return request.abort();
      if (loginFlow && request.method() === 'POST' && ['/api/auth/login', '/api/superadmin/login', '/api/auth/verify-otp'].includes(url.pathname)) {
        const body = JSON.parse(request.postData());
        const cors = { 'access-control-allow-origin': appOrigin, 'access-control-allow-headers': 'content-type,x-tenant-slug' };
        if (url.pathname.endsWith('/login')) return respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ success: true, data: { requiresOtp: true, tempToken: 'SYN-OTP-CHALLENGE', tenant: 'synthetic-company', email: 'agent@example.invalid' } }) });
        if (body.otp !== '123456') return respond({ status: 401, headers: cors, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Synthetic invalid OTP' }) });
        return respond({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ success: true, data: { token: 'SYN-BROWSER-SESSION', documentToken: 'SYN-DOCUMENT', user: { name: 'Synthetic Agent', email: 'agent@example.invalid', role: 'telecaller', tenant: 'synthetic-company' } } }) });
      }
      if (!['GET', 'OPTIONS'].includes(request.method())) { unsafeRequests.push(url.pathname); return request.abort(); }
      if (url.pathname.startsWith('/api/')) {
        const cors = { 'access-control-allow-origin': appOrigin, 'access-control-allow-headers': request.headers()['access-control-request-headers'] || 'authorization,x-tenant-slug', 'cache-control': 'private, no-store' };
        if (request.method() === 'OPTIONS') { await pause(300); return respond({ status: 204, headers: cors }); }
        if (url.pathname.startsWith('/api/leads/telecaller-')) {
          assert.equal(request.headers().authorization, 'Bearer SYN-BROWSER-SESSION');
          assert.equal(request.headers()['x-tenant-slug'], 'synthetic-company');
          if (candidate) assert.equal(url.origin, appOrigin);
          const override = url.pathname.endsWith('telecaller-workbench-v2') && workbenchReply ? await workbenchReply(url) : null;
          await pause(apiDelayMs);
          if (record.failed) return;
          if (override?.abort) return request.abort('failed');
          if (override?.status) return respond({ status: override.status, contentType: 'application/json', headers: cors, body: JSON.stringify({ success: false, message: override.message || 'Synthetic page failure' }) });
          if (expired) return respond({ status: 401, contentType: 'application/json', headers: cors, body: JSON.stringify({ success: false, message: 'Synthetic session expired' }) });
          const data = url.pathname.endsWith('telecaller-policy')
            ? { allowedActions: [], dispositions: [], documentChecks: [], teamMembers: [], sla: { firstCallMinutes: 15, docsWarningHours: 24, docsBreachHours: 48 }, noDispositionValue: '__none__' }
            : workbench(url);
          return respond({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ success: true, data }) });
        }
        return respond({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ success: true, data: {} }) });
      }
      if (url.origin !== appOrigin) return request.abort();
      if (url.pathname.startsWith('/assets/')) {
        const file = path.resolve(dist, '.' + url.pathname);
        assert.ok(file.startsWith(dist + path.sep) && fs.existsSync(file), 'Asset must be inside fixture build');
        await pause(100);
        if (failCodePrefetch && !codeFailureSent && /^\/assets\/Leads-.*\.js$/.test(url.pathname)) {
          codeFailureSent = true;
          return respond({ status: 503, contentType: 'application/javascript', body: '// Synthetic failed code preload' });
        }
        return respond({ status: 200, contentType: url.pathname.endsWith('.css') ? 'text/css' : 'application/javascript', body: fs.readFileSync(file) });
      }
      return respond({ status: 200, contentType: 'text/html', body: fs.readFileSync(path.join(dist, 'index.html')) });
    } catch (error) { pageErrors.push(error.message); if (!request.isInterceptResolutionHandled()) await request.abort(); }
  });
  return { context, page, requests, pageErrors, unsafeRequests, expire: () => { expired = true; } };
}
async function sample(browser, dist, candidate, functional = false) {
  const f = await openFixture(browser, dist, { candidate });
  try {
    const start = Date.now();
    await f.page.goto(appOrigin + '/leads', { waitUntil: 'domcontentloaded' });
    await f.page.waitForFunction(() => document.body.innerText.includes('Fixture Borrower 001'));
    const firstRowsVisibleMs = Date.now() - start;
    const layout = f.requests.find(r => /^\/assets\/Layout-[^/]+\.js$/.test(r.path));
    const leads = f.requests.filter(r => /^\/assets\/Leads-[^/]+\.js$/.test(r.path));
    assert.ok(layout && leads.length, 'Expected Layout and Leads chunks');
    const parallel = leads.some(r => r.start < layout.end);
    if (candidate) assert.equal(parallel, true, 'Telecaller page code must start before Layout completes');
    const initialReads = f.requests.filter(r => r.path.startsWith('/api/leads/telecaller-') && r.method === 'GET');
    assert.equal(initialReads.length, 3);
    const apiPreflights = f.requests.filter(r => r.path.startsWith('/api/leads/telecaller-') && r.method === 'OPTIONS').length;
    if (candidate) assert.equal(apiPreflights, 0);
    const result = { firstRowsVisibleMs, pageCodeOverlapsLayout: parallel, initialApiReads: initialReads.length, apiPreflights,
      timeline: f.requests.filter(r => r.path.startsWith('/assets/') || r.path.startsWith('/api/leads/telecaller-')).map(r => ({ path: r.path, method: r.method, startMs: r.start - start, endMs: r.end ? r.end - start : null })) };
    if (functional) {
      await f.page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Next').click());
      await f.page.waitForFunction(() => document.body.innerText.includes('Fixture Borrower 011'));
      assert.ok(f.requests.some(r => r.path.endsWith('workbench-v2') && new URLSearchParams(r.query).get('page') === '2'));
      await f.page.type('input[placeholder="Search leads by name, ID, phone or email"]', 'Borrower 027');
      await f.page.waitForFunction(() => document.body.innerText.includes('Fixture Borrower 027') && document.body.innerText.includes('Page 1 of 1'));
      assert.ok(f.requests.some(r => new URLSearchParams(r.query).get('search') === 'Borrower 027'));
      const sidebarReads = f.requests.filter(r => r.path.endsWith('workbench-v2') && new URLSearchParams(r.query).get('pageSize') === '5');
      assert.ok(sidebarReads.every(r => !new URLSearchParams(r.query).has('search')), 'Sidebar counts stay unfiltered');
      f.expire();
      await f.page.type('input[placeholder="Search leads by name, ID, phone or email"]', ' changed');
      await f.page.waitForFunction(() => location.pathname === '/login' && !localStorage.getItem('paydayops.auth.user'));
      result.functionalChecks = ['pagination', 'search resets page', 'unfiltered sidebar counts', 'bearer and company headers', 'expired session redirects to login'];
    }
    assert.deepEqual(f.pageErrors, []);
    assert.deepEqual(f.unsafeRequests, []);
    return result;
  } finally { await f.context.close(); }
}
async function main() {
  const executablePath = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
  const browser = await puppeteer.launch({ executablePath, headless: true, args: [...(process.platform === 'win32' ? [] : ['--no-sandbox']), '--disable-background-networking'] });
  const dist = path.resolve(root, 'frontend/dist'), baseline = process.env.TELECALLER_BASELINE_DIST ? path.resolve(process.env.TELECALLER_BASELINE_DIST) : null;
  const results = [];
  try {
    for (let index = 0; index < (baseline ? 3 : 1); index++) {
      if (baseline) results.push({ build: 'baseline', ...await sample(browser, baseline, false) });
      results.push({ build: 'candidate', ...await sample(browser, dist, true, index === 0) });
    }
    const anonymous = await openFixture(browser, dist, { authenticated: false });
    try {
      await anonymous.page.goto(appOrigin + '/leads');
      await anonymous.page.waitForFunction(() => location.pathname === '/login');
      assert.ok(!anonymous.requests.some(r => r.path.startsWith('/api/leads/telecaller-')));
      assert.deepEqual(anonymous.pageErrors, []);
    } finally { await anonymous.context.close(); }
    const report = { telecallerBrowser: 'passed', scope: 'Controlled synthetic network: 100ms per asset, 250ms per API GET, 300ms per CORS preflight. Not live/user timing.',
      realCustomerRequests: false, anonymousGuardPassed: true, results };
    if (process.env.TELECALLER_BROWSER_REPORT) fs.writeFileSync(process.env.TELECALLER_BROWSER_REPORT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
}
module.exports = { openFixture, sample };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
