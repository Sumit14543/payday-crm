const express = require('express');
const accountController = require('../controllers/accountController');
const asyncHandler = require('../utils/asyncHandler');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/reports/interest', requireRole(['accountant']), asyncHandler(accountController.getInterestReports));

module.exports = router;
