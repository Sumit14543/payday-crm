const crypto = require('crypto');
require('../config/env');
const { tenantLocalStorage } = require('../config/db');
const crmUserModel = require('../models/crmUserModel');

const VALID_ROLES = new Set(['telecaller', 'credit-manager', 'accountant', 'collection', 'superadmin', 'product-admin']);
const sessions = require('../services/authSessions');
const AUTH_TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || (process.env.NODE_ENV === 'production' ? '' : crypto.randomBytes(48).toString('hex'));
if (!process.env.AUTH_TOKEN_SECRET && process.env.NODE_ENV !== 'production') process.env.AUTH_TOKEN_SECRET = AUTH_TOKEN_SECRET;
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
const PASSWORD_ITERATIONS = 120000;
function getAuthConfigError() {
  return AUTH_TOKEN_SECRET.length < 32 || /change.?me|dev-secret/i.test(AUTH_TOKEN_SECRET) ? 'A strong AUTH_TOKEN_SECRET is required.' : '';
}
function assertAuthConfigured() {
  const message = getAuthConfigError();
  if (message) { const error = new Error(message); error.statusCode = 503; error.publicMessage = message; throw error; }
}
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const sign = value => crypto.createHmac('sha256', AUTH_TOKEN_SECRET).update(value).digest('base64url');
function signClaims(user, audience, expiresAt) {
  assertAuthConfigured();
  const body = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ ...user, iss: 'payday-crm', aud: audience, iat: Date.now(), exp: expiresAt });
  return body + '.' + sign(body);
}
function decodeClaims(token, audience) {
  if (getAuthConfigError()) return null;
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3 || parts[2].length !== 43) return null;
    const body = parts[0] + '.' + parts[1];
    if (!crypto.timingSafeEqual(Buffer.from(parts[2]), Buffer.from(sign(body)))) return null;
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (header.alg !== 'HS256' || header.typ !== 'JWT' || claims.iss !== 'payday-crm' || claims.aud !== audience) return null;
    if (!Number.isFinite(claims.exp) || claims.exp <= Date.now() || !Number.isFinite(claims.iat) || claims.iat > Date.now() + 30000) return null;
    return claims;
  } catch { return null; }
}
async function createToken(user) {
  assertAuthConfigured();
  const session = await sessions.createSession(user, TOKEN_TTL_MS);
  const { expiresAt, ...claims } = session;
  return signClaims(claims, 'crm-session', expiresAt);
}
function verifyToken(token, audience = 'crm-session') {
  const claims = decodeClaims(token, audience);
  if (!claims || !VALID_ROLES.has(claims.role) || !claims.id || !/^[a-f0-9]{64}$/.test(claims.sessionId || '') || !claims.tenant) return null;
  return claims;
}
function createDocumentTicket(token) {
  const claims = verifyToken(token);
  if (!claims) throw new Error('A valid session is required.');
  return signClaims(claims, 'crm-documents', claims.exp);
}
function createDocumentCapability(filePath, ttlMs = TOKEN_TTL_MS) {
  const path = String(filePath || '').split('?')[0];
  if (!path.startsWith('/uploads/') || path.includes('..')) throw new Error('Invalid document path.');
  return signClaims({ path, tenant: sessions.tenantSlug() }, 'crm-document-file', Date.now() + ttlMs);
}

function createProviderCallbackToken(provider, context) {
  return signClaims({ ...context, tenant: sessions.tenantSlug(), nonce: crypto.randomBytes(24).toString('hex') }, 'provider-callback:' + provider, Date.now() + 24 * 60 * 60 * 1000);
}
function verifyProviderCallbackToken(token, provider) { return decodeClaims(token, 'provider-callback:' + provider); }
function createCustomerActionToken(applicationId, provider, ttlMs = 24 * 60 * 60 * 1000) {
  assertAuthConfigured();
  const expires = (Date.now() + ttlMs).toString(36);
  return expires + '.' + sign(JSON.stringify(['customer-emandate', sessions.tenantSlug(), String(applicationId), provider, expires]));
}
function verifyCustomerActionToken(token, applicationId, provider) {
  if (getAuthConfigError()) return false;
  const parts = String(token || '').split('.');
  if (parts.length !== 2 || !/^[a-z0-9]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1]) || parseInt(parts[0], 36) <= Date.now()) return false;
  const expected = sign(JSON.stringify(['customer-emandate', sessions.tenantSlug(), String(applicationId), provider, parts[0]]));
  return crypto.timingSafeEqual(Buffer.from(parts[1]), Buffer.from(expected));
}

function verifyPassword(password, user) {
  if (!user || !user.salt || !user.hash) return Promise.resolve(false);

  const cleanPass = String(password || '').trim();
  if (!cleanPass) return Promise.resolve(false);

  return new Promise((resolve) => {
    crypto.pbkdf2(cleanPass, user.salt, PASSWORD_ITERATIONS, 32, 'sha256', (err, derivedKey) => {
      if (err) return resolve(false);
      const hash = derivedKey.toString('hex');
      const actual = Buffer.from(hash, 'hex');
      const expected = Buffer.from(user.hash, 'hex');
      resolve(actual.length === expected.length && crypto.timingSafeEqual(actual, expected));
    });
  });
}

async function authenticateUser({ email, password, role }) {
  assertAuthConfigured();
  if (!VALID_ROLES.has(role)) return null;

  const normalizedEmail = String(email || '').trim().toLowerCase();
  const trimmedPassword = String(password || '').trim();

  // Strict validation: both email and password must be present
  if (!normalizedEmail || !trimmedPassword) {
    return null;
  }

  // Find user in active database crm_users table
  const foundUser = await crmUserModel.findActiveByEmailAndRole(normalizedEmail, role);
  if (!foundUser) {
    return null;
  }

  // Verify password strictly against database salt and hash
  const isValid = await verifyPassword(trimmedPassword, foundUser);
  if (!isValid) {
    return null;
  }

  try {
    await crmUserModel.markLogin(foundUser.id, foundUser.isMasterSuperadmin);
  } catch (e) {}

  return {
    id: foundUser.id,
    email: foundUser.email,
    name: foundUser.name,
    role: foundUser.role,
    isMasterSuperadmin: Boolean(foundUser.isMasterSuperadmin),
  };
}

function listPublicUsers() {
  return crmUserModel.listPublicUsers();
}

function authOptional(req, res, next) {
  if (req.authParsed) return next();
  req.authParsed = true;
  const authorization = String(req.get('authorization') || '');
  const [scheme, token] = authorization.split(' ');
  if (scheme === 'Bearer' && token) req.user = verifyToken(token) || undefined;
  const path = req.path || '';
  if (!req.user && ['GET', 'HEAD'].includes(req.method) && (path.startsWith('/uploads/') || path === '/api/files/download')) {
    const queryToken = typeof req.query?.token === 'string' ? req.query.token : '';
    const ticket = verifyToken(queryToken, 'crm-documents');
    if (ticket) req.user = { ...ticket, documentOnly: true };
    else {
      const capability = decodeClaims(queryToken, 'crm-document-file');
      const requested = path === '/api/files/download' ? req.query?.path : path;
      if (capability && capability.path === requested && capability.tenant === req.tenant?.slug) req.documentCapability = capability;
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication is required.',
    });
  }

  return next();
}

function requireRole(roles) {
  const allowedRoles = new Set(roles);

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication is required.',
      });
    }

    const platformOnly = roles.length === 1 && roles[0] === 'superadmin';
    const platformAdmin = req.user.role === 'superadmin' && req.user.isMasterSuperadmin === true;
    const companyAdmin = ['superadmin', 'product-admin'].includes(req.user.role);
    if (platformAdmin || (!platformOnly && (companyAdmin || allowedRoles.has(req.user.role)))) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: 'You do not have permission to access this resource.',
    });
  };
}

module.exports = {
  authenticateUser,
  authOptional,
  createToken,
  getAuthConfigError,
  listPublicUsers,
  requireAuth,
  requireRole,
  verifyToken,
  createDocumentTicket,
  createDocumentCapability,
  createProviderCallbackToken,
  verifyProviderCallbackToken,
  createCustomerActionToken,
  verifyCustomerActionToken,
};
