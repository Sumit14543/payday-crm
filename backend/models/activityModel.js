const { query } = require('../config/db');

function parseJson(value) {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function mapActivity(row) {
  if (!row) return null;

  return {
    id: row.id,
    leadId: row.lead_id || '',
    applicationId: row.application_id || '',
    type: row.type || 'note',
    description: row.description || '',
    user: row.actor || 'System',
    metadata: parseJson(row.metadata),
    date: row.created_at,
  };
}

async function findByLead(lead, { limit = 100 } = {}) {
  if (!lead) return [];

  const clauses = [];
  const params = [];

  if (lead.rawId) {
    clauses.push('lead_id = ?');
    params.push(lead.rawId);
  }

  if (lead.id) {
    clauses.push('application_id = ?');
    params.push(lead.id);
  }

  if (!clauses.length) return [];

  const parsedLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);

  const rows = await query(`
    SELECT id, lead_id, application_id, type, description, actor, metadata, created_at
    FROM lead_activities
    WHERE ${clauses.join(' OR ')}
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `, [...params, parsedLimit]);

  return rows.map(mapActivity);
}

async function createForLead(lead, activity = {}) {
  if (!lead) return null;

  const metadata = activity.metadata === undefined ? null : JSON.stringify(activity.metadata);

  const result = await query(`
    INSERT INTO lead_activities (
      lead_id, application_id, type, description, actor, metadata, source_key
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      description = VALUES(description),
      actor = VALUES(actor),
      metadata = VALUES(metadata)
  `, [
    lead.rawId || '',
    lead.id || '',
    activity.type || 'note',
    activity.description || 'Activity recorded',
    activity.user || activity.actor || 'System',
    metadata,
    activity.sourceKey || null,
  ]);

  const activityId = result.insertId;

  if (!activityId && activity.sourceKey) {
    const rows = await query('SELECT * FROM lead_activities WHERE source_key = ? LIMIT 1', [activity.sourceKey]);
    return mapActivity(rows[0]);
  }

  const rows = await query('SELECT * FROM lead_activities WHERE id = ? LIMIT 1', [activityId]);
  return mapActivity(rows[0]);
}

module.exports = {
  createForLead,
  findByLead,
};
