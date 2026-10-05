const paymentLinkModel = require('../models/paymentLinkModel');
const repaymentModel = require('../models/repaymentModel');
const cashfreePaymentLinkService = require('../services/cashfreePaymentLinkService');
const { success } = require('../utils/http');

function publicError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicMessage = message;
  throw error;
}

function resolveAmount(context, payload) {
  const requestedAmount = Number(payload.amount);
  if (Number.isFinite(requestedAmount) && requestedAmount > 0) return requestedAmount;
  return Number(context.loan.balance || context.schedule?.totalDue || context.loan.totalAmount || 0);
}

async function createLeadRepaymentLink(req, res) {
  const loanId = String(req.body?.loanId || '').trim();
  if (!loanId) publicError('loanId is required to create a repayment link.');

  const context = await repaymentModel.findLoanContext({ loanId });
  if (!context) publicError('Active loan account not found for this loanId.', 404);

  const amount = resolveAmount(context, req.body || {});
  if (!Number.isFinite(amount) || amount <= 0) publicError('Payment link amount must be greater than zero.');

  const reusableLink = await paymentLinkModel.findReusableForLoan({
    amount,
    gateway: 'cashfree',
    loanId: context.loan.id,
  });
  if (reusableLink?.linkUrl) {
    return success(res, {
      ...reusableLink,
      reused: true,
    }, 'Active repayment link already exists.');
  }

  const validForHours = Math.min(Math.max(Number(req.body?.validForHours || 24), 1), 168);
  const expiresAt = new Date(Date.now() + validForHours * 60 * 60 * 1000);
  const gatewayLink = await cashfreePaymentLinkService.createPaymentLink({
    amount,
    applicationId: context.lead.id,
    customerEmail: context.lead.email,
    customerName: context.lead.name,
    customerPhone: context.lead.phone,
    expiresAt,
    leadId: context.lead.rawId,
    loanId: context.loan.id,
    purpose: `Repayment for loan ${context.loan.id}`,
  });

  if (!gatewayLink.linkUrl) publicError('Cashfree did not return a payment link URL.', 502);

  const paymentLink = await paymentLinkModel.create({
    amount,
    applicationId: context.lead.id,
    createdBy: req.user?.name || req.body?.user || 'Accountant',
    customerId: context.loan.customerId,
    expiresAt,
    gateway: 'cashfree',
    gatewayLinkId: gatewayLink.gatewayLinkId,
    leadId: context.lead.rawId,
    linkUrl: gatewayLink.linkUrl,
    loanId: context.loan.id,
    metadata: {
      cashfreeResponse: gatewayLink.cashfreeResponse,
      cfLinkId: gatewayLink.cfLinkId,
      requestPayload: gatewayLink.requestPayload,
      source: 'account_panel',
    },
    status: gatewayLink.status,
  });

  return success(res, paymentLink, 'Repayment link created successfully.', 201);
}

module.exports = {
  createLeadRepaymentLink,
};
