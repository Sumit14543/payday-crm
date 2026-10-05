const crypto = require('crypto');
const { query } = require('../config/db');

const DUMMY_OTP = '123456';

function parseJson(value) {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function mapEsignRequest(row) {
  if (!row) return null;

  return {
    id: row.id,
    leadId: row.lead_id || '',
    applicationId: row.application_id || '',
    camSheetId: row.cam_sheet_id || null,
    token: row.token || '',
    status: row.status || 'pending',
    signerName: row.signer_name || '',
    signerEmail: row.signer_email || '',
    signerPhone: row.signer_phone || '',
    agreementUrl: row.agreement_url || '',
    signedFileUrl: row.signed_file_url || '',
    consentText: row.consent_text || '',
    signedAt: row.signed_at || null,
    expiresAt: row.expires_at,
    metadata: parseJson(row.metadata),
    createdBy: row.created_by || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function leadKeys(lead) {
  return [lead?.rawId || '', lead?.id || ''];
}

async function findLatestByLead(lead) {
  if (!lead) return null;

  const rows = await query(`
    SELECT *
    FROM lead_esign_requests
    WHERE lead_id = ? OR application_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `, leadKeys(lead));

  return mapEsignRequest(rows[0]);
}

async function findSignedByLead(lead) {
  if (!lead) return null;

  const rows = await query(`
    SELECT *
    FROM lead_esign_requests
    WHERE (lead_id = ? OR application_id = ?) AND status = 'signed'
    ORDER BY signed_at DESC, id DESC
    LIMIT 1
  `, leadKeys(lead));

  return mapEsignRequest(rows[0]);
}

async function findByToken(token) {
  const rows = await query('SELECT * FROM lead_esign_requests WHERE token = ? LIMIT 1', [token]);
  return mapEsignRequest(rows[0]);
}

async function createForLead(lead, payload = {}) {
  if (!lead) return null;

  const token = crypto.randomBytes(24).toString('hex');
  const expiresHours = Number(payload.expiresHours || 168);
  const consentText = payload.consentText || 'I consent to digitally sign the loan agreement and accept the approved loan terms.';
  const metadata = {
    provider: 'dummy',
    mode: 'sandbox',
    camSheetId: payload.camSheetId || null,
    approvedAmount: payload.approvedAmount || 0,
  };

  const result = await query(`
    INSERT INTO lead_esign_requests (
      lead_id, application_id, cam_sheet_id, token, status, signer_name, signer_email,
      signer_phone, agreement_url, otp_code, consent_text, expires_at, metadata, created_by
    ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? HOUR), ?, ?)
  `, [
    lead.rawId || '',
    lead.id || '',
    payload.camSheetId || null,
    token,
    lead.name || '',
    lead.email || '',
    lead.phone || '',
    payload.agreementUrl || '',
    DUMMY_OTP,
    consentText,
    expiresHours,
    JSON.stringify(metadata),
    payload.user || payload.createdBy || 'Credit Manager',
  ]);

  const rows = await query('SELECT * FROM lead_esign_requests WHERE id = ? LIMIT 1', [result.insertId]);
  return mapEsignRequest(rows[0]);
}

async function markSigned(token, payload = {}) {
  await query(`
    UPDATE lead_esign_requests
    SET status = 'signed',
        signed_at = CURRENT_TIMESTAMP,
        signed_file_url = ?,
        signer_ip = ?,
        signer_user_agent = ?
    WHERE token = ? AND status = 'pending'
  `, [
    payload.signedFileUrl || `/api/esign/${encodeURIComponent(token)}/signed-agreement.pdf`,
    payload.ip || '',
    String(payload.userAgent || '').slice(0, 512),
    token,
  ]);

  return findByToken(token);
}

module.exports = {
  DUMMY_OTP,
  createForLead,
  findByToken,
  findLatestByLead,
  findSignedByLead,
  markSigned,
};
