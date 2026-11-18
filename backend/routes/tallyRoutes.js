const express = require('express');
const tallyController = require('../controllers/tallyController');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// GET /api/tally/vouchers
router.get('/vouchers', asyncHandler(tallyController.getTallyVouchers));

// GET /api/tally/interest-vouchers (Convenience dedicated endpoint for Loan Interest only)
router.get('/interest-vouchers', asyncHandler((req, res) => {
  req.query.voucherType = 'interest';
  return tallyController.getTallyVouchers(req, res);
}));

// GET /api/tally/fee-vouchers (Convenience dedicated endpoint for Processing Fee + GST only)
router.get('/fee-vouchers', asyncHandler((req, res) => {
  req.query.voucherType = 'fee';
  return tallyController.getTallyVouchers(req, res);
}));

module.exports = router;
