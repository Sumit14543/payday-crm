const baseUrl = 'https://flex-uat.crif.com/orchestrator';
let cachedToken;
let pendingToken;

function uatError(statusCode, publicMessage) {
  return Object.assign(new Error(publicMessage), { statusCode, publicMessage });
}

async function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    const payload = await response.json().catch(() => null);
    return { status: response.status, ok: response.ok, payload };
  } catch {
    throw uatError(502, 'Could not reach CRIF UAT. Please try again.');
  }
}

async function authenticate() {
  const userName = process.env.CRIF_UAT_API_USER?.trim();
  const password = process.env.CRIF_UAT_API_PASSWORD;
  if (!userName || !password) {
    throw uatError(503, 'Configure the CRIF UAT API user and password on the CRM server.');
  }

  const response = await post('/public/api-user/token', { userName, password });
  const value = response.payload?.access_token ?? response.payload?.accessToken;
  if (!response.ok || typeof value !== 'string' || !value) {
    throw uatError(502, `CRIF UAT token request failed (HTTP ${response.status}).`);
  }
  const expiresIn = Number(response.payload.expires_in ?? response.payload.expiresIn) || 300;
  cachedToken = { value, expiresAt: Date.now() + Math.max(0, expiresIn - 30) * 1000 };
  return value;
}

function accessToken() {
  if (cachedToken?.expiresAt > Date.now()) return Promise.resolve(cachedToken.value);
  pendingToken ||= authenticate().finally(() => { pendingToken = undefined; });
  return pendingToken;
}

async function request(path, body, action, { retryUnauthorized = true } = {}) {
  const token = await accessToken();
  let response = await post(path, body, token);
  if (response.status === 401) {
    if (cachedToken?.value === token) cachedToken = undefined;
    if (retryUnauthorized) response = await post(path, body, await accessToken());
  }

  if (!response.ok || response.payload?.success === false || response.payload === null) {
    const code = response.payload?.errorCode;
    const description = String(response.payload?.errorDescription ?? response.payload?.errorMsg ?? response.payload?.message ?? '');
    if ([404, 422].includes(response.status) && (code === 'NOT-FOUND' || /not found|does not exist|no data|no matching/i.test(description))) {
      throw uatError(404, `CRIF UAT found no matching record for ${action}. Check the test reference and consent approval.`);
    }
    if (code === 'VALIDATION-ERROR') {
      if (/phone number/i.test(description)) throw uatError(422, 'CRIF UAT requires a valid sandbox mobile number.');
      if (/vuaid/i.test(description)) throw uatError(422, 'CRIF UAT rejected the sandbox VUA format.');
      throw uatError(422, `CRIF UAT rejected the inputs for ${action}.`);
    }
    throw uatError(502, `CRIF UAT ${action} failed (HTTP ${response.status}).`);
  }
  return response.payload;
}

module.exports = { request, uatError };
