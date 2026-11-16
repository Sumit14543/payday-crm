// Independent read-only deployment preflight. Never imports app/server/bootstrap.
const path = require('path');
const root = process.env.CRM_ROOT || path.resolve(__dirname, '..');
const { config } = require(path.join(root, 'config/env'));
const mysql = require(path.join(root, 'node_modules/mysql'));
const nodemailer = require(path.join(root, 'node_modules/nodemailer'));
const tls = require('tls');
const fs = require('fs');
const os = require('os');
async function relayCertificate(host, port) {
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) return null;
  let socket;
  const response = stream => new Promise((resolve, reject) => {
    let text = '';
    const timer = setTimeout(() => { stream.removeListener('data', data); reject(new Error('SMTP timeout')); }, 8000);
    function data(chunk) {
      text += chunk.toString();
      if (/(?:^|\r\n)\d{3} [^]*?\r\n$/.test(text)) { clearTimeout(timer); stream.removeListener('data', data); resolve(text); }
    }
    stream.on('data', data); stream.once('error', reject);
  });
  try {
    if (port !== 465) {
      socket = require('net').connect({ host, port });
      let reply = await response(socket);
      if (!reply.startsWith('220')) throw new Error('SMTP greeting rejected');
      let pending = response(socket); socket.write('EHLO localhost\r\n'); await pending;
      pending = response(socket); socket.write('STARTTLS\r\n'); reply = await pending;
      if (!reply.startsWith('220')) throw new Error('STARTTLS unavailable');
    }
    return await new Promise(resolve => {
      const secured = tls.connect({ ...(socket ? { socket } : { host, port }), rejectUnauthorized: false, timeout: 8000 }, () => {
        const cert = secured.getPeerCertificate();
        resolve({ subject: cert.subject?.CN, issuer: cert.issuer?.CN, validTo: cert.valid_to, fingerprint256: cert.fingerprint256, authorizationError: secured.authorizationError || null });
        secured.end();
      });
      secured.on('error', error => resolve({ code: error.code }));
      secured.on('timeout', () => { secured.destroy(); resolve({ code: 'TIMEOUT' }); });
    });
  } catch (error) { socket?.destroy(); return { code: error.code || error.name }; }
}
async function main() {
  const report = { mode: process.env.NODE_ENV, authSecretConfigured: String(process.env.AUTH_TOKEN_SECRET || '').length >= 32, writesPerformed: false, emailSent: false };
  report.providers = Object.fromEntries(['CRIF_API_USER', 'CRIF_API_PASSWORD', 'BIFROST_API_TOKEN', 'CASHFREE_CLIENT_SECRET', 'CASHFREE_SECRET_KEY', 'BILLDESK_SIGNING_KEY', 'BILLDESK_ENCRYPTION_KEY', 'DIGIO_CLIENT_ID', 'DIGIO_CLIENT_SECRET'].map(key => [key, Boolean(process.env[key])]));
  report.relatedConfigurationNames = Object.keys(process.env).filter(key => /RAZORPAY|WEBHOOK.*SECRET|SMTP.*(TLS|CA|HOST|PORT)/i.test(key));
  const connection = mysql.createConnection({ host: config.db.host, user: config.db.user, password: config.db.password, port: config.db.port, database: config.db.database, connectTimeout: 10000 });
  const query = (sql, params = []) => new Promise((resolve, reject) => connection.query(sql, params, (error, rows) => error ? reject(error) : resolve(rows)));
  try {
    const grants = await query('SHOW GRANTS FOR CURRENT_USER');
    const grantText = grants.flatMap(row => Object.values(row)).join(' ');
    report.database = { reachable: true, schemaPermission: /ALL PRIVILEGES|\bCREATE\b/i.test(grantText) };
    const locks = await query("SELECT GET_LOCK('crm-security-preflight-only', 0) AS acquired");
    report.database.namedLocksAvailable = Number(locks[0]?.acquired) === 1;
    await query("SELECT RELEASE_LOCK('crm-security-preflight-only')");
    report.activeStaffByRole = await query('SELECT role, COUNT(*) AS count FROM crm_users WHERE is_active = 1 GROUP BY role');
    report.mandatesByProvider = await query("SELECT emandate_provider AS provider, COUNT(*) AS count FROM loan_applications WHERE COALESCE(emandate_provider, '') <> '' GROUP BY emandate_provider").catch(() => []);
    const recent = await query("SELECT COUNT(*) AS count FROM cibil_reports WHERE created_at > DATE_SUB(NOW(), INTERVAL 30 MINUTE) AND COALESCE(pdf_url, '') = ''");
    report.recentPendingCibil = Number(recent[0]?.count || 0);
    report.recentSignedAgreementsByProvider = await query("SELECT provider, COUNT(*) AS count, SUM(COALESCE(provider_document_id, '') <> '') AS withProviderId, SUM(COALESCE(signed_pdf_path, '') <> '') AS withSavedPdf FROM lead_loan_agreements WHERE status = 'signed' AND created_at > DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY provider").catch(error => ({ code: error.code }));
    report.recentUnpaidAgreementCompatibility = await query(`SELECT COUNT(*) AS signedUnpaid,
      SUM(a.sanction_id IS NULL) AS missingSanctionLink,
      SUM(a.sanction_id <> s.id OR a.agreement_number <> s.agreement_number) AS changedSanction,
      SUM(COALESCE(a.provider_document_id, '') = '' OR COALESCE(a.signed_pdf_path, '') = '') AS missingProviderEvidence
      FROM lead_loan_agreements a
      LEFT JOIN lead_sanctions s ON s.id = (SELECT s2.id FROM lead_sanctions s2 WHERE (NULLIF(a.application_id, '') IS NOT NULL AND s2.application_id = a.application_id) OR (NULLIF(a.lead_id, '') IS NOT NULL AND s2.lead_id = a.lead_id) ORDER BY s2.created_at DESC, s2.id DESC LIMIT 1)
      WHERE a.status = 'signed' AND a.created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
      AND NOT EXISTS (SELECT 1 FROM lead_accounting_payments p WHERE (NULLIF(a.application_id, '') IS NOT NULL AND p.application_id = a.application_id) OR (NULLIF(a.lead_id, '') IS NOT NULL AND p.lead_id = a.lead_id))`).catch(error => ({ code: error.code }));
    report.recentLegacyInternalMandateLinks = await query("SELECT COUNT(*) AS count FROM loan_applications WHERE emandate_provider = 'cashfree' AND emandate_auth_url LIKE '%/emandate/pay/%' AND UPPER(COALESCE(emandate_status, 'PENDING')) NOT IN ('ACTIVE', 'REJECTED', 'REVOKED', 'CANCELLED', 'FAILED', 'EXPIRED') AND updated_at > DATE_SUB(NOW(), INTERVAL 7 DAY)").catch(error => ({ code: error.code }));
    const masterName = process.env.DB_MASTER_NAME || `${process.env.DB_PREFIX || ''}payday_crm_master`;
    if (!/^[a-zA-Z0-9_-]+$/.test(masterName)) throw new Error('Invalid master database identifier.');
    await query('SELECT COUNT(*) AS count FROM `' + masterName + '`.superadmins WHERE is_active = 1');
    report.database.masterReachable = true;
    const tenants = await query('SELECT slug, db_host, db_user, db_password, db_name, db_port FROM `' + masterName + '`.tenants WHERE status = "active"');
    report.companyDatabases = [];
    const seen = new Set();
    for (const tenant of tenants) {
      const settings = { host: tenant.db_host || config.db.host, user: tenant.db_user || config.db.user, password: tenant.db_password || config.db.password, database: tenant.slug === 'waqtfinance' ? config.db.database : tenant.db_name, port: tenant.db_port || config.db.port, connectTimeout: 10000 };
      const mapping = settings.host + ':' + settings.port + '/' + settings.database;
      const client = mysql.createConnection(settings);
      try {
        await new Promise((resolve, reject) => client.query('SELECT 1 AS ok', error => error ? reject(error) : resolve()));
        report.companyDatabases.push({ company: tenant.slug, reachable: true, sharedDatabaseMapping: seen.has(mapping) });
      } catch (error) { report.companyDatabases.push({ company: tenant.slug, reachable: false, code: error.code }); }
      finally { client.end(); }
      seen.add(mapping);
    }
  } catch (error) { report.database = { reachable: false, code: error.code || 'UNKNOWN' }; }
  finally { connection.end(); }
  const testingRoot = path.join(root, '../testing-api');
  function readValues(file) { const values = {}; if (fs.existsSync(file)) for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) { const match = line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*?)\s*$/); if (match) values[match[1]] = match[2].replace(/^["']|["']$/g, ''); } return values; }
  const testingBase = readValues(path.join(testingRoot, '.env'));
  report.testingConfiguration = { present: fs.existsSync(testingRoot), candidates: ['development', 'production'].map(mode => { const candidate = { ...testingBase, ...readValues(path.join(testingRoot, '.env.' + mode)) }; return { mode, sameProductionDatabase: Boolean(candidate.DB_NAME && candidate.DB_NAME === config.db.database), sameSigningKey: Boolean(candidate.AUTH_TOKEN_SECRET && candidate.AUTH_TOKEN_SECRET === process.env.AUTH_TOKEN_SECRET) }; }) };
  if (report.testingConfiguration.present) {
    report.testingConfiguration.candidates.forEach(candidate => {
      const values = { ...testingBase, ...readValues(path.join(testingRoot, '.env.' + candidate.mode)) };
      candidate.sameDocumentBucketAndPrefix = (values.GCS_BUCKET_NAME || 'waqt-finance-loan-documents-prod') === (process.env.GCS_BUCKET_NAME || 'waqt-finance-loan-documents-prod') && (values.GCS_PREFIX || 'waqtmoney-documents/test-uploads') === (process.env.GCS_PREFIX || 'waqtmoney-documents/test-uploads');
    });
  }
  for (const kind of ['smtp', 'otp']) {
    const prefix = kind === 'otp' && process.env.TELECALLER_OTP_SMTP_HOST ? 'TELECALLER_OTP_' : '';
    const host = process.env[prefix + 'SMTP_HOST'] || config.smtp.host;
    const port = Number(process.env[prefix + 'SMTP_PORT'] || config.smtp.port || 587);
    const user = process.env[prefix + 'SMTP_USERNAME'] || config.smtp.username;
    const pass = process.env[prefix + 'SMTP_PASSWORD'] || config.smtp.password;
    if (!host || !user || !pass) { report[kind] = { configured: false }; continue; }
    const transport = nodemailer.createTransport({ host, port, secure: port === 465, requireTLS: port !== 465, auth: { user, pass }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 10000, tls: (() => { const file = path.join(os.homedir(), '.config/payday-crm/smtp-relay-ca.pem'); if (!fs.existsSync(file)) return { rejectUnauthorized: true }; const ca = fs.readFileSync(file); const name = new (require('crypto').X509Certificate)(ca).subject.split('\n').find(line => line.startsWith('CN='))?.slice(3); return { rejectUnauthorized: true, ca, servername: name }; })() });
    try { await transport.verify(); report[kind] = { configured: true, certificateAndAuthVerified: true, loopbackRelay: ['localhost', '127.0.0.1', '::1'].includes(host) }; }
    catch (error) { report[kind] = { configured: true, certificateAndAuthVerified: false, code: error.code || 'TLS_FAILURE', port, loopbackRelay: ['localhost', '127.0.0.1', '::1'].includes(host), certificate: await relayCertificate(host, port) }; }
    finally { transport.close(); }
  }
  console.log(JSON.stringify(report, null, 2));
  if (process.env.SECURITY_RUNTIME_REQUIRED === 'true' && (!report.database?.reachable || !report.database?.masterReachable || !report.database?.namedLocksAvailable || !report.smtp?.certificateAndAuthVerified || !report.otp?.certificateAndAuthVerified)) process.exitCode = 1;
}
main().catch(error => { console.error(JSON.stringify({ preflightFailed: true, code: error.code || error.name })); process.exitCode = 1; });
