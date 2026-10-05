const express = require('express');
const tallyController = require('../controllers/tallyController');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// GET /api/tally/vouchers
router.get('/vouchers', asyncHandler(tallyController.getTallyVouchers));

module.exports = router;
