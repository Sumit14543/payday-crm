const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash, randomUUID } = require('node:crypto');
const { Transform, Writable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const APP_ROOT = path.resolve(__dirname, '..');
const OWNER = 'payday-document-mirror-v1';
const digest = value => createHash('sha256').update(value).digest('hex');
const inside = (base, target) => target === base || target.startsWith(base + path.sep);
const signature = stat => [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(':');

function readSyncConfig(env = process.env) {
  const bucket = String(env.GCS_BUCKET_NAME || 'waqt-finance-loan-documents-prod').trim();
  const prefix = String(env.GCS_PREFIX || 'waqtmoney-documents/test-uploads').replace(/^\/+|\/+$/g, '');
  if (!/^[a-z0-9][a-z0-9._-]+[a-z0-9]$/.test(bucket) || bucket.includes('..')) throw new Error('Invalid document bucket.');
  if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(prefix) || /(?:^|\/)(?:database-backups|backups)(?:\/|$)/.test(prefix)) throw new Error('Use a separate document prefix, outside database backups.');
  const configured = env.UPLOADS_DIR ? path.resolve(APP_ROOT, env.UPLOADS_DIR) : path.join(APP_ROOT, 'uploads');
  const roots = [...new Set([configured, path.join(APP_ROOT, 'uploads'), path.join(os.tmpdir(), 'payday-uploads')])];
  const stateDir = path.resolve(env.GCS_DOCUMENT_SYNC_STATE_DIR || path.join(os.homedir(), '.local', 'state', 'payday-crm-document-sync'));
  if (inside(APP_ROOT, stateDir) || roots.some(root => inside(root, stateDir))) throw new Error('Document sync state must be outside the application and uploads directories.');
  const id = digest(bucket + '/' + prefix).slice(0, 24);
  return {
    enabled: ['1', 'true', 'yes', 'on'].includes(String(env.ENABLE_GCS_SYNC || '').trim().toLowerCase()),
    bucket, prefix, roots, stateDir, stateFile: path.join(stateDir, id + '.json'), lockFile: path.join(stateDir, id + '.lock'),
    stabilityMs: 20000, concurrency: 2,
  };
}

async function prepareState(config) {
  await fsp.mkdir(config.stateDir, { recursive: true, mode: 0o700 });
  await fsp.chmod(config.stateDir, 0o700);
}

async function loadState(config) {
  try {
    const parsed = JSON.parse(await fsp.readFile(config.stateFile, 'utf8'));
    if (parsed.version !== 1 || !parsed.files || typeof parsed.files !== 'object') return { version: 1, files: {} };
    return parsed;
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return { version: 1, files: {} };
    throw error;
  }
}

async function saveState(config, state) {
  const temporary = path.join(config.stateDir, `manifest-${randomUUID()}.tmp`);
  await fsp.writeFile(temporary, JSON.stringify(state), { mode: 0o600, flag: 'wx' });
  await fsp.rename(temporary, config.stateFile);
}

async function scanLocalFiles(config) {
  const files = [], seen = new Set(), destinations = new Set();
  let readErrors = 0, symlinks = 0;
  let active;
  for (const root of config.roots) {
    try { await fsp.access(root, fs.constants.W_OK); if ((await fsp.stat(root)).isDirectory()) { active = root; break; } } catch {}
  }
  for (const root of [...new Set([active, ...config.roots].filter(Boolean))]) {
    async function walk(directory) {
      let entries;
      try { entries = await fsp.readdir(directory, { withFileTypes: true }); }
      catch (error) { if (error.code !== 'ENOENT') readErrors++; return; }
      for (const entry of entries) {
        const filename = path.resolve(directory, entry.name);
        if (!inside(root, filename) || seen.has(filename)) continue;
        seen.add(filename);
        if (entry.isSymbolicLink()) { symlinks++; continue; }
        if (entry.isDirectory()) { await walk(filename); continue; }
        if (!entry.isFile() || ['.htaccess', '.gitkeep', '.DS_Store'].includes(entry.name)) continue;
        const relative = path.relative(root, filename).split(path.sep).join('/');
        // The configured root wins canonical-path collisions. Preserve other
        // source copies separately instead of overwriting either document.
        const collision = destinations.has(relative);
        destinations.add(relative);
        const destination = `${config.prefix}/${collision ? '_source-copies/' + digest(root).slice(0, 16) + '/' : ''}${relative}`;
        files.push({ filename, destination, id: digest(filename + '\0' + destination), collision });
      }
    }
    await walk(root);
  }
  return { files, readErrors, symlinks };
}

async function listRemoteFiles(bucket, config) {
  const remote = new Map();
  let query = { prefix: config.prefix + '/', autoPaginate: false, maxResults: 1000 };
  do {
    const [files, next] = await bucket.getFiles(query);
    for (const file of files) remote.set(file.name, file.metadata);
    query = next ? { ...next, prefix: config.prefix + '/', autoPaginate: false, maxResults: 1000 } : null;
  } while (query);
  return remote;
}

async function stableRead(filename, expected, snapshot) {
  const handle = await fsp.open(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  const hash = createHash('md5');
  try {
    if (signature(await handle.stat()) !== signature(expected)) throw Object.assign(new Error('Source changed.'), { code: 'SOURCE_CHANGED' });
    const meter = new Transform({ transform(chunk, encoding, done) { hash.update(chunk); done(null, chunk); } });
    await pipeline(handle.createReadStream({ autoClose: false }), meter, snapshot ? fs.createWriteStream(snapshot, { mode: 0o600, flags: 'wx' }) : new Writable({ write(chunk, encoding, done) { done(); } }));
    const after = await fsp.lstat(filename);
    if (!after.isFile() || after.isSymbolicLink() || signature(after) !== signature(expected)) throw Object.assign(new Error('Source changed.'), { code: 'SOURCE_CHANGED' });
    return hash.digest('base64');
  } finally { await handle.close(); }
}

function contentType(filename) {
  return ({ '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.json': 'application/json', '.txt': 'text/plain' })[path.extname(filename).toLowerCase()] || 'application/octet-stream';
}

async function uploadSnapshot(bucket, config, entry, stat, existing) {
  const directory = await fsp.mkdtemp(path.join(config.stateDir, 'snapshot-'));
  try {
    await fsp.chmod(directory, 0o700);
    const snapshot = path.join(directory, 'document');
    const md5 = await stableRead(entry.filename, stat, snapshot);
    if (existing) {
      if (!/^\d+$/.test(String(existing.generation || ''))) throw new Error('Remote generation unavailable.');
      const history = `${config.prefix}/_sync-history/${digest(entry.destination)}/${existing.generation}${path.extname(entry.filename)}`;
      try {
        await bucket.file(entry.destination, { generation: existing.generation }).copy(bucket.file(history), { preconditionOpts: { ifGenerationMatch: 0 } });
      } catch (error) { if (Number(error.code) !== 412) throw error; }
    }
    await bucket.upload(snapshot, {
      destination: entry.destination, resumable: stat.size >= 10 * 1024 * 1024, validation: 'crc32c',
      preconditionOpts: { ifGenerationMatch: existing ? existing.generation : 0 },
      metadata: { contentType: contentType(entry.filename), cacheControl: 'private, no-store', metadata: { syncOwner: OWNER, sourceModifiedAt: stat.mtime.toISOString() } },
    });
    const [metadata] = await bucket.file(entry.destination).getMetadata();
    if (Number(metadata.size) !== stat.size || metadata.md5Hash !== md5) throw Object.assign(new Error('Uploaded document verification failed.'), { code: 'CHECKSUM_MISMATCH' });
    const after = await fsp.lstat(entry.filename);
    return { md5, metadata, sourceUnchanged: after.isFile() && !after.isSymbolicLink() && signature(after) === signature(stat) };
  } finally {
    if (path.dirname(path.resolve(directory)) !== path.resolve(config.stateDir) || !path.basename(directory).startsWith('snapshot-')) throw new Error('Unexpected document snapshot directory.');
    await fsp.rm(directory, { recursive: true, force: true });
  }
}

async function runSync(bucket, config, { verifyOnly = false, budgetMs = 4 * 60 * 1000, now = () => Date.now(), onProgress = () => {} } = {}) {
  if (!config.enabled) throw new Error('Document sync is disabled by ENABLE_GCS_SYNC.');
  const started = now();
  await prepareState(config);
  const state = await loadState(config);
  const remote = await listRemoteFiles(bucket, config);
  const scan = await scanLocalFiles(config);
  const result = { scanned: scan.files.length, verified: 0, uploaded: 0, wouldUpload: 0, deferred: 0, failed: 0, failureCodes: {}, readErrors: scan.readErrors, skippedSymlinks: scan.symlinks, sourceCollisions: 0, unprocessed: 0 };
  let cursor = 0, lastSaved = started;
  let saving = Promise.resolve();
  const checkpoint = async force => {
    if (force || now() - lastSaved > 10000) {
      lastSaved = now();
      saving = saving.then(() => saveState(config, state));
      await saving;
      onProgress({ ...result, processed: cursor });
    }
  };
  async function worker() {
    while (cursor < scan.files.length && now() - started < budgetMs) {
      const entry = scan.files[cursor++];
      if (entry.collision) result.sourceCollisions++;
      try {
        const stat = await fsp.lstat(entry.filename);
        if (!stat.isFile() || stat.isSymbolicLink() || (config.stabilityMs > 0 && now() - stat.mtimeMs < config.stabilityMs)) { result.deferred++; continue; }
        const previous = state.files[entry.id];
        let md5 = previous?.signature === signature(stat) ? previous.md5 : null;
        if (!md5) md5 = await stableRead(entry.filename, stat);
        const existing = remote.get(entry.destination);
        if (existing && Number(existing.size) === stat.size && existing.md5Hash === md5) {
          state.files[entry.id] = { signature: signature(stat), md5, generation: existing.generation };
          result.verified++;
        } else if (verifyOnly) result.wouldUpload++;
        else {
          const uploaded = await uploadSnapshot(bucket, config, entry, stat, existing);
          remote.set(entry.destination, uploaded.metadata);
          result.uploaded++;
          if (uploaded.sourceUnchanged) state.files[entry.id] = { signature: signature(stat), md5: uploaded.md5, generation: uploaded.metadata.generation };
          else { delete state.files[entry.id]; result.deferred++; }
        }
      } catch (error) {
        if (error.code === 'SOURCE_CHANGED' || error.code === 'ENOENT' || Number(error.code) === 412) result.deferred++;
        else {
          result.failed++;
          const code = /^[A-Z0-9_]+$/.test(String(error.code || '')) ? String(error.code) : 'ERROR';
          result.failureCodes[code] = (result.failureCodes[code] || 0) + 1;
        }
        delete state.files[entry.id];
      }
      await checkpoint(false);
    }
  }
  await Promise.all(Array.from({ length: config.concurrency }, worker));
  result.unprocessed = scan.files.length - cursor;
  await checkpoint(true);
  result.durationSeconds = Math.round((now() - started) / 1000);
  result.complete = !result.failed && !result.readErrors && !result.skippedSymlinks && !result.wouldUpload && !result.deferred && !result.unprocessed;
  return result;
}

module.exports = { OWNER, readSyncConfig, prepareState, loadState, saveState, scanLocalFiles, listRemoteFiles, stableRead, uploadSnapshot, runSync, signature };
