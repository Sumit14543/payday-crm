const fs = require('fs');
const path = require('path');
const { config } = require('../config/env');
const { resolveUploadPath } = require('../config/uploads');

const OPENAI_BASE_URL = 'https://api.openai.com/v1';

function createTimeoutSignal(timeoutMs = config.openai.timeoutMs || 45000) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`OpenAI request timed out after ${timeoutMs}ms`));
  }, timeoutMs);
  if (typeof timer.unref === 'function') timer.unref();
  return controller.signal;
}

function makeOpenAiError(message, payload, status) {
  const upstreamMessage = payload && typeof payload === 'object'
    ? payload.error?.message || payload.message || ''
    : '';
  const error = new Error(upstreamMessage ? `${message}: ${upstreamMessage}` : message);
  error.statusCode = status && status >= 400 && status < 500 ? 400 : 502;
  error.publicMessage = upstreamMessage || message;
  error.upstreamStatus = status || null;
  error.upstreamResponse = payload;
  return error;
}

function requireOpenAiConfig() {
  if (!config.openai.apiKey) {
    const error = new Error('OpenAI API key is not configured.');
    error.statusCode = 500;
    error.publicMessage = 'OpenAI API key is not configured on the backend.';
    throw error;
  }
}

function resolveLocalUploadPath(pdfUrl) {
  const value = String(pdfUrl || '').trim();
  if (!value.startsWith('/uploads/')) return '';

  const candidate = resolveUploadPath(value);
  return fs.existsSync(candidate) ? candidate : '';
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function uploadPdf(localPath) {
  const body = new FormData();
  const bytes = await fs.promises.readFile(localPath);
  body.append('purpose', 'user_data');
  body.append('file', new Blob([bytes], { type: 'application/pdf' }), path.basename(localPath));

  const response = await fetch(`${OPENAI_BASE_URL}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openai.apiKey}`,
    },
    signal: createTimeoutSignal(),
    body,
  });
  const payload = await readJsonResponse(response);

  if (!response.ok || !payload.id) {
    throw makeOpenAiError('PDF upload to OpenAI failed', payload, response.status);
  }

  return payload.id;
}

function extractResponseText(payload) {
  if (!payload || typeof payload !== 'object') return '';
  if (typeof payload.output_text === 'string') return payload.output_text;

  const chunks = [];
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === 'string') chunks.push(content.text);
    }
  }

  return chunks.join('\n').trim();
}

function parseJsonFromText(text) {
  const value = String(text || '').trim();
  if (!value) throw new Error('OpenAI returned an empty analysis.');

  try {
    return JSON.parse(value);
  } catch {
    const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1].trim() : value.match(/\{[\s\S]*\}/)?.[0];
    if (!candidate) throw new Error('OpenAI did not return JSON.');
    return JSON.parse(candidate);
  }
}

function buildPrompt(lead) {
  return `
You are a professional NBFC credit analyst.
Analyze the attached CIBIL PDF report for ${lead?.name || 'the applicant'}.

Extract these fields and return only valid JSON:
{
  "cibilScore": "number or Not Available",
  "activeLoans": [],
  "closedInactiveLoans": [],
  "overdueAmount": "number or Not Available",
  "dpdHistory": [],
  "maximumDpd": "number or Not Available",
  "dpdFlags": {
    "30Plus": true,
    "60Plus": true,
    "90Plus": true
  },
  "writtenOffSettledAccounts": [],
  "creditEnquiries": [],
  "riskCategory": "Low Risk or Medium Risk or High Risk",
  "riskReasons": [],
  "analystSummary": "short paragraph"
}

Rules:
- Do not assume anything.
- Extract cibilScore only when an exact score is printed in the PDF near labels such as "CIBIL Score", "Credit Score", "TransUnion CIBIL Score", or "Score"; never infer a score from account history, risk band, currentCredit, creditUsed, report dates, PIN codes, loan amounts, or policy thresholds.
- If the PDF does not clearly print a score, set cibilScore to "Not Available".
- If data is missing, use "Not Available".
- Keep account/enquiry items as concise objects with lender, accountType, amount, status, dates, overdue, dpd, and remarks when available.
- Use INR numbers when a numeric amount is clear in the PDF.
`;
}

async function analyzeCibilPdf({ lead, report }) {
  requireOpenAiConfig();

  if (!report?.pdfUrl) {
    const error = new Error('CIBIL PDF URL is missing.');
    error.statusCode = 400;
    error.publicMessage = 'CIBIL PDF is not available yet.';
    throw error;
  }

  const localPath = resolveLocalUploadPath(report.pdfUrl);
  let openaiFileId = '';
  const fileContent = localPath
    ? { type: 'input_file', file_id: openaiFileId = await uploadPdf(localPath) }
    : { type: 'input_file', file_url: report.pdfUrl };

  const requestBody = {
    model: config.openai.model,
    input: [
      {
        role: 'user',
        content: [
          fileContent,
          { type: 'input_text', text: buildPrompt(lead) },
        ],
      },
    ],
  };

  const response = await fetch(`${OPENAI_BASE_URL}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openai.apiKey}`,
      'Content-Type': 'application/json',
    },
    signal: createTimeoutSignal(),
    body: JSON.stringify(requestBody),
  });
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    throw makeOpenAiError('OpenAI CIBIL analysis failed', payload, response.status);
  }

  const analysis = parseJsonFromText(extractResponseText(payload));

  return {
    analysis,
    openaiFileId,
    responseId: payload.id || '',
    rawResponse: payload,
  };
}

module.exports = {
  analyzeCibilPdf,
};
