const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const customerController = require('../controllers/customerController');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', asyncHandler(customerController.listCustomers));
router.get('/:id', asyncHandler(customerController.getCustomer));
router.post('/:id/reloan', requireRole(['credit-manager', 'product-admin', 'superadmin']), asyncHandler(customerController.initiateReloan));

module.exports = router;
