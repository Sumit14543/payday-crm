const express = require('express');
const router = express.Router();
const cashfreeEmandateController = require('../controllers/cashfreeEmandateController');
const { requireRole } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const creditOrAdminRoles = ['credit-manager', 'product-admin', 'superadmin', 'telecaller', 'accountant'];

router.post('/create-link', requireRole(creditOrAdminRoles), asyncHandler(cashfreeEmandateController.createEmandateLink));
router.get('/status/:id', requireRole(creditOrAdminRoles), asyncHandler(cashfreeEmandateController.checkCashfreeEmandateStatus));
router.get('/status', requireRole(creditOrAdminRoles), asyncHandler(cashfreeEmandateController.checkCashfreeEmandateStatus));

module.exports = router;
