const fs = require('fs');
const path = require('path');
const activityModel = require('../models/activityModel');
const auditModel = require('../models/auditModel');
const leadModel = require('../models/leadModel');
const leadStatusModel = require('../models/leadStatusModel');
const loanAgreementModel = require('../models/loanAgreementModel');
const sanctionModel = require('../models/sanctionModel');
const digioService = require('../services/digioService');
const loanAgreementService = require('../services/loanAgreementService');
const { resolveUploadPath: resolveConfiguredUploadPath, uploadPath } = require('../config/uploads');
const { notFound, success } = require('../utils/http');

const signedDir = uploadPath('agreements', 'signed');

async function getLeadOr404(res, leadId) {
  const lead = await leadModel.findById(leadId);
  if (!lead) {
    notFound(res, 'Lead not found');
    return null;
  }

  return lead;
}

async function getLatestLoanAgreement(req, res) {
  const lead = await getLeadOr404(res, req.params.id);
  if (!lead) return null;

  const agreement = await loanAgreementModel.findLatestByLead(lead);
  return success(res, agreement);
}

async function sendLoanAgreementForEsign(req, res) {
  const lead = await getLeadOr404(res, req.params.id);
  if (!lead) return null;

  const sanction = await sanctionModel.findLatestByLead(lead);
  if (!sanction) {
    const error = new Error('Sanction letter is required before generating loan agreement.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  if (sanction.emailStatus !== 'sent') {
    const error = new Error('Send the sanction letter successfully before sending loan agreement for eSign.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  if (sanction.customerDecision !== 'accepted') {
    const error = new Error('Customer must ACCEPT the sanction letter before loan agreement can be sent for eSign.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }


  let agreement = await loanAgreementModel.createForLead(lead, sanction, {
    provider: 'digio',
    status: 'draft',
    user: req.body?.user || req.user?.name || 'Credit Manager',
    metadata: {
      sanctionId: sanction.id,
      source: 'credit-manager',
    },
  });

  const pdf = await loanAgreementService.generateLoanAgreementPdf({ lead, sanction, agreement });
  agreement = await loanAgreementModel.updatePdf(agreement.id, {
    pdfPath: pdf.relativePath,
    metadata: {
      signatureCoordinates: pdf.signatureCoordinates,
      generatedAt: new Date().toISOString(),
    },
  });

  try {
    const providerResponse = await digioService.sendLoanAgreement({
      lead,
      sanction,
      agreement,
      pdfAbsolutePath: pdf.absolutePath,
      signatureCoordinates: pdf.signatureCoordinates,
    });
    agreement = await loanAgreementModel.markSent(agreement.id, {
      providerDocumentId: providerResponse.providerDocumentId,
      providerRequestId: providerResponse.providerRequestId,
      providerStatus: providerResponse.providerStatus,
      signingUrl: providerResponse.signingUrl,
      metadata: {
        request: providerResponse.request,
        response: providerResponse.rawResponse,
        signatureCoordinates: pdf.signatureCoordinates,
      },
    });

    await leadStatusModel.createForLead(lead, {
      source: 'loan_agreement_esign',
      actor: req.body?.user || req.user?.name || 'Credit Manager',
      actorRole: req.user?.role || 'credit-manager',
      sourceKey: `loan-agreement-sent:${agreement.id}`,
      stageKey: 'agreement_sent_for_esign',
      publicStatus: 'Agreement sent for eSign',
      title: 'Agreement sent for eSign',
      description: 'Your loan agreement has been sent for electronic signature.',
      metadata: {
        loanAgreementId: agreement.id,
        agreementNumber: agreement.agreementNumber,
        provider: agreement.provider,
        providerDocumentId: agreement.providerDocumentId,
        providerStatus: agreement.providerStatus,
      },
    });

    await activityModel.createForLead(lead, {
      type: 'document',
      description: 'Loan agreement sent to customer for Digio eSign',
      user: req.body?.user || req.user?.name || 'Credit Manager',
      metadata: {
        loanAgreementId: agreement.id,
        providerDocumentId: agreement.providerDocumentId,
        status: agreement.status,
        notification: 'digio_provider',
      },
    });
    await auditModel.create(req, {
      action: 'lead.loan_agreement_esign_send',
      entityType: 'lead_loan_agreement',
      entityId: String(agreement.id),
      lead,
      metadata: {
        provider: agreement.provider,
        providerDocumentId: agreement.providerDocumentId,
        providerStatus: agreement.providerStatus,
        notification: 'digio_provider',
      },
    });

    return success(res, agreement, 'Loan agreement sent for Digio eSign. Customer will receive Digio provider notification.', 201);
  } catch (error) {
    agreement = await loanAgreementModel.markFailed(agreement.id, {
      errorMessage: error.publicMessage || error.message || 'Unable to send loan agreement for eSign',
      providerStatus: 'failed',
      metadata: {
        providerError: error.providerResponse || null,
        providerMessage: error.providerMessage || null,
        hint: error.hint || null,
        signatureCoordinates: pdf.signatureCoordinates,
      },
    });

    await auditModel.create(req, {
      action: 'lead.loan_agreement_esign_failed',
      entityType: 'lead_loan_agreement',
      entityId: String(agreement.id),
      lead,
      metadata: {
        provider: agreement.provider,
        error: agreement.errorMessage,
      },
    });

    const publicError = new Error(agreement.errorMessage);
    publicError.statusCode = error.statusCode || 502;
    publicError.publicMessage = agreement.errorMessage;
    throw publicError;
  }
}

function isAgreementCompleted(status) {
  const normalized = String(status || '').toLowerCase();
  return normalized.includes('complete') || normalized.includes('signed');
}

function safeFileSegment(value, fallback = 'document') {
  return String(value || fallback)
    .trim()
    .replace(/[^a-z0-9_-]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || fallback;
}

function signedAgreementFileName(agreement) {
  const agreementNumber = safeFileSegment(agreement.agreementNumber, 'loan-agreement');
  const signer = safeFileSegment(agreement.signerName, 'borrower');
  return `${agreementNumber}-${signer}-signed-agreement.pdf`;
}

async function saveSignedPdfBuffer(agreement, fileBuffer) {
  if (!fileBuffer || !fileBuffer.length) return '';

  await fs.promises.mkdir(signedDir, { recursive: true });
  const fileName = signedAgreementFileName(agreement);
  const absolutePath = path.join(signedDir, fileName);
  await fs.promises.writeFile(absolutePath, fileBuffer);
  return `/uploads/agreements/signed/${fileName}`;
}

async function fetchAndSaveSignedPdf(agreement, providerStatus = {}) {
  const existingSignedPath = resolveUploadPath(agreement.signedPdfPath);
  if (existingSignedPath && fs.existsSync(existingSignedPath)) return agreement.signedPdfPath;

  if (providerStatus.documentBase64) {
    return saveSignedPdfBuffer(agreement, Buffer.from(providerStatus.documentBase64, 'base64'));
  }

  if (!agreement.providerDocumentId) return '';

  const signedPdf = await digioService.downloadSignedDocument(agreement.providerDocumentId);
  return saveSignedPdfBuffer(agreement, signedPdf);
}

function resolveUploadPath(relativePath) {
  return resolveConfiguredUploadPath(relativePath);
}

async function sendPdfFile(res, filePath, downloadName) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${downloadName}"`);
  return res.sendFile(filePath);
}

async function refreshLoanAgreementStatus(req, res) {
  const lead = await getLeadOr404(res, req.params.id);
  if (!lead) return null;

  let agreement = await loanAgreementModel.findLatestByLead(lead);
  if (!agreement) {
    const error = new Error('Loan agreement has not been sent yet.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  if (!agreement.providerDocumentId) {
    agreement = await loanAgreementModel.findLatestWithProviderDocumentByLead(lead);
    if (!agreement) {
      const error = new Error('Digio document id is not available for this lead yet.');
      error.statusCode = 400;
      error.publicMessage = error.message;
      throw error;
    }
  }

  const providerStatus = await digioService.getDocument(agreement.providerDocumentId);
  const nextMetadata = {
    ...(agreement.metadata || {}),
    latestProviderStatus: providerStatus.rawResponse,
    refreshedAt: new Date().toISOString(),
    refreshedBy: req.body?.user || req.user?.name || 'Credit Manager',
  };

  if (isAgreementCompleted(providerStatus.providerStatus)) {
    let signedPdfPath = '';
    let signedPdfError = null;
    try {
      signedPdfPath = await fetchAndSaveSignedPdf(agreement, providerStatus);
    } catch (error) {
      signedPdfError = {
        message: error.publicMessage || error.message || 'Unable to fetch signed PDF from Digio',
        providerResponse: error.providerResponse || null,
      };
    }

    agreement = await loanAgreementModel.markSigned(agreement.id, {
      providerStatus: providerStatus.providerStatus || 'completed',
      signedAt: providerStatus.signedAt,
      signedPdfPath,
      metadata: {
        ...nextMetadata,
        ...(signedPdfError ? { signedPdfFetchError: signedPdfError } : {}),
      },
    });

    await leadStatusModel.createForLead(lead, {
      source: 'loan_agreement_esign',
      actor: agreement.signerName || req.body?.user || req.user?.name || 'Customer',
      actorRole: 'customer',
      sourceKey: `loan-agreement-signed:${agreement.id}`,
      stageKey: 'agreement_signed',
      publicStatus: 'Agreement signed',
      title: 'Agreement signed',
      description: 'Your signed agreement has been received and is pending disbursement review.',
      occurredAt: providerStatus.signedAt || new Date(),
      metadata: {
        loanAgreementId: agreement.id,
        agreementNumber: agreement.agreementNumber,
        provider: agreement.provider,
        providerDocumentId: agreement.providerDocumentId,
        providerStatus: agreement.providerStatus,
        signedPdfPath: agreement.signedPdfPath,
      },
    });

    await activityModel.createForLead(lead, {
      type: 'document',
      description: signedPdfPath
        ? 'Loan agreement signed PDF fetched from Digio'
        : 'Loan agreement eSign status refreshed from Digio',
      user: req.body?.user || req.user?.name || 'Credit Manager',
      metadata: {
        loanAgreementId: agreement.id,
        providerDocumentId: agreement.providerDocumentId,
        providerStatus: agreement.providerStatus,
      },
    });
  } else {
    agreement = await loanAgreementModel.updateProviderStatus(agreement.id, {
      providerStatus: providerStatus.providerStatus || agreement.providerStatus || 'requested',
      signingUrl: providerStatus.signingUrl || digioService.buildSigningUrl(agreement.providerDocumentId),
      metadata: nextMetadata,
    });
  }

  await auditModel.create(req, {
    action: 'lead.loan_agreement_esign_refresh',
    entityType: 'lead_loan_agreement',
    entityId: String(agreement.id),
    lead,
    metadata: {
      providerDocumentId: agreement.providerDocumentId,
      providerStatus: agreement.providerStatus,
      status: agreement.status,
    },
  });

  return success(res, agreement, 'Loan agreement status refreshed from Digio.');
}

async function downloadSignedLoanAgreement(req, res) {
  const lead = await getLeadOr404(res, req.params.id);
  if (!lead) return null;

  let agreement = await loanAgreementModel.findLatestByLead(lead);
  if (!agreement) {
    const error = new Error('Loan agreement has not been sent yet.');
    error.statusCode = 404;
    error.publicMessage = error.message;
    throw error;
  }

  if (!agreement.providerDocumentId) {
    const agreementWithDocument = await loanAgreementModel.findLatestWithProviderDocumentByLead(lead);
    if (agreementWithDocument) agreement = agreementWithDocument;
  }

  const downloadName = signedAgreementFileName(agreement);
  const existingSignedPath = resolveUploadPath(agreement.signedPdfPath);
  if (existingSignedPath && fs.existsSync(existingSignedPath)) {
    return sendPdfFile(res, existingSignedPath, downloadName);
  }

  if (!agreement.providerDocumentId) {
    const error = new Error('Digio document id is not available for this agreement.');
    error.statusCode = 404;
    error.publicMessage = error.message;
    throw error;
  }

  const providerStatus = await digioService.getDocument(agreement.providerDocumentId);
  if (!isAgreementCompleted(providerStatus.providerStatus || agreement.providerStatus || agreement.status)) {
    const error = new Error(`Loan agreement is not signed yet. Current status: ${providerStatus.providerStatus || agreement.providerStatus || agreement.status}.`);
    error.statusCode = 409;
    error.publicMessage = error.message;
    throw error;
  }

  let signedPdfPath = '';
  try {
    signedPdfPath = await fetchAndSaveSignedPdf(agreement, providerStatus);
  } catch (error) {
    const publicError = new Error(error.publicMessage || error.message || 'Unable to fetch signed PDF from Digio.');
    publicError.statusCode = error.statusCode || 502;
    publicError.publicMessage = publicError.message;
    throw publicError;
  }

  agreement = await loanAgreementModel.markSigned(agreement.id, {
    providerStatus: providerStatus.providerStatus || 'completed',
    signedAt: providerStatus.signedAt,
    signedPdfPath,
    metadata: {
      ...(agreement.metadata || {}),
      latestProviderStatus: providerStatus.rawResponse,
      signedPdfDownloadedAt: new Date().toISOString(),
    },
  });

  await leadStatusModel.createForLead(lead, {
    source: 'loan_agreement_esign',
    actor: req.user?.name || 'Credit Manager',
    actorRole: req.user?.role || 'credit-manager',
    sourceKey: `loan-agreement-signed:${agreement.id}`,
    stageKey: 'agreement_signed',
    publicStatus: 'Agreement signed',
    title: 'Agreement signed',
    description: 'Your signed agreement has been received and is pending disbursement review.',
    occurredAt: providerStatus.signedAt || new Date(),
    metadata: {
      loanAgreementId: agreement.id,
      agreementNumber: agreement.agreementNumber,
      provider: agreement.provider,
      providerDocumentId: agreement.providerDocumentId,
      providerStatus: agreement.providerStatus,
      signedPdfPath: agreement.signedPdfPath,
    },
  });

  await activityModel.createForLead(lead, {
    type: 'document',
    description: 'Signed loan agreement downloaded from Digio archive',
    user: req.user?.name || 'Credit Manager',
    metadata: {
      loanAgreementId: agreement.id,
      providerDocumentId: agreement.providerDocumentId,
      signedPdfPath: agreement.signedPdfPath,
    },
  });

  const savedPath = resolveUploadPath(agreement.signedPdfPath);
  if (!savedPath || !fs.existsSync(savedPath)) {
    const error = new Error('Signed PDF was fetched but could not be found on the server.');
    error.statusCode = 404;
    error.publicMessage = error.message;
    throw error;
  }

  return sendPdfFile(res, savedPath, downloadName);
}

async function getDigioDiagnostics(req, res) {
  return success(res, {
    config: digioService.getMaskedConfig(),
    checkedAt: new Date().toISOString(),
  });
}

async function receiveDigioWebhook(req, res) {
  const payload = digioService.normalizeWebhookPayload(req.body || {});
  let agreement = payload.providerDocumentId
    ? await loanAgreementModel.findByProviderDocumentId(payload.providerDocumentId)
    : null;

  if (!agreement && payload.referenceNum) {
    agreement = await loanAgreementModel.findByAgreementNumber(payload.referenceNum);
  }

  if (!agreement) {
    return success(res, { received: true, matched: false }, 'Webhook received.');
  }

  let signedPdfPath = '';
  if (payload.documentBase64) {
    signedPdfPath = await saveSignedPdfBuffer(agreement, Buffer.from(payload.documentBase64, 'base64'));
  }

  const isCompleted = String(payload.status || '').toLowerCase().includes('complete') ||
    String(payload.status || '').toLowerCase().includes('signed');

  if (isCompleted) {
    let signedPdfError = null;
    if (!signedPdfPath) {
      try {
        signedPdfPath = await fetchAndSaveSignedPdf(agreement);
      } catch (error) {
        signedPdfError = {
          message: error.publicMessage || error.message || 'Unable to fetch signed PDF from Digio',
          providerResponse: error.providerResponse || null,
        };
      }
    }

    agreement = await loanAgreementModel.markSigned(agreement.id, {
      providerStatus: payload.status || 'completed',
      signedAt: payload.signedAt,
      signedPdfPath,
      metadata: {
        webhook: payload.raw,
        ...(signedPdfError ? { signedPdfFetchError: signedPdfError } : {}),
      },
    });

    const lead = await leadModel.findById(agreement.applicationId || agreement.leadId);
    if (lead) {
      await leadStatusModel.createForLead(lead, {
        source: 'digio_webhook',
        actor: agreement.signerName || 'Customer',
        actorRole: 'customer',
        sourceKey: `loan-agreement-signed:${agreement.id}`,
        stageKey: 'agreement_signed',
        publicStatus: 'Agreement signed',
        title: 'Agreement signed',
        description: 'Your signed agreement has been received and is pending disbursement review.',
        occurredAt: agreement.signedAt || payload.signedAt || new Date(),
        metadata: {
          loanAgreementId: agreement.id,
          agreementNumber: agreement.agreementNumber,
          provider: agreement.provider,
          providerDocumentId: agreement.providerDocumentId,
          providerStatus: agreement.providerStatus,
          signedAt: agreement.signedAt,
          signedPdfPath: agreement.signedPdfPath,
        },
      });
      await activityModel.createForLead(lead, {
        type: 'document',
        description: 'Customer completed Digio eSign for loan agreement',
        user: agreement.signerName || 'Customer',
        metadata: {
          loanAgreementId: agreement.id,
          providerDocumentId: agreement.providerDocumentId,
          signedAt: agreement.signedAt,
        },
      });
      await auditModel.create(req, {
        action: 'lead.loan_agreement_signed',
        entityType: 'lead_loan_agreement',
        entityId: String(agreement.id),
        lead,
        metadata: {
          providerDocumentId: agreement.providerDocumentId,
          signedAt: agreement.signedAt,
        },
      });
    }
  }

  return success(res, { received: true, matched: true, agreement }, 'Webhook processed.');
}

module.exports = {
  downloadSignedLoanAgreement,
  getDigioDiagnostics,
  getLatestLoanAgreement,
  receiveDigioWebhook,
  refreshLoanAgreementStatus,
  sendLoanAgreementForEsign,
};
