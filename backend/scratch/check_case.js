const mysql = require('mysql');
const dotenv = require('dotenv');

dotenv.config();

const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || process.env.DB_PASS,
});

connection.connect();

console.log("=== CHECKING CASE AND JOIN ON PRODUCTION ===");

const sql = `
  SELECT 
    cc.id AS case_id,
    cc.loan_id AS case_loan_id,
    cc.total_due AS case_total_due,
    l.id AS loan_id,
    l.principal AS loan_principal,
    l.total_amount AS loan_total_amount,
    l.amount_paid AS loan_amount_paid
  FROM collection_cases cc
  LEFT JOIN loans l ON cc.loan_id = l.id
  WHERE cc.customer LIKE '%ANKIT%' OR cc.loan_id = 'LNWQTMN02721' OR l.id = 'LNWQTMN02721'
`;

connection.query(sql, (err, rows) => {
  if (err) {
    console.error("Failed to query case and join:", err);
  } else {
    console.log("Join query results:", JSON.stringify(rows, null, 2));
  }
  connection.end();
});
