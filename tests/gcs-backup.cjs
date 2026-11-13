const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { gunzipSync } = require('node:zlib');
const backup = require('../backend/services/databaseBackup');
const cron = require('../backend/scripts/installGcsBackupCron');
const config = backup.readBackupConfig({ DB_NAME: 'crm', DB_USER: 'reader', DB_PASSWORD: 'synthetic-only-password' });
const now = new Date('2026-11-13T15:30:00Z');
const DAY = 86400000;
const safePolicy = () => ({ metageneration: '5', softDeletePolicy: { retentionDurationSeconds: '0' }, versioning: { enabled: false }, iamConfiguration: { publicAccessPrevention: 'enforced', uniformBucketLevelAccess: { enabled: true } }, lifecycle: { rule: [backup.lifecycleRule(config)] } });
function file(ageDays, extra = {}) {
  const created = new Date(now.getTime() - ageDays * DAY).toISOString();
  return { name: `${config.prefix}/crm/2026-11-01T15-30-00-000Z_1234-abcd.sql.gz`, metadata: { timeCreated: created, generation: '42', size: '100', metadata: { backupKind: backup.OWNER, database: 'crm' }, ...extra } };
}
function bucketFor(files = []) {
  const deletions = [];
  return {
    deletions, getMetadata: async () => { throw Object.assign(new Error('Bucket policy access is unavailable'), { code: 403 }); },
    getFiles: async () => [files, null],
    file(name, options) { return { delete: async () => deletions.push({ name, options }) }; },
  };
}

test('defaults use the existing bucket and isolated folder at 21:00 India time', () => {
  assert.equal(config.bucket, 'waqt-finance-loan-documents-prod');
  assert.equal(config.prefix, 'waqtmoneypay/database-backups');
  assert.equal(backup.readBackupConfig({ DB_NAME: 'crm', DB_USER: 'reader', GCS_BUCKET_NAME: 'existing-bucket' }).bucket, 'existing-bucket');
  assert.equal(config.time, '21:00');
  assert.equal(backup.RETENTION_MS, 7 * DAY);
  assert.equal(backup.dailySchedule(now, config.time).today.toISOString(), '2026-11-13T15:30:00.000Z');
  assert.equal(backup.dailySchedule(new Date('2026-11-13T15:29:59Z'), config.time).due.toISOString(), '2026-11-12T15:30:00.000Z');
});

test('configuration refuses broad prefixes, dump option injection and malformed schedule', () => {
  for (const value of ['', 'uploads/documents', '../database-backups', 'database-backups', '/database-backups/prod']) {
    if (!value) continue;
    assert.throws(() => backup.readBackupConfig({ DB_NAME: 'crm', DB_USER: 'reader', GCS_BACKUP_PREFIX: value }));
  }
  assert.throws(() => backup.readBackupConfig({ DB_NAME: '--all-databases', DB_USER: 'reader' }));
  assert.throws(() => backup.readBackupConfig({ DB_NAME: 'crm', DB_USER: 'reader', GCS_BACKUP_TIME_IST: '24:00' }));
  assert.throws(() => backup.readBackupConfig({ DB_NAME: 'crm' }), /DB_USER/);
  assert.deepEqual(backup.readBackupConfig({ DB_NAME: 'crm', DB_USER: 'reader', GCS_BACKUP_DATABASES: 'crm,master,crm' }).databases, ['crm', 'master']);
});

test('optional lifecycle setup refuses conflicting retention and early deletion without mutations', async () => {
  for (const patch of [
    { retentionPolicy: { retentionPeriod: '691200' } }, { defaultEventBasedHold: true },
    { lifecycle: { rule: [{ action: { type: 'Delete' }, condition: { age: 1 } }] } },
  ]) await assert.rejects(backup.configureBackupLifecycle({ getMetadata: async () => [{ ...safePolicy(), ...patch }], setMetadata: async () => { assert.fail('must not mutate conflicting policies'); } }, config));
});

test('bucket setup preserves unrelated lifecycle rules and uses a metadata precondition', async () => {
  const metadata = safePolicy();
  metadata.lifecycle.rule.push({ action: { type: 'Delete' }, condition: { age: 30, matchesPrefix: ['another-folder/'] } });
  let update;
  const bucket = { getMetadata: async () => [metadata], setMetadata: async (values, options) => { update = { values, options }; } };
  await backup.configureBackupLifecycle(bucket, config);
  assert.equal(update.values.lifecycle.rule.length, 2);
  assert.equal(update.options.ifMetagenerationMatch, '5');
  assert.deepEqual(Object.keys(update.values), ['lifecycle']);
  assert.deepEqual(update.values.lifecycle.rule[1], metadata.lifecycle.rule[1]);
  metadata.lifecycle.rule = [metadata.lifecycle.rule[1]];
  await backup.configureBackupLifecycle(bucket, config);
  assert.deepEqual(update.values.lifecycle.rule[1], backup.lifecycleRule(config));
});

function probeBucket({ extraDays = 7 } = {}) {
  const deletions = [];
  return { deletions, file(name, options) { return {
    save: async (data, opts) => { assert.ok(!data.includes('CREATE TABLE')); assert.equal(opts.preconditionOpts.ifGenerationMatch, 0); },
    getMetadata: async opts => {
      if (!opts?.softDeleted) return [{ generation: '99', size: '50' }];
      if (!extraDays) throw Object.assign(new Error('not found'), { code: 404 });
      assert.equal(options.generation, '99');
      return [{ softDeleteTime: now.toISOString(), hardDeleteTime: new Date(now.getTime() + extraDays * DAY).toISOString() }];
    },
    delete: async () => { assert.equal(options.preconditionOpts.ifGenerationMatch, '99'); deletions.push(name); },
  }; } };
}

test('storage probe checks anonymous denial and reports extra shared-bucket Soft Delete retention', async () => {
  for (const extraDays of [0, 7]) {
    const bucket = probeBucket({ extraDays });
    assert.deepEqual(await backup.checkStorageAccess(bucket, config, async () => ({ status: 403 })), { privateAccessVerified: true, softDeleteExtraDays: extraDays });
    assert.equal(bucket.deletions.length, 1);
  }
});

test('publicly accessible storage fails closed and deletes the non-database probe', async () => {
  const bucket = probeBucket();
  await assert.rejects(backup.checkStorageAccess(bucket, config, async () => ({ status: 200 })), /Anonymous access/);
  assert.equal(bucket.deletions.length, 1);
});

test('MySQL dump flags make a streaming non-locking snapshot with no credentials on the command line', async () => {
  const args = await backup.getDumpArguments(config, 'crm', '/private/mysql.cnf', async () => ({ stdout: 'mysqldump Ver 8.0.40 for Linux' }));
  assert.equal(args[0], '--defaults-file=/private/mysql.cnf');
  for (const flag of ['--single-transaction', '--quick', '--no-tablespaces', '--routines', '--triggers', '--events', '--hex-blob', '--skip-lock-tables', '--set-gtid-purged=OFF', '--column-statistics=0']) assert.ok(args.includes(flag));
  assert.equal(args.at(-1), 'crm');
  assert.ok(!args.join(' ').includes(config.db.password));
  assert.ok(!args.some(arg => /flush-logs|master-data|source-data|all-databases/.test(arg)));
  const maria = await backup.getDumpArguments(config, 'crm', '/private/mysql.cnf', async () => ({ stdout: 'mariadb-dump Ver 10.19 Distrib 10.11.6-MariaDB' }));
  assert.ok(!maria.some(arg => /gtid-purged|column-statistics/.test(arg)));
});

test('database preflight only reads information_schema and refuses non-transactional tables', async () => {
  const queries = [];
  let destroyed = false;
  const mysql = { createConnection: () => ({ query(sql, params, callback) { queries.push({ sql, params }); callback(null, [{ TABLE_NAME: 'loans', ENGINE: 'InnoDB' }]); }, destroy() { destroyed = true; } }) };
  assert.equal(await backup.checkDatabaseTables(config, 'crm', mysql), 1);
  assert.ok(destroyed);
  assert.match(queries[0].sql, /^SELECT .*INFORMATION_SCHEMA\.TABLES/);
  assert.deepEqual(queries[0].params, ['crm', 'BASE TABLE']);
  const unsupported = { createConnection: () => ({ query(sql, params, callback) { callback(null, [{ TABLE_NAME: 'old', ENGINE: 'MyISAM' }]); }, destroy() {} }) };
  await assert.rejects(backup.checkDatabaseTables(config, 'crm', unsupported), /InnoDB/);
});

test('credential option-file quoting handles quotes, backslashes and newlines', () => {
  assert.equal(backup.optionValue('a"b\\c\nd'), '"a\\"b\\\\c\\nd"');
  assert.throws(() => backup.optionValue('a\0b'));
});

test('a verified gzip SQL snapshot uploads privately and removes all temporary files', async () => {
  let uploaded, directory;
  const bucket = {
    async upload(filename, options) { directory = path.dirname(filename); uploaded = { bytes: await fsp.readFile(filename), options }; },
    file() { return { getMetadata: async () => [{ size: String(uploaded.bytes.length), metadata: { backupKind: backup.OWNER } }] }; },
  };
  const dump = (cfg, db, dir) => backup.createCompressedDump(cfg, db, dir, {
    execute: async () => ({ stdout: 'mysqldump Ver 8.0.40' }),
    spawnProcess(command, args, options) {
      assert.ok(!args.includes(config.db.password));
      assert.equal(options.shell, false);
      return spawn(process.execPath, ['-e', 'process.stdout.write("-- synthetic SQL backup\\nCREATE TABLE sample (id INT);\\n")'], options);
    },
  });
  const result = await backup.backupDatabase(bucket, config, 'crm', { checkTables: async () => 1, dump, now: () => now });
  assert.match(gunzipSync(uploaded.bytes).toString(), /CREATE TABLE sample/);
  assert.ok(result.object.startsWith(config.prefix + '/crm/'));
  assert.ok(result.object.endsWith('.sql.gz'));
  assert.equal(uploaded.options.validation, 'crc32c');
  assert.equal(uploaded.options.preconditionOpts.ifGenerationMatch, 0);
  assert.equal(uploaded.options.metadata.cacheControl, 'no-store');
  assert.equal(uploaded.options.metadata.contentType, 'application/gzip');
  assert.equal(uploaded.options.metadata.metadata.retentionDays, '7');
  assert.ok(!fs.existsSync(directory));
});

test('failed or empty dumps cannot publish partial backups and always clean private temporary files', async () => {
  for (const js of ['process.stdout.write("partial");process.exit(1)', 'process.exit(0)']) {
    let directory;
    let uploads = 0;
    const dump = (cfg, db, dir) => { directory = dir; return backup.createCompressedDump(cfg, db, dir, { execute: async () => ({ stdout: 'mysqldump Ver 8.0.40' }), spawnProcess: (command, args, options) => spawn(process.execPath, ['-e', js], options) }); };
    await assert.rejects(backup.backupDatabase({ upload: async () => { uploads++; } }, config, 'crm', { checkTables: async () => 1, dump }));
    assert.equal(uploads, 0);
    assert.ok(!fs.existsSync(directory));
  }
});

test('upload failures remove temporary credentials and SQL archives', async () => {
  let directory;
  await assert.rejects(backup.backupDatabase({ upload: async () => { throw new Error('synthetic upload failure'); } }, config, 'crm', {
    checkTables: async () => 1,
    dump: async (cfg, db, dir) => { directory = dir; const filename = path.join(dir, 'test.gz'); await fsp.writeFile(filename, 'test'); return filename; },
  }), /synthetic upload failure/);
  assert.ok(!fs.existsSync(directory));
});

test('cleanup deletes only managed SQL backups at least 168 hours old and pins the exact generation', async () => {
  const expired = file(7);
  const files = [expired, file(6.999), file(-1), file(8, { timeCreated: '' }), { ...file(9), name: 'loan-documents/a.pdf' }, file(10, { metadata: { backupKind: 'another-system' } })];
  const bucket = bucketFor(files);
  assert.equal(await backup.cleanupExpiredBackups(bucket, config, files, now), 1);
  assert.deepEqual(bucket.deletions, [{ name: expired.name, options: { generation: '42', preconditionOpts: { ifGenerationMatch: '42' } } }]);
});

test('generation races preserve replacement objects', async () => {
  const bucket = { file: () => ({ delete: async () => { throw Object.assign(new Error('generation replaced'), { code: 412 }); } }) };
  assert.equal(await backup.cleanupExpiredBackups(bucket, config, [file(8)], now), 0);
});

test('list pagination keeps the prefix and includes historical generations', async () => {
  const queries = [];
  const bucket = { getFiles: async query => { queries.push(query); return query.pageToken ? [[file(8)], null] : [[file(1)], { pageToken: 'second' }]; } };
  assert.equal((await backup.listBackups(bucket, config)).length, 2);
  assert.ok(queries.every(query => query.prefix === config.prefix + '/' && query.versions === true && query.autoPaginate === false));
});

test('first scheduled run waits for 21:00 IST, then skips duplicate successful daily snapshots', async () => {
  let snapshots = 0;
  const createBackup = async () => { snapshots++; return { database: 'crm' }; };
  await backup.runBackupJob(bucketFor(), config, { scheduled: true, now: new Date('2026-11-13T15:29:59Z'), createBackup });
  assert.equal(snapshots, 0);
  await backup.runBackupJob(bucketFor(), config, { scheduled: true, now, createBackup });
  assert.equal(snapshots, 1);
  await backup.runBackupJob(bucketFor([file(0)]), config, { scheduled: true, now: new Date('2026-11-13T16:30:00Z'), createBackup });
  assert.equal(snapshots, 1);
  await backup.runBackupJob(bucketFor([file(0)]), config, { scheduled: true, now: new Date('2026-11-14T15:30:00Z'), createBackup });
  assert.equal(snapshots, 2);
});

test('expiry cleanup runs even when the daily backup is not due', async () => {
  const bucket = bucketFor([file(8), file(0)]);
  const result = await backup.runBackupJob(bucket, config, { scheduled: true, now, createBackup: async () => { throw new Error('should not dump'); } });
  assert.equal(result.deleted, 1);
  assert.equal(result.uploaded.length, 0);
});

test('cron is timezone-independent, locked, idempotent and preserves unrelated jobs', () => {
  const block = cron.makeCron({ ...config, stateDir: '/home/example/private/backups' }, '/usr/bin/node');
  assert.ok(block.includes('*/5 * * * *'));
  assert.ok(block.includes('21:00'));
  assert.ok(block.includes('flock -n'));
  assert.ok(block.includes('--scheduled'));
  assert.ok(!block.includes(config.db.password));
  const existing = 'MAILTO=ops@example.test\n0 1 * * * /unrelated/job\n';
  const first = cron.replaceManagedCron(existing, block);
  assert.equal(cron.replaceManagedCron(first, block), first);
  assert.ok(first.includes('/unrelated/job'));
  assert.ok(cron.replaceManagedCron(first, '').includes('/unrelated/job'));
  assert.throws(() => cron.replaceManagedCron('# BEGIN PAYDAY CRM GCS DATABASE BACKUP\n', block));
});

test('backup scripts never import the app, schema or database bootstraps', () => {
  for (const file of ['backend/services/databaseBackup.js', 'backend/scripts/backupDatabaseToGcs.js', 'backend/scripts/installGcsBackupCron.js']) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    assert.ok(!/require\(['"].*(?:config\/db|database\/|index\.js|app\.js)['"]\)/.test(source));
  }
  const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/deploy-database-backup.yml'), 'utf8');
  assert.ok(!/node index\.js|npm run setup|restart\.txt|fuser|kill-port/.test(workflow));
  assert.ok(workflow.includes('--check') && workflow.includes('--install'));
});
