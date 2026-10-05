const activityModel = require('../models/activityModel');
const aadhaarReportModel = require('../models/aadhaarReportModel');
const leadModel = require('../models/leadModel');
const { requestAadhaarData } = require('../services/aadhaarService');
const { notFound, success } = require('../utils/http');

async function getLeadAadhaarReport(req, res) {
  res.set('Cache-Control', 'no-store');

  const lead = await leadModel.findById(req.params.id);
  if (!lead) return notFound(res, 'Lead not found');

  const report = await aadhaarReportModel.findLatestByLead(lead);
  return success(res, report);
}

async function requestLeadAadhaarReport(req, res) {
  res.set('Cache-Control', 'no-store');

  const lead = await leadModel.findById(req.params.id);
  if (!lead) return notFound(res, 'Lead not found');

  const existingReport = await aadhaarReportModel.findLatestByLead(lead);
  if (aadhaarReportModel.isCompleteReport(existingReport)) {
    return success(res, existingReport, 'Aadhaar data already available.');
  }

  const apiResult = await requestAadhaarData(lead.aadhaarUniqueId);
  const report = await aadhaarReportModel.saveReport(lead, {
    ...apiResult,
    rawResponse: apiResult.payload,
  });
  await activityModel.createForLead(lead, {
    type: 'document',
    description: aadhaarReportModel.isCompleteReport(report)
      ? 'Aadhaar data fetched and verified'
      : 'Aadhaar data fetched with incomplete provider response',
    user: req.body?.user || 'CRM User',
    sourceKey: `aadhaar-report:${report.id}`,
    metadata: {
      reportId: report.id,
      isComplete: report.isComplete,
    },
  });

  return success(res, report, 'Aadhaar data fetched successfully.', 201);
}

module.exports = {
  getLeadAadhaarReport,
  requestLeadAadhaarReport,
};
