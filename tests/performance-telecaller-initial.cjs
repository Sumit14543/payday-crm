const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const esbuild = require('../frontend/node_modules/esbuild');
const source = fs.readFileSync(path.resolve(__dirname, '../frontend/src/app/lib/api.ts'), 'utf8');
function fixture(fetch, { origin = 'https://payday.waqtmoney.com', base = 'https://payday-api.waqtmoney.com/api' } = {}) {
  const storage = new Map([['paydayops.auth.user', JSON.stringify({ token: 'SYN-SESSION-A', user: { role: 'telecaller', tenant: 'synthetic-company' } })]]);
  const localStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  const module = { exports: {} }, events = [];
  const context = vm.createContext({ module, exports: module.exports, require: () => ({ getCachedLocation: () => null }),
    fetch, Response, URL, URLSearchParams, Event, AbortController, DOMException, setTimeout, clearTimeout, localStorage,
    sessionStorage: { getItem: () => null }, console });
  const code = esbuild.transformSync(source.replaceAll('import.meta.env', JSON.stringify({ VITE_API_URL: base, VITE_FORCE_DIRECT_API: 'true' })), { loader: 'ts', format: 'cjs' }).code;
  vm.runInContext(code, context);
  const url = new URL(origin);
  context.window = { location: { origin, hostname: url.hostname, host: url.host }, dispatchEvent: event => events.push(event.type) };
  return { api: module.exports, localStorage, events };
}
const ok = () => new Response(JSON.stringify({ success: true, data: { items: [] } }));
test('opted-in telecaller reads use only the verified proxy and retain bearer, company, query and cancellation signal', async () => {
  const calls = [], f = fixture(async (url, options) => { calls.push({ url, options }); return ok(); });
  for (const pathname of ['/leads/telecaller-workbench-v2?page=2&pageSize=10&search=sample', '/leads/telecaller-policy']) {
    await f.api.apiGet(pathname, undefined, { preferSameOrigin: true });
    const call = calls.at(-1);
    assert.ok(call.url.startsWith('/api' + pathname));
    assert.equal(call.options.headers.Authorization, 'Bearer SYN-SESSION-A');
    assert.equal(call.options.headers['X-Tenant-Slug'], 'synthetic-company');
    assert.equal(call.options.cache, 'no-store', 'Customer reads must not persist in the browser HTTP cache');
    assert.ok(call.options.signal instanceof AbortSignal);
  }
});
test('default reads, unrelated endpoints, lookalike paths and writes keep the existing direct API', async () => {
  const calls = [], f = fixture(async url => { calls.push(url); return ok(); });
  await f.api.apiGet('/leads/telecaller-policy');
  for (const pathname of ['/leads', '/leads/telecaller-policy-extra', '/leads/telecaller-workbench-v2/delete', '//outside.invalid/leads/telecaller-policy']) {
    await f.api.apiGet(pathname, undefined, { preferSameOrigin: true });
  }
  await f.api.apiPost('/leads/synthetic/activity', { disposition: 'Connected' });
  assert.ok(calls.every(url => url.startsWith('https://payday-api.waqtmoney.com/api')));
});
test('custom/staging/HTTP/lookalike hosts and alternate configured APIs never switch to the managed proxy', async () => {
  for (const options of [{ origin: 'https://another.example.invalid' }, { origin: 'http://payday.waqtmoney.com' },
    { origin: 'https://payday.waqtmoney.com.other.invalid' }, { origin: 'https://testing.waqtmoney.com' },
    { base: 'https://alternate-api.example.invalid/api' }]) {
    let actual;
    const f = fixture(async url => { actual = url; return ok(); }, options);
    await f.api.apiGet('/leads/telecaller-policy', undefined, { preferSameOrigin: true });
    assert.ok(actual.startsWith(options.base || 'https://payday-api.waqtmoney.com/api'));
  }
});
test('a current-session proxy 401 still requires login', async () => {
  const f = fixture(async () => new Response(JSON.stringify({ success: false, message: 'Expired' }), { status: 401 }));
  await assert.rejects(f.api.apiGet('/leads/telecaller-policy', undefined, { preferSameOrigin: true }), /Expired/);
  assert.equal(f.localStorage.getItem('paydayops.auth.user'), undefined);
  assert.deepEqual(f.events, ['paydayops:auth-required']);
});
test('late proxy success and 401 cannot expose the old response or log out a newer company session', async () => {
  for (const status of [200, 401]) {
    let release;
    const f = fixture(() => new Promise(resolve => { release = resolve; }));
    const pending = f.api.apiGet('/leads/telecaller-policy', undefined, { preferSameOrigin: true });
    f.localStorage.setItem('paydayops.auth.user', JSON.stringify({ token: 'SYN-SESSION-B', user: { tenant: 'other-company' } }));
    release(new Response(JSON.stringify({ success: status === 200, data: { customer: 'old-session' } }), { status }));
    await assert.rejects(pending, /Session changed/);
    assert.equal(JSON.parse(f.localStorage.getItem('paydayops.auth.user')).token, 'SYN-SESSION-B');
    assert.deepEqual(f.events, []);
  }
});
test('proxy reads retain caller abort and bounded timeout behavior', async () => {
  const f = fixture(async () => new Promise(() => {}));
  const controller = new AbortController();
  const pending = f.api.apiGet('/leads/telecaller-policy', controller.signal, { preferSameOrigin: true });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  await assert.rejects(f.api.apiGet('/leads/telecaller-policy', undefined, { preferSameOrigin: true, timeoutMs: 10 }), { name: 'TimeoutError' });
});
