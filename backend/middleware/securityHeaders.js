function securityHeaders(req, res, next) {
  // Prevent MIME-sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Prevent Clickjacking (can only be framed by the same origin)
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  // Legacy XSS filter for older browsers
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Strict Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Restrict sensitive browser features if not needed
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), payment=()');

  // HSTS (HTTP Strict Transport Security) in production
  if (process.env.NODE_ENV === 'production' || req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  next();
}

module.exports = securityHeaders;
