const leadStatusModel = require('../models/leadStatusModel');
const { notFound, requireFields, success } = require('../utils/http');

async function getApplicationTracking(req, res) {
  requireFields({ ...req.params, ...req.query }, ['applicationId', 'phone']);

  const tracking = await leadStatusModel.findPublicTracking(req.params.applicationId, req.query.phone);
  if (!tracking) return notFound(res, 'Application tracking record not found.');

  // Application number and phone are discoverable identifiers, not proof of
  // customer identity. Source integrations keep their authenticated rich API.
  return success(res, {
    applicationId: tracking.applicationId,
    currentStatus: tracking.currentStatus,
    statusCode: tracking.statusCode,
    publicStatus: tracking.publicStatus,
    progressPercent: tracking.progressPercent,
    nextExpectedAction: tracking.nextExpectedAction,
    isTerminalStatus: tracking.isTerminalStatus,
    lastUpdatedAt: tracking.lastUpdatedAt,
  });
}

module.exports = {
  getApplicationTracking,
};
