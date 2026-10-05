const mysql = require('mysql');
const { config } = require('../config/env');

const connection = mysql.createConnection({
  host: config.db.host,
  user: config.db.user,
  password: config.db.password,
  port: config.db.port,
  database: 'waqtmoney_payday',
});

connection.connect((err) => {
  if (err) {
    console.error("Connection failed:", err);
    process.exit(1);
  }
  console.log("Connected to waqtmoney_payday database.");

  connection.query(
    'SELECT assigned_to, COUNT(*) as count FROM loan_applications GROUP BY assigned_to',
    (error, rows) => {
      if (error) {
        console.error("Query failed:", error);
        connection.end();
        process.exit(1);
      }
      console.log("\n--- Leads by assigned_to in waqtmoney_payday ---");
      rows.forEach(row => {
        console.log(`Assigned To: "${row.assigned_to}" | Count: ${row.count}`);
      });

      connection.query('SELECT name, role, email FROM crm_users', (err2, users) => {
        if (err2) {
          console.error("Query failed:", err2);
        } else {
          console.log("\n--- Users in waqtmoney_payday ---");
          users.forEach(u => {
            console.log(`Name: "${u.name}" | Role: "${u.role}" | Email: "${u.email}"`);
          });
        }
        connection.end();
      });
    }
  );
});
