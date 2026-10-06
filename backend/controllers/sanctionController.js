const fs = require('fs');
const path = require('path');
const multer = require('multer');
const activityModel = require('../models/activityModel');
const auditModel = require('../models/auditModel');
const camSheetModel = require('../models/camSheetModel');
const loanAgreementModel = require('../models/loanAgreementModel');
const sanctionModel = require('../models/sanctionModel');
const leadModel = require('../models/leadModel');
const { ensureUploadDir, resolveUploadPath, uploadPath, syncUploadedFile } = require('../config/uploads');
const leadStatusModel = require('../models/leadStatusModel');
const authkeyWhatsAppService = require('../services/authkeyWhatsAppService');
const emailService = require('../services/emailService');
const sanctionLetterService = require('../services/sanctionLetterService');
const { notFound, requireFields, success } = require('../utils/http');

const acceptanceDir = ensureUploadDir('sanction-acceptance');
const sanctionsDir = uploadPath('sanctions');

function buildPublicFileUrl(req, filePath) {
  const requestHost = `${req.protocol}://${req.get('host')}`;
  const baseUrl = String(requestHost || '').replace(/\/+$/, '');
  const normalizedPath = String(filePath || '').startsWith('/') ? filePath : `/${filePath || ''}`;
  return `${baseUrl}${normalizedPath}`;
}

const acceptanceUpload = multer({
  fileFilter: (req, file, callback) => {
    const allowed = file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname || '');
    callback(allowed ? null : new Error('Only PDF files are allowed for sanction acceptance proof.'), allowed);
  },
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  storage: multer.diskStorage({
    destination: (req, file, callback) => callback(null, acceptanceDir),
    filename: (req, file, callback) => {
      const leadId = String(req.params.id || 'lead').replace(/[^a-z0-9_-]/gi, '_');
      callback(null, `${leadId}-sanction-acceptance-${Date.now()}.pdf`);
    },
  }),
});

async function getLeadOr404(res, leadId) {
  const lead = await leadModel.findById(leadId);
  if (!lead) {
    notFound(res, 'Lead not found');
    return null;
  }

  return lead;
}

async function getLatestLeadSanction(req, res) {
  const lead = await getLeadOr404(res, req.params.id);
  if (!lead) return null;

  const sanction = await sanctionModel.findLatestByLead(lead);
  return success(res, sanction);
}

async function downloadLeadSanctionPdf(req, res) {
  const lead = await getLeadOr404(res, req.params.id);
  if (!lead) return null;

  let sanction = await sanctionModel.findLatestByLead(lead);
  if (!sanction) {
    const error = new Error('Sanction letter is required before downloading PDF.');
    error.statusCode = 404;
    error.publicMessage = error.message;
    throw error;
  }

  let pdfAbsolutePath = resolveUploadPath(sanction.pdfPath);
  if (!pdfAbsolutePath || !fs.existsSync(pdfAbsolutePath)) {
    const pdf = await sanctionLetterService.generateSanctionPdf(sanction);
    pdfAbsolutePath = pdf.absolutePath;
    sanction = await sanctionModel.updateDelivery(sanction.id, {
      pdfPath: pdf.relativePath,
      emailStatus: sanction.emailStatus || 'pending',
      emailError: sanction.emailError || '',
    });
  }

  if (!pdfAbsolutePath || !fs.existsSync(pdfAbsolutePath)) {
    const error = new Error('Sanction PDF could not be generated.');
    error.statusCode = 500;
    error.publicMessage = error.message;
    throw error;
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${path.basename(sanction.pdfPath || pdfAbsolutePath)}"`);
  return res.sendFile(pdfAbsolutePath);
}

async function resendLeadSanction(req, res) {
  const lead = await getLeadOr404(res, req.params.id);
  if (!lead) return null;

  let sanction = await sanctionModel.findLatestByLead(lead);
  if (!sanction) {
    const error = new Error('Sanction letter is required before resending email.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  // Reset decision state to pending and issue a fresh decision token so customer can respond
  sanction = await sanctionModel.resetCustomerDecision(sanction.id);

  let pdfAbsolutePath = '';
  if (sanction.pdfPath) {
    const pdfFileName = path.basename(sanction.pdfPath);
    pdfAbsolutePath = path.join(sanctionsDir, pdfFileName);
  }

  if (!pdfAbsolutePath || !fs.existsSync(pdfAbsolutePath)) {
    const pdf = await sanctionLetterService.generateSanctionPdf(sanction);
    pdfAbsolutePath = pdf.absolutePath;
    sanction = await sanctionModel.updateDelivery(sanction.id, {
      pdfPath: pdf.relativePath,
      emailStatus: sanction.emailStatus || 'pending',
      emailError: sanction.emailError || '',
    });
  }

  try {
    const targetEmail = lead.email || sanction.emailTo;
    await sanctionLetterService.emailSanctionLetter({ ...sanction, emailTo: targetEmail, sourceSystem: lead.sourceSystem || lead.source }, pdfAbsolutePath);
    const whatsapp = await authkeyWhatsAppService.sendSanctionLetter({
      amount: sanction.principalAmount,
      customerName: sanction.borrower || lead.name,
      filename: `${sanction.agreementNumber || 'sanction-letter'}.pdf`,
      pdfUrl: buildPublicFileUrl(req, sanction.pdfPath),
      phone: sanction.borrowerPhone || lead.phone,
    });
    if (!whatsapp.sent) {
      console.warn('Sanction letter WhatsApp was not sent:', {
        agreementNumber: sanction.agreementNumber,
        attempted: whatsapp.attempted,
        error: whatsapp.error,
        phonePresent: Boolean(sanction.borrowerPhone || lead.phone),
      });
    }
    sanction = await sanctionModel.updateWhatsappDelivery(sanction.id, whatsapp);
    sanction = await sanctionModel.updateDelivery(sanction.id, {
      pdfPath: sanction.pdfPath,
      emailStatus: 'sent',
      emailError: '',
    });

    await activityModel.createForLead(lead, {
      type: 'email',
      description: 'Sanction letter email resent',
      user: req.body?.user || req.user?.name || 'Credit Manager',
      metadata: {
        sanctionId: sanction.id,
        agreementNumber: sanction.agreementNumber,
        emailTo: sanction.emailTo,
        whatsapp,
      },
    });
    await auditModel.create(req, {
      action: 'lead.sanction_email_resend',
      entityType: 'lead_sanction',
      entityId: String(sanction.id),
      lead,
      metadata: {
        agreementNumber: sanction.agreementNumber,
        emailTo: sanction.emailTo,
        whatsapp,
      },
    });

    return success(res, sanction, 'Sanction email resent successfully.');
  } catch (emailError) {
    sanction = await sanctionModel.updateDelivery(sanction.id, {
      pdfPath: sanction.pdfPath,
      emailStatus: 'failed',
      emailError: emailError.message || 'Unable to resend sanction email',
    });

    const error = new Error(`Sanction email failed: ${sanction.emailError}`);
    error.statusCode = 502;
    error.publicMessage = error.message;
    error.data = sanction;
    throw error;
  }
}

async function reviseLeadSanction(req, res) {
  const lead = await getLeadOr404(res, req.params.id);
  if (!lead) return null;

  requireFields(req.body || {}, ['sanction', 'revisionReason']);
  if (lead.status === 'Converted') {
    const error = new Error('Loan is already disbursed. Sanction revision is blocked after disbursement.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  const sanctionPayload = req.body.sanction || {};
  const revisionReason = String(req.body.revisionReason || '').trim();
  if (revisionReason.length < 8) {
    const error = new Error('Revision reason is required and must explain the correction.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }
  requireFields(sanctionPayload, [
    'agreementNumber',
    'agreementDate',
    'borrowerEmail',
    'principalAmount',
    'tenureDays',
    'interestRate',
    'processingFee',
    'gstAmount',
    'disbursedAmount',
    'dueDate',
    'repaymentAmount',
    'bankName',
    'accountNumber',
    'ifscCode',
  ]);

  const principalAmount = Number(sanctionPayload.principalAmount || 0);
  const repaymentAmount = Number(sanctionPayload.repaymentAmount || 0);
  if (!Number.isFinite(principalAmount) || principalAmount <= 0) {
    const error = new Error('Principal loan amount must be greater than zero.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }
  if (!Number.isFinite(repaymentAmount) || repaymentAmount <= 0) {
    const error = new Error('Repayment amount must be greater than zero.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  const camSheet = req.body.cam
    ? await camSheetModel.createForLead(lead, req.body.cam, {
      status: 'approved',
      user: req.body.user || req.user?.name || 'Credit Manager',
    })
    : null;
  const previousSanction = await sanctionModel.findLatestByLead(lead);
  const revisionInfo = await sanctionModel.nextRevisionInfo(lead, sanctionPayload.agreementNumber || previousSanction?.agreementNumber);
  const previousAgreement = await loanAgreementModel.findLatestByLead(lead);

  let sanction = await sanctionModel.createForLead(lead, {
    ...sanctionPayload,
    agreementNumber: revisionInfo.revisedAgreementNumber,
    camSheetId: camSheet?.id || sanctionPayload.camSheetId || null,
    parentSanctionId: previousSanction?.parentSanctionId || previousSanction?.id || null,
    revisionNumber: revisionInfo.revisionNumber,
    revisionReason,
    status: 'sent',
    user: req.body.user || req.user?.name || 'Credit Manager',
  });

  const updatedEmail = sanctionPayload.borrowerEmail || sanctionPayload.emailTo;
  const updatedPhone = sanctionPayload.borrowerPhone;
  if (updatedEmail || updatedPhone) {
    await leadModel.updateContactInfo(lead.id, { email: updatedEmail, phone: updatedPhone });
  }

  const pdf = await sanctionLetterService.generateSanctionPdf(sanction);
  let whatsapp = null;
  try {
    await sanctionLetterService.emailSanctionLetter({ ...sanction, pdfPath: pdf.relativePath, sourceSystem: lead.sourceSystem || lead.source }, pdf.absolutePath);
    whatsapp = await authkeyWhatsAppService.sendSanctionLetter({
      amount: sanction.principalAmount,
      customerName: sanction.borrower || lead.name,
      filename: `${sanction.agreementNumber || 'sanction-letter'}.pdf`,
      pdfUrl: buildPublicFileUrl(req, pdf.relativePath),
      phone: sanction.borrowerPhone || lead.phone,
    });
    sanction = await sanctionModel.updateWhatsappDelivery(sanction.id, whatsapp);
    sanction = await sanctionModel.updateDelivery(sanction.id, {
      pdfPath: pdf.relativePath,
      emailStatus: 'sent',
      emailError: '',
    });
    await sanctionModel.markSupersededForLead(lead, sanction.id);
    await loanAgreementModel.markSupersededForLead(lead, null, {
      reason: revisionReason,
      replacementSanctionId: sanction.id,
      previousAgreementId: previousAgreement?.id || null,
    });
  } catch (emailError) {
    sanction = await sanctionModel.updateDelivery(sanction.id, {
      pdfPath: pdf.relativePath,
      emailStatus: 'failed',
      emailError: emailError.message || 'Unable to send revised sanction email',
    });
    const error = new Error(`Revised sanction email failed: ${sanction.emailError}`);
    error.statusCode = 502;
    error.publicMessage = error.message;
    error.data = { sanction, camSheet };
    throw error;
  }

  await activityModel.createForLead(lead, {
    type: 'email',
    description: 'Revised sanction letter generated and sent',
    user: req.body.user || req.user?.name || 'Credit Manager',
    metadata: {
      camSheetId: camSheet?.id || null,
      previousSanctionId: previousSanction?.id || null,
      previousAgreementId: previousAgreement?.id || null,
      sanctionId: sanction.id,
      agreementNumber: sanction.agreementNumber,
      baseAgreementNumber: revisionInfo.baseAgreementNumber,
      revisionNumber: revisionInfo.revisionNumber,
      revisionReason,
      principalAmount: sanction.principalAmount,
      repaymentAmount: sanction.repaymentAmount,
      whatsapp,
    },
  });
  await auditModel.create(req, {
    action: 'lead.sanction_revise',
    entityType: 'lead_sanction',
    entityId: String(sanction.id),
    lead,
    metadata: {
      camSheetId: camSheet?.id || null,
      previousSanctionId: previousSanction?.id || null,
      previousAgreementId: previousAgreement?.id || null,
      agreementNumber: sanction.agreementNumber,
      baseAgreementNumber: revisionInfo.baseAgreementNumber,
      revisionNumber: revisionInfo.revisionNumber,
      revisionReason,
      principalAmount: sanction.principalAmount,
      repaymentAmount: sanction.repaymentAmount,
      whatsapp,
    },
  });

  return success(res, { sanction, camSheet }, 'Revised sanction letter sent successfully.', 201);
}

function uploadAcceptanceProofMiddleware() {
  return acceptanceUpload.single('file');
}

async function uploadSanctionAcceptanceProof(req, res) {
  const lead = await getLeadOr404(res, req.params.id);
  if (!lead) return null;

  const sanction = await sanctionModel.findLatestByLead(lead);
  if (!sanction) {
    const error = new Error('Sanction letter is required before uploading acceptance proof.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  if (!req.file) {
    const error = new Error('Acceptance proof PDF is required.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }
  const header = await fs.promises.readFile(req.file.path, { encoding: 'utf8', flag: 'r' }).then((value) => value.slice(0, 5)).catch(() => '');
  if (header !== '%PDF-') {
    await fs.promises.unlink(req.file.path).catch(() => undefined);
    const error = new Error('Uploaded acceptance proof is not a valid PDF file.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  const relativePath = `/uploads/sanction-acceptance/${req.file.filename}`;
  syncUploadedFile(req.file.path, relativePath);
  const updatedSanction = await sanctionModel.updateAcceptanceProof(sanction.id, {
    path: relativePath,
    originalFileName: req.file.originalname,
    user: req.body?.user || req.user?.name || 'Credit Manager',
  });

  await activityModel.createForLead(lead, {
    type: 'document',
    description: 'Sanction acceptance reply proof uploaded',
    user: req.body?.user || req.user?.name || 'Credit Manager',
    metadata: {
      sanctionId: sanction.id,
      agreementNumber: sanction.agreementNumber,
      file: relativePath,
      originalFileName: req.file.originalname,
    },
  });
  await auditModel.create(req, {
    action: 'lead.sanction_acceptance_proof_upload',
    entityType: 'lead_sanction',
    entityId: String(sanction.id),
    lead,
    metadata: {
      agreementNumber: sanction.agreementNumber,
      file: relativePath,
      originalFileName: req.file.originalname,
    },
  });

  return success(res, updatedSanction, 'Sanction acceptance proof uploaded.');
}

async function handleCustomerSanctionDecision(req, res) {
  const token = req.params.token || req.query.token;
  const action = String(req.query.action || req.body?.action || '').toLowerCase();

  if (!token) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
        <head><title>Response Recorded</title></head>
        <body style="font-family:sans-serif;text-align:center;padding-top:40px;color:#555;">
          <p style="font-size:14px;">Invalid response link.</p>
        </body>
      </html>
    `);
  }

  const sanction = await sanctionModel.findByDecisionToken(token);
  if (!sanction) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html>
        <head><title>Response Recorded</title></head>
        <body style="font-family:sans-serif;text-align:center;padding-top:40px;color:#555;">
          <p style="font-size:14px;">Record not found.</p>
        </body>
      </html>
    `);
  }

  const leadId = sanction.leadId || sanction.applicationId;
  const isSanctionAlreadyDecided = sanction.customerDecision && sanction.customerDecision !== 'pending';

  // If this specific sanction is already decided, block action & return already recorded response!
  if (isSanctionAlreadyDecided) {
    const isAlreadyAccepted = sanction.customerDecision === 'accepted';
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({
        success: true,
        alreadyDecided: true,
        customerDecision: sanction.customerDecision,
        leadId,
        borrower: sanction.borrower,
        agreementNumber: sanction.agreementNumber,
        principalAmount: sanction.principalAmount,
      });
    }

    return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Response Already Recorded</title>
        </head>
        <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;text-align:center;padding:50px 20px;color:#0f172a;background:#f8fafc;">
          <div style="max-width:440px;margin:0 auto;background:#fff;padding:32px 24px;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.06);border:1px solid #e2e8f0;">
            <div style="font-size:42px;margin-bottom:12px;color:${isAlreadyAccepted ? '#059669' : '#dc2626'};">${isAlreadyAccepted ? '✓' : '✕'}</div>
            <h2 style="font-size:18px;font-weight:bold;margin:0 0 8px 0;color:${isAlreadyAccepted ? '#047857' : '#b91c1c'};">Response Already Recorded</h2>
            <p style="font-size:13px;color:#475569;margin:0 0 16px 0;line-height:1.5;">
              You have already <strong>${isAlreadyAccepted ? 'ACCEPTED' : 'REJECTED'}</strong> Loan Sanction Letter <strong>${sanction.agreementNumber}</strong>.
            </p>
            <p style="font-size:11px;color:#94a3b8;margin:0;">No further action is required. You may close this tab.</p>
          </div>
        </body>
      </html>
    `);
  }

  const isAccept = action === 'accept' || action === 'accepted';
  const newDecision = isAccept ? 'accepted' : 'rejected';
  const clientIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || '').toString().split(',')[0].trim();
  const userAgent = req.get('user-agent') || '';

  // Update sanction customer decision in DB
  const updatedSanction = await sanctionModel.updateCustomerDecision(sanction.id, {
    decision: newDecision,
    notes: req.body?.notes || (isAccept ? 'Accepted via email button click' : 'Rejected via email button click'),
    ip: clientIp,
    userAgent: userAgent,
  }, leadId);

  // Update lead/application status in DB
  const lead = await leadModel.findById(leadId);

  if (lead) {
    const nextStatus = isAccept ? 'Approved' : 'Rejected';
    await leadModel.updateStatus(leadId, nextStatus);

    await activityModel.createForLead(lead, {
      type: isAccept ? 'sanction_accepted' : 'sanction_rejected',
      description: isAccept
        ? `Borrower ACCEPTED Loan Sanction Letter of ₹${Number(sanction.principalAmount || 0).toLocaleString('en-IN')} (IP: ${clientIp})`
        : `Borrower REJECTED Loan Sanction Letter (IP: ${clientIp})`,
      user: sanction.borrower || lead.name || 'Borrower',
      metadata: {
        sanctionId: sanction.id,
        agreementNumber: sanction.agreementNumber,
        customerDecision: newDecision,
        ip: clientIp,
        userAgent: userAgent,
        decidedAt: new Date().toISOString(),
      },
    });
  }

  // Send Revert Confirmation Email to Customer (WITHOUT generating or attaching PDF)
  try {
    await sanctionLetterService.sendSanctionDecisionConfirmationEmail(updatedSanction, lead || {});
  } catch (emailErr) {
    console.error('Failed sending sanction decision confirmation email:', emailErr.message);
  }

  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    return res.json({
      success: true,
      customerDecision: newDecision,
      leadId,
      borrower: sanction.borrower,
      agreementNumber: sanction.agreementNumber,
      principalAmount: sanction.principalAmount,
    });
  }

  // Return minimal plain response without any public customer UI card
  return res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Response Recorded</title>
        <script>
          window.onload = function() {
            setTimeout(function() {
              try { window.close(); } catch(e) {}
            }, 600);
          };
        </script>
      </head>
      <body style="font-family:sans-serif;text-align:center;padding-top:50px;color:#333;background:#fff;">
        <p style="font-size:14px;font-weight:600;margin:0;">Response recorded successfully.</p>
        <p style="font-size:12px;color:#888;margin-top:6px;">You may close this tab.</p>
      </body>
    </html>
  `);
}

async function rejectPostSanction(req, res) {
  const lead = await getLeadOr404(res, req.params.id);
  if (!lead) return null;

  const sanction = await sanctionModel.findLatestByLead(lead);
  if (!sanction) {
    const error = new Error('Sanction letter is required before rejecting post-sanction.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  const emailSubject = String(req.body.emailSubject || '').trim();
  const emailBody = String(req.body.emailBody || req.body.emailMessage || '').trim();
  const reason = String(req.body.reason || req.body.notes || '').trim();

  if (!emailSubject) {
    const error = new Error('Email subject is required.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  if (!emailBody) {
    const error = new Error('Email body content is required for sending customer rejection email.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  const toEmail = String(req.body.emailTo || sanction.borrowerEmail || sanction.emailTo || lead.email || '').trim();
  if (!toEmail) {
    const error = new Error('Customer email address is not available.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  const formattedHtml = emailBody
    .split('\n')
    .map(line => line.trim() ? `<p style="margin:0 0 12px 0;">${line}</p>` : '<br/>')
    .join('');

  await emailService.sendMail({
    tenantSlug: lead.sourceSystem || lead.source || sanction.sourceSystem,
    to: toEmail,
    subject: emailSubject,
    html: `
      <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.6;font-size:14px;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background-color:#ffffff;">
        ${formattedHtml}
      </div>
    `,
  });

  let whatsapp = null;
  try {
    whatsapp = await authkeyWhatsAppService.sendLoanRejectionMessage({
      customerName: sanction.borrower || lead.name,
      phone: sanction.borrowerPhone || lead.phone,
    });
  } catch (waErr) {
    console.warn('WhatsApp rejection notification warning:', waErr.message);
  }

  const updatedLead = await leadModel.updateOperations(lead.id, {
    status: 'Lost',
    assignedTo: lead.assignedTo || '',
  });

  const updatedSanction = await sanctionModel.markCreditManagerRejected(sanction.id, {
    notes: reason || 'Rejected by Credit Manager post-sanction',
    user: req.body.user || req.user?.name || 'Credit Manager',
  });

  const actor = req.body.user || req.user?.name || 'Credit Manager';
  const actorRole = req.user?.role || 'credit-manager';

  await activityModel.createForLead(updatedLead || lead, {
    type: 'email',
    description: `Credit Manager rejected loan post-sanction and sent rejection email to ${toEmail}. Reason: ${reason || 'Post-sanction decision'}`,
    user: actor,
    metadata: {
      emailTo: toEmail,
      emailSubject,
      reason,
      sanctionId: sanction.id,
      agreementNumber: sanction.agreementNumber,
      whatsapp,
    },
  });

  await leadStatusModel.recordStatusChange(updatedLead || lead, lead, {
    source: 'credit_manager_post_sanction_rejection',
    actor,
    actorRole,
    publicStatus: 'Application closed',
    title: 'Loan application rejected after sanction',
    description: `Your loan application has been rejected after post-sanction review. Rejection email sent to ${toEmail}.`,
    metadata: {
      emailTo: toEmail,
      emailSubject,
      reason,
      sanctionId: sanction.id,
      agreementNumber: sanction.agreementNumber,
    },
  });

  await auditModel.create(req, {
    action: 'lead.credit_reject_post_sanction',
    entityType: 'lead_sanction',
    entityId: String(sanction.id),
    lead: updatedLead || lead,
    metadata: {
      emailTo: toEmail,
      emailSubject,
      reason,
      agreementNumber: sanction.agreementNumber,
    },
  });

  return success(res, { lead: updatedLead || lead, sanction: updatedSanction, emailTo: toEmail }, 'Loan rejected post-sanction and rejection email sent to customer.');
}

module.exports = {
  downloadLeadSanctionPdf,
  getLatestLeadSanction,
  handleCustomerSanctionDecision,
  rejectPostSanction,
  reviseLeadSanction,
  resendLeadSanction,
  uploadAcceptanceProofMiddleware,
  uploadSanctionAcceptanceProof,
};
