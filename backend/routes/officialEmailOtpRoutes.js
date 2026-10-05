const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const officialEmailOtpController = require('../controllers/officialEmailOtpController');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

const creditOrAdminRoles = ['credit-manager', 'product-admin', 'superadmin', 'telecaller', 'accountant'];

router.post('/send-otp', requireRole(creditOrAdminRoles), asyncHandler(officialEmailOtpController.sendOtp));
router.post('/verify-otp', requireRole(creditOrAdminRoles), asyncHandler(officialEmailOtpController.verifyOtp));
router.post('/resend-otp', requireRole(creditOrAdminRoles), asyncHandler(officialEmailOtpController.resendOtp));
router.post('/check-domain', requireRole(creditOrAdminRoles), asyncHandler(officialEmailOtpController.checkDomainAnalysis));
router.get('/check-domain', requireRole(creditOrAdminRoles), asyncHandler(officialEmailOtpController.checkDomainAnalysis));
router.patch('/update', requireRole(creditOrAdminRoles), asyncHandler(officialEmailOtpController.updateOfficialEmail));
router.post('/update', requireRole(creditOrAdminRoles), asyncHandler(officialEmailOtpController.updateOfficialEmail));

module.exports = router;
