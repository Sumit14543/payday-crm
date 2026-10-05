const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// Load .env manually
try {
  const envPath = path.join(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach(line => {
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
        process.env[key] = value;
      }
    });
  }
} catch (e) {}

const { connectDatabase, query } = require('../config/db');

function getCashfreeConfig() {
  const appId = String(process.env.CASHFREE_CLIENT_ID || process.env.CASHFREE_APP_ID || '').trim();
  const secretKey = String(process.env.CASHFREE_CLIENT_SECRET || process.env.CASHFREE_SECRET_KEY || '').trim();
  const explicitEnv = String(process.env.CASHFREE_ENV || 'PROD').trim().toUpperCase();
  const isTestKey = secretKey.includes('_test_') || appId.includes('_test_') || secretKey.startsWith('cfsk_ma_test_');
  const env = isTestKey ? 'TEST' : (explicitEnv || 'PROD');
  const baseUrl = env === 'PROD' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';
  const webhookSecret = process.env.CASHFREE_WEBHOOK_SECRET || secretKey;

  return { appId, secretKey, env, baseUrl, webhookSecret };
}

function cashfreeRequest(method, endpoint, bodyData = null) {
  const { appId, secretKey, baseUrl } = getCashfreeConfig();
  const cleanEndpoint = endpoint.startsWith('/pg/') ? endpoint.slice(3) : endpoint;
  const url = new URL(`${baseUrl}${cleanEndpoint.startsWith('/') ? '' : '/'}${cleanEndpoint}`);

  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const payloadString = bodyData ? JSON.stringify(bodyData) : '';

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      method: method.toUpperCase(),
      headers: {
        'x-client-id': appId,
        'x-client-secret': secretKey,
        'x-api-version': '2023-08-01',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    };

    if (payloadString) {
      options.headers['Content-Length'] = Buffer.byteLength(payloadString);
    }

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ statusCode: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ statusCode: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (payloadString) req.write(payloadString);
    req.end();
  });
}

async function debugSub() {
  try {
    await connectDatabase();
    const rows = await query(`
      SELECT application_id, emandate_provider, emandate_status, emandate_id, emandate_ref_id, emandate_plan_name, emandate_registered_at
      FROM loan_applications
      WHERE emandate_id LIKE '%1789470281214%' OR application_id LIKE '%005000%'
      LIMIT 5
    `);
    console.log('=== DB ROWS ===');
    console.log(JSON.stringify(rows, null, 2));

    if (rows.length > 0 && rows[0].emandate_id) {
      const subId = rows[0].emandate_id;
      console.log(`\n=== Calling Cashfree GET /pg/subscriptions/${subId} ===`);
      const cfRes = await cashfreeRequest('GET', `/pg/subscriptions/${encodeURIComponent(subId)}`);
      console.log(JSON.stringify(cfRes, null, 2));
    }
  } catch (err) {
    console.error('Error:', err);
  }
  process.exit(0);
}

debugSub();
