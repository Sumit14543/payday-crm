// Independent read-only deployment preflight. Never imports app/server/bootstrap.
const path = require('path');
const root = process.env.CRM_ROOT || path.resolve(__dirname, '..');
const { config } = require(path.join(root, 'config/env'));
const mysql = require(path.join(root, 'node_modules/mysql'));
const nodemailer = require(path.join(root, 'node_modules/nodemailer'));
const tls = require('tls');
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
    report.activeStaffByRole = await query('SELECT role, COUNT(*) AS count FROM crm_users WHERE is_active = 1 GROUP BY role');
    report.mandatesByProvider = await query("SELECT emandate_provider AS provider, COUNT(*) AS count FROM loan_applications WHERE COALESCE(emandate_provider, '') <> '' GROUP BY emandate_provider").catch(() => []);
    const recent = await query("SELECT COUNT(*) AS count FROM cibil_reports WHERE created_at > DATE_SUB(NOW(), INTERVAL 30 MINUTE) AND COALESCE(pdf_url, '') = ''");
    report.recentPendingCibil = Number(recent[0]?.count || 0);
  } catch (error) { report.database = { reachable: false, code: error.code || 'UNKNOWN' }; }
  finally { connection.end(); }
  for (const kind of ['smtp', 'otp']) {
    const prefix = kind === 'otp' && process.env.TELECALLER_OTP_SMTP_HOST ? 'TELECALLER_OTP_' : '';
    const host = process.env[prefix + 'SMTP_HOST'] || config.smtp.host;
    const port = Number(process.env[prefix + 'SMTP_PORT'] || config.smtp.port || 587);
    const user = process.env[prefix + 'SMTP_USERNAME'] || config.smtp.username;
    const pass = process.env[prefix + 'SMTP_PASSWORD'] || config.smtp.password;
    if (!host || !user || !pass) { report[kind] = { configured: false }; continue; }
    const transport = nodemailer.createTransport({ host, port, secure: port === 465, requireTLS: port !== 465, auth: { user, pass }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 10000, tls: { rejectUnauthorized: true } });
    try { await transport.verify(); report[kind] = { configured: true, certificateAndAuthVerified: true, loopbackRelay: ['localhost', '127.0.0.1', '::1'].includes(host) }; }
    catch (error) { report[kind] = { configured: true, certificateAndAuthVerified: false, code: error.code || 'TLS_FAILURE', port, loopbackRelay: ['localhost', '127.0.0.1', '::1'].includes(host), certificate: await relayCertificate(host, port) }; }
    finally { transport.close(); }
  }
  console.log(JSON.stringify(report, null, 2));
}
main().catch(error => { console.error(JSON.stringify({ preflightFailed: true, code: error.code || error.name })); process.exitCode = 1; });
