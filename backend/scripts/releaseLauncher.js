// Private release entrypoint. The manager supplies an immutable release path;
// shared uploads and current credentials stay outside version rollback.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const release = path.resolve(process.argv[2]);
const config = JSON.parse(fs.readFileSync(path.join(release, 'release.json'), 'utf8'));
const backend = path.join(release, 'backend'), controlKey = fs.readFileSync(path.join(release, 'runtime/control.key'), 'utf8').trim();
Object.assign(process.env, { NODE_ENV: 'production', PORT: String(config.port), BIND_ADDRESS: '127.0.0.1', CRM_MANAGED_RELEASE: 'true', CRM_RELEASE_ID: config.id, INTEGRATION_LEGACY_SOURCE: config.legacySource || '', UPLOADS_DIR: config.sharedRoot + '/uploads', GOOGLE_APPLICATION_CREDENTIALS: config.sharedRoot + '/gcp-key.json' });
process.chdir(config.sharedRoot);
const db = require(path.join(backend, 'config/db'));
// Older dotenv loaders overwrite externally supplied PORT/UPLOADS_DIR.
Object.assign(process.env, { NODE_ENV: 'production', PORT: String(config.port), BIND_ADDRESS: '127.0.0.1', UPLOADS_DIR: config.sharedRoot + '/uploads' });
let ready = false, active = 0, activated = false, draining = false, syncRunning = false, interval, server;
// Existing production schema is preflighted. Rollout/rollback must never run
// historical repair/seed code as a side effect of starting a saved application.
const bootstrapFile = require.resolve(path.join(backend, 'database/bootstrap'));
require.cache[bootstrapFile] = { id: bootstrapFile, filename: bootstrapFile, loaded: true, exports: { bootstrap: async () => { await db.connectDatabase(); await db.query('SELECT 1 AS ok'); ready = true; } } };
const app = require(path.join(backend, 'app'));
const originalHandle = app.handle;
function authorized(req) {
  const value = String(req.headers['x-release-control'] || '');
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) && value.length === controlKey.length && crypto.timingSafeEqual(Buffer.from(value), Buffer.from(controlKey));
}
async function sync() {
  if (syncRunning || draining || !activated) return;
  syncRunning = true;
  try {
    const env = require(path.join(backend, 'config/env')).config;
    const tenants = [{ slug: 'waqtfinance', db_name: env.db.database }, ...await db.queryMaster('SELECT * FROM tenants WHERE status="active"')];
    const seen = new Set();
    for (const tenant of tenants) {
      if (seen.has(tenant.slug) || draining) continue;
      seen.add(tenant.slug);
      const pool = db.getTenantPool(tenant);
      await db.tenantLocalStorage.run({ pool, tenant }, () => require(path.join(backend, 'models/collectionModel')).syncOverdueLoans());
    }
  } catch (error) { console.error('[RELEASE SYNC]', error.code || error.name); }
  finally { syncRunning = false; }
}
app.handle = function(req, res, next) {
  res.setHeader('X-CRM-Release', config.id);
  if (req.url.startsWith('/__release/')) {
    if (!authorized(req)) { res.statusCode = 404; return res.end(); }
    const action = req.url.split('?')[0].slice('/__release/'.length);
    if (action === 'activate' && req.method === 'POST') {
      if (!ready) { res.statusCode = 503; return res.end(); }
      if (!activated) { activated = true; interval = setInterval(sync, 3600000); interval.unref(); void sync(); }
      draining = false;
    } else if (action === 'drain' && req.method === 'POST') { draining = true; clearInterval(interval); }
    else if (action !== 'status') { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ id: config.id, ready, active, activated, draining, syncRunning }));
  }
  if (draining) { res.statusCode = 503; res.setHeader('Retry-After', '2'); return res.end('Release is draining. Please retry.'); }
  active++;
  let finished = false;
  const done = () => { if (!finished) { finished = true; active--; } };
  res.once('finish', done); res.once('close', done);
  return originalHandle.call(this, req, res, next);
};
const listen = app.listen;
app.listen = function(...args) { if (typeof args[1] === 'string') args[1] = '127.0.0.1'; else args.splice(1, 0, '127.0.0.1'); server = listen.apply(this, args); return server; };
process.on('SIGTERM', () => { draining = true; clearInterval(interval); server?.close(() => { if (!syncRunning) process.exit(0); }); server?.closeIdleConnections?.(); const timer = setInterval(() => { if (!active && !syncRunning) process.exit(0); }, 100); timer.unref(); });
require(path.join(backend, 'server')).start();
