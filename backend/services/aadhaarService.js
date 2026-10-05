const { config } = require('../config/env');

function buildAuthorizationHeader() {
  const scheme = String(config.bifrost.authScheme || '').trim();
  return scheme ? `${scheme} ${config.bifrost.apiToken}` : config.bifrost.apiToken;
}

function createProviderTimeoutSignal() {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(config.bifrost.timeoutMs);
  }

  return undefined;
}

function findFirstValue(input, keyPatterns) {
  const seen = new Set();
  const queue = [input];

  while (queue.length) {
    const current = queue.shift();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    for (const [key, value] of Object.entries(current)) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (keyPatterns.some((pattern) => pattern.test(normalizedKey)) && value !== null && value !== undefined && value !== '') {
        return value;
      }

      if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }

  return undefined;
}

function normalizeText(value) {
  return String(value || '').trim();
}

function decodeXmlValue(value) {
  return normalizeText(value)
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function findFirstXml(input) {
  const seen = new Set();
  const queue = [input];

  while (queue.length) {
    const current = queue.shift();
    if (typeof current === 'string') {
      const text = decodeXmlValue(current);
      if (/<\??xml|<OfflinePaperlessKyc|<UidData|<Poi|<Poa|<Pht/i.test(text)) {
        return text;
      }
      continue;
    }

    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    queue.push(...Object.values(current));
  }

  return '';
}

function parseXmlAttributes(xml, tagName) {
  const match = xml.match(new RegExp(`<${tagName}\\b([^>]*)>`, 'i')) ||
    xml.match(new RegExp(`<${tagName}\\b([^>]*)\\/?>`, 'i'));
  if (!match) return {};

  const attributes = {};
  const attributePattern = /([:\w-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let attributeMatch;

  while ((attributeMatch = attributePattern.exec(match[1])) !== null) {
    attributes[attributeMatch[1]] = decodeXmlValue(attributeMatch[3] ?? attributeMatch[4] ?? '');
  }

  return attributes;
}

function getXmlText(xml, tagName) {
  const match = xml.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  return match ? normalizeText(match[1]) : '';
}

function compactAddress(parts) {
  return parts
    .map(normalizeText)
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index)
    .join(', ');
}

function normalizeFatherName(value) {
  return normalizeText(value)
    .replace(/^(s\/o|d\/o|w\/o|c\/o|son of|daughter of|wife of|care of)\s+/i, '')
    .trim();
}

function normalizePhoto(value) {
  const text = normalizeText(value).replace(/\s/g, '');
  if (!text) return '';
  if (/^data:image\//i.test(text)) return text;
  return `data:image/jpeg;base64,${text}`;
}

function parseAadhaarXml(xml) {
  if (!xml) return {};

  const root = parseXmlAttributes(xml, 'OfflinePaperlessKyc');
  const uidData = parseXmlAttributes(xml, 'UidData');
  const poi = parseXmlAttributes(xml, 'Poi');
  const poa = parseXmlAttributes(xml, 'Poa');
  const pht = getXmlText(xml, 'Pht');
  const address = compactAddress([
    poa.co,
    poa.house,
    poa.street,
    poa.lm,
    poa.loc,
    poa.vtc,
    poa.po,
    poa.subdist,
    poa.dist,
    poa.state,
    poa.pc,
    poa.country,
  ]);
  const referenceId = normalizeText(root.referenceId || root.referenceid);
  const uid = normalizeText(uidData.uid || uidData.UID || poi.uid || poi.UID || root.uid || root.UID);

  return {
    aadhaarMasked: referenceId ? `Reference ID: ${referenceId}` : uid || '',
    address,
    careOf: normalizeText(poa.co),
    dob: normalizeText(poi.dob || poi.yob),
    fatherName: normalizeFatherName(poa.co),
    fullName: normalizeText(poi.name),
    gender: normalizeText(poi.gender),
    mobile: normalizeText(poi.m),
    photoDataUrl: normalizePhoto(pht),
  };
}

function getUpstreamMessage(payload) {
  if (!payload || typeof payload !== 'object') return '';

  const value = (
    payload.message ||
    payload.errorMessage ||
    payload.error_message ||
    payload.msg ||
    (payload.data && typeof payload.data === 'object' && (
      payload.data.message ||
      payload.data.errorMessage ||
      payload.data.error_message ||
      payload.data.msg
    ))
  );

  return typeof value === 'string' ? value.trim() : '';
}

function isTransientProviderMessage(value) {
  return /handshake|timeout|timed?\s*out|network|socket|econn|fetch failed/i.test(String(value || ''));
}

function getPublicProviderMessage(message, upstreamMessage) {
  if (isTransientProviderMessage(upstreamMessage) || isTransientProviderMessage(message)) {
    return 'Aadhaar provider did not respond in time. Please retry in a few minutes.';
  }

  return upstreamMessage || message;
}

function makeBifrostError(message, payload, status) {
  const upstreamMessage = getUpstreamMessage(payload);
  const details = [
    status ? `status ${status}` : '',
    upstreamMessage,
  ].filter(Boolean).join(': ');

  const error = new Error(details ? `${message} (${details})` : message);
  error.statusCode = 502;
  error.publicMessage = getPublicProviderMessage(message, upstreamMessage);
  error.retryable = status ? status >= 500 : true;
  error.upstreamStatus = status || null;
  error.upstreamResponse = payload;
  return error;
}

function normalizeAadhaarResponse(payload) {
  const data = payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object'
    ? payload.data
    : payload;
  const xmlDetails = parseAadhaarXml(findFirstXml(payload));

  const fullName = normalizeText(
    findFirstValue(data, [/^fullname$/, /^name$/, /^customername$/]),
  );
  const dob = normalizeText(
    findFirstValue(data, [/^dob$/, /^dateofbirth$/, /^birthdate$/]),
  );
  const gender = normalizeText(
    findFirstValue(data, [/^gender$/, /^sex$/]),
  );
  const mobile = normalizeText(
    findFirstValue(data, [/^mobile$/, /^mobilenumber$/, /^phone$/]),
  );
  const aadhaarMasked = normalizeText(
    findFirstValue(data, [
      /^aadhaarmasked$/, /^aadharmasked$/, /^adhaarmasked$/, /^adharmasked$/,
      /^maskedaadhaar$/, /^maskedaadhar$/, /^maskedadhaar$/, /^maskedadhar$/,
      /^aadhaarnumber$/, /^aadharnumber$/, /^adhaarnumber$/, /^adharnumber$/,
      /^aadhaar$/, /^aadhar$/, /^adhaar$/, /^adhar$/,
      /^aadhaarno$/, /^aadhaarnum$/, /^aadharno$/, /^aadharnum$/,
      /^uid$/, /^maskeduid$/, /^uidmasked$/
    ]),
  );
  const address = normalizeText(
    findFirstValue(data, [/^address$/, /^fulladdress$/, /^careofaddress$/]),
  );
  const careOf = normalizeText(
    findFirstValue(data, [/^careof$/, /^co$/, /^fathername$/, /^guardianname$/]),
  );

  return {
    aadhaarMasked: /^<\??xml|<OfflinePaperlessKyc|<UidData/i.test(aadhaarMasked)
      ? xmlDetails.aadhaarMasked || ''
      : aadhaarMasked || xmlDetails.aadhaarMasked || '',
    address: address || xmlDetails.address || '',
    careOf: careOf || xmlDetails.careOf || '',
    dob: dob || xmlDetails.dob || '',
    fatherName: normalizeFatherName(careOf) || xmlDetails.fatherName || '',
    fullName: fullName || xmlDetails.fullName || '',
    gender: gender || xmlDetails.gender || '',
    mobile: mobile || xmlDetails.mobile || '',
    photoDataUrl: xmlDetails.photoDataUrl || '',
  };
}

async function requestAadhaarData(uniqueId) {
  if (!config.bifrost.aadhaarApiUrl || !config.bifrost.apiToken) {
    const error = new Error('Bifrost Aadhaar API is not configured.');
    error.statusCode = 500;
    error.publicMessage = 'Aadhaar API is not configured on the backend.';
    throw error;
  }

  const requestBody = { uniqueId: normalizeText(uniqueId) };

  if (!requestBody.uniqueId) {
    const error = new Error('Aadhaar unique ID is missing for this lead.');
    error.statusCode = 400;
    error.publicMessage = 'Aadhaar unique ID is missing for this lead.';
    throw error;
  }

  let response;

  try {
    response = await fetch(config.bifrost.aadhaarApiUrl, {
      method: 'POST',
      headers: {
        Authorization: buildAuthorizationHeader(),
        'Content-Type': 'application/json',
      },
      signal: createProviderTimeoutSignal(),
      body: JSON.stringify(requestBody),
    });
  } catch (error) {
    const message = error.name === 'TimeoutError' || error.name === 'AbortError'
      ? `Request timed out after ${config.bifrost.timeoutMs}ms`
      : error.message;
    throw makeBifrostError('Unable to reach Aadhaar provider.', { message });
  }

  const text = await response.text();
  let payload = {};

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }

  if (!response.ok) {
    throw makeBifrostError('Aadhaar provider rejected the request.', payload, response.status);
  }

  if (payload && payload.error === true) {
    throw makeBifrostError('Aadhaar provider returned an error response.', payload, response.status);
  }

  return {
    payload,
    requestBody,
    uniqueId: requestBody.uniqueId,
    ...normalizeAadhaarResponse(payload),
  };
}

module.exports = {
  normalizeAadhaarResponse,
  requestAadhaarData,
};
