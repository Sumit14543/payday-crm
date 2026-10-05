const { query } = require('../config/db');

function jsonOrNull(value) {
  if (value === undefined) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

async function create(entry = {}) {
  await query(`
    INSERT INTO integration_ingestion_logs (
      source_system, source_lead_id, source_application_id, endpoint, status,
      status_code, crm_application_id, crm_lead_id, request_payload,
      response_payload, error_message, ip_address, user_agent
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    entry.sourceSystem || '',
    entry.sourceLeadId || '',
    entry.sourceApplicationId || '',
    entry.endpoint || '',
    entry.status || 'received',
    entry.statusCode || null,
    entry.crmApplicationId || '',
    entry.crmLeadId || '',
    jsonOrNull(entry.requestPayload),
    jsonOrNull(entry.responsePayload),
    entry.errorMessage || '',
    entry.ipAddress || '',
    entry.userAgent || '',
  ]);
}

module.exports = {
  create,
};
