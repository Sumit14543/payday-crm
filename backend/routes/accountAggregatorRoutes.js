const express = require('express');
const accountAggregatorController = require('../controllers/accountAggregatorController');
const { authOptional, requireRole } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// Apply authOptional so req.user is populated from Bearer token for all routes
router.use(authOptional);

// Public Webhook, Callback verification, and Diagnostic endpoints
router.post('/webhook', asyncHandler(accountAggregatorController.handleWebhook));
router.get('/callback-verify', asyncHandler(accountAggregatorController.verifyCallback));
router.get('/public-debug-session/:id', asyncHandler(accountAggregatorController.debugSession));

// Lead specific endpoints (Requires telecaller / credit manager / admin roles)
router.post('/leads/:id/generate-url', requireRole(['telecaller', 'credit-manager', 'product-admin', 'superadmin']), asyncHandler(accountAggregatorController.generateUrl));
router.get('/leads/:id/status', requireRole(['telecaller', 'credit-manager', 'accountant', 'product-admin', 'superadmin']), asyncHandler(accountAggregatorController.getStatus));
router.get('/leads/:id/debug-session', asyncHandler(accountAggregatorController.debugSession));
router.post('/leads/:id/send-whatsapp', requireRole(['telecaller', 'credit-manager', 'product-admin', 'superadmin']), asyncHandler(accountAggregatorController.sendWhatsAppLink));
router.post('/leads/:id/reset', requireRole(['telecaller', 'credit-manager', 'product-admin', 'superadmin']), asyncHandler(accountAggregatorController.reset));

module.exports = router;
