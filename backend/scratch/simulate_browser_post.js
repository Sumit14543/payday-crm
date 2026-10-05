const mysql = require('mysql');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

console.log("=== SIMULATING ROUTING IN EXPRESS ===");

const app = require('../app');

// Let's query the database to get an admin user token
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
  connection.end();

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.full_name },
    process.env.JWT_SECRET || 'secret',
    { expiresIn: '1h' }
  );

  // Mock Request
  const req = {
    method: 'POST',
    url: '/api/collections/list',
    headers: {
      'authorization': `Bearer ${token}`,
      'x-tenant-slug': 'payday',
      'content-type': 'application/json',
      'host': 'payday-api.waqtmoney.com'
    },
    get: function(header) { return this.headers[header.toLowerCase()]; },
    body: {}
  };

  // Mock Response
  const res = {
    statusCode: 200,
    headers: {},
    setHeader: function(name, val) { this.headers[name] = val; },
    status: function(code) {
      this.statusCode = code;
      return this;
    },
    json: function(data) {
      console.log(`Express responded with status: ${this.statusCode}`);
      console.log("Response JSON:", data);
    },
    end: function(data) {
      console.log(`Express ended with status: ${this.statusCode}`);
      if (data) console.log("Response End Data:", data);
    }
  };

  console.log("Sending mock request to app.handle()...");
  app(req, res, (err) => {
    if (err) {
      console.error("Express routing error:", err);
    } else {
      console.log("Express completed request cycle (no routes matched or next called). Final status:", res.statusCode);
    }
  });
});
