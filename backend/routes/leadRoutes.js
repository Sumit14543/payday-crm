const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const aadhaarController = require('../controllers/aadhaarController');
const activityController = require('../controllers/activityController');
const cibilController = require('../controllers/cibilController');
const documentRequestController = require('../controllers/documentRequestController');
const esignController = require('../controllers/esignController');
const leadController = require('../controllers/leadController');
const leadStatusController = require('../controllers/leadStatusController');
const loanAgreementController = require('../controllers/loanAgreementController');
const paymentLinkController = require('../controllers/paymentLinkController');
const sanctionController = require('../controllers/sanctionController');
const telecallerController = require('../controllers/telecallerController');
const officialEmailOtpRoutes = require('./officialEmailOtpRoutes');
const billdeskEmandateRoutes = require('./billdeskEmandateRoutes');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

router.use('/official-email', officialEmailOtpRoutes);
router.use('/:id/official-email', officialEmailOtpRoutes);
router.use('/emandate', billdeskEmandateRoutes);
router.use('/:id/emandate', billdeskEmandateRoutes);

router.get('/', requireRole(['telecaller', 'credit-manager', 'accountant', 'product-admin', 'superadmin']), asyncHandler(leadController.listLeads));
router.get('/credit-queue', requireRole(['credit-manager', 'product-admin', 'superadmin']), asyncHandler(telecallerController.listCreditQueue));
router.get('/credit-queue-v2', requireRole(['credit-manager', 'product-admin', 'superadmin']), asyncHandler(telecallerController.listCreditQueueV2));
router.get('/credit-applications', requireRole(['credit-manager', 'product-admin', 'superadmin']), asyncHandler(telecallerController.listCreditApplications));
router.get('/credit-applications-v2', requireRole(['credit-manager', 'product-admin', 'superadmin']), asyncHandler(telecallerController.listCreditApplicationsV2));
router.get('/accounting-queue', requireRole(['accountant', 'product-admin', 'superadmin']), asyncHandler(telecallerController.listAccountingQueue));
router.get('/accounting-queue-v2', requireRole(['accountant', 'product-admin', 'superadmin']), asyncHandler(telecallerController.listAccountingQueueV2));
router.get('/accounting-payments/recent', requireRole(['accountant', 'product-admin', 'superadmin']), asyncHandler(telecallerController.listRecentAccountingPayments));
router.get('/telecaller-policy', requireRole(['telecaller', 'product-admin', 'superadmin']), asyncHandler(telecallerController.getTelecallerPolicy));
router.get('/telecaller-sla-report', requireRole(['telecaller', 'credit-manager', 'product-admin', 'superadmin']), asyncHandler(telecallerController.getTelecallerSlaReport));
router.get('/telecaller-workbench', requireRole(['telecaller', 'product-admin', 'superadmin']), asyncHandler(telecallerController.listTelecallerWorkbench));
router.get('/telecaller-workbench-v2', requireRole(['telecaller', 'product-admin', 'superadmin']), asyncHandler(telecallerController.listTelecallerWorkbenchV2));
router.get('/:id/duplicates', requireRole(['telecaller', 'credit-manager', 'accountant', 'product-admin', 'superadmin']), asyncHandler(leadController.getDuplicateLeads));
router.get('/:id/telecaller-workspace', requireRole(['telecaller', 'credit-manager', 'accountant', 'product-admin', 'superadmin']), asyncHandler(telecallerController.getWorkspace));

router.post('/:id/reject', requireRole(['telecaller', 'product-admin', 'superadmin']), asyncHandler(leadController.rejectLeadByTelecaller));
router.post('/:id/reloan', requireRole(['credit-manager', 'product-admin', 'superadmin']), asyncHandler(leadController.initiateReloan));
router.post('/:id/call-logs', requireRole(['telecaller', 'product-admin', 'superadmin']), asyncHandler(telecallerController.createCallLog));
router.patch('/:id/document-checks', requireRole(['telecaller', 'credit-manager', 'product-admin', 'superadmin']), asyncHandler(telecallerController.updateDocumentCheck));
router.post('/:id/credit-handoffs', requireRole(['telecaller', 'product-admin', 'superadmin']), asyncHandler(telecallerController.createCreditHandoff));
router.get('/:id/cam-sheet', requireRole(['credit-manager', 'accountant', 'product-admin', 'superadmin']), asyncHandler(esignController.getLeadCamSheet));
router.post('/:id/cam-sheet', requireRole(['credit-manager', 'product-admin', 'superadmin']), asyncHandler(esignController.saveLeadCamSheet));
router.get('/:id/esign-requests/latest', requireRole(['credit-manager', 'accountant', 'product-admin', 'superadmin']), asyncHandler(esignController.getLatestLeadEsign));
router.post('/:id/esign-requests', requireRole(['credit-manager', 'product-admin', 'superadmin']), asyncHandler(esignController.createLeadEsign));
router.get('/:id/sanction/latest', requireRole(['credit-manager', 'accountant', 'product-admin', 'superadmin']), asyncHandler(sanctionController.getLatestLeadSanction));
router.get('/:id/sanction/pdf', requireRole(['credit-manager', 'accountant', 'product-admin', 'superadmin']), asyncHandler(sanctionController.downloadLeadSanctionPdf));
router.post('/:id/sanction/revise', requireRole(['credit-manager', 'product-admin', 'superadmin']), asyncHandler(sanctionController.reviseLeadSanction));
router.post('/:id/sanction/resend', requireRole(['credit-manager', 'product-admin', 'superadmin']), asyncHandler(sanctionController.resendLeadSanction));
router.post('/:id/sanction/reject-post-sanction', requireRole(['credit-manager', 'product-admin', 'superadmin']), asyncHandler(sanctionController.rejectPostSanction));
router.post(
  '/:id/sanction/acceptance-proof',
  requireRole(['credit-manager', 'product-admin', 'superadmin']),
  sanctionController.uploadAcceptanceProofMiddleware(),
  asyncHandler(sanctionController.uploadSanctionAcceptanceProof)
);
router.get('/:id/loan-agreement/latest', requireRole(['credit-manager', 'accountant', 'product-admin', 'superadmin']), asyncHandler(loanAgreementController.getLatestLoanAgreement));
router.post('/:id/loan-agreement/send-esign', requireRole(['credit-manager', 'product-admin', 'superadmin']), asyncHandler(loanAgreementController.sendLoanAgreementForEsign));
router.post('/:id/loan-agreement/refresh-status', requireRole(['credit-manager', 'accountant', 'product-admin', 'superadmin']), asyncHandler(loanAgreementController.refreshLoanAgreementStatus));
router.get('/:id/loan-agreement/signed-pdf', requireRole(['credit-manager', 'accountant', 'product-admin', 'superadmin']), asyncHandler(loanAgreementController.downloadSignedLoanAgreement));
router.post('/:id/credit-decision', requireRole(['credit-manager', 'product-admin', 'superadmin']), asyncHandler(telecallerController.reviewCreditDecision));
router.post('/:id/accounting-payment', requireRole(['accountant', 'product-admin', 'superadmin']), asyncHandler(telecallerController.createAccountingPayment));
router.post('/:id/repayment-link', requireRole(['accountant', 'product-admin', 'superadmin']), asyncHandler(paymentLinkController.createLeadRepaymentLink));
router.post('/:id/accounting-handoff', requireRole(['credit-manager', 'product-admin', 'superadmin']), asyncHandler(telecallerController.sendLeadToAccounting));
router.get('/:id/document-requests', requireRole(['telecaller', 'credit-manager', 'accountant', 'product-admin', 'superadmin']), asyncHandler(documentRequestController.listLeadDocumentRequests));
router.post('/:id/document-requests', requireRole(['telecaller', 'credit-manager', 'product-admin', 'superadmin']), asyncHandler(documentRequestController.createLeadDocumentRequest));
router.delete('/:id/document-requests/:token', requireRole(['telecaller', 'credit-manager', 'product-admin', 'superadmin']), asyncHandler(documentRequestController.removeLeadDocumentRequest));
router.get('/:id/activities', requireRole(['telecaller', 'credit-manager', 'accountant', 'product-admin', 'superadmin']), asyncHandler(activityController.listLeadActivities));
router.post('/:id/activities', requireRole(['telecaller', 'credit-manager', 'accountant', 'product-admin', 'superadmin']), asyncHandler(activityController.createLeadActivity));
router.get('/:id/status-events', requireRole(['telecaller', 'credit-manager', 'accountant', 'product-admin', 'superadmin']), asyncHandler(leadStatusController.listLeadStatusEvents));
router.get('/:id/aadhaar-report', requireRole(['telecaller', 'credit-manager', 'accountant', 'product-admin', 'superadmin']), asyncHandler(aadhaarController.getLeadAadhaarReport));
router.post('/:id/aadhaar-report', requireRole(['telecaller', 'credit-manager', 'product-admin', 'superadmin']), asyncHandler(aadhaarController.requestLeadAadhaarReport));
router.get('/:id/cibil-report', requireRole(['telecaller', 'credit-manager', 'accountant', 'product-admin', 'superadmin']), asyncHandler(cibilController.getLeadCibilReport));
router.post('/:id/cibil-report', requireRole(['telecaller', 'credit-manager', 'product-admin', 'superadmin']), asyncHandler(cibilController.requestLeadCibilReport));
router.post('/:id/cibil-report/analyze', requireRole(['telecaller', 'credit-manager', 'product-admin', 'superadmin']), asyncHandler(cibilController.analyzeLeadCibilReport));
router.get('/:id/noc/pdf', requireRole(['telecaller', 'credit-manager', 'accountant', 'product-admin', 'superadmin']), asyncHandler(leadController.downloadLeadNocPdf));
router.post('/:id/noc/send-email', requireRole(['telecaller', 'credit-manager', 'accountant', 'product-admin', 'superadmin']), asyncHandler(leadController.sendLeadNocEmail));
router.patch('/:id/operations', requireRole(['telecaller', 'credit-manager', 'accountant', 'product-admin', 'superadmin']), asyncHandler(leadController.updateLeadOperations));
router.post('/add-reference', requireRole(['telecaller', 'credit-manager', 'accountant', 'product-admin', 'superadmin']), asyncHandler(leadController.addLeadReference));
router.post('/:id/add-reference', requireRole(['telecaller', 'credit-manager', 'accountant', 'product-admin', 'superadmin']), asyncHandler(leadController.addLeadReference));
router.post('/:id/references', requireRole(['telecaller', 'credit-manager', 'accountant', 'product-admin', 'superadmin']), asyncHandler(leadController.updateLeadReferences));
router.patch('/:id/references', requireRole(['telecaller', 'credit-manager', 'accountant', 'product-admin', 'superadmin']), asyncHandler(leadController.updateLeadReferences));
router.put('/:id/references', requireRole(['telecaller', 'credit-manager', 'accountant', 'product-admin', 'superadmin']), asyncHandler(leadController.updateLeadReferences));
router.patch('/:id/status', requireRole(['telecaller', 'credit-manager', 'product-admin', 'superadmin']), asyncHandler(leadController.updateLeadStatus));
router.delete('/:id', requireRole(['product-admin', 'superadmin']), asyncHandler(leadController.deleteLead));


router.get('/:id', asyncHandler(leadController.getLead));
router.post('/', requireRole(['telecaller', 'product-admin']), asyncHandler(leadController.createLead));

module.exports = router;
