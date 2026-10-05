const mysql = require('mysql');
const { config } = require('../config/env');

// Master DB name
const MASTER_DB_NAME = process.env.DB_MASTER_NAME || `${process.env.DB_PREFIX || ''}payday_crm_master`;

function getMasterConnectionConfig() {
  return {
    host: config.db.host,
    user: config.db.user,
    password: config.db.password,
    port: config.db.port,
    multipleStatements: true,
  };
}

async function createMasterDbIfNeeded() {
  if (!config.db.autoCreate) {
    console.log(`[DB] Master DB auto-creation is disabled (DB_AUTO_CREATE=false). Skipping creation for: ${MASTER_DB_NAME}`);
    return Promise.resolve();
  }

  const connection = mysql.createConnection(getMasterConnectionConfig());
  return new Promise((resolve, reject) => {
    connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${MASTER_DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
      (error) => {
        connection.end();
        if (error) {
          error.database = MASTER_DB_NAME;
          reject(error);
        } else {
          resolve();
        }
      }
    );
  });
}

function queryMaster(connection, sql, params = []) {
  return new Promise((resolve, reject) => {
    connection.query(sql, params, (error, results) => {
      if (error) {
        error.database = MASTER_DB_NAME;
        reject(error);
      } else {
        resolve(results);
      }
    });
  });
}

async function migrateMaster() {
  await createMasterDbIfNeeded();
  
  const connection = mysql.createConnection({
    ...getMasterConnectionConfig(),
    database: MASTER_DB_NAME,
  });

  try {
    // 1. Tenants table
    await queryMaster(connection, `
      CREATE TABLE IF NOT EXISTS tenants (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(100) NOT NULL,
        db_host VARCHAR(255) DEFAULT NULL,
        db_user VARCHAR(255) DEFAULT NULL,
        db_password VARCHAR(255) DEFAULT NULL,
        db_name VARCHAR(255) NOT NULL,
        db_port INT DEFAULT NULL,
        status ENUM('active','suspended') DEFAULT 'active',
        cin VARCHAR(100) DEFAULT NULL,
        gstin VARCHAR(100) DEFAULT NULL,
        website VARCHAR(255) DEFAULT NULL,
        lender VARCHAR(255) DEFAULT NULL,
        address TEXT DEFAULT NULL,
        phone VARCHAR(50) DEFAULT NULL,
        email VARCHAR(150) DEFAULT NULL,
        logo_url VARCHAR(255) DEFAULT NULL,
        theme_color VARCHAR(50) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_tenants_slug (slug),
        UNIQUE KEY uq_tenants_db (db_name),
        INDEX idx_tenants_slug_status (slug, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Helper function to add columns if they don't exist
    const addColumn = async (columnName, definition) => {
      try {
        await queryMaster(connection, `ALTER TABLE tenants ADD COLUMN ${columnName} ${definition}`);
      } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') {
          console.error(`Error adding column ${columnName} to tenants:`, err);
        }
      }
    };

    await addColumn('cin', 'VARCHAR(100) DEFAULT NULL');
    await addColumn('gstin', 'VARCHAR(100) DEFAULT NULL');
    await addColumn('website', 'VARCHAR(255) DEFAULT NULL');
    await addColumn('lender', 'VARCHAR(255) DEFAULT NULL');
    await addColumn('address', 'TEXT DEFAULT NULL');
    await addColumn('phone', 'VARCHAR(50) DEFAULT NULL');
    await addColumn('email', 'VARCHAR(150) DEFAULT NULL');
    await addColumn('logo_url', 'VARCHAR(255) DEFAULT NULL');
    await addColumn('theme_color', 'VARCHAR(50) DEFAULT NULL');

    // 2. Superadmins table
    await queryMaster(connection, `
      CREATE TABLE IF NOT EXISTS superadmins (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        email VARCHAR(160) NOT NULL,
        password_hash VARCHAR(128) NOT NULL,
        password_salt VARCHAR(64) NOT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_superadmins_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('Master database migration completed.');
  } finally {
    connection.end();
  }
}

async function seedMaster() {
  const connection = mysql.createConnection({
    ...getMasterConnectionConfig(),
    database: MASTER_DB_NAME,
  });

  try {
    // Seed default superadmin: admin@paydaycrm.com / Sanjay@#2026@#
    const email = 'admin@paydaycrm.com';
    const name = 'CRM Superadmin';
    const salt = '45fc08e36726dcad454fdc48a13b0c61';
    const superadminHash = 'a98cb65017271ac0480300711827d1c0847279d1cd3a0f63d5657b44da832355'; // Sanjay@#2026@#
    const productadminHash = 'aa685e02f752d8ed815bd246a6fd721ed2376e170b4758bf70ececdc431b4521'; // Bhupendra@#2026@#

    await queryMaster(connection, `
      INSERT INTO superadmins (name, email, password_hash, password_salt, is_active)
      VALUES (?, ?, ?, ?, 1)
      ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash), password_salt = VALUES(password_salt)
    `, [name, email, superadminHash, salt]);

    // Seed default product admin: productadmin@paydaycrm.com / Bhupendra@#2026@#
    await queryMaster(connection, `
      INSERT INTO superadmins (name, email, password_hash, password_salt, is_active)
      VALUES (?, ?, ?, ?, 1)
      ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash), password_salt = VALUES(password_salt)
    `, ['Product Admin', 'productadmin@paydaycrm.com', productadminHash, salt]);

    // Seed default tenant for Waqt Finance (using existing DB config details)
    const existingDbName = config.db.database;
    await queryMaster(connection, `
      INSERT INTO tenants (name, slug, db_name, status, cin, gstin, website, lender, address, phone, email, logo_url, theme_color)
      VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
        name = VALUES(name), 
        db_name = VALUES(db_name),
        cin = VALUES(cin),
        gstin = VALUES(gstin),
        website = VALUES(website),
        lender = VALUES(lender),
        address = VALUES(address),
        phone = VALUES(phone),
        email = VALUES(email),
        logo_url = VALUES(logo_url),
        theme_color = VALUES(theme_color)
    `, [
      'Waqt Finance', 
      'waqtfinance', 
      existingDbName,
      'CIN-U67120RJ1995PTC009521',
      'GSTIN : 08AAACW1509R1ZX',
      'www.waqtfinance.com',
      'WAQT FINANCE PRIVATE LIMITED',
      '15 K- 5 Jyoti Nagar Housing Board Colony, Sahakar Marg, Jaipur, Rajasthan 302005',
      '+91 92170 86608',
      'customercare@waqtfinance.com',
      '/logo.webp',
      '#059669'
    ]);

    // Seed GeetPay
    await queryMaster(connection, `
      INSERT INTO tenants (name, slug, db_name, status, cin, gstin, website, lender, address, phone, email, logo_url, theme_color)
      VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
        name = VALUES(name), 
        db_name = VALUES(db_name),
        cin = VALUES(cin),
        gstin = VALUES(gstin),
        website = VALUES(website),
        lender = VALUES(lender),
        address = VALUES(address),
        phone = VALUES(phone),
        email = VALUES(email),
        logo_url = VALUES(logo_url),
        theme_color = VALUES(theme_color)
    `, [
      'GeetPay', 
      'geetpay', 
      `${process.env.DB_PREFIX || ''}payday_geetpay`,
      'CIN-U67120DL2021PTC384501',
      'GSTIN : 07AAACG5091R1ZN',
      'www.geetpay.in',
      'GEETPAY SERVICES PRIVATE LIMITED',
      'B-42, Connaught Place, New Delhi, Delhi 110001',
      '+91 98765 43210',
      'support@geetpay.in',
      '/logo-geetpay.png',
      '#16a34a'
    ]);

    // Seed LoanInWallet
    await queryMaster(connection, `
      INSERT INTO tenants (name, slug, db_name, status, cin, gstin, website, lender, address, phone, email, logo_url, theme_color)
      VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
        name = VALUES(name), 
        db_name = VALUES(db_name),
        cin = VALUES(cin),
        gstin = VALUES(gstin),
        website = VALUES(website),
        lender = VALUES(lender),
        address = VALUES(address),
        phone = VALUES(phone),
        email = VALUES(email),
        logo_url = VALUES(logo_url),
        theme_color = VALUES(theme_color)
    `, [
      'LoanInWallet', 
      'loaninwallet', 
      `${process.env.DB_PREFIX || ''}payday_loaninwallet`,
      'CIN-U65999MH2020PTC342801',
      'GSTIN : 27AAACL3428R2ZP',
      'www.loaninwallet.com',
      'LOANINWALLET TECH PRIVATE LIMITED',
      'Level 5, Platina, G Block, Bandra Kurla Complex, Mumbai, Maharashtra 400051',
      '+91 99999 88888',
      'help@loaninwallet.com',
      '/logo.webp',
      '#8b5cf6'
    ]);

    // Seed SalaryWaves
    await queryMaster(connection, `
      INSERT INTO tenants (name, slug, db_name, status, cin, gstin, website, lender, address, phone, email, logo_url, theme_color)
      VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
        name = VALUES(name), 
        db_name = VALUES(db_name),
        cin = VALUES(cin),
        gstin = VALUES(gstin),
        website = VALUES(website),
        lender = VALUES(lender),
        address = VALUES(address),
        phone = VALUES(phone),
        email = VALUES(email),
        logo_url = VALUES(logo_url),
        theme_color = VALUES(theme_color)
    `, [
      'SalaryWaves', 
      'salarywaves', 
      `${process.env.DB_PREFIX || ''}payday_salarywaves`,
      'CIN-U72900KA2022PTC160201',
      'GSTIN : 29AAACS1602R1ZQ',
      'www.salarywaves.com',
      'SALARYWAVES FINTECH PRIVATE LIMITED',
      '12th Floor, UB City, Vittal Mallya Road, Bengaluru, Karnataka 560001',
      '+91 90000 70000',
      'contact@salarywaves.com',
      '/logo.webp',
      '#f97316'
    ]);

    console.log('Master database seeding completed.');
  } finally {
    connection.end();
  }
}

module.exports = {
  MASTER_DB_NAME,
  createMasterDbIfNeeded,
  migrateMaster,
  seedMaster,
  getMasterConnectionConfig,
};
