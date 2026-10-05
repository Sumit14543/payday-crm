const fs = require('fs');
const path = require('path');
const mysql = require('mysql');
const dotenv = require('dotenv');

dotenv.config();

console.log("=== DEBUGGING PRODUCTION DEPLOYMENT ===");

// 1. Check directory contents of /home/waqtmoney/public_html
try {
  console.log("Contents of /home/waqtmoney/public_html:");
  const contents = fs.readdirSync('/home/waqtmoney/public_html');
  console.log(contents);
} catch (e) {
  console.error("Failed to read /home/waqtmoney/public_html:", e.message);
}

// 2. Read referenceController.js directly on production to see what code is actually there!
try {
  const controllerPath = '/home/waqtmoney/public_html/payday-api/controllers/referenceController.js';
  if (fs.existsSync(controllerPath)) {
    const code = fs.readFileSync(controllerPath, 'utf8');
    console.log("referenceController.js listCollections query lines 60-100 on production:");
    const lines = code.split('\n');
    for (let i = 55; i < 110 && i < lines.length; i++) {
      console.log(`${i+1}: ${lines[i]}`);
    }
  } else {
    console.log("referenceController.js does not exist at path:", controllerPath);
  }
} catch (e) {
  console.error("Failed to read referenceController.js:", e.message);
}

// 3. Run the collection database query directly to see what SQL returns right now!
const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || process.env.DB_PASS,
});

connection.connect();

const sql = `
  SELECT 
    cc.id,
    cc.customer,
    COALESCE(loan.total_amount, cc.total_due, 0) AS baseRepayment,
    COALESCE(loan.amount_paid, 0) AS amountPaid,
    COALESCE(
      CASE
        WHEN COALESCE(loan.balance, cc.total_due, 0) <= 0 THEN 0
        WHEN loan.id IS NOT NULL THEN
          GREATEST(0, ROUND(
            COALESCE(loan.principal, 0) + 
            (COALESCE(loan.principal, 0) * 0.01 * GREATEST(0, DATEDIFF(CURDATE(), loan.start_date))) - 
            COALESCE(loan.amount_paid, 0)
          ))
        ELSE cc.total_due
      END,
      cc.total_due,
      0
    ) AS outstanding
  FROM collection_cases cc
  LEFT JOIN loans loan ON cc.loan_id = loan.id
  WHERE cc.loan_id = 'LNWQTMN02721'
`;

connection.query(sql, (err, rows) => {
  if (err) {
    console.error("Database query failed:", err);
  } else {
    console.log("Database outstanding calculation result:", JSON.stringify(rows, null, 2));
  }
  connection.end();
});
