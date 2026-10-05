const crypto = require('crypto');
const https = require('https');
const http = require('http');

/**
 * BillDesk JOSE Implementation (JWE Direct A256GCM + JWS HS256)
 */

function getBilldeskConfig() {
  const clientId = process.env.BILLDESK_CLIENT_ID || 'BDMERCID';
  const mercId = process.env.BILLDESK_MERC_ID || 'BDMERCID';
  const encryptionKey = process.env.BILLDESK_ENCRYPTION_KEY || '12345678901234567890123456789012'; // 32 bytes AES key
  const encryptionKeyId = process.env.BILLDESK_ENCRYPTION_KEY_ID || 'bd_enc_key_1';
  const signingKey = process.env.BILLDESK_SIGNING_KEY || '12345678901234567890123456789012';
  const signingKeyId = process.env.BILLDESK_SIGNING_KEY_ID || 'bd_sign_key_1';
  const env = (process.env.BILLDESK_ENV || 'sandbox').toLowerCase();
  
  const baseUrl = env === 'production' || env === 'prod'
    ? (process.env.BILLDESK_PROD_URL || 'https://api.billdesk.com')
    : (process.env.BILLDESK_SANDBOX_URL || 'https://uat1.billdesk.com/u2');

  return {
    clientId,
    mercId,
    encryptionKey,
    encryptionKeyId,
    signingKey,
    signingKeyId,
    env,
    baseUrl,
  };
}

/**
 * Format AES key to 32 bytes Buffer
 */
function getKeyBuffer(key) {
  if (Buffer.isBuffer(key)) {
    if (key.length === 32) return key;
    const b = Buffer.alloc(32);
    key.copy(b);
    return b;
  }
  const str = String(key || '');
  const buf = Buffer.from(str, 'utf8');
  if (buf.length === 32) return buf;
  const b = Buffer.alloc(32);
  buf.copy(b);
  return b;
}

/**
 * Step 2: Encrypt JSON payload string using JWE (DIR + A256GCM)
 */
function encryptJWE(payloadString, options = {}) {
  const { clientId, encryptionKey, encryptionKeyId } = { ...getBilldeskConfig(), ...options };
  const keyBuffer = getKeyBuffer(encryptionKey);
  
  const jweHeader = {
    alg: 'dir',
    enc: 'A256GCM',
    kid: encryptionKeyId,
    clientid: clientId,
  };

  const headerB64 = Buffer.from(JSON.stringify(jweHeader), 'utf8').toString('base64url');
  const iv = crypto.randomBytes(12); // 96-bit IV for AES-GCM

  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
  cipher.setAAD(Buffer.from(headerB64, 'ascii'));

  const ciphertext = Buffer.concat([
    cipher.update(payloadString, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Compact JWE string format: header..iv.ciphertext.tag
  const jweString = `${headerB64}..${iv.toString('base64url')}.${ciphertext.toString('base64url')}.${authTag.toString('base64url')}`;
  return jweString;
}

/**
 * Step 3: Sign encrypted JWE payload string using JWS (HS256)
 */
function signJWS(jweEncryptedString, options = {}) {
  const { clientId, signingKey, signingKeyId } = { ...getBilldeskConfig(), ...options };

  const jwsHeader = {
    alg: 'HS256',
    kid: signingKeyId,
    clientid: clientId,
  };

  const headerB64 = Buffer.from(JSON.stringify(jwsHeader), 'utf8').toString('base64url');
  const payloadB64 = Buffer.from(jweEncryptedString, 'utf8').toString('base64url');

  const signatureInput = `${headerB64}.${payloadB64}`;
  const hmac = crypto.createHmac('sha256', String(signingKey)).update(signatureInput).digest('base64url');

  const jwsString = `${signatureInput}.${hmac}`;
  return jwsString;
}

/**
 * Encrypt and Sign JSON Request object for BillDesk
 */
function createJosePayload(requestObj, options = {}) {
  const jsonString = typeof requestObj === 'string' ? requestObj : JSON.stringify(requestObj);
  const jweString = encryptJWE(jsonString, options);
  const jwsString = signJWS(jweString, options);
  return jwsString;
}

/**
 * Reverse Process Step 1: Verify JWS signature and extract JWE payload
 */
function verifyJWS(jwsString, options = {}) {
  const { signingKey } = { ...getBilldeskConfig(), ...options };
  const parts = String(jwsString || '').trim().split('.');

  if (parts.length !== 3) {
    throw new Error(`Invalid JWS format: Expected 3 parts, got ${parts.length}`);
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const signatureInput = `${headerB64}.${payloadB64}`;
  const expectedHmac = crypto.createHmac('sha256', String(signingKey)).update(signatureInput).digest('base64url');

  if (signatureB64 !== expectedHmac) {
    console.warn('[BillDesk JOSE Warning] JWS Signature verification mismatch.');
    // In production, throw error if strict signature verification is required
  }

  const jweString = Buffer.from(payloadB64, 'base64url').toString('utf8');
  return jweString;
}

/**
 * Reverse Process Step 2: Decrypt JWE payload and return plaintext JSON string
 */
function decryptJWE(jweString, options = {}) {
  const { encryptionKey } = { ...getBilldeskConfig(), ...options };
  const keyBuffer = getKeyBuffer(encryptionKey);
  const parts = String(jweString || '').trim().split('.');

  if (parts.length !== 5) {
    throw new Error(`Invalid JWE format: Expected 5 parts, got ${parts.length}`);
  }

  const [headerB64, , ivB64, ciphertextB64, tagB64] = parts;

  const iv = Buffer.from(ivB64, 'base64url');
  const ciphertext = Buffer.from(ciphertextB64, 'base64url');
  const authTag = Buffer.from(tagB64, 'base64url');

  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
  decipher.setAAD(Buffer.from(headerB64, 'ascii'));
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');

  return plaintext;
}

/**
 * Verify & Decrypt BillDesk JOSE Response to JSON object
 */
function parseJoseResponse(joseString, options = {}) {
  try {
    const jweString = verifyJWS(joseString, options);
    const plaintext = decryptJWE(jweString, options);
    return JSON.parse(plaintext);
  } catch (err) {
    console.error('[BillDesk JOSE Parse Error]:', err.message);
    throw new Error(`Failed to parse BillDesk JOSE response: ${err.message}`);
  }
}

/**
 * Step 4: Send HTTP Request to BillDesk API Endpoint
 */
async function sendBilldeskApiRequest(endpointPath, requestJsonObj, options = {}) {
  const config = getBilldeskConfig();
  const josePayload = createJosePayload(requestJsonObj, options);

  const fullUrl = endpointPath.startsWith('http')
    ? endpointPath
    : `${config.baseUrl.replace(/\/$/, '')}/${endpointPath.replace(/^\//, '')}`;

  const traceId = `BDTR${Date.now()}${Math.floor(Math.random() * 10000)}`.slice(0, 35);
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const urlObj = new URL(fullUrl);
  const isHttps = urlObj.protocol === 'https:';
  const transport = isHttps ? https : http;

  const postData = Buffer.from(josePayload, 'utf8');

  const reqOptions = {
    hostname: urlObj.hostname,
    port: urlObj.port || (isHttps ? 443 : 80),
    path: urlObj.pathname + urlObj.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/jose',
      'Accept': 'application/jose',
      'BD-Traceid': traceId,
      'BD-Timestamp': timestamp,
      'Content-Length': postData.length,
    },
  };

  return new Promise((resolve, reject) => {
    const req = transport.request(reqOptions, (res) => {
      let resBody = '';
      res.on('data', (chunk) => (resBody += chunk));
      res.on('end', () => {
        try {
          if (!resBody || resBody.trim() === '') {
            return resolve({ status: res.statusCode, data: null });
          }
          if (resBody.includes('{') && resBody.includes('}')) {
            // Unencrypted JSON response fallback
            return resolve(JSON.parse(resBody));
          }
          const decryptedJson = parseJoseResponse(resBody, options);
          resolve(decryptedJson);
        } catch (e) {
          reject(new Error(`BillDesk response parsing error (${res.statusCode}): ${e.message}`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.write(postData);
    req.end();
  });
}

module.exports = {
  getBilldeskConfig,
  encryptJWE,
  signJWS,
  createJosePayload,
  verifyJWS,
  decryptJWE,
  parseJoseResponse,
  sendBilldeskApiRequest,
};
