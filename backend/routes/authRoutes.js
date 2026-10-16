const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const authController = require('../controllers/authController');
const { authLimiter, otpResendLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.post('/login', authLimiter, asyncHandler(authController.login));
router.post('/verify-otp', asyncHandler(authController.verifyTelecallerOtp));
router.post('/resend-otp', otpResendLimiter, asyncHandler(authController.resendTelecallerOtp));
router.get('/branding', asyncHandler(authController.getBranding));

module.exports = router;
