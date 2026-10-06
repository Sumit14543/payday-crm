const mysql = require('mysql');
const crypto = require('crypto');
const { config } = require('../config/env');

const PASSWORD_ITERATIONS = 120000;

const [, , tenantSlug, role, email, newPassword] = process.argv;
const validRoles = new Set(['telecaller', 'credit-manager', 'accountant', 'collection']);

if (!tenantSlug || !role || !email || !newPassword) {
  console.log('\n❌ Missing arguments!');
  console.log('Usage: node scripts/changeUserPassword.js <tenant_slug> <role> <email> <new_password>');
  console.log('Example: node scripts/changeUserPassword.js geetpay telecaller telecaller@geetpay.com MyNewPassword123');
  console.log('Example: node scripts/changeUserPassword.js waqtfinance credit shruti@waqtmoney.in WaqtNewPass786\n');
  process.exit(1);
}

if (!validRoles.has(role)) {
  console.log(`\n❌ Invalid role! Must be one of: ${Array.from(validRoles).join(', ')}\n`);
  process.exit(1);
}

// Determine database name based on tenant slug
let dbName;
if (tenantSlug === 'waqtfinance') {
  dbName = config.db.database;
} else {
  const dbPrefix = process.env.DB_PREFIX || '';
  dbName = `${dbPrefix}payday_${tenantSlug}`;
}

const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.pbkdf2Sync(String(newPassword), salt, PASSWORD_ITERATIONS, 32, 'sha256').toString('hex');

const sqlQuery = `UPDATE \`${dbName}\`.crm_users SET password_salt = '${salt}', password_hash = '${hash}', is_active = 1 WHERE email = '${email.trim().toLowerCase()}' AND role = '${role}';`;

console.log('========================================================');
console.log('🔑 CREDENTIALS GENERATION');
console.log('========================================================');
console.log(`Tenant Slug : ${tenantSlug}`);
console.log(`Database    : ${dbName}`);
console.log(`User Email  : ${email}`);
console.log(`User Role   : ${role}`);
console.log(`New Password: ${newPassword}`);
console.log('\n--------------------------------------------------------');
console.log('📊 SQL QUERY FOR phpMyAdmin / DATABASE CLIENT:');
console.log('--------------------------------------------------------');
console.log(sqlQuery);
console.log('--------------------------------------------------------\n');

console.log('Attempting to update database directly...');
const connection = mysql.createConnection({
  host: config.db.host,
  user: config.db.user,
  password: config.db.password,
  port: config.db.port,
  database: dbName,
});

connection.connect((err) => {
  if (err) {
    console.log(`❌ Database connection failed: ${err.message}`);
    console.log('💡 You can run the SQL query above manually in your phpMyAdmin / hosting database panel.');
    process.exit(0);
  }

  connection.query(
    'UPDATE crm_users SET password_salt = ?, password_hash = ?, is_active = 1 WHERE email = ? AND role = ?',
    [salt, hash, email.trim().toLowerCase(), role],
    (error, results) => {
      connection.end();
      if (error) {
        console.log(`❌ Update failed: ${error.message}`);
      } else if (results.affectedRows === 0) {
        console.log('⚠️  User not found! No rows were updated. Check if the email and role are correct.');
      } else {
        console.log('✅ Success! Credentials updated successfully in the database.');
      }
      process.exit(0);
    }
  );
});
