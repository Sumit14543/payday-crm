const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { load, response } = require('./helpers/security-vm.cjs');
const access = require('../backend/utils/leadAccess');
const { validateFiles, recognizedType } = require('../backend/utils/uploadContent');
function documents(rows) {
  let queries = 0;
  const middleware = load('backend/middleware/documentAccess.js', { '../utils/leadAccess': access, '../config/db': { query: async (sql, params) => { queries++; assert.ok(sql.includes('lead_document_requests')); assert.ok(sql.includes('lead_loan_agreements')); assert.ok(params.includes('/uploads/lead-documents/synthetic.pdf')); return rows; } } });
  return { get queries() { return queries; }, run: async overrides => { const req = { documentPath: '/uploads/lead-documents/synthetic.pdf', method: 'GET', user: { name: 'Agent A', email: 'a@example.invalid', role: 'telecaller' }, ...overrides }, res = response(); let passed = false; await middleware(req, res, () => { passed = true; }); return { passed, res }; } };
}
test('a staff document requires a reference in the current company and an assigned lead', async () => {
  const missing = documents([]); assert.equal((await missing.run()).res.statusCode, 404);
  const other = documents([{ id: 'APP-OTHER', assignedTo: 'Agent B' }]); await assert.rejects(other.run(), error => error.statusCode === 403);
  const assigned = documents([{ id: 'APP-SYN', assignedTo: 'Agent A' }]); const result = await assigned.run(); assert.equal(result.passed, true); assert.equal(result.res.headers['Cache-Control'], 'private, no-store');
});
test('an exact verified file capability permits only its one shared file without a staff session', async () => {
  const f = documents([]); assert.equal((await f.run({ user: null, documentCapability: { path: '/uploads/lead-documents/synthetic.pdf' } })).passed, true); assert.equal(f.queries, 0);
  assert.equal((await f.run({ user: null, documentCapability: { path: '/uploads/lead-documents/other.pdf' } })).res.statusCode, 401);
});
test('path traversal and alternate private paths fail before ownership lookup', async () => {
  const f = documents([]); for (const documentPath of ['/uploads/../.env', '/uploads/a\\b.pdf', '/backend/.env']) assert.equal((await f.run({ documentPath })).res.statusCode, 403); assert.equal(f.queries, 0);
});

test('repeated agreement names cannot overwrite another company or an earlier PDF', () => {
  const crypto = require('node:crypto'), { AsyncLocalStorage } = require('node:async_hooks');
  const context = new AsyncLocalStorage();
  const storage = load('backend/utils/documentStorage.js', { crypto, '../config/db': { tenantLocalStorage: context } });
  const make = slug => context.run({ tenant: { slug, db_name: 'synthetic-' + slug } }, () => storage.privateDocumentName('AG-SYN.pdf'));
  const a = make('a'), again = make('a'), b = make('b');
  assert.notEqual(a, again); assert.notEqual(a.slice(0, 24), b.slice(0, 24)); assert.ok(a.endsWith('-AG-SYN.pdf')); assert.ok(!a.includes('synthetic-'));
});
test('document byte validation accepts PDF and JPEG and removes disguised HTML before storage metadata can be committed', async () => {
  const root = path.resolve(__dirname, '../tmp/security-remediation/upload-tests'); await fs.mkdir(root, { recursive: true });
  const valid = [{ path: path.join(root, 'synthetic.pdf'), originalname: 'synthetic.pdf' }, { path: path.join(root, 'synthetic.jpg'), originalname: 'synthetic.jpeg' }];
  await fs.writeFile(valid[0].path, '%PDF-1.4\nSynthetic fixture\n%%EOF'); await fs.writeFile(valid[1].path, Buffer.from('ffd8ffe000000000', 'hex'));
  try { await validateFiles(valid); assert.equal(valid[0].mimetype, 'application/pdf'); assert.equal(valid[1].mimetype, 'image/jpeg'); }
  finally { for (const file of valid) await fs.unlink(file.path).catch(() => {}); }
  const invalid = { path: path.join(root, 'disguised.pdf'), originalname: 'disguised.pdf', mimetype: 'application/pdf' }; await fs.writeFile(invalid.path, '<html><script>synthetic()</script></html>');
  await assert.rejects(validateFiles([invalid]), error => error.statusCode === 400); await assert.rejects(fs.stat(invalid.path), error => error.code === 'ENOENT');
  assert.equal(recognizedType(Buffer.from('arbitrary bytes')), null);
});
