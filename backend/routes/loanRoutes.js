const express = require('express');
const multer = require('multer');
const asyncHandler = require('../utils/asyncHandler');
const loanController = require('../controllers/loanController');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', asyncHandler(loanController.listLoans));
router.get('/:id/noc/pdf', asyncHandler(loanController.downloadNocPdf));
router.post('/:id/noc/send-email', requireRole(['telecaller', 'credit-manager', 'accountant', 'product-admin', 'superadmin']), asyncHandler(loanController.sendNocEmail));
router.get('/:id', asyncHandler(loanController.getLoan));
router.post('/bulk-repayment', requireRole(['superadmin']), upload.single('file'), asyncHandler(loanController.bulkRepayment));

module.exports = router;
