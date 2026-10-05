const leadModel = require('../models/leadModel');
const leadStatusModel = require('../models/leadStatusModel');
const { notFound, success } = require('../utils/http');

async function listLeadStatusEvents(req, res) {
  const lead = await leadModel.findById(req.params.id);
  if (!lead) return notFound(res, 'Lead not found');

  const events = await leadStatusModel.findByLead(lead);
  return success(res, events);
}

module.exports = {
  listLeadStatusEvents,
};
