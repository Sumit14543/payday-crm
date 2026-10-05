const accountReportModel = require('../models/accountReportModel');
const { success } = require('../utils/http');

async function getInterestReports(req, res) {
  const payload = await accountReportModel.getInterestReports(req.query);
  return success(res, payload);
}

module.exports = { getInterestReports };
