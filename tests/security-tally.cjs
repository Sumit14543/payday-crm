const test = require('node:test'), assert = require('node:assert/strict');
const { load, response } = require('./helpers/security-vm.cjs');
function run(env = {}, tenant = 'waqtfinance', headers = { 'x-tally-api-key': 'SYN-TALLY' }, query = {}) {
  const auth = load('backend/middleware/tallyAuth.js', {}, { process: { env: { TALLY_API_KEY: 'SYN-TALLY', ...env } } });
  const res = response(), allowed = auth.authorize({ tenant: { slug: tenant }, headers, query }, res);
  return { res, allowed };
}
test('existing Tally header credential works only for its own company, including Waqt alias', () => {
  assert.equal(run().allowed, true); assert.equal(run({}, 'waqtmoney').allowed, true);
  assert.equal(run({}, 'geetpay').res.statusCode, 403);
  assert.equal(run({}, 'superadmin').res.statusCode, 403);
});
test('separate company accounting keys cannot select another company', () => {
  const env = { TALLY_COMPANY_KEYS: JSON.stringify([{ tenant: 'geetpay', key: 'SYN-GEET' }]) };
  assert.equal(run(env, 'geetpay', { 'x-api-key': 'SYN-GEET' }).allowed, true);
  assert.equal(run(env, 'waqtfinance', { 'x-api-key': 'SYN-GEET' }).res.statusCode, 403);
});
test('accounting query-key migration remains compatible and can require headers after client migration', () => {
  const legacy = run({}, 'waqtfinance', {}, { api_key: 'SYN-TALLY' });
  assert.equal(legacy.allowed, true); assert.equal(legacy.res.headers.Deprecation, 'true');
  assert.equal(legacy.res.headers['Cache-Control'], 'no-store');
  assert.equal(run({ TALLY_ALLOW_QUERY_KEY: 'false' }, 'waqtfinance', {}, { api_key: 'SYN-TALLY' }).res.statusCode, 401);
  assert.equal(run({ TALLY_ALLOW_QUERY_KEY: 'false' }).allowed, true);
});
test('missing/invalid keys and malformed company configuration fail closed', () => {
  assert.equal(run({}, 'waqtfinance', {}).res.statusCode, 401);
  assert.equal(run({}, 'waqtfinance', { 'x-api-key': 'SYN-WRONG' }).res.statusCode, 401);
  assert.equal(run({ TALLY_COMPANY_KEYS: '{broken' }).res.statusCode, 503);
});
