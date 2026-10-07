const express = require('express');
const path = require('path');
require('./config/env');
const apiRoutes = require('./routes');
const cashfreeWebhookController = require('./controllers/cashfreeWebhookController');
const cors = require('./middleware/cors');
const { authOptional } = require('./middleware/auth');
const asyncHandler = require('./utils/asyncHandler');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./middleware/logger');
const notFound = require('./middleware/notFound');
const { DEFAULT_UPLOADS_ROOT, UPLOADS_ROOT } = require('./config/uploads');

const app = express();
app.set('trust proxy', true);

app.use(cors);


app.post(
  '/api/cashfree/webhook',
  express.raw({ type: 'application/json', limit: '2mb' }),
  asyncHandler(cashfreeWebhookController.receiveCashfreeWebhook)
);

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

const tallyRoutes = require('./routes/tallyRoutes');
app.use('/api/tally', tallyRoutes);

const tenantMiddleware = require('./middleware/tenantMiddleware');
const verifyTenantSession = require('./middleware/verifyTenantSession');
app.use(tenantMiddleware);
app.use(authOptional);
app.use(asyncHandler(verifyTenantSession));
app.use(logger);
app.use('/uploads', (req, res, next) => {
  const sensitivePrefixes = [
    '/agreements/',
    '/lead-documents/',
    '/sanction-acceptance/',
    '/sanctions/',
  ];
  const isSensitive = sensitivePrefixes.some((prefix) => req.path.startsWith(prefix));
  if (!isSensitive || req.user) return next();

  return res.status(401).json({
    success: false,
    message: 'Authentication is required to access this document.',
  });
});
const staticUploadOptions = {
  maxAge: '1d',
  etag: true,
  lastModified: true,
};
app.use('/uploads', express.static(UPLOADS_ROOT, staticUploadOptions));
if (UPLOADS_ROOT !== DEFAULT_UPLOADS_ROOT) {
  app.use('/uploads', express.static(DEFAULT_UPLOADS_ROOT, staticUploadOptions));
}

// GCS Cloud Fallback: If file is deleted from local disk, stream seamlessly from GCS
app.use('/uploads', async (req, res, next) => {
  const gcs = require('./config/gcs');
  if (!gcs.isGCSConfigured()) return next();

  try {
    const uploadRef = `/uploads${req.path}`;
    const gcsFile = gcs.getGCSFile(uploadRef);
    if (!gcsFile) return next();

    const [exists] = await gcsFile.exists();
    if (!exists) return next();

    const [metadata] = await gcsFile.getMetadata().catch(() => [{}]);
    const ext = path.extname(req.path).toLowerCase();
    const contentTypes = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
    };
    const contentType = metadata.contentType || contentTypes[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(req.path)}"`);
    return gcsFile.createReadStream().pipe(res);
  } catch (err) {
    console.warn(`[GCS Fallback Error] ${req.path}:`, err.message);
    return next();
  }
});



app.get('/', (req, res) => {
  res.json({
    success: true,
    service: 'payday-loan-crm-api',
    message: 'Backend is running. Use /api/health, /api/leads, or /api/dashboard/stats.',
  });
});

app.use('/api', apiRoutes);



app.use(notFound);
app.use(errorHandler);

module.exports = app;
