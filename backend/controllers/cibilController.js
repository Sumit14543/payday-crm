const activityModel = require('../models/activityModel');
const cibilReportModel = require('../models/cibilReportModel');
const leadModel = require('../models/leadModel');
const { config } = require('../config/env');
const { normalizeApiResponse, requestCibilReport } = require('../services/cibilService');
const { analyzeCibilPdf } = require('../services/openaiCibilAnalysisService');
const { notFound, success } = require('../utils/http');

const inFlightCibilRequests = new Map();
const inFlightCibilAnalyses = new Map();

function findFirstPayloadValue(input, keyPatterns) {
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

      if (value && typeof value === 'object') queue.push(value);
    }
  }

  return undefined;
}

function cibilRequestKey(lead) {
  return [lead.panNumber || '', lead.phone || ''].join(':');
}

function providerResultMessage(status, apiResult) {
  if (apiResult.pdfUrl || apiResult.score !== null || status === cibilReportModel.REPORT_STATUS.COMPLETED) {
    return 'CIBIL report generated successfully.';
  }
  if (status === cibilReportModel.REPORT_STATUS.FAILED) {
    return apiResult.providerMessage || 'CIBIL provider completed without a report URL. Please retry the CIBIL check.';
  }

  return 'CIBIL request accepted. Waiting for provider callback/report URL.';
}

function providerActivityDescription(report) {
  if (report.pdfUrl || report.score !== null) {
    return `CIBIL report generated${report.score !== null ? ` with score ${report.score}` : ''}`;
  }

  if (report.status === cibilReportModel.REPORT_STATUS.FAILED) {
    return report.message ? `CIBIL provider returned: ${report.message}` : 'CIBIL provider returned a failed response';
  }

  return 'CIBIL report request is still pending';
}

function completedReportPayload(lead, reportId, apiResult) {
  const status = (apiResult.pdfUrl || apiResult.score !== null || apiResult.providerStatus === cibilReportModel.REPORT_STATUS.COMPLETED)
    ? cibilReportModel.REPORT_STATUS.COMPLETED
    : apiResult.providerStatus === cibilReportModel.REPORT_STATUS.FAILED
      ? cibilReportModel.REPORT_STATUS.FAILED
      : cibilReportModel.REPORT_STATUS.PENDING;

  return {
    id: reportId,
    leadId: lead.rawId,
    applicationId: lead.id,
    fullName: lead.name,
    email: lead.email,
    mobile: lead.phone,
    pan: lead.panNumber,
    score: apiResult.score,
    pdfUrl: apiResult.pdfUrl,
    refId: apiResult.refId,
    rawResponse: {
      status,
      providerStatus: apiResult.providerStatus,
      providerMessage: apiResult.providerMessage || '',
      providerErrorType: apiResult.providerErrorType || '',
      message: providerResultMessage(status, apiResult),
      retryable: status !== cibilReportModel.REPORT_STATUS.COMPLETED,
      request: apiResult.requestBody,
      response: apiResult.payload,
      receivedAt: new Date().toISOString(),
    },
  };
}

function failedReportPayload(lead, reportId, error) {
  return {
    id: reportId,
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
      status: cibilReportModel.REPORT_STATUS.FAILED,
      message: error.publicMessage || error.message || 'CIBIL request failed.',
      retryable: error.retryable !== false,
      upstreamStatus: error.upstreamStatus || null,
      upstreamResponse: error.upstreamResponse || null,
      sentRequestBody: error.sentRequestBody || null,
      failedAt: new Date().toISOString(),
    },
  };
}

async function runCibilRequestInBackground(lead, reportId) {
  try {
    const apiResult = await requestCibilReport(lead);
    const report = await cibilReportModel.saveReport(completedReportPayload(lead, reportId, apiResult));
    if (report.pdfUrl) {
      await leadModel.updateCibilReportUrl({
        leadId: lead.rawId,
        applicationId: lead.id,
        mobile: report.mobile || lead.phone,
        pan: report.pan || lead.panNumber,
        pdfUrl: report.pdfUrl,
      });
    }

    await activityModel.createForLead(lead, {
      type: 'document',
      description: providerActivityDescription(report),
      user: 'System',
      sourceKey: `${report.status === cibilReportModel.REPORT_STATUS.FAILED ? 'cibil-failed' : 'cibil-completed'}:${report.id}`,
      metadata: {
        reportId: report.id,
        score: report.score,
        status: report.status,
        message: report.message || '',
      },
    });

  } catch (error) {
    console.error('Background CIBIL request failed:', error);
    const currentReport = await cibilReportModel.findMappedById(reportId);
    if (currentReport && currentReport.pdfUrl) {
      return;
    }

    const report = await cibilReportModel.saveReport(failedReportPayload(lead, reportId, error));
    await activityModel.createForLead(lead, {
      type: 'document',
      description: 'CIBIL report request failed',
      user: 'System',
      sourceKey: `cibil-failed:${report.id}`,
      metadata: {
        reportId: report.id,
        status: report.status,
        message: error.publicMessage || error.message || 'CIBIL request failed.',
      },
    });
  }
}

async function getLeadCibilReport(req, res) {
  res.set('Cache-Control', 'no-store');

  const lead = await leadModel.findById(req.params.id);
  if (!lead) return notFound(res, 'Lead not found');

  const report = await findOrImportLeadCibilReport(lead);
  return success(res, report);
}

async function findOrImportLeadCibilReport(lead) {
  const report = await cibilReportModel.findLatestByLead(lead);
  if (!report) {
    if (!lead.cibilReportUrl) return null;

    return cibilReportModel.saveReport({
      leadId: lead.rawId,
      applicationId: lead.id,
      fullName: lead.name,
      email: lead.email,
      mobile: lead.phone,
      pan: lead.panNumber,
      pdfUrl: lead.cibilReportUrl,
      rawResponse: {
        status: 'completed',
        source: 'loan_applications.cibil_report_url',
      },
    });
  }

  if (report.leadId === lead.rawId || report.applicationId === lead.id) return report;

  return cibilReportModel.saveReport({
    id: report.id,
    leadId: lead.rawId,
    applicationId: lead.id,
    fullName: lead.name,
    email: lead.email,
    mobile: lead.phone,
    pan: lead.panNumber,
  });
}

async function analyzeAndSaveCibilReport(lead, report, body = {}) {
  if (!report || !report.pdfUrl) {
    const error = new Error('CIBIL PDF is not available yet.');
    error.statusCode = 400;
    error.publicMessage = 'CIBIL PDF is not available yet.';
    throw error;
  }

  await cibilReportModel.saveAnalysis(report.id, {
    analysis: report.analysis || null,
    analysisRawResponse: report.analysisRawResponse || null,
    analysisStatus: 'processing',
    analysisError: '',
    analysisModel: config.openai.model,
    analysisResponseId: report.analysisResponseId || '',
    analyzedAt: report.analyzedAt || null,
  });

  try {
    const result = await analyzeCibilPdf({ lead, report });
    const updatedReport = await cibilReportModel.saveAnalysis(report.id, {
      analysis: result.analysis,
      analysisRawResponse: result.rawResponse,
      analysisStatus: 'completed',
      analysisError: '',
      analysisModel: config.openai.model,
      analysisResponseId: result.responseId,
      analyzedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
    });

    await activityModel.createForLead(lead, {
      type: 'document',
      description: `CIBIL report analyzed by OpenAI${result.analysis?.riskCategory ? `: ${result.analysis.riskCategory}` : ''}`,
      user: body.user || 'System',
      sourceKey: `cibil-analyzed:${report.id}`,
      metadata: {
        reportId: report.id,
        responseId: result.responseId,
        model: config.openai.model,
        riskCategory: result.analysis?.riskCategory || '',
      },
    });

    return updatedReport;
  } catch (error) {
    await cibilReportModel.saveAnalysis(report.id, {
      analysis: report.analysis || null,
      analysisRawResponse: report.analysisRawResponse || null,
      analysisStatus: 'failed',
      analysisError: error.publicMessage || error.message || 'OpenAI analysis failed.',
      analysisModel: config.openai.model,
      analysisResponseId: report.analysisResponseId || '',
      analyzedAt: report.analyzedAt || null,
    });
    throw error;
  }
}

async function analyzeLeadCibilReport(req, res) {
  res.set('Cache-Control', 'no-store');

  const lead = await leadModel.findById(req.params.id);
  if (!lead) return notFound(res, 'Lead not found');

  const report = await findOrImportLeadCibilReport(lead);
  if (!report) return notFound(res, 'CIBIL report not found');

  const key = String(report.id);
  const inFlightAnalysis = inFlightCibilAnalyses.get(key);

  if (inFlightAnalysis) {
    const updatedReport = await inFlightAnalysis;
    return success(res, updatedReport, 'CIBIL analysis is already in progress.', 202);
  }

  const analysisPromise = analyzeAndSaveCibilReport(lead, report, req.body || {});
  inFlightCibilAnalyses.set(key, analysisPromise);

  try {
    const updatedReport = await analysisPromise;
    return success(res, updatedReport, 'CIBIL analysis completed.');
  } finally {
    inFlightCibilAnalyses.delete(key);
  }
}

async function startOrReuseCibilReport(lead, body = {}) {
  const existingReport = await findOrImportLeadCibilReport(lead);
  if (existingReport && existingReport.pdfUrl) {
    return {
      message: 'CIBIL report already available.',
      report: existingReport,
      statusCode: 200,
    };
  }

  if (existingReport && existingReport.status === cibilReportModel.REPORT_STATUS.PENDING) {
    if (!existingReport.isStale) {
      return {
        message: 'CIBIL request is already in progress.',
        report: existingReport,
        statusCode: 202,
      };
    }
  }

  const report = await cibilReportModel.createPendingReport(lead);
  await activityModel.createForLead(lead, {
    type: 'document',
    description: 'CIBIL report request submitted',
    user: body.user || 'CRM User',
    sourceKey: `cibil-requested:${report.id}`,
    metadata: {
      reportId: report.id,
      status: report.status,
    },
  });

  runCibilRequestInBackground(lead, report.id)
    .catch((error) => {
      console.error('Unable to save background CIBIL result:', error);
    });

  return {
    message: 'CIBIL request submitted. Report will appear when ready.',
    report,
    statusCode: 202,
  };
}

async function requestLeadCibilReport(req, res) {
  const lead = await leadModel.findById(req.params.id);
  if (!lead) return notFound(res, 'Lead not found');

  const key = cibilRequestKey(lead);
  const inFlightRequest = inFlightCibilRequests.get(key);

  if (inFlightRequest) {
    await inFlightRequest;
    const report = await cibilReportModel.findLatestByLead(lead);
    return success(res, report, 'CIBIL request is already being submitted.', 202);
  }

  const requestPromise = startOrReuseCibilReport(lead, req.body || {});
  inFlightCibilRequests.set(key, requestPromise);

  try {
    const result = await requestPromise;
    return success(res, result.report, result.message, result.statusCode);
  } finally {
    inFlightCibilRequests.delete(key);
  }
}

async function receiveScoreCallback(req, res) {
  const payload = req.body || {};
  const normalized = await normalizeApiResponse(payload);

  const report = await cibilReportModel.saveReport({
    fullName: payload.full_name || payload.Full_Name || payload.name || findFirstPayloadValue(payload, [/^fullname$/, /^name$/]) || '',
    email: payload.email || payload.Email || findFirstPayloadValue(payload, [/^email$/, /^emailid$/]) || '',
    mobile: payload.mobile || payload.Mobile_Number || payload.mobile_number || findFirstPayloadValue(payload, [/^mobile$/, /^mobilenumber$/, /^phone$/]) || '',
    pan: payload.pan || payload.PAN_Number || payload.pan_number || findFirstPayloadValue(payload, [/^pan$/, /^pannumber$/]) || '',
    score: normalized.score,
    pdfUrl: normalized.pdfUrl,
    refId: normalized.refId,
    rawResponse: {
      status: normalized.pdfUrl
        ? cibilReportModel.REPORT_STATUS.COMPLETED
        : normalized.providerStatus || cibilReportModel.REPORT_STATUS.PENDING,
      providerStatus: normalized.providerStatus,
      providerMessage: normalized.providerMessage || '',
      providerErrorType: normalized.providerErrorType || '',
      message: normalized.pdfUrl
        ? 'CIBIL report generated successfully.'
        : normalized.providerMessage || 'CIBIL callback received without report URL.',
      retryable: !normalized.pdfUrl,
      response: payload,
      receivedAt: new Date().toISOString(),
    },
  });

  if (report.pdfUrl) {
    await leadModel.updateCibilReportUrl({
      leadId: report.leadId,
      applicationId: report.applicationId,
      mobile: report.mobile,
      pan: report.pan,
      pdfUrl: report.pdfUrl,
    });

  }

  return success(res, report, 'CIBIL callback saved successfully.');
}

module.exports = {
  analyzeLeadCibilReport,
  getLeadCibilReport,
  receiveScoreCallback,
  requestLeadCibilReport,
};
