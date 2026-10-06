const nodemailer = require('nodemailer');
const { config } = require('../config/env');
const { tenantLocalStorage } = require('../config/db');

function getSmtpConfig() {
  const host = (process.env.SMTP_HOST || config.smtp.host || '127.0.0.1').trim();
  const port = Number(process.env.SMTP_PORT || config.smtp.port || 587);
  const secure = process.env.SMTP_SECURE !== undefined
    ? ['1', 'true', 'yes', 'ssl'].includes(String(process.env.SMTP_SECURE).trim().toLowerCase())
    : Boolean(config.smtp.secure);
  const username = (process.env.SMTP_USERNAME || config.smtp.username || '').trim();
  const password = (process.env.SMTP_PASSWORD || config.smtp.password || '').trim();
  const fromEmail = (process.env.SMTP_FROM_EMAIL || config.smtp.fromEmail || username).trim();
  const fromName = process.env.SMTP_FROM_NAME || config.smtp.fromName || 'Waqt Finance';

  return {
    host,
    port,
    secure,
    username,
    password,
    fromEmail,
    fromName,
  };
}

function isConfigured() {
  const smtpConfig = getSmtpConfig();
  return Boolean(smtpConfig.host && smtpConfig.username && smtpConfig.password && smtpConfig.fromEmail);
}

function createTransporter(smtpConfig) {
  // Fix for "SSL routines:tls_get_more_records:packet length too long"
  // Port 587 and 25 use STARTTLS (secure must be false). Port 465 uses direct TLS (secure must be true).
  const port = Number(smtpConfig.port || 587);
  let secure = Boolean(smtpConfig.secure);
  if (port === 587 || port === 25) {
    secure = false;
  } else if (port === 465) {
    secure = true;
  }

  return nodemailer.createTransport({
    host: smtpConfig.host,
    port: port,
    secure: secure,
    family: 4,
    auth: {
      user: smtpConfig.username,
      pass: smtpConfig.password,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });
}

async function sendMail(options = {}) {
  const { tenantSlug, ...mailOptions } = options;
  const smtpConfig = getSmtpConfig();
  console.log('[SMTP] Sending email strictly using config from .env:', {
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    username: smtpConfig.username,
    fromEmail: smtpConfig.fromEmail,
    fromName: smtpConfig.fromName,
    passwordLength: (smtpConfig.password || '').length,
  });

  if (!smtpConfig.host || !smtpConfig.username || !smtpConfig.password) {
    const error = new Error('SMTP credentials are missing in .env file.');
    error.statusCode = 500;
    error.publicMessage = 'SMTP credentials are missing in .env file.';
    throw error;
  }

  try {
    const transporter = createTransporter(smtpConfig);
    return await transporter.sendMail({
      from: `"${smtpConfig.fromName}" <${smtpConfig.fromEmail}>`,
      ...mailOptions,
    });
  } catch (err) {
    console.error('[SMTP Error] Transport failed:', err);
    if (/535|authentication|invalid login/i.test(err.message || '')) {
      const detailedError = new Error(
        `SMTP Auth Failed [Host: ${smtpConfig.host}:${smtpConfig.port}, User: ${smtpConfig.username}, PassLen: ${(smtpConfig.password || '').length}]: ${err.message}`
      );
      detailedError.statusCode = 502;
      detailedError.publicMessage = detailedError.message;
      throw detailedError;
    }
    throw err;
  }
}

function getOtpSmtpConfig() {
  if (process.env.TELECALLER_OTP_SMTP_HOST && process.env.TELECALLER_OTP_SMTP_USERNAME) {
    const host = process.env.TELECALLER_OTP_SMTP_HOST.trim();
    const port = Number(process.env.TELECALLER_OTP_SMTP_PORT || 465);
    const secure = process.env.TELECALLER_OTP_SMTP_SECURE !== undefined
      ? ['1', 'true', 'yes', 'ssl'].includes(String(process.env.TELECALLER_OTP_SMTP_SECURE).trim().toLowerCase())
      : port === 465;
    const username = process.env.TELECALLER_OTP_SMTP_USERNAME.trim();
    const password = (process.env.TELECALLER_OTP_SMTP_PASSWORD || '').trim();
    const fromEmail = (process.env.TELECALLER_OTP_SMTP_FROM_EMAIL || username).trim();
    const fromName = process.env.TELECALLER_OTP_SMTP_FROM_NAME || 'Waqt CRM Security';

    return { host, port, secure, username, password, fromEmail, fromName };
  }
  return getSmtpConfig();
}

async function sendTelecallerOtpEmail({ toEmail, otpCode, userName }) {
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
      <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #edf2f7;">
        <h2 style="color: #0f172a; margin: 0; font-size: 22px;">🔒 CRM Security Verification</h2>
        <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Security Authentication Code</p>
      </div>
      <div style="padding: 24px 0;">
        <p style="color: #334155; font-size: 15px; margin-bottom: 16px;">Hello <strong>${userName || 'User'}</strong>,</p>
        <p style="color: #334155; font-size: 14px; line-height: 1.6;">Your One-Time Password (OTP) to log in to the CRM Portal is:</p>
        <div style="text-align: center; margin: 28px 0;">
          <span style="font-family: monospace; font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #059669; background-color: #ecfdf5; padding: 12px 28px; border-radius: 8px; border: 1px border-style: dashed; border-color: #10b981; display: inline-block;">
            ${otpCode}
          </span>
        </div>
        <p style="color: #64748b; font-size: 13px; line-height: 1.5; margin-top: 20px;">
          ⏱️ This OTP is valid for <strong>10 minutes</strong>. Please do not share this code with anyone.
        </p>
      </div>
      <div style="padding-top: 16px; border-top: 1px solid #edf2f7; text-align: center; color: #94a3b8; font-size: 12px;">
        <p style="margin: 0;">Sent securely • Waqt Finance CRM</p>
      </div>
    </div>
  `;

  const smtpConfig = getOtpSmtpConfig();
  const transporter = createTransporter(smtpConfig);

  return await transporter.sendMail({
    from: `"${smtpConfig.fromName}" <${smtpConfig.fromEmail}>`,
    to: toEmail,
    subject: `🔐 Your Login OTP Code: ${otpCode} - CRM Security`,
    html: htmlContent,
  });
}

module.exports = {
  isConfigured,
  sendMail,
  sendTelecallerOtpEmail,
  sendLoginOtpEmail: sendTelecallerOtpEmail,
};

