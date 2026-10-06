const fs = require('fs');
const path = require('path');
require('./env');

const APP_ROOT = path.resolve(__dirname, '..');
const DEFAULT_UPLOADS_ROOT = path.join(APP_ROOT, 'uploads');
const FALLBACK_UPLOAD_DIRS = [
  '',
  'lead-documents',
  'sanctions',
  'sanction-acceptance',
  'agreements',
  path.join('agreements', 'signed'),
];

function resolveConfiguredUploadsRoot(value) {
  const configuredValue = String(value || '').trim();
  if (!configuredValue) return DEFAULT_UPLOADS_ROOT;
  return path.isAbsolute(configuredValue)
    ? path.resolve(configuredValue)
    : path.resolve(APP_ROOT, configuredValue);
}

const CONFIGURED_UPLOADS_ROOT = resolveConfiguredUploadsRoot(process.env.UPLOADS_DIR);

function prepareUploadsRoot(candidateRoot) {
  fs.mkdirSync(candidateRoot, { recursive: true });
  fs.accessSync(candidateRoot, fs.constants.W_OK);
  return candidateRoot;
}

function resolveUploadsRoot() {
  try {
    return prepareUploadsRoot(CONFIGURED_UPLOADS_ROOT);
  } catch (error) {
    if (CONFIGURED_UPLOADS_ROOT === DEFAULT_UPLOADS_ROOT) throw error;

    console.warn(
      `UPLOADS_DIR is not writable (${CONFIGURED_UPLOADS_ROOT}); falling back to ${DEFAULT_UPLOADS_ROOT}. ` +
      `Original error: ${error.code || error.message}`
    );
    return prepareUploadsRoot(DEFAULT_UPLOADS_ROOT);
  }
}

const UPLOADS_ROOT = resolveUploadsRoot();

function uploadPath(...segments) {
  return path.join(UPLOADS_ROOT, ...segments);
}

function ensureUploadDir(...segments) {
  const directory = uploadPath(...segments);
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

function resolveUploadPath(value) {
  const uploadRef = String(value || '').trim();
  if (!uploadRef) return '';

  if (!uploadRef.startsWith('/uploads/')) {
    return resolveUploadedFileName(uploadRef);
  }

  const relativePath = uploadRef.replace(/^\/uploads\//, '');
  const candidate = path.resolve(UPLOADS_ROOT, relativePath);
  if (!candidate.startsWith(`${UPLOADS_ROOT}${path.sep}`) && candidate !== UPLOADS_ROOT) return '';

  if (fs.existsSync(candidate)) return candidate;

  const resolvedFallback = resolveUploadedFileName(relativePath);
  if (resolvedFallback && fs.existsSync(resolvedFallback)) {
    return resolvedFallback;
  }

  if (UPLOADS_ROOT === DEFAULT_UPLOADS_ROOT) return candidate;

  const fallbackCandidate = path.resolve(DEFAULT_UPLOADS_ROOT, relativePath);
  if (
    fallbackCandidate.startsWith(`${DEFAULT_UPLOADS_ROOT}${path.sep}`) &&
    fs.existsSync(fallbackCandidate)
  ) {
    return fallbackCandidate;
  }

  return candidate;
}

function resolveUploadedFileName(value) {
  const fileName = path.basename(String(value || '').trim());
  if (!fileName || fileName !== String(value || '').trim()) return '';

  for (const directory of FALLBACK_UPLOAD_DIRS) {
    const candidate = path.resolve(UPLOADS_ROOT, directory, fileName);
    if (
      (candidate === UPLOADS_ROOT || candidate.startsWith(`${UPLOADS_ROOT}${path.sep}`)) &&
      fs.existsSync(candidate)
    ) {
      return candidate;
    }
  }

  return path.resolve(UPLOADS_ROOT, fileName);
}

function syncUploadedFile(localFilePath, relativeUploadPath) {
  const isEnabled = ['1', 'true', 'yes', 'on'].includes(
    String(process.env.ENABLE_GCS_SYNC || '').trim().toLowerCase()
  );
  const prefix = String(process.env.GCS_PREFIX || '').trim();

  // Safety guard: only sync if ENABLE_GCS_SYNC is on or testing prefix is configured
  if (!isEnabled && !prefix.includes('test-uploads')) {
    return;
  }

  const gcs = require('./gcs');
  gcs.uploadToGCS(localFilePath, relativeUploadPath).catch((err) => {
    console.warn(`[GCS Sync] Failed to sync ${relativeUploadPath} to GCS:`, err.message);
  });
}

module.exports = {
  DEFAULT_UPLOADS_ROOT,
  UPLOADS_ROOT,
  ensureUploadDir,
  resolveUploadPath,
  uploadPath,
  syncUploadedFile,
};
