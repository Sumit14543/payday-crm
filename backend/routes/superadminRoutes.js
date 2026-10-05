const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const superadminController = require('../controllers/superadminController');
const { requireAuth, requireRole } = require('../middleware/auth');

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
router.post('/login', asyncHandler(superadminController.login));

// Protected superadmin tenant management endpoints
router.get(
  '/tenants',
  requireAuth,
  requireRole(['superadmin']),
  restrictGeetPay,
  asyncHandler(superadminController.getTenants)
);

router.get(
  '/tenants/stats',
  requireAuth,
  requireRole(['superadmin']),
  restrictGeetPay,
  asyncHandler(superadminController.getTenantStats)
);

router.get(
  '/logs',
  requireAuth,
  requireRole(['superadmin']),
  restrictGeetPay,
  asyncHandler(superadminController.getSuperadminLogs)
);

router.get(
  '/details',
  requireAuth,
  requireRole(['superadmin']),
  restrictGeetPay,
  asyncHandler(superadminController.getSuperadminDetails)
);


router.post(
  '/tenants',
  requireAuth,
  requireRole(['superadmin']),
  restrictGeetPay,
  asyncHandler(superadminController.createTenant)
);

router.patch(
  '/tenants/:id',
  requireAuth,
  requireRole(['superadmin']),
  restrictGeetPay,
  asyncHandler(superadminController.toggleTenantStatus)
);

// Tenant User Management
router.get(
  '/users',
  requireAuth,
  requireRole(['superadmin']),
  restrictGeetPay,
  asyncHandler(superadminController.getTenantUsers)
);

router.post(
  '/users',
  requireAuth,
  requireRole(['superadmin']),
  restrictGeetPay,
  asyncHandler(superadminController.createTenantUser)
);

router.patch(
  '/users/:id',
  requireAuth,
  requireRole(['superadmin']),
  restrictGeetPay,
  asyncHandler(superadminController.updateTenantUser)
);

// Telecaller Round-Robin Routing Management
router.get(
  '/telecallers',
  requireAuth,
  requireRole(['superadmin']),
  asyncHandler(superadminController.getTenantTelecallers)
);

router.post(
  '/telecallers/status',
  requireAuth,
  requireRole(['superadmin']),
  asyncHandler(superadminController.toggleTelecallerDuty)
);

router.post(
  '/telecallers/products',
  requireAuth,
  requireRole(['superadmin']),
  asyncHandler(superadminController.updateTelecallerProducts)
);


module.exports = router;
