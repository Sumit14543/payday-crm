const mysql = require('mysql');
const crypto = require('crypto');
const { config } = require('../config/env');

const PASSWORD_ITERATIONS = 120000;
const MASTER_DB_NAME = process.env.DB_MASTER_NAME || `${process.env.DB_PREFIX || ''}payday_crm_master`;
const TENANT_DB_NAME = config.db.database;

const CREDENTIALS = {
  superadmin: {
    email: 'support@waqtmoney.in',
    name: 'CRM Superadmin',
    password: 'Sanjay@@2026@@123##',
    salt: '45fc08e36726dcad454fdc48a13b0c61',
    hash: '71936293b3d61affbd8668ac51bb7314b4106683752c5a48f853b1e9f68bf09b',
  },
  productadmin: {
    email: 'support@waqtmoney.in',
    name: 'Waqt Support Admin',
    role: 'product-admin',
    password: 'Bhupender@@2026@321##',
    salt: '45fc08e36726dcad454fdc48a13b0c61',
    hash: '3255594cedfa74fee7a407d7932300894291f2b89f03910b73f1fb73554fea5d',
  },
};

// Verify hashes dynamically
CREDENTIALS.superadmin.hash = crypto.pbkdf2Sync(CREDENTIALS.superadmin.password, CREDENTIALS.superadmin.salt, PASSWORD_ITERATIONS, 32, 'sha256').toString('hex');
CREDENTIALS.productadmin.hash = crypto.pbkdf2Sync(CREDENTIALS.productadmin.password, CREDENTIALS.productadmin.salt, PASSWORD_ITERATIONS, 32, 'sha256').toString('hex');

console.log('================================================================');
console.log('🛡️  SUPERADMIN & PRODUCT ADMIN SECURE CREDENTIALS');
console.log('================================================================\n');

console.log('1. SUPERADMIN');
console.log(`   Email   : ${CREDENTIALS.superadmin.email}`);
console.log(`   Password: ${CREDENTIALS.superadmin.password}`);
console.log(`   Role    : superadmin`);
console.log(`   2FA OTP : MANDATORY (Email OTP will be sent to ${CREDENTIALS.superadmin.email})`);
console.log(`   Hash    : ${CREDENTIALS.superadmin.hash}\n`);

console.log('2. PRODUCT ADMIN');
console.log(`   Email   : ${CREDENTIALS.productadmin.email}`);
console.log(`   Password: ${CREDENTIALS.productadmin.password}`);
console.log(`   Role    : product-admin`);
console.log(`   2FA OTP : MANDATORY (Email OTP will be sent to ${CREDENTIALS.productadmin.email})`);
console.log(`   Hash    : ${CREDENTIALS.productadmin.hash}\n`);

const masterSql = `
-- ==============================================================
-- 1. MASTER DATABASE (${MASTER_DB_NAME})
-- ==============================================================
-- Ensure OTP columns exist on superadmins table
ALTER TABLE \`${MASTER_DB_NAME}\`.superadmins ADD COLUMN IF NOT EXISTS login_otp_code VARCHAR(10) DEFAULT NULL;
ALTER TABLE \`${MASTER_DB_NAME}\`.superadmins ADD COLUMN IF NOT EXISTS login_otp_token VARCHAR(128) DEFAULT NULL;
ALTER TABLE \`${MASTER_DB_NAME}\`.superadmins ADD COLUMN IF NOT EXISTS login_otp_expires_at DATETIME DEFAULT NULL;

-- Insert or update Superadmin account
INSERT INTO \`${MASTER_DB_NAME}\`.superadmins (name, email, password_hash, password_salt, is_active)
VALUES ('${CREDENTIALS.superadmin.name}', '${CREDENTIALS.superadmin.email}', '${CREDENTIALS.superadmin.hash}', '${CREDENTIALS.superadmin.salt}', 1)
ON DUPLICATE KEY UPDATE 
  name = VALUES(name),
  password_hash = VALUES(password_hash),
  password_salt = VALUES(password_salt),
  is_active = 1;

-- Also update any legacy admin@paydaycrm.com records
UPDATE \`${MASTER_DB_NAME}\`.superadmins 
SET email = '${CREDENTIALS.superadmin.email}',
    password_hash = '${CREDENTIALS.superadmin.hash}', 
    password_salt = '${CREDENTIALS.superadmin.salt}', 
    is_active = 1 
WHERE email = 'admin@paydaycrm.com';
`;

const tenantSql = `
-- ==============================================================
-- 2. TENANT DATABASE (${TENANT_DB_NAME})
-- ==============================================================
-- Insert or update Superadmin & Product Admin in crm_users table
INSERT INTO \`${TENANT_DB_NAME}\`.crm_users (name, email, role, password_salt, password_hash, is_active, on_duty)
VALUES 
  ('${CREDENTIALS.superadmin.name}', '${CREDENTIALS.superadmin.email}', 'superadmin', '${CREDENTIALS.superadmin.salt}', '${CREDENTIALS.superadmin.hash}', 1, 1),
  ('${CREDENTIALS.productadmin.name}', '${CREDENTIALS.productadmin.email}', 'product-admin', '${CREDENTIALS.productadmin.salt}', '${CREDENTIALS.productadmin.hash}', 1, 1),
  ('${CREDENTIALS.productadmin.name}', 'support@waqtfinance.com', 'product-admin', '${CREDENTIALS.productadmin.salt}', '${CREDENTIALS.productadmin.hash}', 1, 1)
ON DUPLICATE KEY UPDATE 
  password_hash = VALUES(password_hash),
  password_salt = VALUES(password_salt),
  is_active = 1;

UPDATE \`${TENANT_DB_NAME}\`.crm_users
SET password_salt = '${CREDENTIALS.superadmin.salt}',
    password_hash = '${CREDENTIALS.superadmin.hash}',
    is_active = 1
WHERE email = '${CREDENTIALS.superadmin.email}' AND role = 'superadmin';

UPDATE \`${TENANT_DB_NAME}\`.crm_users
SET password_salt = '${CREDENTIALS.productadmin.salt}',
    password_hash = '${CREDENTIALS.productadmin.hash}',
    is_active = 1
WHERE email IN ('${CREDENTIALS.productadmin.email}', 'support@waqtfinance.com') AND role = 'product-admin';
`;

console.log('----------------------------------------------------------------');
console.log('📋 SQL QUERIES (Copy-paste into phpMyAdmin / MySQL CLI):');
console.log('----------------------------------------------------------------');
console.log(masterSql);
console.log(tenantSql);
console.log('----------------------------------------------------------------\n');

async function executeDirectDbUpdate() {
  console.log('🔄 Checking direct MySQL connection to apply updates...');
  const conn = mysql.createConnection({
    host: config.db.host,
    user: config.db.user,
    password: config.db.password,
    port: config.db.port,
    multipleStatements: true,
  });

  conn.connect(async (err) => {
    if (err) {
      console.log(`ℹ️  Local MySQL server is offline (${err.code}).`);
      console.log('👉 Please use the SQL queries printed above to execute directly in your database panel (phpMyAdmin / cPanel).\n');
      process.exit(0);
      return;
    }

    try {
      await new Promise((resolve, reject) => {
        conn.query(masterSql + '\n' + tenantSql, (error, results) => {
          if (error) return reject(error);
          resolve(results);
        });
      });
      console.log('✅ Direct database update succeeded on local database!');
    } catch (dbErr) {
      console.log('⚠️ Database update note:', dbErr.message);
    } finally {
      conn.end();
      process.exit(0);
    }
  });
}

executeDirectDbUpdate();
