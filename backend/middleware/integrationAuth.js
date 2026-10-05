const crypto = require('crypto');
const { config } = require('../config/env');

function timingSafeStringEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function readRequestKey(req) {
  const headerKey = req.get('x-integration-api-key');
  if (headerKey) return headerKey;

  const authorization = String(req.get('authorization') || '');
  const [scheme, token] = authorization.split(' ');
  return scheme === 'Bearer' ? token : '';
}

function requireIntegrationApiKey(req, res, next) {
  const configuredKeys = config.integrations.apiKeys;
  if (!configuredKeys.length) {
    return res.status(503).json({
      success: false,
      message: 'Integration API keys are not configured.',
    });
  }

  const requestKey = readRequestKey(req);
  const matchedKey = configuredKeys.find((item) => timingSafeStringEqual(item.key, requestKey));
  if (!matchedKey) {
    return res.status(401).json({
      success: false,
      message: 'Invalid integration API key.',
    });
  }

  const sourceSystem = String(req.body?.sourceSystem || req.query?.sourceSystem || '').trim().toLowerCase();
  if (matchedKey.sourceSystem && sourceSystem && matchedKey.sourceSystem !== sourceSystem) {
    const isGeetPayWaqt = matchedKey.sourceSystem === 'geetpay' && 
      (sourceSystem === 'waqtfinance' || sourceSystem === 'waqtmoney');
    if (!isGeetPayWaqt) {
      return res.status(403).json({
        success: false,
        message: 'Integration API key is not allowed for this source system.',
      });
    }
  }

  req.integration = {
    sourceSystem: matchedKey.sourceSystem || sourceSystem,
  };
  return next();
}

module.exports = {
  requireIntegrationApiKey,
};
