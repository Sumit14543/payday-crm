function isPrivateIp(ip) {
  if (!ip) return true;
  const clean = String(ip).replace(/^::ffff:/, '').trim();
  if (!clean || clean === '::1' || clean === '127.0.0.1' || clean === 'localhost') return true;
  if (/^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)/.test(clean)) return true;
  return false;
}

function getClientIp(req) {
  // Express applies the configured proxy allowlist, walking from the socket.
  // Browser-supplied identity/location headers cannot become audit evidence.
  return String(req?.ip || req?.socket?.remoteAddress || '').replace(/^::ffff:/, '').trim();
}

module.exports = { getClientIp, isPrivateIp };
