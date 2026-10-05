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
    console.error(err);
    process.exit(1);
  }
  
  connection.query(`SELECT id, name, slug, db_name, status FROM \`${MASTER_DB_NAME}\`.tenants`, (err, rows) => {
    if (err) console.error(err);
    else console.log('Tenants in master database:', rows);
    connection.end();
  });
});
