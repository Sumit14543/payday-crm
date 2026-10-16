const rateLimit = require('express-rate-limit');

/**
 * Standard JSON response for rate limit violations
 */
function createRateLimitHandler(message, retrySeconds) {
  return (req, res) => {
    res.status(429).json({
      success: false,
      message: message || 'Too many requests. Please slow down and try again later.',
      retryAfterSeconds: retrySeconds || 60,
    });
  };
}

// 1. General API rate limiter: 60 requests per 1 minute per IP
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // Limit each IP to 60 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Too many API requests from this IP. Please wait a minute before retrying.', 60),
});

// 2. Strict Authentication rate limiter: 5 attempts per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 login attempts
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  handler: createRateLimitHandler('Too many login attempts. Account access is temporarily throttled for security. Please try again after 15 minutes.', 900),
});

// 3. Strict Resend OTP rate limiter: 2 attempts per 5 minutes per IP
const otpResendLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 2, // Maximum 2 OTP resends in 5 minutes
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Too many OTP resend requests. Please wait 5 minutes before requesting a new code.', 300),
});

// 4. Strict Public Lead Creation limiter: 5 submissions per 15 minutes per IP
const publicLeadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Too many lead submission requests. Please try again in 15 minutes.', 900),
});

// 5. Document Upload limiter: 10 uploads per 15 minutes per IP
const publicUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Upload rate limit reached. Please wait a few minutes before uploading more documents.', 300),
});

// 6. Public Tracking limiter: 10 queries per 10 minutes per IP
const trackingLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Too many tracking lookups. Please try again after 10 minutes.', 600),
});

// 7. Webhook rate limiter: 60 requests per 1 minute
const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Webhook rate limit exceeded.', 60),
});

module.exports = {
  apiLimiter,
  authLimiter,
  otpResendLimiter,
  publicLeadLimiter,
  publicUploadLimiter,
  trackingLimiter,
  webhookLimiter,
};
