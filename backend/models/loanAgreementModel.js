const { query } = require('../config/db');

function parseJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function mapLoanAgreement(row) {
  if (!row) return null;

  return {
    id: row.id,
    leadId: row.lead_id || '',
    applicationId: row.application_id || '',
    sanctionId: row.sanction_id || null,
    camSheetId: row.cam_sheet_id || null,
    agreementNumber: row.agreement_number || '',
    status: row.status || 'draft',
    provider: row.provider || 'digio',
    signerName: row.signer_name || '',
    signerEmail: row.signer_email || '',
    signerPhone: row.signer_phone || '',
    pdfPath: row.pdf_path || '',
    signedPdfPath: row.signed_pdf_path || '',
    providerDocumentId: row.provider_document_id || '',
    providerRequestId: row.provider_request_id || '',
    providerStatus: row.provider_status || '',
    signingUrl: row.signing_url || '',
    supersededByAgreementId: row.superseded_by_agreement_id || null,
    supersededAt: row.superseded_at || null,
    sentAt: row.sent_at || null,
    signedAt: row.signed_at || null,
    expiresAt: row.expires_at || null,
    errorMessage: row.error_message || '',
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
    FROM lead_loan_agreements
    WHERE lead_id = ? OR application_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `, leadKeys(lead));

  return mapLoanAgreement(rows[0]);
}

async function findSignedByLead(lead) {
  if (!lead) return null;

  const rows = await query(`
    SELECT *
    FROM lead_loan_agreements
    WHERE (lead_id = ? OR application_id = ?) AND status = 'signed'
    ORDER BY signed_at DESC, id DESC
    LIMIT 1
  `, leadKeys(lead));

  return mapLoanAgreement(rows[0]);
}

async function findLatestWithProviderDocumentByLead(lead) {
  if (!lead) return null;

  const rows = await query(`
    SELECT *
    FROM lead_loan_agreements
    WHERE (lead_id = ? OR application_id = ?)
      AND provider_document_id IS NOT NULL
      AND provider_document_id <> ''
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `, leadKeys(lead));

  return mapLoanAgreement(rows[0]);
}

async function findByProviderDocumentId(providerDocumentId) {
  const rows = await query('SELECT * FROM lead_loan_agreements WHERE provider_document_id = ? LIMIT 1', [providerDocumentId]);
  return mapLoanAgreement(rows[0]);
}

async function findByAgreementNumber(agreementNumber) {
  const rows = await query(`
    SELECT *
    FROM lead_loan_agreements
    WHERE agreement_number = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `, [agreementNumber]);
  return mapLoanAgreement(rows[0]);
}

async function findById(id) {
  const rows = await query('SELECT * FROM lead_loan_agreements WHERE id = ? LIMIT 1', [id]);
  return mapLoanAgreement(rows[0]);
}

async function createForLead(lead, sanction, payload = {}) {
  const result = await query(`
    INSERT INTO lead_loan_agreements (
      lead_id, application_id, sanction_id, cam_sheet_id, agreement_number,
      status, provider, signer_name, signer_email, signer_phone, pdf_path,
      provider_status, expires_at, metadata, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? DAY), ?, ?)
  `, [
    lead.rawId || '',
    lead.id || '',
    sanction?.id || payload.sanctionId || null,
    sanction?.camSheetId || payload.camSheetId || null,
    payload.agreementNumber || sanction?.agreementNumber || '',
    payload.status || 'draft',
    payload.provider || 'digio',
    payload.signerName || sanction?.borrower || lead.name || '',
    payload.signerEmail || sanction?.borrowerEmail || sanction?.emailTo || lead.email || '',
    payload.signerPhone || sanction?.borrowerPhone || lead.phone || '',
    payload.pdfPath || '',
    payload.providerStatus || '',
    Number(payload.expiresInDays || 7),
    JSON.stringify(payload.metadata || {}),
    payload.user || payload.createdBy || 'Credit Manager',
  ]);

  return findById(result.insertId);
}

async function updatePdf(id, payload = {}) {
  await query(`
    UPDATE lead_loan_agreements
    SET pdf_path = COALESCE(NULLIF(?, ''), pdf_path),
        metadata = ?
    WHERE id = ?
  `, [
    payload.pdfPath || '',
    JSON.stringify(payload.metadata || {}),
    id,
  ]);

  return findById(id);
}

async function markSent(id, payload = {}) {
  await query(`
    UPDATE lead_loan_agreements
    SET status = 'sent',
        provider_document_id = ?,
        provider_request_id = ?,
        provider_status = ?,
        signing_url = ?,
        error_message = '',
        metadata = ?,
        sent_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [
    payload.providerDocumentId || '',
    payload.providerRequestId || '',
    payload.providerStatus || 'requested',
    payload.signingUrl || '',
    JSON.stringify(payload.metadata || {}),
    id,
  ]);

  return findById(id);
}

async function markFailed(id, payload = {}) {
  await query(`
    UPDATE lead_loan_agreements
    SET status = 'failed',
        provider_status = ?,
        error_message = ?,
        metadata = ?
    WHERE id = ?
  `, [
    payload.providerStatus || 'failed',
    payload.errorMessage || 'Unable to send loan agreement for eSign',
    JSON.stringify(payload.metadata || {}),
    id,
  ]);

  return findById(id);
}

async function updateProviderStatus(id, payload = {}) {
  await query(`
    UPDATE lead_loan_agreements
    SET provider_status = ?,
        signing_url = COALESCE(NULLIF(?, ''), signing_url),
        metadata = ?
    WHERE id = ?
  `, [
    payload.providerStatus || '',
    payload.signingUrl || '',
    JSON.stringify(payload.metadata || {}),
    id,
  ]);

  return findById(id);
}

async function markSigned(id, payload = {}) {
  await query(`
    UPDATE lead_loan_agreements
    SET status = 'signed',
        provider_status = ?,
        signed_pdf_path = COALESCE(NULLIF(?, ''), signed_pdf_path),
        signed_at = COALESCE(?, CURRENT_TIMESTAMP),
        metadata = ?
    WHERE id = ?
  `, [
    payload.providerStatus || 'completed',
    payload.signedPdfPath || '',
    payload.signedAt || null,
    JSON.stringify(payload.metadata || {}),
    id,
  ]);

  return findById(id);
}

async function markSupersededForLead(lead, replacementAgreementId = null, metadata = {}) {
  const rows = await query(`
    SELECT id, metadata
    FROM lead_loan_agreements
    WHERE (lead_id = ? OR application_id = ?)
      AND status <> 'superseded'
      ${replacementAgreementId ? 'AND id <> ?' : ''}
  `, replacementAgreementId ? [...leadKeys(lead), replacementAgreementId] : leadKeys(lead));

  for (const row of rows) {
    const nextMetadata = {
      ...(parseJson(row.metadata) || {}),
      superseded: {
        ...metadata,
        replacementAgreementId,
        supersededAt: new Date().toISOString(),
      },
    };
    await query(`
      UPDATE lead_loan_agreements
      SET status = 'superseded',
          provider_status = COALESCE(NULLIF(provider_status, ''), 'superseded'),
          superseded_by_agreement_id = ?,
          superseded_at = CURRENT_TIMESTAMP,
          metadata = ?
      WHERE id = ?
    `, [replacementAgreementId, JSON.stringify(nextMetadata), row.id]);
  }
}

module.exports = {
  createForLead,
  findByAgreementNumber,
  findById,
  findByProviderDocumentId,
  findLatestByLead,
  findLatestWithProviderDocumentByLead,
  findSignedByLead,
  mapLoanAgreement,
  markFailed,
  markSent,
  markSigned,
  markSupersededForLead,
  updateProviderStatus,
  updatePdf,
};
