const { query } = require('../config/db');
const { normalizeAadhaarResponse } = require('../services/aadhaarService');

function parseJson(value) {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isXmlLike(value) {
  return /^<\??xml|<OfflinePaperlessKyc|<UidData/i.test(String(value || '').trim());
}

function mapReport(row, lead = {}) {
  if (!row) return null;

  const rawResponse = parseJson(row.raw_response);
  const normalized = normalizeAadhaarResponse(rawResponse || row.aadhaar_masked || {});
  const rowMasked = row.aadhaar_masked || '';
  const aadhaarMasked = isXmlLike(rowMasked)
    ? normalized.aadhaarMasked || lead.aadhaarMasked || ''
    : rowMasked || normalized.aadhaarMasked || lead.aadhaarMasked || '';

  const report = {
    id: row.id,
    leadId: row.lead_id || '',
    applicationId: row.application_id || '',
    uniqueId: row.unique_id || '',
    fullName: row.full_name || normalized.fullName || '',
    careOf: normalized.careOf || '',
    dob: row.dob || normalized.dob || '',
    fatherName: normalized.fatherName || '',
    gender: row.gender || normalized.gender || '',
    mobile: row.mobile || normalized.mobile || '',
    aadhaarMasked,
    address: row.address || normalized.address || '',
    photoDataUrl: normalized.photoDataUrl || '',
    rawResponse,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  return {
    ...report,
    isComplete: isCompleteReport(report),
  };
}

function isCompleteReport(report) {
  if (!report) return false;

  return Boolean(
    report.fullName &&
    (
      report.aadhaarMasked ||
      report.address ||
      report.dob ||
      report.gender ||
      report.photoDataUrl
    ),
  );
}

async function findLatestByLead(lead) {
  const clauses = [];
  const params = [];

  if (lead.aadhaarUniqueId) {
    clauses.push('unique_id = ?');
    params.push(lead.aadhaarUniqueId);
  }

  if (lead.rawId) {
    clauses.push('lead_id = ?');
    params.push(lead.rawId);
  }

  if (lead.id) {
    clauses.push('application_id = ?');
    params.push(lead.id);
  }

  if (!clauses.length) return null;

  const rows = await query(`
    SELECT *
    FROM aadhaar_reports
    WHERE ${clauses.join(' OR ')}
    ORDER BY updated_at DESC, created_at DESC, id DESC
    LIMIT 1
  `, params);

  return mapReport(rows[0], lead);
}

async function saveReport(lead, report) {
  const rawResponse = report.rawResponse === undefined ? null : JSON.stringify(report.rawResponse);
  const existing = await findLatestByLead(lead);
  const aadhaarMasked = isXmlLike(report.aadhaarMasked)
    ? ''
    : report.aadhaarMasked || lead.aadhaarMasked || '';

  if (existing) {
    await query(`
      UPDATE aadhaar_reports
      SET
        lead_id = COALESCE(NULLIF(?, ''), lead_id),
        application_id = COALESCE(NULLIF(?, ''), application_id),
        unique_id = COALESCE(NULLIF(?, ''), unique_id),
        full_name = COALESCE(NULLIF(?, ''), full_name),
        dob = COALESCE(NULLIF(?, ''), dob),
        gender = COALESCE(NULLIF(?, ''), gender),
        mobile = COALESCE(NULLIF(?, ''), mobile),
        aadhaar_masked = ?,
        address = COALESCE(NULLIF(?, ''), address),
        raw_response = COALESCE(?, raw_response)
      WHERE id = ?
    `, [
      lead.rawId || '',
      lead.id || '',
      lead.aadhaarUniqueId || report.uniqueId || '',
      report.fullName || '',
      report.dob || '',
      report.gender || '',
      report.mobile || '',
      aadhaarMasked,
      report.address || '',
      rawResponse,
      existing.id,
    ]);

    const rows = await query('SELECT * FROM aadhaar_reports WHERE id = ? LIMIT 1', [existing.id]);
    return mapReport(rows[0], lead);
  }

  const result = await query(`
    INSERT INTO aadhaar_reports (
      lead_id, application_id, unique_id, full_name, dob, gender, mobile,
      aadhaar_masked, address, raw_response
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    lead.rawId || '',
    lead.id || '',
    lead.aadhaarUniqueId || report.uniqueId || '',
    report.fullName || '',
    report.dob || '',
    report.gender || '',
    report.mobile || '',
    aadhaarMasked,
    report.address || '',
    rawResponse,
  ]);

  const rows = await query('SELECT * FROM aadhaar_reports WHERE id = ? LIMIT 1', [result.insertId]);
  return mapReport(rows[0], lead);
}

module.exports = {
  findLatestByLead,
  isCompleteReport,
  saveReport,
};
