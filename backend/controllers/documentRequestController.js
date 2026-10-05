const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const activityModel = require('../models/activityModel');
const auditModel = require('../models/auditModel');
const documentRequestModel = require('../models/documentRequestModel');
const leadModel = require('../models/leadModel');
const leadStatusModel = require('../models/leadStatusModel');
const telecallerModel = require('../models/telecallerModel');
const { config } = require('../config/env');
const { ensureUploadDir } = require('../config/uploads');
const authkeyWhatsAppService = require('../services/authkeyWhatsAppService');
const { getTenantPool, tenantLocalStorage } = require('../config/db');
const { notFound, requireFields, success } = require('../utils/http');

const uploadDir = ensureUploadDir('lead-documents');

const ALLOWED_DOCUMENT_KEYS = new Set([
  'pan',
  'aadhaar',
  'aadhaar_front',
  'aadhaar_back',
  'selfie',
  'video_kyc',
  'salary_slip_current',
  'salary_slip_previous',
  'salary_slip_old',
  'salary_slip_last_3_6_months',
  'company_id_card',
  'bank_proof',
  'bank_statement_last_6_months',
  'bank_statement_6_months',
  'cancelled_cheque',
  'itr_last_2_3_years',
  'property_papers',
  'rent_agreement',
  'noc',
  'appointment_letter',
  'utility_bill',
  'passport',
  'voter_id',
  'driving_license',
  'other',
]);

const storage = multer.diskStorage({
  destination: (req, file, callback) => callback(null, uploadDir),
  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    const safeToken = String(req.params.token || 'document').replace(/[^a-z0-9]/gi, '');
    const safeField = String(file.fieldname || 'document').replace(/[^a-z0-9_-]/gi, '');
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    callback(null, `${safeToken}-${safeField}-${uniqueSuffix}${extension}`);
  },
});

const upload = multer({
  fileFilter: (req, file, callback) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    const allowed = /pdf|png|jpe?g|webp|mp4|webm|quicktime|video/i.test(file.mimetype || '') ||
      ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.mp4', '.webm', '.mov', '.3gp'].includes(extension);
    callback(allowed ? null : new Error('Only PDF, image, and video files are allowed.'), allowed);
  },
  limits: { fileSize: 10 * 1024 * 1024, files: 20 },
  storage,
});

function uploadMiddleware() {
  return (req, res, next) => {
    upload.any()(req, res, (error) => {
      if (error) {
        const publicError = new Error(
          error.code === 'LIMIT_FILE_SIZE'
            ? 'Each document must be 10 MB or smaller.'
            : error.code === 'LIMIT_FILE_COUNT'
              ? 'Too many files selected. Please upload the requested documents only.'
              : error.message || 'Unable to upload documents.'
        );
        publicError.statusCode = 400;
        publicError.publicMessage = publicError.message;
        return next(publicError);
      }

      if (req.tenant) {
        const pool = getTenantPool(req.tenant);
        return tenantLocalStorage.run({ pool, tenant: req.tenant }, () => next());
      }

      return next();
    });
  };
}

async function getLeadOr404(res, leadId) {
  const lead = await leadModel.findById(leadId);
  if (!lead) {
    notFound(res, 'Lead not found');
    return null;
  }

  return lead;
}

function buildUploadUrl(req, token) {
  const configuredBaseUrl = config.esign.publicBaseUrl;
  const requestOrigin = req.get('origin');
  const requestHost = `${req.protocol}://${req.get('host')}`;
  const baseUrl = String(configuredBaseUrl || requestOrigin || requestHost || '').replace(/\/+$/, '');
  return `${baseUrl}/document-upload/${encodeURIComponent(token)}`;
}

async function listLeadDocumentRequests(req, res) {
  const lead = await getLeadOr404(res, req.params.id);
  if (!lead) return null;

  const requests = await documentRequestModel.findByLead(lead);
  return success(res, requests);
}

async function createLeadDocumentRequest(req, res) {
  const body = req.body || {};
  const documents = Array.isArray(body.documents) && body.documents.length
    ? body.documents
    : body.documentKey
      ? [{ documentKey: body.documentKey, key: body.documentKey, label: body.label }]
      : [];

  if (!documents.length) {
    requireFields(body, ['documentKey', 'label']);
  }

  const invalidDocument = documents.find((document) => !ALLOWED_DOCUMENT_KEYS.has(document.documentKey || document.key));
  if (invalidDocument) {
    const error = new Error('Invalid document type requested.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  const lead = await getLeadOr404(res, req.params.id);
  if (!lead) return null;

  const group = await documentRequestModel.createForLead(lead, {
    ...body,
    documents,
  });
  const uploadUrl = buildUploadUrl(req, group.token);
  const whatsapp = await authkeyWhatsAppService.sendDocumentUploadLink({
    customerName: lead.name,
    phone: lead.phone,
    token: group.token,
  });
  if (!whatsapp.sent) {
    console.warn('Document upload WhatsApp was not sent:', {
      applicationId: lead.id,
      attempted: whatsapp.attempted,
      error: whatsapp.error,
      phonePresent: Boolean(lead.phone),
    });
  }
  const labels = group.requests.map((request) => request.label).join(', ');
  await leadStatusModel.createForLead(lead, {
    source: 'document_request',
    actor: body.user || body.actor || req.user?.name || 'CRM User',
    actorRole: req.user?.role || 'telecaller',
    sourceKey: `document-request:${group.token}`,
    stageKey: 'documents_requested',
    publicStatus: 'Documents requested',
    title: 'Documents requested',
    description: 'We have requested additional documents to continue your loan application.',
    metadata: {
      documentKeys: group.requests.map((request) => request.documentKey),
      requestIds: group.requests.map((request) => request.id),
      token: group.token,
      expiresAt: group.expiresAt,
    },
  });
  await activityModel.createForLead(lead, {
    type: 'document',
    description: `Document upload link generated for ${labels}`,
    user: body.user || body.actor || 'CRM User',
    metadata: {
      documentKeys: group.requests.map((request) => request.documentKey),
      requestIds: group.requests.map((request) => request.id),
      token: group.token,
      expiresAt: group.expiresAt,
      uploadUrl,
      whatsapp,
    },
  });
  await auditModel.create(req, {
    action: 'lead.document_upload_link_generate',
    entityType: 'lead_document_request',
    entityId: group.token,
    lead,
    metadata: {
      documentKeys: group.requests.map((request) => request.documentKey),
      expiresAt: group.expiresAt,
      requestIds: group.requests.map((request) => request.id),
      uploadUrl,
      whatsapp,
    },
  });

  return success(res, {
    ...group,
    uploadUrl,
    whatsapp,
  }, whatsapp.sent
    ? 'Document upload link generated and sent on WhatsApp.'
    : 'Document upload link generated. WhatsApp message was not sent.',
  201);
}

async function removeLeadDocumentRequest(req, res) {
  const lead = await getLeadOr404(res, req.params.id);
  if (!lead) return null;

  const requests = await documentRequestModel.findGroupByToken(req.params.token);
  const belongsToLead = requests.some((request) => (
    request.leadId === lead.rawId || request.applicationId === lead.id
  ));
  if (!requests.length || !belongsToLead) return notFound(res, 'Document upload link not found');

  const updatedRequests = await documentRequestModel.cancelGroupByToken(req.params.token);
  await activityModel.createForLead(lead, {
    type: 'document',
    description: 'Document upload link removed',
    user: req.body?.user || req.body?.actor || 'CRM User',
    metadata: {
      token: req.params.token,
      requestIds: requests.map((request) => request.id),
    },
  });
  await auditModel.create(req, {
    action: 'lead.document_upload_link_remove',
    entityType: 'lead_document_request',
    entityId: req.params.token,
    lead,
    metadata: {
      requestIds: requests.map((request) => request.id),
    },
  });

  return success(res, updatedRequests, 'Document upload link removed.');
}

function isExpired(requests) {
  const expiresAt = requests[0]?.expiresAt;
  return Boolean(expiresAt && new Date(expiresAt).getTime() < Date.now());
}

function isCompleted(requests) {
  return requests.length > 0 && requests.every((request) => request.status === 'uploaded');
}

function isCancelled(requests) {
  return requests.length > 0 && requests.every((request) => request.status === 'cancelled' || request.status === 'uploaded');
}

async function buildPublicPayload(requests) {
  const firstRequest = requests[0];
  const lead = await leadModel.findById(firstRequest.applicationId || firstRequest.leadId);
  const completed = isCompleted(requests);
  const cancelled = isCancelled(requests) && !completed;
  const expired = isExpired(requests) || completed || cancelled;

  return {
    token: firstRequest.groupToken || firstRequest.token,
    applicationId: firstRequest.applicationId || '',
    leadId: firstRequest.leadId || '',
    customerName: lead?.name || '',
    phone: lead?.phone || '',
    email: lead?.email || '',
    loanAmount: lead?.loanAmount || 0,
    status: completed ? 'uploaded' : cancelled ? 'cancelled' : expired ? 'expired' : 'pending',
    expired,
    completed,
    expiresAt: firstRequest.expiresAt,
    requests,
  };
}

async function getPublicDocumentRequest(req, res) {
  const requests = await documentRequestModel.findGroupByToken(req.params.token);
  if (!requests.length) return notFound(res, 'Document request not found');

  return success(res, await buildPublicPayload(requests));
}

async function uploadPublicDocument(req, res) {
  const requests = await documentRequestModel.findGroupByToken(req.params.token);
  if (!requests.length) return notFound(res, 'Document request not found');

  if (isExpired(requests) || isCompleted(requests) || isCancelled(requests)) {
    const error = new Error('This upload link has expired.');
    error.statusCode = 410;
    error.publicMessage = error.message;
    throw error;
  }

  const files = Array.isArray(req.files) ? req.files : [];
  if (!files.length) {
    const error = new Error('Document file is required.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  const pendingRequests = requests.filter((request) => request.status !== 'uploaded');
  const uploadedRequests = [];
  const lead = await leadModel.findById(requests[0].applicationId || requests[0].leadId);

  for (const request of pendingRequests) {
    const file = files.find((candidate) => (
      candidate.fieldname === `document_${request.id}` ||
      candidate.fieldname === `document_${request.documentKey}` ||
      (pendingRequests.length === 1 && candidate.fieldname === 'document')
    ));

    if (!file) continue;

    const relativePath = `/uploads/lead-documents/${file.filename}`;
    const updatedRequest = await documentRequestModel.markUploaded(request, {
      mimeType: file.mimetype,
      originalName: file.originalname,
      path: relativePath,
      size: file.size,
    });
    uploadedRequests.push(updatedRequest);

    if (lead) {
      await telecallerModel.updateDocumentCheck(lead, {
        key: request.documentKey,
        label: request.label,
        remark: 'Uploaded by customer via secure upload link.',
        status: 'uploaded',
        user: 'Customer',
      });
      await activityModel.createForLead(lead, {
        type: 'document',
        description: `Customer uploaded ${request.label}`,
        user: 'Customer',
        metadata: {
          documentKey: request.documentKey,
          requestId: request.id,
          file: relativePath,
          originalFileName: file.originalname,
        },
      });
      await auditModel.create(req, {
        action: 'lead.document_upload',
        entityType: 'lead_document_request',
        entityId: String(updatedRequest.id),
        lead,
        metadata: {
          documentKey: request.documentKey,
          file: relativePath,
          originalFileName: file.originalname,
        },
      });
    }
  }

  if (!uploadedRequests.length) {
    const error = new Error('No pending requested document was uploaded.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  const refreshedRequests = await documentRequestModel.findGroupByToken(req.params.token);
  if (lead && isCompleted(refreshedRequests)) {
    await leadStatusModel.createForLead(lead, {
      source: 'document_upload',
      actor: 'Customer',
      actorRole: 'customer',
      sourceKey: `document-upload-complete:${req.params.token}`,
      stageKey: 'documents_uploaded',
      publicStatus: 'Documents uploaded',
      title: 'Documents uploaded',
      description: 'Your uploaded documents have been received and are being verified.',
      metadata: {
        token: req.params.token,
        requestIds: refreshedRequests.map((request) => request.id),
        documentKeys: refreshedRequests.map((request) => request.documentKey),
      },
    });
  }

  return success(res, await buildPublicPayload(refreshedRequests), 'Document uploaded successfully.');
}

module.exports = {
  createLeadDocumentRequest,
  getPublicDocumentRequest,
  listLeadDocumentRequests,
  removeLeadDocumentRequest,
  uploadMiddleware,
  uploadPublicDocument,
};
