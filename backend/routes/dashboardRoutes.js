const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const dashboardController = require('../controllers/dashboardController');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/accountant', requireRole(['accountant']), asyncHandler(dashboardController.getAccountantDashboard));
router.get('/stats', asyncHandler(dashboardController.getStats));
router.get('/audit-logs', requireRole(['superadmin', 'accountant', 'credit-manager']), asyncHandler(dashboardController.getAuditLogs));
router.get('/ip-geo', asyncHandler(dashboardController.getIpGeo));

module.exports = router;
