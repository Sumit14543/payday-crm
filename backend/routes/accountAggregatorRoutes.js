const express = require('express');
const accountAggregatorController = require('../controllers/accountAggregatorController');
const { requireRole } = require('../middleware/auth');
const { webhookLimiter } = require('../middleware/rateLimiter');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.param('id', asyncHandler(async (req, res, next) => {
  const lead = await require('../models/leadModel').findById(req.params.id);
  if (!lead) return res.status(404).json({ success: false, message: 'Lead not found.' });
  require('../utils/leadAccess').assertLeadAccess(req.user, lead);
  next();
}));

// Webhook & Callback verification endpoints
router.post('/webhook', webhookLimiter, asyncHandler(accountAggregatorController.handleWebhook));
router.get('/callback-verify', asyncHandler(accountAggregatorController.verifyCallback));

// Lead specific endpoints (Requires telecaller / credit manager / admin roles)
router.post('/leads/:id/generate-url', requireRole(['telecaller', 'credit-manager', 'product-admin', 'superadmin']), asyncHandler(accountAggregatorController.generateUrl));
router.get('/leads/:id/status', requireRole(['telecaller', 'credit-manager', 'accountant', 'product-admin', 'superadmin']), asyncHandler(accountAggregatorController.getStatus));
router.get('/leads/:id/debug-session', requireRole(['credit-manager', 'product-admin', 'superadmin']), asyncHandler(accountAggregatorController.debugSession));
router.post('/leads/:id/send-whatsapp', requireRole(['telecaller', 'credit-manager', 'product-admin', 'superadmin']), asyncHandler(accountAggregatorController.sendWhatsAppLink));
router.post('/leads/:id/reset', requireRole(['telecaller', 'credit-manager', 'product-admin', 'superadmin']), asyncHandler(accountAggregatorController.reset));

module.exports = router;
