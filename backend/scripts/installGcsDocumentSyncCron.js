const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { readSyncConfig, prepareState } = require('../services/gcsDocumentSync');

const START = '# BEGIN PAYDAY CRM GCS DOCUMENT SYNC';
const END = '# END PAYDAY CRM GCS DOCUMENT SYNC';
const quote = value => "'" + String(value).replace(/'/g, "'\"'\"'") + "'";
function makeCron(config, nodePath = process.execPath) {
  const root = path.resolve(__dirname, '..');
  const command = `cd ${quote(root)} && NODE_ENV=production flock -n ${quote(config.lockFile)} ${quote(nodePath)} ${quote(path.join(root, 'scripts', 'syncDocumentsToGcs.js'))} --once >> ${quote(path.join(config.stateDir, 'sync.log'))} 2>&1`;
  if (/[\r\n%]/.test(command)) throw new Error('Invalid cron path.');
  return `${START}\n# Mirror all stable uploaded/generated documents every 10 minutes; no deletions.\n*/10 * * * * ${command}\n${END}`;
}
function replaceManagedCron(existing, block) {
  const start = existing.indexOf(START), end = existing.indexOf(END);
  if ((start < 0) !== (end < 0) || (start >= 0 && end < start) || existing.indexOf(START, start + START.length) >= 0 || existing.indexOf(END, end + END.length) >= 0) throw new Error('Malformed document sync cron block; existing jobs are unchanged.');
  const kept = start < 0 ? existing : existing.slice(0, start) + existing.slice(end + END.length);
  return kept.trimEnd() + (kept.trimEnd() ? '\n\n' : '') + block + '\n';
}
async function main(args = process.argv.slice(2)) {
  if (args.length > 1 || args.some(arg => !['--install', '--remove', '--preview'].includes(arg))) throw new Error('Use --install, --remove or --preview.');
  require('../config/env');
  const config = readSyncConfig();
  const block = args.includes('--remove') ? '' : makeCron(config);
  if (!args.length || args.includes('--preview')) { console.log(block); return; }
  if (process.platform === 'win32') throw new Error('Install on the Linux production server.');
  if (!config.enabled && !args.includes('--remove')) throw new Error('Enable GCS document sync before installing the job.');
  execFileSync('flock', ['--version'], { stdio: 'ignore' });
  let existing;
  try { existing = execFileSync('crontab', ['-l'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (error) {
    if (error.status === 1 && /no crontab/i.test(String(error.stderr || ''))) existing = '';
    else throw new Error('Cannot read crontab; it was not changed.');
  }
  const updated = replaceManagedCron(existing, block);
  await prepareState(config);
  const log = path.join(config.stateDir, 'sync.log');
  const handle = await fsp.open(log, 'a', 0o600); await handle.close(); await fsp.chmod(log, 0o600);
  execFileSync('crontab', ['-'], { input: updated, encoding: 'utf8', stdio: ['pipe', 'ignore', 'pipe'] });
  const installed = execFileSync('crontab', ['-l'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (args.includes('--remove') ? installed.includes(START) : !installed.includes(block)) throw new Error('Document sync crontab verification failed.');
  console.log(args.includes('--remove') ? 'Removed managed document sync job only.' : 'Verified document sync every 10 minutes; existing jobs preserved.');
}
if (require.main === module) main().catch(error => { console.error('Document sync cron setup failed: ' + (error.code || error.name)); process.exitCode = 1; });
module.exports = { makeCron, replaceManagedCron, quote };
