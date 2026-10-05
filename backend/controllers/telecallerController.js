const activityModel = require('../models/activityModel');
const auditModel = require('../models/auditModel');
const { config } = require('../config/env');
const camSheetModel = require('../models/camSheetModel');
const esignModel = require('../models/esignModel');
const leadModel = require('../models/leadModel');
const leadStatusModel = require('../models/leadStatusModel');
const loanAgreementModel = require('../models/loanAgreementModel');
const sanctionModel = require('../models/sanctionModel');
const telecallerModel = require('../models/telecallerModel');
const authkeyWhatsAppService = require('../services/authkeyWhatsAppService');
const sanctionLetterService = require('../services/sanctionLetterService');
const { notFound, requireFields, success } = require('../utils/http');
const { listPublicUsers } = require('../middleware/auth');

function buildPublicFileUrl(req, filePath) {
  const requestHost = `${req.protocol}://${req.get('host')}`;
  const baseUrl = String(requestHost || '').replace(/\/+$/, '');
  const normalizedPath = String(filePath || '').startsWith('/') ? filePath : `/${filePath || ''}`;
  return `${baseUrl}${normalizedPath}`;
}

const CALL_OUTCOME_RULES = {
  Connected: {
    subDispositionRequired: false,
    followupAllowed: true,
    followupRequired: false,
  },
  'Not reachable': {
    subDispositionRequired: true,
    followupAllowed: true,
    followupRequired: true,
  },
  'Switched off': {
    subDispositionRequired: true,
    followupAllowed: true,
    followupRequired: true,
  },
  'Callback requested': {
    subDispositionRequired: true,
    followupAllowed: true,
    followupRequired: true,
  },
  Interested: {
    subDispositionRequired: true,
    followupAllowed: false,
    followupRequired: false,
  },
  'Not interested': {
    subDispositionRequired: true,
    followupAllowed: false,
    followupRequired: false,
  },
  'Wrong number': {
    subDispositionRequired: true,
    followupAllowed: false,
    followupRequired: false,
  },
  Duplicate: {
    subDispositionRequired: false,
    followupAllowed: false,
    followupRequired: false,
  },
  'Language issue': {
    subDispositionRequired: true,
    followupAllowed: true,
    followupRequired: true,
  },
};

async function getLeadOr404(res, leadId) {
  const lead = await leadModel.findById(leadId);
  if (!lead) {
    notFound(res, 'Lead not found');
    return null;
  }

  return lead;
}

async function getWorkspace(req, res) {
  const lead = await getLeadOr404(res, req.params.id);
  if (!lead) return null;

  const workspace = await telecallerModel.getWorkspace(lead);
  return success(res, workspace);
}

async function listCreditQueue(req, res) {
  const leads = await telecallerModel.listCreditQueue();
  return success(res, leads);
}

async function listCreditQueueV2(req, res) {
  const payload = await telecallerModel.listCreditQueueV2(req.query);
  return success(res, payload);
}

async function listCreditApplications(req, res) {
  const leads = await telecallerModel.listCreditApplications(req.query);
  return success(res, leads);
}

async function listCreditApplicationsV2(req, res) {
  const payload = await telecallerModel.listCreditApplicationsV2(req.query);
  return success(res, payload);
}

function isSupportUser(user) {
  if (!user) return false;
  const email = String(user.email || '').toLowerCase();
  const name = String(user.name || '').toLowerCase();
  return email.startsWith('support@') || email.includes('support') || name.includes('support') ||
         email.startsWith('test.') || email.includes('test');
}

async function listTelecallerWorkbench(req, res) {
  const isSupport = isSupportUser(req.user);
  let leads = await telecallerModel.listTelecallerWorkbench({ isSupportUser: isSupport });
  if (req.user && req.user.role === 'telecaller' && !isSupport) {
    leads = leads.filter((lead) => telecallerModel.isLeadAssignedToTelecaller(lead.assignedTo, req.user));
  }
  return success(res, leads);
}

async function listTelecallerWorkbenchV2(req, res) {
  const query = { ...req.query };
  const isSupport = isSupportUser(req.user);
  query.isSupportUser = isSupport;
  if (req.user && req.user.role === 'telecaller' && !isSupport) {
    query.telecallerUser = req.user.name;
    query.telecallerEmail = req.user.email;
  }
  const payload = await telecallerModel.listTelecallerWorkbenchV2(query);
  return success(res, payload);
}



async function getTelecallerPolicy(req, res) {
  const teamMembers = (await listPublicUsers())
    .filter((user) => user.role === 'telecaller')
    .map((user) => ({
      email: user.email,
      name: user.name,
      role: user.role,
    }));
  return success(res, telecallerModel.getTelecallerPolicy(teamMembers));
}

async function getTelecallerSlaReport(req, res) {
  const report = await telecallerModel.getTelecallerSlaReport(req.query);
  return success(res, report);
}

async function listAccountingQueue(req, res) {
  const leads = await telecallerModel.listAccountingQueue();
  return success(res, leads);
}

async function listAccountingQueueV2(req, res) {
  const payload = await telecallerModel.listAccountingQueueV2(req.query);
  return success(res, payload);
}

async function listRecentAccountingPayments(req, res) {
  if (req.query.page || req.query.pageSize) {
    const payload = await telecallerModel.listRecentAccountingPaymentsV2(req.query);
    return success(res, payload);
  }

  const payments = await telecallerModel.listRecentAccountingPayments(req.query.limit);
  return success(res, payments);
}

function verifyLeadAssignedToTelecaller(req, lead) {
  if (!req.user || req.user.role !== 'telecaller' || isSupportUser(req.user)) return;
  const assignedTo = String(lead?.assignedTo || '').trim();
  if (!assignedTo) return;

  const assignedLower = assignedTo.toLowerCase();
  if (['unassigned', 'intake queue', 'none', '', 'null', 'undefined', 'credit manager', 'credit-manager'].includes(assignedLower) || assignedLower.includes('shruti')) {
    return;
  }

  const isAssigned = telecallerModel.isLeadAssignedToTelecaller(assignedTo, req.user);
  if (!isAssigned) {
    const error = new Error(`This lead is assigned to ${assignedTo}. You cannot perform actions on leads assigned to another telecaller.`);
    error.statusCode = 403;
    error.publicMessage = `This lead is assigned to ${assignedTo}. You cannot perform actions on leads assigned to another telecaller.`;
    throw error;
  }
}

async function createCallLog(req, res) {
  requireFields(req.body || {}, ['disposition']);
  const lead = await getLeadOr404(res, req.params.id);
  if (!lead) return null;
  verifyLeadAssignedToTelecaller(req, lead);

  const payload = normalizeCallLogPayload(req.body || {});
  const callLog = await telecallerModel.createCallLog(lead, payload);
  let updatedLead = lead;
  if (lead.status === 'New') {
    updatedLead = await leadModel.updateOperations(req.params.id, { status: 'Contacted' }) || lead;
    await leadStatusModel.recordStatusChange(updatedLead, lead, {
      source: 'call',
      actor: payload.user || payload.actor || 'CRM User',
      actorRole: req.user?.role || 'telecaller',
      sourceKey: `telecaller-call:${callLog.id}`,
      metadata: {
        callLogId: callLog.id,
        disposition: callLog.disposition,
      },
    });
  }
  await activityModel.createForLead(lead, {
    type: 'call',
    description: `Call marked as ${callLog.disposition}${callLog.nextFollowupAt ? `; follow-up due ${callLog.nextFollowupAt}` : ''}`,
    user: payload.user || payload.actor || 'CRM User',
    metadata: {
      callLogId: callLog.id,
      disposition: callLog.disposition,
      nextFollowupAt: callLog.nextFollowupAt,
      notes: callLog.notes,
    },
  });
  await auditModel.create(req, {
    action: callLog.nextFollowupAt ? 'lead.followup_set' : 'lead.call_log',
    entityType: 'lead_call_log',
    entityId: String(callLog.id),
    lead,
    metadata: {
      disposition: callLog.disposition,
      nextFollowupAt: callLog.nextFollowupAt,
      notes: callLog.notes,
    },
  });

  return success(res, callLog, 'Call log saved successfully.', 201);
}

function publicValidationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.publicMessage = message;
  return error;
}

function normalizeCallLogPayload(body) {
  const disposition = String(body.disposition || '').trim();
  const rules = CALL_OUTCOME_RULES[disposition];
  if (!rules) {
    throw publicValidationError('Select a valid call disposition.');
  }

  const nextFollowupAt = String(body.nextFollowupAt || '').trim();
  const subDisposition = String(body.subDisposition || '').trim();

  if (rules.subDispositionRequired && !subDisposition) {
    throw publicValidationError('Sub-disposition is required for this call outcome.');
  }

  if (!rules.followupAllowed && nextFollowupAt) {
    throw publicValidationError(`${disposition} does not require a next follow-up. Save the call without follow-up scheduling.`);
  }

  if (rules.followupRequired && !nextFollowupAt) {
    throw publicValidationError('Next follow-up is required for this call outcome.');
  }

  if (nextFollowupAt) {
    const followupDate = new Date(nextFollowupAt);
    if (Number.isNaN(followupDate.getTime()) || followupDate.getTime() <= Date.now()) {
      throw publicValidationError('Next follow-up must be a future date and time.');
    }
  }

  return {
    ...body,
    callDurationSeconds: Number(body.callDurationSeconds || 0),
    disposition,
    followupReason: rules.followupAllowed ? String(body.followupReason || disposition).trim() : '',
    nextFollowupAt: rules.followupAllowed ? nextFollowupAt : '',
    subDisposition,
  };
}

async function updateDocumentCheck(req, res) {
  requireFields(req.body || {}, ['key', 'status']);
  const lead = await getLeadOr404(res, req.params.id);
  if (!lead) return null;
  verifyLeadAssignedToTelecaller(req, lead);

  const check = await telecallerModel.updateDocumentCheck(lead, req.body || {});
  if (check.status === 'verified') {
    const workspace = await telecallerModel.getWorkspace(lead);
    const allRequiredVerified = workspace.documentChecks.length > 0 &&
      workspace.documentChecks.every((item) => item.status === 'verified');
    if (allRequiredVerified) {
      await leadStatusModel.createForLead(lead, {
        source: 'document_verification',
        actor: req.body.user || req.body.actor || req.user?.name || 'CRM User',
        actorRole: req.user?.role || 'telecaller',
        sourceKey: `documents-verified:${lead.rawId || lead.id}`,
        stageKey: 'documents_verified',
        publicStatus: 'Documents verified',
        title: 'Documents verified',
        description: 'Your submitted documents have been verified and the application is ready for credit review.',
        metadata: {
          documentCheckId: check.id,
          verifiedDocumentCount: workspace.documentChecks.length,
        },
      });
    }
  }
  await activityModel.createForLead(lead, {
    type: 'document',
    description: `Document check updated: ${check.label} is ${check.status}`,
    user: req.body.user || req.body.actor || 'CRM User',
    metadata: {
      documentKey: check.key,
      status: check.status,
      remark: check.remark,
    },
  });
  await auditModel.create(req, {
    action: check.status === 'verified'
      ? 'lead.document_verify'
      : check.status === 'rejected'
        ? 'lead.document_reject'
        : 'lead.document_status_update',
    entityType: 'lead_document_check',
    entityId: String(check.id),
    lead,
    metadata: {
      documentKey: check.key,
      remark: check.remark,
      status: check.status,
    },
  });

  return success(res, check, 'Document check updated successfully.');
}

async function createCreditHandoff(req, res) {
  const lead = await getLeadOr404(res, req.params.id);
  if (!lead) return null;
  verifyLeadAssignedToTelecaller(req, lead);

  const workspace = await telecallerModel.getWorkspace(lead);
  if (workspace.latestHandoff?.status === 'ready') {
    const error = new Error('This lead is already waiting in the credit manager queue.');
    error.statusCode = 409;
    error.publicMessage = error.message;
    throw error;
  }

  const handoff = await telecallerModel.createCreditHandoff(lead, {
    ...(req.body || {}),
    actor: req.user?.name || req.body?.actor || 'CRM User',
    user: req.user?.name || req.body?.user || 'CRM User',
  });

  const updatedLead = await leadModel.updateOperations(req.params.id, {
    status: 'Document Collection',
    assignedTo: 'Credit Manager',
  });
  await leadStatusModel.recordStatusChange(updatedLead || lead, lead, {
    source: 'credit_handoff',
    actor: req.body.user || req.body.actor || 'CRM User',
    actorRole: req.user?.role || 'telecaller',
    sourceKey: `credit-handoff:${handoff.id}`,
    metadata: {
      handoffId: handoff.id,
      status: handoff.status,
      notes: handoff.notes,
    },
  });
  await activityModel.createForLead(lead, {
    type: 'status',
    description: 'Lead marked ready for credit manager review',
    user: req.body.user || req.body.actor || 'CRM User',
    metadata: {
      handoffId: handoff.id,
      status: handoff.status,
      notes: handoff.notes,
      checklistSnapshot: handoff.checklistSnapshot,
    },
  });
  await auditModel.create(req, {
    action: 'lead.credit_handoff',
    entityType: 'lead_credit_handoff',
    entityId: String(handoff.id),
    lead: updatedLead || lead,
    metadata: {
      notes: handoff.notes,
      status: handoff.status,
    },
  });

  return success(res, { handoff, lead: updatedLead || lead }, 'Lead sent to credit manager queue.', 201);
}

function assertPublicError(condition, message) {
  if (condition) return;

  const error = new Error(message);
  error.statusCode = 400;
  error.publicMessage = message;
  throw error;
}

async function validateCreditApprovalPayload(lead, body = {}) {
  const sanction = body.sanction || {};
  assertPublicError(sanction, 'Sanction details are required before approving a loan.');
  assertPublicError(String(sanction.borrowerEmail || lead.email || '').trim(), 'Customer email is required before sending sanction letter.');
  assertPublicError(String(sanction.agreementNumber || '').trim(), 'Loan agreement number is required.');
  assertPublicError(Number(sanction.principalAmount || 0) > 0, 'Principal loan amount must be greater than zero.');
  assertPublicError(Number(sanction.repaymentAmount || 0) > 0, 'Repayment amount must be greater than zero.');
  assertPublicError(Number(sanction.disbursedAmount || 0) >= 0, 'Amount to be disbursed cannot be negative.');
  assertPublicError(sanction.agreementDate && sanction.disbursementDate && sanction.dueDate, 'Agreement, disbursement, and due dates are required.');
  assertPublicError(String(sanction.bankName || lead.bankName || '').trim(), 'Registered bank name is required for sanction.');
  assertPublicError(String(sanction.accountNumber || lead.accountNumber || '').trim(), 'Registered account number is required for sanction.');
  assertPublicError(String(sanction.ifscCode || lead.ifscCode || '').trim(), 'Registered IFSC code is required for sanction.');

  const existingSanction = await sanctionModel.findByAgreementNumber(sanction.agreementNumber);
  const reusableFailedSanction = existingSanction &&
    existingSanction.emailStatus === 'failed' &&
    (existingSanction.leadId === (lead.rawId || '') || existingSanction.applicationId === (lead.id || ''));
  assertPublicError(!existingSanction || reusableFailedSanction, 'Loan agreement number already exists. Use a new agreement number for this sanction.');

  if (body.cam) {
    const camApprovedAmount = Number(body.cam.approvedAmount || 0);
    assertPublicError(camApprovedAmount > 0, 'CAM approved amount must be greater than zero.');
  }
}

function toMoney(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) / 100 : fallback;
}

function normalizeCreditApprovalPayload(body = {}) {
  const sanction = { ...(body.sanction || {}) };
  const cam = { ...(body.cam || {}) };
  const principalAmount = toMoney(sanction.principalAmount || cam.approvedAmount || body.approvedAmount);
  const tenureDays = Number(sanction.tenureDays || cam.loanTermDays || 30);
  const interestRate = toMoney(sanction.interestRate || cam.interestRate || 0);
  const processingFee = toMoney(sanction.processingFee);
  const gstAmount = toMoney(sanction.gstAmount || processingFee * 0.18);
  const repaymentAmount = toMoney(
    sanction.repaymentAmount ||
    principalAmount + Math.round((principalAmount * interestRate * tenureDays) / 100),
  );
  const disbursedAmount = toMoney(
    sanction.disbursedAmount === undefined
      ? Math.max(0, principalAmount - processingFee - gstAmount)
      : sanction.disbursedAmount,
  );
  const processingFeeRate = principalAmount > 0
    ? toMoney((processingFee / principalAmount) * 100)
    : toMoney(cam.processingFeeRate);

  return {
    ...body,
    approvedAmount: principalAmount,
    cam: body.cam ? {
      ...cam,
      approvedAmount: principalAmount,
      interestRate,
      loanTermDays: tenureDays,
      processingFeeRate,
      totalRepayment: repaymentAmount,
      snapshot: {
        ...(cam.snapshot || {}),
        finalSanction: {
          disbursedAmount,
          gstAmount,
          principalAmount,
          processingFee,
          repaymentAmount,
          tenureDays,
        },
      },
    } : body.cam,
    sanction: {
      ...sanction,
      disbursedAmount,
      gstAmount,
      interestRate,
      interestRateLabel: sanction.interestRateLabel || `${interestRate.toFixed(2)} % - Per Day`,
      principalAmount,
      processingFee,
      repaymentAmount,
      tenureDays,
    },
  };
}

async function reviewCreditDecision(req, res) {
  requireFields(req.body || {}, ['decision']);
  const lead = await getLeadOr404(res, req.params.id);
  if (!lead) return null;

  const decision = req.body.decision === 'approved' ? 'approved' : 'rejected';
  const latestHandoff = await telecallerModel.findLatestCreditHandoff(lead);
  if (!latestHandoff || latestHandoff.status !== 'ready') {
    const error = new Error('Lead is not in credit manager queue. Telecaller handoff is required before credit decision.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  const requestBody = decision === 'approved'
    ? normalizeCreditApprovalPayload(req.body || {})
    : (req.body || {});

  if (decision === 'approved') await validateCreditApprovalPayload(lead, requestBody);
  if (decision === 'rejected' && !String(req.body.notes || '').trim()) {
    const error = new Error('Reject reason is required.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }
  let updatedLead = lead;
  const camSheet = requestBody.cam
    ? await camSheetModel.createForLead(lead, requestBody.cam, {
      status: decision,
      user: requestBody.user || requestBody.actor || 'Credit Manager',
    })
    : null;
  const shouldCreateDummyEsign = decision === 'approved' && config.esign.provider !== 'digio';
  const esign = shouldCreateDummyEsign
    ? await esignModel.createForLead(lead, {
      camSheetId: camSheet?.id || null,
      approvedAmount: requestBody.approvedAmount || requestBody.cam?.approvedAmount || 0,
      user: requestBody.user || requestBody.actor || 'Credit Manager',
    })
    : null;
  let sanction = null;
  let sanctionWhatsapp = null;
  if (decision === 'approved') {
    sanction = await sanctionModel.findReusableFailedByAgreementNumber(lead, requestBody.sanction?.agreementNumber);
    if (!sanction) {
      sanction = await sanctionModel.createForLead(lead, {
        ...requestBody.sanction,
        camSheetId: camSheet?.id || requestBody.sanction?.camSheetId || null,
        user: requestBody.user || requestBody.actor || 'Credit Manager',
      });
    } else {
      sanction = await sanctionModel.updateFailedSanction(sanction.id, {
        ...requestBody.sanction,
        camSheetId: camSheet?.id || requestBody.sanction?.camSheetId || null,
        user: requestBody.user || requestBody.actor || 'Credit Manager',
      });
    }

    const updatedEmail = requestBody.sanction?.borrowerEmail || requestBody.sanction?.emailTo;
    const updatedPhone = requestBody.sanction?.borrowerPhone;
    if (updatedEmail || updatedPhone) {
      await leadModel.updateContactInfo(lead.id, { email: updatedEmail, phone: updatedPhone });
    }
    const pdf = await sanctionLetterService.generateSanctionPdf(sanction);
    try {
      await sanctionLetterService.emailSanctionLetter({ ...sanction, pdfPath: pdf.relativePath, sourceSystem: lead.sourceSystem || lead.source }, pdf.absolutePath);
      sanctionWhatsapp = await authkeyWhatsAppService.sendSanctionLetter({
        amount: sanction.principalAmount,
        customerName: sanction.borrower || lead.name,
        filename: `${sanction.agreementNumber || 'sanction-letter'}.pdf`,
        pdfUrl: buildPublicFileUrl(req, pdf.relativePath),
        phone: sanction.borrowerPhone || lead.phone,
      });
      if (!sanctionWhatsapp.sent) {
        console.warn('Sanction letter WhatsApp was not sent:', {
          agreementNumber: sanction.agreementNumber,
          attempted: sanctionWhatsapp.attempted,
          error: sanctionWhatsapp.error,
          phonePresent: Boolean(sanction.borrowerPhone || lead.phone),
        });
      }
      sanction = await sanctionModel.updateWhatsappDelivery(sanction.id, sanctionWhatsapp);
      sanction = await sanctionModel.updateDelivery(sanction.id, {
        pdfPath: pdf.relativePath,
        emailStatus: 'sent',
        emailError: '',
      });
    } catch (emailError) {
      sanction = await sanctionModel.updateDelivery(sanction.id, {
        pdfPath: pdf.relativePath,
        emailStatus: 'failed',
        emailError: emailError.message || 'Unable to send sanction email',
      });
      const error = new Error(`Sanction email failed: ${sanction.emailError}`);
      error.statusCode = 502;
      error.publicMessage = error.message;
      throw error;
    }
  }

  const handoff = await telecallerModel.reviewLatestCreditHandoff(lead, {
    ...requestBody,
    decision,
  });
  const nextStatus = decision === 'approved' ? 'Qualified' : 'Lost';
  updatedLead = await leadModel.updateOperations(req.params.id, {
    status: nextStatus,
    assignedTo: decision === 'approved' ? 'Accountant' : lead.assignedTo,
  });
  await leadStatusModel.recordStatusChange(updatedLead || lead, lead, {
    source: 'credit_decision',
    actor: req.body.user || req.body.actor || 'Credit Manager',
    actorRole: req.user?.role || 'credit-manager',
    sourceKey: `credit-decision:${handoff.id}:${decision}`,
    publicStatus: decision === 'approved' ? 'Loan approved' : 'Application closed',
    title: decision === 'approved' ? 'Loan approved' : 'Application closed',
    description: decision === 'approved'
      ? 'Your loan has been approved and the sanction letter has been sent for review.'
      : 'Your application could not be approved at this stage.',
    metadata: {
      decision,
      notes: req.body.notes || '',
      handoffId: handoff.id,
      camSheetId: camSheet?.id || null,
      sanctionId: sanction?.id || null,
      sanctionEmailStatus: sanction?.emailStatus || '',
      sanctionWhatsapp,
    },
  });

  await activityModel.createForLead(updatedLead || lead, {
    type: 'status',
    description: decision === 'approved'
      ? 'Credit manager approved lead, sent sanction letter, and moved it to accountant queue'
      : 'Credit manager rejected lead',
    user: req.body.user || req.body.actor || 'Credit Manager',
    metadata: {
      decision,
      notes: req.body.notes || '',
      handoffId: handoff.id,
      camSheetId: camSheet?.id || null,
      esignRequestId: esign?.id || null,
      sanctionId: sanction?.id || null,
      sanctionEmailStatus: sanction?.emailStatus || '',
      sanctionWhatsapp,
    },
  });
  await auditModel.create(req, {
    action: decision === 'approved' ? 'lead.credit_approve' : 'lead.credit_reject',
    entityType: 'lead_credit_handoff',
    entityId: String(handoff.id),
    lead: updatedLead || lead,
    metadata: {
      decision,
      notes: req.body.notes || '',
      camSheetId: camSheet?.id || null,
      esignRequestId: esign?.id || null,
      sanctionId: sanction?.id || null,
      sanctionEmailStatus: sanction?.emailStatus || '',
      sanctionWhatsapp,
    },
  });

  return success(res, { handoff, lead: updatedLead || lead, camSheet, esign, sanction, sanctionWhatsapp }, `Lead ${decision} by credit manager.`);
}

async function createAccountingPayment(req, res) {
  const lead = await getLeadOr404(res, req.params.id);
  if (!lead) return null;

  requireFields(req.body || {}, ['transferType', 'transactionId']);
  const transferType = String(req.body.transferType || '').trim().toUpperCase();
  if (!['IMPS', 'NEFT', 'UPI'].includes(transferType)) {
    const error = new Error('Transfer type must be IMPS, NEFT, or UPI.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  const transactionId = String(req.body.transactionId || '').trim();
  if (!/^[a-z0-9][a-z0-9./_-]{4,119}$/i.test(transactionId)) {
    const error = new Error('Enter a valid UTR / transaction ID.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  const signedLoanAgreement = await loanAgreementModel.findSignedByLead(lead);
  const signedEsign = signedLoanAgreement ? null : await esignModel.findSignedByLead(lead);
  if (!signedLoanAgreement && !signedEsign) {
    const error = new Error('Customer loan agreement eSign must be completed before payment disbursement.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  if (await telecallerModel.hasAccountingPayment(lead)) {
    const error = new Error('Fund transfer has already been submitted for this lead.');
    error.statusCode = 409;
    error.publicMessage = error.message;
    throw error;
  }

  if (await telecallerModel.findPaymentByTransactionId(transactionId)) {
    const error = new Error('This UTR / transaction ID has already been used.');
    error.statusCode = 409;
    error.publicMessage = error.message;
    throw error;
  }

  const sanction = await sanctionModel.findLatestByLead(lead);
  if (!sanction) {
    const error = new Error('Sanction details are required before fund transfer.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  const loanId = req.body.loanId || signedLoanAgreement?.agreementNumber || sanction.agreementNumber;
  const disbursementDate = req.body.disbursementDate ? String(req.body.disbursementDate).trim().slice(0, 10) : null;
  const dueDate = req.body.dueDate ? String(req.body.dueDate).trim().slice(0, 10) : null;
  const tenureDays = req.body.tenureDays ? Number(req.body.tenureDays) : null;
  const activeLoan = await telecallerModel.activateLoanForDisbursement(lead, sanction, {
    loanId,
    disbursementDate,
    dueDate,
    tenureDays,
  });
  const payment = await telecallerModel.createAccountingPayment(lead, {
    ...req.body,
    amount: sanction.disbursedAmount,
    agreementNumber: sanction.agreementNumber,
    loanId: activeLoan?.id || loanId,
    method: transferType,
    reference: transactionId,
    transactionId,
    transferType,
    disbursementDate,
    accountNumber: sanction.accountNumber || lead.accountNumber,
    bankName: sanction.bankName || lead.bankName,
    ifscCode: sanction.ifscCode || lead.ifscCode,
  });
  const updatedLead = await leadModel.updateOperations(req.params.id, {
    status: 'Converted',
    assignedTo: req.body.assignedTo || 'Accountant',
  });
  await leadStatusModel.recordStatusChange(updatedLead || lead, lead, {
    source: 'accounting_payment',
    actor: req.body.user || req.body.actor || 'Accountant',
    actorRole: req.user?.role || 'accountant',
    sourceKey: `accounting-payment:${payment.id}`,
    publicStatus: 'Loan disbursed',
    title: 'Loan disbursed',
    description: 'Your loan amount has been disbursed and the repayment schedule is now active.',
    metadata: {
      paymentId: payment.id,
      amount: payment.amount,
      loanId: payment.loanId || activeLoan?.id || '',
      transferType,
      transactionId,
      disbursementDate: disbursementDate || activeLoan?.start_date || payment.disbursedAt || null,
    },
  });

  await activityModel.createForLead(updatedLead || lead, {
    type: 'payment',
    description: `Accountant marked payment complete for ${payment.amount}`,
    user: req.body.user || req.body.actor || 'Accountant',
    metadata: {
      paymentId: payment.id,
      amount: payment.amount,
      loanId: payment.loanId || activeLoan?.id || '',
      method: transferType,
      reference: transactionId,
      transferType,
      transactionId,
      disbursementDate: disbursementDate || activeLoan?.start_date || payment.disbursedAt || null,
      loanAgreementId: signedLoanAgreement?.id || null,
      fallbackEsignRequestId: signedEsign?.id || null,
      emiCycleStartedAt: payment.disbursedAt || activeLoan?.start_date || null,
    },
  });
  await auditModel.create(req, {
    action: 'lead.accounting_payment',
    entityType: 'lead_accounting_payment',
    entityId: String(payment.id),
    lead: updatedLead || lead,
    metadata: {
      amount: payment.amount,
      loanId: payment.loanId || activeLoan?.id || '',
      method: transferType,
      reference: transactionId,
      transferType,
      transactionId,
      disbursementDate: disbursementDate || activeLoan?.start_date || payment.disbursedAt || null,
      loanAgreementId: signedLoanAgreement?.id || null,
      fallbackEsignRequestId: signedEsign?.id || null,
      emiCycleStartedAt: payment.disbursedAt || activeLoan?.start_date || null,
    },
  });

  return success(res, {
    lead: updatedLead || lead,
    loan: activeLoan,
    payment,
    nextStep: {
      loanId: activeLoan?.id || payment.loanId || loanId,
      loanStatus: activeLoan?.status || 'Active',
      repaymentStatus: activeLoan?.payment_status || activeLoan?.paymentStatus || 'Pending',
      repaymentAmount: Number(activeLoan?.total_amount || activeLoan?.totalAmount || sanction.repaymentAmount || 0),
      dueDate: activeLoan?.due_date || activeLoan?.dueDate || sanction.dueDate || null,
      nextPaymentDate: activeLoan?.next_payment_date || activeLoan?.nextPaymentDate || sanction.dueDate || null,
      disbursementDate: activeLoan?.start_date || payment.disbursedAt || null,
    },
  }, 'Fund transfer submitted. Loan is active and repayment cycle has started.');
}

async function sendLeadToAccounting(req, res) {
  const lead = await getLeadOr404(res, req.params.id);
  if (!lead) return null;

  const sanction = await sanctionModel.findLatestByLead(lead);
  if (!sanction) {
    const error = new Error('Sanction details are required before sending this lead to accounts.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  const signedLoanAgreement = await loanAgreementModel.findSignedByLead(lead);
  const signedEsign = signedLoanAgreement ? null : await esignModel.findSignedByLead(lead);
  if (!signedLoanAgreement && !signedEsign) {
    const error = new Error('Customer loan agreement eSign must be completed before sending to accounts.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  const updatedLead = await leadModel.updateOperations(req.params.id, {
    status: 'Qualified',
    assignedTo: req.body.assignedTo || 'Accountant',
  });
  const actor = req.body.user || req.body.actor || req.user?.name || 'Credit Manager';
  const sourceKey = `accounting-handoff:${signedLoanAgreement?.id || signedEsign?.id || sanction.id}`;

  await leadStatusModel.recordStatusChange(updatedLead || lead, lead, {
    force: true,
    source: 'accounting_handoff',
    actor,
    actorRole: req.user?.role || 'credit-manager',
    sourceKey,
    stageKey: 'accounting_handoff',
    publicStatus: 'Ready for disbursement',
    title: 'Sent to accounts',
    description: 'Your signed agreement has been received and the loan is queued for disbursement.',
    metadata: {
      sanctionId: sanction.id,
      agreementNumber: sanction.agreementNumber,
      loanAgreementId: signedLoanAgreement?.id || null,
      fallbackEsignRequestId: signedEsign?.id || null,
      disbursementAmount: sanction.disbursedAmount,
      repaymentAmount: sanction.repaymentAmount,
    },
  });

  await activityModel.createForLead(updatedLead || lead, {
    type: 'status',
    description: 'Signed agreement verified and lead sent to accountant queue',
    user: actor,
    metadata: {
      sanctionId: sanction.id,
      agreementNumber: sanction.agreementNumber,
      loanAgreementId: signedLoanAgreement?.id || null,
      fallbackEsignRequestId: signedEsign?.id || null,
    },
  });
  await auditModel.create(req, {
    action: 'lead.accounting_handoff',
    entityType: signedLoanAgreement ? 'lead_loan_agreement' : 'lead_esign_request',
    entityId: String(signedLoanAgreement?.id || signedEsign?.id || sanction.id),
    lead: updatedLead || lead,
    metadata: {
      sanctionId: sanction.id,
      agreementNumber: sanction.agreementNumber,
      assignedTo: 'Accountant',
    },
  });

  return success(res, {
    fallbackEsign: signedEsign,
    lead: updatedLead || lead,
    loanAgreement: signedLoanAgreement,
    sanction,
  }, 'Lead sent to accountant queue.');
}

module.exports = {
  createCallLog,
  createAccountingPayment,
  createCreditHandoff,
  getWorkspace,
  getTelecallerPolicy,
  getTelecallerSlaReport,
  listAccountingQueue,
  listAccountingQueueV2,
  listRecentAccountingPayments,
  listCreditApplications,
  listCreditApplicationsV2,
  listCreditQueue,
  listCreditQueueV2,
  listTelecallerWorkbench,
  listTelecallerWorkbenchV2,
  reviewCreditDecision,
  sendLeadToAccounting,
  updateDocumentCheck,
};
