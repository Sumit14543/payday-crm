function tenantForAdmin(req, requested = 'all') {
  if (req.user?.isMasterSuperadmin === true) return requested || 'all';
  const scope = req.user?.tenant;
  if (!['product-admin', 'superadmin'].includes(req.user?.role) || !scope || scope === 'platform') return deny();
  if (requested && requested !== 'all' && requested !== scope) return deny();
  return scope;
}
function deny() { const error = new Error('Access is limited to your own company.'); error.statusCode = 403; error.publicMessage = error.message; throw error; }
function booleanInput(value) {
  if (value === true || value === 1 || value === 'true' || value === '1') return true;
  if (value === false || value === 0 || value === 'false' || value === '0') return false;
  const error = new Error('A valid boolean value is required.'); error.statusCode = 400; error.publicMessage = error.message; throw error;
}
module.exports = { tenantForAdmin, booleanInput };
