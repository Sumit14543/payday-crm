const express = require('express');
const accountRoutes = require('./accountRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const authRoutes = require('./authRoutes');
const superadminRoutes = require('./superadminRoutes');
const healthRoutes = require('./healthRoutes');
const integrationRoutes = require('./integrationRoutes');
const integrationController = require('../controllers/integrationController');
const leadRoutes = require('./leadRoutes');
const collectionRoutes = require('./collectionRoutes');
const customerRoutes = require('./customerRoutes');
const loanRoutes = require('./loanRoutes');
const publicLeadRoutes = require('./publicLeadRoutes');
const referenceRoutes = require('./referenceRoutes');
const trackingRoutes = require('./trackingRoutes');
const officialEmailOtpRoutes = require('./officialEmailOtpRoutes');
const billdeskEmandateRoutes = require('./billdeskEmandateRoutes');
const billdeskEmandateController = require('../controllers/billdeskEmandateController');
const cibilController = require('../controllers/cibilController');
const documentRequestController = require('../controllers/documentRequestController');
const esignController = require('../controllers/esignController');
const fileController = require('../controllers/fileController');
const loanAgreementController = require('../controllers/loanAgreementController');
const sanctionController = require('../controllers/sanctionController');
const databaseReady = require('../middleware/databaseReady');
const { requireAuth, requireRole } = require('../middleware/auth');
const { requireIntegrationApiKey } = require('../middleware/integrationAuth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.use('/health', healthRoutes);
router.get('/health-restart', (req, res) => {
  res.json({ success: true, message: 'Initiating process exit to reload code...' });
  setTimeout(() => {
    process.exit(0);
  }, 500);
});
router.use('/auth', authRoutes);
router.use('/superadmin', superadminRoutes);
router.use(databaseReady);

const cashfreeEmandateController = require('../controllers/cashfreeEmandateController');
const cashfreeEmandateRoutes = require('./cashfreeEmandateRoutes');

router.use('/public', publicLeadRoutes);
router.get('/public/emandate-details/:id', asyncHandler(billdeskEmandateController.getPublicEmandateDetails));
router.get('/public/cashfree-emandate-details/:id', asyncHandler(cashfreeEmandateController.getPublicCashfreeDetails));
router.post('/public/emandate-verify', asyncHandler(billdeskEmandateController.verifyPublicEmandate));

router.post('/check-active-application', requireIntegrationApiKey, asyncHandler(integrationController.checkActiveApplication));
router.post('/create-lead', requireIntegrationApiKey, asyncHandler(integrationController.createWebsiteLead));
const performanceRoutes = require('./performanceRoutes');

const tallyRoutes = require('./tallyRoutes');

router.use('/integrations', integrationRoutes);
router.use('/tally', tallyRoutes);
router.use('/tracking', trackingRoutes);
router.use('/accounts', requireAuth, accountRoutes);
router.use('/dashboard', requireAuth, dashboardRoutes);
router.use('/performance', requireAuth, performanceRoutes);
router.use('/leads', requireAuth, leadRoutes);
router.use('/official-email', requireAuth, officialEmailOtpRoutes);
router.use('/credit/official-email', requireAuth, officialEmailOtpRoutes);
router.use('/leads/official-email', requireAuth, officialEmailOtpRoutes);
router.use('/credit/emandate', requireAuth, billdeskEmandateRoutes);
router.use('/leads/emandate', requireAuth, billdeskEmandateRoutes);
const accountAggregatorRoutes = require('./accountAggregatorRoutes');

router.use('/account-aggregator', accountAggregatorRoutes);
router.use('/credit/cashfree-emandate', requireAuth, cashfreeEmandateRoutes);
router.use('/leads/cashfree-emandate', requireAuth, cashfreeEmandateRoutes);
router.post('/webhooks/billdesk-emandate', asyncHandler(billdeskEmandateController.handleBilldeskWebhook));
router.post('/webhooks/razorpay-emandate', asyncHandler(billdeskEmandateController.handleBilldeskWebhook));
router.post('/webhooks/cashfree-emandate', asyncHandler(cashfreeEmandateController.handleCashfreeWebhook));
router.use('/collections', requireAuth, collectionRoutes);
router.use('/customers', requireRole(['credit-manager']), customerRoutes);
router.use('/loans', requireAuth, loanRoutes);
router.get('/files/download', requireAuth, asyncHandler(fileController.downloadUpload));
router.get('/document-upload/:token', asyncHandler(documentRequestController.getPublicDocumentRequest));
router.post(
  '/document-upload/:token',
  documentRequestController.uploadMiddleware(),
  asyncHandler(documentRequestController.uploadPublicDocument)
);
router.get('/esign/:token', asyncHandler(esignController.getPublicEsign));
router.post('/esign/:token/sign', asyncHandler(esignController.signPublicEsign));
router.get('/sanction-decision/:token', asyncHandler(sanctionController.handleCustomerSanctionDecision));
router.post('/sanction-decision/:token', asyncHandler(sanctionController.handleCustomerSanctionDecision));
router.get('/digio/diagnostics', requireRole(['credit-manager', 'accountant']), asyncHandler(loanAgreementController.getDigioDiagnostics));
router.post('/digio/webhook', asyncHandler(loanAgreementController.receiveDigioWebhook));
router.post('/score-callback', asyncHandler(cibilController.receiveScoreCallback));
router.use('/', requireAuth, referenceRoutes);

module.exports = router;
