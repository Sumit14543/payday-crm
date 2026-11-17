// All browser traffic is synthetic. No production credentials/data or writes.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const puppeteer = require('../backend/node_modules/puppeteer-core');
const { openFixture } = require('./telecaller-initial-browser.cjs');
const root = path.resolve(__dirname, '..'), origin = 'https://payday.waqtmoney.com';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const hasRow = (page, number, timeout = 30000) => page.waitForFunction(value => document.body.innerText.includes('Fixture Borrower ' + value), { timeout }, String(number).padStart(3, '0'));
const clickNext = page => page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Next').click());
const leadReads = f => f.requests.filter(r => r.path.startsWith('/api/leads/telecaller-') && r.method === 'GET');
const clearInput = async (page, selector) => { await page.focus(selector); await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control'); await page.keyboard.press('Backspace'); };
const submit = page => page.evaluate(() => document.querySelector('form').requestSubmit());
function assertClean(f) { assert.deepEqual(f.pageErrors, []); assert.deepEqual(f.unsafeRequests, []); }
async function otp(browser, dist, expectedPreload, failCodePrefetch = false) {
  const f = await openFixture(browser, dist, { authenticated: false, loginFlow: true, failCodePrefetch });
  try {
    await f.page.goto(origin + '/login', { waitUntil: 'domcontentloaded' });
    await f.page.waitForSelector('input[type="password"]');
    await f.page.type('input[type="password"]', 'dummy-test-input');
    await f.page.waitForFunction(() => !document.querySelector('button[type="submit"]').disabled);
    await submit(f.page);
    await f.page.waitForSelector('input[placeholder="123456"]');
    await delay(350); // Same brief synthetic OTP-entry wait for old and new builds.
    const prepared = f.requests.filter(r => /^\/assets\/(Layout|Leads)-.*\.js$/.test(r.path));
    if (expectedPreload) assert.ok(prepared.some(r => r.path.includes('/Layout-')) && prepared.some(r => r.path.includes('/Leads-')));
    else assert.equal(prepared.length, 0);
    assert.equal(leadReads(f).length, 0, 'Static preloading must never read lead data before OTP');
    assert.equal(await f.page.evaluate(() => localStorage.getItem('paydayops.auth.user')), null);
    await f.page.type('input[placeholder="123456"]', '000000'); await submit(f.page);
    await f.page.waitForFunction(() => document.body.innerText.includes('Synthetic invalid OTP'));
    assert.equal(leadReads(f).length, 0, 'Invalid OTP must not start lead reads');
    assert.equal(await f.page.evaluate(() => localStorage.getItem('paydayops.auth.user')), null);
    await clearInput(f.page, 'input[placeholder="123456"]'); await f.page.type('input[placeholder="123456"]', '123456');
    assert.equal(await f.page.$eval('input[placeholder="123456"]', input => input.value), '123456');
    await f.page.waitForFunction(() => !document.querySelector('button[type="submit"]').disabled);
    const start = Date.now(); await submit(f.page); await hasRow(f.page, 1);
    const end = Date.now(), verification = f.requests.filter(r => r.path.endsWith('/verify-otp') && r.method === 'POST').at(-1);
    const result = { otpSubmitToRowsMs: end - start, otpResponseToRowsMs: end - verification.end,
      preloadedCodeChunks: prepared.length, protectedReadsBeforeOtp: 0, protectedReadsAfterOtp: leadReads(f).length };
    if (!failCodePrefetch) assert.equal(leadReads(f).length, 3, 'Request/assignment trigger count must remain unchanged');
    else {
      assert.ok(f.requests.some(r => /^\/assets\/Leads-/.test(r.path) && r.failed), 'Failed speculative code load must be exercised');
      assert.equal(f.requests.filter(r => r.path.endsWith('/verify-otp') && r.method === 'POST').length, 2, 'Existing lazy retry must not resubmit OTP');
    }
    assertClean(f); return result;
  } catch (error) {
    console.log(JSON.stringify({ fixtureStage: 'OTP', page: await f.page.evaluate(() => ({ path: location.pathname, text: document.body.innerText.slice(-700), stored: Boolean(localStorage.getItem('paydayops.auth.user')) })), pageErrors: f.pageErrors, requests: f.requests.filter(r => r.path.startsWith('/api/')).map(r => ({ path: r.path, method: r.method, failed: Boolean(r.failed) })) }));
    throw error;
  } finally { await f.context.close(); }
}
async function pagination(browser, dist, { fail = false, abort = false, slow = false, retryNext = false } = {}) {
  let release, seen, faultSent = false;
  const gate = new Promise(resolve => { release = resolve; }), seenRead = new Promise(resolve => { seen = resolve; });
  const f = await openFixture(browser, dist, { apiDelayMs: 20, workbenchReply: async url => {
    if (url.searchParams.get('page') !== '2' || faultSent) return null;
    seen(); await gate; faultSent = true;
    return abort ? { abort: true } : fail ? { status: 503, message: 'Synthetic page failure' } : null;
  } });
  try {
    await f.page.goto(origin + '/leads'); await hasRow(f.page, 1);
    // Freeze only the old artificial 300ms transition clock. A correct loader
    // must finish on its response without needing that timer to advance.
    await f.page.evaluate(() => {
      window.__transitionTimers = [];
      const original = window.setTimeout.bind(window);
      window.setTimeout = (fn, ms, ...args) => ms === 300 ? (window.__transitionTimers.push(() => fn(...args)), -1) : original(fn, ms, ...args);
    });
    const start = Date.now(); await clickNext(f.page); await seenRead;
    if (slow) await delay(400);
    const pending = await f.page.evaluate(() => ({ oldRow: document.querySelector('table tbody').innerText.includes('Fixture Borrower 001'), nextDisabled: [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Next').disabled }));
    assert.equal(pending.oldRow, false); assert.equal(pending.nextDisabled, true);
    release();
    if (fail || abort) {
      await f.page.waitForFunction(text => document.body.innerText.includes(text), {}, fail ? 'Synthetic page failure' : 'Failed to fetch');
      assert.ok(!await f.page.evaluate(() => document.body.innerText.includes('Fixture Borrower 011')));
      await f.page.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Refresh').disabled);
      if (retryNext) await clickNext(f.page);
      else await f.page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Refresh').click());
    }
    await hasRow(f.page, 11, retryNext ? 10000 : 30000);
    assert.equal(await f.page.evaluate(() => window.__transitionTimers.length), 0, 'Page completion must not depend on a fixed delay');
    assertClean(f);
    return { mode: retryNext ? 'failed-page-retry-with-Next' : abort ? 'network-failure-and-retry' : fail ? 'HTTP-failure-and-retry' : slow ? 'slow-response' : 'fast-response', completed: true, clickToRowsMs: Date.now() - start };
  } finally { release(); await f.context.close(); }
}
async function cancelledPage(browser, dist) {
  let release, seen; const gate = new Promise(resolve => { release = resolve; }), seenRead = new Promise(resolve => { seen = resolve; });
  const f = await openFixture(browser, dist, { apiDelayMs: 20, workbenchReply: async url => { if (url.searchParams.get('page') === '2') { seen(); await gate; } } });
  try {
    await f.page.goto(origin + '/leads'); await hasRow(f.page, 1);
    await clickNext(f.page); await seenRead;
    await f.page.evaluate(() => history.back());
    await f.page.waitForFunction(() => !new URLSearchParams(location.search).has('page'));
    await hasRow(f.page, 1); release(); await delay(100);
    assert.ok(!await f.page.evaluate(() => document.body.innerText.includes('Fixture Borrower 011')));
    assert.ok(f.requests.some(r => new URLSearchParams(r.query).get('page') === '2' && r.failed), 'Obsolete page request must be aborted');
    assertClean(f); return { obsoletePageDiscarded: true, historyRestored: true };
  } finally { release(); await f.context.close(); }
}
async function menuIntent(browser, dist) {
  const f = await openFixture(browser, dist);
  try {
    const sidebarResponse = f.page.waitForResponse(response => response.url().includes('pageSize=5') && response.status() === 200);
    await f.page.goto(origin + '/unauthorized'); await f.page.waitForSelector('a[href="/leads"]');
    await sidebarResponse;
    const count = leadReads(f).length;
    await f.page.hover('a[href="/leads"]');
    await f.page.waitForFunction(() => performance.getEntriesByType('resource').some(r => /\/assets\/Leads-.*\.js$/.test(r.name)));
    await f.page.focus('a[href="/leads"]');
    assert.equal(leadReads(f).length, count, 'Hover/focus must never trigger a customer GET or assignment');
    await f.page.click('a[href="/leads"]'); await hasRow(f.page, 1);
    assert.equal(leadReads(f).length, count + 2, 'Existing mounted Layout counts remain shared across navigation');
    assertClean(f); return { codePreparedOnIntent: true, dataReadsOnIntent: 0 };
  } finally { await f.context.close(); }
}
async function otherRoleOtp(browser, dist) {
  const f = await openFixture(browser, dist, { authenticated: false, loginFlow: true });
  try {
    await f.page.goto(origin + '/login'); await f.page.waitForSelector('input[type="password"]');
    await f.page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Telecaller').click());
    await f.page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Product Admin').click());
    await f.page.type('input[type="email"]', 'admin@example.invalid');
    await f.page.type('input[type="password"]', 'dummy-test-input');
    await f.page.waitForFunction(() => !document.querySelector('button[type="submit"]').disabled); await submit(f.page);
    await f.page.waitForSelector('input[placeholder="123456"]'); await delay(350);
    assert.equal(f.requests.filter(r => /^\/assets\/(Layout|Leads)-.*\.js$/.test(r.path)).length, 0);
    assert.equal(leadReads(f).length, 0); assertClean(f);
    return { otherRolePreload: false, customerReads: 0 };
  } finally { await f.context.close(); }
}
async function main() {
  const executablePath = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
  const browser = await puppeteer.launch({ executablePath, headless: true, args: [...(process.platform === 'win32' ? [] : ['--no-sandbox']), '--disable-background-networking'] });
  const dist = path.join(root, 'frontend/dist'), baseline = process.env.TELECALLER_PHASE2_BASELINE ? path.resolve(process.env.TELECALLER_PHASE2_BASELINE) : null;
  try {
    const timings = [];
    for (let run = 1; run <= (baseline ? 3 : 1); run++) {
      if (baseline) timings.push({ build: 'baseline', run, ...await otp(browser, baseline, false) });
      timings.push({ build: 'candidate', run, ...await otp(browser, dist, true) });
    }
    const transitions = [];
    for (const scenario of [{}, { slow: true }, { fail: true }, { abort: true }, { fail: true, retryNext: true }]) transitions.push(await pagination(browser, dist, scenario));
    const result = { telecallerLoadingBrowser: 'passed', scope: 'Synthetic browser fixtures, not live employee timing', timings, transitions,
      cancellation: await cancelledPage(browser, dist), menuIntent: await menuIntent(browser, dist),
      failedPreload: await otp(browser, dist, true, true), otherRole: await otherRoleOtp(browser, dist), realCredentialsUsed: false, realCustomerRequests: false };
    if (process.env.TELECALLER_PHASE2_REPORT) fs.writeFileSync(process.env.TELECALLER_PHASE2_REPORT, JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
