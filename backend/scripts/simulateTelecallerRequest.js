const { createToken } = require('../middleware/auth');
const http = require('http');

// Jyoti user info
const user = {
  id: 3210,
  email: 'jyoti@waqtfinance.com',
  name: 'Jyoti',
  role: 'telecaller',
};

const token = createToken(user);
console.log("Simulating request for user:", user);
console.log("Generated JWT Token:", token);

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: process.env.PORT || 5000,
      path: path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Tenant-Slug': 'waqtfinance',
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ statusCode: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ statusCode: res.statusCode, rawBody: data });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.end();
  });
}

async function run() {
  try {
    const res1 = await makeRequest('/api/leads/telecaller-workbench-v2');
    console.log("\nResponse from /api/leads/telecaller-workbench-v2:");
    console.log("Status Code:", res1.statusCode);
    if (res1.body && res1.body.success) {
      console.log("Success: true");
      console.log("Total Items in Pagination:", res1.body.data?.pagination?.totalItems);
      console.log("Items Count returned:", res1.body.data?.items?.length);
      if (res1.body.data?.items?.length > 0) {
        console.log("First item assigned to:", res1.body.data.items[0].assignedTo);
      }
    } else {
      console.log("Failed response:", res1.body || res1.rawBody);
    }

    const res2 = await makeRequest('/api/leads');
    console.log("\nResponse from /api/leads:");
    console.log("Status Code:", res2.statusCode);
    if (res2.body && res2.body.success) {
      console.log("Success: true");
      console.log("Leads Count:", res2.body.data?.length);
      if (res2.body.data?.length > 0) {
        console.log("First lead assigned to:", res2.body.data[0].assignedTo);
      }
    } else {
      console.log("Failed response:", res2.body || res2.rawBody);
    }
  } catch (err) {
    console.error("Request failed:", err);
  }
}

// Wait a bit to let server start if needed, but we assume it's running. Or we can just run it.
run();
