// Production frontend bundle in Chrome with entirely synthetic, intercepted traffic.
// No live API, real credential, customer data or write request is used.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const puppeteer = require('../backend/node_modules/puppeteer-core');

const root = path.resolve(__dirname, '..');
const appOrigin = 'https://payday.waqtmoney.com';
const apiOrigin = 'https://payday-api.waqtmoney.com';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const apiPayloads = {
  '/api/leads': [{ id: 'SYN-REPORT-1', name: 'Synthetic Report Borrower', phone: '', source: 'Synthetic', status: 'New', priority: 'Low', assignedTo: 'Synthetic Agent', loanAmount: 1000, createdDate: '2026-11-17' }],
  '/api/leads/reports/reloans': [],
  '/api/leads/telecaller-sla-report': { generatedAt: '2026-11-17T00:00:00Z', period: 'last6months', summary: {}, byOwner: [], byReason: {}, breachedLeads: [] },
  '/api/dashboard/accountant': { actionQueue: {}, metrics: {}, recentTransfers: [] },
  '/api/accounts/reports/interest': { reports: { accruedInterest: [], accruedVsCollected: [], bookedVsReceived: [], customerMonthWise: [], dayWise: [], interestRealization: [], interestReceivable: [], monthWise: [] }, summary: {} },
  '/api/collections': [],
  '/api/collections/reports': { paymentTrend: [], recentPayments: [], ptpSummary: {}, summary: {} },
  '/api/dashboard/audit-logs': [],
  '/api/loans': [],
};

async function openPage(browser, route, { slowUnrelated = false } = {}) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const requests = [];
  const pageErrors = [];
  await page.evaluateOnNewDocument(() => localStorage.setItem('paydayops.auth.user', JSON.stringify({
    token: 'SYN-REPORT-SESSION',
    user: { name: 'Synthetic Product Admin', email: 'product-admin@example.invalid', role: 'product-admin', tenant: 'synthetic-company' },
  })));
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', async (request) => {
    try {
      const url = new URL(request.url());
      if (![appOrigin, apiOrigin].includes(url.origin)) return request.abort();
      if (url.pathname.startsWith('/api/')) {
        const cors = {
          'access-control-allow-origin': appOrigin,
          'access-control-allow-methods': 'GET, OPTIONS',
          'access-control-allow-headers': request.headers()['access-control-request-headers'] || 'authorization,x-tenant-slug',
          'cache-control': 'private, no-store',
        };
        if (request.method() === 'OPTIONS') return request.respond({ status: 204, headers: cors });
        if (request.method() !== 'GET') return request.abort();
        requests.push({ path: url.pathname, at: Date.now() });
        assert.equal(request.headers().authorization, 'Bearer SYN-REPORT-SESSION');
        assert.equal(request.headers()['x-tenant-slug'], 'synthetic-company');
        const isFastCardSource = ['/api/leads', '/api/leads/reports/reloans'].includes(url.pathname);
        await pause(slowUnrelated && !isFastCardSource ? 1400 : 120);
        const data = Object.prototype.hasOwnProperty.call(apiPayloads, url.pathname) ? apiPayloads[url.pathname] : {};
        return request.respond({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify({ success: true, data }) });
      }
      if (request.method() !== 'GET') return request.abort();
      if (url.pathname.startsWith('/assets/')) {
        const file = path.resolve(root, 'frontend/dist', '.' + url.pathname);
        assert.ok(file.startsWith(path.resolve(root, 'frontend/dist') + path.sep) && fs.existsSync(file));
        return request.respond({ status: 200, contentType: url.pathname.endsWith('.css') ? 'text/css' : 'application/javascript', body: fs.readFileSync(file) });
      }
      return request.respond({ status: 200, contentType: 'text/html', body: fs.readFileSync(path.join(root, 'frontend/dist/index.html')) });
    } catch (error) {
      pageErrors.push(error.message);
      if (!request.isInterceptResolutionHandled()) await request.abort();
    }
  });
  await page.goto(appOrigin + route, { waitUntil: 'domcontentloaded' });
  return { context, page, requests, pageErrors };
}

async function verifySingleReport(browser, type, expectedPaths, expectedTitle) {
  const fixture = await openPage(browser, `/reports?type=${type}`);
  try {
    await fixture.page.waitForFunction((title) => {
      const workspace = document.querySelector('.reports-workspace[aria-busy="false"]');
      return workspace?.querySelector('h1')?.textContent?.trim() === title;
    }, {}, expectedTitle);
    await pause(100);
    assert.deepEqual([...new Set(fixture.requests.map((item) => item.path))].sort(), [...expectedPaths].sort());
    assert.deepEqual(fixture.pageErrors, []);
  } finally {
    await fixture.context.close();
  }
}

async function main() {
  const executablePath = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
  const browser = await puppeteer.launch({ executablePath, headless: true, args: [...(process.platform === 'win32' ? [] : ['--no-sandbox']), '--disable-background-networking'] });
  try {
    await verifySingleReport(browser, 'lead-report', ['/api/leads'], 'Lead Report');
    await verifySingleReport(browser, 'payment-report', ['/api/leads', '/api/collections/reports'], 'Payment Report');
    await verifySingleReport(browser, 'audit-log-report', ['/api/leads', '/api/dashboard/audit-logs'], 'Audit Log Report');

    const overview = await openPage(browser, '/reports', { slowUnrelated: true });
    try {
      const startedAt = Date.now();
      await overview.page.waitForFunction(() => document.querySelector('[role="group"][aria-label="Total Leads"] .reports-metric__value')?.textContent?.trim() === '1');
      const cardsReadyMs = Date.now() - startedAt;
      assert.ok(cardsReadyMs < 1000, `Overview lead cards waited for unrelated reports: ${cardsReadyMs}ms`);
      assert.ok(overview.requests.some((item) => item.path === '/api/leads'));
      assert.ok(overview.requests.some((item) => item.path === '/api/leads/reports/reloans'));
      await pause(1600);
      const beforePeriodChange = overview.requests.length;
      const periodStartedAt = Date.now();
      await overview.page.click('button[aria-label="Select report period"]');
      await overview.page.waitForSelector('[role="option"]');
      await overview.page.evaluate(() => [...document.querySelectorAll('[role="option"]')].find((option) => option.textContent?.trim() === 'All Time')?.click());
      await overview.page.waitForFunction(() => document.querySelector('button[aria-label="Select report period"]')?.textContent?.includes('All Time'));
      const allTimeSelectionMs = Date.now() - periodStartedAt;
      await overview.page.waitForFunction((count) => performance.getEntriesByType('resource').length >= count, {}, 0);
      await pause(200);
      const periodRequests = overview.requests.slice(beforePeriodChange).map((item) => item.path);
      assert.deepEqual([...new Set(periodRequests)], ['/api/leads/telecaller-sla-report']);
      assert.deepEqual(overview.pageErrors, []);
      console.log(JSON.stringify({ productAdminReportsBrowser: 'passed', singleReportApiCounts: { lead: 1, payment: 1, audit: 1 }, overviewCardsReadyMs: cardsReadyMs, allTimeSelectionMs, allTimeHeavyReloads: 0, periodRefreshPaths: [...new Set(periodRequests)], syntheticTrafficOnly: true }, null, 2));
    } finally {
      await overview.context.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
