const crypto = require('crypto');
const { query } = require('../config/db');
const leadModel = require('../models/leadModel');
const auditModel = require('../models/auditModel');
const emailService = require('../services/emailService');
const { ensureOfficialEmailColumns } = require('../database/schema');

const OTP_EXPIRY_MINUTES = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const MAX_VERIFICATION_ATTEMPTS = 3;
const OTP_HASH_SALT = process.env.OTP_HASH_SALT || 'crm_official_email_salt_2026';

function hashOtp(otp) {
  return crypto
    .createHash('sha256')
    .update(String(otp).trim() + OTP_HASH_SALT)
    .digest('hex');
}

function maskEmail(email) {
  if (!email || typeof email !== 'string') return '';
  const parts = email.trim().split('@');
  if (parts.length !== 2) return email;
  const [local, domain] = parts;
  const first = local[0] || 'a';
  return `${first}****@${domain}`;
}

function generateNumericOtp() {
  return crypto.randomInt(100000, 999999).toString();
}

function formatLocalDbDate(date = new Date()) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function parseDbDate(dbDate) {
  if (!dbDate) return new Date(0);
  if (dbDate instanceof Date) return dbDate;
  const str = String(dbDate).replace('T', ' ').replace('Z', '');
  const [datePart, timePart] = str.split(' ');
  if (!datePart || !timePart) return new Date(dbDate);
  const [y, m, d] = datePart.split('-').map(Number);
  const [h, min, s] = timePart.split(':').map(Number);
  return new Date(y, m - 1, d, h || 0, min || 0, s || 0);
}

async function resolveLead(applicationIdOrLeadId) {
  if (!applicationIdOrLeadId) return null;
  return await leadModel.findById(String(applicationIdOrLeadId).trim());
}

async function sendOtp(req, res) {
  await ensureOfficialEmailColumns().catch(() => {});
  const { applicationId, leadId, id } = req.body || {};
  const targetId = applicationId || leadId || id || req.params?.id || req.query?.id || req.query?.applicationId || req.query?.leadId;

  if (!targetId) {
    return res.status(400).json({
      success: false,
      message: 'Application ID or Lead ID is required.',
    });
  }

  const lead = await resolveLead(targetId);
  if (!lead) {
    return res.status(404).json({
      success: false,
      message: 'Application record not found.',
    });
  }

  const officialEmail = String(lead.officeEmail || lead.officialEmail || lead.email || '').trim();
  if (!officialEmail || !officialEmail.includes('@')) {
    return res.status(400).json({
      success: false,
      message: 'Customer record does not have a valid Official Email address stored.',
    });
  }

  // Corporate Domain Guard: Personal & Disposable Emails cannot be verified as Official Email
  const domainCheck = await verifyOfficialEmailDomain(officialEmail);
  if (domainCheck.isFreeEmail || domainCheck.isDisposable || !domainCheck.isCorporateDomain) {
    return res.status(400).json({
      success: false,
      message: `Cannot verify '${officialEmail}' as Official Email. Personal email domains (@${domainCheck.domain}) are not allowed. Please enter a valid corporate company email (e.g. user@company.com).`,
      domainAnalysis: domainCheck,
    });
  }

  const maskedEmail = maskEmail(officialEmail);

  // Check rate limiting / resend cooldown for active unexpired OTPs
  const activeOtps = await query(
    `SELECT * FROM official_email_otps 
     WHERE (application_id = ? OR application_id = ?) AND is_used = 0 
     ORDER BY id DESC LIMIT 1`,
    [String(lead.id), String(lead.rawId)]
  );

  if (activeOtps && activeOtps.length > 0) {
    const activeOtp = activeOtps[0];
    const resendAvailableAt = parseDbDate(activeOtp.resend_available_at).getTime();
    const nowTime = Date.now();

    if (nowTime < resendAvailableAt) {
      const waitSeconds = Math.ceil((resendAvailableAt - nowTime) / 1000);
      return res.status(200).json({
        success: true,
        otpAlreadySent: true,
        message: `An active OTP was recently sent to ${maskedEmail}. Please enter the 6-digit OTP code below.`,
        resendCooldownSeconds: waitSeconds,
        maskedEmail,
      });
    }
  }

  // Invalidate any old unused OTPs for this application
  await query(
    `UPDATE official_email_otps SET is_used = 1 WHERE (application_id = ? OR application_id = ?) AND is_used = 0`,
    [String(lead.id), String(lead.rawId)]
  );

  // Generate new OTP
  const otpCode = generateNumericOtp();
  const otpHash = hashOtp(otpCode);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000);
  const resendAvailableAt = new Date(now.getTime() + OTP_RESEND_COOLDOWN_SECONDS * 1000);
  const createdBy = req.user?.name || req.user?.email || 'Credit User';

  await query(
    `INSERT INTO official_email_otps (
      application_id, official_email, otp_hash, attempts, max_attempts,
      expires_at, resend_available_at, is_used, created_at, created_by
    ) VALUES (?, ?, ?, 0, ?, ?, ?, 0, ?, ?)`,
    [
      String(lead.id),
      officialEmail,
      otpHash,
      MAX_VERIFICATION_ATTEMPTS,
      formatLocalDbDate(expiresAt),
      formatLocalDbDate(resendAvailableAt),
      formatLocalDbDate(now),
      createdBy,
    ]
  );

  // Send Email
  const htmlContent = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
      <div style="text-align: center; border-bottom: 1px solid #f1f5f9; padding-bottom: 16px; margin-bottom: 20px;">
        <h2 style="color: #0f172a; margin: 0; font-size: 20px; font-weight: 700;">Official Email Verification</h2>
        <p style="color: #64748b; font-size: 13px; margin-top: 4px;">Payday Loan CRM Credit Review</p>
      </div>
      <div style="padding: 10px 0;">
        <p style="color: #334155; font-size: 14px; margin-bottom: 16px;">Hello <strong>${lead.name || 'Applicant'}</strong>,</p>
        <p style="color: #334155; font-size: 14px; line-height: 1.5;">Your One-Time Password (OTP) for verifying your official email address is:</p>
        <div style="text-align: center; margin: 24px 0;">
          <span style="font-family: monospace; font-size: 34px; font-weight: 800; letter-spacing: 6px; color: #2563eb; background-color: #eff6ff; padding: 12px 28px; border-radius: 8px; border: 1px border-style: dashed; border-color: #bfdbfe; display: inline-block;">
            ${otpCode}
          </span>
        </div>
        <p style="color: #64748b; font-size: 13px; line-height: 1.5;">
          ⏱️ This OTP is valid for <strong>5 minutes</strong>. If you did not request this verification, please disregard this message.
        </p>
      </div>
      <div style="padding-top: 16px; border-top: 1px solid #f1f5f9; text-align: center; color: #94a3b8; font-size: 12px;">
        <p style="margin: 0;">Sent securely to ${maskEmail(officialEmail)} • CRM Credit Verification</p>
      </div>
    </div>
  `;

  try {
    await emailService.sendMail({
      to: officialEmail,
      subject: 'Official Email Verification OTP',
      html: htmlContent,
      text: `Official Email Verification OTP\n\nYour OTP for verifying the official email address is: ${otpCode}\n\nThis OTP is valid for 5 minutes.`,
    });

    console.log(`[Official Email OTP] OTP sent to ${maskEmail(officialEmail)} for lead ${lead.id}`);
  } catch (emailErr) {
    console.error('[Official Email OTP] Email dispatch failed:', emailErr.message);
    return res.status(500).json({
      success: false,
      message: `Failed to send OTP email: ${emailErr.message || 'SMTP service error'}`,
    });
  }

  return res.status(200).json({
    success: true,
    message: "OTP sent to customer's Official Email.",
    maskedEmail,
    expiresInSeconds: OTP_EXPIRY_MINUTES * 60,
    resendCooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
    data: {
      success: true,
      maskedEmail,
      expiresInSeconds: OTP_EXPIRY_MINUTES * 60,
      resendCooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
    },
  });
}

async function verifyOtp(req, res) {
  await ensureOfficialEmailColumns().catch(() => {});
  const { applicationId, leadId, id, otp } = req.body || {};
  const targetId = applicationId || leadId || id || req.params?.id || req.query?.id || req.query?.applicationId || req.query?.leadId;
  const userOtp = String(otp || '').trim();

  if (!targetId) {
    return res.status(400).json({
      success: false,
      message: 'Application ID or Lead ID is required.',
    });
  }

  if (!userOtp || userOtp.length !== 6 || !/^\d{6}$/.test(userOtp)) {
    return res.status(400).json({
      success: false,
      message: 'Please enter a valid 6-digit OTP code.',
    });
  }

  const lead = await resolveLead(targetId);
  if (!lead) {
    return res.status(404).json({
      success: false,
      message: 'Application record not found.',
    });
  }

  // Find active OTP record for application
  const rows = await query(
    `SELECT * FROM official_email_otps 
     WHERE (application_id = ? OR application_id = ? OR application_id = ?) AND is_used = 0 
     ORDER BY id DESC LIMIT 1`,
    [String(lead.id), String(lead.rawId), String(targetId)]
  );

  if (!rows || rows.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No active OTP verification request found. Please request a new OTP.',
    });
  }

  const otpRecord = rows[0];
  const nowTime = Date.now();
  const expiresAtTime = parseDbDate(otpRecord.expires_at).getTime();

  if (nowTime > expiresAtTime) {
    await query(`UPDATE official_email_otps SET is_used = 1 WHERE id = ?`, [otpRecord.id]);
    return res.status(400).json({
      success: false,
      message: 'OTP has expired. Please request a new OTP.',
    });
  }

  if (otpRecord.attempts >= otpRecord.max_attempts) {
    await query(`UPDATE official_email_otps SET is_used = 1 WHERE id = ?`, [otpRecord.id]);
    return res.status(400).json({
      success: false,
      message: 'Maximum verification attempts exceeded. Please request a new OTP.',
    });
  }

  const userOtpHash = hashOtp(userOtp);
  if (userOtpHash !== otpRecord.otp_hash) {
    const newAttempts = otpRecord.attempts + 1;
    const remaining = otpRecord.max_attempts - newAttempts;

    if (newAttempts >= otpRecord.max_attempts) {
      await query(`UPDATE official_email_otps SET attempts = ?, is_used = 1 WHERE id = ?`, [
        newAttempts,
        otpRecord.id,
      ]);
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP. Maximum attempts exceeded. Please request a new OTP.',
      });
    }

    await query(`UPDATE official_email_otps SET attempts = ? WHERE id = ?`, [newAttempts, otpRecord.id]);
    return res.status(400).json({
      success: false,
      message: `Invalid OTP code. ${remaining} attempt(s) remaining.`,
    });
  }

  // Verify domain validity before marking verified
  const domainCheck = await verifyOfficialEmailDomain(otpRecord.official_email);
  if (domainCheck.isFreeEmail || domainCheck.isDisposable || !domainCheck.isCorporateDomain) {
    return res.status(400).json({
      success: false,
      message: `Verification rejected: '${otpRecord.official_email}' is a Personal/Free Email domain (@${domainCheck.domain}). Official Email must be a corporate company domain (e.g. user@company.com).`,
      domainAnalysis: domainCheck,
    });
  }

  // Mark OTP as used
  await query(`UPDATE official_email_otps SET is_used = 1 WHERE id = ?`, [otpRecord.id]);

  // Update lead official email verification status
  const verifiedAt = new Date();
  const verifiedBy = req.user?.name || req.user?.email || 'Credit User';

  const updatedLead = await leadModel.updateOfficialEmailVerification(lead.id, {
    verified: 1,
    verifiedAt,
    verifiedBy,
  });

  // Create Audit Log entry
  await auditModel.create(req, {
    action: 'OFFICIAL_EMAIL_VERIFIED',
    lead,
    applicationId: lead.id,
    leadId: lead.rawId,
    entityType: 'OfficialEmail',
    entityId: lead.id,
    metadata: {
      officialEmail: otpRecord.official_email,
      verifiedBy,
      verifiedAt: verifiedAt.toISOString(),
    },
  });

  // Create Lead Activity entry
  try {
    const formatDbDate = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
    await query(
      `INSERT INTO lead_activities (lead_id, application_id, type, description, actor, created_at)
       VALUES (?, ?, 'verification', ?, ?, ?)`,
      [
        lead.rawId,
        lead.id,
        `Official Email verified (${otpRecord.official_email})`,
        verifiedBy,
        formatDbDate(verifiedAt),
      ]
    );
  } catch (actErr) {
    console.warn('[Official Email OTP] Failed to log activity:', actErr.message);
  }

  const formattedVerifiedAt = verifiedAt.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  return res.status(200).json({
    success: true,
    message: 'Official Email verified successfully.',
    officialEmailVerified: true,
    officialEmailVerifiedAt: formattedVerifiedAt,
    officialEmailVerifiedBy: verifiedBy,
    lead: updatedLead,
    data: {
      success: true,
      officialEmailVerified: true,
      officialEmailVerifiedAt: formattedVerifiedAt,
      officialEmailVerifiedBy: verifiedBy,
      lead: updatedLead,
    },
  });
}

async function resendOtp(req, res) {
  return sendOtp(req, res);
}

async function updateOfficialEmail(req, res) {
  await ensureOfficialEmailColumns().catch(() => {});
  const { applicationId, leadId, id, officialEmail, officeEmail } = req.body || {};
  const targetId = applicationId || leadId || id || req.params?.id || req.query?.id || req.query?.applicationId || req.query?.leadId;
  const newEmail = String(officeEmail || officialEmail || '').trim().toLowerCase();

  if (!targetId) {
    return res.status(400).json({
      success: false,
      message: 'Application ID or Lead ID is required.',
    });
  }

  if (!newEmail || !newEmail.includes('@') || !newEmail.includes('.')) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid Official Email address.',
    });
  }

  const lead = await resolveLead(targetId);
  if (!lead) {
    return res.status(404).json({
      success: false,
      message: 'Application record not found.',
    });
  }

  const updatedLead = await leadModel.updateOfficialEmail(lead.id, newEmail);

  // Invalidate any active OTPs for old email
  await query(
    `UPDATE official_email_otps SET is_used = 1 WHERE application_id = ? AND is_used = 0`,
    [lead.id]
  );

  // Audit log
  await auditModel.create(req, {
    action: 'OFFICIAL_EMAIL_UPDATED',
    lead,
    applicationId: lead.id,
    leadId: lead.rawId,
    entityType: 'OfficialEmail',
    entityId: lead.id,
    metadata: {
      previousEmail: lead.officeEmail || lead.email,
      newEmail,
      updatedBy: req.user?.name || req.user?.email || 'Credit User',
    },
  });

  return res.status(200).json({
    success: true,
    message: 'Official Email updated successfully.',
    officeEmail: newEmail,
    officialEmail: newEmail,
    officialEmailVerified: false,
    lead: updatedLead,
    data: {
      success: true,
      officeEmail: newEmail,
      officialEmail: newEmail,
      officialEmailVerified: false,
      lead: updatedLead,
    },
  });
}

const { verifyOfficialEmailDomain } = require('../services/officialEmailCheckerService');

async function checkDomainAnalysis(req, res) {
  const { email, officialEmail, officeEmail, applicationId, leadId, id } = req.body || req.query || {};
  let targetEmail = email || officialEmail || officeEmail;

  if (!targetEmail && (applicationId || leadId || id)) {
    const targetId = applicationId || leadId || id;
    const lead = await resolveLead(targetId);
    if (lead) {
      targetEmail = lead.officeEmail || lead.officialEmail || lead.email;
    }
  }

  if (!targetEmail) {
    return res.status(400).json({
      success: false,
      message: 'Email address or valid Application ID is required for domain analysis.',
    });
  }

  const analysis = await verifyOfficialEmailDomain(targetEmail);
  return res.status(200).json({
    success: true,
    data: analysis,
    ...analysis,
  });
}

module.exports = {
  sendOtp,
  verifyOtp,
  resendOtp,
  updateOfficialEmail,
  checkDomainAnalysis,
};

