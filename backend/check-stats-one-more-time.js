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
    
    const sql = `
      SELECT 
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
        ) AS monthlyDisbursedVal
    `;
    
    connection.query(sql, [monthStart], (err, rows) => {
      if (err) {
        console.error(err);
      } else {
        console.log('Results from direct query:', rows);
      }
      connection.end();
    });
  });
});
