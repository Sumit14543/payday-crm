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
  
  connection.query(`SELECT * FROM \`${MASTER_DB_NAME}\`.tenants`, (err, tenants) => {
    if (err) {
      console.error(err);
      connection.end();
      return;
    }
    
    let processed = 0;
    tenants.forEach(tenant => {
      console.log(`\n============================\nTenant: ${tenant.name} (${tenant.slug}) - DB: ${tenant.db_name}`);
      
      connection.query(`SELECT loan_id, COUNT(*) as cnt FROM \`${tenant.db_name}\`.lead_accounting_payments GROUP BY loan_id HAVING cnt > 1`, (err, rows) => {
        if (err) console.error('payments err:', err);
        else console.log('Duplicate payments:', rows);
        
        processed++;
        if (processed === tenants.length) {
          connection.end();
        }
      });
    });
  });
});
