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
  
  connection.query(`USE \`${db}\``, async (err) => {
    if (err) {
      console.error(err);
      connection.end();
      return;
    }
    
    // Method 1: Using collection_cases
    const sql1 = `
      SELECT 
        (
          SELECT COALESCE(SUM(COALESCE(payment.amount, loan.principal, 0)), 0)
          FROM collection_cases cc
          LEFT JOIN loans loan ON loan.id = cc.loan_id
          LEFT JOIN lead_accounting_payments payment ON payment.loan_id = loan.id
        ) AS totalNetDisbursed,
        (
          SELECT COALESCE(SUM(COALESCE(payment.amount, loan.principal, 0)), 0)
          FROM collection_cases cc
          LEFT JOIN loans loan ON loan.id = cc.loan_id
          LEFT JOIN lead_accounting_payments payment ON payment.loan_id = loan.id
          WHERE DATE(COALESCE(payment.disbursed_at, loan.start_date)) >= ?
        ) AS monthlyDisbursedVal
    `;
    
    // Method 2: Direct from loans table with payment join
    const sql2 = `
      SELECT 
        (
          SELECT COALESCE(SUM(COALESCE(payment.amount, loan.principal, 0)), 0)
          FROM loans loan
          LEFT JOIN lead_accounting_payments payment ON payment.loan_id = loan.id
        ) AS totalNetDisbursedDirect,
        (
          SELECT COALESCE(SUM(COALESCE(payment.amount, loan.principal, 0)), 0)
          FROM loans loan
          LEFT JOIN lead_accounting_payments payment ON payment.loan_id = loan.id
          WHERE DATE(COALESCE(payment.disbursed_at, loan.start_date, loan.created_at)) >= ?
        ) AS monthlyDisbursedValDirect
    `;
    
    connection.query(sql1, [monthStart], (err, rows1) => {
      console.log('Method 1 (via collection_cases):', rows1);
      
      connection.query(sql2, [monthStart], (err, rows2) => {
        console.log('Method 2 (direct from loans):', rows2);
        
        connection.end();
      });
    });
  });
});
