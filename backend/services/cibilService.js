const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { ensureUploadDir } = require('../config/uploads');
const { config } = require('../config/env');

const BIFROST_CONSENT_TEXT = 'We confirm and undertake that valid end-user consent has been obtained for fetching CIBIL REPORT using MOBILE NUMBER, and that such consent remains active and unrevoked at the time of this request.';
const DIGITAP_CONSENT_MESSAGE = 'I hereby authorize Crif to pull my credit report for Credit Assessment Purpose from Experian';

function normalizePan(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeMobile(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(-10);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function splitName(fullName) {
  const cleaned = normalizeName(fullName);
  const parts = cleaned.split(/\s+/).filter(Boolean);
  const firstName = parts[0] || 'User';
  const lastName = parts.slice(1).join(' ') || parts[0] || 'Customer';
  return { firstName, lastName };
}

function formatDigitapTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const dd = pad(date.getDate());
  const mm = pad(date.getMonth() + 1);
  const yyyy = date.getFullYear();
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${dd}${mm}${yyyy}-${hh}:${min}:${ss}`;
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

function normalizeScore(value) {
  if (value === null || value === undefined || value === '') return null;
  const match = String(value).match(/\d{1,3}/);
  if (!match) return null;

  const score = Number(match[0]);
  return Number.isFinite(score) && score >= 0 && score <= 900 ? score : null;
}

function normalizeUrl(value) {
  const text = String(value || '').trim();
  return /^https?:\/\//i.test(text) ? text : '';
}

function normalizeText(value) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function looksLikeFailureMessage(value) {
  return /no\s+record|not\s+found|fail|error|reject|declin|invalid|unable|missing/i.test(String(value || ''));
}

function getProviderBusinessError(payload) {
  if (!payload || typeof payload !== 'object') {
    return { message: '', type: '' };
  }

  const errorType = normalizeText(findFirstValue(payload, [/^errortype$/, /^errorcode$/]));
  const explicitErrorMessage = normalizeText(findFirstValue(payload, [
    /^errormessage$/,
    /^errormsg$/,
    /^errorreason$/,
    /^failuremessage$/,
    /^failurereason$/,
  ]));
  const genericMessage = normalizeText(findFirstValue(payload, [/^message$/, /^msg$/]));
  const message = explicitErrorMessage || (looksLikeFailureMessage(genericMessage) ? genericMessage : '');

  if (message || looksLikeFailureMessage(errorType)) {
    return {
      message: message || errorType,
      type: errorType,
    };
  }

  return { message: '', type: errorType };
}

function normalizeProviderStatus(payload, normalized) {
  if (normalized.pdfUrl) return 'completed';
  if (normalized.providerMessage) return 'failed';

  const status = String(
    (payload && (payload.status || payload.Status || payload.state || payload.requestStatus)) ||
    findFirstValue(payload, [/^status$/, /^requeststatus$/, /^state$/]) ||
    '',
  ).trim().toLowerCase();

  if (/fail|error|reject|declin/.test(status)) return 'failed';
  if (/complete|success|done|generated/.test(status)) return 'completed';
  return 'pending';
}

function buildBifrostAuthorizationHeader() {
  const scheme = String(config.bifrost.authScheme || '').trim();
  return scheme ? `${scheme} ${config.bifrost.apiToken}` : config.bifrost.apiToken;
}

function buildDigitapAuthorizationHeader() {
  const credentials = `${config.digitap.clientId}:${config.digitap.clientSecret}`;
  return `Basic ${Buffer.from(credentials).toString('base64')}`;
}

function createProviderTimeoutSignal(timeoutMs = 90000) {
  if (timeoutMs > 0 && typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs);
  }

  return undefined;
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
    return 'CIBIL provider did not respond in time. Please retry in a few minutes.';
  }

  return upstreamMessage || message;
}

function makeProviderError(message, payload, status, sentRequestBody = null) {
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
  error.sentRequestBody = sentRequestBody;
  return error;
}

function generateCibilSummaryPdf({ lead, score, scoreDesc, resultJson, targetFilePath }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 36, size: 'A4', bufferPages: true });
      const stream = fs.createWriteStream(targetFilePath);

      doc.pipe(stream);

      // Top Header Bar
      doc.rect(0, 0, doc.page.width, 50).fill('#0F172A');
      doc.fillColor('#FFFFFF').fontSize(14).font('Helvetica-Bold')
        .text('CRIF HIGH MARK CREDIT INFORMATION REPORT', 36, 18);
      doc.fontSize(8).font('Helvetica').fillColor('#94A3B8')
        .text('CONFIDENTIAL CREDIT ASSESSMENT', doc.page.width - 200, 20, { align: 'right' });

      doc.y = 65;

      // Extract Summary, Attributes, and Trade Lines from parsed_data
      const b2cReport = (
        resultJson?.parsed_data?.['B2C-REPORT'] ||
        resultJson?.['B2C-REPORT'] ||
        resultJson?.parsed_data?.['INDV-REPORT'] ||
        resultJson?.['INDV-REPORT'] ||
        resultJson?.parsed_data ||
        resultJson
      );
      const reportData = b2cReport?.['REPORT-DATA'] || b2cReport || {};
      const stdData = reportData?.['STANDARD-DATA'] || reportData?.['standard_data'] || {};
      const accountsSummary = reportData?.['ACCOUNTS-SUMMARY'] || stdData?.['ACCOUNTS-SUMMARY'] || {};
      const primarySummary = (
        accountsSummary?.['PRIMARY-ACCOUNTS-SUMMARY'] ||
        stdData?.['PRIMARY-ACCOUNTS-SUMMARY'] ||
        reportData?.['PRIMARY-ACCOUNTS-SUMMARY'] ||
        {}
      );

      const performAttrs = accountsSummary?.['PERFORM-ATTRIBUTES'] || [];
      const performAttrMap = Array.isArray(performAttrs)
        ? Object.fromEntries(performAttrs.map((a) => [String(a?.['ATTR-NAME'] || '').trim().toUpperCase(), a?.['ATTR-VALUE']]))
        : {};

      // 1. Applicant & Score Details Box (2 Columns)
      const appCardY = doc.y;
      doc.rect(36, appCardY, doc.page.width - 72, 66).fillAndStroke('#F8FAFC', '#CBD5E1');

      doc.fillColor('#0F172A').fontSize(9.5).font('Helvetica-Bold').text('Applicant Information', 48, appCardY + 8);
      doc.fontSize(8.5).font('Helvetica').fillColor('#334155');
      doc.text(`Full Name: ${lead?.name || 'N/A'}`, 48, appCardY + 22);
      doc.text(`Mobile: ${lead?.phone || 'N/A'}`, 48, appCardY + 34);
      doc.text(`PAN: ${lead?.panNumber || 'N/A'}`, 48, appCardY + 46);

      const col2X = 300;
      doc.fillColor('#0F172A').fontSize(9.5).font('Helvetica-Bold').text('Bureau Assessment', col2X, appCardY + 8);
      doc.fontSize(8.5).font('Helvetica').fillColor('#334155');
      doc.text(`Bureau Score: ${score !== null && score !== undefined ? score : 'N/A'} ${scoreDesc ? `(${scoreDesc})` : ''}`, col2X, appCardY + 22);
      doc.text(`Date of Report: ${new Date().toLocaleString('en-IN')}`, col2X, appCardY + 34);
      doc.text(`Provider: CRIF High Mark (via Digitap)`, col2X, appCardY + 46);

      doc.y = appCardY + 76;

      // 2. Executive Credit Summary Box
      const numAccounts = primarySummary['NUMBER-OF-ACCOUNTS'] || '0';
      const activeAccounts = primarySummary['ACTIVE-ACCOUNTS'] || '0';
      const overdueAccounts = primarySummary['OVERDUE-ACCOUNTS'] || '0';
      const totalObligations = performAttrMap['TOTAL-OBLIGATIONS'] || primarySummary['TOTAL-CURRENT-BALANCE'] || '0';
      const activeEmi = performAttrMap['TOTAL-SUM-OF-ACTIVE-EMI'] || '0';
      const unsecuredBal = primarySummary['CURRENT-BALANCE-UNSECURED'] || performAttrMap['TOTAL-UNSECURED-OUTSTANDING'] || '0';
      const securedBal = primarySummary['CURRENT-BALANCE-SECURED'] || performAttrMap['TOTAL-SECURED-OUTSTANDING'] || '0';
      const inquiries6M = performAttrMap['INQUIRIES-IN-LAST-SIX-MONTHS'] || '0';
      const inquiries12M = performAttrMap['TOTAL-NO-OF-INQUIRY-IN-LAST-12-MONTHS'] || '0';

      doc.fillColor('#0F172A').fontSize(10.5).font('Helvetica-Bold').text('Executive Credit Summary', 36, doc.y);
      doc.moveDown(0.3);

      const sumY = doc.y;
      doc.rect(36, sumY, doc.page.width - 72, 54).fillAndStroke('#F1F5F9', '#CBD5E1');

      doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#1E293B');
      doc.text(`Total Accounts: ${numAccounts}`, 48, sumY + 8);
      doc.text(`Active Accounts: ${activeAccounts}`, 48, sumY + 22);
      doc.text(`Overdue Accounts: ${overdueAccounts}`, 48, sumY + 36);

      doc.text(`Total Outstanding: Rs. ${totalObligations}`, 190, sumY + 8);
      doc.text(`Unsecured Bal: Rs. ${unsecuredBal}`, 190, sumY + 22);
      doc.text(`Secured Bal: Rs. ${securedBal}`, 190, sumY + 36);

      doc.text(`Active Monthly EMI: Rs. ${activeEmi}`, 360, sumY + 8);
      doc.text(`Inquiries (Last 6M): ${inquiries6M}`, 360, sumY + 22);
      doc.text(`Inquiries (Last 12M): ${inquiries12M}`, 360, sumY + 36);

      doc.y = sumY + 66;

      // 3. Trade Lines / Credit Accounts
      const rawTL = stdData?.['TRADELINES'] || reportData?.['TRADELINES'] || reportData?.['RESPONSES'] || [];
      const tradelines = Array.isArray(rawTL)
        ? rawTL
        : (rawTL?.TRADELINE || rawTL?.tradeline || (typeof rawTL === 'object' && rawTL !== null ? Object.values(rawTL) : []));

      if (tradelines.length > 0) {
        doc.fillColor('#0F172A').fontSize(10.5).font('Helvetica-Bold')
          .text(`Trade Lines & Credit Facilities (${tradelines.length} Accounts)`, 36, doc.y);
        doc.moveDown(0.3);

        for (const [idx, acct] of tradelines.entries()) {
          if (!acct || typeof acct !== 'object') continue;
          if (doc.y > doc.page.height - 65) {
            doc.addPage();
          }

          const creditor = acct['CREDIT-GRANTOR'] || acct['CREDITOR-NAME'] || acct['grantor'] || 'Unknown Lender';
          const acctType = acct['ACCT-TYPE'] || acct['ACCOUNT-TYPE'] || 'Credit Facility';
          const status = String(acct['ACCOUNT-STATUS'] || 'N/A').trim();
          const disbursedAmt = acct['DISBURSED-AMT'] || acct['DISBURSED-AMOUNT'] || acct['HIGH-CREDIT'] || '0';
          const currentBal = acct['CURRENT-BAL'] || acct['CURRENT-BALANCE'] || '0';
          const overdueAmt = acct['OVERDUE-AMT'] || acct['OVERDUE-AMOUNT'] || '0';
          const installmentAmt = acct['INSTALLMENT-AMT'] || acct['EMI-AMOUNT'] || '';
          const disbursedDt = acct['DISBURSED-DT'] || acct['DISBURSED-DATE'] || 'N/A';
          const closedDt = acct['CLOSED-DT'] || acct['CLOSED-DATE'] || '';
          const lastPaymentDt = acct['LAST-PAYMENT-DT'] || acct['LAST-PAYMENT-DATE'] || 'N/A';
          const acctNum = acct['ACCT-NUMBER'] ? ` (A/C: ${String(acct['ACCT-NUMBER']).slice(-6)})` : '';

          const cardY = doc.y;
          const isActive = /^active/i.test(status);
          const hasOverdue = Number(String(overdueAmt).replace(/[^\d.-]/g, '')) > 0;
          const statusColor = hasOverdue ? '#DC2626' : isActive ? '#059669' : '#64748B';
          const badgeText = hasOverdue ? '[ OVERDUE ]' : isActive ? '[ ACTIVE ]' : '[ CLOSED ]';

          doc.rect(36, cardY, doc.page.width - 72, 42).fillAndStroke('#FFFFFF', '#E2E8F0');

          doc.fillColor(statusColor).fontSize(7.5).font('Helvetica-Bold').text(badgeText, 46, cardY + 6);
          doc.fillColor('#0F172A').fontSize(8.5).font('Helvetica-Bold')
            .text(`${idx + 1}. ${creditor} - ${acctType}${acctNum}`, 95, cardY + 6);

          doc.fontSize(7.8).font('Helvetica').fillColor('#475569');
          const emiStr = installmentAmt ? ` | EMI: Rs. ${installmentAmt}` : '';
          doc.text(`Disbursed: Rs. ${disbursedAmt} (${disbursedDt}) | Balance: Rs. ${currentBal} | Overdue: Rs. ${overdueAmt}${emiStr}`, 46, cardY + 18);
          const dateStr = closedDt ? `Closed Date: ${closedDt}` : `Last Payment: ${lastPaymentDt}`;
          doc.text(`Status: ${status} | ${dateStr}`, 46, cardY + 28);

          doc.y = cardY + 46;
        }
      }

      doc.end();

      stream.on('finish', () => resolve(targetFilePath));
      stream.on('error', (err) => reject(err));
    } catch (err) {
      reject(err);
    }
  });
}

async function normalizeApiResponse(payload, lead = {}) {
  // Check if response is from Digitap API
  if (payload && (payload.result_code !== undefined || payload.client_ref_num !== undefined)) {
    return normalizeDigitapApiResponse(payload, lead);
  }

  // Bifrost API response parsing
  const data = payload && typeof payload === 'object' ? payload.data : null;
  const result = data && typeof data === 'object' ? data.result : null;
  const providerError = getProviderBusinessError(payload);
  const score = normalizeScore(
    (data && (data.score || data.cibilScore || data.creditScore)) ||
    findFirstValue(payload, [/^(cibil)?score$/, /^creditscore$/]),
  );
  const pdfUrl = normalizeUrl(
    (result && result.reportUrl) ||
    (data && (data.reportUrl || data.pdfUrl)) ||
    findFirstValue(payload, [/^pdfurl$/, /^reporturl$/, /^cibilreporturl$/, /^downloadurl$/, /^fileurl$/, /^signedurl$/, /^reportpdf$/, /^url$/]),
  );
  const refId = String(
    (data && data.refId) ||
    payload.refId ||
    findFirstValue(payload, [/^refid$/, /^referenceid$/, /^requestid$/, /^transactionid$/]) ||
    '',
  ).trim();

  const normalized = {
    score,
    pdfUrl,
    refId,
    providerMessage: providerError.message,
    providerErrorType: providerError.type,
  };

  return {
    ...normalized,
    providerStatus: normalizeProviderStatus(payload, normalized),
  };
}

function formatDigitapDob(dateOfBirth) {
  if (!dateOfBirth) return undefined;
  const str = String(dateOfBirth).trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [yyyy, mm, dd] = str.split('-');
    return `${dd}-${mm}-${yyyy}`;
  }
  if (/^\d{2}-\d{2}-\d{4}$/.test(str)) {
    return str;
  }
  return undefined;
}

async function normalizeDigitapApiResponse(payload, lead = {}) {
  const resultCode = payload ? payload.result_code : null;
  const result = payload && typeof payload === 'object' ? payload.result : null;
  const hasResultJson = Boolean(result?.result_json);
  const isSuccess = resultCode === 101 || (payload?.http_response_code === 200 && hasResultJson);

  const scoreObj = (
    result?.result_json?.parsed_data?.['B2C-REPORT']?.['REPORT-DATA']?.['STANDARD-DATA']?.SCORE?.[0] ||
    result?.result_json?.credit_report?.scores ||
    result?.scores ||
    null
  );
  const rawScore = (
    scoreObj?.VALUE ??
    scoreObj?.score_value ??
    scoreObj?.value ??
    result?.scores?.score_value ??
    findFirstValue(payload, [/^scorevalue$/, /^score$/])
  );
  const scoreDesc = scoreObj?.DESCRIPTION || scoreObj?.description || '';
  const score = normalizeScore(rawScore);

  let pdfUrl = normalizeUrl(
    result?.result_pdf ||
    findFirstValue(payload, [/^resultpdf$/, /^pdfurl$/, /^reporturl$/])
  );

  // If result_pdf is base64 string
  if (!pdfUrl && typeof result?.result_pdf === 'string' && result.result_pdf.trim().length > 100) {
    try {
      const cleaned = result.result_pdf.replace(/^data:application\/pdf;base64,/, '').trim();
      const buffer = Buffer.from(cleaned, 'base64');
      if (buffer.length > 0) {
        const uploadDir = ensureUploadDir('cibil');
        const filename = `cibil_${lead?.rawId || lead?.id || 'lead'}_${Date.now()}.pdf`;
        const fullPath = path.join(uploadDir, filename);
        fs.writeFileSync(fullPath, buffer);
        pdfUrl = `/uploads/cibil/${filename}`;
      }
    } catch (e) {
      console.error('[CIBIL Service] Failed to save base64 result_pdf:', e.message);
    }
  }

  // If no PDF yet, but we have result_json, generate summary PDF using pdfkit
  if (!pdfUrl && hasResultJson) {
    try {
      const uploadDir = ensureUploadDir('cibil');
      const filename = `cibil_${lead?.rawId || lead?.id || 'lead'}_${Date.now()}.pdf`;
      const fullPath = path.join(uploadDir, filename);
      await generateCibilSummaryPdf({
        lead,
        score,
        scoreDesc,
        resultJson: result.result_json,
        targetFilePath: fullPath,
      });
      pdfUrl = `/uploads/cibil/${filename}`;
      console.log(`[CIBIL Service] Generated summary PDF from result_json at: ${pdfUrl}`);
    } catch (e) {
      console.error('[CIBIL Service] Failed to generate summary PDF from result_json:', e.message);
    }
  }

  const refId = String(payload.client_ref_num || payload.request_id || '').trim();

  let providerMessage = '';
  if (resultCode === 102) {
    providerMessage = 'No record found in Credit Bureau';
  } else if (resultCode === 103) {
    providerMessage = 'Name not found against mobile no';
  } else if (!isSuccess) {
    providerMessage = payload?.message || 'Credit bureau request failed';
  }

  const providerStatus = (isSuccess && (score !== null || pdfUrl || hasResultJson || resultCode === 101))
    ? 'completed'
    : 'failed';

  return {
    score,
    scoreDescription: scoreDesc,
    pdfUrl,
    refId,
    providerMessage: providerStatus === 'completed' ? '' : providerMessage,
    providerErrorType: resultCode ? String(resultCode) : '',
    providerStatus,
  };
}

async function requestDigitapCibilReport(lead, options = {}) {
  const mobile = normalizeMobile(lead.phone);
  const fullName = normalizeName(lead.name);
  const { firstName, lastName } = splitName(fullName);

  if (!/^\d{10}$/.test(mobile) || !fullName) {
    const error = new Error('Lead is missing full name or valid 10-digit mobile number for CIBIL request.');
    error.statusCode = 400;
    error.publicMessage = 'Lead must have a valid full name and 10-digit mobile number before fetching CIBIL.';
    throw error;
  }

  // Validate PAN format (must be 10 chars matching regex)
  const panCandidate = normalizePan(lead.panNumber);
  const validPan = /^[A-Z]{5}\d{4}[A-Z]$/.test(panCandidate) ? panCandidate : undefined;
  if (!validPan) {
    const error = new Error('Lead is missing a valid 10-character PAN number for CIBIL request.');
    error.statusCode = 400;
    error.publicMessage = 'Lead must have a valid 10-character PAN number (e.g. ABCDE1234F) before fetching CIBIL.';
    throw error;
  }

  // Validate Email format (fallback if not present or invalid)
  const emailCandidate = String(lead.email || '').trim();
  const validEmail = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(emailCandidate)
    ? emailCandidate
    : `${mobile}@customer.waqtfinance.com`;

  // Format DOB to DD-MM-YYYY for Digitap v2 API (fallback to 01-01-1990)
  const validDob = formatDigitapDob(lead.dateOfBirth) || '01-01-1990';

  // Format address, city, state, pincode, gender required by Digitap v2
  const address = (lead.address && String(lead.address).trim().length >= 5)
    ? String(lead.address).trim()
    : 'Address Not Provided';
  const city = (lead.city && String(lead.city).trim()) || 'Jaipur';
  const state = (lead.state && String(lead.state).trim()) || 'Rajasthan';
  const rawPin = String(lead.pincode || lead.pinCode || '').replace(/\D/g, '');
  const pincode = rawPin.length === 6 ? rawPin : '302001';

  let gender = 'Male';
  const g = String(lead.gender || '').trim().toLowerCase();
  if (g.startsWith('f') || g === 'female') {
    gender = 'Female';
  }

  const clientRefNum = `cibil_${lead.rawId || lead.id || 'lead'}_${Date.now()}`;

  const requestBody = {
    client_ref_num: clientRefNum,
    mobile_no: mobile,
    prefill_lookup: '0',
    first_name: firstName,
    last_name: lastName,
    report_type: '1',
    pan: validPan,
    email: validEmail,
    date_of_birth: validDob,
    address,
    city,
    state,
    pincode,
    gender,
  };

  let response;

  try {
    response = await fetch(config.digitap.apiUrl, {
      method: 'POST',
      headers: {
        Authorization: buildDigitapAuthorizationHeader(),
        'Content-Type': 'application/json',
      },
      signal: createProviderTimeoutSignal(config.digitap.timeoutMs),
      body: JSON.stringify(requestBody),
    });
  } catch (error) {
    const message = error.name === 'TimeoutError' || error.name === 'AbortError'
      ? `Digitap API request timed out after ${config.digitap.timeoutMs}ms`
      : error.message;
    throw makeProviderError('Unable to reach Digitap CIBIL provider.', { message });
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

  if (!response.ok || (payload && payload.result_code && payload.result_code !== 101)) {
    console.error('[Digitap CIBIL API Response Error Payload]:', JSON.stringify(payload, null, 2));
    console.error('[Digitap CIBIL API Sent Request Body]:', JSON.stringify(requestBody, null, 2));
  }

  if (!response.ok) {
    throw makeProviderError('Digitap CIBIL provider rejected the request.', payload, response.status, requestBody);
  }

  if (payload && payload.result_code && payload.result_code !== 101) {
    const normalizedErr = await normalizeDigitapApiResponse(payload, lead);
    const err = makeProviderError(`Digitap CIBIL provider returned error code ${payload.result_code}: ${normalizedErr.providerMessage}`, payload, response.status, requestBody);
    err.publicMessage = normalizedErr.providerMessage || `CIBIL Provider Error (${payload.result_code})`;
    throw err;
  }

  const normalized = await normalizeDigitapApiResponse(payload, lead);

  return {
    providerUsed: 'digitap',
    requestBody: { ...requestBody, pan: validPan },
    payload,
    ...normalized,
  };
}

async function requestBifrostCibilReport(lead) {
  console.log(`[CIBIL Service] Fetching CIBIL for Lead ID: ${lead.rawId || lead.id} using provider: BIFROST`);
  if (!config.bifrost.apiUrl || !config.bifrost.apiToken) {
    const error = new Error('Bifrost CIBIL API is not configured.');
    error.statusCode = 500;
    error.publicMessage = 'CIBIL API is not configured on the backend.';
    throw error;
  }

  const mobile = normalizeMobile(lead.phone);
  const pan = normalizePan(lead.panNumber);
  const fullName = normalizeName(lead.name);

  if (!/^\d{10}$/.test(mobile) || !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan) || !fullName) {
    const error = new Error('Lead is missing name, mobile, or PAN for CIBIL request.');
    error.statusCode = 400;
    error.publicMessage = 'Lead must have a valid full name, 10-digit mobile number, and PAN before fetching CIBIL.';
    throw error;
  }

  const requestBody = {
    Mobile_Number: mobile,
    PAN_Number: pan,
    Full_Name: fullName,
    Callback_Url: config.bifrost.callbackUrl,
    Concent_Text: BIFROST_CONSENT_TEXT,
    Concent: 'Y',
  };

  let response;

  try {
    response = await fetch(config.bifrost.apiUrl, {
      method: 'POST',
      headers: {
        Authorization: buildBifrostAuthorizationHeader(),
        'Content-Type': 'application/json',
      },
      signal: createProviderTimeoutSignal(config.bifrost.timeoutMs),
      body: JSON.stringify(requestBody),
    });
  } catch (error) {
    const message = error.name === 'TimeoutError' || error.name === 'AbortError'
      ? `Request timed out after ${config.bifrost.timeoutMs}ms`
      : error.message;
    throw makeProviderError('Unable to reach CIBIL provider.', { message });
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
    throw makeProviderError('CIBIL provider rejected the request.', payload, response.status);
  }

  if (payload && payload.error === true) {
    throw makeProviderError('CIBIL provider returned an error response.', payload, response.status);
  }

  const normalized = await normalizeApiResponse(payload, lead);

  return {
    providerUsed: 'bifrost',
    requestBody: { ...requestBody, PAN_Number: pan },
    payload,
    ...normalized,
  };
}

async function requestCibilReport(lead, options = {}) {
  const preferredProvider = config.cibilProvider;

  if (preferredProvider === 'bifrost') {
    console.log(`[CIBIL Service] Fetching CIBIL for Lead ID: ${lead.rawId || lead.id} using provider: BIFROST`);
    return requestBifrostCibilReport(lead);
  }

  if (preferredProvider === 'digitap' || (config.digitap.clientId && config.digitap.clientSecret)) {
    if (!config.digitap.clientId || !config.digitap.clientSecret) {
      console.warn('[CIBIL Service] WARNING: DIGITAP_CLIENT_ID or DIGITAP_CLIENT_SECRET is missing in .env!');
      const error = new Error('Digitap CIBIL API keys (DIGITAP_CLIENT_ID and DIGITAP_CLIENT_SECRET) are missing in environment variables.');
      error.statusCode = 500;
      error.publicMessage = 'Digitap CIBIL API credentials (DIGITAP_CLIENT_ID & DIGITAP_CLIENT_SECRET) are missing in backend/.env file.';
      throw error;
    }
    console.log(`[CIBIL Service] Fetching CIBIL for Lead ID: ${lead.rawId || lead.id} using provider: DIGITAP.AI`);
    return requestDigitapCibilReport(lead, options);
  }

  return requestBifrostCibilReport(lead);
}

module.exports = {
  normalizeApiResponse,
  normalizeDigitapApiResponse,
  requestCibilReport,
  requestDigitapCibilReport,
  requestBifrostCibilReport,
};
