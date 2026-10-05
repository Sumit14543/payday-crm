const { query } = require('../config/db');
const { likeParams } = require('../utils/strings');

async function findAll({ search = '', risk = 'all', page = 1, limit = 50 } = {}) {
  const clauses = [];
  const params = [];

  if (search) {
    clauses.push('(id LIKE ? OR name LIKE ? OR email LIKE ? OR phone LIKE ?)');
    params.push(...likeParams(search, 4));
  }

  if (risk !== 'all') {
    clauses.push('risk_level = ?');
    params.push(risk);
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const parsedLimit = Math.min(Math.max(Number(limit) || 50, 1), 500);
  const parsedPage = Math.max(Number(page) || 1, 1);
  const offset = (parsedPage - 1) * parsedLimit;

  const [countResult] = await query(`
    SELECT COUNT(*) AS total
    FROM customers
    ${whereClause}
  `, params);

  const total = Number(countResult?.total || 0);

  const rows = await query(`
    SELECT
      id, name, email, phone, address, credit_score AS creditScore, total_loans AS totalLoans,
      active_loans AS activeLoans, total_borrowed AS totalBorrowed, total_repaid AS totalRepaid,
      on_time_payments AS onTimePayments, late_payments AS latePayments, defaulted, join_date AS joinDate,
      last_loan_date AS lastLoanDate, risk_level AS riskLevel, lifetime_value AS ltv,
      monthly_income AS monthlyIncome
    FROM customers
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `, [...params, parsedLimit, offset]);

  rows.total = total;
  rows.page = parsedPage;
  rows.limit = parsedLimit;
  rows.totalPages = Math.ceil(total / parsedLimit) || 1;

  return rows;
}

async function findById(id) {
  const rows = await query(`
    SELECT
      id, name, email, phone, address, credit_score AS creditScore, total_loans AS totalLoans,
      active_loans AS activeLoans, total_borrowed AS totalBorrowed, total_repaid AS totalRepaid,
      on_time_payments AS onTimePayments, late_payments AS latePayments, defaulted, join_date AS joinDate,
      last_loan_date AS lastLoanDate, risk_level AS riskLevel, lifetime_value AS ltv,
      monthly_income AS monthlyIncome
    FROM customers
    WHERE id = ?
  `, [id]);
  return rows[0] || null;
}

async function markCustomerLogin(identifier) {
  const now = new Date();
  await query(
    `UPDATE customers SET last_login_at = ? WHERE id = ? OR phone = ? OR email = ?`,
    [now, identifier, identifier, identifier]
  );
  await query(
    `UPDATE collection_cases SET last_login_at = ? WHERE customer_id = ? OR phone = ?`,
    [now, identifier, identifier]
  );
  await query(
    `UPDATE loan_applications SET last_login_at = ? WHERE mobile = ? OR email = ?`,
    [now, identifier, identifier]
  );
}

module.exports = { findAll, findById, markCustomerLogin };
