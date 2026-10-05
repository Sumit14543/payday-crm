const { randomUUID } = require('crypto');
const activityModel = require('../models/activityModel');
const integrationLogModel = require('../models/integrationLogModel');
const leadModel = require('../models/leadModel');
const leadStatusModel = require('../models/leadStatusModel');
const { requireFields, success } = require('../utils/http');

function cleanText(value) {
  return String(value || '').trim();
}

function digits(value) {
  return cleanText(value).replace(/\D/g, '');
}

function normalizeAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function normalizeLoanType(value) {
  const normalized = cleanText(value).toLowerCase();
  const allowedTypes = new Set(['payday']);
  return allowedTypes.has(normalized) ? normalized : 'payday';
}

function normalizeEmploymentStatus(value) {
  const normalized = cleanText(value).toLowerCase();
  if (normalized === 'self' || normalized === 'self-employed' || normalized === 'business') return 'self';
  return 'salaried';
}

function generateAadhaarUniqueId() {
  return randomUUID();
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.publicMessage = message;
  throw error;
}

function validateTestingLeadPayload(payload) {
  if (payload.phone.length !== 10) badRequest('Mobile number must be 10 digits.');
  if (!payload.loanAmount) badRequest('Loan amount must be greater than 0.');
  if (payload.email && !/^\S+@\S+\.\S+$/.test(payload.email)) badRequest('Enter a valid email address.');
  if (payload.officeEmail && !/^\S+@\S+\.\S+$/.test(payload.officeEmail)) badRequest('Enter a valid office email address.');
  if (payload.panNumber && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(payload.panNumber)) badRequest('PAN must be in valid format.');
  if (payload.aadhaarNumber && payload.aadhaarNumber.length !== 12) badRequest('Aadhaar number must be 12 digits.');
  if (payload.uanNumber && !/^\d{12}$/.test(payload.uanNumber)) badRequest('UAN number must be 12 digits.');
  if (payload.pincode && payload.pincode.length !== 6) badRequest('Pincode must be 6 digits.');
  if (payload.ifscCode && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(payload.ifscCode)) badRequest('IFSC code must be in valid format.');
  if (payload.reference1Mobile && payload.reference1Mobile.length !== 10) badRequest('Reference 1 mobile must be 10 digits.');
  if (payload.reference2Mobile && payload.reference2Mobile.length !== 10) badRequest('Reference 2 mobile must be 10 digits.');
}
function buildTestingLeadPayload(body = {}) {
  requireFields(body, ['name', 'phone', 'loanAmount']);

  const aadhaarUniqueId = cleanText(body.aadhaarUniqueId || body.aadhaarUid) || generateAadhaarUniqueId();

  return {
    name: cleanText(body.name),
    phone: digits(body.phone).slice(-10),
    email: cleanText(body.email).toLowerCase(),
    dateOfBirth: cleanText(body.dateOfBirth || body.dob),
    panNumber: cleanText(body.panNumber || body.pan).toUpperCase(),
    aadhaarNumber: digits(body.aadhaarNumber || body.aadhaar).slice(0, 12),
    aadhaarUniqueId,
    uanNumber: digits(body.uanNumber).slice(0, 12),
    loanAmount: normalizeAmount(body.loanAmount),
    monthlyIncome: normalizeAmount(body.monthlyIncome),
    city: cleanText(body.city),
    pincode: digits(body.pincode).slice(0, 6),
    loanPurpose: cleanText(body.loanPurpose || 'Testing lead'),
    loanType: normalizeLoanType(body.loanType),
    employmentStatus: normalizeEmploymentStatus(body.employmentStatus),
    companyName: cleanText(body.companyName),
    designation: cleanText(body.designation),
    officeEmail: cleanText(body.officeEmail).toLowerCase(),
    officeAddress: cleanText(body.officeAddress || body.address),
    bankName: cleanText(body.bankName),
    branchName: cleanText(body.branchName),
    accountHolder: cleanText(body.accountHolder),
    accountNumber: cleanText(body.accountNumber),
    ifscCode: cleanText(body.ifscCode).toUpperCase(),
    reference1Name: cleanText(body.reference1Name),
    reference1Mobile: digits(body.reference1Mobile).slice(-10),
    reference1Relation: cleanText(body.reference1Relation),
    reference2Name: cleanText(body.reference2Name),
    reference2Mobile: digits(body.reference2Mobile).slice(-10),
    reference2Relation: cleanText(body.reference2Relation),
    priority: cleanText(body.priority) || 'Medium',
    status: cleanText(body.status) || 'Pending',
  };
}

async function createTestingLead(req, res) {
  const payload = buildTestingLeadPayload(req.body || {});
  validateTestingLeadPayload(payload);
  const lead = await leadModel.create(payload);

  await activityModel.createForLead(lead, {
    type: 'status',
    description: 'Lead submitted from public testing form',
    user: 'Testing Form',
    sourceKey: `testing-form-created:${lead.rawId}`,
    metadata: {
      loanAmount: lead.loanAmount,
      status: lead.status,
      submittedFrom: 'public-testing-form',
    },
  });

  await leadStatusModel.createForLead(lead, {
    source: 'testing-form',
    actor: 'Testing Form',
    sourceKey: `testing-form-status:${lead.rawId}`,
    metadata: {
      loanAmount: lead.loanAmount,
      status: lead.status,
      submittedFrom: 'public-testing-form',
    },
  });

  const responsePayload = {
    action: 'created',
    applicationId: lead.id,
    crmLeadId: lead.rawId,
    status: lead.status,
  };

  await integrationLogModel.create({
    crmApplicationId: lead.id,
    crmLeadId: lead.rawId,
    endpoint: req.originalUrl || req.path,
    ipAddress: req.ip,
    requestPayload: {
      ...payload,
      submittedFrom: 'public-testing-form',
    },
    responsePayload,
    sourceSystem: 'testing-form',
    status: 'success',
    statusCode: 201,
    userAgent: req.get('user-agent') || '',
  });

  return success(res, responsePayload, 'Testing lead created successfully.', 201);
}

module.exports = {
  createTestingLead,
};

