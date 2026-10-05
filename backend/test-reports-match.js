const mysql = require('mysql');
require('./config/env');

const connection = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  port: process.env.DB_PORT || 3306
});

connection.connect((err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  
  const db = 'waqtmoney_payday';
  const monthStart = '2026-07-01';
  
  connection.query(`USE \`${db}\``, (err) => {
    if (err) {
      console.error(err);
      connection.end();
      return;
    }
    
    const sql = `
      SELECT 
        (
          SELECT COALESCE(SUM(COALESCE(t.payment_amount, t.principal, 0)), 0)
          FROM (
            SELECT 
              cc.id,
              loan.principal,
              MAX(payment.amount) AS payment_amount
            FROM collection_cases cc
            LEFT JOIN loans loan
              ON TRIM(LEADING 'LN' FROM REPLACE(REPLACE(REPLACE(UPPER(loan.id), ' ', ''), '-', ''), '_', '')) = TRIM(LEADING 'LN' FROM REPLACE(REPLACE(REPLACE(UPPER(cc.loan_id), ' ', ''), '-', ''), '_', ''))
            LEFT JOIN lead_accounting_payments payment
              ON TRIM(LEADING 'LN' FROM REPLACE(REPLACE(REPLACE(UPPER(payment.loan_id), ' ', ''), '-', ''), '_', '')) = TRIM(LEADING 'LN' FROM REPLACE(REPLACE(REPLACE(UPPER(cc.loan_id), ' ', ''), '-', ''), '_', ''))
            GROUP BY cc.id, loan.principal
          ) t
        ) AS totalNetDisbursed,
        
        (
          SELECT COUNT(id)
          FROM collection_cases
        ) AS totalDisbursedCount,
        
        (
          SELECT COALESCE(SUM(COALESCE(t.payment_amount, t.principal, 0)), 0)
          FROM (
            SELECT 
              cc.id,
              loan.principal,
              MAX(payment.amount) AS payment_amount
            FROM collection_cases cc
            LEFT JOIN loans loan
              ON TRIM(LEADING 'LN' FROM REPLACE(REPLACE(REPLACE(UPPER(loan.id), ' ', ''), '-', ''), '_', '')) = TRIM(LEADING 'LN' FROM REPLACE(REPLACE(REPLACE(UPPER(cc.loan_id), ' ', ''), '-', ''), '_', ''))
            LEFT JOIN lead_accounting_payments payment
              ON TRIM(LEADING 'LN' FROM REPLACE(REPLACE(REPLACE(UPPER(payment.loan_id), ' ', ''), '-', ''), '_', '')) = TRIM(LEADING 'LN' FROM REPLACE(REPLACE(REPLACE(UPPER(cc.loan_id), ' ', ''), '-', ''), '_', ''))
            WHERE DATE(COALESCE(payment.disbursed_at, loan.start_date)) >= ?
            GROUP BY cc.id, loan.principal
          ) t
        ) AS monthlyDisbursedVal
    `;
    
    connection.query(sql, [monthStart, monthStart], (err, rows) => {
      if (err) {
        console.error(err);
      } else {
        console.log('Results using final collection_cases query:', rows);
      }
      connection.end();
    });
  });
});
