// Headless local fixture: real React/router, intercepted synthetic API only.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..').replaceAll('\\', '/');
const esbuild = require('../frontend/node_modules/esbuild'), puppeteer = require('../backend/node_modules/puppeteer-core');
async function main() {
  const source = `import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route}from'react-router-dom';import{SanctionDecision}from'${root}/frontend/src/app/pages/SanctionDecision.tsx';createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={[location.pathname+location.search]}><Routes><Route path='/sanction-decision/:token' element={<SanctionDecision/>}/></Routes></MemoryRouter>);`;
  const bundle = await esbuild.build({ stdin: { contents: source, loader: 'tsx', resolveDir: root + '/frontend' }, bundle: true, write: false, format: 'iife', jsx: 'automatic', logLevel: 'error' });
  const assets = root + '/frontend/dist/assets', css = fs.readFileSync(assets + '/' + fs.readdirSync(assets).find(file => /^index-.*\.css$/.test(file)));
  const server = http.createServer((req, res) => {
    if (req.url === '/app.js') { res.setHeader('content-type', 'application/javascript'); return res.end(bundle.outputFiles[0].contents); }
    if (req.url === '/style.css') { res.setHeader('content-type', 'text/css'); return res.end(css); }
    res.setHeader('content-type', 'text/html'); res.end('<!doctype html><html><head><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const executablePath = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
  let browser;
  const checks = [], failures = [], requests = [];
  let mode = 'pending', decision = 'pending';
  try {
    browser = await puppeteer.launch({ executablePath, headless: true, args: process.platform === 'win32' ? [] : ['--no-sandbox'] });
    const page = await browser.newPage(); await page.setViewport({ width: 390, height: 844 });
    await page.evaluateOnNewDocument(() => { window.__closed = 0; window.close = () => { window.__closed++; }; });
    page.on('pageerror', error => failures.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', async req => {
      const url = new URL(req.url());
      if (url.origin !== origin) return req.abort();
      if (!url.pathname.startsWith('/api/sanction-decision/')) return req.continue();
      requests.push({ method: req.method(), action: req.postData() ? JSON.parse(req.postData()).action : null, tenant: url.searchParams.get('tenant') });
      if ((mode === 'preview-fail' && req.method() === 'GET') || (mode === 'post-fail' && req.method() === 'POST')) {
        return req.respond({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Synthetic service unavailable' }) });
      }
      if (mode === 'network-fail' && req.method() === 'POST') return req.abort('failed');
      if (mode === 'superseded') return req.respond({ status: 409, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'This sanction has been replaced. Please use the latest link.' }) });
      let already = decision !== 'pending';
      if (req.method() === 'POST') { if (!already) decision = mode === 'competing-reject' ? 'rejected' : JSON.parse(req.postData()).action === 'accept' ? 'accepted' : 'rejected'; already = already || mode === 'competing-reject'; }
      return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, customerDecision: decision, pendingDecision: decision === 'pending', alreadyDecided: already, borrower: 'Synthetic Borrower', agreementNumber: 'SYN-BROWSER', principalAmount: 10000, disbursedAmount: 9000, repaymentAmount: 11000 }) });
    });
    const contains = text => page.waitForFunction(value => document.body.innerText.includes(value), {}, text);
    const click = async text => { assert.equal(await page.evaluate(value => { const button = [...document.querySelectorAll('button')].find(button => button.innerText.includes(value)); button?.click(); return Boolean(button); }, text), true); };
    const visit = () => page.goto(origin + '/sanction-decision/SYN-TOKEN?action=accept&tenant=geetpay');
    await visit(); await contains('Accept Sanction');
    assert.equal(requests.filter(req => req.method === 'POST').length, 0); assert.equal(requests[0].tenant, 'geetpay');
    checks.push('old emailed action link previews without saving; company query preserved');
    await page.evaluate(() => { const button = [...document.querySelectorAll('button')].find(button => button.innerText.includes('Accept Sanction')); button.click(); button.click(); });
    await contains('Decision Recorded Successfully');
    assert.equal(requests.filter(req => req.method === 'POST').length, 1); assert.equal(requests.find(req => req.method === 'POST').action, 'accept');
    checks.push('deliberate double click submits one POST and displays confirmed acceptance');
    mode = 'post-fail'; decision = 'pending'; await visit(); await contains('Accept Sanction'); await click('Accept Sanction'); await contains('Synthetic service unavailable');
    assert.ok(!await page.evaluate(() => document.body.innerText.includes('Decision Recorded Successfully')));
    await new Promise(resolve => setTimeout(resolve, 5100)); assert.equal(await page.evaluate(() => window.__closed), 0);
    checks.push('HTTP failure retains retry and never reports saved or closes the tab');
    mode = 'pending'; await click('Accept Sanction'); await contains('Decision Recorded Successfully');
    checks.push('retry after HTTP failure records the confirmed response');
    mode = 'network-fail'; decision = 'pending'; await visit(); await contains('Accept Sanction'); await click('Reject');
    await page.waitForFunction(() => Boolean(document.querySelector('[role="alert"]')));
    assert.ok(!await page.evaluate(() => document.body.innerText.includes('Loan Sanction Rejected')));
    checks.push('network failure shows an alert without claiming rejected/accepted');
    mode = 'preview-fail'; await visit(); await contains('Unable to Confirm Sanction');
    assert.ok(!await page.evaluate(() => document.body.innerText.includes('Response Recorded')));
    mode = 'pending'; await click('Check status / Retry'); await contains('Accept Sanction');
    checks.push('preview failure shows error; status retry safely reloads confirmation');
    mode = 'competing-reject'; await click('Accept Sanction'); await contains('REJECTED');
    assert.ok(!await page.evaluate(() => document.body.innerText.includes('[ACCEPTED]')));
    checks.push('a competing saved rejection wins over the requested acceptance in UI');
    mode = 'superseded'; await visit(); await contains('This sanction has been replaced');
    assert.ok(!await page.evaluate(() => [...document.querySelectorAll('button')].some(button => button.innerText.includes('Accept Sanction'))));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    checks.push('superseded link cannot offer a decision and mobile content fits');
    assert.deepEqual(failures, []);
    console.log(JSON.stringify({ sanctionBrowser: 'passed', checks, failures, realCustomerRequests: false }, null, 2));
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
