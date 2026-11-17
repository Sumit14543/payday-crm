const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const relativePath = 'backend/controllers/leadController.js';
const current = fs.readFileSync(path.join(root, relativePath), 'utf8');
const baseline = execFileSync('git', ['show', `fde37089692e54056bcbbe8a53c34e3f6d99bda8:${relativePath}`], { cwd: root, encoding: 'utf8' });
const marker = '  // Group applications by customer (PAN || phone || email || id)';

function reloanFunctionTail(source) {
  const start = source.indexOf(marker);
  const exportStart = source.indexOf('\nmodule.exports =', start);
  assert.ok(start >= 0 && exportStart > start, 'Reloan grouping contract markers must exist');
  return source.slice(start, exportStart).trim();
}

test('reloan grouping, calculations, sorting, summary and response stay byte-for-byte unchanged', () => {
  assert.equal(reloanFunctionTail(current), reloanFunctionTail(baseline));
});

test('reloan lookup uses one read-only snapshot with existing source precedence', () => {
  const functionStart = current.indexOf('async function getReloansReport');
  const functionEnd = current.indexOf(marker, functionStart);
  const lookup = current.slice(functionStart, functionEnd);
  assert.equal((lookup.match(/rawApplications\s*=\s*await query/g) || []).length, 1);
  assert.ok(lookup.includes('ROW_NUMBER() OVER (PARTITION BY appRowId ORDER BY sortValue DESC)'));
  assert.ok(lookup.includes("COALESCE(pr.loanId, cr.loanId, lr.loanId, '') AS loanId"));
  assert.ok(!/\b(?:INSERT|UPDATE|DELETE|REPLACE)\b/i.test(lookup));
  assert.ok(!lookup.includes('Promise.all'));
});
