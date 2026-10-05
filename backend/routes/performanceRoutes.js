const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const performanceController = require('../controllers/performanceController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/telecallers', asyncHandler(performanceController.getTelecallerPerformance));
router.get('/credit-managers', asyncHandler(performanceController.getCreditManagerPerformance));
router.get('/bottlenecks', asyncHandler(performanceController.getBottlenecks));
router.get('/export', asyncHandler(performanceController.exportPerformanceReport));

module.exports = router;
