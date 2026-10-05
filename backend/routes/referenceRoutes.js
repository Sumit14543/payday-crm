const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const referenceController = require('../controllers/referenceController');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/collections', requireRole(['accountant', 'collection']), asyncHandler(referenceController.listCollections));
router.get('/team', requireRole(['telecaller', 'credit-manager']), asyncHandler(referenceController.listTeam));
router.get('/commission', requireRole(['accountant']), asyncHandler(referenceController.listCommission));
router.get('/income', requireRole(['accountant']), asyncHandler(referenceController.listIncome));
router.get('/invoices', requireRole(['accountant']), asyncHandler(referenceController.listInvoices));

module.exports = router;
