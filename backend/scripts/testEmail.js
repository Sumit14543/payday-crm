const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

// Custom .env parser to avoid requiring 'dotenv' module
try {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split(/\r?\n/).forEach(line => {
      if (!line || line.startsWith('#')) return;
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
          value = value.slice(1, -1);
        }
        process.env[key] = value;
      }
    });
  }
} catch (e) {
  console.log('Warning: Could not manually parse .env file:', e.message);
}

const targetBrand = process.argv[2] || 'geetpay';

console.log(`\n======================================`);
console.log(`Testing SMTP for: ${targetBrand.toUpperCase()}`);
console.log(`======================================\n`);

let smtpConfig = {};

if (targetBrand.toLowerCase() === 'geetpay') {
  smtpConfig = {
    host: (process.env.GEETPAY_SMTP_HOST || process.env.SMTP_HOST || '').trim().replace(/^["']|["']$/g, ''),
    port: Number(process.env.GEETPAY_SMTP_PORT || process.env.SMTP_PORT || 587),
    secure: process.env.GEETPAY_SMTP_SECURE !== undefined
      ? ['1', 'true', 'yes', 'ssl'].includes(String(process.env.GEETPAY_SMTP_SECURE).trim().toLowerCase())
      : ['1', 'true', 'yes', 'ssl'].includes(String(process.env.SMTP_SECURE).trim().toLowerCase()),
    username: (process.env.GEETPAY_SMTP_USERNAME || '').trim().replace(/^["']|["']$/g, ''),
    password: (process.env.GEETPAY_SMTP_PASSWORD || '').trim().replace(/^["']|["']$/g, ''),
    fromEmail: (process.env.GEETPAY_SMTP_FROM_EMAIL || process.env.GEETPAY_SMTP_USERNAME || '').trim().replace(/^["']|["']$/g, ''),
    fromName: (process.env.GEETPAY_SMTP_FROM_NAME || 'GeetPay').trim().replace(/^["']|["']$/g, ''),
  };
} else {
  // Default/Waqt
  smtpConfig = {
    host: (process.env.SMTP_HOST || '').trim().replace(/^["']|["']$/g, ''),
    port: Number(process.env.SMTP_PORT || 587),
    secure: ['1', 'true', 'yes', 'ssl'].includes(String(process.env.SMTP_SECURE).trim().toLowerCase()),
    username: (process.env.SMTP_USERNAME || '').trim().replace(/^["']|["']$/g, ''),
    password: (process.env.SMTP_PASSWORD || '').trim().replace(/^["']|["']$/g, ''),
    fromEmail: (process.env.SMTP_FROM_EMAIL || process.env.SMTP_USERNAME || '').trim().replace(/^["']|["']$/g, ''),
    fromName: (process.env.SMTP_FROM_NAME || 'Waqt Finance').trim().replace(/^["']|["']$/g, ''),
  };
}

console.log('Parsed SMTP Configuration:');
console.log({
  host: smtpConfig.host,
  port: smtpConfig.port,
  secure: smtpConfig.secure,
  username: smtpConfig.username,
  fromEmail: smtpConfig.fromEmail,
  fromName: smtpConfig.fromName,
  passwordLength: (smtpConfig.password || '').length,
});

if (!smtpConfig.host || !smtpConfig.username || !smtpConfig.password) {
  console.error('\nERROR: SMTP host, username, or password is missing in .env!\n');
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: smtpConfig.host,
  port: smtpConfig.port,
  secure: smtpConfig.secure,
  auth: {
    user: smtpConfig.username,
    pass: smtpConfig.password,
  },
  tls: {
    rejectUnauthorized: false,
  },
  debug: true,    // Enable debug logging
  logger: true,   // Print SMTP conversation to console
});

async function runTest() {
  console.log('\nStep 1: Verifying SMTP Connection & SSL/TLS handshake...\n');
  try {
    await transporter.verify();
    console.log('\nSUCCESS: SMTP connection verified successfully!');
  } catch (verifyError) {
    console.error('\nERROR: SMTP Connection verification failed!');
    console.error(verifyError);
    process.exit(1);
  }

  console.log('\nStep 2: Sending test email to verify credentials...\n');
  try {
    const info = await transporter.sendMail({
      from: `"${smtpConfig.fromName}" <${smtpConfig.fromEmail}>`,
      to: smtpConfig.fromEmail,
      subject: `SMTP Test Email - ${targetBrand.toUpperCase()}`,
      text: 'This is a test email sent from the command-line SMTP test script. If you received this, your SMTP settings are 100% correct!',
      html: '<p>This is a test email sent from the command-line SMTP test script. If you received this, your SMTP settings are 100% correct!</p>',
    });
    console.log('\nSUCCESS: Test email sent successfully!');
    console.log('Message ID:', info.messageId);
  } catch (sendError) {
    console.error('\nERROR: Sending test email failed!');
    console.error(sendError);
    process.exit(1);
  }
}

runTest();
