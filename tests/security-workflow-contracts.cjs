const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const parser = require('../frontend/node_modules/@babel/parser');
const generate = require('../frontend/node_modules/@babel/generator').default;
const root = path.resolve(__dirname, '..');
const fixture = require('./fixtures/security-mutation-baseline.json');
function calls(source) {
  const result = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && /^(apiPost|apiPostRead|apiPatch|apiDelete|apiPostForm)$/.test(node.callee.name)) {
      // The two collection list POSTs are reads; their cancellation wrapper
      // does not change a financial write. Compare every write URL and payload.
      if (['/collections/list', '/collections/summary/fetch'].includes(node.arguments[0]?.value)) return;
      result.push(generate(node, { compact: true, comments: false }).code);
    }
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'extra', 'comments', 'leadingComments', 'trailingComments', 'innerComments'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(parser.parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] }));
  return result;
}
for (const [file, saved] of Object.entries(fixture)) test(`${file}: existing write endpoints and business payloads remain unchanged`, () => {
  const snapshot = path.join(root, 'tmp/security-remediation/baseline', file);
  const expected = fs.existsSync(snapshot) ? calls(fs.readFileSync(snapshot, 'utf8')) : saved;
  assert.deepEqual(calls(fs.readFileSync(path.join(root, file), 'utf8')), expected);
});
module.exports = { calls };
