const { query } = require('../config/db');
const leadModel = require('./leadModel');
const telecallerModel = require('./telecallerModel');

async function getStats() {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const [
    [leadOpsStats],
    [loanStats],
    [customerStats],
    [teamStats],
    [repaymentStats],
    recentLeads,
  ] = await Promise.all([
    query(`
      SELECT
        COUNT(*) AS totalLeads,
        SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) AS todayLeads,
        SUM(CASE WHEN MONTH(created_at) = ? AND YEAR(created_at) = ? THEN 1 ELSE 0 END) AS thisMonthLeads,
        SUM(CASE WHEN LOWER(TRIM(status)) IN ('approved', 'qualified', 'closed', 'disbursed', 'sanctioned', 'converted', 'send_to_credit', 'approved_by_credit') THEN 1 ELSE 0 END) AS totalApprovedLeads,
        SUM(CASE WHEN LOWER(TRIM(status)) IN ('approved', 'qualified', 'closed', 'disbursed', 'sanctioned', 'converted', 'send_to_credit', 'approved_by_credit') AND DATE(COALESCE(updated_at, created_at)) = CURDATE() THEN 1 ELSE 0 END) AS todayApprovedLeads,
        SUM(CASE WHEN LOWER(TRIM(status)) IN ('approved', 'qualified', 'closed', 'disbursed', 'sanctioned', 'converted', 'send_to_credit', 'approved_by_credit') AND MONTH(COALESCE(updated_at, created_at)) = ? AND YEAR(COALESCE(updated_at, created_at)) = ? THEN 1 ELSE 0 END) AS thisMonthApprovedLeads,
        SUM(CASE WHEN LOWER(TRIM(status)) NOT IN ('disbursed', 'converted', 'rejected', 'lost') THEN 1 ELSE 0 END) AS activeAppsCount,
        SUM(CASE WHEN LOWER(TRIM(status)) IN ('kyc pending', 'documents pending', 'document collection') THEN 1 ELSE 0 END) AS kycPending,
        SUM(CASE WHEN LOWER(TRIM(status)) IN ('bank verification', 'bank verification pending', 'documents received') THEN 1 ELSE 0 END) AS bankVerificationCount,
        SUM(CASE WHEN LOWER(TRIM(status)) IN ('underwriting', 'in underwriting', 'qualified') THEN 1 ELSE 0 END) AS underwritingCount,
        SUM(CASE WHEN LOWER(TRIM(status)) IN ('dropped', 'not interested', 'no answer', 'not eligible', 'duplicate', 'dnc') THEN 1 ELSE 0 END) AS droppedCount,
        SUM(CASE WHEN LOWER(TRIM(status)) IN ('documents pending', 'document collection') THEN 1 ELSE 0 END) AS pendingDocumentsCount,
        SUM(CASE WHEN LOWER(TRIM(status)) IN ('contacted', 'callback') THEN 1 ELSE 0 END) AS pendingCallbacksCount,
        SUM(CASE WHEN LOWER(TRIM(status)) IN ('new lead', 'new', 'draft', 'pending') THEN 1 ELSE 0 END) AS newLeads
      FROM loan_applications
    `, [currentMonth, currentYear, currentMonth, currentYear]).catch(() => [{ totalLeads: 0 }]),
    query(`
      SELECT
        COUNT(*) AS totalLoansCount,
        SUM(status = 'Active') AS activeLoans,
        SUM(status = 'Overdue') AS overdueLoans,
        COALESCE(SUM(CASE WHEN status IN ('Active', 'Overdue') THEN balance ELSE 0 END), 0) AS totalOutstanding,
        COALESCE(SUM(amount_paid), 0) AS totalCollected,
        COALESCE(SUM(CASE WHEN DATE(COALESCE(start_date, created_at)) = CURDATE() THEN ROUND(principal * 0.882) ELSE 0 END), 0) AS todayDisbursedAmount,
        COALESCE(SUM(CASE WHEN MONTH(COALESCE(start_date, created_at)) = ? AND YEAR(COALESCE(start_date, created_at)) = ? THEN ROUND(principal * 0.882) ELSE 0 END), 0) AS thisMonthDisbursedAmount,
        COALESCE(SUM(ROUND(principal * 0.882)), 0) AS totalDisbursedAmount,
        COALESCE(SUM(CASE WHEN DATE(COALESCE(start_date, created_at)) = CURDATE() THEN ROUND(principal * 0.118) ELSE 0 END), 0) AS todayFeesGst,
        COALESCE(SUM(CASE WHEN MONTH(COALESCE(start_date, created_at)) = ? AND YEAR(COALESCE(start_date, created_at)) = ? THEN ROUND(principal * 0.118) ELSE 0 END), 0) AS monthlyFeesGst,
        COALESCE(SUM(ROUND(principal * 0.118)), 0) AS totalFeesGst
      FROM loans
    `, [currentMonth, currentYear, currentMonth, currentYear]).catch(() => [{ totalLoansCount: 0 }]),
    query('SELECT COUNT(*) AS totalCustomers FROM customers').catch(() => [{ totalCustomers: 0 }]),
    query('SELECT COUNT(*) AS teamMembers, COALESCE(AVG(commission), 0) AS avgCommission FROM team_members').catch(() => [{ teamMembers: 0, avgCommission: 0 }]),
    query(`
      SELECT
        COALESCE(SUM(CASE WHEN DATE(COALESCE(received_at, payment_date, created_at)) = CURDATE() THEN amount ELSE 0 END), 0) AS todayCollected,
        COALESCE(SUM(CASE WHEN MONTH(COALESCE(received_at, payment_date, created_at)) = ? AND YEAR(COALESCE(received_at, payment_date, created_at)) = ? THEN amount ELSE 0 END), 0) AS thisMonthCollected,
        COALESCE(SUM(amount), 0) AS allTimeCollected,
        COALESCE(SUM(CASE WHEN DATE(COALESCE(received_at, payment_date, created_at)) = CURDATE() THEN GREATEST(0, amount - 0) ELSE 0 END), 0) AS todayRoi,
        COALESCE(SUM(CASE WHEN MONTH(COALESCE(received_at, payment_date, created_at)) = ? AND YEAR(COALESCE(received_at, payment_date, created_at)) = ? THEN GREATEST(0, amount - 0) ELSE 0 END), 0) AS monthlyRoi,
        COALESCE(SUM(amount), 0) AS totalRoi
      FROM loan_repayments
      WHERE LOWER(TRIM(status)) IN ('received', 'success', 'paid', 'settled', 'completed', 'approved')
    `, [currentMonth, currentYear, currentMonth, currentYear]).catch(() => [{ todayCollected: 0, thisMonthCollected: 0, allTimeCollected: 0, todayRoi: 0, monthlyRoi: 0, totalRoi: 0 }]),
    query(`
      SELECT id, full_name AS name, mobile, status, created_at AS createdAt
      FROM loan_applications
      ORDER BY id DESC
      LIMIT 10
    `).catch(() => []),
  ]);

  // Resilient fallback: If loans table has no disbursed data yet, read from lead_accounting_payments
  if (!loanStats || Number(loanStats.totalDisbursedAmount || 0) === 0) {
    try {
      const [lapStats] = await query(`
        SELECT
          COALESCE(SUM(CASE WHEN DATE(COALESCE(disbursed_at, paid_at, created_at)) = CURDATE() THEN amount ELSE 0 END), 0) AS todayDisbursed,
          COALESCE(SUM(CASE WHEN MONTH(COALESCE(disbursed_at, paid_at, created_at)) = ? AND YEAR(COALESCE(disbursed_at, paid_at, created_at)) = ? THEN amount ELSE 0 END), 0) AS monthDisbursed,
          COALESCE(SUM(amount), 0) AS totalDisbursed
        FROM lead_accounting_payments
        WHERE LOWER(TRIM(status)) = 'paid'
      `, [currentMonth, currentYear]).catch(() => [{}]);

      if (lapStats && Number(lapStats.totalDisbursed || 0) > 0) {
        const totD = Number(lapStats.totalDisbursed || 0);
        const monD = Number(lapStats.monthDisbursed || 0);
        const todD = Number(lapStats.todayDisbursed || 0);
        if (loanStats) {
          loanStats.totalDisbursedAmount = Math.round(totD * 0.882);
          loanStats.thisMonthDisbursedAmount = Math.round(monD * 0.882);
          loanStats.todayDisbursedAmount = Math.round(todD * 0.882);
          loanStats.totalFeesGst = Math.round(totD * 0.118);
          loanStats.monthlyFeesGst = Math.round(monD * 0.118);
          loanStats.todayFeesGst = Math.round(todD * 0.118);
        }
      }
    } catch (e) {
      // ignore
    }
  }

  const todayRevenue = Number(loanStats?.todayFeesGst || 0) + Number(repaymentStats?.todayRoi || 0);
  const monthlyRevenue = Number(loanStats?.monthlyFeesGst || 0) + Number(repaymentStats?.monthlyRoi || 0);
  const totalRevenue = Number(loanStats?.totalFeesGst || 0) + Number(repaymentStats?.totalRoi || 0);

  return {
    totalLeads: Number(leadOpsStats?.totalLeads || 0),
    todayLeads: Number(leadOpsStats?.todayLeads || 0),
    thisMonthLeads: Number(leadOpsStats?.thisMonthLeads || 0),
    newLeads: Number(leadOpsStats?.newLeads || 0),
    qualifiedLeads: Number(leadOpsStats?.totalApprovedLeads || 0),
    totalApprovedLeads: Number(leadOpsStats?.totalApprovedLeads || 0),
    todayApprovedLeads: Number(leadOpsStats?.todayApprovedLeads || 0),
    thisMonthApprovedLeads: Number(leadOpsStats?.thisMonthApprovedLeads || 0),
    activeAppsCount: Number(leadOpsStats?.activeAppsCount || 0),
    kycPending: Number(leadOpsStats?.kycPending || 0),
    bankVerificationCount: Number(leadOpsStats?.bankVerificationCount || 0),
    underwritingCount: Number(leadOpsStats?.underwritingCount || 0),
    droppedCount: Number(leadOpsStats?.droppedCount || 0),
    pendingDocumentsCount: Number(leadOpsStats?.pendingDocumentsCount || 0),
    pendingCallbacksCount: Number(leadOpsStats?.pendingCallbacksCount || 0),

    // Loans / Disbursals
    totalLoansCount: Number(loanStats?.totalLoansCount || 0),
    activeLoans: Number(loanStats?.activeLoans || 0),
    overdueLoans: Number(loanStats?.overdueLoans || 0),
    totalOutstanding: Number(loanStats?.totalOutstanding || 0),
    totalCollected: Number(loanStats?.totalCollected || 0),
    todayDisbursedAmount: Number(loanStats?.todayDisbursedAmount || 0),
    thisMonthDisbursedAmount: Number(loanStats?.thisMonthDisbursedAmount || 0),
    totalDisbursedAmount: Number(loanStats?.totalDisbursedAmount || 0),

    // Revenue
    todayRevenue,
    monthlyRevenue,
    totalRevenue,

    // Customers & Team
    totalCustomers: Number(customerStats?.totalCustomers || 0),
    teamMembers: Number(teamStats?.teamMembers || 0),
    avgCommission: Math.round(Number(teamStats?.avgCommission || 0)),

    // Collections
    todayCollected: Number(repaymentStats?.todayCollected || 0),
    thisMonthCollected: Number(repaymentStats?.thisMonthCollected || 0),
    allTimeCollected: Number(repaymentStats?.allTimeCollected || 0),

    // Recent Feed
    recentLeads: recentLeads || [],
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
