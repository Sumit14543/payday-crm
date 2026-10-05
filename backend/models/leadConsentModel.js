const { query } = require('../config/db');

function consentEntriesFromPayload(payload = {}) {
  const rawConsents = payload.consents || payload.consent || payload.rawPayload?.consents || {};
  if (!rawConsents || typeof rawConsents !== 'object') return [];

  return Object.entries(rawConsents).map(([type, value]) => {
    if (value && typeof value === 'object') {
      return {
        accepted: value.accepted !== false && value.value !== false,
        text: value.text || value.label || '',
        type,
        version: value.version || payload.consentVersion || 'v1',
      };
    }

    return {
      accepted: Boolean(value),
      text: '',
      type,
      version: payload.consentVersion || 'v1',
    };
  }).filter((entry) => entry.type);
}

async function saveFromPayload(lead, payload = {}, context = {}) {
  if (!lead?.id) return 0;

  const entries = consentEntriesFromPayload(payload);
  if (!entries.length) return 0;

  let saved = 0;
  for (const entry of entries) {
    await query(`
      INSERT INTO lead_consents (
        lead_id, application_id, consent_type, consent_text, consent_version,
        accepted, source, ip_address, user_agent, accepted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON DUPLICATE KEY UPDATE
        consent_text = VALUES(consent_text),
        accepted = VALUES(accepted),
        source = VALUES(source),
        ip_address = VALUES(ip_address),
        user_agent = VALUES(user_agent),
        accepted_at = VALUES(accepted_at)
    `, [
      lead.rawId || '',
      lead.id,
      entry.type,
      entry.text,
      entry.version,
      entry.accepted ? 1 : 0,
      context.source || lead.sourceSystem || 'integration',
      context.ipAddress || '',
      context.userAgent || '',
    ]);
    saved += 1;
  }

  return saved;
}

module.exports = {
  consentEntriesFromPayload,
  saveFromPayload,
};
