// Verify transport/native-library compatibility without sending any mail or writing files.
const path = require('path'), assert = require('assert/strict');
const live = process.env.CRM_LIVE_ROOT || '/home/waqtmoney/public_html/payday-api';
process.env.ENV_FILE = path.join(live, '.env'); process.env.NODE_ENV = 'production';
const { config } = require('../config/env');
async function main() {
  const sharp = require('sharp'), nodemailer = require('nodemailer');
  const image = await sharp({ create: { width: 160, height: 40, channels: 3, background: '#059669' } }).png().resize({ width: 80 }).toBuffer();
  const metadata = await sharp(image).metadata(); assert.equal(metadata.width, 80);
  const host = process.env.SMTP_HOST || config.smtp.host, port = Number(process.env.SMTP_PORT || config.smtp.port || 587);
  const user = process.env.SMTP_USERNAME || config.smtp.username, pass = process.env.SMTP_PASSWORD || config.smtp.password;
  assert.ok(host && user && pass, 'SMTP configuration required for compatibility verification');
  const transport = nodemailer.createTransport({ host, port, secure: port === 465, requireTLS: port !== 465, family: 4,
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 15000,
    auth: { user, pass }, tls: require('../utils/smtpTls').smtpTls(host) });
  try { assert.equal(await transport.verify(), true); }
  finally { transport.close(); }
  console.log(JSON.stringify({ runtimeCompatibility: 'passed', smtpTlsAndAuthenticationVerified: true, nativePngResizeVerified: true, emailsSent: false, providerCalls: false }));
}
main().catch(error => { console.error(JSON.stringify({ runtimeCompatibility: 'failed', code: error.code || error.name })); process.exitCode = 1; });
