const express = require('express');
const path = require('path');
require('./config/env');
const apiRoutes = require('./routes');
const cashfreeWebhookController = require('./controllers/cashfreeWebhookController');
const cors = require('./middleware/cors');
const securityHeaders = require('./middleware/securityHeaders');
const { apiLimiter, webhookLimiter } = require('./middleware/rateLimiter');
const { authOptional } = require('./middleware/auth');
const asyncHandler = require('./utils/asyncHandler');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./middleware/logger');
const notFound = require('./middleware/notFound');
const { DEFAULT_UPLOADS_ROOT, UPLOADS_ROOT } = require('./config/uploads');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', require('./config/trustedProxies'));

app.use(securityHeaders);
app.use(cors);


app.use('/api/cashfree/webhook', express.raw({ type: 'application/json', limit: '2mb' }));

app.use(['/api/webhooks/billdesk-emandate', '/api/webhooks/razorpay-emandate'], express.text({ type: ['application/jose', 'text/plain'], limit: '2mb' }));
app.use(express.json({ limit: '20mb', verify: (req, res, bytes) => { if (['/api/webhooks/cashfree-emandate', '/api/webhooks/razorpay-emandate'].includes(req.path)) req.rawBody = bytes; } }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

const tenantMiddleware = require('./middleware/tenantMiddleware');
const verifyTenantSession = require('./middleware/verifyTenantSession');
app.use(tenantMiddleware);
app.use(authOptional);
app.use(asyncHandler(verifyTenantSession));
app.post('/api/cashfree/webhook', webhookLimiter, asyncHandler(require('./utils/transactionalHandler')(cashfreeWebhookController.receiveCashfreeWebhook)));

// Apply general API rate limiting to all /api routes (differentiates authenticated users vs anonymous)
app.use('/api', apiLimiter);

const tallyRoutes = require('./routes/tallyRoutes');
app.use('/api/tally', tallyRoutes);
app.use(logger);
app.use('/uploads', (req, res, next) => {
  req.documentPath = '/uploads' + req.path;
  const normalizedPath = String(req.path || '').toLowerCase().replace(/\\/g, '/');

  // Block directory traversal attempts immediately
  if (normalizedPath.includes('..')) {
    return res.status(403).json({
      success: false,
      message: 'Forbidden document path.',
    });
  }

  // Only public branding assets (logos) can be accessed without authentication
  const isPublicBrandAsset = normalizedPath.startsWith('/brand/') || normalizedPath === '/brand';
  if (isPublicBrandAsset || req.user || req.documentCapability) {
    res.setHeader('Cache-Control', 'private, no-store');
    return next();
  }

  return res.status(401).json({
    success: false,
    message: 'Authentication is required to access this document.',
  });
});
app.use('/uploads', asyncHandler(require('./middleware/documentAccess')));
const staticUploadOptions = {
  maxAge: 0,
  setHeaders: res => res.setHeader('Cache-Control', 'private, no-store'),
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



app.get('/403.shtml', (req, res) => res.status(403).json({ success: false, message: 'Access Forbidden' }));
app.get('/404.shtml', (req, res) => res.status(404).json({ success: false, message: 'Not Found' }));

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
