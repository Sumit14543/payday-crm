const crypto = require('crypto');
const { query } = require('../config/db');

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function mapSanction(row) {
  if (!row) return null;

  return {
    id: row.id,
    leadId: row.lead_id || '',
    applicationId: row.application_id || '',
    camSheetId: row.cam_sheet_id || null,
    agreementNumber: row.agreement_number || '',
    agreementDate: row.agreement_date,
    borrower: row.borrower || '',
    lender: row.lender || 'WAQT FINANCE PRIVATE LIMITED',
    borrowerEmail: row.borrower_email || '',
    borrowerPhone: row.borrower_phone || '',
    principalAmount: Number(row.principal_amount || 0),
    tenureDays: Number(row.tenure_days || 30),
    interestRate: Number(row.interest_rate || 0),
    interestRateLabel: row.interest_rate_label || '',
    processingFee: Number(row.processing_fee || 0),
    gstAmount: Number(row.gst_amount || 0),
    disbursedAmount: Number(row.disbursed_amount || 0),
    disbursementDate: row.disbursement_date || null,
    disbursementMode: row.disbursement_mode || '',
    dueDate: row.due_date,
    repaymentAmount: Number(row.repayment_amount || 0),
    apr: Number(row.apr || 0),
    bankName: row.bank_name || '',
    accountNumber: row.account_number || '',
    ifscCode: row.ifsc_code || '',
    penalInterestRate: Number(row.penal_interest_rate || 2),
    lateFee: row.late_fee || '',
    conditions: row.conditions || '',
    pdfPath: row.pdf_path || '',
    acceptanceProofPath: row.acceptance_proof_path || '',
    acceptanceProofOriginalFileName: row.acceptance_proof_original_file_name || '',
    acceptanceProofUploadedAt: row.acceptance_proof_uploaded_at || null,
    acceptanceProofUploadedBy: row.acceptance_proof_uploaded_by || '',
    customerDecision: row.customer_decision || 'pending',
    customerDecisionAt: row.customer_decision_at || null,
    customerDecisionNotes: row.customer_decision_notes || '',
    customerDecisionIp: row.customer_decision_ip || '',
    customerDecisionUserAgent: row.customer_decision_user_agent || '',
    decisionToken: row.decision_token || '',
    emailTo: row.email_to || '',
    emailStatus: row.email_status || 'pending',
    emailError: row.email_error || '',
    whatsappStatus: row.whatsapp_status || 'pending',
    whatsappError: row.whatsapp_error || '',
    whatsappSentAt: row.whatsapp_sent_at || null,
    parentSanctionId: row.parent_sanction_id || null,
    revisionNumber: Number(row.revision_number || 0),
    revisionReason: row.revision_reason || '',
    supersededBySanctionId: row.superseded_by_sanction_id || null,
    supersededAt: row.superseded_at || null,
    sentAt: row.sent_at || null,
    status: row.status || 'sent',
    createdBy: row.created_by || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findLatestByLead(lead) {
  if (!lead) return null;

  const rows = await query(`
    SELECT *
    FROM lead_sanctions
    WHERE lead_id = ? OR application_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `, [lead.rawId || '', lead.id || '']);

  return mapSanction(rows[0]);
}

async function findLatestBySource({ sourceSystem, sourceLeadId, sourceApplicationId }) {
  const clauses = ['la.source_system = ?'];
  const params = [String(sourceSystem || '').trim().toLowerCase()];

  if (sourceLeadId) {
    clauses.push('la.source_lead_id = ?');
    params.push(String(sourceLeadId).trim());
  } else if (sourceApplicationId) {
    clauses.push('la.source_application_id = ?');
    params.push(String(sourceApplicationId).trim());
  } else {
    return null;
  }

  const rows = await query(`
    SELECT sanction.*
    FROM lead_sanctions sanction
    INNER JOIN loan_applications la
      ON sanction.lead_id = CAST(la.id AS CHAR)
      OR sanction.application_id = COALESCE(NULLIF(la.application_id, ''), CONCAT('APP-', la.id))
    WHERE ${clauses.join(' AND ')}
    ORDER BY sanction.created_at DESC, sanction.id DESC
    LIMIT 1
  `, params);

  return mapSanction(rows[0]);
}

async function findByAgreementNumber(agreementNumber) {
  const rows = await query('SELECT * FROM lead_sanctions WHERE agreement_number = ? LIMIT 1', [agreementNumber]);
  return mapSanction(rows[0]);
}

function leadKeys(lead) {
  return [lead?.rawId || '', lead?.id || ''];
}

function stripRevisionSuffix(agreementNumber) {
  return String(agreementNumber || '').trim().replace(/-R\d+$/i, '');
}

async function nextRevisionInfo(lead, agreementNumber) {
  const baseAgreementNumber = stripRevisionSuffix(agreementNumber);
  const rows = await query(`
    SELECT COALESCE(MAX(revision_number), 0) + 1 AS next_revision
    FROM lead_sanctions
    WHERE (lead_id = ? OR application_id = ?)
      AND (agreement_number = ? OR agreement_number LIKE ?)
  `, [...leadKeys(lead), baseAgreementNumber, `${baseAgreementNumber}-R%`]);
  const revisionNumber = Number(rows[0]?.next_revision || 1);

  return {
    baseAgreementNumber,
    revisionNumber,
    revisedAgreementNumber: `${baseAgreementNumber}-R${revisionNumber}`,
  };
}

async function findReusableFailedByAgreementNumber(lead, agreementNumber) {
  const rows = await query(`
    SELECT *
    FROM lead_sanctions
    WHERE agreement_number = ?
      AND (lead_id = ? OR application_id = ?)
      AND email_status = 'failed'
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `, [agreementNumber, lead.rawId || '', lead.id || '']);

  return mapSanction(rows[0]);
}

async function createForLead(lead, payload = {}) {
  const decisionToken = payload.decisionToken || crypto.randomBytes(16).toString('hex');
  const result = await query(`
    INSERT INTO lead_sanctions (
      lead_id, application_id, cam_sheet_id, agreement_number, agreement_date, borrower,
      lender, borrower_email, borrower_phone, principal_amount, tenure_days, interest_rate,
      interest_rate_label, processing_fee, gst_amount, disbursed_amount, disbursement_date,
      disbursement_mode, due_date, repayment_amount, apr, bank_name, account_number,
      ifsc_code, penal_interest_rate, late_fee, conditions, pdf_path, email_to,
      email_status, email_error, parent_sanction_id, revision_number, revision_reason,
      superseded_by_sanction_id, superseded_at, status, created_by, decision_token, customer_decision
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    lead.rawId || '',
    lead.id || '',
    payload.camSheetId || null,
    payload.agreementNumber,
    payload.agreementDate,
    payload.borrower || lead.name || '',
    payload.lender || 'WAQT FINANCE PRIVATE LIMITED',
    payload.borrowerEmail || lead.email || '',
    payload.borrowerPhone || lead.phone || '',
    toNumber(payload.principalAmount),
    toNumber(payload.tenureDays, 30),
    toNumber(payload.interestRate),
    payload.interestRateLabel || `${toNumber(payload.interestRate).toFixed(2)} % - Per Day`,
    toNumber(payload.processingFee),
    toNumber(payload.gstAmount),
    toNumber(payload.disbursedAmount),
    payload.disbursementDate || payload.agreementDate,
    payload.disbursementMode || 'Bank Transfer',
    payload.dueDate,
    toNumber(payload.repaymentAmount),
    toNumber(payload.apr),
    payload.bankName || lead.bankName || '',
    payload.accountNumber || lead.accountNumber || '',
    payload.ifscCode || lead.ifscCode || '',
    toNumber(payload.penalInterestRate, 2),
    payload.lateFee || '2% of the loan amount, whichever is higher',
    payload.conditions || '',
    payload.pdfPath || '',
    payload.emailTo || lead.email || '',
    payload.emailStatus || 'pending',
    payload.emailError || '',
    payload.parentSanctionId || null,
    toNumber(payload.revisionNumber),
    payload.revisionReason || '',
    payload.supersededBySanctionId || null,
    payload.supersededAt || null,
    payload.status || 'sent',
    payload.user || payload.createdBy || 'Credit Manager',
    decisionToken,
    'pending',
  ]);

  const rows = await query('SELECT * FROM lead_sanctions WHERE id = ? LIMIT 1', [result.insertId]);
  return mapSanction(rows[0]);
}

async function findByDecisionToken(token) {
  if (!token) return null;
  const rows = await query('SELECT * FROM lead_sanctions WHERE decision_token = ? LIMIT 1', [token]);
  return mapSanction(rows[0]);
}

async function findAnyDecidedByLeadId(leadId) {
  if (!leadId) return null;
  const rows = await query(`
    SELECT * FROM lead_sanctions
    WHERE (lead_id = ? OR application_id = ?)
      AND customer_decision IS NOT NULL
      AND customer_decision <> 'pending'
    ORDER BY customer_decision_at DESC, id DESC
    LIMIT 1
  `, [String(leadId), String(leadId)]);
  return mapSanction(rows[0]);
}

async function updateCustomerDecision(id, { decision, notes = '', ip = '', userAgent = '' }, leadId = null) {
  const normDecision = decision === 'accept' || decision === 'accepted' ? 'accepted' : 'rejected';
  
  // Guard 1: If this sanction is already decided, return existing record
  const existingRows = await query('SELECT customer_decision FROM lead_sanctions WHERE id = ? LIMIT 1', [id]);
  if (existingRows.length && existingRows[0].customer_decision && existingRows[0].customer_decision !== 'pending') {
    const rows = await query('SELECT * FROM lead_sanctions WHERE id = ? LIMIT 1', [id]);
    return mapSanction(rows[0]);
  }



  await query(`
    UPDATE lead_sanctions
    SET customer_decision = ?,
        customer_decision_at = CURRENT_TIMESTAMP,
        customer_decision_notes = ?,
        customer_decision_ip = COALESCE(NULLIF(?, ''), customer_decision_ip),
        customer_decision_user_agent = COALESCE(NULLIF(?, ''), customer_decision_user_agent),
        status = CASE WHEN ? = 'accepted' THEN 'accepted' ELSE 'rejected' END
    WHERE id = ? AND (customer_decision IS NULL OR customer_decision = 'pending')
  `, [normDecision, notes, ip, userAgent, normDecision, id]);

  const rows = await query('SELECT * FROM lead_sanctions WHERE id = ? LIMIT 1', [id]);
  return mapSanction(rows[0]);
}

async function resetCustomerDecision(id) {
  const newDecisionToken = crypto.randomBytes(16).toString('hex');
  await query(`
    UPDATE lead_sanctions
    SET customer_decision = 'pending',
        customer_decision_at = NULL,
        customer_decision_notes = NULL,
        customer_decision_ip = NULL,
        customer_decision_user_agent = NULL,
        decision_token = ?
    WHERE id = ?
  `, [newDecisionToken, id]);

  const rows = await query('SELECT * FROM lead_sanctions WHERE id = ? LIMIT 1', [id]);
  return mapSanction(rows[0]);
}

async function markSupersededForLead(lead, replacementSanctionId) {
  await query(`
    UPDATE lead_sanctions
    SET status = 'superseded',
        superseded_by_sanction_id = ?,
        superseded_at = CURRENT_TIMESTAMP
    WHERE (lead_id = ? OR application_id = ?)
      AND id <> ?
      AND status <> 'superseded'
  `, [replacementSanctionId, ...leadKeys(lead), replacementSanctionId]);
}

async function updateDelivery(id, payload = {}) {
  await query(`
    UPDATE lead_sanctions
    SET pdf_path = COALESCE(NULLIF(?, ''), pdf_path),
        email_status = ?,
        email_error = ?,
        sent_at = CASE WHEN ? = 'sent' THEN CURRENT_TIMESTAMP ELSE sent_at END
    WHERE id = ?
  `, [
    payload.pdfPath || '',
    payload.emailStatus || 'pending',
    payload.emailError || '',
    payload.emailStatus || 'pending',
    id,
  ]);

  const rows = await query('SELECT * FROM lead_sanctions WHERE id = ? LIMIT 1', [id]);
  return mapSanction(rows[0]);
}

async function updateWhatsappDelivery(id, payload = {}) {
  const status = payload.whatsappStatus || (payload.sent ? 'sent' : payload.attempted === false ? 'skipped' : 'failed');
  await query(`
    UPDATE lead_sanctions
    SET whatsapp_status = ?,
        whatsapp_error = ?,
        whatsapp_sent_at = CASE WHEN ? = 'sent' THEN CURRENT_TIMESTAMP ELSE whatsapp_sent_at END
    WHERE id = ?
  `, [
    status,
    payload.whatsappError || payload.error || '',
    status,
    id,
  ]);

  const rows = await query('SELECT * FROM lead_sanctions WHERE id = ? LIMIT 1', [id]);
  return mapSanction(rows[0]);
}

async function updateAcceptanceProof(id, payload = {}) {
  await query(`
    UPDATE lead_sanctions
    SET acceptance_proof_path = ?,
        acceptance_proof_original_file_name = ?,
        acceptance_proof_uploaded_by = ?,
        acceptance_proof_uploaded_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [
    payload.path || '',
    payload.originalFileName || '',
    payload.user || 'Credit Manager',
    id,
  ]);

  const rows = await query('SELECT * FROM lead_sanctions WHERE id = ? LIMIT 1', [id]);
  return mapSanction(rows[0]);
}

async function updateFailedSanction(id, payload = {}) {
  await query(`
    UPDATE lead_sanctions
    SET cam_sheet_id = ?,
        agreement_date = ?,
        borrower = ?,
        lender = ?,
        borrower_email = ?,
        borrower_phone = ?,
        principal_amount = ?,
        tenure_days = ?,
        interest_rate = ?,
        interest_rate_label = ?,
        processing_fee = ?,
        gst_amount = ?,
        disbursed_amount = ?,
        disbursement_date = ?,
        disbursement_mode = ?,
        due_date = ?,
        repayment_amount = ?,
        apr = ?,
        bank_name = ?,
        account_number = ?,
        ifsc_code = ?,
        penal_interest_rate = ?,
        late_fee = ?,
        conditions = ?,
        pdf_path = ?,
        email_to = ?,
        email_status = ?,
        email_error = ?,
        parent_sanction_id = ?,
        revision_number = ?,
        revision_reason = ?,
        superseded_by_sanction_id = ?,
        superseded_at = ?,
        status = ?,
        created_by = ?
    WHERE id = ?
  `, [
    payload.camSheetId || null,
    payload.agreementDate,
    payload.borrower || '',
    payload.lender || 'WAQT FINANCE PRIVATE LIMITED',
    payload.borrowerEmail || '',
    payload.borrowerPhone || '',
    toNumber(payload.principalAmount),
    toNumber(payload.tenureDays, 30),
    toNumber(payload.interestRate),
    payload.interestRateLabel || `${toNumber(payload.interestRate).toFixed(2)} % - Per Day`,
    toNumber(payload.processingFee),
    toNumber(payload.gstAmount),
    toNumber(payload.disbursedAmount),
    payload.disbursementDate || payload.agreementDate,
    payload.disbursementMode || 'Bank Transfer',
    payload.dueDate,
    toNumber(payload.repaymentAmount),
    toNumber(payload.apr),
    payload.bankName || '',
    payload.accountNumber || '',
    payload.ifscCode || '',
    toNumber(payload.penalInterestRate, 2),
    payload.lateFee || '2% of the loan amount, whichever is higher',
    payload.conditions || '',
    payload.pdfPath || '',
    payload.emailTo || '',
    payload.emailStatus || 'pending',
    payload.emailError || '',
    payload.parentSanctionId || null,
    toNumber(payload.revisionNumber),
    payload.revisionReason || '',
    payload.supersededBySanctionId || null,
    payload.supersededAt || null,
    payload.status || 'sent',
    payload.user || payload.createdBy || 'Credit Manager',
    id,
  ]);

  const rows = await query('SELECT * FROM lead_sanctions WHERE id = ? LIMIT 1', [id]);
  return mapSanction(rows[0]);
}

async function markCreditManagerRejected(id, { notes = '', user = 'Credit Manager' } = {}) {
  await query(`
    UPDATE lead_sanctions
    SET customer_decision = 'rejected_by_credit_manager',
        customer_decision_at = NOW(),
        customer_decision_notes = ?,
        status = 'rejected',
        updated_at = NOW()
    WHERE id = ?
  `, [notes, id]);

  const rows = await query('SELECT * FROM lead_sanctions WHERE id = ? LIMIT 1', [id]);
  return mapSanction(rows[0]);
}

module.exports = {
  createForLead,
  findByAgreementNumber,
  findByDecisionToken,
  findAnyDecidedByLeadId,
  findReusableFailedByAgreementNumber,
  findLatestByLead,
  findLatestBySource,
  mapSanction,
  markCreditManagerRejected,
  markSupersededForLead,
  nextRevisionInfo,
  resetCustomerDecision,
  updateAcceptanceProof,
  updateCustomerDecision,
  updateDelivery,
  updateFailedSanction,
  updateWhatsappDelivery,
};
