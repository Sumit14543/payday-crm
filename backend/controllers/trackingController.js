const leadStatusModel = require('../models/leadStatusModel');
const { notFound, requireFields, success } = require('../utils/http');

async function getApplicationTracking(req, res) {
  requireFields({ ...req.params, ...req.query }, ['applicationId', 'phone']);

  const tracking = await leadStatusModel.findPublicTracking(req.params.applicationId, req.query.phone);
  if (!tracking) return notFound(res, 'Application tracking record not found.');

  return success(res, tracking);
}

module.exports = {
  getApplicationTracking,
};
