const { createCustomerActionToken, verifyCustomerActionToken } = require('../middleware/auth');
const { tenantLocalStorage } = require('../config/db');
const { assertLeadAccess } = require('./leadAccess');
function checkoutUrl(lead, provider) {
  const url = new URL('/emandate/pay/' + encodeURIComponent(lead.id), process.env.PUBLIC_APP_URL || 'https://payday.waqtmoney.com');
  url.searchParams.set('provider', provider);
  url.searchParams.set('tenant', tenantLocalStorage.getStore()?.tenant?.slug || 'waqtfinance');
  url.searchParams.set('access', createCustomerActionToken(lead.id, provider));
  return url.toString();
}
function assertCheckoutAccess(req, targetId, provider) {
  if (req.user && ['credit-manager', 'accountant', 'product-admin', 'superadmin'].includes(req.user.role)) return;
  if (verifyCustomerActionToken(req.query?.access || req.body?.access, targetId, provider)) return;
  const error = new Error('This secure checkout link is invalid or expired. Request a fresh link.'); error.statusCode = 401; error.publicMessage = error.message; throw error;
}
function assertStaffLead(req, lead) { if (req.user) assertLeadAccess(req.user, lead); }
module.exports = { checkoutUrl, assertCheckoutAccess, assertStaffLead };
