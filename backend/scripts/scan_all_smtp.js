const nodemailer = require('nodemailer');

const hosts = [
  { name: 'Hostinger', host: 'smtp.hostinger.com' },
  { name: 'Titan Email', host: 'smtp.titan.email' },
  { name: 'GoDaddy', host: 'smtpout.secureserver.net' },
  { name: 'cPanel Host Domain', host: 'mail.waqtmoney.com' },
  { name: 'cPanel Main Domain', host: 'waqtmoney.com' },
  { name: 'cPanel Server IP', host: '103.234.185.16' },
  { name: 'Zoho IN', host: 'smtp.zoho.in' },
  { name: 'Zoho COM', host: 'smtp.zoho.com' },
  { name: 'Office365', host: 'smtp.office365.com' },
  { name: 'Gmail', host: 'smtp.gmail.com' },
  { name: 'Namecheap', host: 'smtp.privateemail.com' }
];

const ports = [465, 587, 25, 2525];

async function scan() {
  console.log('=== SCANNING ALL SMTP SERVERS FOR sanction@waqtmoney.com ===\n');

  for (const h of hosts) {
    for (const port of ports) {
      const isSecure = port === 465;
      const transporter = nodemailer.createTransport({
        host: h.host,
        port: port,
        secure: isSecure,
        auth: {
          user: 'sanction@waqtmoney.com',
          pass: 'Waqt@money@2026##'
        },
        tls: { rejectUnauthorized: false },
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 5000,
      });

      try {
        await transporter.verify();
        console.log(`🎉 SUCCESS! Connected to ${h.name} (${h.host}:${port})`);
        
        // Try sending test mail
        const res = await transporter.sendMail({
          from: '"Waqt Finance" <sanction@waqtmoney.com>',
          to: 'sumitlodhi9401@gmail.com',
          subject: `Sanction Mail Test via ${h.name}`,
          text: 'Sanction email test successfully delivered!'
        });
        console.log(`🚀 MAIL SENT SUCCESSFULLY! MessageID: ${res.messageId}`);
        return;
      } catch (err) {
        console.log(`❌ ${h.name} (${h.host}:${port}) -> ${err.message}`);
      }
    }
  }
}

scan();
