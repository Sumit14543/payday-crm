const activityModel = require('../models/activityModel');
const leadModel = require('../models/leadModel');
const { notFound, requireFields, success } = require('../utils/http');

async function listLeadActivities(req, res) {
  const lead = await leadModel.findById(req.params.id);
  if (!lead) return notFound(res, 'Lead not found');

  const activities = await activityModel.findByLead(lead, req.query);
  return success(res, activities);
}

async function createLeadActivity(req, res) {
  requireFields(req.body || {}, ['description']);

  const lead = await leadModel.findById(req.params.id);
  if (!lead) return notFound(res, 'Lead not found');

  const activity = await activityModel.createForLead(lead, {
    type: req.body.type || 'note',
    description: String(req.body.description || '').trim(),
    user: req.body.user || 'CRM User',
    metadata: req.body.metadata || null,
  });

  return success(res, activity, 'Activity saved successfully.', 201);
}

module.exports = {
  createLeadActivity,
  listLeadActivities,
};
