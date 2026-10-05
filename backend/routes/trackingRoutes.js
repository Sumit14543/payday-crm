const express = require('express');
const trackingController = require('../controllers/trackingController');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.get('/:applicationId', asyncHandler(trackingController.getApplicationTracking));

module.exports = router;
