const customerModel = require('../models/customerModel');
const leadModel = require('../models/leadModel');
const leadStatusModel = require('../models/leadStatusModel');
const activityModel = require('../models/activityModel');
const auditModel = require('../models/auditModel');
const { query } = require('../config/db');
const { generateApplicationId } = require('../utils/strings');
const { notFound, success } = require('../utils/http');

async function listCustomers(req, res) {
  const customers = await customerModel.findAll(req.query);
  return res.status(200).json({
    success: true,
    data: customers,
    pagination: {
      page: customers.page || 1,
      limit: customers.limit || (customers.length || 50),
      total: customers.total !== undefined ? customers.total : customers.length,
      totalPages: customers.totalPages || 1,
    },
    message: 'OK',
  });
}

async function getCustomer(req, res) {
  const customer = await customerModel.findById(req.params.id);
  if (!customer) return notFound(res, 'Customer not found');
  return success(res, customer);
}

async function initiateReloan(req, res) {
  const customer = await customerModel.findById(req.params.id);
  if (!customer) return notFound(res, 'Customer not found');

  // Verify eligibility:
  // 1. Must not have active loans
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

  // 2. Must not have any other active applications
  const activeApplication = await leadModel.findActiveApplication({ phone: customer.phone, email: customer.email });
  if (activeApplication) {
    return res.status(409).json({
      success: false,
      message: `This customer already has an active application in the funnel (Lead ID: ${activeApplication.id}).`
    });
  }

  // Find their last application to copy details from
  const [lastLeadRow] = await query(`
    SELECT id, application_id FROM loan_applications
    WHERE mobile = ? OR email = ?
    ORDER BY id DESC LIMIT 1
  `, [customer.phone, customer.email]);

  if (!lastLeadRow) {
    return res.status(404).json({
      success: false,
      message: 'No previous loan application found to copy profile details from.'
    });
  }

  const lastLead = await leadModel.findById(lastLeadRow.application_id || lastLeadRow.id);
  if (!lastLead) {
    return res.status(404).json({
      success: false,
      message: 'Previous loan application details could not be retrieved.'
    });
  }

  // Find their last closed loan ID
  const [lastLoanRow] = await query(`
    SELECT id FROM loans
    WHERE customer_id = ?
    ORDER BY created_at DESC LIMIT 1
  `, [customer.id]);
  const previousLoanId = lastLoanRow ? lastLoanRow.id : null;

  // Generate new applicationId
  const newApplicationId = await generateApplicationId(lastLead.sourceSystem || '');

  // Insert the new lead
  // We copy all fields, set is_reloan = 1, previous_loan_id = previousLoanId
  // status is set to 'review' (Document Collection) and assigned_to is 'Credit Manager'
  const actor = req.user?.name || 'CRM User';
  const actorRole = req.user?.role || 'superadmin';

  await query(`
    INSERT INTO loan_applications (
      application_id, loan_type, full_name, mobile, email, dob, pan_number, uan_number,
      aadhaar_number, aadhaar_unique_id, aadhaar_masked, employment_status, monthly_income,
      income_received_in, city, pincode, loan_amount, loan_purpose, company_name, designation,
      office_email, office_address, reference1_name, reference1_mobile, reference1_relation,
      reference2_name, reference2_mobile, reference2_relation, bank_name, branch_name,
      account_holder, account_number, ifsc_code, priority, assigned_to, status,
      is_active_application, is_reloan, previous_loan_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Medium', 'Credit Manager', 'review', 1, 1, ?)
  `, [
    newApplicationId,
    lastLead.loanType || 'payday',
    lastLead.name,
    lastLead.phone,
    lastLead.email,
    lastLead.dateOfBirth ? lastLead.dateOfBirth.slice(0, 10) : null,
    lastLead.panNumber,
    lastLead.uanNumber,
    lastLead.aadhaarNumber,
    lastLead.aadhaarUniqueId,
    lastLead.aadhaarMasked,
    lastLead.employmentStatus,
    lastLead.monthlyIncome,
    lastLead.incomeReceivedIn || 'account',
    lastLead.city,
    lastLead.pincode,
    lastLead.loanAmount,
    lastLead.loanPurpose,
    lastLead.companyName,
    lastLead.designation,
    lastLead.officeEmail,
    lastLead.officeAddress,
    lastLead.reference1Name,
    lastLead.reference1Mobile,
    lastLead.reference1Relation,
    lastLead.reference2Name,
    lastLead.reference2Mobile,
    lastLead.reference2Relation,
    lastLead.bankName,
    lastLead.branchName,
    lastLead.accountHolder,
    lastLead.accountNumber,
    lastLead.ifscCode,
    previousLoanId
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
      previousApplicationId: lastLead.id
    }
  });

  // Log lead activity
  await activityModel.createForLead(newLead, {
    type: 'status',
    description: `Reloan auto-initiated from previous loan ${previousLoanId || 'N/A'}. Assigned to Credit Manager.`,
    user: actor,
    metadata: {
      previousLoanId,
      previousApplicationId: lastLead.id
    }
  });

  // Audit trail
  await auditModel.create(req, {
    action: 'lead.reloan_initiate',
    entityType: 'lead',
    entityId: newLead.id,
    lead: newLead,
    metadata: {
      customerId: customer.id,
      previousLoanId,
      previousApplicationId: lastLead.id
    }
  });

  return success(res, newLead, 'Reloan lead initiated successfully.', 201);
}

module.exports = {
  getCustomer,
  listCustomers,
  initiateReloan,
};
