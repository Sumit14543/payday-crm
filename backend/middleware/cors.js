const { config } = require('../config/env');
const ALWAYS_ALLOWED_BASE_DOMAINS = [
  'waqtmoney.com',
  'waqtfinance.com',
  'geetpay.in',
  'geetpay.com',
  'loaninwallet.com',
  'salarywaves.com',
];


function getBaseDomain(hostname) {
  if (!hostname) return '';
  const parts = hostname.split('.');
  if (parts.length <= 2) return hostname;
  return parts.slice(-2).join('.');
}

function isOriginAllowed(origin, configuredOrigins) {
  if (!origin) return false;
  const originLower = origin.toLowerCase().trim();

  // Always allow any subdomain of trusted base domains
  try {
    const originUrl = new URL(originLower);
    const originBase = getBaseDomain(originUrl.hostname);
    if (ALWAYS_ALLOWED_BASE_DOMAINS.includes(originBase)) {
      return true;
    }
    // Allow localhost for development
    if (originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1') {
      return true;
    }
  } catch (e) {
    // ignore
  }

  for (const configured of configuredOrigins) {
    const confLower = configured.toLowerCase().trim();
    if (confLower === '*' || confLower === originLower) {
      return true;
    }

    try {
      const confUrl = new URL(confLower.startsWith('http') ? confLower : `http://${confLower}`);
      const originUrl = new URL(originLower);

      if (originUrl.hostname === confUrl.hostname) {
        return true;
      }

      // Check if both belong to the same base domain
      const confBase = getBaseDomain(confUrl.hostname);
      const originBase = getBaseDomain(originUrl.hostname);

      if (confBase && confBase === originBase) {
        // Also ensure the ports match if the configured url has a port
        if (!confUrl.port || confUrl.port === originUrl.port) {
          return true;
        }
      }
    } catch (e) {
      // Ignore parsing errors
    }
  }

  return false;
}


function cors(req, res, next) {
  const origin = req.headers.origin;
  const configuredOrigins = String(config.app.corsOrigin || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const isExplicitAllowed = origin && isOriginAllowed(origin, configuredOrigins);
  const isWildcardAllowed = configuredOrigins.includes('*') && process.env.NODE_ENV !== 'production';
  const originIsAllowed = isExplicitAllowed || (origin && isWildcardAllowed);

  if (originIsAllowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    if (isExplicitAllowed) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
  } else if (!origin && configuredOrigins.length && configuredOrigins[0] !== '*') {
    res.setHeader('Access-Control-Allow-Origin', configuredOrigins[0]);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');

  const requestHeaders = req.headers['access-control-request-headers'];
  if (requestHeaders) {
    res.setHeader('Access-Control-Allow-Headers', requestHeaders);
  } else {
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-Email, X-User-Name, X-User-Role, X-Tenant-Slug, X-Integration-Api-Key');
  }

  res.setHeader('Access-Control-Max-Age', '86400'); // Cache preflight for 24 hours

  if (req.method === 'OPTIONS') {
    if (origin && !originIsAllowed) {
      res.status(403).json({ error: 'CORS origin not allowed' });
      return;
    }
    res.status(204).end();
    return;
  }

  next();
}

module.exports = cors;
