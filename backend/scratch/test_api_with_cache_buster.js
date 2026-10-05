const mysql = require('mysql');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();

console.log("=== DIAGNOSING API CACHE / ROUTING ISSUES ===");

const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || process.env.DB_PASS,
});

connection.connect();

connection.query("SELECT id, email, role, full_name FROM users WHERE role = 'superadmin' OR email LIKE '%admin%' LIMIT 1", async (err, users) => {
  if (err || !users.length) {
    console.error("Failed to fetch admin user:", err);
    connection.end();
    return;
  }
  const user = users[0];
  connection.end();

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.full_name },
    process.env.JWT_SECRET || 'secret',
    { expiresIn: '1h' }
  );

  const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

  // Request 1: Direct POST to API without cache-buster
  try {
    const res1 = await fetch('https://payday-api.waqtmoney.com/api/collections/list', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Tenant-Slug': 'payday',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    console.log(`Request without cache-buster: Status ${res1.status}`);
    const text1 = await res1.text();
    console.log(`Response 1: ${text1.substring(0, 200)}`);
  } catch (e) {
    console.error("Request 1 failed:", e);
  }

  // Request 2: POST to API with cache-buster
  try {
    const res2 = await fetch(`https://payday-api.waqtmoney.com/api/collections/list?cb=${Date.now()}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Tenant-Slug': 'payday',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    console.log(`Request WITH cache-buster: Status ${res2.status}`);
    const text2 = await res2.text();
    console.log(`Response 2: ${text2.substring(0, 200)}`);
  } catch (e) {
    console.error("Request 2 failed:", e);
  }
});
