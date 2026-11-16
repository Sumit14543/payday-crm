const test = require('node:test');
const assert = require('node:assert/strict');
const { load, response } = require('./helpers/security-vm.cjs');
function fixture({ commitError = false, acquire = true, releaseError = false } = {}) {
  const events = [], state = { balance: 100 };
  let pending;
  const connection = {
    query(sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      events.push(sql);
      if (sql.includes('GET_LOCK')) return cb(null, [{ acquired: acquire ? 1 : 0 }]);
      if (sql.includes('RELEASE_LOCK')) return cb(releaseError ? new Error('Connection lost') : null, [{ released: 1 }]);
      if (sql === 'UPDATE synthetic_balance') { pending.balance = params[0]; return cb(null, { affectedRows: 1 }); }
      cb(null, [{ balance: pending.balance }]);
    },
    beginTransaction(cb) { events.push('begin'); pending = { ...state }; cb(); },
    commit(cb) { events.push('commit'); if (!commitError) Object.assign(state, pending); cb(commitError ? new Error('Synthetic commit failure') : null); },
    rollback(cb) { events.push('rollback'); pending = null; cb(); },
    release() { events.push('release'); }, destroy() { events.push('destroy'); },
  };
  const pool = { config: { connectionConfig: { database: 'synthetic_company' } }, getConnection(cb) { cb(null, connection); }, query() { throw new Error('Transaction query escaped its connection'); } };
  const db = load('backend/config/db.js', { mysql: {}, './env': { config: { db: { database: 'synthetic_company' } } } });
  const wrap = load('backend/utils/transactionalHandler.js', { '../config/db': db });
  return { db, wrap, events, state, run: fn => db.tenantLocalStorage.run({ pool, tenant: { slug: 'synthetic_company' } }, fn) };
}
test('ledger writes and JSON success are committed together; connection is released before notification', async () => {
  const f = fixture(), res = response();
  const action = f.wrap(async (_, buffered) => {
    await f.db.query('UPDATE synthetic_balance', [50]);
    f.db.afterCommit(async () => { assert.ok(f.events.includes('release')); assert.equal(f.db.tenantLocalStorage.getStore().connection, undefined); assert.equal(f.state.balance, 50); });
    buffered.json({ success: true }); assert.equal(res.body, undefined);
  });
  await f.run(() => action({}, res)); assert.equal(f.state.balance, 50); assert.equal(res.body.success, true); assert.ok(f.events.indexOf('commit') < f.events.indexOf('release'));
});
for (const mode of ['throw', 'rejected-json', 'commit-error']) test(`${mode}: no partial ledger update or outbound event survives`, async () => {
  const f = fixture({ commitError: mode === 'commit-error' }), res = response(); let notified = false;
  const action = f.wrap(async (_, buffered) => { await f.db.query('UPDATE synthetic_balance', [0]); f.db.afterCommit(async () => { notified = true; }); if (mode === 'throw') throw new Error('Synthetic downstream failure'); buffered.status(mode === 'rejected-json' ? 409 : 200).json({ success: mode !== 'rejected-json' }); });
  if (mode === 'rejected-json') { await f.run(() => action({}, res)); assert.equal(res.statusCode, 409); } else { await assert.rejects(f.run(() => action({}, res))); assert.equal(res.body, undefined); }
  assert.equal(f.state.balance, 100); assert.equal(notified, false); assert.ok(f.events.includes('rollback')); assert.ok(f.events.includes('release'));
});
test('busy company ledger rejects before calling financial business logic', async () => {
  const f = fixture({ acquire: false }); let entered = false;
  await assert.rejects(f.run(() => f.db.withTransaction(async () => { entered = true; })), error => error.statusCode === 409); assert.equal(entered, false); assert.equal(f.events.includes('begin'), false); assert.ok(f.events.includes('release'));
});
test('a failed notification cannot turn a committed financial update into an HTTP error', async () => {
  const f = fixture(), res = response();
  await f.run(() => f.wrap(async (_, buffered) => { await f.db.query('UPDATE synthetic_balance', [30]); f.db.afterCommit(() => { throw new Error('Synthetic notification failure'); }); buffered.json({ success: true }); })({}, res));
  assert.equal(f.state.balance, 30); assert.equal(res.body.success, true); assert.equal(f.events.includes('rollback'), false);
});
test('nested financial operations reuse a single transaction and lock', async () => {
  const f = fixture(); await f.run(() => f.db.withTransaction(() => f.db.withTransaction(() => f.db.query('UPDATE synthetic_balance', [25])))); assert.equal(f.state.balance, 25); assert.equal(f.events.filter(event => event === 'begin').length, 1);
});
test('failed lock release destroys the connection and does not return a lock-holding socket to the pool', async () => {
  const f = fixture({ releaseError: true }); await f.run(() => f.db.withTransaction(() => f.db.query('UPDATE synthetic_balance', [20]))); assert.equal(f.state.balance, 20); assert.ok(f.events.includes('destroy')); assert.equal(f.events.includes('release'), false);
});
