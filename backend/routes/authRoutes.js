const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const authController = require('../controllers/authController');

const router = express.Router();

router.post('/login', asyncHandler(authController.login));
router.post('/verify-otp', asyncHandler(authController.verifyTelecallerOtp));
router.post('/resend-otp', asyncHandler(authController.resendTelecallerOtp));
router.get('/branding', asyncHandler(authController.getBranding));

module.exports = router;
