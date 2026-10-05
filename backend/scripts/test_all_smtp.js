const nodemailer = require('nodemailer');

async function testMail(label, config) {
  console.log(`\n=== TESTING: ${label} ===`);
  console.log('Host:', config.host, '| Port:', config.port, '| User:', config.auth.user);
  const transporter = nodemailer.createTransport({
    ...config,
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10000,
  });

  try {
    const info = await transporter.sendMail({
      from: `"${config.fromName || 'Waqt Finance'}" <${config.auth.user}>`,
      to: 'sumitlodhi9401@gmail.com',
      subject: `Test Mail - ${label}`,
      html: `<h3>Test Email via ${label}</h3><p>Sending email test to sumitlodhi9401@gmail.com</p>`,
    });
    console.log(`✅ [SUCCESS] ${label}: Message ID = ${info.messageId}`);
    return true;
  } catch (err) {
    console.error(`❌ [FAILED] ${label}: ${err.message}`);
    return false;
  }
}

async function runAllTests() {
  // Test 1: sanction@waqtmoney.com on Hostinger
  await testMail('sanction@waqtmoney.com (Hostinger SMTP)', {
    host: 'smtp.hostinger.com',
    port: 465,
    secure: true,
    auth: { user: 'sanction@waqtmoney.com', pass: 'Waqt@money@2026##' }
  });

  // Test 2: sanction@waqtmoney.com on mail.waqtmoney.com
  await testMail('sanction@waqtmoney.com (cPanel mail.waqtmoney.com)', {
    host: 'mail.waqtmoney.com',
    port: 465,
    secure: true,
    auth: { user: 'sanction@waqtmoney.com', pass: 'Waqt@money@2026##' }
  });

  // Test 3: support@waqtmoney.in on Hostinger
  await testMail('support@waqtmoney.in (Hostinger SMTP)', {
    host: 'smtp.hostinger.com',
    port: 465,
    secure: true,
    auth: { user: 'support@waqtmoney.in', pass: 'Supportwaqtmoney@123' }
  });
}

runAllTests();
