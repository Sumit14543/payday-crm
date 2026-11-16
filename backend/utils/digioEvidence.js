const crypto = require('crypto');
const { tenantLocalStorage } = require('../config/db');
const completed = status => ['complete', 'completed', 'signed', 'executed'].includes(String(status || '').toLowerCase());
function binding(agreement) {
  return [tenantLocalStorage.getStore()?.tenant?.slug || 'waqtfinance', ...['id', 'leadId', 'applicationId', 'sanctionId', 'agreementNumber', 'provider', 'providerDocumentId', 'signedPdfPath'].map(key => String(agreement[key] || ''))];
}
function signature(agreement, verifiedAt) {
  const key = String(process.env.AUTH_TOKEN_SECRET || '');
  if (key.length < 32) throw new Error('Secure agreement verification is unavailable.');
  return crypto.createHmac('sha256', key).update(JSON.stringify(['digio-verified-v1', binding(agreement), verifiedAt])).digest('hex');
}
function issueEvidence(agreement, provider) {
  if (!agreement.signedPdfPath || provider.providerDocumentId !== agreement.providerDocumentId || !completed(provider.providerStatus)) throw new Error('Provider has not verified the signed agreement.');
  const verifiedAt = new Date().toISOString();
  return { version: 1, verifiedAt, signature: signature(agreement, verifiedAt) };
}
function hasEvidence(agreement) {
  const evidence = agreement.metadata?.digioVerification;
  if (agreement.status !== 'signed' || !completed(agreement.providerStatus) || evidence?.version !== 1 || !/^[a-f0-9]{64}$/.test(evidence.signature || '') || !Number.isFinite(Date.parse(evidence.verifiedAt))) return false;
  try { return crypto.timingSafeEqual(Buffer.from(evidence.signature), Buffer.from(signature(agreement, evidence.verifiedAt))); } catch { return false; }
}
module.exports = { issueEvidence, hasEvidence };
