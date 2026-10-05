const { query } = require('../config/db');
const leadModel = require('./leadModel');
const telecallerModel = require('./telecallerModel');

async function getStats() {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const [
    leadStats,
    [loanStats],
    [customerStats],
    [teamStats],
    [incomeStats],
  ] = await Promise.all([
    leadModel.getStats(),
    query(`
      SELECT
        SUM(status = 'Active') AS activeLoans,
        SUM(status = 'Overdue') AS overdueLoans,
        COALESCE(SUM(CASE WHEN status IN ('Active', 'Overdue') THEN balance ELSE 0 END), 0) AS totalOutstanding,
        COALESCE(SUM(amount_paid), 0) AS totalCollected
      FROM loans
    `),
    query('SELECT COUNT(*) AS totalCustomers FROM customers'),
    query('SELECT COUNT(*) AS teamMembers, COALESCE(AVG(commission), 0) AS avgCommission FROM team_members'),
    query(`
      SELECT 
        COALESCE(SUM(
          CASE WHEN MONTH(l.start_date) = ? AND YEAR(l.start_date) = ? THEN
            ROUND(l.principal * 0.118)
          ELSE 0 END
        ), 0) AS monthlyFeesGst,
        COALESCE(SUM(
          CASE WHEN l.amount_paid > 0 AND MONTH(COALESCE(l.updated_at, l.start_date)) = ? AND YEAR(COALESCE(l.updated_at, l.start_date)) = ?
          THEN GREATEST(0, l.amount_paid - l.principal)
          ELSE 0 END
        ), 0) AS monthlyRoi
      FROM loans l
    `, [currentMonth, currentYear, currentMonth, currentYear]),
  ]);

  const monthlyRevenue = Number(incomeStats.monthlyFeesGst || 0) + Number(incomeStats.monthlyRoi || 0);

  return {
    ...leadStats,
    activeLoans: Number(loanStats.activeLoans || 0),
    overdueLoans: Number(loanStats.overdueLoans || 0),
    totalOutstanding: Number(loanStats.totalOutstanding || 0),
    totalCollected: Number(loanStats.totalCollected || 0),
    totalCustomers: Number(customerStats.totalCustomers || 0),
    teamMembers: Number(teamStats.teamMembers || 0),
    avgCommission: Math.round(Number(teamStats.avgCommission || 0)),
    monthlyRevenue,
  };
}

async function getAccountantDashboard() {
  const [
    queue,
    recentPayments,
    [loanStats],
    [collectionStats],
    [invoiceStats],
    [repaymentStats],
    [paymentStats],
  ] = await Promise.all([
    telecallerModel.listAccountingQueueV2({ page: 1, pageSize: 6 }),
    telecallerModel.listRecentAccountingPayments(6),
    query(`
      SELECT
        COUNT(*) AS totalLoans,
        SUM(LOWER(status) = 'active') AS activeLoans,
        SUM(LOWER(status) = 'overdue') AS overdueLoans,
        COALESCE(SUM(CASE WHEN LOWER(status) IN ('active', 'overdue') THEN balance ELSE 0 END), 0) AS totalOutstanding,
        COALESCE(SUM(amount_paid), 0) AS totalCollected,
        COALESCE(SUM(CASE WHEN LOWER(status) = 'active' THEN next_payment_amount ELSE 0 END), 0) AS upcomingRepayment
      FROM loans
    `),
    query(`
      SELECT
        COUNT(*) AS totalCases,
        SUM(LOWER(status) = 'active') AS activeCases,
        COALESCE(SUM(total_due), 0) AS collectionDue
      FROM collection_cases
    `),
    query(`
      SELECT
        COUNT(*) AS payoutQueue,
        COALESCE(SUM(amount), 0) AS payoutAmount
      FROM invoices
      WHERE status IN ('Pending', 'Due', 'Unpaid')
    `),
    query(`
      SELECT
        COUNT(*) AS dueCount,
        COALESCE(SUM(GREATEST(total_due - amount_paid, 0)), 0) AS dueAmount
      FROM loan_repayment_schedule
      WHERE status IN ('pending', 'overdue')
    `),
    query(`
      SELECT
        COUNT(*) AS paidLeads,
        COALESCE(SUM(amount), 0) AS totalDisbursed
      FROM lead_accounting_payments
      WHERE LOWER(status) = 'paid'
    `),
  ]);

  const activeLoans = Number(loanStats.activeLoans || 0);
  const overdueLoans = Number(loanStats.overdueLoans || 0);
  const totalOutstanding = Number(loanStats.totalOutstanding || 0);
  const totalCollected = Number(loanStats.totalCollected || 0);
  const totalDue = totalOutstanding + totalCollected;

  return {
    actionQueue: {
      activeLoans,
      collectionsFollowup: Number(collectionStats.activeCases || collectionStats.totalCases || 0),
      paymentQueue: queue.pagination.totalItems,
      payoutQueue: Number(invoiceStats.payoutQueue || 0),
      repaymentDue: Number(repaymentStats.dueCount || 0),
    },
    metrics: {
      activeLoans,
      collectionEfficiency: totalDue > 0 ? Math.round((totalCollected / totalDue) * 100) : 0,
      collectionDue: Number(collectionStats.collectionDue || 0),
      overdueLoans,
      paidLeads: Number(paymentStats.paidLeads || 0),
      payoutAmount: Number(invoiceStats.payoutAmount || 0),
      paymentQueueAmount: Number(queue.stats.totalDisbursement || 0),
      paymentQueueCount: queue.pagination.totalItems,
      repaymentDueAmount: Number(repaymentStats.dueAmount || 0),
      totalDisbursed: Number(paymentStats.totalDisbursed || 0),
      totalCollected,
      totalOutstanding,
      upcomingRepayment: Number(loanStats.upcomingRepayment || 0),
    },
    paymentQueue: {
      items: queue.items,
      pagination: queue.pagination,
    },
    recentTransfers: recentPayments,
  };
}

module.exports = { getAccountantDashboard, getStats };
