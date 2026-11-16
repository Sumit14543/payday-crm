const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function load(file, overrides) {
  const filename = path.resolve(__dirname, '..', file);
  const actualRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, console, __dirname: path.dirname(filename), __filename: filename,
    require: name => Object.hasOwn(overrides, name) ? overrides[name] : actualRequire(name),
  }, { filename });
  return module.exports;
}

function fixture({ collectionCase = { id: 'CASE-A', loanId: 'LOAN-A-R1' }, requests = [] } = {}) {
  const calls = [];
  const controller = load('backend/controllers/collectionController.js', {
    '../models/collectionModel': { findCaseById: async id => { calls.push(['case', id]); return collectionCase; } },
    '../models/repaymentModel': {},
    '../models/accountAggregatorModel': {},
    '../models/documentRequestModel': {
      findBankStatementsForLoan: async loanId => { calls.push(['documents', loanId]); return requests; },
      findCollectionDocumentsForLoan: async loanId => { calls.push(['documents', loanId]); return requests; },
    },
    '../models/leadStatusModel': {},
    '../services/sourceStatusWebhookService': {},
    './referenceController': {},
    '../config/uploads': {},
  });
  return {
    calls,
    async read(caseId = 'CASE-A', method = 'getBankStatements') {
      const res = { status() { return this; }, json(body) { this.body = body; return this; } };
      await controller[method]({ params: { caseId } }, res);
      return JSON.parse(JSON.stringify(res.body));
    },
  };
}

test('bank statements come from the selected case loan and expose only uploaded bank documents', async () => {
  const f = fixture({ requests: [
    { id: 1, documentKey: 'bank_statement_last_6_months', uploadedFile: '/uploads/lead-documents/a.pdf', originalFileName: 'statement.pdf', uploadedAt: '2026-11-13', token: 'PRIVATE-UPLOAD-TOKEN', groupToken: 'PRIVATE-GROUP' },
    { id: 2, documentKey: 'pan', uploadedFile: '/uploads/lead-documents/pan.pdf' },
    { id: 3, documentKey: 'bank_statement_6_months', uploadedFile: '' },
    { id: 4, documentKey: 'bank_statement_6_months', uploadedFile: '/uploads/lead-documents/b.pdf', label: 'Bank Statement (6 months)' },
    { id: 5, documentKey: 'bank_proof', uploadedFile: '/uploads/lead-documents/cheque.pdf' },
  ] });
  const response = await f.read();
  assert.equal(response.success, true);
  assert.deepEqual(response.data.map(x => x.id), [1, 4]);
  assert.deepEqual(f.calls, [['case', 'CASE-A'], ['documents', 'LOAN-A-R1']]);
  assert.equal(response.data[0].originalFileName, 'statement.pdf');
  assert.ok(!JSON.stringify(response).includes('PRIVATE-'));
  assert.ok(!JSON.stringify(response).includes('pan.pdf'));
});

test('missing cases return 404 without reading loan or document data', async () => {
  const f = fixture({ collectionCase: null });
  await assert.rejects(f.read('MISSING'), error => error.statusCode === 404);
  assert.deepEqual(f.calls, [['case', 'MISSING']]);
});

test('blank loan IDs do not run a document query', async () => {
  const model = load('backend/models/documentRequestModel.js', {
    '../config/db': { query: () => { throw new Error('Unexpected database read'); } },
  });
  for (const loanId of ['', '  ', null, undefined]) assert.equal((await model.findBankStatementsForLoan(loanId)).length, 0);
});

test('statement lookup uses recorded loan references and excludes phone/name matching', async () => {
  const queries = [];
  const model = load('backend/models/documentRequestModel.js', {
    '../config/db': { query: async (sql, params) => {
      queries.push({ sql, params: Array.from(params) });
      return [{ id: 1, document_key: 'bank_statement_6_months', uploaded_file: '/uploads/lead-documents/a.pdf' }];
    } },
  });
  const rows = await model.findBankStatementsForLoan('LOAN-A-R1');
  assert.equal(rows[0].uploadedFile, '/uploads/lead-documents/a.pdf');
  assert.equal(queries.length, 1);
  assert.deepEqual(queries[0].params, ['bank_statement_last_6_months', 'bank_statement_6_months', 'LOAN-A-R1', 'LOAN-A-R1']);
  assert.match(queries[0].sql, /schedule\.loan_id = \?/);
  assert.match(queries[0].sql, /request\.application_id = schedule\.application_id/);
  assert.match(queries[0].sql, /request\.lead_id = schedule\.lead_id/);
  assert.match(queries[0].sql, /payment\.loan_id = \?/);
  assert.match(queries[0].sql, /request\.application_id = payment\.application_id/);
  assert.doesNotMatch(queries[0].sql, /phone|mobile|full_name|UPDATE|INSERT|DELETE/i);
});

test('a customer without uploaded statements returns an empty list', async () => {
  assert.deepEqual((await fixture().read()).data, []);
});

test('customer documents include only uploaded collection documents and never upload tokens', async () => {
  const requests = ['bank_statement_last_6_months', 'bank_statement_6_months', 'company_id_card', 'selfie', 'pan'].map((documentKey, id) => ({
    id, documentKey, uploadedFile: `/uploads/lead-documents/${documentKey}.pdf`, token: 'PRIVATE-TOKEN', groupToken: 'PRIVATE-GROUP',
  }));
  requests.push({ id: 6, documentKey: 'selfie', uploadedFile: '' });
  const f = fixture({ requests });
  const response = await f.read('CASE-A', 'getDocuments');
  assert.deepEqual(response.data.map(row => row.documentKey), ['bank_statement_last_6_months', 'bank_statement_6_months', 'company_id_card', 'selfie']);
  assert.deepEqual(f.calls, [['case', 'CASE-A'], ['documents', 'LOAN-A-R1']]);
  assert.doesNotMatch(JSON.stringify(response), /PRIVATE-|pan\.pdf/);
  const missing = fixture({ collectionCase: null });
  await assert.rejects(missing.read('MISSING', 'getDocuments'), error => error.statusCode === 404);
  assert.deepEqual(missing.calls, [['case', 'MISSING']]);
});

test('source application documents are resolved through loan references and merged without duplicate files', async () => {
  const queries = [];
  const model = load('backend/models/documentRequestModel.js', {
    '../config/db': { query: async (sql, params) => {
      queries.push({ sql, params: Array.from(params) });
      if (sql.includes('FROM lead_document_requests')) return [{ id: 1, document_key: 'company_id_card', uploaded_file: '/uploads/lead-documents/company.png' }];
      return [
        { id: 10, source_system: 'waqtfinance', company_id_card: '/uploads/lead-documents/company.png', selfie_image: 'images/selfie.jpg' },
        { id: 11, source_system: 'waqtmoney', company_id_card: 'upload/image/id.jpg', selfie_image: 'data:image/png;base64,dGVzdA==' },
      ];
    } },
  });
  const documents = await model.findCollectionDocumentsForLoan('LOAN-A-R1');
  assert.equal(documents.length, 4);
  assert.deepEqual(Array.from(documents, row => row.uploadedFile), [
    '/uploads/lead-documents/company.png', 'https://waqtfinance.com/uploads/images/selfie.jpg',
    'https://api.waqtmoney.com/upload/image/id.jpg', 'data:image/png;base64,dGVzdA==',
  ]);
  assert.equal(documents[3].originalFileName, 'selfie.jpg');
  assert.deepEqual(queries[1].params, ['LOAN-A-R1', 'LOAN-A-R1']);
  assert.match(queries[1].sql, /schedule\.loan_id = \?/);
  assert.match(queries[1].sql, /payment\.loan_id = \?/);
  assert.doesNotMatch(queries.map(query => query.sql).join(' '), /phone|mobile|full_name|UPDATE\s|INSERT\s|DELETE\s/i);
});

test('customer document lookup does not query a database without a loan ID', async () => {
  const model = load('backend/models/documentRequestModel.js', {
    '../config/db': { query: () => { throw new Error('Unexpected database read'); } },
  });
  for (const id of ['', '  ', null, undefined]) assert.equal((await model.findCollectionDocumentsForLoan(id)).length, 0);
});

test('the bank-statement endpoint uses the collection role gate', () => {
  const routes = [];
  const router = {};
  for (const method of ['get', 'post', 'patch']) router[method] = (path, ...handlers) => routes.push({ method, path, handlers });
  const handler = () => {};
  load('backend/routes/collectionRoutes.js', {
    express: { Router: () => router },
    '../controllers/collectionController': { getBankStatements: handler, getDocuments: handler },
    '../controllers/referenceController': {},
    '../middleware/auth': { requireRole: roles => ({ roles: Array.from(roles) }) },
    '../utils/asyncHandler': value => value,
    '../config/uploads': { ensureUploadDir: () => '/test-uploads' },
  });
  const route = routes.find(x => x.path === '/:caseId/bank-statements');
  assert.equal(route.method, 'get');
  assert.deepEqual(route.handlers[0].roles, ['collection']);
  assert.equal(route.handlers[1], handler);
  const documents = routes.find(x => x.path === '/:caseId/documents');
  assert.equal(documents.method, 'get');
  assert.deepEqual(documents.handlers[0].roles, ['collection']);
  assert.equal(documents.handlers[1], handler);
});
