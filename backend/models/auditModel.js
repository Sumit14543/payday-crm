const { query } = require('../config/db');
const { getClientIp } = require('../utils/getIp');

function actorFromRequest(req) {
  return {
    email: req.user?.email || req.body?.email || '',
    name: req.user?.name || req.body?.user || req.body?.actor || '',
    role: req.user?.role || req.body?.role || '',
  };
}

async function create(req, payload = {}) {
  try {
    const actor = actorFromRequest(req || {});
    const lead = payload.lead || {};

    const clientLoc = req?.headers?.['x-client-location'] || (typeof req?.get === 'function' ? req.get('x-client-location') : '') || '';
    const clientCity = req?.headers?.['x-client-city'] || (typeof req?.get === 'function' ? req.get('x-client-city') : '') || '';
    const clientIp = req?.headers?.['x-client-ip'] || (typeof req?.get === 'function' ? req.get('x-client-ip') : '') || getClientIp(req);

    const metadata = payload.metadata ? (typeof payload.metadata === 'object' ? { ...payload.metadata } : { raw: payload.metadata }) : {};
    if (clientLoc && !metadata.location && !metadata.formattedAddress) metadata.location = clientLoc;
    if (clientCity && !metadata.city) metadata.city = clientCity;

    await query(`
      INSERT INTO audit_logs (
        action, actor_email, actor_name, actor_role, lead_id, application_id,
        entity_type, entity_id, ip_address, user_agent, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      payload.action,
      actor.email,
      actor.name,
      actor.role,
      payload.leadId || lead.rawId || '',
      payload.applicationId || lead.id || '',
      payload.entityType || '',
      payload.entityId || '',
      clientIp,
      String(req?.get?.('user-agent') || '').slice(0, 512),
      Object.keys(metadata).length ? JSON.stringify(metadata) : null,
    ]);
  } catch (error) {
    console.warn('Audit log write failed:', error.message);
  }
}

async function findAll({ limit = 200 } = {}) {
  const rows = await query(`
    SELECT 
      id, action, actor_email AS actorEmail, actor_name AS actorName, 
      actor_role AS actorRole, lead_id AS leadId, application_id AS applicationId, 
      entity_type AS entityType, entity_id AS entityId, ip_address AS ipAddress, 
      metadata, created_at AS createdAt
    FROM audit_logs
    ORDER BY created_at DESC
    LIMIT ?
  `, [limit]);

  return rows.map(row => {
    let location = '';
    if (row.metadata) {
      try {
        const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
        if (meta && meta.formattedAddress) {
          location = meta.formattedAddress;
        } else if (meta && meta.location) {
          location = meta.source === 'gps_verified' ? meta.location : `${meta.location} (IP Location)`;
        } else if (meta && meta.city) {
          location = meta.city;
        }
      } catch (e) {
        // Ignore parse error
      }
    }
    return {
      ...row,
      location: location || '',
    };
  });
}

module.exports = {
  create,
  findAll,
};
