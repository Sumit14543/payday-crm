const crypto = require('crypto');
function normalizeTenant(value) {
  const slug = String(value || '').trim().toLowerCase();
  return slug === 'waqtmoney' ? 'waqtfinance' : slug;
}
function sameKey(left, right) {
  if (typeof left !== 'string' || !left || typeof right !== 'string' || !right) return false;
  return crypto.timingSafeEqual(crypto.createHash('sha256').update(left).digest(), crypto.createHash('sha256').update(right).digest());
}
function authorize(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const header = req.headers['x-api-key'] || req.headers['x-tally-api-key']
    || String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1];
  const queryKey = req.query.api_key || req.query.apiKey;
  const key = header || queryKey;
  let keys = [];
  try {
    const configured = JSON.parse(process.env.TALLY_COMPANY_KEYS || '[]');
    if (!Array.isArray(configured)) throw new Error('Invalid configuration');
    keys = configured.filter(item => typeof item?.key === 'string' && normalizeTenant(item.tenant));
  } catch {
    return res.status(503).json({ status: false, count: 0, data: [], message: 'Tally integration configuration requires review.' });
  }
  if (process.env.TALLY_API_KEY) keys.push({ key: process.env.TALLY_API_KEY, tenant: process.env.TALLY_TENANT || 'waqtfinance' });
  const matched = keys.find(item => sameKey(key, item.key));
  if (!matched) return res.status(401).json({ status: false, count: 0, data: [], message: 'Unauthorized: Invalid or missing API Key for Tally integration.' });
  if (normalizeTenant(req.tenant?.slug) !== normalizeTenant(matched.tenant)) {
    return res.status(403).json({ status: false, count: 0, data: [], message: 'Tally key does not match the selected company.' });
  }
  if (!header && queryKey) {
    // Existing accounting clients retain compatibility during header migration.
    // Operators can require headers after validating their client configuration.
    if (process.env.TALLY_ALLOW_QUERY_KEY === 'false') {
      return res.status(401).json({ status: false, count: 0, data: [], message: 'Send the Tally API key in the X-Tally-Api-Key header.' });
    }
    res.setHeader('Deprecation', 'true');
    res.setHeader('Warning', '299 - "Move the Tally API key to the X-Tally-Api-Key header"');
  }
  return true;
}
module.exports = { authorize };
