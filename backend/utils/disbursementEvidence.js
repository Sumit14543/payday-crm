async function assertDisbursementEvidence(agreement, sanction) {
  if (process.env.NODE_ENV !== 'production') return;
  const reject = message => { const error = new Error(message); error.statusCode = 409; error.publicMessage = message; throw error; };
  if (!agreement || agreement.provider !== 'digio' || !agreement.providerDocumentId || !agreement.signedPdfPath || agreement.supersededAt || agreement.supersededByAgreementId) reject('A current verified Digio agreement is required before disbursement.');
  if (!sanction || String(agreement.sanctionId) !== String(sanction.id) || agreement.agreementNumber !== sanction.agreementNumber) reject('The signed agreement must match the current sanction. Complete the current agreement first.');
  const evidence = require('./digioEvidence');
  if (evidence.hasEvidence(agreement)) return;
  let verified;
  try { verified = await require('../services/digioService').getDocument(agreement.providerDocumentId); }
  catch { const error = new Error('Agreement verification is temporarily unavailable. Please retry.'); error.statusCode = 503; error.publicMessage = error.message; throw error; }
  if (verified.providerDocumentId !== agreement.providerDocumentId || !['complete', 'completed', 'signed', 'executed'].includes(String(verified.providerStatus || '').toLowerCase())) reject('The provider has not confirmed this agreement as signed.');
  await require('../models/loanAgreementModel').updateProviderStatus(agreement.id, {
    providerStatus: verified.providerStatus,
    metadata: { ...(agreement.metadata || {}), digioVerification: evidence.issueEvidence(agreement, verified) },
  });
}
module.exports = { assertDisbursementEvidence };
