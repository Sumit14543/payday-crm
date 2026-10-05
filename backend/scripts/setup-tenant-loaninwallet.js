const mysql = require('mysql');
require('../config/env');
const { provisionTenant } = require('../services/tenantProvisionerService');

const MASTER_DB_NAME = process.env.DB_MASTER_NAME || `waqtmoney_payday_crm_master`;

const dbHost = process.env.DB_HOST || 'localhost';
const dbUser = process.env.DB_USER || 'root';
const dbPass = process.env.DB_PASS || '';
const dbPort = Number(process.env.DB_PORT || 3306);

async function setupLoanInWalletTenant() {
  console.log('Starting Loan In Wallet tenant setup...');

  const connection = mysql.createConnection({
    host: dbHost,
    user: dbUser,
    password: dbPass,
    port: dbPort,
  });

  const tenantObj = {
    name: 'Loan In Wallet',
    slug: 'loaninwallet',
    db_host: dbHost,
    db_user: dbUser,
    db_password: dbPass,
    db_name: process.env.DB_NAME_LOANINWALLET || 'waqtmoney_payday_loaninwallet',
    db_port: dbPort,
    status: 'active',
    cin: 'CIN-U67120RJ1995PTC009521',
    gstin: 'GSTIN : 08AAACW1509R1ZX',
    website: 'www.loaninwallet.com',
    lender: 'WAQT FINANCE PRIVATE LIMITED',
    address: '15 K- 5 Jyoti Nagar Housing Board Colony, Sahakar Marg, Jaipur, Rajasthan 302005',
    phone: '+91 92170 86608',
    email: 'customercare@loaninwallet.com',
    logo_url: '/logo-loaninwallet.png',
    theme_color: '#0284c7',
  };

  await new Promise((resolve, reject) => {
    connection.connect((err) => {
      if (err) return reject(err);
      resolve();
    });
  });

  // Ensure master database exists
  await new Promise((resolve, reject) => {
    connection.query(`CREATE DATABASE IF NOT EXISTS \`${MASTER_DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });

  // Ensure master tenants table exists
  await new Promise((resolve, reject) => {
    connection.query(`
      CREATE TABLE IF NOT EXISTS \`${MASTER_DB_NAME}\`.tenants (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(80) NOT NULL UNIQUE,
        db_host VARCHAR(255) DEFAULT 'localhost',
        db_user VARCHAR(255) DEFAULT 'root',
        db_password VARCHAR(255) DEFAULT '',
        db_name VARCHAR(255) NOT NULL,
        db_port INT DEFAULT 3306,
        status ENUM('active', 'suspended', 'inactive') DEFAULT 'active',
        cin VARCHAR(100) DEFAULT NULL,
        gstin VARCHAR(100) DEFAULT NULL,
        website VARCHAR(255) DEFAULT NULL,
        lender VARCHAR(255) DEFAULT NULL,
        address TEXT DEFAULT NULL,
        phone VARCHAR(50) DEFAULT NULL,
        email VARCHAR(255) DEFAULT NULL,
        logo_url VARCHAR(255) DEFAULT NULL,
        theme_color VARCHAR(20) DEFAULT '#0284c7',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });

  // Upsert loaninwallet tenant record
  await new Promise((resolve, reject) => {
    const upsertSql = `
      INSERT INTO \`${MASTER_DB_NAME}\`.tenants
        (name, slug, db_host, db_user, db_password, db_name, db_port, status, cin, gstin, website, lender, address, phone, email, logo_url, theme_color)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        db_host = VALUES(db_host),
        db_user = VALUES(db_user),
        db_password = VALUES(db_password),
        db_name = VALUES(db_name),
        db_port = VALUES(db_port),
        status = VALUES(status),
        cin = VALUES(cin),
        gstin = VALUES(gstin),
        website = VALUES(website),
        lender = VALUES(lender),
        address = VALUES(address),
        phone = VALUES(phone),
        email = VALUES(email),
        logo_url = VALUES(logo_url),
        theme_color = VALUES(theme_color)
    `;

    const values = [
      tenantObj.name,
      tenantObj.slug,
      tenantObj.db_host,
      tenantObj.db_user,
      tenantObj.db_password,
      tenantObj.db_name,
      tenantObj.db_port,
      tenantObj.status,
      tenantObj.cin,
      tenantObj.gstin,
      tenantObj.website,
      tenantObj.lender,
      tenantObj.address,
      tenantObj.phone,
      tenantObj.email,
      tenantObj.logo_url,
      tenantObj.theme_color,
    ];

    connection.query(upsertSql, values, (err, result) => {
      if (err) return reject(err);
      console.log(`Master tenant record registered/updated for '${tenantObj.slug}'.`);
      resolve(result);
    });
  });

  connection.end();

  // Provision tenant database, schema and seed users
  console.log(`Provisioning database '${tenantObj.db_name}'...`);
  await provisionTenant(tenantObj);

  console.log(`Setup complete for Loan In Wallet tenant ('${tenantObj.slug}')!`);
}

setupLoanInWalletTenant()
  .then(() => {
    console.log('Loan In Wallet Tenant successfully setup!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Failed to setup Loan In Wallet Tenant:', err);
    process.exit(1);
  });
