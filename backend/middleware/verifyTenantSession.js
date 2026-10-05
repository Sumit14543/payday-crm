const crmUserModel = require('../models/crmUserModel');

// Memory cache for user session verification: key -> { timestamp, user }
const sessionCache = new Map();
const SESSION_CACHE_TTL_MS = 60 * 1000; // 60 seconds

function getSessionCacheKey(tenantSlug, email, role) {
  return `${tenantSlug || 'default'}:${String(email || '').trim().toLowerCase()}:${role}`;
}

async function verifyTenantSession(req, res, next) {
  // If user is authenticated and is not a superadmin,
  // verify they exist and are active in the currently resolved tenant database.
  if (req.user && req.user.role !== 'superadmin') {
    const tenantSlug = req.tenant ? req.tenant.slug : 'default';
    const cacheKey = getSessionCacheKey(tenantSlug, req.user.email, req.user.role);
    const now = Date.now();

    const cached = sessionCache.get(cacheKey);
    if (cached && (now - cached.timestamp < SESSION_CACHE_TTL_MS)) {
      if (!cached.user) {
        req.user = null;
      }
    } else {
      try {
        const activeUser = await crmUserModel.findActiveByEmailAndRole(req.user.email, req.user.role);
        sessionCache.set(cacheKey, { timestamp: now, user: activeUser });
        if (!activeUser) {
          req.user = null;
        }
      } catch (err) {
        console.error('❌ Error verifying tenant user session:', err);
        req.user = null;
      }
    }
  }
  next();
}

function clearSessionCache() {
  sessionCache.clear();
}

module.exports = verifyTenantSession;
module.exports.clearSessionCache = clearSessionCache;

