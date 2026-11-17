const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const parser = require('../frontend/node_modules/@babel/parser'), generate = require('../frontend/node_modules/@babel/generator').default;
const root = path.resolve(__dirname, '..'), baseline = '4a88f3b122130496a529f33b4946daac9280d96a';
function declaration(source, name) {
  let found;
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'VariableDeclarator' && node.id?.name === name) found = node.init;
    for (const [key, child] of Object.entries(node)) {
      if (['loc', 'extra', 'comments', 'leadingComments', 'trailingComments', 'innerComments'].includes(key)) continue;
      if (Array.isArray(child)) child.forEach(visit); else if (child && typeof child === 'object') visit(child);
    }
  }
  visit(parser.parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] }));
  assert.ok(found, `Missing ${name}`); return found;
}
const compact = node => generate(node, { compact: true, comments: false }).code;
function versions(file) { return [execFileSync('git', ['show', `${baseline}:${file}`], { cwd: root, encoding: 'utf8' }), fs.readFileSync(path.join(root, file), 'utf8')]; }
for (const name of ['handleSubmit', 'handleOtpSubmit', 'handleResendOtp']) test(`code preloading preserves existing login/OTP handler ${name}`, () => {
  const [before, after] = versions('frontend/src/app/pages/Login.tsx');
  assert.equal(compact(declaration(after, name)), compact(declaration(before, name)));
});
test('loader optimization preserves all existing lead queries, filters and response handling', () => {
  const [before, after] = versions('frontend/src/app/pages/Leads.tsx');
  const work = source => declaration(source, 'loadLeads').arguments[0].body.body.find(node => node.type === 'TryStatement');
  assert.equal(compact(work(after).block), compact(work(before).block));
  assert.equal(compact(work(after).handler), compact(work(before).handler));
});
