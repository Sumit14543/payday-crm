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
    console.error('Connection failed:', err);
    process.exit(1);
  }
  
  const db = 'waqtmoney_payday';
  
  connection.query(`USE \`${db}\``, async (err) => {
    if (err) {
      console.error(err);
      connection.end();
      return;
    }
    
    // Query 1: Disbursements
    const disbSql = `
      SELECT 
        DATE(COALESCE(payment.disbursed_at, loan.start_date)) AS trend_date,
        SUM(COALESCE(payment.amount, loan.principal, 0)) AS total_disbursed
      FROM collection_cases cc
      LEFT JOIN loans loan ON loan.id = cc.loan_id
      LEFT JOIN lead_accounting_payments payment ON payment.loan_id = loan.id
      WHERE DATE(COALESCE(payment.disbursed_at, loan.start_date)) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      GROUP BY DATE(COALESCE(payment.disbursed_at, loan.start_date))
    `;
    
    // Query 2: Collections
    const collSql = `
      SELECT
        DATE(received_at) AS trend_date,
        SUM(amount) AS total_collected
      FROM loan_repayments
      WHERE DATE(received_at) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      GROUP BY DATE(received_at)
    `;
    
    connection.query(disbSql, (err, disbRows) => {
      if (err) {
        console.error('Disb trend err:', err);
      } else {
        console.log('Disb trend rows:', disbRows);
      }
      
      connection.query(collSql, (err, collRows) => {
        if (err) {
          console.error('Coll trend err:', err);
        } else {
          console.log('Coll trend rows:', collRows);
        }
        
        connection.end();
      });
    });
  });
});
