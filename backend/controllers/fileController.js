const fs = require('fs');
const path = require('path');
const { resolveUploadPath } = require('../config/uploads');

const CONTENT_TYPES = {
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function contentTypeFor(filePath) {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

async function downloadUpload(req, res) {
  const uploadRef = String(req.query.path || '').trim();
  const filePath = resolveUploadPath(uploadRef);

  if (!filePath) {
    const error = new Error('Invalid upload path.');
    error.statusCode = 400;
    error.publicMessage = error.message;
    throw error;
  }

  if (!fs.existsSync(filePath)) {
    const gcs = require('../config/gcs');
    if (gcs.isGCSConfigured()) {
      try {
        const gcsFile = gcs.getGCSFile(uploadRef);
        if (gcsFile) {
          const [exists] = await gcsFile.exists();
          if (exists) {
            const [metadata] = await gcsFile.getMetadata().catch(() => [{}]);
            const contentType = metadata.contentType || contentTypeFor(uploadRef);
            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Disposition', `inline; filename="${path.basename(uploadRef)}"`);
            return gcsFile.createReadStream().pipe(res);
          }
        }
      } catch (gcsErr) {
        console.warn(`[GCS Stream Error] ${uploadRef}:`, gcsErr.message);
      }
    }

    const error = new Error('File not found.');
    error.statusCode = 404;
    error.publicMessage = error.message;
    throw error;
  }

  res.setHeader('Content-Type', contentTypeFor(filePath));
  res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);
  return res.sendFile(filePath);
}

module.exports = {
  downloadUpload,
};
