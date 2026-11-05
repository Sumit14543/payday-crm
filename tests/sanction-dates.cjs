const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');

if (!process.env.SANCTION_DATE_TEST_CHILD) {
  for (const timezone of ['Asia/Kolkata', 'UTC', 'America/Los_Angeles']) {
    execFileSync(process.execPath, [__filename], {
      env: { ...process.env, TZ: timezone, SANCTION_DATE_TEST_CHILD: '1' },
      stdio: 'inherit', windowsHide: true,
    });
  }
} else {
  const root = path.resolve(__dirname, '..');
  const { databaseDateOnly, formatSanctionDate } = require('../backend/utils/sanctionDates');
  // MySQL's default parser builds DATE values in the process's local timezone.
  const databaseDate = new Date(2026, 10, 30);
  assert.equal(databaseDateOnly(databaseDate), '2026-11-30');
  assert.equal(databaseDateOnly('2026-11-30'), '2026-11-30');
  assert.equal(databaseDateOnly(null), null);
  assert.equal(formatSanctionDate('2026-11-30'), '30 Nov 2026');
  assert.equal(formatSanctionDate('2026-11-29T18:30:00.000Z'), '30 Nov 2026');
  assert.equal(formatSanctionDate('2026-11-30T20:00:00Z'), '01 Dec 2026');
  assert.equal(formatSanctionDate(null), '');

  const modelFile = path.join(root, 'backend/models/sanctionModel.js');
  const actualRequire = createRequire(modelFile);
  const modelModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(modelFile, 'utf8'), {
    module: modelModule, Date,
    require: name => name === '../config/db' ? { query: async () => [] } : actualRequire(name),
  });
  const sanction = modelModule.exports.mapSanction({
    id: 1, due_date: databaseDate, agreement_date: new Date(2026, 10, 4),
    disbursement_date: new Date(2026, 10, 4), sent_at: new Date('2026-11-04T10:00:00Z'),
  });
  const api = JSON.parse(JSON.stringify(sanction));
  assert.equal(api.dueDate, '2026-11-30');
  assert.equal(api.agreementDate, '2026-11-04');
  assert.equal(api.disbursementDate, '2026-11-04');
  assert.equal(api.sentAt, '2026-11-04T10:00:00.000Z');
  assert.equal(formatSanctionDate(api.dueDate), '30 Nov 2026');

  const page = fs.readFileSync(path.join(root, 'frontend/src/app/pages/LeadDetails.tsx'), 'utf8');
  const start = page.indexOf('const formatSanctionDueDate =');
  const end = page.indexOf('const formatActivityDate =', start);
  const esbuild = require('../frontend/node_modules/esbuild');
  const formatter = esbuild.transformSync(
    page.slice(start, end) + '\nglobalThis.formatDate = formatSanctionDueDate;',
    { loader: 'ts' },
  ).code;
  const context = { Date };
  vm.runInNewContext(formatter, context);
  assert.equal(context.formatDate(api.dueDate), '30 Nov 2026');
  assert.equal(context.formatDate('2026-11-29T18:30:00.000Z'), '30 Nov 2026');
  assert.equal(context.formatDate('2026-11-30T20:00:00Z'), '01 Dec 2026');
  assert.equal(context.formatDate(undefined), 'Not provided');
  assert.equal(context.formatDate('invalid'), 'invalid');
  console.log(`Sanction API, PDF and CRM date checks passed (${process.env.TZ}).`);
}
