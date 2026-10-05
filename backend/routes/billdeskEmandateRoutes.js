const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const billdeskEmandateController = require('../controllers/billdeskEmandateController');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

const creditOrAdminRoles = ['credit-manager', 'product-admin', 'superadmin', 'telecaller', 'accountant'];

router.post('/create-link', requireRole(creditOrAdminRoles), asyncHandler(billdeskEmandateController.createEmandateLink));
router.get('/status/:id', requireRole(creditOrAdminRoles), asyncHandler(billdeskEmandateController.getEmandateStatus));
router.get('/status', requireRole(creditOrAdminRoles), asyncHandler(billdeskEmandateController.getEmandateStatus));

module.exports = router;
