const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { pipeline } = require('node:stream/promises');
const { Transform } = require('node:stream');
const { createGzip } = require('node:zlib');
const { randomUUID, createHash } = require('node:crypto');
const defaults = require('../config/gcsBackupDefaults.json');

const execFileAsync = promisify(execFile);
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const OWNER = 'payday-crm-mysql-v1';
const APP_ROOT = path.resolve(__dirname, '..');

function readBackupConfig(env = process.env) {
  const bucket = String(env.GCS_BACKUP_BUCKET || env.GCS_BUCKET_NAME || defaults.bucket).trim();
  const prefix = String(env.GCS_BACKUP_PREFIX || defaults.prefix).replace(/\/+$/, '');
  const time = String(env.GCS_BACKUP_TIME_IST || defaults.time).trim();
  const databases = [...new Set(String(env.GCS_BACKUP_DATABASES || env.DB_NAME || '').split(',').map(name => name.trim()).filter(Boolean))];
  if (!/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(bucket) || bucket.includes('..')) throw new Error('Invalid GCS_BACKUP_BUCKET.');
  if (!/^[a-z0-9_-]+(?:\/[a-z0-9_-]+)+$/.test(prefix) || /(?:^|\/)(?:uploads|documents)(?:\/|$)/.test(prefix)) throw new Error('Use a separate backup prefix, such as database-backups/production.');
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('GCS_BACKUP_TIME_IST must be HH:mm in India time.');
  if (!databases.length || databases.some(name => !/^[A-Za-z0-9_$][A-Za-z0-9_$-]{0,63}$/.test(name))) throw new Error('Set DB_NAME or GCS_BACKUP_DATABASES to valid database names.');
  const port = Number(env.DB_PORT || 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid DB_PORT.');
  const user = env.GCS_BACKUP_DB_USER || env.DB_USER;
  if (!user) throw new Error('Set DB_USER or GCS_BACKUP_DB_USER for the read-only backup connection.');
  return {
    enabled: env.GCS_BACKUP_ENABLED === undefined ? defaults.enabled : ['1', 'true', 'yes', 'on'].includes(String(env.GCS_BACKUP_ENABLED).toLowerCase()),
    bucket, prefix, time, databases,
    documentBucket: env.GCS_BUCKET_NAME || 'waqt-finance-loan-documents-prod',
    dumpCommand: env.GCS_BACKUP_DUMP_COMMAND || 'mysqldump',
    timeoutMs: 40 * 60 * 1000,
    stateDir: path.resolve(env.GCS_BACKUP_STATE_DIR || path.join(os.homedir(), '.local', 'state', 'payday-crm-db-backup')),
    db: { host: env.DB_HOST || 'localhost', port, user, password: env.GCS_BACKUP_DB_PASSWORD ?? env.DB_PASSWORD ?? env.DB_PASS ?? '' },
  };
}

function createStorageClient(env = process.env, StorageClass = require('@google-cloud/storage').Storage) {
  if (env.GCS_BACKUP_KEY_FILE) return new StorageClass({ keyFilename: path.resolve(APP_ROOT, env.GCS_BACKUP_KEY_FILE) });
  if (env.GCP_SERVICE_ACCOUNT_KEY) {
    let credentials;
    try {
      const value = env.GCP_SERVICE_ACCOUNT_KEY.trim();
      credentials = JSON.parse(value.startsWith('{') ? value : Buffer.from(value, 'base64').toString('utf8'));
      if (!credentials.client_email || !credentials.private_key) throw new Error();
    } catch { throw new Error('GCP_SERVICE_ACCOUNT_KEY is not a valid service account credential.'); }
    return new StorageClass({ projectId: credentials.project_id || env.GCP_PROJECT_ID, credentials });
  }
  const keyFile = env.GOOGLE_APPLICATION_CREDENTIALS ? path.resolve(APP_ROOT, env.GOOGLE_APPLICATION_CREDENTIALS) : path.join(APP_ROOT, 'gcp-key.json');
  if (fs.existsSync(keyFile)) return new StorageClass({ keyFilename: keyFile });
  // Application Default Credentials / workload identity are supported too.
  return new StorageClass({ projectId: env.GCP_PROJECT_ID });
}

function lifecycleRule(config) {
  return { action: { type: 'Delete' }, condition: { age: 7, matchesPrefix: [config.prefix + '/'] } };
}

function checkEarlyDeletionRules(metadata, config) {
  for (const rule of metadata.lifecycle?.rule || []) {
    const condition = rule.condition || {};
    const touchesBackups = !condition.matchesPrefix?.length || condition.matchesPrefix.some(prefix => (config.prefix + '/').startsWith(prefix) || prefix.startsWith(config.prefix + '/'));
    if (rule.action?.type === 'Delete' && touchesBackups && (condition.age === undefined || Number(condition.age) < 7)) throw new Error('An existing lifecycle rule could delete backups before 7 days; it is not changed automatically.');
  }
}

async function configureBackupLifecycle(bucket, config) {
  const [metadata] = await bucket.getMetadata();
  if (Number(metadata.retentionPolicy?.retentionPeriod || 0) > RETENTION_MS / 1000 || metadata.defaultEventBasedHold) throw new Error('Existing retention/holds are incompatible; they are not changed automatically.');
  checkEarlyDeletionRules(metadata, config);
  const rules = metadata.lifecycle?.rule || [];
  const rule = lifecycleRule(config);
  const matching = rules.some(existing => existing.action?.type === 'Delete' && Number(existing.condition?.age) === 7 && existing.condition?.matchesPrefix?.length === 1 && existing.condition.matchesPrefix[0] === config.prefix + '/' && Object.keys(existing.condition).length === 2);
  await bucket.setMetadata({
    lifecycle: { rule: matching ? rules : [...rules, rule] },
  }, { ifMetagenerationMatch: metadata.metageneration });
  // Never change bucket-wide Soft Delete, versioning, IAM or document policies.
  return { prefix: config.prefix, age: 7 };
}

async function checkStorageAccess(bucket, config, fetchAnonymous = fetch) {
  const name = `${config.prefix}/${config.databases[0]}/_probe_${randomUUID()}.txt`;
  const file = bucket.file(name);
  let generation;
  try {
    await file.save('Database backup storage readiness check. No database data.', { validation: 'crc32c', resumable: false, preconditionOpts: { ifGenerationMatch: 0 }, metadata: { contentType: 'text/plain', cacheControl: 'no-store' } });
    const [metadata] = await file.getMetadata();
    generation = metadata.generation;
    if (!generation || !Number(metadata.size)) throw new Error('Cannot verify backup storage write access.');
    const objectPath = name.split('/').map(encodeURIComponent).join('/');
    const response = await fetchAnonymous(`https://storage.googleapis.com/${config.bucket}/${objectPath}`, { redirect: 'error', signal: AbortSignal.timeout(15000) });
    await response.body?.cancel();
    if (![403, 404].includes(response.status)) throw new Error('Anonymous access is not denied for the backup prefix; refusing to upload database data.');
  } finally {
    if (generation) await bucket.file(name, { generation, preconditionOpts: { ifGenerationMatch: generation } }).delete({ ignoreNotFound: true });
  }
  // Object-level metadata can reveal extra soft-delete retention without
  // requiring bucket-admin access or changing the shared bucket settings.
  try {
    const [deleted] = await bucket.file(name, { generation }).getMetadata({ softDeleted: true });
    const seconds = (Date.parse(deleted.hardDeleteTime) - Date.parse(deleted.softDeleteTime)) / 1000;
    return { privateAccessVerified: true, softDeleteExtraDays: Number.isFinite(seconds) ? seconds / 86400 : 'unknown' };
  } catch (error) {
    if (Number(error.code) === 404) return { privateAccessVerified: true, softDeleteExtraDays: 0 };
    if (Number(error.code) === 403) return { privateAccessVerified: true, softDeleteExtraDays: 'unknown' };
    throw error;
  }
}

async function getDumpArguments(config, database, optionFile, execute = execFileAsync) {
  let stdout;
  try { ({ stdout } = await execute(config.dumpCommand, ['--version'], { timeout: 10000, maxBuffer: 16384, windowsHide: true })); }
  catch { throw new Error('mysqldump is unavailable. Set GCS_BACKUP_DUMP_COMMAND to the installed mysqldump or mariadb-dump binary.'); }
  const maria = /mariadb/i.test(stdout);
  const major = Number(String(stdout).match(/(?:Ver|Distrib)\s+(\d+)\./i)?.[1] || 0);
  return [
    `--defaults-file=${optionFile}`, '--single-transaction', '--quick', '--no-tablespaces',
    '--routines', '--triggers', '--events', '--hex-blob', '--default-character-set=utf8mb4',
    ...(!maria ? ['--set-gtid-purged=OFF', ...(major >= 8 ? ['--column-statistics=0'] : [])] : []),
    '--skip-lock-tables', '--skip-add-locks', database,
  ];
}

async function checkDatabaseTables(config, database, mysql = require('mysql')) {
  const connection = mysql.createConnection({ ...config.db, database, connectTimeout: 15000 });
  try {
    const tables = await new Promise((resolve, reject) => connection.query(
      'SELECT TABLE_NAME, ENGINE FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = ?',
      [database, 'BASE TABLE'], (error, rows) => error ? reject(new Error('Database backup metadata read failed. Verify the configured DB credentials and SELECT access.')) : resolve(rows),
    ));
    if (!tables.length) throw new Error('No accessible database tables found; refusing to publish an empty backup.');
    if (tables.some(table => String(table.ENGINE).toLowerCase() !== 'innodb')) throw new Error('Consistent non-locking backups require InnoDB tables. No table engines are changed automatically.');
    return tables.length;
  } finally { connection.destroy(); }
}

function optionValue(value) {
  const text = String(value);
  if (text.includes('\0')) throw new Error('Database credentials contain an unsupported null character.');
  return '"' + text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"';
}

async function createCompressedDump(config, database, directory, { spawnProcess = spawn, execute = execFileAsync } = {}) {
  const optionFile = path.join(directory, 'mysql.cnf');
  const dumpFile = path.join(directory, 'database.sql.gz');
  await fsp.writeFile(optionFile, `[client]\nhost=${optionValue(config.db.host)}\nport=${config.db.port}\nuser=${optionValue(config.db.user)}\npassword=${optionValue(config.db.password)}\nprotocol=TCP\n`, { mode: 0o600 });
  const args = await getDumpArguments(config, database, optionFile, execute);
  const child = spawnProcess(config.dumpCommand, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let rawBytes = 0;
  let timedOut = false;
  // Drain errors without persisting SQL, credentials or server diagnostics in logs.
  child.stderr.resume();
  const finished = new Promise((resolve, reject) => {
    child.once('error', () => reject(new Error('Unable to start mysqldump.')));
    child.once('close', code => code === 0 && !timedOut ? resolve() : reject(new Error(timedOut ? 'Database backup exceeded its time limit.' : `mysqldump failed (exit ${code}); no backup will be uploaded.`)));
  });
  const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, config.timeoutMs);
  timer.unref();
  const counter = new Transform({ transform(chunk, encoding, callback) { rawBytes += chunk.length; callback(null, chunk); } });
  const streaming = pipeline(child.stdout, counter, createGzip({ level: 6 }), fs.createWriteStream(dumpFile, { mode: 0o600, flags: 'wx' }));
  try {
    await Promise.all([finished, streaming]);
    if (!rawBytes) throw new Error('mysqldump returned no SQL; refusing to publish an empty backup.');
    return dumpFile;
  } catch (error) {
    child.kill('SIGKILL');
    await Promise.allSettled([finished, streaming]);
    throw error;
  } finally { clearTimeout(timer); }
}

async function backupDatabase(bucket, config, database, { checkTables = checkDatabaseTables, dump = createCompressedDump, now = () => new Date() } = {}) {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'payday-db-backup-'));
  await fsp.chmod(directory, 0o700);
  try {
    const tables = await checkTables(config, database);
    const localFile = await dump(config, database, directory);
    const stat = await fsp.stat(localFile);
    if (!stat.size) throw new Error('The compressed database backup is empty.');
    const createdAt = now();
    const destination = `${config.prefix}/${database}/${createdAt.toISOString().replace(/[:.]/g, '-')}_${randomUUID()}.sql.gz`;
    await bucket.upload(localFile, {
      destination, resumable: true, validation: 'crc32c', preconditionOpts: { ifGenerationMatch: 0 },
      metadata: { contentType: 'application/gzip', cacheControl: 'no-store', storageClass: 'STANDARD', metadata: { backupKind: OWNER, database, snapshotAt: createdAt.toISOString(), retentionDays: '7', tables: String(tables) } },
    });
    const [remote] = await bucket.file(destination).getMetadata();
    if (Number(remote.size) !== stat.size || remote.metadata?.backupKind !== OWNER) throw new Error('The uploaded backup could not be verified.');
    return { database, object: destination, bytes: stat.size, tables };
  } finally {
    if (path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith('payday-db-backup-')) throw new Error('Refusing to clean an unexpected backup working directory.');
    await fsp.rm(directory, { recursive: true, force: true });
  }
}

function isManagedBackup(file, config) {
  const name = file.name || '';
  const relative = name.startsWith(config.prefix + '/') ? name.slice(config.prefix.length + 1) : '';
  return /^[A-Za-z0-9_$][A-Za-z0-9_$-]{0,63}\/\d{4}-\d{2}-\d{2}T[\dTZ-]+_[a-f0-9-]+\.sql\.gz$/.test(relative) && file.metadata?.metadata?.backupKind === OWNER;
}

async function listBackups(bucket, config) {
  const files = [];
  let query = { prefix: config.prefix + '/', versions: true, autoPaginate: false, maxResults: 100 };
  do {
    const [page, next] = await bucket.getFiles(query);
    files.push(...page.filter(file => isManagedBackup(file, config)));
    query = next ? { ...next, prefix: config.prefix + '/', versions: true, autoPaginate: false, maxResults: 100 } : null;
  } while (query);
  return files;
}

async function cleanupExpiredBackups(bucket, config, files, now = new Date()) {
  let deleted = 0;
  for (const file of files) {
    const created = Date.parse(file.metadata?.timeCreated || '');
    if (!isManagedBackup(file, config) || !Number.isFinite(created) || created > now.getTime() - RETENTION_MS || !file.metadata?.generation) continue;
    try {
      await bucket.file(file.name, { generation: file.metadata.generation, preconditionOpts: { ifGenerationMatch: file.metadata.generation } }).delete({ ignoreNotFound: true });
      deleted++;
    } catch (error) { if (Number(error.code) !== 412) throw error; }
  }
  return deleted;
}

function dailySchedule(now, time) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(part => [part.type, part.value]));
  const today = new Date(`${parts.year}-${parts.month}-${parts.day}T${time}:00+05:30`);
  return { today, due: now < today ? new Date(today.getTime() - 24 * 60 * 60 * 1000) : today };
}

async function runBackupJob(bucket, config, { scheduled = false, cleanupOnly = false, now = new Date(), createBackup = backupDatabase } = {}) {
  // Shared-bucket operation only needs object permissions. No bucket policies
  // or unrelated document metadata are read or modified by the scheduled job.
  const files = await listBackups(bucket, config);
  // Retention is independent of whether today's database snapshot is due.
  const deleted = await cleanupExpiredBackups(bucket, config, files, now);
  const uploaded = [];
  if (!cleanupOnly) {
    const schedule = dailySchedule(now, config.time);
    for (const database of config.databases) {
      if (scheduled) {
        const previous = files.filter(file => file.metadata?.metadata?.database === database && Number(file.metadata.size) > 0 && !file.metadata.timeDeleted);
        if (!previous.length && now < schedule.today) continue; // First backup starts at the requested 21:00 IST, not immediately after deployment.
        if (previous.some(file => { const created = Date.parse(file.metadata.timeCreated); return created >= schedule.due.getTime() && created <= now.getTime(); })) continue;
      }
      uploaded.push(await createBackup(bucket, config, database));
    }
  }
  return { uploaded, deleted, scheduledTime: `${config.time} Asia/Kolkata` };
}

function lockPath(config) {
  const id = createHash('sha256').update(config.bucket + '/' + config.prefix).digest('hex').slice(0, 16);
  return path.join(config.stateDir, `${id}.lock`);
}

module.exports = { RETENTION_MS, OWNER, readBackupConfig, createStorageClient, lifecycleRule, configureBackupLifecycle, checkStorageAccess, getDumpArguments, checkDatabaseTables, optionValue, createCompressedDump, backupDatabase, isManagedBackup, listBackups, cleanupExpiredBackups, dailySchedule, runBackupJob, lockPath };
