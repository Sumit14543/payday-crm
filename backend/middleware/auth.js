const crypto = require('crypto');
require('../config/env');
const { tenantLocalStorage } = require('../config/db');
const crmUserModel = require('../models/crmUserModel');

const VALID_ROLES = new Set(['telecaller', 'credit-manager', 'accountant', 'collection', 'superadmin', 'product-admin']);
const AUTH_TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || 'payday-loan-crm-dev-secret-change-me';
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
const PASSWORD_ITERATIONS = 120000;
const authConfigErrors = [];

if (process.env.NODE_ENV === 'production' && AUTH_TOKEN_SECRET === 'payday-loan-crm-dev-secret-change-me') {
  authConfigErrors.push('AUTH_TOKEN_SECRET must be configured for production.');
}

function getAuthConfigError() {
  return authConfigErrors.length ? authConfigErrors.join(' ') : '';
}

function assertAuthConfigured() {
  const message = getAuthConfigError();
  if (!message) return;

  const error = new Error(message);
  error.statusCode = 503;
  error.publicMessage = message;
  throw error;
}

function base64UrlEncode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function base64UrlDecode(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

function sign(value) {
  return crypto
    .createHmac('sha256', AUTH_TOKEN_SECRET)
    .update(value)
    .digest('base64url');
}

function createToken(user) {
  assertAuthConfigured();

  const header = base64UrlEncode({ alg: 'HS256', typ: 'JWT' });
  const payload = base64UrlEncode({
    email: user.email,
    exp: Date.now() + TOKEN_TTL_MS,
    name: user.name,
    role: user.role,
  });
  const body = `${header}.${payload}`;
  return `${body}.${sign(body)}`;
}

function verifyToken(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;

    const [header, payload, signature] = parts;
    const body = `${header}.${payload}`;
    const expectedSignature = sign(body);
    const actual = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
      return null;
    }

    const claims = base64UrlDecode(payload);
    if (!claims.exp || Date.now() > Number(claims.exp)) return null;
    if (!VALID_ROLES.has(claims.role)) return null;

    return {
      email: claims.email || '',
      name: claims.name || '',
      role: claims.role,
    };
  } catch {
    return null;
  }
}

function verifyPassword(password, user) {
  if (!user || !user.salt || !user.hash) return Promise.resolve(false);

  const cleanPass = String(password || '').trim();

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
    await crmUserModel.markLogin(foundUser.id);
  } catch (e) {}

  return {
    id: foundUser.id,
    email: foundUser.email,
    name: foundUser.name,
    role: foundUser.role,
  };
}

function listPublicUsers() {
  return crmUserModel.listPublicUsers();
}

function authOptional(req, res, next) {
  const authorization = String(req.get('authorization') || '');
  const [scheme, headerToken] = authorization.split(' ');
  const queryToken = req.query && typeof req.query.token === 'string' ? req.query.token : '';
  const token = headerToken || queryToken;

  if (scheme === 'Bearer' && token) {
    const user = verifyToken(token);
    if (user) {
      req.user = user;
    }
  } else if (queryToken) {
    const user = verifyToken(queryToken);
    if (user) {
      req.user = user;
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

    if (req.user.role === 'superadmin' || req.user.role === 'product-admin' || allowedRoles.has(req.user.role)) {
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
};
