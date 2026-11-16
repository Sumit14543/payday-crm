const crypto = require('crypto');
const { authenticateUser, createToken, createDocumentTicket, verifyToken } = require('../middleware/auth');
const auditModel = require('../models/auditModel');
const crmUserModel = require('../models/crmUserModel');
const emailService = require('../services/emailService');
const geocodingService = require('../services/geocodingService');
const { requireFields, success } = require('../utils/http');

// In-memory rate limiter for brute-force protection
const loginAttempts = new Map();
const otpAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// Periodic cleanup of expired lockout records every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of loginAttempts.entries()) {
    if (data.lockUntil < now && (now - data.lastAttempt > LOCKOUT_DURATION_MS * 2)) {
      loginAttempts.delete(key);
    }
  }
  for (const [key, data] of otpAttempts.entries()) {
    if (now - data.lastAttempt > LOCKOUT_DURATION_MS) {
      otpAttempts.delete(key);
    }
  }
}, 10 * 60 * 1000).unref();

function getClientIdentifier(req, email) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  return `${ip}:${email || ''}`;
}

async function login(req, res) {
  requireFields(req.body || {}, ['email', 'password', 'role']);

  const emailClean = String(req.body?.email || '').trim().toLowerCase();
  const roleClean = String(req.body?.role || '').trim().toLowerCase();
  const rawPassword = String(req.body?.password || '').trim();
  const rateLimitKey = getClientIdentifier(req, emailClean);
  const now = Date.now();

  if (rawPassword === 'Admin@123' || rawPassword === 'Admin@12345' || rawPassword === 'Sanjay@#2026@#' || rawPassword === 'Bhupendra@#2026@#') {
    const error = new Error('Previous default credentials are no longer valid for security. Please use the newly updated secure credentials.');
    error.statusCode = 401;
    error.publicMessage = error.message;
    throw error;
  }

  const attemptRecord = loginAttempts.get(rateLimitKey);
  if (attemptRecord && attemptRecord.lockUntil > now) {
    const remainingMinutes = Math.ceil((attemptRecord.lockUntil - now) / 60000);
    const error = new Error(`Too many failed login attempts. Temporarily locked for security. Please try again after ${remainingMinutes} minute(s).`);
    error.statusCode = 429;
    error.publicMessage = error.message;
    throw error;
  }

  const ALLOWED_DOMAINS = ['@waqtmoney.in', '@waqtfinance.com', '@geetpay.com', '@loaninwallet.com', '@salarywaves.com'];
  const isDomainAllowed = ALLOWED_DOMAINS.some((d) => emailClean.endsWith(d));

  const lat = req.body?.latitude ?? req.headers?.['x-client-latitude'];
  const lng = req.body?.longitude ?? req.headers?.['x-client-longitude'];

  let geoMetadata = {};
  if (lat !== undefined && lng !== undefined && lat !== null && lng !== null) {
    const geoResult = await geocodingService.getAddressFromLatLng(lat, lng);
    if (geoResult) {
      geoMetadata = {
        formattedAddress: geoResult.formattedAddress,
        location: geoResult.formattedAddress,
        city: geoResult.city,
        state: geoResult.state,
        country: geoResult.country,
        pincode: geoResult.pincode,
        lat: geoResult.lat,
        lng: geoResult.lng,
        source: 'gps_verified',
      };
    }
  }

  if (!isDomainAllowed && roleClean !== 'superadmin' && roleClean !== 'product-admin') {
    const error = new Error('Access Denied: Only authorized company email addresses (@waqtmoney.in, @waqtfinance.com, @geetpay.com, @loaninwallet.com) are allowed.');
    error.statusCode = 403;
    error.publicMessage = error.message;
    throw error;
  }

  const isTestEnv = process.env.NODE_ENV !== 'production' && process.env.ENABLE_TEST_ACCOUNTS === 'true';

  const isAuthorizedCreditEmail =
    emailClean === 'shrutisingh@waqtmoney.in' ||
    (isTestEnv && emailClean === 'test.credit@waqtmoney.in');

  if (roleClean === 'credit-manager' && !isAuthorizedCreditEmail) {
    const error = new Error('Access Denied: Only authorized Credit Manager account (shrutisingh@waqtmoney.in) is authorized to login into the Credit Panel.');
    error.statusCode = 403;
    error.publicMessage = error.message;
    throw error;
  }

  const user = await authenticateUser(req.body || {});
  if (!user) {
    const currentFailures = (attemptRecord?.count || 0) + 1;
    const lockUntil = currentFailures >= MAX_LOGIN_ATTEMPTS ? now + LOCKOUT_DURATION_MS : 0;
    loginAttempts.set(rateLimitKey, { count: currentFailures, lockUntil, lastAttempt: now });

    await auditModel.create(req, {
      action: 'auth.login_failed',
      entityType: 'auth',
      metadata: {
        email: req.body?.email || '',
        role: req.body?.role || '',
        attempt: currentFailures,
        locked: currentFailures >= MAX_LOGIN_ATTEMPTS,
        ...geoMetadata,
      },
    });

    if (currentFailures >= MAX_LOGIN_ATTEMPTS) {
      const error = new Error('Too many failed login attempts. Temporarily locked for 15 minutes.');
      error.statusCode = 429;
      error.publicMessage = error.message;
      throw error;
    }

    const remaining = MAX_LOGIN_ATTEMPTS - currentFailures;
    const error = new Error(`Email, password, and role do not match. (${remaining} attempt(s) remaining before temporary lockout)`);
    error.statusCode = 401;
    error.publicMessage = error.message;
    throw error;
  }

  // Clear failed login attempts on successful credentials
  loginAttempts.delete(rateLimitKey);

  // GUARANTEE: If email or password was wrong, authenticateUser returned null above and threw 401.
  // Double-check user object to be 100% sure NO OTP is generated and NO mail is hit on invalid credentials.
  if (!user || !user.id || !user.email) {
    const error = new Error('Email, password, and role do not match.');
    error.statusCode = 401;
    error.publicMessage = error.message;
    throw error;
  }

  // Telecaller, Collection, Accountant & Credit Manager Roles: Mandatory 2FA Email OTP Verification
  const userRoleClean = String(user.role || '').trim().toLowerCase();
  const userEmailClean = String(user.email || '').trim().toLowerCase();
  const isOtpRequired = userRoleClean === 'telecaller' || userRoleClean === 'collection' || userRoleClean === 'credit-manager' || userRoleClean === 'accountant' || userRoleClean === 'superadmin' || userRoleClean === 'product-admin' || userEmailClean.includes('himanshu');

  if (isOtpRequired) {
    const otpCode = crypto.randomInt(100000, 1000000).toString();
    const tempToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    await crmUserModel.saveLoginOtp(user.id, otpCode, tempToken, expiresAt, user);

    try {
      await emailService.sendTelecallerOtpEmail({
        toEmail: user.email,
        otpCode,
        userName: user.name,
      });
    } catch (mailErr) {
      await crmUserModel.clearLoginOtp(user.id, tempToken);
      const error = new Error('Failed to send OTP email. Please try again.');
      error.statusCode = 503; error.publicMessage = error.message; throw error;
    }

    return success(res, {
      requiresOtp: true,
      tenant: req.tenant?.slug || 'waqtfinance',
      tempToken,
      email: user.email,
      message: `An OTP security code has been sent to your email (${user.email}). Please enter it to complete login.`,
    }, 'OTP code sent to email.');
  }

  req.user = user;
  await auditModel.create(req, {
    action: 'auth.login_success',
    entityType: 'auth',
    metadata: {
      ...geoMetadata,
    },
  });

  const token = await createToken(user);
  user.tenant = verifyToken(token).tenant;
  return success(res, {
    token, documentToken: createDocumentTicket(token),
    user,
  }, 'Logged in successfully.');
}

async function verifyTelecallerOtp(req, res) {
  requireFields(req.body || {}, ['tempToken', 'otp']);
  const { tempToken, otp } = req.body;

  const foundUser = await crmUserModel.consumeLoginOtp(tempToken, otp);
  await crmUserModel.markLogin(foundUser.id, foundUser.isMasterSuperadmin);

  const user = {
    id: foundUser.id,
    email: foundUser.email,
    name: foundUser.name,
    role: foundUser.role,
    isMasterSuperadmin: Boolean(foundUser.isMasterSuperadmin),
  };

  req.user = user;
  await auditModel.create(req, {
    action: 'auth.login_success_otp',
    entityType: 'auth',
  });

  const token = await createToken({ ...user, credentialVersion: foundUser.credentialVersion });
  user.tenant = verifyToken(token).tenant;
  return success(res, {
    token, documentToken: createDocumentTicket(token),
    user,
  }, 'OTP verified and logged in successfully.');
}

async function resendTelecallerOtp(req, res) {
  requireFields(req.body || {}, ['tempToken']);
  const { tempToken } = req.body;

  const foundUser = await crmUserModel.findUserByOtpToken(tempToken);
  if (!foundUser) {
    const error = new Error('Invalid OTP session. Please try logging in again.');
    error.statusCode = 401;
    error.publicMessage = error.message;
    throw error;
  }

  const otpCode = crypto.randomInt(100000, 1000000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await crmUserModel.saveLoginOtp(foundUser.id, otpCode, tempToken, expiresAt, foundUser);

  try {
    await emailService.sendTelecallerOtpEmail({
      toEmail: foundUser.email,
      otpCode,
      userName: foundUser.name,
    });
  } catch (mailErr) {
    console.error(`[OTP Resend Error] Failed to resend OTP email:`, mailErr.message);
    const error = new Error('Failed to resend OTP email. Please try again.');
    error.statusCode = 500;
    error.publicMessage = error.message;
    throw error;
  }

  return success(res, {
    requiresOtp: true,
    tempToken,
    message: `A new OTP has been sent to ${foundUser.email}.`,
  }, 'New OTP sent to email.');
}

async function getBranding(req, res) {
  const tenant = req.tenant || { 
    slug: 'waqtfinance', 
    name: 'Waqt Finance',
    logo_url: '/logo.webp',
    theme_color: '#059669'
  };
  return success(res, {
    slug: tenant.slug,
    name: tenant.name,
    logoUrl: tenant.logo_url || '/logo.webp',
    themeColor: tenant.theme_color || '#3b82f6',
    secondaryColor: '#07111f',
  });
}

async function logout(req, res) {
  await require('../services/authSessions').revokeSession(req.user);
  return success(res, null, 'Logged out successfully.');
}

module.exports = {
  logout,
  login,
  verifyTelecallerOtp,
  resendTelecallerOtp,
  getBranding,
};

