const activityModel = require('../models/activityModel');
const auditModel = require('../models/auditModel');
const leadModel = require('../models/leadModel');
const leadStatusModel = require('../models/leadStatusModel');
const telecallerModel = require('../models/telecallerModel');
const authkeyWhatsAppService = require('../services/authkeyWhatsAppService');
const { notFound, requireFields, success } = require('../utils/http');

function isSupportUser(user) {
  if (!user) return false;
  const email = String(user.email || '').toLowerCase();
  const name = String(user.name || '').toLowerCase();
  return email.startsWith('support@') || email.includes('support') || name.includes('support');
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

async function listLeads(req, res) {
  const query = { ...req.query };
  const isSearchOrDuplicate = Boolean(query.search || query.includeAllLeads === 'true' || query.duplicateLookup === 'true');
  if (req.user && req.user.role === 'telecaller' && !isSupportUser(req.user) && !isSearchOrDuplicate) {
    query.telecallerUser = req.user.name;
    query.telecallerEmail = req.user.email;
  }
  const leads = await leadModel.findAll(query);
  return res.status(200).json({
    success: true,
    data: leads,
    pagination: {
      page: leads.page || 1,
      limit: leads.limit || (leads.length || 50),
      total: leads.total !== undefined ? leads.total : leads.length,
      totalPages: leads.totalPages || 1,
    },
    message: 'OK',
  });
}

async function getLead(req, res) {
  const lead = await leadModel.findById(req.params.id);
  if (!lead) return notFound(res, 'Lead not found');

  const { query } = require('../config/db');

  // Fetch past loans history for this customer (by matching phone, email, PAN, or Aadhaar for full security)
  const clauses = [];
  const params = [];
  if (lead.phone) { clauses.push('la.mobile = ?'); params.push(lead.phone); }
  if (lead.email) { clauses.push('la.email = ?'); params.push(lead.email); }
  if (lead.panNumber) { clauses.push('la.pan_number = ?'); params.push(lead.panNumber); }
  if (lead.aadhaarNumber) { clauses.push('la.aadhaar_number = ?'); params.push(lead.aadhaarNumber); }
  if (lead.aadhaarUniqueId) { clauses.push('la.aadhaar_unique_id = ?'); params.push(lead.aadhaarUniqueId); }

  let pastLoans = [];
  if (clauses.length > 0) {
    pastLoans = await query(`
      SELECT DISTINCT
        l.id, l.principal, l.total_amount AS totalAmount, l.amount_paid AS amountPaid, l.balance,
        COALESCE((SELECT DATE(disbursed_at) FROM lead_accounting_payments WHERE loan_id = l.id ORDER BY id DESC LIMIT 1), l.start_date) AS startDate, l.due_date AS dueDate, l.status, l.payment_status AS paymentStatus,
        l.created_at
      FROM loans l
      JOIN loan_repayment_schedule sched ON l.id = sched.loan_id
      JOIN loan_applications la ON (la.application_id = sched.application_id OR la.id = sched.lead_id)
      WHERE ${clauses.join(' OR ')}
      ORDER BY l.created_at DESC
    `, params);
  }

  lead.pastLoans = pastLoans;

  await auditModel.create(req, {
    action: 'lead.view',
    entityType: 'lead',
    entityId: lead.id,
    lead,
  });
  return success(res, lead);
}

async function createLead(req, res) {
  requireFields(req.body || {}, ['name', 'phone', 'loanAmount']);
  const lead = await leadModel.create(req.body);
  await activityModel.createForLead(lead, {
    type: 'status',
    description: `Lead created with status ${lead.status}`,
    user: 'System',
    sourceKey: `lead-created:${lead.rawId}`,
    metadata: {
      status: lead.status,
      loanAmount: lead.loanAmount,
    },
  });
  await leadStatusModel.createForLead(lead, {
    source: 'manual',
    actor: 'System',
    sourceKey: `lead-status-created:${lead.rawId}`,
    metadata: {
      loanAmount: lead.loanAmount,
      status: lead.status,
    },
  });
  await auditModel.create(req, {
    action: 'lead.create',
    entityType: 'lead',
    entityId: lead.id,
    lead,
    metadata: {
      loanAmount: lead.loanAmount,
      status: lead.status,
    },
  });
  return success(res, lead, 'Lead created successfully', 201);
}

async function updateLeadStatus(req, res) {
  requireFields(req.body || {}, ['status']);
  const previousLead = await leadModel.findById(req.params.id);
  if (!previousLead) return notFound(res, 'Lead not found');
  verifyLeadAssignedToTelecaller(req, previousLead);

  const lead = await leadModel.updateStatus(req.params.id, req.body.status);
  if (!lead) return notFound(res, 'Lead not found');
  await activityModel.createForLead(lead, {
    type: 'status',
    description: `Lead status changed from ${previousLead?.status || 'Unknown'} to ${lead.status}`,
    user: req.body.user || 'CRM User',
    metadata: {
      from: previousLead?.status || null,
      to: lead.status,
    },
  });
  await leadStatusModel.recordStatusChange(lead, previousLead, {
    source: 'crm',
    actor: req.body.user || 'CRM User',
    actorRole: req.user?.role || '',
  });
  await auditModel.create(req, {
    action: 'lead.status_update',
    entityType: 'lead',
    entityId: lead.id,
    lead,
    metadata: {
      from: previousLead?.status || null,
      to: lead.status,
    },
  });
  return success(res, lead, 'Lead status updated successfully');
}

function operationChanges(previousLead, lead) {
  const changes = [];

  if (previousLead?.status !== lead.status) {
    changes.push(`status from ${previousLead?.status || 'Unknown'} to ${lead.status}`);
  }

  if (previousLead?.priority !== lead.priority) {
    changes.push(`priority from ${previousLead?.priority || 'Unknown'} to ${lead.priority}`);
  }

  if (previousLead?.assignedTo !== lead.assignedTo) {
    changes.push(`assigned to from ${previousLead?.assignedTo || 'Unassigned'} to ${lead.assignedTo}`);
  }

  return changes;
}

async function updateLeadOperations(req, res) {
  const body = req.body || {};
  if (body.status === undefined && body.priority === undefined && body.assignedTo === undefined) {
    const error = new Error('Provide status, priority, or assignedTo to update lead operations.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  const previousLead = await leadModel.findById(req.params.id);
  if (!previousLead) return notFound(res, 'Lead not found');
  verifyLeadAssignedToTelecaller(req, previousLead);

  const lead = await leadModel.updateOperations(req.params.id, body);
  if (!lead) return notFound(res, 'Lead not found');

  const changes = operationChanges(previousLead, lead);
  if (changes.length) {
    await activityModel.createForLead(lead, {
      type: 'status',
      description: `Telecaller updated ${changes.join(', ')}`,
      user: body.user || 'CRM User',
      metadata: {
        assignedTo: {
          from: previousLead?.assignedTo || null,
          to: lead.assignedTo,
        },
        priority: {
          from: previousLead?.priority || null,
          to: lead.priority,
        },
        status: {
          from: previousLead?.status || null,
          to: lead.status,
        },
      },
    });
  }

  await leadStatusModel.recordStatusChange(lead, previousLead, {
    source: 'crm',
    actor: body.user || 'CRM User',
    actorRole: req.user?.role || '',
    metadata: {
      changes,
      assignedTo: {
        from: previousLead?.assignedTo || null,
        to: lead.assignedTo,
      },
      priority: {
        from: previousLead?.priority || null,
        to: lead.priority,
      },
    },
  });

  await auditModel.create(req, {
    action: 'lead.operations_update',
    entityType: 'lead',
    entityId: lead.id,
    lead,
    metadata: {
      changes,
      assignedTo: {
        from: previousLead?.assignedTo || null,
        to: lead.assignedTo,
      },
      priority: {
        from: previousLead?.priority || null,
        to: lead.priority,
      },
      status: {
        from: previousLead?.status || null,
        to: lead.status,
      },
    },
  });

  return success(res, lead, 'Lead operations updated successfully');
}

async function rejectLeadByTelecaller(req, res) {
  const body = req.body || {};
  const reason = String(body.reason || '').trim();
  if (!reason) {
    const error = new Error('Rejection reason is required.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  const previousLead = await leadModel.findById(req.params.id);
  if (!previousLead) return notFound(res, 'Lead not found');
  verifyLeadAssignedToTelecaller(req, previousLead);

  if (['Qualified', 'Converted'].includes(previousLead.status)) {
    const error = new Error('Qualified or converted leads cannot be rejected by telecaller.');
    error.statusCode = 409;
    error.publicMessage = error.message;
    throw error;
  }

  const lead = await leadModel.updateOperations(req.params.id, {
    status: 'Lost',
    assignedTo: previousLead.assignedTo || '',
  });
  if (!lead) return notFound(res, 'Lead not found');

  const actor = body.user || req.user?.name || 'Telecaller';
  await activityModel.createForLead(lead, {
    type: 'status',
    description: `Telecaller rejected loan. Reason: ${reason}`,
    user: actor,
    metadata: {
      reason,
      from: previousLead.status,
      to: lead.status,
    },
  });

  await leadStatusModel.recordStatusChange(lead, previousLead, {
    source: 'telecaller_rejection',
    actor,
    actorRole: req.user?.role || 'telecaller',
    metadata: {
      reason,
      from: previousLead.status,
      to: lead.status,
    },
  });

  const whatsapp = await authkeyWhatsAppService.sendLoanRejectionMessage({
    customerName: lead.name,
    phone: lead.phone,
  });

  await auditModel.create(req, {
    action: 'lead.telecaller_reject',
    entityType: 'lead',
    entityId: lead.id,
    lead,
    metadata: {
      reason,
      whatsapp,
      from: previousLead.status,
      to: lead.status,
    },
  });

  return success(res, { lead, whatsapp }, 'Lead rejected by telecaller.');
}

async function deleteLead(req, res) {
  const result = await leadModel.removeCascade(req.params.id);
  if (!result) return notFound(res, 'Lead not found');

  await auditModel.create(req, {
    action: 'lead.delete',
    entityType: 'lead',
    entityId: result.lead.id,
    lead: result.lead,
    metadata: {
      counts: result.counts,
      removedFiles: result.removedFiles,
    },
  });

  return success(res, {
    counts: result.counts,
    id: result.lead.id,
    removedFiles: result.removedFiles,
  }, 'Lead and related records deleted successfully.');
}

async function initiateReloan(req, res) {
  const lead = await leadModel.findById(req.params.id);
  if (!lead) return notFound(res, 'Lead not found');

  const { query } = require('../config/db');
  const { generateApplicationId } = require('../utils/strings');

  // Verify status is Closed or check if loan is Paid Off
  if (String(lead.status).toLowerCase() !== 'closed') {
    const [paidLoan] = await query(`
      SELECT l.id FROM loans l
      JOIN customers c ON l.customer_id = c.id
      WHERE (c.phone = ? OR c.email = ?) AND (l.status IN ('Paid Off', 'Closed') OR l.balance <= 0)
      ORDER BY l.id DESC LIMIT 1
    `, [lead.phone, lead.email]);

    if (paidLoan) {
      // Auto heal lead status to closed
      await query(`UPDATE loan_applications SET status = 'closed', is_active_application = 0 WHERE id = ? OR application_id = ?`, [lead.rawId || lead.id, lead.id]);
      lead.status = 'closed';
    } else {
      return res.status(400).json({
        success: false,
        message: `Only a Closed lead can be reloaned. Current status is: ${lead.status}`
      });
    }
  }

  // Find customer linked to this lead (by mobile or email)
  const [customer] = await query('SELECT * FROM customers WHERE phone = ? OR email = ? LIMIT 1', [lead.phone, lead.email]);
  if (customer) {
    // Check if customer has active loans
    const activeLoansList = await query(`
      SELECT id FROM loans
      WHERE customer_id = ? AND status NOT IN ('Paid Off', 'Closed') AND balance > 0
      ORDER BY id DESC LIMIT 1
    `, [customer.id]);

    if (activeLoansList && activeLoansList.length > 0) {
      const activeLoanId = activeLoansList[0]?.id || 'Active';
      return res.status(409).json({
        success: false,
        message: `This customer currently has an active loan (Loan ID: ${activeLoanId}). They cannot apply for a reloan until it is fully paid.`
      });
    }
  }

  // Check if they already have an active application in the funnel (other than this closed one)
  const activeApplication = await leadModel.findActiveApplication({ phone: lead.phone, email: lead.email });
  if (activeApplication && activeApplication.id !== lead.id) {
    return res.status(409).json({
      success: false,
      message: `This customer already has an active application in the funnel (Lead ID: ${activeApplication.id}).`
    });
  }

  // Find their last closed loan ID
  let previousLoanId = null;
  if (customer) {
    const [lastLoanRow] = await query(`
      SELECT id FROM loans
      WHERE customer_id = ?
      ORDER BY created_at DESC LIMIT 1
    `, [customer.id]);
    previousLoanId = lastLoanRow ? lastLoanRow.id : null;
  }

  // Generate new applicationId
  const newApplicationId = await generateApplicationId(lead.sourceSystem || '');

  // Insert the new lead
  // We copy all fields, set is_reloan = 1, previous_loan_id = previousLoanId
  // status is set to 'review' (Document Collection) and assigned_to is 'Credit Manager'
  const actor = req.user?.name || 'CRM User';
  const actorRole = req.user?.role || 'credit-manager';

  await query(`
    INSERT INTO loan_applications (
      application_id, loan_type, full_name, mobile, email, dob, pan_number, uan_number,
      aadhaar_number, aadhaar_unique_id, aadhaar_masked, employment_status, monthly_income,
      income_received_in, city, pincode, loan_amount, loan_purpose, company_name, designation,
      office_email, office_address, reference1_name, reference1_mobile, reference1_relation,
      reference2_name, reference2_mobile, reference2_relation, bank_name, branch_name,
      account_holder, account_number, ifsc_code, priority, assigned_to, status,
      is_active_application, is_reloan, previous_loan_id, cibil_report_url, company_id_card,
      selfie_image, video_kyc
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Medium', 'Credit Manager', 'review', 1, 1, ?, ?, ?, ?, ?)
  `, [
    newApplicationId,
    lead.loanType || 'payday',
    lead.name,
    lead.phone,
    lead.email,
    lead.dateOfBirth ? lead.dateOfBirth.slice(0, 10) : null,
    lead.panNumber,
    lead.uanNumber,
    lead.aadhaarNumber,
    lead.aadhaarUniqueId,
    lead.aadhaarMasked,
    lead.employmentStatus,
    lead.monthlyIncome,
    lead.incomeReceivedIn || 'account',
    lead.city,
    lead.pincode,
    lead.loanAmount,
    lead.loanPurpose,
    lead.companyName,
    lead.designation,
    lead.officeEmail,
    lead.officeAddress,
    lead.reference1Name,
    lead.reference1Mobile,
    lead.reference1Relation,
    lead.reference2Name,
    lead.reference2Mobile,
    lead.reference2Relation,
    lead.bankName,
    lead.branchName,
    lead.accountHolder,
    lead.accountNumber,
    lead.ifscCode,
    previousLoanId,
    lead.cibilReportUrl || null,
    lead.companyIdCard || null,
    lead.selfieImage || null,
    lead.videoKyc || null
  ]);

  const newLead = await leadModel.findById(newApplicationId);
  if (!newLead) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve newly created reloan lead.' });
  }

  // Create credit handoff record in lead_credit_handoffs with status = 'ready'
  await query(`
    INSERT INTO lead_credit_handoffs (
      lead_id, application_id, status, notes, submitted_by
    ) VALUES (?, ?, 'ready', 'Auto-initiated Reloan (bypassed telecalling)', ?)
  `, [newLead.rawId, newLead.id, actor]);

  // Log status change
  await leadStatusModel.recordStatusChange(newLead, null, {
    source: 'reloan_initiation',
    actor,
    actorRole,
    metadata: {
      isReloan: true,
      previousLoanId,
      previousApplicationId: lead.id
    }
  });

  // Log lead activity
  await activityModel.createForLead(newLead, {
    type: 'status',
    description: `Reloan auto-initiated from previous loan ${previousLoanId || 'N/A'}. Assigned to Credit Manager.`,
    user: actor,
    metadata: {
      previousLoanId,
      previousApplicationId: lead.id
    }
  });

  // Audit trail
  await auditModel.create(req, {
    action: 'lead.reloan_initiate',
    entityType: 'lead',
    entityId: newLead.id,
    lead: newLead,
    metadata: {
      previousLoanId,
      previousApplicationId: lead.id
    }
  });

  return success(res, newLead, 'Reloan lead initiated successfully.', 201);
}

async function resolveLoanIdForLead(leadId) {
  const { query } = require('../config/db');
  const cleanId = String(leadId || '').trim();
  const rows = await query(`
    SELECT DISTINCT l.id AS loanId
    FROM loans l
    JOIN loan_repayment_schedule sched ON sched.loan_id = l.id
    JOIN loan_applications la ON (la.application_id = sched.application_id OR la.id = sched.lead_id)
    WHERE la.id = ? OR la.application_id = ? OR CAST(la.id AS CHAR) = ?
    ORDER BY l.created_at DESC
    LIMIT 1
  `, [cleanId, cleanId, cleanId]);

  if (rows.length) return rows[0].loanId;
  return cleanId;
}

async function downloadLeadNocPdf(req, res) {
  const nocService = require('../services/nocService');
  const loanId = await resolveLoanIdForLead(req.params.id);
  const loanData = await nocService.fetchLoanNocDetails(loanId);
  if (!loanData) {
    return res.status(404).json({ success: false, message: 'Loan record not found for this application.' });
  }
  const buffer = await nocService.buildNocPdfBuffer(loanData);
  const fileName = `NOC_${String(loanData.loanId).replace(/[^a-zA-Z0-9_-]/g, '')}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
  return res.send(buffer);
}

async function sendLeadNocEmail(req, res) {
  const nocService = require('../services/nocService');
  const loanId = await resolveLoanIdForLead(req.params.id);
  const result = await nocService.triggerNocForClosedLoan({ loanId });
  if (!result) {
    return res.status(400).json({ success: false, message: 'Unable to send NOC email. Ensure loan account is closed and borrower has a valid email address.' });
  }
  return res.json({ success: true, message: 'NOC certificate emailed successfully to borrower.', data: result });
}

async function getDuplicateLeads(req, res) {
  const result = await leadModel.getDuplicateLeads(req.params.id);
  return success(res, result);
}

async function addLeadReference(req, res) {
  const leadId = req.params.id || req.body.leadId || req.body.applicationId;
  if (!leadId) return notFound(res, 'Lead ID is required');

  const previousLead = await leadModel.findById(leadId);
  if (!previousLead) return notFound(res, 'Lead not found');

  verifyLeadAssignedToTelecaller(req, previousLead);

  const updatedLead = await leadModel.addReference(leadId, req.body);
  if (!updatedLead) return notFound(res, 'Lead not found');

  await activityModel.createForLead(updatedLead, {
    type: 'operations',
    description: `Added application reference: ${req.body.fullName || req.body.name || 'New Reference'}`,
    user: req.body.user || req.user?.name || 'CRM User',
    metadata: {
      addedReference: req.body,
    },
  });

  return res.json({
    success: true,
    lead: updatedLead,
    message: 'Application reference added successfully',
  });
}

async function updateLeadReferences(req, res) {
  const leadId = req.params.id || req.body.leadId || req.body.applicationId;
  if (!leadId) return notFound(res, 'Lead ID is required');

  const previousLead = await leadModel.findById(leadId);
  if (!previousLead) return notFound(res, 'Lead not found');

  verifyLeadAssignedToTelecaller(req, previousLead);

  let updatedLead;
  // If request contains a single reference without references array
  if (req.body.fullName && !Array.isArray(req.body.references)) {
    updatedLead = await leadModel.addReference(leadId, req.body);
  } else {
    const referencesData = req.body.references || req.body;
    updatedLead = await leadModel.updateReferences(leadId, referencesData);
  }

  if (!updatedLead) return notFound(res, 'Lead not found');

  await activityModel.createForLead(updatedLead, {
    type: 'operations',
    description: 'Updated application references',
    user: req.body.user || req.user?.name || 'CRM User',
    metadata: {
      previousReferences: previousLead.references,
      newReferences: updatedLead.references,
    },
  });

  return res.json({
    success: true,
    lead: updatedLead,
    message: 'Application references updated successfully',
  });
}

module.exports = {
  addLeadReference,
  createLead,
  deleteLead,
  downloadLeadNocPdf,
  getDuplicateLeads,
  getLead,
  initiateReloan,
  listLeads,
  rejectLeadByTelecaller,
  sendLeadNocEmail,
  updateLeadOperations,
  updateLeadReferences,
  updateLeadStatus,
};

