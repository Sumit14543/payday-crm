const crypto = require('crypto');
const { query } = require('../config/db');

const REQUEST_EXPIRY_DAYS = 7;
const DOCUMENT_COLUMN_BY_KEY = {
  company_id_card: 'company_id_card',
  salary_slip_current: 'salary_slip_current',
  salary_slip_old: 'salary_slip_old',
  salary_slip_previous: 'salary_slip_previous',
  selfie: 'selfie_image',
  video_kyc: 'video_kyc',
};

function mapRequest(row) {
  if (!row) return null;

  return {
    id: row.id,
    leadId: row.lead_id || '',
    applicationId: row.application_id || '',
    documentKey: row.document_key || '',
    label: row.label || '',
    token: row.token || '',
    groupToken: row.group_token || row.token || '',
    status: row.status || 'pending',
    requestedBy: row.requested_by || 'CRM User',
    uploadedFile: row.uploaded_file || '',
    originalFileName: row.original_file_name || '',
    mimeType: row.mime_type || '',
    fileSize: Number(row.file_size || 0),
    expiresAt: row.expires_at,
    uploadedAt: row.uploaded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function leadKeys(lead) {
  return {
    applicationId: lead?.id || '',
    leadId: lead?.rawId || '',
  };
}

function expiryDate() {
  const date = new Date();
  date.setDate(date.getDate() + REQUEST_EXPIRY_DAYS);
  return date;
}

async function createForLead(lead, payload = {}) {
  const { applicationId, leadId } = leadKeys(lead);
  const rawDocuments = Array.isArray(payload.documents) && payload.documents.length
    ? payload.documents
    : [{ documentKey: payload.documentKey, key: payload.documentKey, label: payload.label }];
  const documents = rawDocuments
    .map((document) => ({
      documentKey: document.documentKey || document.key,
      label: document.label || document.documentKey || document.key,
    }))
    .filter((document) => document.documentKey);

  if (!documents.length) {
    const error = new Error('At least one document is required.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  const groupToken = crypto.randomBytes(24).toString('hex');
  const expiresAt = expiryDate();
  const insertedIds = [];

  for (const document of documents) {
    const token = crypto.randomBytes(24).toString('hex');
    const result = await query(`
      INSERT INTO lead_document_requests (
        lead_id, application_id, document_key, label, token, group_token, requested_by, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      leadId,
      applicationId,
      document.documentKey,
      document.label,
      token,
      groupToken,
      payload.user || payload.actor || 'CRM User',
      expiresAt,
    ]);
    insertedIds.push(result.insertId);
  }

  const placeholders = insertedIds.map(() => '?').join(',');
  const rows = await query(`
    SELECT *
    FROM lead_document_requests
    WHERE id IN (${placeholders})
    ORDER BY id ASC
  `, insertedIds);

  return {
    token: groupToken,
    groupToken,
    expiresAt,
    requests: rows.map(mapRequest),
  };
}

async function findByLead(lead) {
  const { applicationId, leadId } = leadKeys(lead);
  const rows = await query(`
    SELECT *
    FROM lead_document_requests
    WHERE lead_id = ? OR application_id = ?
    ORDER BY created_at DESC, id DESC
  `, [leadId, applicationId]);

  return rows.map(mapRequest);
}

async function findByToken(token) {
  const rows = await query('SELECT * FROM lead_document_requests WHERE token = ? LIMIT 1', [token]);
  return mapRequest(rows[0]);
}

async function findGroupByToken(token) {
  const directRows = await query(`
    SELECT *
    FROM lead_document_requests
    WHERE token = ? OR group_token = ?
    ORDER BY id ASC
  `, [token, token]);

  if (!directRows.length) return [];

  const groupToken = directRows[0].group_token;
  if (!groupToken) return directRows.map(mapRequest);

  const groupRows = await query(`
    SELECT *
    FROM lead_document_requests
    WHERE group_token = ?
    ORDER BY id ASC
  `, [groupToken]);

  return groupRows.map(mapRequest);
}

async function markUploaded(request, file = {}) {
  await query(`
    UPDATE lead_document_requests
    SET status = 'uploaded',
      uploaded_file = ?,
      original_file_name = ?,
      mime_type = ?,
      file_size = ?,
      uploaded_at = NOW()
    WHERE id = ?
  `, [
    file.path || '',
    file.originalName || '',
    file.mimeType || '',
    Number(file.size || 0),
    request.id,
  ]);

  const documentColumn = DOCUMENT_COLUMN_BY_KEY[request.documentKey];
  if (documentColumn) {
    await query(`
      UPDATE loan_applications
      SET ${documentColumn} = ?
      WHERE application_id = ? OR CAST(id AS CHAR) = ?
    `, [file.path || '', request.applicationId, request.leadId]);
  }

  const rows = await query('SELECT * FROM lead_document_requests WHERE id = ? LIMIT 1', [request.id]);
  return mapRequest(rows[0]);
}

async function cancelGroupByToken(token) {
  const requests = await findGroupByToken(token);
  if (!requests.length) return [];

  const groupToken = requests[0].groupToken || requests[0].token;
  await query(`
    UPDATE lead_document_requests
    SET status = 'cancelled',
      updated_at = NOW()
    WHERE group_token = ? OR token = ?
  `, [groupToken, token]);

  return findGroupByToken(token);
}

module.exports = {
  cancelGroupByToken,
  createForLead,
  findByLead,
  findGroupByToken,
  findByToken,
  markUploaded,
};
