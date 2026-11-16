const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const authController = require('../controllers/authController');
const { authLimiter, otpResendLimiter, otpVerifyLimiter } = require('../middleware/rateLimiter');

const { requireAuth } = require('../middleware/auth');
const router = express.Router();
router.post('/logout', requireAuth, asyncHandler(authController.logout));

router.post('/login', authLimiter, asyncHandler(authController.login));
router.post('/verify-otp', otpVerifyLimiter, asyncHandler(authController.verifyTelecallerOtp));
router.post('/resend-otp', otpResendLimiter, asyncHandler(authController.resendTelecallerOtp));
router.get('/branding', asyncHandler(authController.getBranding));

module.exports = router;
