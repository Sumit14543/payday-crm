const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const superadminController = require('../controllers/superadminController');
const { requireAuth, requireRole } = require('../middleware/auth');
const { authLimiter, otpResendLimiter, otpVerifyLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

function restrictGeetPay(req, res, next) {
  if (req.tenant && req.tenant.slug === 'geetpay') {
    return res.status(403).json({
      success: false,
      message: 'Superadmin operations are disabled for this tenant.',
    });
  }
  next();
}

// Public superadmin login
router.post('/login', authLimiter, asyncHandler(superadminController.login));
router.post('/verify-otp', otpVerifyLimiter, asyncHandler(superadminController.verifyOtp));
router.post('/resend-otp', otpResendLimiter, asyncHandler(superadminController.resendOtp));

// Protected superadmin tenant management endpoints
router.get(
  '/tenants',
  requireAuth,
  requireRole(['superadmin', 'product-admin']),
  asyncHandler(superadminController.getTenants)
);

router.get(
  '/tenants/stats',
  requireAuth,
  requireRole(['superadmin', 'product-admin']),
  asyncHandler(superadminController.getTenantStats)
);

router.get(
  '/logs',
  requireAuth,
  requireRole(['superadmin', 'product-admin']),
  asyncHandler(superadminController.getSuperadminLogs)
);

router.get(
  '/details',
  requireAuth,
  requireRole(['superadmin', 'product-admin']),
  asyncHandler(superadminController.getSuperadminDetails)
);


router.post(
  '/tenants',
  requireAuth,
  requireRole(['superadmin', 'product-admin']),
  requireRole(['superadmin']),
  asyncHandler(superadminController.createTenant)
);

router.patch(
  '/tenants/:id',
  requireAuth,
  requireRole(['superadmin', 'product-admin']),
  requireRole(['superadmin']),
  asyncHandler(superadminController.toggleTenantStatus)
);

// Tenant User Management
router.get(
  '/users',
  requireAuth,
  requireRole(['superadmin', 'product-admin']),
  asyncHandler(superadminController.getTenantUsers)
);

router.post(
  '/users',
  requireAuth,
  requireRole(['superadmin', 'product-admin']),
  asyncHandler(superadminController.createTenantUser)
);

router.patch(
  '/users/:id',
  requireAuth,
  requireRole(['superadmin', 'product-admin']),
  asyncHandler(superadminController.updateTenantUser)
);

// Telecaller Round-Robin Routing Management
router.get(
  '/telecallers',
  requireAuth,
  requireRole(['superadmin', 'product-admin']),
  asyncHandler(superadminController.getTenantTelecallers)
);

router.post(
  '/telecallers/status',
  requireAuth,
  requireRole(['superadmin', 'product-admin']),
  asyncHandler(superadminController.toggleTelecallerDuty)
);

router.post(
  '/telecallers/products',
  requireAuth,
  requireRole(['superadmin', 'product-admin']),
  asyncHandler(superadminController.updateTelecallerProducts)
);


module.exports = router;
