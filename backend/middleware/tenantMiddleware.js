const crypto = require('crypto');
const { config } = require('../config/env');
const { queryMaster, getTenantPool, tenantLocalStorage } = require('../config/db');

const tenantRecordCache = new Map();
const tokenTenantCache = new Map();
const TENANT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const TOKEN_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function timingSafeStringEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

async function resolveTenantByToken(token, isEsign = false) {
  if (!token) return null;
  const cleanToken = String(token).trim();
  const cacheKey = `${isEsign ? 'esign' : 'doc'}:${cleanToken}`;

  // Check in-memory cache
  const cached = tokenTenantCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < TOKEN_CACHE_TTL_MS)) {
    return cached.tenant;
  }

  try {
    const tenants = await queryMaster(
      'SELECT id, name, slug, db_host, db_user, db_password, db_name, db_port, status, cin, gstin, website, lender, address, phone, email, logo_url, theme_color FROM tenants WHERE status = "active"'
    );

    const waqtTenant = { 
      slug: 'waqtfinance', 
      name: 'Waqt Finance',
      cin: 'CIN-U67120RJ1995PTC009521',
      gstin: 'GSTIN : 08AAACW1509R1ZX',
      website: 'www.waqtfinance.com',
      lender: 'WAQT FINANCE PRIVATE LIMITED',
      address: '15 K- 5 Jyoti Nagar Housing Board Colony, Sahakar Marg, Jaipur, Rajasthan 302005',
      phone: '+91 92170 86608',
      email: 'customercare@waqtfinance.com',
      logo_url: '/logo.webp',
      theme_color: '#059669'
    };

    const allTenants = [waqtTenant, ...tenants];

    // Query active tenant pools concurrently in parallel instead of sequential O(N) blocking
    const checkPromises = allTenants.map((tenant) => {
      return new Promise((resolve) => {
        try {
          const pool = getTenantPool(tenant);
          const queryStr = isEsign
            ? 'SELECT id FROM lead_esigns WHERE token = ? LIMIT 1'
            : 'SELECT id FROM lead_document_requests WHERE token = ? OR group_token = ? LIMIT 1';
          const queryParams = isEsign ? [cleanToken] : [cleanToken, cleanToken];

          pool.query(queryStr, queryParams, (err, rows) => {
            if (err || !rows || !rows.length) {
              resolve(null);
            } else {
              resolve(tenant);
            }
          });
        } catch {
          resolve(null);
        }
      });
    });

    const matchResults = await Promise.all(checkPromises);
    const matchedTenant = matchResults.find(Boolean) || null;

    if (matchedTenant) {
      tokenTenantCache.set(cacheKey, { tenant: matchedTenant, timestamp: Date.now() });
    }

    return matchedTenant;
  } catch (e) {
    console.error('Failed to resolve tenant by token:', e);
  }
  return null;
}

async function tenantMiddleware(req, res, next) {
  let host = String(req.headers['x-forwarded-host'] || req.get('host') || '').trim().toLowerCase();
  
  // Strip port if present (e.g. localhost:8080 -> localhost)
  host = host.split(':')[0];

  // Localhost / IP requests should always use default tenant
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
  ) {
    const defaultTenantPool = getTenantPool({ slug: 'waqtfinance' });

    const waqtTenant = {
      slug: 'waqtfinance',
      name: 'Waqt Finance',
      cin: 'CIN-U67120RJ1995PTC009521',
      gstin: 'GSTIN : 08AAACW1509R1ZX',
      website: 'www.waqtfinance.com',
      lender: 'WAQT FINANCE PRIVATE LIMITED',
      address: '15 K-5 Jyoti Nagar Housing Board Colony, Sahakar Marg, Jaipur, Rajasthan 302005',
      phone: '+91 9217086608',
      email: 'customercare@waqtfinance.com',
      logo_url: '/logo.webp',
      theme_color: '#059669'
    };

    req.tenant = waqtTenant;

    return tenantLocalStorage.run(
      {
        pool: defaultTenantPool,
        tenant: waqtTenant
      },
      () => next()
    );
  }

  // Try to resolve tenant from public tokens (document-upload or esign)
  const path = req.path || '';
  const docMatch = path.match(/\/(?:api\/)?document-upload\/([a-f0-9]+)/i);
  const esignMatch = path.match(/\/(?:api\/)?esign\/([a-f0-9]+)/i);
  
  let resolvedTenant = null;
  if (docMatch) {
    resolvedTenant = await resolveTenantByToken(docMatch[1], false);
  } else if (esignMatch) {
    resolvedTenant = await resolveTenantByToken(esignMatch[1], true);
  }

  if (resolvedTenant) {
    const pool = getTenantPool(resolvedTenant);
    req.tenant = resolvedTenant;
    return tenantLocalStorage.run({ pool, tenant: resolvedTenant }, () => next());
  }

  // Parse subdomain / tenant slug
  let hostSubdomain = '';

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    hostSubdomain = 'waqtfinance';
  } else {
    hostSubdomain = host.split('.')[0];
  }

  let apiKeySourceSystem = '';
  const headerKey = req.headers['x-integration-api-key'] || (typeof req.get === 'function' ? req.get('x-integration-api-key') : '');
  const authorization = String(req.headers['authorization'] || (typeof req.get === 'function' ? req.get('authorization') : '') || '');
  const [scheme, token] = authorization.split(' ');
  const requestKey = headerKey || (scheme === 'Bearer' ? token : '');

  if (requestKey && config.integrations && config.integrations.apiKeys) {
    const matchedKey = config.integrations.apiKeys.find((item) => 
      timingSafeStringEqual(item.key, requestKey)
    );
    if (matchedKey && matchedKey.sourceSystem) {
      apiKeySourceSystem = matchedKey.sourceSystem;
    }
  }

  let emailTenant = '';
  const bodyEmail = String((req.body && req.body.email) || req.query.email || '').trim().toLowerCase();
  if (bodyEmail.endsWith('@geetpay.com') || bodyEmail.endsWith('@geetpay.in')) {
    emailTenant = 'geetpay';
  } else if (bodyEmail.endsWith('@loaninwallet.com') || bodyEmail.endsWith('@loaninwallet.in')) {
    emailTenant = 'loaninwallet';
  } else if (bodyEmail.endsWith('@salarywaves.com') || bodyEmail.endsWith('@salarywaves.in')) {
    emailTenant = 'salarywaves';
  }

  let subdomain = String(
    req.headers['x-tenant-slug'] || 
    req.query.tenant || 
    (req.body && req.body.tenant) || 
    emailTenant ||
    apiKeySourceSystem ||
    (req.body && req.body.sourceSystem) ||
    req.query.sourceSystem ||
    hostSubdomain || 
    ''
  ).trim().toLowerCase();


  if (subdomain === 'waqtmoney') {
    subdomain = 'waqtfinance';
  }

  const systemSubdomains = new Set([
    '',
    'localhost',
    '127.0.0.1',
    'payday',
    'payday-api',
    'testing',
    'testing-api',
    'testing-waqtmoney',
    'testing-api-waqtmoney',
    'api',
    'waqtfinance'
  ]);

  const isDefaultTenant = systemSubdomains.has(subdomain);

  if (isDefaultTenant) {
    // Fall back to default tenant 'waqtfinance' (pool already initialized on boot)
    const defaultTenantPool = getTenantPool({ slug: 'waqtfinance' });
    const waqtTenant = { 
      slug: 'waqtfinance', 
      name: 'Waqt Finance',
      cin: 'CIN-U67120RJ1995PTC009521',
      gstin: 'GSTIN : 08AAACW1509R1ZX',
      website: 'www.waqtfinance.com',
      lender: 'WAQT FINANCE PRIVATE LIMITED',
      address: '15 K- 5 Jyoti Nagar Housing Board Colony, Sahakar Marg, Jaipur, Rajasthan 302005',
      phone: '+91 92170 86608',
      email: 'customercare@waqtfinance.com',
      logo_url: '/logo.webp',
      theme_color: '#059669'
    };
    req.tenant = waqtTenant;
    return tenantLocalStorage.run({ pool: defaultTenantPool, tenant: waqtTenant }, () => next());
  }

  // If it's the superadmin portal subdomain, proceed without a tenant pool context
  if (subdomain === 'admin' || subdomain === 'superadmin') {
    req.tenant = { slug: 'superadmin', name: 'Superadmin Portal' };
    return next();
  }

  try {
    const now = Date.now();
    let tenant = null;
    const cachedTenant = tenantRecordCache.get(subdomain);
    if (cachedTenant && (now - cachedTenant.timestamp < TENANT_CACHE_TTL_MS)) {
      tenant = cachedTenant.tenant;
    } else {
      const rows = await queryMaster(
        'SELECT id, name, slug, db_host, db_user, db_password, db_name, db_port, status, cin, gstin, website, lender, address, phone, email, logo_url, theme_color FROM tenants WHERE slug = ? LIMIT 1',
        [subdomain]
      );
      tenant = rows && rows[0] ? rows[0] : null;
      tenantRecordCache.set(subdomain, { timestamp: now, tenant });
    }

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: `Company '${subdomain}' was not found.`,
      });
    }

    if (tenant.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: `Company '${subdomain}' is suspended. Please contact the administrator.`,
      });
    }

    // Initialize or retrieve pool
    const pool = getTenantPool(tenant);
    req.tenant = tenant;

    // Run the rest of request cycle inside tenant pool context
    return tenantLocalStorage.run({ pool, tenant }, () => next());
  } catch (error) {
    console.error('Tenant middleware connection resolution failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to resolve company connection.',
    });
  }
}

module.exports = tenantMiddleware;
