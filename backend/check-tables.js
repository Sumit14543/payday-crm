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
    
    if (tenants.length === 0) {
      connection.end();
      return;
    }
    
    const tenant = tenants.find(t => t.slug === 'waqtfinance') || tenants[0];
    console.log(`Querying tables in tenant db: ${tenant.db_name}`);
    
    connection.query(`SHOW TABLES FROM \`${tenant.db_name}\``, (err, tables) => {
      if (err) {
        console.error(err);
        connection.end();
        return;
      }
      
      // Let's run a query to check if lead_accounting_payments has rows
      connection.query(`SELECT COUNT(*) as count FROM \`${tenant.db_name}\`.lead_accounting_payments`, (err, res1) => {
        if (err) console.error('lead_accounting_payments err:', err);
        else console.log('lead_accounting_payments count:', res1[0].count);
        
        connection.query(`SELECT COALESCE(SUM(amount), 0) as total FROM \`${tenant.db_name}\`.lead_accounting_payments`, (err, res2) => {
          if (err) console.error('lead_accounting_payments SUM err:', err);
          else console.log('lead_accounting_payments SUM:', res2[0].total);
          
          connection.query(`SELECT COALESCE(SUM(principal), 0) as total_p, COALESCE(SUM(principal - amount_paid), 0) as outstanding FROM \`${tenant.db_name}\`.loans`, (err, res3) => {
            if (err) console.error('loans SUM err:', err);
            else console.log('loans principal SUM:', res3[0].total_p, 'outstanding:', res3[0].outstanding);
            
            connection.end();
          });
        });
      });
    });
  });
});
