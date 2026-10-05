const collectionModel = require('../models/collectionModel');
const leadStatusModel = require('../models/leadStatusModel');
const repaymentModel = require('../models/repaymentModel');
const sourceStatusWebhookService = require('../services/sourceStatusWebhookService');
const { invalidateCollectionsCache } = require('./referenceController');
const { success } = require('../utils/http');

async function getCaseOr404(caseId) {
  const collectionCase = await collectionModel.findCaseById(caseId);
  if (!collectionCase) {
    const error = new Error('Collection case not found.');
    error.statusCode = 404;
    error.publicMessage = error.message;
    throw error;
  }
  return collectionCase;
}

async function getSummary(req, res) {
  const summary = await collectionModel.getSummary();
  return success(res, summary);
}

async function getReports(req, res) {
  const reports = await collectionModel.getCollectionReports();
  return success(res, reports);
}

async function getActivity(req, res) {
  await getCaseOr404(req.params.caseId);
  const activity = await collectionModel.getActivity(req.params.caseId);
  return success(res, activity);
}

async function createCallLog(req, res) {
  const collectionCase = await getCaseOr404(req.params.caseId);
  const callLog = await collectionModel.createCallLog(collectionCase, {
    ...req.body,
    actor: req.body.actor || req.user?.name,
  });
  invalidateCollectionsCache();
  const activity = await collectionModel.getActivity(collectionCase.id);
  return success(res, { activity, callLog }, 'Collection call log saved.');
}

async function createFollowup(req, res) {
  const collectionCase = await getCaseOr404(req.params.caseId);
  const followup = await collectionModel.createFollowup(collectionCase, {
    ...req.body,
    actor: req.body.actor || req.user?.name,
  });
  invalidateCollectionsCache();
  const activity = await collectionModel.getActivity(collectionCase.id);
  return success(res, { activity, followup }, 'Collection follow-up created.');
}

async function createPtp(req, res) {
  const collectionCase = await getCaseOr404(req.params.caseId);
  const ptp = await collectionModel.createPtp(collectionCase, {
    ...req.body,
    actor: req.body.actor || req.user?.name,
  });
  invalidateCollectionsCache();
  const activity = await collectionModel.getActivity(collectionCase.id);
  return success(res, { activity, ptp }, 'Promise to pay captured.');
}

async function updatePtpStatus(req, res) {
  const collectionCase = await getCaseOr404(req.params.caseId);
  const ptp = await collectionModel.updatePtpStatus(collectionCase, req.params.ptpId, req.body);
  invalidateCollectionsCache();
  const activity = await collectionModel.getActivity(collectionCase.id);
  return success(res, { activity, ptp }, 'Promise to pay status updated.');
}

async function createPayment(req, res) {
  const collectionCase = await getCaseOr404(req.params.caseId);
  const amount = Number(req.body.amount || 0);
  const closeFully = Boolean(req.body.closeFully === 'true' || req.body.closeFully === true || req.body.markAsClosed === 'true' || req.body.markAsClosed === true);
  let reference = String(req.body.reference || req.body.transactionId || '').trim();
  if (!reference) {
    reference = 'REF-' + Date.now().toString(36).toUpperCase();
  }
  const method = String(req.body.method || 'Manual Collection').trim();

  if (!closeFully && (!Number.isFinite(amount) || amount <= 0)) {
    const error = new Error('Payment amount must be greater than zero.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  const context = await repaymentModel.findLoanContext({ loanId: collectionCase.loanId });
  if (!context) {
    const error = new Error('Loan repayment account not found for this collection case.');
    error.statusCode = 404;
    error.publicMessage = error.message;
    throw error;
  }

  const existing = await repaymentModel.findByReference(reference);
  if (existing) {
    const error = new Error('This payment reference has already been recorded.');
    error.statusCode = 409;
    error.publicMessage = error.message;
    throw error;
  }

  let proofUrl = '';
  let proofOriginalName = '';
  if (req.file) {
    proofUrl = `/uploads/payment-proofs/${req.file.filename}`;
    proofOriginalName = req.file.originalname || req.file.filename;
  }

  const repayment = await repaymentModel.createRepayment(context, {
    amount,
    method,
    metadata: {
      caseId: collectionCase.id,
      notes: req.body.notes || '',
      source: 'collection_panel',
      proofUrl,
      proofOriginalName,
    },
    paidAt: req.body.paidAt || null,
    receivedBy: req.user?.name || 'Collection Agent',
    reference,
  });
  const loanUpdate = await repaymentModel.refreshLoanAfterRepayment(context, { closeFully });
  const summary = await repaymentModel.repaymentSummaryByLead(context.lead);

  await leadStatusModel.createForLead(context.lead, {
    actor: req.user?.name || 'Collection Agent',
    actorRole: req.user?.role || 'collection',
    description: loanUpdate.balance <= 0
      ? 'Repayment collected and loan closed by collection team.'
      : 'Repayment collected by collection team and balance updated.',
    metadata: {
      amount: repayment.amount,
      balance: loanUpdate.balance,
      caseId: collectionCase.id,
      loanId: context.loan.id,
      method,
      reference,
      totalPaid: loanUpdate.totalPaid,
      proofUrl,
      proofOriginalName,
    },
    publicStatus: loanUpdate.balance <= 0 ? 'Repayment completed' : 'Repayment received',
    source: 'collection_payment',
    sourceKey: `collection-payment:${repayment.reference}`,
    stageKey: loanUpdate.balance <= 0 ? 'closed' : 'repayment_active',
    status: context.lead.status || 'Converted',
    title: loanUpdate.balance <= 0 ? 'Repayment completed' : 'Repayment received',
  });

  await sourceStatusWebhookService.dispatchRepaymentEvent(context.lead, repayment, summary);

  invalidateCollectionsCache();
  const activity = await collectionModel.getActivity(collectionCase.id);
  return success(res, {
    activity,
    loan: summary,
    loanUpdate,
    repayment,
  }, 'Collection payment recorded.');
}

async function reopenCase(req, res) {
  const collectionCase = await getCaseOr404(req.params.caseId);
  const { query } = require('../config/db');
  const context = await repaymentModel.findLoanContext({ loanId: collectionCase.loanId });
  if (!context) {
    const error = new Error('Loan context not found for this collection case.');
    error.statusCode = 404;
    error.publicMessage = error.message;
    throw error;
  }

  const [totals] = await query(`
    SELECT COALESCE(SUM(amount), 0) AS totalPaid
    FROM loan_repayments
    WHERE loan_id = ? AND (status IS NULL OR TRIM(status) = '' OR LOWER(TRIM(status)) IN ('received', 'success', 'paid', 'settled', 'completed', 'approved'))
  `, [context.loan.id]);

  const totalPaid = Number(totals.totalPaid || 0);
  const totalAmount = Number(context.loan.totalAmount || 0) || Number(collectionCase.totalDue || 0);
  const newBalance = Math.max(0, Math.round(totalAmount - totalPaid));
  const newLoanStatus = newBalance > 0 ? 'Overdue' : 'Paid Off';
  const newCaseStatus = newBalance > 0 ? 'Active' : 'Closed';

  await query(`
    UPDATE loans
    SET amount_paid = ?, balance = ?, status = ?, payment_status = ?
    WHERE id = ?
  `, [totalPaid, newBalance, newLoanStatus, newBalance > 0 ? 'Partial' : 'Paid', context.loan.id]);

  await query(`
    UPDATE collection_cases
    SET status = ?
    WHERE id = ? OR loan_id = ?
  `, [newCaseStatus, collectionCase.id, context.loan.id]);

  if (context.lead?.rawId) {
    await query(`
      UPDATE loan_applications
      SET status = ?, is_active_application = ?
      WHERE id = ? OR application_id = ?
    `, [newBalance > 0 ? 'disbursed' : 'closed', newBalance > 0 ? 1 : 0, context.lead.rawId, context.lead.id]);
  }

  invalidateCollectionsCache();
  return success(res, {
    caseId: collectionCase.id,
    loanId: context.loan.id,
    balance: newBalance,
    status: newLoanStatus,
    totalPaid,
  }, 'Loan case reopened and balance recalculated.');
}

module.exports = {
  createCallLog,
  createFollowup,
  createPayment,
  createPtp,
  getActivity,
  getReports,
  getSummary,
  reopenCase,
  updatePtpStatus,
};
