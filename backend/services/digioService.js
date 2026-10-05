const fs = require('fs');
const { config } = require('../config/env');

function base64Credentials() {
  return Buffer.from(`${config.digio.clientId}:${config.digio.clientSecret}`).toString('base64');
}

function maskedValue(value, visible = 4) {
  const text = String(value || '');
  if (!text) return '';
  return `${text.slice(0, visible)}${'*'.repeat(Math.max(text.length - visible, 0))}`;
}

function getMaskedConfig() {
  return {
    environment: config.digio.environment,
    baseUrl: normalizeBaseUrl(),
    clientId: maskedValue(config.digio.clientId),
    hasClientSecret: Boolean(config.digio.clientSecret),
    signType: normalizeSignType(config.digio.signType),
    notifyForSigning: Boolean(config.digio.notifyForSigning),
    hasWebhookUrl: Boolean(config.digio.webhookUrl),
    hasRedirectUrl: Boolean(config.digio.redirectUrl),
  };
}

function normalizeBaseUrl() {
  return String(config.digio.baseUrl || '').replace(/\/+$/, '');
}

function assertConfigured() {
  if (!config.digio.clientId || !config.digio.clientSecret) {
    const error = new Error('Digio credentials are not configured.');
    error.statusCode = 500;
    throw error;
  }
  if (!normalizeBaseUrl()) {
    const error = new Error('Digio API base URL is not configured.');
    error.statusCode = 500;
    throw error;
  }
}

function normalizeSignType(value) {
  const signType = String(value || 'AADHAAR').trim().toUpperCase();
  return signType === 'AADHAR' ? 'AADHAAR' : signType;
}

function digioSigner({ lead, sanction }) {
  const email = sanction.borrowerEmail || sanction.emailTo || lead.email || '';
  const phone = sanction.borrowerPhone || lead.phone || '';
  return {
    identifier: email || phone,
    name: sanction.borrower || lead.name || 'Borrower',
    reason: 'Loan Agreement Acceptance',
    sign_type: normalizeSignType(config.digio.signType),
  };
}

function extractSigningUrl(response) {
  if (!response || typeof response !== 'object') return '';
  const directUrl = (
    response.signing_url ||
    response.signingUrl ||
    response.esign_url ||
    response.esignUrl ||
    response.sign_url ||
    response.signUrl ||
    response.invitation_link ||
    response.invitationLink ||
    response.signingParties?.[0]?.signingUrl ||
    response.signing_parties?.[0]?.signing_url ||
    response.parties?.[0]?.signing_url ||
    ''
  );
  if (directUrl) return normalizeSigningUrl(directUrl);

  return findNestedSigningUrl(response);
}

function extractDocumentId(response) {
  if (!response || typeof response !== 'object') return '';
  return response.id || response.document_id || response.documentId || response.documentSignId || response.document_sign_id || '';
}

function extractRequestId(response) {
  if (!response || typeof response !== 'object') return '';
  return response.request_id || response.requestId || response.reference_id || response.referenceId || '';
}

function findNestedSigningUrl(value, depth = 0) {
  if (!value || depth > 4) return '';
  if (typeof value === 'string') {
    return /https?:\/\/(app|api)\.digio\.in\/#s\//i.test(value) ? normalizeSigningUrl(value) : '';
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNestedSigningUrl(item, depth + 1);
      if (found) return found;
    }
    return '';
  }
  if (typeof value !== 'object') return '';

  for (const [key, item] of Object.entries(value)) {
    const keyLooksRelevant = /sign|invite|url|link/i.test(key);
    if (keyLooksRelevant && typeof item === 'string' && /https?:\/\/(app|api)\.digio\.in\/#s\//i.test(item)) {
      return normalizeSigningUrl(item);
    }
    const found = findNestedSigningUrl(item, depth + 1);
    if (found) return found;
  }
  return '';
}

function findNestedSigningId(value, depth = 0) {
  if (!value || depth > 4) return '';
  if (typeof value === 'string') {
    const match = value.match(/\bDGO[A-Z0-9]+\b/i);
    return match?.[0] || '';
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNestedSigningId(item, depth + 1);
      if (found) return found;
    }
    return '';
  }
  if (typeof value !== 'object') return '';

  for (const [key, item] of Object.entries(value)) {
    const keyLooksRelevant = /sign|invite|url|link|request|id/i.test(key);
    if (!keyLooksRelevant) continue;
    const found = findNestedSigningId(item, depth + 1);
    if (found) return found;
  }
  return '';
}

function isLikelySigningId(value) {
  const text = String(value || '').trim();
  return /^DGO[A-Z0-9]+$/i.test(text);
}

function normalizeSigningUrl(value) {
  const rawUrl = String(value || '').trim();
  if (!rawUrl) return '';

  try {
    const url = new URL(rawUrl);
    if (/\.digio\.in$/i.test(url.hostname) && /^#s\//i.test(url.hash)) {
      url.hostname = 'app.digio.in';
      url.protocol = 'https:';
      return url.toString();
    }
  } catch {
    return rawUrl;
  }

  return rawUrl;
}

function buildSigningUrl(identifier) {
  const signingId = String(identifier || '').trim();
  if (!signingId) return '';
  if (/^https?:\/\//i.test(signingId)) return normalizeSigningUrl(signingId);
  if (!isLikelySigningId(signingId)) return '';
  return `https://app.digio.in/#s/${encodeURIComponent(signingId)}`;
}

function resolveSigningUrl(response = {}) {
  return extractSigningUrl(response) ||
    buildSigningUrl(findNestedSigningId(response));
}

function digioErrorHint(data) {
  const code = String(data?.code || '').toUpperCase();
  const message = String(data?.message || data?.error || '').toLowerCase();

  if (code === 'INVALID_API_CREDENTIALS' || message.includes('invalid api credentials')) {
    return 'Check DIGIO_CLIENT_ID/DIGIO_CLIENT_SECRET, production vs test base URL, and restart the backend after .env changes.';
  }
  if (code === 'NOT_SUFFICIENT_ENTITLEMENTS' || message.includes('insufficient credits')) {
    return 'This Digio account does not have credits or entitlement for the configured DIGIO_SIGN_TYPE.';
  }
  if (code === 'UNSUPPORTED_MEDIA_TYPE' || message.includes('unsupported media type')) {
    return 'Digio rejected the upload payload media type. Use JSON/base64 PDF upload with content_type application/pdf for this account.';
  }

  return '';
}

function isPdfBuffer(file) {
  return Buffer.isBuffer(file) && file.length >= 4 && file.subarray(0, 4).toString('utf8') === '%PDF';
}

function buildProviderError(response, data, responseText) {
  const providerMessage = data?.message || data?.error || responseText || `Digio request failed with HTTP ${response.status}`;
  const hint = digioErrorHint(data);
  const error = new Error(hint ? `${providerMessage}. ${hint}` : providerMessage);
  error.statusCode = response.status;
  error.providerResponse = data;
  error.providerMessage = providerMessage;
  error.hint = hint;
  return error;
}

async function parseDigioResponse(response) {
  const responseText = await response.text();
  try {
    return responseText ? JSON.parse(responseText) : {};
  } catch {
    return { raw: responseText };
  }
}

async function requestDigio(path, options = {}) {
  assertConfigured();

  const response = await fetch(`${normalizeBaseUrl()}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      Authorization: `Basic ${base64Credentials()}`,
      ...(options.headers || {}),
    },
  });
  const data = await parseDigioResponse(response);

  if (!response.ok) {
    throw buildProviderError(response, data, typeof data.raw === 'string' ? data.raw : '');
  }

  return data;
}

async function requestDigioFile(path, options = {}) {
  assertConfigured();

  const response = await fetch(`${normalizeBaseUrl()}${path}`, {
    ...options,
    headers: {
      Accept: 'application/pdf,application/octet-stream,application/json',
      Authorization: `Basic ${base64Credentials()}`,
      ...(options.headers || {}),
    },
  });

  const contentType = response.headers.get('content-type') || '';
  const bytes = Buffer.from(await response.arrayBuffer());

  if (!response.ok) {
    let data = {};
    try {
      data = contentType.includes('application/json') ? JSON.parse(bytes.toString('utf8')) : { raw: bytes.toString('utf8') };
    } catch {
      data = { raw: bytes.toString('utf8') };
    }
    throw buildProviderError(response, data, typeof data.raw === 'string' ? data.raw : '');
  }

  if (contentType.includes('application/json')) {
    const text = bytes.toString('utf8');
    const data = text ? JSON.parse(text) : {};
    const base64Pdf = data.document || data.signed_document || data.file_data || data.pdf || data.content || '';
    if (!base64Pdf) {
      const error = new Error('Digio did not return a signed PDF file.');
      error.statusCode = 502;
      error.isDownloadCandidateMiss = true;
      error.providerResponse = data;
      throw error;
    }
    const decoded = Buffer.from(base64Pdf, 'base64');
    if (!isPdfBuffer(decoded)) {
      const error = new Error('Digio signed document response was not a PDF.');
      error.statusCode = 502;
      error.isDownloadCandidateMiss = true;
      error.providerResponse = data;
      throw error;
    }
    return decoded;
  }

  if (!isPdfBuffer(bytes)) {
    const error = new Error('Digio signed document download was not a PDF.');
    error.statusCode = 502;
    error.isDownloadCandidateMiss = true;
    error.providerResponse = { contentType };
    throw error;
  }

  return bytes;
}

function normalizeDocumentStatus(data = {}) {
  return {
    providerDocumentId: extractDocumentId(data),
    providerStatus: data.agreement_status || data.status || data.documentStatus || '',
    signedAt: data.signed_at || data.completed_at || data.updated_at || null,
    signingUrl: resolveSigningUrl(data),
    documentBase64: data.document || data.signed_document || data.file_data || data.pdf || '',
    rawResponse: data,
  };
}

async function sendLoanAgreement({ lead, sanction, agreement, pdfAbsolutePath, signatureCoordinates }) {
  assertConfigured();

  const signer = digioSigner({ lead, sanction });
  const fileBuffer = await fs.promises.readFile(pdfAbsolutePath);
  const request = {
    signers: [signer],
    expire_in_days: 7,
    display_on_page: 'custom',
    notify_signers: Boolean(config.digio.notifyForSigning),
    send_sign_link: Boolean(config.digio.notifyForSigning),
    file_name: `${sanction.agreementNumber}-loan-agreement.pdf`,
    file_data: fileBuffer.toString('base64'),
    content_type: 'application/pdf',
    reference_id: agreement.agreementNumber,
    sequential: true,
    sign_coordinates: {
      [signer.identifier]: {
        [String(signatureCoordinates.page || 1)]: [{
          llx: signatureCoordinates.llx,
          lly: signatureCoordinates.lly,
          urx: signatureCoordinates.urx,
          ury: signatureCoordinates.ury,
        }],
      },
    },
  };

  if (config.digio.webhookUrl) request.webhook = config.digio.webhookUrl;
  if (config.digio.redirectUrl) request.redirect_url = config.digio.redirectUrl;

  const data = await requestDigio('/v2/client/document/uploadpdf', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  return {
    providerDocumentId: extractDocumentId(data),
    providerRequestId: extractRequestId(data),
    providerStatus: data.agreement_status || data.status || 'requested',
    signingUrl: resolveSigningUrl(data),
    rawResponse: data,
    request: {
      ...request,
      file_data: `[base64 pdf omitted: ${fileBuffer.length} bytes]`,
    },
  };
}

async function getDocument(providerDocumentId) {
  const documentId = encodeURIComponent(providerDocumentId);
  const data = await requestDigio(`/v2/client/document/${documentId}`, {
    method: 'GET',
  });

  return normalizeDocumentStatus(data);
}

async function downloadSignedDocument(providerDocumentId) {
  const documentId = encodeURIComponent(providerDocumentId);
  const paths = [
    `/v2/client/document/download?document_id=${documentId}`,
    `/v2/client/document/${documentId}/download`,
    `/v2/client/document/${documentId}/downloadpdf`,
    `/v2/client/document/download/${documentId}`,
    `/v2/client/document/${documentId}/file`,
  ];
  let lastError = null;

  for (const path of paths) {
    try {
      const file = await requestDigioFile(path, { method: 'GET' });
      if (file.length > 0) return file;
    } catch (error) {
      lastError = error;
      if (!error.isDownloadCandidateMiss && error.statusCode && ![400, 404, 405].includes(Number(error.statusCode))) {
        throw error;
      }
    }
  }

  const error = new Error(lastError?.message || 'Unable to download signed PDF from Digio.');
  error.statusCode = lastError?.statusCode || 502;
  error.providerResponse = lastError?.providerResponse || null;
  throw error;
}

function normalizeWebhookPayload(payload = {}) {
  const eventData = payload.eventData || payload.payload || payload.data || payload;
  const providerDocumentId = (
    eventData.documentSignId ||
    eventData.document_sign_id ||
    eventData.document_id ||
    eventData.id ||
    payload.documentSignId ||
    ''
  );
  const referenceNum = eventData.referenceNum || eventData.reference_id || eventData.referenceId || '';
  const status = eventData.documentStatus || eventData.agreement_status || eventData.status || '';
  const signedAt = eventData.signedAt || eventData.completed_at || payload.created_at || null;
  const documentBase64 = eventData.document || eventData.signed_document || '';

  return {
    providerDocumentId,
    referenceNum,
    status,
    signedAt,
    documentBase64,
    raw: payload,
  };
}

module.exports = {
  buildSigningUrl,
  downloadSignedDocument,
  getDocument,
  getMaskedConfig,
  normalizeWebhookPayload,
  sendLoanAgreement,
};
