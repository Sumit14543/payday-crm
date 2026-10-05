const { query } = require('../config/db');

function parseJson(value) {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function mapCamSheet(row) {
  if (!row) return null;

  return {
    id: row.id,
    leadId: row.lead_id || '',
    applicationId: row.application_id || '',
    version: Number(row.version || 1),
    status: row.status || 'draft',
    requestedAmount: Number(row.requested_amount || 0),
    recommendedAmount: Number(row.recommended_amount || 0),
    approvedAmount: Number(row.approved_amount || 0),
    loanTermDays: Number(row.loan_term_days || 30),
    interestRate: Number(row.interest_rate || 0),
    processingFeeRate: Number(row.processing_fee_rate || 0),
    totalRepayment: Number(row.total_repayment || 0),
    monthlyIncome: Number(row.monthly_income || 0),
    monthlyExpenses: Number(row.monthly_expenses || 0),
    netIncome: Number(row.net_income || 0),
    dtiRatio: Number(row.dti_ratio || 0),
    repaymentBuffer: Number(row.repayment_buffer || 0),
    policyScore: Number(row.policy_score || 0),
    verificationScore: Number(row.verification_score || 0),
    riskGrade: row.risk_grade || '',
    creditRisk: row.credit_risk || '',
    repaymentCapacity: row.repayment_capacity || '',
    recommendation: row.recommendation || '',
    deviationLevel: row.deviation_level || '',
    decisionReason: row.decision_reason || '',
    conditions: row.conditions || '',
    notes: row.notes || '',
    snapshot: parseJson(row.snapshot),
    createdBy: row.created_by || '',
    decidedBy: row.decided_by || '',
    decidedAt: row.decided_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findLatestByLead(lead) {
  if (!lead) return null;

  const rows = await query(`
    SELECT *
    FROM lead_cam_sheets
    WHERE lead_id = ? OR application_id = ?
    ORDER BY version DESC, created_at DESC, id DESC
    LIMIT 1
  `, [lead.rawId || '', lead.id || '']);

  return mapCamSheet(rows[0]);
}

async function createForLead(lead, payload = {}, options = {}) {
  if (!lead) return null;

  const [versionRow] = await query(`
    SELECT COALESCE(MAX(version), 0) + 1 AS next_version
    FROM lead_cam_sheets
    WHERE lead_id = ? OR application_id = ?
  `, [lead.rawId || '', lead.id || '']);

  const version = Number(versionRow?.next_version || 1);
  const status = options.status || payload.status || 'draft';
  const actor = options.user || payload.user || payload.createdBy || 'Credit Manager';
  const decidedBy = status === 'approved' || status === 'rejected' ? actor : null;
  const snapshot = payload.snapshot === undefined ? payload : payload.snapshot;

  const result = await query(`
    INSERT INTO lead_cam_sheets (
      lead_id, application_id, version, status, requested_amount, recommended_amount,
      approved_amount, loan_term_days, interest_rate, processing_fee_rate, total_repayment,
      monthly_income, monthly_expenses, net_income, dti_ratio, repayment_buffer,
      policy_score, verification_score, risk_grade, credit_risk, repayment_capacity,
      recommendation, deviation_level, decision_reason, conditions, notes, snapshot,
      created_by, decided_by, decided_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${decidedBy ? 'CURRENT_TIMESTAMP' : 'NULL'})
  `, [
    lead.rawId || '',
    lead.id || '',
    version,
    status,
    toNumber(payload.requestedAmount),
    toNumber(payload.recommendedAmount),
    toNumber(payload.approvedAmount),
    toNumber(payload.loanTermDays, 30),
    toNumber(payload.interestRate),
    toNumber(payload.processingFeeRate),
    toNumber(payload.totalRepayment),
    toNumber(payload.monthlyIncome),
    toNumber(payload.monthlyExpenses),
    toNumber(payload.netIncome),
    toNumber(payload.dtiRatio),
    toNumber(payload.repaymentBuffer),
    toNumber(payload.policyScore),
    toNumber(payload.verificationScore),
    payload.riskGrade || '',
    payload.creditRisk || '',
    payload.repaymentCapacity || '',
    payload.recommendation || '',
    payload.deviationLevel || '',
    payload.decisionReason || '',
    payload.conditions || '',
    payload.notes || '',
    JSON.stringify(snapshot || {}),
    actor,
    decidedBy,
  ]);

  const rows = await query('SELECT * FROM lead_cam_sheets WHERE id = ? LIMIT 1', [result.insertId]);
  return mapCamSheet(rows[0]);
}

module.exports = {
  createForLead,
  findLatestByLead,
  mapCamSheet,
};
