const sanctionModel = require('../models/sanctionModel');
const leadModel = require('../models/leadModel');
const activityModel = require('../models/activityModel');
const { withTransaction, afterCommit } = require('../config/db');

function decisionError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicMessage = message;
  return error;
}

async function currentSanction(token) {
  const sanction = await sanctionModel.findByDecisionToken(token);
  if (!sanction) throw decisionError('Sanction link was not found. Please contact your loan officer.', 404);
  if (sanction.status === 'superseded' || sanction.supersededBySanctionId) {
    throw decisionError('This sanction has been replaced. Please use the latest sanction link.', 409);
  }
  const lead = await leadModel.findById(sanction.leadId || sanction.applicationId);
  if (!lead) throw decisionError('Sanction application was not found. Please contact your loan officer.', 404);
  const latest = await sanctionModel.findLatestByLead(lead);
  if (!latest || String(latest.id) !== String(sanction.id)) {
    throw decisionError('This sanction has been replaced. Please use the latest sanction link.', 409);
  }
  return { sanction, lead };
}

function resultFor(sanction, alreadyDecided = false) {
  return {
    success: true,
    alreadyDecided,
    pendingDecision: !sanction.customerDecision || sanction.customerDecision === 'pending',
    customerDecision: sanction.customerDecision || 'pending',
    leadId: sanction.leadId || sanction.applicationId,
    borrower: sanction.borrower,
    agreementNumber: sanction.agreementNumber,
    principalAmount: sanction.principalAmount,
    disbursedAmount: sanction.disbursedAmount,
    repaymentAmount: sanction.repaymentAmount,
    dueDate: sanction.dueDate,
  };
}

async function preview(token) {
  const { sanction } = await currentSanction(token);
  return resultFor(sanction, Boolean(sanction.customerDecision && sanction.customerDecision !== 'pending'));
}

async function record(token, action, { ip = '', userAgent = '', notes = '' } = {}) {
  const decision = ['accept', 'accepted'].includes(action) ? 'accepted'
    : ['reject', 'rejected'].includes(action) ? 'rejected' : '';
  if (!decision) throw decisionError('Choose Accept or Reject to confirm your response.', 400);
  return withTransaction(async () => {
    const { sanction, lead } = await currentSanction(token);
    const leadId = sanction.leadId || sanction.applicationId;
    const updated = await sanctionModel.updateCustomerDecision(sanction.id, {
      decision, notes: String(notes || `Customer confirmed sanction ${decision}`).slice(0, 2000),
      ip, userAgent: String(userAgent).slice(0, 500), expectedToken: token,
    }, leadId);
    if (!updated) throw decisionError('Sanction link was not found.', 404);
    const result = resultFor(updated, !updated.decisionChanged);
    if (!updated.decisionChanged) return result;
    const accepted = updated.customerDecision === 'accepted';
    await leadModel.updateStatus(leadId, accepted ? 'Approved' : 'Rejected');
    await activityModel.createForLead(lead, {
      type: accepted ? 'sanction_accepted' : 'sanction_rejected',
      description: accepted
        ? `Borrower ACCEPTED Loan Sanction Letter of ₹${Number(updated.principalAmount || 0).toLocaleString('en-IN')} (IP: ${ip})`
        : `Borrower REJECTED Loan Sanction Letter (IP: ${ip})`,
      user: updated.borrower || lead.name || 'Borrower',
      metadata: { sanctionId: updated.id, agreementNumber: updated.agreementNumber,
        customerDecision: updated.customerDecision, ip, userAgent, decidedAt: new Date().toISOString() },
    });
    result.confirmationEmailSent = false;
    afterCommit(async () => {
      try {
        await require('./sanctionLetterService').sendSanctionDecisionConfirmationEmail(updated, lead);
        result.confirmationEmailSent = true;
      } catch {
        console.error('Sanction decision recorded; confirmation email delivery failed.');
      }
    });
    return result;
  });
}

module.exports = { preview, record };
