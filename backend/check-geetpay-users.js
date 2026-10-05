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
    console.log(`\nChecking database: ${db}`);
    connection.query(`USE \`${db}\``, (err) => {
      if (err) {
        console.error(`Database ${db} not found or inaccessible:`, err.message);
        next();
        return;
      }
      
      connection.query('SHOW TABLES', (err, tables) => {
        if (err) {
          console.error(err);
          next();
          return;
        }
        const tblNames = tables.map(r => Object.values(r)[0]);
        console.log('Tables:', tblNames.slice(0, 8), '... total:', tblNames.length);
        
        const queries = [];
        if (tblNames.includes('loan_applications')) queries.push('SELECT COUNT(*) AS apps FROM loan_applications');
        if (tblNames.includes('loans')) queries.push('SELECT COUNT(*) AS loans FROM loans');
        if (tblNames.includes('collection_cases')) queries.push('SELECT COUNT(*) AS cases FROM collection_cases');
        if (tblNames.includes('lead_accounting_payments')) queries.push('SELECT COUNT(*) AS payments FROM lead_accounting_payments');
        
        if (queries.length === 0) {
          next();
          return;
        }
        
        const promises = queries.map(q => new Promise((resolve) => {
          connection.query(q, (err, rows) => {
            resolve({ query: q, error: err ? err.message : null, rows });
          });
        }));
        
        Promise.all(promises).then(results => {
          console.log('Counts:', results);
          next();
        });
      });
    });
  }
  
  next();
});
