const { query } = require('../config/db');

function extractNumericId(str) {
  const s = String(str || '').trim();
  const digits = s.replace(/^[A-Z\-]+/g, '').replace(/^0+/, '');
  return /^\d+$/.test(digits) ? digits : '';
}

async function createSession({ applicationId, trackingId, digitalFlowRequestId, redirectionUrl, templateCode }) {
  await query(`
    INSERT INTO lead_account_aggregator_sessions (
      application_id, tracking_id, digital_flow_request_id, redirection_url, template_code, status
    ) VALUES (?, ?, ?, ?, ?, 'PENDING')
  `, [
    String(applicationId || '').trim(),
    String(trackingId || '').trim(),
    String(digitalFlowRequestId || '').trim(),
    String(redirectionUrl || '').trim(),
    String(templateCode || 'CT003').trim(),
  ]);
}

async function findLatestSessionByApplicationId(applicationId, secondaryId) {
  const rawNum = extractNumericId(applicationId) || extractNumericId(secondaryId);
  const ids = Array.from(new Set([
    String(applicationId || '').trim(),
    String(secondaryId || '').trim(),
    rawNum,
  ])).filter(Boolean);

  if (!ids.length) return null;

  const placeholders = ids.map(() => '?').join(', ');
  const params = [...ids];
  let whereClause = `application_id IN (${placeholders})`;

  if (rawNum) {
    whereClause += ` OR tracking_id LIKE ? ESCAPE '\\\\' OR tracking_id LIKE ? ESCAPE '\\\\'`;
    params.push(`AA\\_TRK\\_${rawNum}\\_%`, `AA\\_TRACK\\_${rawNum}\\_%`);
  }

  const rows = await query(`
    SELECT
      id,
      application_id AS applicationId,
      tracking_id AS trackingId,
      digital_flow_request_id AS digitalFlowRequestId,
      redirection_url AS redirectionUrl,
      template_code AS templateCode,
      status,
      consent_id AS consentId,
      reference_id AS referenceId,
      analysis_id AS analysisId,
      fip_name AS fipName,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM lead_account_aggregator_sessions
    WHERE ${whereClause}
    ORDER BY id DESC
    LIMIT 1
  `, params);

  return rows[0] || null;
}

async function findSessionByTrackingId(trackingId) {
  const rows = await query(`
    SELECT
      id,
      application_id AS applicationId,
      tracking_id AS trackingId,
      digital_flow_request_id AS digitalFlowRequestId,
      redirection_url AS redirectionUrl,
      template_code AS templateCode,
      status,
      consent_id AS consentId,
      reference_id AS referenceId,
      analysis_id AS analysisId,
      fip_name AS fipName,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM lead_account_aggregator_sessions
    WHERE tracking_id = ?
    ORDER BY id DESC
    LIMIT 1
  `, [String(trackingId || '').trim()]);

  return rows[0] || null;
}

async function updateSessionStatus({ trackingId, status, consentId, referenceId, analysisId, fipName }) {
  const updates = ['status = ?'];
  const params = [String(status || 'PENDING').toUpperCase()];

  if (consentId !== undefined) {
    updates.push('consent_id = ?');
    params.push(consentId);
  }
  if (referenceId !== undefined) {
    updates.push('reference_id = ?');
    params.push(referenceId);
  }
  if (analysisId !== undefined) {
    updates.push('analysis_id = ?');
    params.push(analysisId);
  }
  if (fipName !== undefined) {
    updates.push('fip_name = ?');
    params.push(fipName);
  }

  params.push(String(trackingId || '').trim());

  await query(`
    UPDATE lead_account_aggregator_sessions
    SET ${updates.join(', ')}
    WHERE tracking_id = ?
  `, params);
}

async function saveAnalytics({ applicationId, trackingId, referenceId, analysisId, analyticsData }) {
  const summary = analyticsData.cashFlowSummary || {};
  const appStr = String(applicationId || '').trim();
  const trkStr = String(trackingId || '').trim();
  const rawNum = extractNumericId(appStr);

  // Check if an analytics record already exists for this lead / trackingId
  const existing = await query(`
    SELECT id FROM lead_account_aggregator_analytics
    WHERE tracking_id = ? OR application_id = ? ${rawNum ? "OR tracking_id LIKE ? ESCAPE '\\\\' OR tracking_id LIKE ? ESCAPE '\\\\'" : ''}
    ORDER BY id DESC LIMIT 1
  `, rawNum ? [trkStr, appStr, `AA\\_TRK\\_${rawNum}\\_%`, `AA\\_TRACK\\_${rawNum}\\_%`] : [trkStr, appStr]);

  if (existing && existing[0]) {
    // Update existing row on refresh to prevent duplicate table entries
    await query(`
      UPDATE lead_account_aggregator_analytics SET
        tracking_id = ?,
        reference_id = ?,
        analysis_id = ?,
        avg_monthly_credits = ?,
        avg_monthly_debits = ?,
        net_cash_flow = ?,
        salary_detected = ?,
        detected_employer = ?,
        avg_salary = ?,
        bounces_count = ?,
        risk_score = ?,
        raw_analytics_json = ?
      WHERE id = ?
    `, [
      trkStr,
      String(referenceId || '').trim(),
      String(analysisId || '').trim(),
      Number(summary.averageMonthlyCredits || 0),
      Number(summary.averageMonthlyDebits || 0),
      Number(summary.netCashFlow || 0),
      summary.salaryDetected ? 1 : 0,
      String(summary.detectedEmployer || '').trim(),
      Number(summary.averageSalary || 0),
      Number(summary.chequeBouncesCount || summary.nachBouncesCount || 0),
      String(summary.riskIndicatorScore || 'LOW_RISK').trim(),
      JSON.stringify(analyticsData),
      existing[0].id,
    ]);
  } else {
    // Insert new row only if no record exists yet
    await query(`
      INSERT INTO lead_account_aggregator_analytics (
        application_id, tracking_id, reference_id, analysis_id,
        avg_monthly_credits, avg_monthly_debits, net_cash_flow,
        salary_detected, detected_employer, avg_salary, bounces_count, risk_score,
        raw_analytics_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      appStr,
      trkStr,
      String(referenceId || '').trim(),
      String(analysisId || '').trim(),
      Number(summary.averageMonthlyCredits || 0),
      Number(summary.averageMonthlyDebits || 0),
      Number(summary.netCashFlow || 0),
      summary.salaryDetected ? 1 : 0,
      String(summary.detectedEmployer || '').trim(),
      Number(summary.averageSalary || 0),
      Number(summary.chequeBouncesCount || summary.nachBouncesCount || 0),
      String(summary.riskIndicatorScore || 'LOW_RISK').trim(),
      JSON.stringify(analyticsData),
    ]);
  }
}

async function findLatestAnalyticsByApplicationId(applicationId, secondaryId) {
  const rawNum = extractNumericId(applicationId) || extractNumericId(secondaryId);
  const ids = Array.from(new Set([
    String(applicationId || '').trim(),
    String(secondaryId || '').trim(),
    rawNum,
  ])).filter(Boolean);

  if (!ids.length) return null;

  const placeholders = ids.map(() => '?').join(', ');
  const params = [...ids];
  let whereClause = `application_id IN (${placeholders})`;

  if (rawNum) {
    whereClause += ` OR tracking_id LIKE ? ESCAPE '\\\\' OR tracking_id LIKE ? ESCAPE '\\\\'`;
    params.push(`AA\\_TRK\\_${rawNum}\\_%`, `AA\\_TRACK\\_${rawNum}\\_%`);
  }

  const rows = await query(`
    SELECT
      id,
      application_id AS applicationId,
      tracking_id AS trackingId,
      reference_id AS referenceId,
      analysis_id AS analysisId,
      avg_monthly_credits AS avgMonthlyCredits,
      avg_monthly_debits AS avgMonthlyDebits,
      net_cash_flow AS netCashFlow,
      salary_detected AS salaryDetected,
      detected_employer AS detectedEmployer,
      avg_salary AS avgSalary,
      bounces_count AS bouncesCount,
      risk_score AS riskScore,
      raw_analytics_json AS rawAnalyticsJson,
      created_at AS createdAt
    FROM lead_account_aggregator_analytics
    WHERE ${whereClause}
    ORDER BY
      CASE
        WHEN raw_analytics_json LIKE '%transaction%' AND raw_analytics_json NOT LIKE '%"transactions":[]%' THEN 2
        WHEN raw_analytics_json LIKE '%accountDetails%' THEN 1
        ELSE 0
      END DESC,
      id DESC
    LIMIT 1
  `, params);

  if (!rows[0]) return null;

  let parsedRaw = {};
  try {
    parsedRaw = JSON.parse(rows[0].rawAnalyticsJson || '{}');
  } catch {}

  return {
    ...rows[0],
    analytics: parsedRaw,
  };
}

async function resetSession(applicationId, secondaryId) {
  const rawNum = extractNumericId(applicationId) || extractNumericId(secondaryId);
  const ids = Array.from(new Set([
    String(applicationId || '').trim(),
    String(secondaryId || '').trim(),
    rawNum,
  ])).filter(Boolean);

  if (!ids.length) return;

  const placeholders = ids.map(() => '?').join(', ');
  const params = [...ids];
  let whereClause = `application_id IN (${placeholders})`;

  if (rawNum) {
    whereClause += ` OR tracking_id LIKE ? ESCAPE '\\\\' OR tracking_id LIKE ? ESCAPE '\\\\'`;
    params.push(`AA\\_TRK\\_${rawNum}\\_%`, `AA\\_TRACK\\_${rawNum}\\_%`);
  }

  await query(`DELETE FROM lead_account_aggregator_sessions WHERE ${whereClause}`, params);
  await query(`DELETE FROM lead_account_aggregator_analytics WHERE (${whereClause}) AND (raw_analytics_json IS NULL OR raw_analytics_json NOT LIKE '%transaction%' OR raw_analytics_json LIKE '%"transactions":[]%')`, params);
}

module.exports = {
  createSession,
  findLatestSessionByApplicationId,
  findSessionByTrackingId,
  updateSessionStatus,
  saveAnalytics,
  findLatestAnalyticsByApplicationId,
  resetSession,
};
