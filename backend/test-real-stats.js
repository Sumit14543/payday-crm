const mysql = require('mysql');
require('./config/env');

const MASTER_DB_NAME = process.env.DB_MASTER_NAME || `waqtmoney_payday_crm_master`;

const connection = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  port: process.env.DB_PORT || 3306
});

connection.connect((err) => {
  if (err) {
    console.error('Connection failed:', err);
    process.exit(1);
  }
  
  connection.query(`SELECT * FROM \`${MASTER_DB_NAME}\`.tenants`, async (err, tenants) => {
    if (err) {
      console.error(err);
      connection.end();
      return;
    }
    
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    
    for (const tenant of tenants) {
      console.log(`\n============================\nTenant: ${tenant.name} (${tenant.slug}) - DB: ${tenant.db_name}`);
      
      const queryFn = (sql, params = []) => {
        return new Promise((resolve, reject) => {
          connection.query(`USE \`${tenant.db_name}\``, (err) => {
            if (err) return reject(err);
            connection.query(sql, params, (err, rows) => {
              if (err) reject(err);
              else resolve(rows);
            });
          });
        });
      };
      
      try {
        const summaryRow = await queryFn(`
            SELECT 
              (SELECT COUNT(*) FROM loan_applications) AS totalLeads,
              (SELECT COUNT(*) FROM loans WHERE status = 'Active') AS activeLoans,
              (SELECT COUNT(*) FROM loans WHERE status = 'Overdue') AS overdueLoans,
              (SELECT COUNT(*) FROM customers) AS totalCustomers,
              (SELECT COUNT(*) FROM loan_applications WHERE DATE(created_at) = CURDATE()) AS newLeadsToday,
              (SELECT COALESCE(SUM(principal), 0) FROM loans WHERE DATE(created_at) >= ?) AS monthlyDisbursed,
              (SELECT COALESCE(SUM(amount_paid), 0) FROM loans WHERE DATE(updated_at) >= ?) AS monthlyCollected,
              (SELECT COALESCE(SUM(total_due), 0) FROM loan_repayment_schedule WHERE due_date = CURDATE()) AS dueTodayAmt,
              (SELECT COALESCE(SUM(amount), 0) FROM loan_repayments WHERE DATE(received_at) = CURDATE()) AS collectedTodayAmt,
              (SELECT COUNT(*) FROM audit_logs) AS controlEventsCount,
              (SELECT COUNT(*) FROM loan_applications WHERE status = 'review') AS reviewBacklogCount,
              (SELECT COUNT(*) FROM loan_applications WHERE status = 'approved') AS esignPendingCount,
              (SELECT COALESCE(SUM(balance), 0) FROM loans WHERE status = 'Overdue') AS overdueExposureAmt,
              (SELECT COUNT(*) FROM loan_applications WHERE status != 'draft' AND aadhaar_verified = 1) AS kycVerifiedCount,
              (SELECT COUNT(*) FROM loan_applications WHERE status != 'draft' AND (aadhaar_verified = 0 OR aadhaar_verified IS NULL)) AS kycPendingCount,
              (SELECT COUNT(*) FROM loan_applications WHERE bank_name IS NOT NULL AND bank_name != '') AS bankVerifiedCount,
              (SELECT COUNT(*) FROM loan_applications WHERE status = 'approved' OR status = 'disbursed') AS approvedLeadsCount,
              (SELECT COUNT(*) FROM loan_applications WHERE status = 'rejected') AS rejectedLeadsCount,
              
              (
                SELECT COALESCE(SUM(COALESCE(payment.amount, loan.principal, 0)), 0)
                FROM loans loan
                LEFT JOIN lead_accounting_payments payment ON payment.loan_id = loan.id
              ) AS totalNetDisbursed,
              
              (
                SELECT COUNT(id)
                FROM loans
              ) AS totalDisbursedCount,
              
              (
                SELECT COALESCE(SUM(COALESCE(payment.amount, loan.principal, 0)), 0)
                FROM loans loan
                LEFT JOIN lead_accounting_payments payment ON payment.loan_id = loan.id
                WHERE DATE(COALESCE(payment.disbursed_at, loan.start_date, loan.created_at)) >= ?
              ) AS monthlyDisbursedVal,
              
              (
                SELECT COUNT(loan.id)
                FROM loans loan
                LEFT JOIN lead_accounting_payments payment ON payment.loan_id = loan.id
                WHERE DATE(COALESCE(payment.disbursed_at, loan.start_date, loan.created_at)) >= ?
              ) AS monthlyDisbursedCount,
              
              (
                SELECT COALESCE(SUM(COALESCE(payment.amount, loan.principal, 0)), 0)
                FROM loans loan
                LEFT JOIN lead_accounting_payments payment ON payment.loan_id = loan.id
                WHERE DATE(COALESCE(payment.disbursed_at, loan.start_date, loan.created_at)) = CURDATE()
              ) AS todayDisbursedVal,
              
              (
                SELECT COUNT(loan.id)
                FROM loans loan
                LEFT JOIN lead_accounting_payments payment ON payment.loan_id = loan.id
                WHERE DATE(COALESCE(payment.disbursed_at, loan.start_date, loan.created_at)) = CURDATE()
              ) AS todayDisbursedCount
          `, [monthStart, monthStart, monthStart, monthStart]);
        
        console.log('Succeeded! Result:', summaryRow[0]);
      } catch (e) {
        console.error('Failed! Error:', e);
      }
    }
    connection.end();
  });
});
