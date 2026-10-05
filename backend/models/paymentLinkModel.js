const { query } = require('../config/db');

function parseJson(value) {
  if (!value) return null;
  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return null;
  }
}

function mapPaymentLink(row) {
  if (!row) return null;
  return {
    id: row.id,
    loanId: row.loan_id || row.loanId || '',
    customerId: row.customer_id || row.customerId || '',
    leadId: row.lead_id || row.leadId || '',
    applicationId: row.application_id || row.applicationId || '',
    amount: Number(row.amount || 0),
    currency: row.currency || 'INR',
    gateway: row.gateway || 'cashfree',
    gatewayLinkId: row.gateway_link_id || row.gatewayLinkId || '',
    linkUrl: row.link_url || row.linkUrl || '',
    status: row.status || 'created',
    expiresAt: row.expires_at || row.expiresAt || null,
    paidAt: row.paid_at || row.paidAt || null,
    paymentReference: row.payment_reference || row.paymentReference || '',
    createdBy: row.created_by || row.createdBy || '',
    metadata: parseJson(row.metadata),
    createdAt: row.created_at || row.createdAt || null,
    updatedAt: row.updated_at || row.updatedAt || null,
  };
}

async function create(payload = {}) {
  const result = await query(`
    INSERT INTO payment_links (
      loan_id, customer_id, lead_id, application_id, amount, currency, gateway,
      gateway_link_id, link_url, status, expires_at, created_by, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    payload.loanId,
    payload.customerId || null,
    payload.leadId || null,
    payload.applicationId || null,
    Number(payload.amount || 0),
    payload.currency || 'INR',
    payload.gateway || 'cashfree',
    payload.gatewayLinkId,
    payload.linkUrl,
    payload.status || 'created',
    payload.expiresAt || null,
    payload.createdBy || null,
    payload.metadata ? JSON.stringify(payload.metadata) : null,
  ]);

  const rows = await query('SELECT * FROM payment_links WHERE id = ? LIMIT 1', [result.insertId]);
  return mapPaymentLink(rows[0]);
}

async function findReusableForLoan({ loanId, amount, gateway = 'cashfree' } = {}) {
  const rows = await query(`
    SELECT *
    FROM payment_links
    WHERE loan_id = ?
      AND gateway = ?
      AND amount = ?
      AND LOWER(status) IN ('active', 'created')
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `, [loanId, gateway, Number(amount || 0)]);

  return mapPaymentLink(rows[0]);
}

async function findByGatewayLinkId(gatewayLinkId, gateway = 'cashfree') {
  const rows = await query(`
    SELECT *
    FROM payment_links
    WHERE gateway_link_id = ?
      AND gateway = ?
    LIMIT 1
  `, [gatewayLinkId, gateway]);

  return mapPaymentLink(rows[0]);
}

async function updateStatus(id, payload = {}) {
  await query(`
    UPDATE payment_links
    SET status = ?,
        payment_reference = COALESCE(?, payment_reference),
        paid_at = CASE WHEN ? IS NOT NULL THEN ? ELSE paid_at END,
        metadata = COALESCE(?, metadata)
    WHERE id = ?
  `, [
    payload.status || 'created',
    payload.paymentReference || null,
    payload.paidAt || null,
    payload.paidAt || null,
    payload.metadata ? JSON.stringify(payload.metadata) : null,
    id,
  ]);

  const rows = await query('SELECT * FROM payment_links WHERE id = ? LIMIT 1', [id]);
  return mapPaymentLink(rows[0]);
}

module.exports = {
  create,
  findByGatewayLinkId,
  findReusableForLoan,
  mapPaymentLink,
  updateStatus,
};
