const express = require('express');
const integrationController = require('../controllers/integrationController');
const { requireIntegrationApiKey } = require('../middleware/integrationAuth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.get('/leads/status', requireIntegrationApiKey, asyncHandler(integrationController.getSourceLeadStatus));
router.get('/leads/sanction-pdf', requireIntegrationApiKey, asyncHandler(integrationController.downloadSourceSanctionPdf));
router.post('/leads', requireIntegrationApiKey, asyncHandler(integrationController.ingestLead));
router.post('/repayments', requireIntegrationApiKey, asyncHandler(integrationController.postRepayment));
router.post('/customer-login', requireIntegrationApiKey, asyncHandler(integrationController.recordCustomerLogin));

module.exports = router;
