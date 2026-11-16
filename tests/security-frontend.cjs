const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const esbuild = require('../frontend/node_modules/esbuild');
const apiCode = esbuild.transformSync(fs.readFileSync(path.resolve(__dirname, '../frontend/src/app/lib/api.ts'), 'utf8').replaceAll('import.meta.env', JSON.stringify({ VITE_API_URL: 'https://crm-api.example.invalid/api', VITE_DOCUMENT_BASE_URL: 'https://crm-api.example.invalid/uploads' })), { loader: 'ts', format: 'cjs' }).code;
function fixture(fetch) {
  const storage = new Map([['paydayops.auth.user', JSON.stringify({ token: 'SYN-STAFF-SESSION', documentToken: 'SYN-DOCUMENT-TICKET', user: { name: 'Synthetic Staff', email: 'staff@example.invalid', role: 'collection' } })]]);
  const localStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  const pending = new Map();
  const sessionStorage = { getItem: key => pending.get(key), setItem: (key, value) => pending.set(key, value), removeItem: key => pending.delete(key) };
  const module = { exports: {} }, context = vm.createContext({ module, exports: module.exports, require: () => ({ getCachedLocation: () => null }), fetch, Blob, Response, URL, URLSearchParams, Event, AbortController, DOMException, setTimeout, clearTimeout, localStorage, sessionStorage, console });
  vm.runInContext(apiCode, context);
  context.window = { location: { hostname: 'crm.example.invalid', host: 'crm.example.invalid', origin: 'https://crm.example.invalid' }, dispatchEvent() {} };
  return { api: module.exports, localStorage, sessionStorage, window: context.window };
}
test('external document fetch never receives the CRM bearer token and valid PDF bytes retain preview compatibility', async () => {
  let options;
  const f = fixture(async (_, input) => { options = input; return new Response('%PDF-1.4\nSynthetic\n%%EOF', { headers: { 'content-type': 'application/octet-stream' } }); });
  const blob = await f.api.apiGetDocumentBlob('https://documents.example.invalid/statement.pdf');
  assert.equal(options.headers, undefined); assert.equal(options.credentials, 'omit'); assert.equal(blob.type, 'application/pdf');
});
test('HTML or SVG disguised as an external statement cannot become an executable same-origin blob', async () => {
  for (const body of ['<html><script>synthetic()</script></html>', '<svg onload="synthetic()"></svg>']) {
    const f = fixture(async () => new Response(body, { headers: { 'content-type': 'application/pdf' } })); await assert.rejects(f.api.apiGetDocumentBlob('https://documents.example.invalid/statement.pdf'), /supported PDF/);
  }
});
test('only trusted document origins receive a separate document ticket in a URL', () => {
  const f = fixture(); const local = f.api.resolveBackendUploadUrl('/uploads/synthetic.pdf');
  assert.ok(local.includes('SYN-DOCUMENT-TICKET')); assert.ok(!local.includes('SYN-STAFF-SESSION'));
  assert.equal(f.api.resolveBackendUploadUrl('https://external.example.invalid/uploads/synthetic.pdf'), 'https://external.example.invalid/uploads/synthetic.pdf');
});
test('a late API response is rejected after the active session changes', async () => {
  let release;
  const f = fixture(() => new Promise(resolve => { release = resolve; }));
  const pending = f.api.apiGet('/leads'); f.localStorage.setItem('paydayops.auth.user', JSON.stringify({ token: 'SYN-OTHER-SESSION' }));
  release(new Response(JSON.stringify({ success: true, data: [{ name: 'Previous Customer' }] }), { headers: { 'content-type': 'application/json' } }));
  await assert.rejects(pending, /Session changed/);
});
test('a late PDF download is rejected after logout instead of populating another session cache', async () => {
  let release;
  const f = fixture(() => new Promise(resolve => { release = resolve; }));
  const pending = f.api.apiGetBlob('/uploads/synthetic.pdf'); f.localStorage.removeItem('paydayops.auth.user');
  release(new Response('%PDF-1.4\nSynthetic\n%%EOF')); await assert.rejects(pending, /Session changed/);
});

test('an old request returning 401 cannot log out a newer staff session', async () => {
  let release;
  const f = fixture(() => new Promise(resolve => { release = resolve; }));
  const pending = f.api.apiPost('/leads/synthetic/activity', {});
  f.localStorage.setItem('paydayops.auth.user', JSON.stringify({ token: 'SYN-NEW-SESSION' }));
  release(new Response(JSON.stringify({ success: false, message: 'Expired' }), { status: 401 }));
  await assert.rejects(pending, /Session changed/);
  assert.equal(JSON.parse(f.localStorage.getItem('paydayops.auth.user')).token, 'SYN-NEW-SESSION');
});

test('external document and incorrect login responses do not discard the current session', async () => {
  const f = fixture(async () => new Response(JSON.stringify({ success: false, message: 'Denied' }), { status: 401 }));
  await assert.rejects(f.api.apiGetDocumentBlob('https://documents.example.invalid/synthetic.pdf'));
  assert.ok(f.localStorage.getItem('paydayops.auth.user'));
  await assert.rejects(f.api.apiPost('/auth/login', {}), /Denied/);
  assert.ok(f.localStorage.getItem('paydayops.auth.user'));
});

test('central-host login uses email discovery, OTP uses its returned company and authenticated requests retain that company', async () => {
  const calls = [];
  const f = fixture(async (url, options) => { calls.push({ url, headers: options.headers }); return new Response(JSON.stringify({ success: true, data: {} })); });
  Object.assign(f.window.location, { hostname: 'payday.waqtmoney.com', host: 'payday.waqtmoney.com', origin: 'https://payday.waqtmoney.com' });
  await f.api.apiPost('/auth/login', {});
  assert.equal(calls.at(-1).headers.Authorization, undefined); assert.equal(calls.at(-1).headers['X-Tenant-Slug'], undefined);
  f.sessionStorage.setItem('paydayops.auth.pendingTenant', 'geetpay');
  await f.api.apiPost('/auth/verify-otp', {});
  assert.equal(calls.at(-1).headers['X-Tenant-Slug'], 'geetpay'); assert.equal(calls.at(-1).headers.Authorization, undefined);
  f.localStorage.setItem('paydayops.auth.user', JSON.stringify({ token: 'SYN-GEET-SESSION', documentToken: 'SYN-GEET-DOC', user: { role: 'product-admin', tenant: 'geetpay' } }));
  await f.api.apiGet('/superadmin/users?tenantSlug=geetpay');
  assert.equal(calls.at(-1).headers['X-Tenant-Slug'], 'geetpay'); assert.equal(calls.at(-1).headers.Authorization, 'Bearer SYN-GEET-SESSION');
  assert.equal(new URL(f.api.resolveBackendUploadUrl('/uploads/synthetic.pdf')).searchParams.get('tenant'), 'geetpay');
});
