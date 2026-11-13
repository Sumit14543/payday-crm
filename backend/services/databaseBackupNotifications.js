const fsp = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const defaults = require('../config/gcsBackupDefaults.json');

const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 24);
const indiaTime = value => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(value)) + ' IST';

function notificationSettings(config, env = process.env) {
  const to = String(env.GCS_BACKUP_NOTIFY_EMAIL || defaults.notificationEmail).trim();
  if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(to)) throw new Error('GCS_BACKUP_NOTIFY_EMAIL must be one valid email address.');
  return { to, directory: path.join(config.stateDir, 'notifications-' + hash(config.bucket + '/' + config.prefix)) };
}

function safeFailure(error, env = process.env) {
  let message = String(error?.message || 'The backup operation failed.');
  for (const key of ['DB_PASSWORD', 'DB_PASS', 'GCS_BACKUP_DB_PASSWORD', 'SMTP_PASSWORD', 'GCP_SERVICE_ACCOUNT_KEY']) {
    if (env[key]) message = message.split(env[key]).join('[redacted]');
  }
  return message.replace(/[\r\n]+/g, ' ').slice(0, 500);
}

function makeReport(config, { result, error, test = false, now = new Date(), env = process.env }) {
  const outcome = error ? 'FAILED' : 'SUCCESS';
  const uploaded = result?.uploaded || [];
  const time = now.toISOString();
  // Failed retry attempts are grouped hourly. A different failure gets its own alert.
  const reason = error ? safeFailure(error, env) : '';
  const identity = test ? 'test-' + randomUUID() : error ? `failed:${time.slice(0, 13)}:${reason}` : uploaded.map(file => file.object).join('|');
  const lines = [
    test ? 'TEST ALERT ONLY: the failure below is simulated. No database backup failed or database data changed.' : `Database backup ${outcome.toLowerCase()}.`,
    `Time: ${indiaTime(time)}`,
    `Scheduled backup: ${config.time} Asia/Kolkata`,
    `Destination: gs://${config.bucket}/${config.prefix}/`,
    `Databases: ${config.databases.join(', ')}`,
  ];
  if (error) {
    lines.push(`Reason: ${reason}`, 'Check the private backup log. Scheduled failed snapshots retry on subsequent cron runs.');
  } else {
    lines.push(`Verified backup files: ${uploaded.length}`, `Expired files deleted: ${result.deleted || 0}`);
    for (const file of uploaded) lines.push(`File: gs://${config.bucket}/${file.object}`, `Compressed size: ${file.bytes} bytes; tables: ${file.tables}`);
    lines.push('Upload integrity checked with GCS CRC32C and remote size. A restore has not been performed.');
  }
  lines.push('Live backup folder retention: 7 days. Shared-bucket Soft Delete can retain deleted recovery copies for additional days.', 'Production database data and schema were not changed. No SQL backup is attached to this email.');
  return { id: hash(identity), subject: `[Waqt Finance] ${test ? '[TEST] ' : ''}DB Backup ${outcome}`, text: lines.join('\n'), createdAt: time };
}

function smtpOptions(env = process.env) {
  const host = String(env.SMTP_HOST || '').trim();
  const user = String(env.SMTP_USERNAME || '').trim();
  const pass = String(env.SMTP_PASSWORD || '').trim();
  const from = String(env.SMTP_FROM_EMAIL || user).trim();
  const port = Number(env.SMTP_PORT || 587);
  if (!host || !user || !pass || !from || !Number.isInteger(port)) throw new Error('Backup notification SMTP settings are incomplete.');
  const secure = port === 465 || (port !== 587 && port !== 25 && ['1', 'true', 'yes', 'ssl'].includes(String(env.SMTP_SECURE || '').toLowerCase()));
  // The existing cPanel mail relay is on loopback and presents a local certificate.
  // Trust that local host only; external SMTP certificates remain verified.
  const localRelay = ['127.0.0.1', '::1', 'localhost'].includes(host.toLowerCase());
  return { host, port, secure, family: 4, auth: { user, pass }, tls: { rejectUnauthorized: !localRelay }, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000 };
}

function smtpDiagnostic(error) {
  const message = String(error.message || '');
  const reason = /certificate|self.signed|hostname|altname/i.test(message) ? 'TLS_CERTIFICATE'
    : /wrong version|packet length|ssl routines/i.test(message) ? 'TLS_PROTOCOL'
      : error.code === 'EAUTH' ? 'AUTHENTICATION' : 'CONNECTION_OR_DELIVERY';
  return { code: /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'SMTP_FAILED', reason };
}

async function checkSmtp(env = process.env, nodemailer = require('nodemailer')) {
  const options = smtpOptions(env);
  const transport = nodemailer.createTransport(options);
  try { await transport.verify(); return { ready: true, host: options.host, port: options.port, secure: options.secure }; }
  catch (error) { return { ready: false, host: options.host, port: options.port, secure: options.secure, ...smtpDiagnostic(error) }; }
  finally { transport.close(); }
}

async function sendBackupEmail(settings, report, env = process.env, nodemailer = require('nodemailer')) {
  const options = smtpOptions(env);
  const from = String(env.SMTP_FROM_EMAIL || options.auth.user).trim();
  const transport = nodemailer.createTransport(options);
  try {
    const info = await transport.sendMail({
      from: { name: 'Waqt Finance Backups', address: from }, to: settings.to,
      subject: report.subject, text: report.text,
      messageId: `<backup-${report.id}@${from.split('@')[1]}>`,
    });
    if (!info.accepted?.some(address => String(address).toLowerCase() === settings.to.toLowerCase()) || info.rejected?.length) throw new Error('The SMTP server did not accept the backup notification recipient.');
    return { accepted: true };
  } catch (error) {
    // Never persist SMTP server diagnostics, authentication data or credentials.
    const code = /^[A-Z0-9_]+$/.test(error.code || '') ? ` (${error.code})` : '';
    const failure = new Error('Backup notification email was not accepted' + code + '.');
    failure.code = error.code;
    throw failure;
  } finally { transport.close(); }
}

async function readState(settings) {
  await fsp.mkdir(settings.directory, { recursive: true, mode: 0o700 });
  await fsp.chmod(settings.directory, 0o700);
  try {
    const state = JSON.parse(await fsp.readFile(path.join(settings.directory, 'outbox.json'), 'utf8'));
    if (!Array.isArray(state.pending) || !Array.isArray(state.delivered)) throw new Error('Invalid backup notification outbox.');
    return state;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { pending: [], delivered: [] };
  }
}

async function saveState(settings, state) {
  const temporary = path.join(settings.directory, `outbox-${randomUUID()}.tmp`);
  await fsp.writeFile(temporary, JSON.stringify(state), { mode: 0o600, flag: 'wx' });
  await fsp.rename(temporary, path.join(settings.directory, 'outbox.json'));
}

async function deliverReports(config, report, { env = process.env, send = sendBackupEmail } = {}) {
  const settings = notificationSettings(config, env);
  const state = await readState(settings);
  if (report && !state.pending.some(item => item.id === report.id) && !state.delivered.includes(report.id)) {
    state.pending.push({ ...report, to: settings.to });
    await saveState(settings, state); // Durable before SMTP; failed messages survive process exit.
  }
  let sent = 0;
  // Bound a delayed SMTP backlog so a cron tick cannot spend unbounded time sending.
  for (const item of state.pending.slice(0, 10)) {
    try { await send({ ...settings, to: item.to }, item, env); }
    catch (error) {
      const code = /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'MAIL_NOT_ACCEPTED';
      return { sent, pending: state.pending.length, accepted: false, error: 'Backup email was not accepted by SMTP.', code };
    }
    state.pending = state.pending.filter(pending => pending.id !== item.id);
    state.delivered.push(item.id);
    state.delivered = state.delivered.slice(-1000);
    await saveState(settings, state);
    sent++;
  }
  return { sent, pending: state.pending.length, accepted: state.pending.length === 0 };
}

async function runWithNotifications(config, run, options = {}) {
  const started = options.now ? options.now() : new Date();
  let result, failure;
  try { result = await run(); } catch (error) { failure = error; }
  const report = failure || result?.uploaded?.length ? makeReport(config, { result, error: failure, now: options.now ? options.now() : new Date(), env: options.env }) : null;
  let notification;
  try { notification = await deliverReports(config, report, options); }
  catch { notification = { accepted: false, pending: 'unknown', error: 'Backup notification outbox could not be processed.' }; }
  if (failure) {
    failure.notification = notification;
    throw failure;
  }
  return { ...result, durationSeconds: Math.round(((options.now ? options.now() : new Date()) - started) / 1000), notification };
}

module.exports = { notificationSettings, safeFailure, makeReport, smtpOptions, smtpDiagnostic, checkSmtp, sendBackupEmail, deliverReports, runWithNotifications };
