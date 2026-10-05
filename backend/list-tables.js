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
  
  const databases = [
    'waqtmoney_payday',
    'waqtmoney_payday_geetpay',
    'waqtmoney_payday_loaninwallet',
    'waqtmoney_payday_salarywaves'
  ];
  
  let index = 0;
  function next() {
    if (index >= databases.length) {
      connection.end();
      return;
    }
    const db = databases[index++];
    connection.query(`USE \`${db}\``, (err) => {
      if (err) {
        console.log(`\nDB ${db}: Error - ${err.message}`);
        next();
        return;
      }
      
      const q = `
        SELECT 
          (SELECT COUNT(*) FROM loan_applications) AS apps,
          (SELECT COUNT(*) FROM loans) AS loans,
          (SELECT COUNT(*) FROM collection_cases) AS cases,
          (SELECT COUNT(*) FROM lead_accounting_payments) AS payments
      `;
      connection.query(q, (err, rows) => {
        if (err) {
          console.log(`\nDB ${db}: Error running counts - ${err.message}`);
        } else {
          console.log(`\nDB ${db} counts:`, rows[0]);
        }
        next();
      });
    });
  }
  
  next();
});
