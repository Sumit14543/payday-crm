const { spawnSync } = require('node:child_process');
const path = require('node:path');
const files = [
  'security-session-hardening', 'security-company-admin', 'security-business-compatibility',
  'security-financial-input', 'security-transactions', 'security-provider-boundaries',
  'security-documents', 'security-frontend', 'security-credit-flow', 'security-spreadsheet',
  'security-official-email', 'security-customer-checkout', 'collection-aa-statements', 'collection-bank-statements',
  'security-workflow-contracts', 'sanction-acceptance-flow', 'sanction-dates', 'accounting-dates',
  'accountant-kpi-regression', 'revenue-ledger',
  'security-release-rollback',
  'security-sanction-decisions', 'security-tally',
  'security-dependency-compatibility',
  'security-sanction-company-links',
  'performance-telecaller-initial',
  'performance-telecaller-loading',
];
const result = spawnSync(process.execPath, ['--test', '--test-isolation=none', ...files.map(file => path.join(__dirname, file + '.cjs'))], { stdio: 'inherit', cwd: path.resolve(__dirname, '..') });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
