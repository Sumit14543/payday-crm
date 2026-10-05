const express = require('express');
const multer = require('multer');
const path = require('path');
const asyncHandler = require('../utils/asyncHandler');
const collectionController = require('../controllers/collectionController');
const referenceController = require('../controllers/referenceController');
const { requireRole } = require('../middleware/auth');
const { ensureUploadDir } = require('../config/uploads');

const paymentProofDir = ensureUploadDir('payment-proofs');

const uploadProof = multer({
  fileFilter: (req, file, callback) => {
    const allowed = /pdf|png|jpe?g|webp/i.test(file.mimetype || '') ||
      /\.(pdf|png|jpg|jpeg|webp)$/i.test(file.originalname || '');
    callback(allowed ? null : new Error('Only PDF and image files are allowed for payment proof.'), allowed);
  },
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  storage: multer.diskStorage({
    destination: (req, file, callback) => callback(null, paymentProofDir),
    filename: (req, file, callback) => {
      const ext = path.extname(file.originalname || '.png').toLowerCase();
      const caseId = String(req.params.caseId || 'case').replace(/[^a-z0-9_-]/gi, '_');
      callback(null, `proof-${caseId}-${Date.now()}${ext}`);
    },
  }),
});

function paymentUploadMiddleware() {
  return (req, res, next) => {
    uploadProof.single('proofFile')(req, res, (error) => {
      if (error) {
        const publicError = new Error(error.message || 'Unable to upload payment proof file.');
        publicError.statusCode = 400;
        publicError.publicMessage = error.message;
        return next(publicError);
      }
      next();
    });
  };
}

const router = express.Router();

router.get('/', requireRole(['accountant', 'collection']), asyncHandler(referenceController.listCollections));
router.post('/list', requireRole(['accountant', 'collection']), asyncHandler(referenceController.listCollections));
router.get('/summary', requireRole(['collection']), asyncHandler(collectionController.getSummary));
router.post('/summary/fetch', requireRole(['collection']), asyncHandler(collectionController.getSummary));
router.get('/reports', requireRole(['collection']), asyncHandler(collectionController.getReports));
router.get('/:caseId/activity', requireRole(['collection']), asyncHandler(collectionController.getActivity));
router.post('/:caseId/call-log', requireRole(['collection']), asyncHandler(collectionController.createCallLog));
router.post('/:caseId/followups', requireRole(['collection']), asyncHandler(collectionController.createFollowup));
router.post('/:caseId/payment', requireRole(['collection']), paymentUploadMiddleware(), asyncHandler(collectionController.createPayment));
router.post('/:caseId/reopen', requireRole(['collection']), asyncHandler(collectionController.reopenCase));
router.post('/:caseId/ptp', requireRole(['collection']), asyncHandler(collectionController.createPtp));
router.patch('/:caseId/ptp/:ptpId', requireRole(['collection']), asyncHandler(collectionController.updatePtpStatus));

module.exports = router;
