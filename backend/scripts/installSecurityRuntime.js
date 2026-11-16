const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const tls = require('tls');
const net = require('net');
require(path.join(process.env.CRM_ROOT || path.resolve(__dirname, '..'), 'config/env'));
const EXPECTED_RELAY_FINGERPRINT = '0A:12:14:2C:18:43:86:B5:71:C2:30:3E:35:24:0F:38:1A:A2:B2:8C:31:9E:20:FA:9F:17:FB:E0:64:B4:22:20';
function reply(stream) {
  return new Promise((resolve, reject) => {
    let text = '';
    const timer = setTimeout(() => { stream.removeListener('data', read); reject(new Error('SMTP negotiation timed out.')); }, 8000);
    function read(bytes) { text += bytes.toString(); if (/(?:^|\r\n)\d{3} [^]*?\r\n$/.test(text)) { clearTimeout(timer); stream.removeListener('data', read); resolve(text); } }
    stream.on('data', read); stream.once('error', reject);
  });
}
async function trustedRelayCertificate() {
  const host = process.env.SMTP_HOST, port = Number(process.env.SMTP_PORT || 587);
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) return null;
  let socket;
  try {
    if (port !== 465) {
      socket = net.connect({ host, port });
      if (!(await reply(socket)).startsWith('220')) throw new Error('SMTP greeting rejected.');
      let pending = reply(socket); socket.write('EHLO localhost\r\n'); await pending;
      pending = reply(socket); socket.write('STARTTLS\r\n'); if (!(await pending).startsWith('220')) throw new Error('STARTTLS unavailable.');
    }
    return await new Promise((resolve, reject) => {
      const secure = tls.connect({ ...(socket ? { socket } : { host, port }), rejectUnauthorized: false, timeout: 8000 }, () => {
        const certificate = secure.getPeerCertificate();
        secure.end();
        if (certificate.fingerprint256 !== EXPECTED_RELAY_FINGERPRINT || new Date(certificate.valid_to) <= new Date()) return reject(new Error('Relay certificate changed or expired; revalidate it through the trusted server connection.'));
        const data = '-----BEGIN CERTIFICATE-----\n' + certificate.raw.toString('base64').match(/.{1,64}/g).join('\n') + '\n-----END CERTIFICATE-----\n';
        resolve(data);
      });
      secure.on('error', reject); secure.on('timeout', () => { secure.destroy(); reject(new Error('TLS timed out.')); });
    });
  } catch (error) { socket?.destroy(); throw error; }
}
async function main() {
  if (!process.argv.includes('--apply')) throw new Error('Explicit --apply is required.');
  const root = path.join(os.homedir(), '.config/payday-crm');
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const certificate = await trustedRelayCertificate();
  if (certificate) fs.writeFileSync(path.join(root, 'smtp-relay-ca.pem'), certificate, { mode: 0o600 });
  const keyFile = path.join(root, 'auth-key-v2');
  try { fs.writeFileSync(keyFile, crypto.randomBytes(48).toString('base64url'), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  fs.chmodSync(keyFile, 0o600);
  console.log(JSON.stringify({ authKeyFileReady: true, relayTrustInstalled: Boolean(certificate), secretPrinted: false, emailSent: false }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
