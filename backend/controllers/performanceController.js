const performanceModel = require('../models/performanceModel');
const { success } = require('../utils/http');

async function getTelecallerPerformance(req, res) {
  const period = req.query.period || 'last30days';
  const startDate = req.query.startDate;
  const endDate = req.query.endDate;

  const data = await performanceModel.getTelecallerPerformance({ period, startDate, endDate });
  return success(res, data);
}

async function getCreditManagerPerformance(req, res) {
  const period = req.query.period || 'last30days';
  const data = await performanceModel.getCreditManagerPerformance({ period });
  return success(res, data);
}

async function getBottlenecks(req, res) {
  const data = await performanceModel.getBottlenecksAndSlaAlerts();
  return success(res, data);
}

async function exportPerformanceReport(req, res) {
  const period = req.query.period || 'last30days';
  const telecallersData = await performanceModel.getTelecallerPerformance({ period });
  const creditData = await performanceModel.getCreditManagerPerformance({ period });

  // Generate CSV rows
  let csv = 'SECTION,ROLE,NAME,TOTAL_CALLS/REVIEWED,INTERESTED/APPROVED,CONVERSION/APPROVAL_RATE,AVG_SLA_MINS\n';

  telecallersData.telecallers.forEach((t) => {
    csv += `Telecallers,Telecaller,"${t.actor}",${t.totalCalls},${t.interestedCalls},${t.conversionRate}%,\n`;
  });

  creditData.creditManagers.forEach((c) => {
    csv += `Credit Team,Credit Manager,"${c.managerName}",${c.totalReviewed},${c.approvedCount},${c.approvalRate}%,${c.avgProcessingMins}\n`;
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="staff-performance-report-${period}.csv"`);
  return res.status(200).send('\uFEFF' + csv);
}

module.exports = {
  getTelecallerPerformance,
  getCreditManagerPerformance,
  getBottlenecks,
  exportPerformanceReport,
};
