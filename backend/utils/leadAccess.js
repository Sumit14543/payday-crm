const SUPPORT_EMAILS = new Set(['support@waqtmoney.in', 'support@waqtfinance.com']);
function canReadLead(user, lead) {
  if (!user || !lead) return false;
  if (['superadmin', 'product-admin', 'credit-manager', 'accountant', 'collection'].includes(user.role)) return true;
  if (user.role !== 'telecaller') return false;
  if (SUPPORT_EMAILS.has(String(user.email || '').toLowerCase())) return true;
  const assigned = String(lead.assignedTo || lead.assigned_to || '').trim().toLowerCase();
  if (['', 'unassigned', 'intake queue', 'none', 'null', 'undefined', 'credit manager', 'credit-manager', 'shruti singh'].includes(assigned)) return true;
  return [user.name, user.email].some(value => value && String(value).trim().toLowerCase() === assigned);
}
function assertLeadAccess(user, lead) {
  if (canReadLead(user, lead)) return;
  const error = new Error('This record is outside your assigned access.'); error.statusCode = 403; error.publicMessage = error.message; throw error;
}
function assertGenericStatus(lead, requested) {
  if (requested === undefined || String(requested).trim().toLowerCase() === String(lead.status).trim().toLowerCase()) return;
  const financialStates = ['approved', 'qualified', 'converted', 'disbursed', 'closed'];
  if (financialStates.includes(String(requested).trim().toLowerCase()) || financialStates.includes(String(lead.status).trim().toLowerCase())) {
    const error = new Error('Use the authorized credit, accounting or settlement workflow for this status.'); error.statusCode = 403; error.publicMessage = error.message; throw error;
  }
}
module.exports = { canReadLead, assertLeadAccess, assertGenericStatus };
