const { query } = require('../config/db');
const { config } = require('../config/env');

const REPORT_STATUS = {
  COMPLETED: 'completed',
  FAILED: 'failed',
  PENDING: 'pending',
};

function parseJson(value) {
  if (!value) return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function findExplicitScore(input) {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') {
    return Number.isFinite(input) && input >= 0 && input <= 900 ? input : null;
  }
  if (typeof input === 'string' && /^\d{1,3}$/.test(input.trim())) {
    const n = Number(input.trim());
    return n >= 0 && n <= 900 ? n : null;
  }

  // Direct check for CRIF / Digitap parsed_data SCORE
  const crifScoreVal = input?.result?.result_json?.parsed_data?.['B2C-REPORT']?.['REPORT-DATA']?.['STANDARD-DATA']?.SCORE?.[0]?.VALUE
    || input?.response?.result?.result_json?.parsed_data?.['B2C-REPORT']?.['REPORT-DATA']?.['STANDARD-DATA']?.SCORE?.[0]?.VALUE
    || input?.parsed_data?.['B2C-REPORT']?.['REPORT-DATA']?.['STANDARD-DATA']?.SCORE?.[0]?.VALUE;
  if (crifScoreVal !== undefined && crifScoreVal !== null && crifScoreVal !== '') {
    const match = String(crifScoreVal).match(/\d{1,3}/);
    if (match) {
      const s = Number(match[0]);
      if (Number.isFinite(s) && s >= 0 && s <= 900) return s;
    }
  }

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
      if (/^(cibilscore|creditscore|score|scorevalue)$/.test(normalizedKey)) {
        if (typeof value === 'number') {
          if (Number.isFinite(value) && value >= 0 && value <= 900) return value;
        } else if (typeof value === 'string') {
          const match = String(value).match(/\d{1,3}/);
          const score = match ? Number(match[0]) : null;
          if (Number.isFinite(score) && score >= 0 && score <= 900) return score;
        } else if (Array.isArray(value) && value[0] && typeof value[0] === 'object') {
          const v = value[0].VALUE ?? value[0].value ?? value[0].score;
          if (v !== undefined && v !== null && v !== '') {
            const match = String(v).match(/\d{1,3}/);
            const score = match ? Number(match[0]) : null;
            if (Number.isFinite(score) && score >= 0 && score <= 900) return score;
          }
        }
      }

      if (value && typeof value === 'object') queue.push(value);
    }
  }

  return null;
}

function normalizeIdentifier(value) {
  return String(value || '').trim();
}

function phoneCandidates(value) {
  const raw = normalizeIdentifier(value);
  const digits = raw.replace(/\D/g, '');
  return Array.from(new Set([
    raw,
    digits,
    digits.length > 10 ? digits.slice(-10) : '',
  ].filter(Boolean)));
}

function panCandidates(value) {
  const raw = normalizeIdentifier(value).toUpperCase();
  return raw ? [raw] : [];
}

function getReportStatus(row, rawResponse) {
  if (row.pdf_url) return REPORT_STATUS.COMPLETED;
  if (rawResponse && typeof rawResponse === 'object') {
    const status = rawResponse.status || rawResponse.providerStatus;
    const providerMessage = rawResponse.providerMessage ||
      rawResponse.upstreamResponse?.data?.errorMessage ||
      rawResponse.upstreamResponse?.errorMessage ||
      rawResponse.response?.data?.errorMessage ||
      rawResponse.response?.errorMessage;
    if (/no\s+record|not\s+found|fail|error|reject|declin|invalid|unable|missing/i.test(String(providerMessage || ''))) {
      return REPORT_STATUS.FAILED;
    }
    if (status === REPORT_STATUS.COMPLETED) return REPORT_STATUS.COMPLETED;
    if (Object.values(REPORT_STATUS).includes(status)) return status;
  }

  if (row.score !== null && row.score !== undefined && !Number.isNaN(Number(row.score))) {
    return REPORT_STATUS.COMPLETED;
  }

  return REPORT_STATUS.PENDING;
}

function toTimestamp(value) {
  if (!value) return 0;

  const date = value instanceof Date ? value : new Date(value);
  const timestamp = date.getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isStalePendingReport(row, status) {
  if (status !== REPORT_STATUS.PENDING || row.pdf_url) return false;

  const createdAt = toTimestamp(row.created_at);
  if (!createdAt) return false;

  return Date.now() - createdAt >= config.bifrost.cibilPendingRetryAfterMs;
}

function mapReport(row) {
  if (!row) return null;

  const rawResponse = parseJson(row.raw_response);
  const analysis = parseJson(row.analysis_json);
  const analysisRawResponse = parseJson(row.analysis_raw_response);
  const status = getReportStatus(row, rawResponse);
  const providerScore = findExplicitScore(rawResponse);
  const analysisScore = providerScore === null ? findExplicitScore(analysis) : null;
  const storedScore = row.score === null || row.score === undefined || Number.isNaN(Number(row.score)) ? null : Number(row.score);
  const score = providerScore ?? analysisScore ?? storedScore;
  const scoreSource = providerScore !== null ? 'provider' : analysisScore !== null ? 'analysis' : storedScore !== null ? 'stored' : '';
  const isStale = isStalePendingReport(row, status);
  const createdAtTimestamp = toTimestamp(row.created_at);
  const pendingRetryAt = status === REPORT_STATUS.PENDING && createdAtTimestamp
    ? new Date(createdAtTimestamp + config.bifrost.cibilPendingRetryAfterMs).toISOString()
    : null;

  return {
    id: row.id,
    leadId: row.lead_id || '',
    applicationId: row.application_id || '',
    fullName: row.full_name || '',
    email: row.email || '',
    mobile: row.mobile || '',
    pan: row.pan || '',
    score,
    storedScore,
    scoreSource,
    pdfUrl: row.pdf_url || '',
    refId: row.ref_id || '',
    analysis,
    analysisRawResponse,
    analysisStatus: row.analysis_status || '',
    analysisError: row.analysis_error || '',
    analysisModel: row.analysis_model || '',
    analysisResponseId: row.analysis_response_id || '',
    analyzedAt: row.analyzed_at,
    status,
    isStale,
    message: isStale
      ? 'CIBIL request is taking longer than expected. Please retry the CIBIL check.'
      : rawResponse && typeof rawResponse === 'object'
        ? rawResponse.providerMessage ||
          rawResponse.upstreamResponse?.data?.errorMessage ||
          rawResponse.upstreamResponse?.errorMessage ||
          rawResponse.response?.data?.errorMessage ||
          rawResponse.response?.errorMessage ||
          rawResponse.message ||
          ''
        : '',
    pendingRetryAt,
    retryable: isStale || (status !== REPORT_STATUS.PENDING && (rawResponse && typeof rawResponse === 'object' ? rawResponse.retryable !== false : true)),
    createdAt: row.created_at,
  };
}

function leadMatchClauses(lead) {
  const clauses = [];
  const params = [];

  if (lead.rawId) {
    clauses.push('lead_id = ?');
    params.push(lead.rawId);
  }

  if (lead.id) {
    clauses.push('application_id = ?');
    params.push(lead.id);
  }

  const pans = panCandidates(lead.panNumber);
  const phones = phoneCandidates(lead.phone);

  if (pans.length) {
    if (phones.length) {
      clauses.push(`(UPPER(pan) IN (${pans.map(() => '?').join(', ')}) AND mobile IN (${phones.map(() => '?').join(', ')}))`);
      params.push(...pans, ...phones);
    } else {
      clauses.push(`UPPER(pan) IN (${pans.map(() => '?').join(', ')})`);
      params.push(...pans);
    }
  }

  return { clauses, params };
}

function chooseCurrentReport(rows) {
  const reports = rows.map(mapReport).filter(Boolean);
  const freshPending = reports.find((report) => report.status === REPORT_STATUS.PENDING && !report.isStale);
  if (freshPending) return freshPending;

  const completed = reports.find((report) => report.pdfUrl || report.status === REPORT_STATUS.COMPLETED);
  if (completed) return completed;

  return reports[0] || null;
}

async function findLatestByLead(lead) {
  const { clauses, params } = leadMatchClauses(lead);
  if (!clauses.length) return null;

  const rows = await query(`
    SELECT *
    FROM cibil_reports
    WHERE ${clauses.join(' OR ')}
    ORDER BY created_at DESC, id DESC
    LIMIT 20
  `, params);

  return chooseCurrentReport(rows);
}

async function findByRefId(refId) {
  if (!refId) return null;

  const rows = await query(`
    SELECT *
    FROM cibil_reports
    WHERE ref_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `, [refId]);

  return rows[0] || null;
}

async function findLatestByIdentifiers({ mobile, pan } = {}) {
  const clauses = [];
  const params = [];

  const pans = panCandidates(pan);
  const phones = phoneCandidates(mobile);

  if (!pans.length) return null;

  clauses.push(`UPPER(pan) IN (${pans.map(() => '?').join(', ')})`);
  params.push(...pans);

  if (phones.length) {
    clauses.push(`mobile IN (${phones.map(() => '?').join(', ')})`);
    params.push(...phones);
  }

  const rows = await query(`
    SELECT *
    FROM cibil_reports
    WHERE ${clauses.join(' AND ')}
    ORDER BY
      CASE
        WHEN JSON_UNQUOTE(JSON_EXTRACT(raw_response, '$.status')) = 'pending' THEN 0
        ELSE 1
      END,
      created_at DESC,
      id DESC
    LIMIT 1
  `, params);

  return rows[0] || null;
}

async function saveReport(report) {
  const rawResponse = report.rawResponse === undefined ? null : JSON.stringify(report.rawResponse);
  const existing = report.id
    ? await findById(report.id)
    : report.refId
      ? await findByRefId(report.refId)
      : await findLatestByIdentifiers({ mobile: report.mobile, pan: report.pan });

  if (existing) {
    const incomingStatus = report.rawResponse && typeof report.rawResponse === 'object'
      ? report.rawResponse.status
      : '';
    const isLateFailureForCompletedReport = existing.pdf_url && !report.pdfUrl && incomingStatus === REPORT_STATUS.FAILED;
    if (isLateFailureForCompletedReport) {
      return mapReport(existing);
    }

    await query(`
      UPDATE cibil_reports
      SET
        lead_id = COALESCE(NULLIF(?, ''), lead_id),
        application_id = COALESCE(NULLIF(?, ''), application_id),
        full_name = COALESCE(NULLIF(?, ''), full_name),
        email = COALESCE(NULLIF(?, ''), email),
        mobile = COALESCE(NULLIF(?, ''), mobile),
        pan = COALESCE(NULLIF(?, ''), pan),
        score = COALESCE(?, score),
        pdf_url = COALESCE(NULLIF(?, ''), pdf_url),
        ref_id = COALESCE(NULLIF(?, ''), ref_id),
        analysis_json = COALESCE(?, analysis_json),
        analysis_raw_response = COALESCE(?, analysis_raw_response),
        analysis_status = COALESCE(NULLIF(?, ''), analysis_status),
        analysis_error = COALESCE(?, analysis_error),
        analysis_model = COALESCE(NULLIF(?, ''), analysis_model),
        analysis_response_id = COALESCE(NULLIF(?, ''), analysis_response_id),
        analyzed_at = COALESCE(?, analyzed_at),
        raw_response = COALESCE(?, raw_response),
        created_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE created_at END
      WHERE id = ?
    `, [
      report.leadId || '',
      report.applicationId || '',
      report.fullName || '',
      report.email || '',
      report.mobile || '',
      report.pan || '',
      report.score ?? null,
      report.pdfUrl || '',
      report.refId || '',
      report.analysis === undefined ? null : JSON.stringify(report.analysis),
      report.analysisRawResponse === undefined ? null : JSON.stringify(report.analysisRawResponse),
      report.analysisStatus || '',
      report.analysisError === undefined ? null : report.analysisError || '',
      report.analysisModel || '',
      report.analysisResponseId || '',
      report.analyzedAt || null,
      rawResponse,
      report.resetCreatedAt ? 1 : 0,
      existing.id,
    ]);

    const rows = await query('SELECT * FROM cibil_reports WHERE id = ? LIMIT 1', [existing.id]);
    return mapReport(rows[0]);
  }

  const result = await query(`
    INSERT INTO cibil_reports (
      lead_id, application_id, full_name, email, mobile, pan, score, pdf_url, ref_id, analysis_json, analysis_raw_response, analysis_status, analysis_error, analysis_model, analysis_response_id, analyzed_at, raw_response
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    report.leadId || '',
    report.applicationId || '',
    report.fullName || '',
    report.email || '',
    report.mobile || '',
    report.pan || '',
    report.score ?? null,
    report.pdfUrl || '',
    report.refId || '',
    report.analysis === undefined ? null : JSON.stringify(report.analysis),
    report.analysisRawResponse === undefined ? null : JSON.stringify(report.analysisRawResponse),
    report.analysisStatus || '',
    report.analysisError || '',
    report.analysisModel || '',
    report.analysisResponseId || '',
    report.analyzedAt || null,
    rawResponse,
  ]);

  const rows = await query('SELECT * FROM cibil_reports WHERE id = ? LIMIT 1', [result.insertId]);
  return mapReport(rows[0]);
}

async function createReport(report) {
  const rawResponse = report.rawResponse === undefined ? null : JSON.stringify(report.rawResponse);

  const result = await query(`
    INSERT INTO cibil_reports (
      lead_id, application_id, full_name, email, mobile, pan, score, pdf_url, ref_id, analysis_json, analysis_raw_response, analysis_status, analysis_error, analysis_model, analysis_response_id, analyzed_at, raw_response
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    report.leadId || '',
    report.applicationId || '',
    report.fullName || '',
    report.email || '',
    report.mobile || '',
    report.pan || '',
    report.score ?? null,
    report.pdfUrl || '',
    report.refId || '',
    report.analysis === undefined ? null : JSON.stringify(report.analysis),
    report.analysisRawResponse === undefined ? null : JSON.stringify(report.analysisRawResponse),
    report.analysisStatus || '',
    report.analysisError || '',
    report.analysisModel || '',
    report.analysisResponseId || '',
    report.analyzedAt || null,
    rawResponse,
  ]);

  const rows = await query('SELECT * FROM cibil_reports WHERE id = ? LIMIT 1', [result.insertId]);
  return mapReport(rows[0]);
}

async function findById(id) {
  if (!id) return null;

  const rows = await query('SELECT * FROM cibil_reports WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function findMappedById(id) {
  if (!id) return null;

  const rows = await query('SELECT * FROM cibil_reports WHERE id = ? LIMIT 1', [id]);
  return mapReport(rows[0]);
}

async function saveAnalysis(reportId, {
  analysis,
  analysisRawResponse,
  analysisStatus,
  analysisError,
  analysisModel,
  analysisResponseId,
  analyzedAt,
} = {}) {
  await query(`
    UPDATE cibil_reports
    SET
      analysis_json = ?,
      analysis_raw_response = ?,
      analysis_status = ?,
      analysis_error = ?,
      analysis_model = ?,
      analysis_response_id = ?,
      analyzed_at = ?
    WHERE id = ?
  `, [
    analysis === undefined ? null : JSON.stringify(analysis),
    analysisRawResponse === undefined ? null : JSON.stringify(analysisRawResponse),
    analysisStatus || '',
    analysisError || '',
    analysisModel || '',
    analysisResponseId || '',
    analyzedAt || null,
    reportId,
  ]);

  return findMappedById(reportId);
}

async function createPendingReport(lead) {
  return createReport({
    leadId: lead.rawId,
    applicationId: lead.id,
    fullName: lead.name,
    email: lead.email,
    mobile: lead.phone,
    pan: lead.panNumber,
    score: null,
    pdfUrl: '',
    refId: '',
    rawResponse: {
      status: REPORT_STATUS.PENDING,
      message: 'CIBIL request queued.',
      requestedAt: new Date().toISOString(),
    },
    resetCreatedAt: true,
  });
}

module.exports = {
  createReport,
  createPendingReport,
  findMappedById,
  findLatestByLead,
  REPORT_STATUS,
  saveAnalysis,
  saveReport,
};
