const fs = require('fs');
const path = require('path');
const { Storage } = require('@google-cloud/storage');
require('./env');

const APP_ROOT = path.resolve(__dirname, '..');
const DEFAULT_KEY_PATH = path.join(APP_ROOT, 'gcp-key.json');

const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'waqt-finance-loan-documents-prod';
const GCS_PREFIX = process.env.GCS_PREFIX || 'waqtmoney-documents/test-uploads';
const ENABLE_GCS_SYNC = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.ENABLE_GCS_SYNC || '').trim().toLowerCase()
);

let storageClient = null;

function getStorageClient() {
  if (storageClient) return storageClient;

  // Option 1: Direct JSON or Base64 string in environment
  if (process.env.GCP_SERVICE_ACCOUNT_KEY) {
    try {
      let rawKey = process.env.GCP_SERVICE_ACCOUNT_KEY.trim();
      if (!rawKey.startsWith('{')) {
        rawKey = Buffer.from(rawKey, 'base64').toString('utf8');
      }
      const credentials = JSON.parse(rawKey);
      storageClient = new Storage({
        projectId: credentials.project_id || process.env.GCP_PROJECT_ID,
        credentials,
      });
      return storageClient;
    } catch (err) {
      console.warn('GCS Warning: Failed to parse GCP_SERVICE_ACCOUNT_KEY from env:', err.message);
    }
  }

  // Option 2: Key file on disk
  const keyFilePath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS)
    : DEFAULT_KEY_PATH;

  if (fs.existsSync(keyFilePath)) {
    try {
      storageClient = new Storage({ keyFilename: keyFilePath });
      return storageClient;
    } catch (err) {
      console.warn('GCS Warning: Failed to initialize Storage with key file:', err.message);
    }
  }

  return null;
}

function isGCSConfigured() {
  return Boolean(ENABLE_GCS_SYNC && getStorageClient());
}

function getBucket(bucketName = BUCKET_NAME) {
  const client = getStorageClient();
  if (!client) return null;
  return client.bucket(bucketName);
}

function getGCSDestination(relativePath) {
  const cleanPath = String(relativePath || '').replace(/^\/+/, '').replace(/^uploads\//, '');
  const prefix = String(process.env.GCS_PREFIX || GCS_PREFIX || '').replace(/^\/+|\/+$/g, '');
  return prefix ? `${prefix}/${cleanPath}` : cleanPath;
}

/**
 * Upload a local file to GCS
 * @param {string} localFilePath - Path to local file
 * @param {string} destinationRelativePath - Relative upload path
 * @param {object} options - Optional metadata / overrides
 */
async function uploadToGCS(localFilePath, destinationRelativePath, options = {}) {
  const client = getStorageClient();
  if (!client) {
    console.warn('GCS Upload skipped: Storage client not configured or disabled.');
    return null;
  }

  const bucket = getBucket(options.bucketName || BUCKET_NAME);
  if (!bucket) {
    console.warn('GCS Upload skipped: Bucket not configured.');
    return null;
  }

  const destination = getGCSDestination(destinationRelativePath);
  const ext = path.extname(localFilePath).toLowerCase();
  const contentTypes = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.txt': 'text/plain',
  };
  const contentType = options.contentType || contentTypes[ext] || 'application/octet-stream';

  try {
    await bucket.upload(localFilePath, {
      destination,
      metadata: {
        contentType,
        cacheControl: options.cacheControl || 'public, max-age=31536000',
        metadata: {
          originalName: options.originalName || path.basename(localFilePath),
          uploadedAt: new Date().toISOString(),
          ...options.customMetadata,
        },
      },
    });

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destination}`;
    return publicUrl;
  } catch (error) {
    console.error(`GCS upload failed for ${destination}:`, error.message);
    throw error;
  }
}

/**
 * Get GCS file handle
 */
function getGCSFile(destinationRelativePath, bucketName = BUCKET_NAME) {
  const bucket = getBucket(bucketName);
  if (!bucket) return null;
  const destination = getGCSDestination(destinationRelativePath);
  return bucket.file(destination);
}

/**
 * Check if a file exists in GCS
 */
async function checkGCSFileExists(destinationRelativePath, bucketName = BUCKET_NAME) {
  const file = getGCSFile(destinationRelativePath, bucketName);
  if (!file) return false;
  try {
    const [exists] = await file.exists();
    return Boolean(exists);
  } catch {
    return false;
  }
}

/**
 * Generate a signed URL for reading a file
 */
async function getSignedUrl(destinationRelativePath, expiresInMinutes = 60, bucketName = BUCKET_NAME) {
  const file = getGCSFile(destinationRelativePath, bucketName);
  if (!file) return null;
  try {
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + expiresInMinutes * 60 * 1000,
    });
    return url;
  } catch (err) {
    console.error('Failed to generate GCS signed URL:', err.message);
    return null;
  }
}

module.exports = {
  BUCKET_NAME,
  GCS_PREFIX,
  ENABLE_GCS_SYNC,
  getStorageClient,
  isGCSConfigured,
  getBucket,
  uploadToGCS,
  getGCSFile,
  checkGCSFileExists,
  getSignedUrl,
};
