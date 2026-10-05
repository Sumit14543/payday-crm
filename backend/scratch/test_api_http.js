const mysql = require('mysql');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

console.log("=== SIMULATING HTTP API REQUEST TO PRODUCTION ===");

// 1. Get user details from database u368199755_waqt_db
const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || process.env.DB_PASS,
});

connection.connect();

connection.query("SELECT id, email, role, full_name FROM users WHERE role = 'superadmin' OR email LIKE '%admin%' LIMIT 1", (err, users) => {
  if (err || !users.length) {
    console.error("Failed to fetch admin user:", err);
    connection.end();
    return;
  }
  const user = users[0];
  console.log("Fetched user for token generation:", user);

  // 2. Generate JWT Token using server's JWT_SECRET
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.full_name },
    process.env.JWT_SECRET || 'secret',
    { expiresIn: '1h' }
  );

  console.log("Generated JWT Token successfully.");

  // 3. Make HTTP request to https://payday-api.waqtmoney.com/api/collections
  const url = 'https://payday-api.waqtmoney.com/api/collections';
  console.log("Making fetch request to production URL:", url);

  fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Tenant-Slug': 'payday',
      'User-Agent': 'node'
    }
  })
  .then(res => {
    console.log("HTTP Response Status:", res.status);
    return res.json();
  })
  .then(data => {
    if (Array.isArray(data)) {
      const cases = data.filter(c => c.loanId === 'LNWQTMN02721');
      console.log("HTTP Response cases matching LNWQTMN02721:");
      console.log(JSON.stringify(cases, null, 2));
    } else {
      console.log("Unexpected HTTP Response structure:", data);
    }
    connection.end();
  })
  .catch(fetchErr => {
    console.error("HTTP Fetch failed:", fetchErr);
    connection.end();
  });
});
