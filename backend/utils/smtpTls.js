const fs = require('fs');
const path = require('path');
const os = require('os');
const { X509Certificate } = require('crypto');
function smtpTls(host) {
  const options = { rejectUnauthorized: true, minVersion: 'TLSv1.2' };
  const file = process.env.SMTP_TLS_CA_FILE || path.join(os.homedir(), '.config/payday-crm/smtp-relay-ca.pem');
  if (['localhost', '127.0.0.1', '::1'].includes(host) && fs.existsSync(file)) {
    options.ca = fs.readFileSync(file);
    const certificate = new X509Certificate(options.ca);
    const name = certificate.subject.split('\n').find(line => line.startsWith('CN='))?.slice(3);
    options.servername = process.env.SMTP_TLS_SERVERNAME || name;
  } else if (process.env.SMTP_TLS_SERVERNAME) options.servername = process.env.SMTP_TLS_SERVERNAME;
  return options;
}
module.exports = { smtpTls };
