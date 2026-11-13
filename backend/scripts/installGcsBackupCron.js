const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { readBackupConfig, lockPath } = require('../services/databaseBackup');

const START = '# BEGIN PAYDAY CRM GCS DATABASE BACKUP';
const END = '# END PAYDAY CRM GCS DATABASE BACKUP';
const quote = value => "'" + String(value).replace(/'/g, "'\"'\"'") + "'";

function makeCron(config, nodePath = process.execPath) {
  const root = path.resolve(__dirname, '..');
  const log = path.join(config.stateDir, 'backup.log');
  // Cron wakes the job every five minutes; the job itself uses Asia/Kolkata,
  // so the server's own timezone cannot shift the 21:00 India schedule.
  const command = `cd ${quote(root)} && NODE_ENV=production flock -n ${quote(lockPath(config))} ${quote(nodePath)} ${quote(path.join(root, 'scripts', 'backupDatabaseToGcs.js'))} --scheduled >> ${quote(log)} 2>&1`;
  if (/[\r\n%]/.test(command)) throw new Error('Cron paths cannot contain newlines or percent signs.');
  return `${START}\n# Daily snapshot at ${config.time} India time; expiry cleanup every 5 minutes.\n*/5 * * * * ${command}\n${END}`;
}

function replaceManagedCron(existing, block) {
  const start = existing.indexOf(START);
  const end = existing.indexOf(END);
  if ((start < 0) !== (end < 0) || (start >= 0 && end < start) || existing.indexOf(START, start + START.length) >= 0) throw new Error('Incomplete or repeated backup cron block; existing crontab is unchanged.');
  const kept = start < 0 ? existing : existing.slice(0, start) + existing.slice(end + END.length);
  return (kept.trimEnd() + (kept.trimEnd() ? '\n\n' : '') + block + '\n');
}

async function main(args = process.argv.slice(2)) {
  if (args.length > 1 || args.some(arg => !['--install', '--remove', '--preview'].includes(arg))) throw new Error('Use --install, --remove, or --preview.');
  require('../config/env');
  const config = readBackupConfig();
  const block = args.includes('--remove') ? '' : makeCron(config);
  if (!args.length || args.includes('--preview')) { console.log(block); return; }
  if (process.platform === 'win32') throw new Error('Install this cron job on the Linux production server.');
  execFileSync('flock', ['--version'], { stdio: 'ignore' });
  let existing;
  try { existing = execFileSync('crontab', ['-l'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (error) {
    if (error.status === 1 && /no crontab/i.test(String(error.stderr || ''))) existing = '';
    else throw new Error('Cannot read crontab; it was not modified.');
  }
  const updated = replaceManagedCron(existing, block);
  await fsp.mkdir(config.stateDir, { recursive: true, mode: 0o700 });
  await fsp.chmod(config.stateDir, 0o700);
  const log = path.join(config.stateDir, 'backup.log');
  const descriptor = fs.openSync(log, 'a', 0o600);
  fs.closeSync(descriptor);
  fs.chmodSync(log, 0o600);
  execFileSync('crontab', ['-'], { input: updated, encoding: 'utf8', stdio: ['pipe', 'ignore', 'pipe'] });
  console.log(args.includes('--remove') ? 'Removed only the managed GCS database backup cron job.' : `Installed GCS backup cron: daily ${config.time} Asia/Kolkata; 7-day retention.`);
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { quote, makeCron, replaceManagedCron };
