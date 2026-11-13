const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const sync = require('../backend/services/gcsDocumentSync');
const cron = require('../backend/scripts/installGcsDocumentSyncCron');
const md5 = data => createHash('md5').update(data).digest('base64');

async function fixture(run) {
  const base = await fsp.mkdtemp(path.join(os.tmpdir(), 'payday-document-sync-test-'));
  const uploads = path.join(base, 'uploads'), stateDir = path.join(base, 'private-state');
  await fsp.mkdir(uploads);
  const config = { ...sync.readSyncConfig({ ENABLE_GCS_SYNC: 'true' }), roots: [uploads], stateDir, stateFile: path.join(stateDir, 'state.json'), lockFile: path.join(stateDir, 'sync.lock'), stabilityMs: 0 };
  async function file(relative, content = 'synthetic document') { const filename = path.join(uploads, relative); await fsp.mkdir(path.dirname(filename), { recursive: true }); await fsp.writeFile(filename, content); return filename; }
  try { await run({ base, uploads, config, file }); }
  finally {
    assert.equal(path.dirname(path.resolve(base)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(base).startsWith('payday-document-sync-test-'));
    await fsp.rm(base, { recursive: true, force: true });
  }
}

function fakeBucket() {
  const objects = new Map(), writes = [], copies = [];
  let generation = 0;
  const bucket = {
    objects, writes, copies, failUpload: false, race: false,
    put(name, data) { const bytes = Buffer.from(data); objects.set(name, { bytes, metadata: { size: String(bytes.length), md5Hash: md5(bytes), generation: String(++generation) } }); },
    async getFiles(query) { assert.equal(query.autoPaginate, false); return [[...objects].filter(([name]) => name.startsWith(query.prefix)).map(([name, item]) => ({ name, metadata: { ...item.metadata } })), null]; },
    file(name, options) { return {
      name,
      getMetadata: async () => { const item = objects.get(name); if (!item) throw Object.assign(new Error('not found'), { code: 404 }); return [{ ...item.metadata }]; },
      async copy(target, opts) {
        const item = objects.get(name);
        assert.equal(options.generation, item.metadata.generation);
        assert.equal(opts.preconditionOpts.ifGenerationMatch, 0);
        if (objects.has(target.name)) throw Object.assign(new Error('exists'), { code: 412 });
        copies.push(target.name); bucket.put(target.name, item.bytes);
      },
    }; },
    async upload(filename, options) {
      if (bucket.failUpload) throw Object.assign(new Error('synthetic outage'), { code: 503 });
      const existing = objects.get(options.destination);
      if (bucket.race || (options.preconditionOpts.ifGenerationMatch === 0 ? existing : existing?.metadata.generation !== options.preconditionOpts.ifGenerationMatch)) throw Object.assign(new Error('generation race'), { code: 412 });
      const bytes = await fsp.readFile(filename);
      writes.push({ ...options, snapshot: filename });
      bucket.put(options.destination, bytes);
      objects.get(options.destination).metadata.metadata = options.metadata.metadata;
    },
  };
  return bucket;
}

test('configuration isolates document state and rejects database-backup destinations', () => {
  const config = sync.readSyncConfig({ ENABLE_GCS_SYNC: 'true', GCS_PREFIX: 'waqtmoney-documents/test-uploads' });
  assert.equal(config.enabled, true);
  assert.ok(config.prefix.includes('waqtmoney-documents'));
  for (const prefix of ['waqtmoneypay/database-backups', 'backups', '../documents', 'documents/../backups']) assert.throws(() => sync.readSyncConfig({ GCS_PREFIX: prefix }));
  assert.throws(() => sync.readSyncConfig({ GCS_DOCUMENT_SYNC_STATE_DIR: path.resolve(__dirname, '../backend/uploads/state') }));
});

test('all upload/generated categories, including signed PDFs, mirror with checksum verification and no local deletion', async () => fixture(async ({ config, file }) => {
  const paths = ['lead-documents/test.pdf', 'cibil/test.pdf', 'sanctions/test.pdf', 'agreements/test.pdf', 'agreements/signed/test.pdf', 'payment-proofs/test.png', 'nested/unknown/test.bin'];
  const filenames = [];
  for (const relative of paths) filenames.push(await file(relative, relative));
  const bucket = fakeBucket();
  const result = await sync.runSync(bucket, config);
  assert.equal(result.uploaded, paths.length);
  assert.equal(result.complete, true);
  assert.equal(bucket.objects.size, paths.length);
  for (const write of bucket.writes) {
    assert.equal(write.validation, 'crc32c');
    assert.equal(write.preconditionOpts.ifGenerationMatch, 0);
    assert.equal(write.metadata.cacheControl, 'private, no-store');
    assert.equal(write.metadata.metadata.syncOwner, sync.OWNER);
    assert.ok(!fs.existsSync(write.snapshot));
  }
  for (const filename of filenames) assert.ok(fs.existsSync(filename));
  assert.equal((await fsp.readdir(config.stateDir)).filter(name => name.startsWith('snapshot-')).length, 0);
}));

test('restart skips verified documents and checks the remote inventory again', async () => fixture(async ({ config, file }) => {
  await file('cibil/one.pdf');
  const bucket = fakeBucket();
  await sync.runSync(bucket, config);
  const second = await sync.runSync(bucket, config);
  assert.equal(second.uploaded, 0);
  assert.equal(second.verified, 1);
  assert.equal(bucket.writes.length, 1);
  bucket.objects.clear();
  assert.equal((await sync.runSync(bucket, config)).uploaded, 1);
}));

test('a transient upload failure retries from the durable source on the next run', async () => fixture(async ({ config, file }) => {
  const filename = await file('agreements/signed/retry.pdf');
  const bucket = fakeBucket(); bucket.failUpload = true;
  const failed = await sync.runSync(bucket, config);
  assert.equal(failed.failed, 1);
  assert.ok(fs.existsSync(filename));
  assert.equal((await fsp.readdir(config.stateDir)).filter(name => name.startsWith('snapshot-')).length, 0);
  bucket.failUpload = false;
  assert.equal((await sync.runSync(bucket, config)).uploaded, 1);
}));

test('same-size different content is detected and the old cloud revision is preserved', async () => fixture(async ({ config, file }) => {
  const filename = await file('sanctions/changed.pdf', 'original');
  const bucket = fakeBucket(); await sync.runSync(bucket, config);
  await fsp.writeFile(filename, 'modified');
  const changed = await sync.runSync(bucket, config);
  assert.equal(changed.uploaded, 1);
  assert.equal(bucket.copies.length, 1);
  assert.ok(bucket.objects.get(bucket.copies[0]).bytes.equals(Buffer.from('original')));
  assert.equal(bucket.objects.get(config.prefix + '/sanctions/changed.pdf').bytes.toString(), 'modified');
}));

test('generation races do not overwrite another writer and leave the source available for retry', async () => fixture(async ({ config, file }) => {
  const filename = await file('race.pdf');
  const bucket = fakeBucket(); bucket.race = true;
  const result = await sync.runSync(bucket, config);
  assert.equal(result.deferred, 1);
  assert.equal(bucket.writes.length, 0);
  assert.ok(fs.existsSync(filename));
}));

test('verify mode reports missing or mismatched files without cloud writes', async () => fixture(async ({ config, file }) => {
  await file('cibil/missing.pdf');
  const bucket = fakeBucket();
  const result = await sync.runSync(bucket, config, { verifyOnly: true });
  assert.equal(result.wouldUpload, 1);
  assert.equal(result.complete, false);
  assert.equal(bucket.writes.length, 0);
}));

test('files still being written are deferred and hashed reads reject changed sources', async () => fixture(async ({ config, file }) => {
  const filename = await file('writing.pdf', 'old');
  const stat = await fsp.stat(filename);
  await fsp.writeFile(filename, 'new-and-longer');
  await assert.rejects(sync.stableRead(filename, stat), error => error.code === 'SOURCE_CHANGED');
  const bucket = fakeBucket();
  const result = await sync.runSync(bucket, { ...config, stabilityMs: 60000 });
  assert.equal(result.deferred, 1);
  assert.equal(bucket.writes.length, 0);
}));

test('conflicting legacy-root files preserve both sources under separate cloud keys', async () => fixture(async ({ config, file, base }) => {
  await file('same.pdf', 'primary');
  const legacy = path.join(base, 'legacy'); await fsp.mkdir(legacy); await fsp.writeFile(path.join(legacy, 'same.pdf'), 'legacy');
  const bucket = fakeBucket();
  const result = await sync.runSync(bucket, { ...config, roots: [...config.roots, legacy] });
  assert.equal(result.sourceCollisions, 1);
  assert.equal(result.uploaded, 2);
  assert.equal(bucket.objects.get(config.prefix + '/same.pdf').bytes.toString(), 'primary');
  assert.equal([...bucket.objects].find(([name]) => name.includes('/_source-copies/'))[1].bytes.toString(), 'legacy');
}));

test('partial run resumes remaining files and a damaged hash cache does not prevent source recovery', async () => fixture(async ({ config, file }) => {
  await file('one.pdf');
  const bucket = fakeBucket();
  const partial = await sync.runSync(bucket, config, { budgetMs: 0 });
  assert.equal(partial.unprocessed, 1);
  await fsp.writeFile(config.stateFile, 'interrupted JSON');
  assert.equal((await sync.runSync(bucket, config)).uploaded, 1);
}));

test('prefix pagination remains isolated and never enumerates/deletes database backups', async () => {
  const config = sync.readSyncConfig({ ENABLE_GCS_SYNC: 'true' });
  const queries = [];
  const bucket = { getFiles: async query => { queries.push(query); return [[], query.pageToken ? null : { pageToken: 'second', prefix: 'wrong/' }]; } };
  await sync.listRemoteFiles(bucket, config);
  assert.equal(queries.length, 2);
  assert.ok(queries.every(query => query.prefix === config.prefix + '/'));
});

test('cron installs one locked minute-wise mirror and preserves the database backup and other jobs', () => {
  const config = sync.readSyncConfig({ ENABLE_GCS_SYNC: 'true' });
  const block = cron.makeCron(config, '/usr/bin/node');
  assert.ok(block.includes('* * * * *'));
  assert.ok(block.includes('flock -n'));
  const existing = '# BEGIN PAYDAY CRM GCS DATABASE BACKUP\n*/5 * * * * node backup\n# END PAYDAY CRM GCS DATABASE BACKUP\n0 0 * * * unrelated\n';
  const installed = cron.replaceManagedCron(existing, block);
  assert.equal(cron.replaceManagedCron(installed, block), installed);
  assert.ok(installed.includes('node backup'));
  assert.ok(cron.replaceManagedCron(installed, '').includes('unrelated'));
  assert.throws(() => cron.replaceManagedCron('# BEGIN PAYDAY CRM GCS DOCUMENT SYNC\n', block));
});

test('independent mirror has no DB bootstraps, bucket-policy changes or delete operations', () => {
  const source = fs.readFileSync(path.join(__dirname, '../backend/services/gcsDocumentSync.js'), 'utf8');
  assert.ok(!/config\/db|\.delete\(|deleteFiles|setMetadata|makePublic|setIamPolicy/.test(source));
  const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/deploy-gcs-document-sync.yml'), 'utf8');
  assert.ok(!/node index\.js|restart\.txt|npm run setup|--delete/.test(workflow));
  for (const name of ['backend/services/gcsDocumentSync.js', 'backend/scripts/syncDocumentsToGcs.js', 'backend/scripts/installGcsDocumentSyncCron.js', '.github/workflows/deploy-gcs-document-sync.yml']) assert.ok(fs.readFileSync(path.join(__dirname, '../.github/workflows/deploy-production.yml'), 'utf8').includes(name));
});
