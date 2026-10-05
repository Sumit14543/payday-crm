function isPrivateIp(ip) {
  if (!ip) return true;
  const clean = String(ip).replace(/^::ffff:/, '').trim();
  if (!clean || clean === '::1' || clean === '127.0.0.1' || clean === 'localhost') return true;
  if (/^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)/.test(clean)) return true;
  return false;
}

function getClientIp(req) {
  if (!req) return '';

  const candidates = [];

  // 1. Cloudflare IP header
  const cfIp = req.headers?.['cf-connecting-ip'] || (typeof req.get === 'function' ? req.get('cf-connecting-ip') : '');
  if (cfIp) candidates.push(cfIp);

  // 2. X-Real-IP header
  const realIp = req.headers?.['x-real-ip'] || (typeof req.get === 'function' ? req.get('x-real-ip') : '');
  if (realIp) candidates.push(realIp);

  // 3. X-Forwarded-For header (comma separated list)
  const xForwardedFor = req.headers?.['x-forwarded-for'] || (typeof req.get === 'function' ? req.get('x-forwarded-for') : '');
  if (xForwardedFor) {
    const ips = String(xForwardedFor).split(',').map(s => s.trim());
    candidates.push(...ips);
  }

  // 4. Express req.ip & remote address
  if (req.ip) candidates.push(req.ip);
  if (req.connection?.remoteAddress) candidates.push(req.connection.remoteAddress);
  if (req.socket?.remoteAddress) candidates.push(req.socket.remoteAddress);

  // Pick the first NON-PRIVATE (public) IP address
  for (let candidate of candidates) {
    if (!candidate) continue;
    let clean = String(candidate).trim();
    if (clean.startsWith('::ffff:')) {
      clean = clean.substring(7);
    }
    if (!isPrivateIp(clean)) {
      return clean;
    }
  }

  // Fallback to first candidate if all are internal
  let fallback = candidates[0] || req.ip || '';
  if (typeof fallback === 'string' && fallback.startsWith('::ffff:')) {
    fallback = fallback.substring(7);
  }
  return String(fallback || '').trim();
}

module.exports = { getClientIp, isPrivateIp };
