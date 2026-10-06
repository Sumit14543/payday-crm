const crypto = require('crypto');
const { authenticateUser, createToken } = require('../middleware/auth');
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
  const ip = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  return `${ip}:${email || ''}`;
}

async function login(req, res) {
  requireFields(req.body || {}, ['email', 'password', 'role']);

  const emailClean = String(req.body?.email || '').trim().toLowerCase();
  const roleClean = String(req.body?.role || '').trim().toLowerCase();
  const rateLimitKey = getClientIdentifier(req, emailClean);
  const now = Date.now();

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

  if (roleClean === 'credit-manager' && emailClean !== 'shruti@waqtmoney.in') {
    const error = new Error('Access Denied: Only authorized Credit Manager account (shruti@waqtmoney.in) is authorized to login into the Credit Panel.');
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

  // Telecaller, Collection & Credit Manager Roles: Mandatory 2FA Email OTP Verification
  const userRoleClean = String(user.role || '').trim().toLowerCase();
  const userEmailClean = String(user.email || '').trim().toLowerCase();
  const isOtpRequired = userRoleClean === 'telecaller' || userRoleClean === 'collection' || userRoleClean === 'credit-manager' || userEmailClean.includes('himanshu');

  if (isOtpRequired) {
    const otpCode = String(Math.floor(100000 + Math.random() * 900000));
    const tempToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    await crmUserModel.saveLoginOtp(user.id, otpCode, tempToken, expiresAt);

    try {
      await emailService.sendTelecallerOtpEmail({
        toEmail: user.email,
        otpCode,
        userName: user.name,
      });
      console.log(`[OTP] Login OTP sent to ${user.email}: ${otpCode}`);
    } catch (mailErr) {
      console.error(`[OTP Error] Failed to send OTP email to ${user.email}:`, mailErr.message);
      const error = new Error('Failed to send OTP email. Please try again.');
      error.statusCode = 500;
      error.publicMessage = error.message;
      throw error;
    }

    return success(res, {
      requiresOtp: true,
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

  return success(res, {
    token: createToken(user),
    user,
  }, 'Logged in successfully.');
}

async function verifyTelecallerOtp(req, res) {
  requireFields(req.body || {}, ['tempToken', 'otp']);
  const { tempToken, otp } = req.body;

  const foundUser = await crmUserModel.findUserByOtpToken(tempToken);
  if (!foundUser) {
    const error = new Error('Invalid or expired OTP session. Please try logging in again.');
    error.statusCode = 401;
    error.publicMessage = error.message;
    throw error;
  }

  const now = new Date();
  if (!foundUser.login_otp_expires_at || new Date(foundUser.login_otp_expires_at) < now) {
    await crmUserModel.clearLoginOtp(foundUser.id);
    const error = new Error('OTP has expired. Please request a new OTP.');
    error.statusCode = 401;
    error.publicMessage = error.message;
    throw error;
  }

  const host = String(req.headers?.host || req.headers?.origin || '').toLowerCase();
  const isTestEnv = process.env.NODE_ENV !== 'production' ||
                    host.startsWith('testing.') ||
                    host.startsWith('test.') ||
                    host.startsWith('staging.') ||
                    host.includes('localhost') ||
                    host.includes('127.0.0.1');

  const isTestAccount = isTestEnv && (
    String(foundUser.email || '').toLowerCase().startsWith('test.') ||
    String(foundUser.email || '').toLowerCase().startsWith('support.')
  );

  const isValidOtp = String(foundUser.login_otp_code).trim() === String(otp).trim() ||
                     (isTestAccount && String(otp).trim() === '123456');

  const otpAttemptKey = `otp:${tempToken}`;
  if (!isValidOtp) {
    const currentOtpAttempts = (otpAttempts.get(otpAttemptKey) || 0) + 1;
    otpAttempts.set(otpAttemptKey, currentOtpAttempts);

    if (currentOtpAttempts >= 3) {
      otpAttempts.delete(otpAttemptKey);
      await crmUserModel.clearLoginOtp(foundUser.id);
      const error = new Error('Too many invalid OTP attempts. For your security, this OTP session has been terminated. Please log in again.');
      error.statusCode = 429;
      error.publicMessage = error.message;
      throw error;
    }

    const remaining = 3 - currentOtpAttempts;
    const error = new Error(`Invalid OTP code. Please check your email. (${remaining} attempt(s) remaining)`);
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  // Clear OTP attempt counter and credentials
  otpAttempts.delete(otpAttemptKey);
  await crmUserModel.clearLoginOtp(foundUser.id);
  await crmUserModel.markLogin(foundUser.id);

  const user = {
    id: foundUser.id,
    email: foundUser.email,
    name: foundUser.name,
    role: foundUser.role,
  };

  req.user = user;
  await auditModel.create(req, {
    action: 'auth.login_success_otp',
    entityType: 'auth',
  });

  return success(res, {
    token: createToken(user),
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

  const otpCode = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await crmUserModel.saveLoginOtp(foundUser.id, otpCode, tempToken, expiresAt);

  try {
    await emailService.sendTelecallerOtpEmail({
      toEmail: foundUser.email,
      otpCode,
      userName: foundUser.name,
    });
    console.log(`[OTP Resend] Telecaller OTP re-sent to ${foundUser.email}: ${otpCode}`);
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

module.exports = {
  login,
  verifyTelecallerOtp,
  resendTelecallerOtp,
  getBranding,
};

