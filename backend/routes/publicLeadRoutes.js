const express = require('express');
const publicLeadController = require('../controllers/publicLeadController');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.post('/test-leads', asyncHandler(publicLeadController.createTestingLead));

module.exports = router;