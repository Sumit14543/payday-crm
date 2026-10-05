const mysql = require('mysql');
const crypto = require('crypto');
const { config } = require('../config/env');

const [, , email, name, password] = process.argv;

if (!email || !name || !password) {
  console.log('Usage: node scripts/generateSuperadmin.js <email> <name> <password>');
  process.exit(1);
}

const MASTER_DB_NAME = process.env.DB_MASTER_NAME || `${process.env.DB_PREFIX || ''}payday_crm_master`;

async function main() {
  console.log(`Connecting to Master DB: ${MASTER_DB_NAME}...`);
  const connection = mysql.createConnection({
    host: config.db.host,
    user: config.db.user,
    password: config.db.password,
    port: config.db.port,
    database: MASTER_DB_NAME,
    multipleStatements: true,
  });

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, 'sha256').toString('hex');

  connection.query(
    `
      INSERT INTO superadmins (name, email, password_hash, password_salt, is_active)
      VALUES (?, ?, ?, ?, 1)
      ON DUPLICATE KEY UPDATE 
        name = VALUES(name),
        password_hash = VALUES(password_hash),
        password_salt = VALUES(password_salt),
        is_active = 1
    `,
    [name, String(email).trim().toLowerCase(), hash, salt],
    (error) => {
      connection.end();
      if (error) {
        console.error('❌ Failed to create superadmin:', error);
        process.exit(1);
      } else {
        console.log(`\n✅ Superadmin created/updated successfully!`);
        console.log(`   Email: ${email}`);
        console.log(`   Name: ${name}`);
        console.log(`   Password: ${password}`);
        process.exit(0);
      }
    }
  );
}

main();
