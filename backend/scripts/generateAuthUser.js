const crypto = require('crypto');

const [, , email, name, role, password] = process.argv;
const validRoles = new Set(['telecaller', 'credit-manager', 'accountant']);

if (!email || !name || !role || !password || !validRoles.has(role)) {
  console.error('Usage: node scripts/generateAuthUser.js <email> <name> <telecaller|credit-manager|accountant> <password>');
  process.exit(1);
}

const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, 'sha256').toString('hex');

console.log(JSON.stringify({
  email: String(email).trim().toLowerCase(),
  hash,
  name,
  role,
  salt,
}, null, 2));
