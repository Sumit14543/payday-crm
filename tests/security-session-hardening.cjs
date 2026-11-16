const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');
const secret = 'synthetic-only-security-test-secret-with-48-characters';
function load(file, overrides = {}, env = {}) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), {
    module, exports: module.exports, Buffer, URL, Date, console,
    process: { env: { NODE_ENV: 'production', AUTH_TOKEN_SECRET: secret, ...env } },
    require(name) {
      if (Object.hasOwn(overrides, name)) return overrides[name];
      if (name === 'crypto') return crypto;
      throw new Error('Unmocked dependency: ' + name);
    },
  }, { filename: file });
  return module.exports;
}
function fixture() {
  const storage = new AsyncLocalStorage(), pools = { a: {}, b: {} };
  const states = new Map();
  function state(key) {
    if (!states.has(key)) states.set(key, { sessions: new Map(), challenges: new Map(), user: { id: 1, email: 'staff@example.invalid', name: 'Synthetic Staff', role: key === 'master' ? 'superadmin' : 'accountant', password_salt: 'synthetic-salt', password_hash: 'synthetic-hash', is_active: true } });
    return states.get(key);
  }
  const traces = [];
  async function execute(master, sql, params = []) {
    const q = sql.replace(/\s+/g, ' ').trim(), db = state(master ? 'master' : storage.getStore()?.pool);
    traces.push({ q, params: Array.from(params) });
    if (q.startsWith('CREATE TABLE')) return {};
    if (q.includes('FROM crm_users') || q.includes('FROM superadmins')) {
      return db.user.is_active && String(params[0]) === String(db.user.id) && (!params[1] || params[1] === db.user.email) && (!params[2] || params[2] === db.user.role) ? [{ ...db.user }] : [];
    }
    if (q.startsWith('INSERT INTO auth_sessions')) {
      db.sessions.set(params[0], { user_id: params[1], role: params[2], tenant_slug: params[3], credential_hash: params[4], expires_at: new Date(Date.now() + params[5] * 1000) }); return { affectedRows: 1 };
    }
    if (q.includes('FROM auth_sessions')) {
      const row = db.sessions.get(params[0]);
      return row && row.user_id === params[1] && row.role === params[2] && row.tenant_slug === params[3] && !row.revoked && row.expires_at > new Date() ? [row] : [];
    }
    if (q.startsWith('UPDATE auth_sessions')) { const row = db.sessions.get(params[0]); if (row) row.revoked = true; return { affectedRows: row ? 1 : 0 }; }
    if (q.startsWith('INSERT INTO auth_challenges')) {
      db.challenges.set(params[0], { id: params[0], user_id: params[1], role: params[2], tenant_slug: params[3], otp_hash: params[4], credential_hash: params[5], expires_at: new Date(Date.now() + params[6] * 1000), attempts: 0, resend_count: 0, last_sent_at: Date.now() }); return { affectedRows: 1 };
    }
    if (q.startsWith('SELECT') && q.includes('FROM auth_challenges')) {
      const row = db.challenges.get(params[0]);
      if (q.startsWith('SELECT id')) return row ? [{ id: row.id }] : [];
      return row && !row.consumed && row.expires_at > new Date() && row.attempts < 3 ? [{ ...row }] : [];
    }
    if (q.startsWith('UPDATE auth_challenges SET otp_hash')) {
      const row = db.challenges.get(params[2]);
      if (!row || row.consumed || row.attempts >= 3 || row.resend_count >= 2 || row.last_sent_at > Date.now() - 60000) return { affectedRows: 0 };
      row.otp_hash = params[0]; row.expires_at = new Date(Date.now() + params[1] * 1000); row.resend_count++; row.last_sent_at = Date.now(); return { affectedRows: 1 };
    }
    if (q.startsWith('UPDATE auth_challenges') && q.includes('WHERE user_id')) {
      for (const row of db.challenges.values()) if (row.user_id === params[0] && row.role === params[1]) row.consumed = true;
      return { affectedRows: 1 };
    }
    if (q.startsWith('UPDATE auth_challenges')) {
      const row = db.challenges.get(params[0]);
      if (!row || row.consumed) return { affectedRows: 0 };
      if (q.includes('otp_hash = ?')) {
        assert.match(q, /consumed_at IS NULL AND expires_at > NOW\(\) AND attempts < 3/);
        if (row.otp_hash !== params[1] || row.expires_at <= new Date() || row.attempts >= 3) return { affectedRows: 0 };
        row.consumed = true;
      } else if (q.includes('attempts = attempts + 1')) { row.attempts++; if (row.attempts >= 3) row.consumed = true; }
      else row.consumed = true;
      return { affectedRows: 1 };
    }
    throw new Error('Unexpected query: ' + q);
  }
  const db = { tenantLocalStorage: storage, query: (sql, params) => execute(false, sql, params), queryMaster: (sql, params) => execute(true, sql, params) };
  const sessions = load('backend/services/authSessions.js', { '../config/db': db });
  const auth = load('backend/middleware/auth.js', { '../config/env': {}, '../config/db': db, '../models/crmUserModel': {}, '../services/authSessions': sessions });
  return { sessions, auth, traces, state, pools, run: (scope, fn) => storage.run({ pool: pools[scope], tenant: { slug: scope } }, fn) };
}
const identity = { id: 1, email: 'staff@example.invalid', name: 'Synthetic Staff', role: 'accountant' };

test('normal staff session keeps identity, remains company-bound and rejects old token formats', async () => {
  const f = fixture();
  const token = await f.run('a', () => f.auth.createToken(identity));
  const claims = f.auth.verifyToken(token);
  assert.equal(claims.tenant, 'a'); assert.equal(claims.email, identity.email);
  assert.equal((await f.run('a', () => f.sessions.verifySession(claims))).role, 'accountant');
  assert.equal(await f.run('b', () => f.sessions.verifySession(claims)), null);
  const encoded = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const old = encoded({ alg: 'HS256', typ: 'JWT' }) + '.' + encoded({ ...identity, exp: Date.now() + 60000 });
  const oldToken = old + '.' + crypto.createHmac('sha256', secret).update(old).digest('base64url');
  assert.equal(f.auth.verifyToken(oldToken), null);
});

for (const change of ['disable', 'password', 'role', 'logout']) test(`${change} invalidates an existing session immediately`, async () => {
  const f = fixture(), token = await f.run('a', () => f.auth.createToken(identity)), claims = f.auth.verifyToken(token);
  const row = f.state(f.pools.a).user;
  if (change === 'disable') row.is_active = false;
  if (change === 'password') row.password_hash = 'changed';
  if (change === 'role') row.role = 'collection';
  if (change === 'logout') await f.run('a', () => f.sessions.revokeSession(claims));
  assert.equal(await f.run('a', () => f.sessions.verifySession(claims)), null);
});

test('OTP is stored hashed, consumed once across concurrent requests, and cannot cross tenant boundaries', async () => {
  const f = fixture(), token = 'a'.repeat(64);
  await f.run('a', () => f.sessions.saveChallenge(identity, '739182', token, new Date(Date.now() + 60000)));
  assert.ok(!JSON.stringify([...f.state(f.pools.a).challenges.values()]).includes('739182'));
  assert.equal(await f.run('b', () => f.sessions.findChallenge(token)), null);
  const results = await f.run('a', () => Promise.allSettled([f.sessions.consumeChallenge(token, '739182'), f.sessions.consumeChallenge(token, '739182')]));
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(results.filter(x => x.status === 'rejected').length, 1);
});

test('three incorrect OTP attempts terminate the challenge and resend cannot immediately reset the budget', async () => {
  const f = fixture(), token = 'b'.repeat(64);
  await f.run('a', () => f.sessions.saveChallenge(identity, '739182', token, new Date(Date.now() + 60000)));
  await assert.rejects(f.run('a', () => f.sessions.saveChallenge(identity, '998811', token, new Date(Date.now() + 60000))), error => error.statusCode === 429);
  for (let i = 0; i < 3; i++) await assert.rejects(f.run('a', () => f.sessions.consumeChallenge(token, '000000')));
  await assert.rejects(f.run('a', () => f.sessions.consumeChallenge(token, '739182')));
});

for (const change of ['disable', 'password', 'role']) test(`OTP cannot authenticate after ${change}`, async () => {
  const f = fixture(), token = 'c'.repeat(64);
  await f.run('a', () => f.sessions.saveChallenge(identity, '739182', token, new Date(Date.now() + 60000)));
  const row = f.state(f.pools.a).user;
  if (change === 'disable') row.is_active = false;
  if (change === 'password') row.password_hash = 'changed';
  if (change === 'role') row.role = 'collection';
  await assert.rejects(f.run('a', () => f.sessions.consumeChallenge(token, '739182')));
});

test('platform session requires an active master identity and company admin cannot pass platform-only gate', async () => {
  const f = fixture();
  const token = await f.run('a', () => f.auth.createToken({ ...identity, role: 'superadmin', isMasterSuperadmin: true }));
  const claims = f.auth.verifyToken(token);
  assert.equal(claims.tenant, 'platform');
  assert.ok(await f.run('b', () => f.sessions.verifySession(claims)));
  let allowed = false;
  const response = { status(code) { this.code = code; return this; }, json() {} };
  f.auth.requireRole(['superadmin'])({ user: { role: 'product-admin', tenant: 'a' } }, response, () => { allowed = true; });
  assert.equal(allowed, false); assert.equal(response.code, 403);
  f.auth.requireRole(['superadmin'])({ user: claims }, response, () => { allowed = true; });
  assert.equal(allowed, true);
  f.state('master').user.is_active = false;
  assert.equal(await f.run('a', () => f.sessions.verifySession(claims)), null);
});

test('document credentials cannot authenticate API writes, and shared-file capabilities are exact-path/company scoped', async () => {
  const f = fixture(), token = await f.run('a', () => f.auth.createToken(identity));
  const documentToken = f.auth.createDocumentTicket(token);
  assert.equal(f.auth.verifyToken(documentToken), null);
  const capability = await f.run('a', () => f.auth.createDocumentCapability('/uploads/sanctions/synthetic.pdf'));
  for (const [method, path, tenant, allowed] of [
    ['GET', '/uploads/sanctions/synthetic.pdf', 'a', true], ['GET', '/uploads/sanctions/other.pdf', 'a', false],
    ['GET', '/uploads/sanctions/synthetic.pdf', 'b', false], ['POST', '/api/leads', 'a', false],
  ]) {
    const req = { method, path, query: { token: capability }, tenant: { slug: tenant }, get: () => '' };
    f.auth.authOptional(req, {}, () => {});
    assert.equal(Boolean(req.documentCapability), allowed); assert.equal(req.user, undefined);
  }
});

test('missing or default production signing configuration rejects both issuance and verification', async () => {
  for (const key of ['', 'payday-loan-crm-dev-secret-change-me']) {
    const auth = load('backend/middleware/auth.js', { '../config/env': {}, '../config/db': {}, '../models/crmUserModel': {}, '../services/authSessions': {} }, { AUTH_TOKEN_SECRET: key });
    assert.equal(auth.verifyToken('synthetic'), null);
    await assert.rejects(auth.createToken(identity), error => error.statusCode === 503);
  }
});

test('company admin keeps own-company management and all-company selectors cannot expand scope', () => {
  const { tenantForAdmin } = load('backend/utils/adminScope.js');
  const req = { user: { role: 'product-admin', tenant: 'a' } };
  assert.equal(tenantForAdmin(req, 'all'), 'a'); assert.equal(tenantForAdmin(req, 'a'), 'a');
  assert.throws(() => tenantForAdmin(req, 'b'), error => error.statusCode === 403);
  assert.equal(tenantForAdmin({ user: { role: 'superadmin', isMasterSuperadmin: true } }, 'all'), 'all');
});
test('a nested router cannot re-admit a session after the global session check rejected it', async () => {
  const f = fixture(), token = await f.run('a', () => f.auth.createToken(identity));
  const req = { method: 'GET', path: '/api/account-aggregator/leads/1/status', get: () => 'Bearer ' + token };
  f.auth.authOptional(req, {}, () => {}); assert.ok(req.user);
  req.user = null; f.auth.authOptional(req, {}, () => {}); assert.equal(req.user, null);
});
test('customer checkout capability is bound to the exact application, provider and company', async () => {
  const f = fixture();
  const actions = load('backend/utils/customerAction.js', { '../middleware/auth': f.auth, '../config/db': { tenantLocalStorage: { getStore: () => ({ tenant: { slug: 'a' } }) } }, './leadAccess': {} });
  const url = await f.run('a', () => actions.checkoutUrl({ id: 'APP-SYN' }, 'cashfree'));
  const access = new URL(url).searchParams.get('access'); assert.ok(access); assert.equal(f.auth.verifyToken(access), null);
  await f.run('a', () => actions.assertCheckoutAccess({ query: { access } }, 'APP-SYN', 'cashfree'));
  assert.ok(access.length < 100);
  await f.run('b', () => assert.throws(() => actions.assertCheckoutAccess({ query: { access } }, 'APP-SYN', 'cashfree'), error => error.statusCode === 401));
  assert.throws(() => actions.assertCheckoutAccess({ query: { access } }, 'APP-OTHER', 'cashfree'), error => error.statusCode === 401);
  assert.throws(() => actions.assertCheckoutAccess({ query: { access } }, 'APP-SYN', 'billdesk'), error => error.statusCode === 401);
  assert.throws(() => actions.assertCheckoutAccess({ query: {} }, 'APP-SYN', 'cashfree'), error => error.statusCode === 401);
});
