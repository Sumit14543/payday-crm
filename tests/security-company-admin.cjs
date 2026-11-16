const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const scope = require('../backend/utils/adminScope');
function fixture() {
  const accesses = [], writes = [];
  const tenants = ['a', 'b'].map(slug => ({ id: slug, slug, name: slug, db_name: 'synthetic_' + slug }));
  const db = {
    queryMaster: async (sql, params = []) => sql.includes('WHERE slug = ?') ? tenants.filter(t => t.slug === params[0]) : tenants.map(t => ({ ...t })),
    getTenantPool(tenant) {
      accesses.push(tenant.slug);
      return { query(sql, params, cb) {
        if (/^(UPDATE|INSERT|DELETE)/.test(sql)) { writes.push({ tenant: tenant.slug, sql, params: [...params] }); return cb(null, { affectedRows: 1 }); }
        if (sql.includes('user_product_mappings')) return cb(null, [{ product_slug: tenant.slug }]);
        if (sql.includes('SELECT id, role')) return cb(null, [{ id: 7, role: params[0] === 'platform-user' ? 'superadmin' : 'telecaller' }]);
        if (sql.includes('FROM crm_users')) return cb(null, [{ id: 7, email: tenant.slug + '@example.invalid', name: tenant.slug, role: 'telecaller', is_active: 1 }]);
        cb(null, []);
      } };
    },
  };
  const module = { exports: {} };
  const overrides = {
    '../utils/adminScope': scope, '../config/db': db,
    '../config/env': { config: { db: { database: 'synthetic_default' } } },
    '../services/tenantProvisionerService': {}, '../middleware/auth': {},
    '../models/auditModel': {}, '../services/geocodingService': {},
    '../utils/http': { requireFields(body, fields) { for (const f of fields) assert.notEqual(body[f], undefined, 'required: ' + f); }, success: (res, data, message, code = 200) => res.status(code).json({ success: true, data, message }) },
    crypto: require('node:crypto'), path, fs: { appendFileSync() {} },
  };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../backend/controllers/superadminController.js'), 'utf8'), {
    module, exports: module.exports, console, Date, Buffer, setTimeout, clearTimeout,
    process: { env: {}, cwd: () => __dirname }, require(name) { if (name in overrides) return overrides[name]; throw new Error('Unmocked: ' + name); },
  });
  return { controller: module.exports, accesses, writes };
}
function request(slug = 'all', master = false) { return { params: { id: '7' }, query: { tenantSlug: slug }, body: { tenantSlug: slug, userId: 7, onDuty: true, products: ['a'] }, user: { id: 1, role: master ? 'superadmin' : 'product-admin', tenant: master ? 'platform' : 'a', isMasterSuperadmin: master } }; }
function response() { return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; } }; }
for (const method of ['getTenantUsers', 'getTenantTelecallers']) {
  test(`${method}: company-admin all selector reads only own pool`, async () => {
    const f = fixture(), res = response(); await f.controller[method](request(), res);
    assert.equal(res.statusCode, 200); assert.deepEqual(f.accesses, ['a']); assert.ok(res.body.data.length); assert.ok(res.body.data.every(row => row.tenantSlug === 'a'));
  });
  test(`${method}: explicit other-company selector is denied before querying a pool`, async () => {
    const f = fixture(); await assert.rejects(f.controller[method](request('b'), response()), error => error.statusCode === 403); assert.equal(f.accesses.length, 0);
  });
}
for (const method of ['createTenantUser', 'updateTenantUser', 'toggleTelecallerDuty', 'updateTelecallerProducts']) {
  test(`${method}: cross-company write is denied before any user or mapping mutation`, async () => {
    const f = fixture(), req = request('b'); Object.assign(req.body, { email: 'new@example.invalid', name: 'Synthetic', role: 'telecaller', password: 'synthetic-secure-password' });
    await assert.rejects(f.controller[method](req, response()), error => error.statusCode === 403); assert.equal(f.accesses.length, 0); assert.equal(f.writes.length, 0);
  });
}
test('own-company user creation, password reset, duty and product management remain usable', async () => {
  const f = fixture(), req = request('a'); Object.assign(req.body, { email: 'new@example.invalid', name: 'Synthetic', role: 'telecaller', password: 'synthetic-secure-password', is_active: 'false' });
  for (const method of ['createTenantUser', 'updateTenantUser', 'toggleTelecallerDuty', 'updateTelecallerProducts']) {
    const res = response(); await f.controller[method](req, res); assert.equal(res.body.success, true, method);
  }
  assert.ok(f.writes.length >= 6); assert.ok(f.writes.every(write => write.tenant === 'a'));
  assert.ok(f.writes.some(write => write.sql.includes('is_active = ?') && write.params[0] === 0));
});
test('company-admin cannot provision platform roles; existing company superadmins remain manageable in their own database', async () => {
  const f = fixture(), req = request('a'); Object.assign(req.body, { email: 'new@example.invalid', name: 'Synthetic', role: 'platform-superadmin', password: 'synthetic-secure-password' });
  const created = response(); await f.controller.createTenantUser(req, created); assert.equal(created.statusCode, 403);
  req.params.id = 'platform-user'; const updated = response(); await f.controller.updateTenantUser(req, updated); assert.equal(updated.statusCode, 200); assert.ok(f.writes.every(write => write.tenant === 'a' && !write.sql.includes('superadmins')));
});
test('verified platform superadmin retains all-company management', async () => {
  const f = fixture(), res = response(); await f.controller.getTenantUsers(request('all', true), res);
  assert.ok(f.accesses.includes('a')); assert.ok(f.accesses.includes('b')); assert.ok(res.body.data.some(row => row.tenantSlug === 'b'));
});
