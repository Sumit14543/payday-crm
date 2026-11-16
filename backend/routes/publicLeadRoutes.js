const express = require('express');
const publicLeadController = require('../controllers/publicLeadController');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

if (process.env.NODE_ENV !== 'production' && process.env.ENABLE_TEST_ACCOUNTS === 'true') router.post('/test-leads', require('../middleware/rateLimiter').publicLeadLimiter, asyncHandler(publicLeadController.createTestingLead));

module.exports = router;
