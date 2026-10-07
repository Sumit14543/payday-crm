/**
 * Bulk Migration Script: Migrate existing local uploads to Google Cloud Storage (GCS)
 * 
 * Usage:
 *   node scripts/migrate_uploads_to_gcs.js
 *   node scripts/migrate_uploads_to_gcs.js --dry-run
 *   node scripts/migrate_uploads_to_gcs.js --concurrency=5
 */

const fs = require('fs');
const path = require('path');
const { getBucket, getGCSFile, isGCSConfigured, BUCKET_NAME, GCS_PREFIX } = require('../config/gcs');
const { UPLOADS_ROOT, DEFAULT_UPLOADS_ROOT } = require('../config/uploads');

const isDryRun = process.argv.includes('--dry-run');
const concurrencyArg = process.argv.find((arg) => arg.startsWith('--concurrency='));
const CONCURRENCY = concurrencyArg ? Math.max(1, parseInt(concurrencyArg.split('=')[1], 10)) : 4;

const APP_ROOT = path.resolve(__dirname, '..');
const uploadsDir = fs.existsSync(UPLOADS_ROOT)
  ? UPLOADS_ROOT
  : (fs.existsSync(DEFAULT_UPLOADS_ROOT) ? DEFAULT_UPLOADS_ROOT : path.join(APP_ROOT, 'uploads'));

const CONTENT_TYPES = {
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

function getAllFiles(dirPath, arrayOfFiles = []) {
  if (!fs.existsSync(dirPath)) return arrayOfFiles;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles);
    } else if (entry.isFile()) {
      arrayOfFiles.push(fullPath);
    }
  }

  return arrayOfFiles;
}

async function uploadSingleFile(localFilePath, bucket, stats) {
  const relativeFromUploads = path.relative(uploadsDir, localFilePath).replace(/\\/g, '/');
  const relativeUploadPath = `uploads/${relativeFromUploads}`;
  const ext = path.extname(localFilePath).toLowerCase();
  const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
  const fileSizeKB = (fs.statSync(localFilePath).size / 1024).toFixed(1);

  // Destination path in GCS
  const cleanPath = relativeUploadPath.replace(/^\/+/, '').replace(/^uploads\//, '');
  const prefix = String(process.env.GCS_PREFIX || GCS_PREFIX || '').replace(/^\/+|\/+$/g, '');
  const destination = prefix ? `${prefix}/${cleanPath}` : cleanPath;

  const fileRef = bucket.file(destination);

  try {
    // Check if already in GCS to save time and bandwidth
    const [exists] = await fileRef.exists();
    if (exists) {
      stats.skipped++;
      console.log(`[SKIP] Already exists in GCS: ${destination}`);
      return;
    }

    if (isDryRun) {
      stats.uploaded++;
      console.log(`[DRY-RUN] Would upload: ${relativeFromUploads} (${fileSizeKB} KB) -> ${destination}`);
      return;
    }

    await bucket.upload(localFilePath, {
      destination,
      metadata: {
        contentType,
        cacheControl: 'public, max-age=31536000',
        metadata: {
          originalName: path.basename(localFilePath),
          migratedAt: new Date().toISOString(),
        },
      },
    });

    stats.uploaded++;
    console.log(`[SUCCESS] Uploaded (${fileSizeKB} KB): ${destination}`);
  } catch (err) {
    stats.failed++;
    console.error(`[ERROR] Failed to upload ${localFilePath}:`, err.message);
  }
}

async function runMigration() {
  console.log('====================================================');
  console.log('       GCS BULK DOCUMENT MIGRATION UTILITY          ');
  console.log('====================================================');
  console.log(`Local Uploads Directory : ${uploadsDir}`);
  console.log(`Target GCS Bucket       : ${BUCKET_NAME}`);
  console.log(`Target GCS Prefix       : ${GCS_PREFIX}`);
  console.log(`Dry Run Mode            : ${isDryRun ? 'YES (No files will be uploaded)' : 'NO (Live Upload)'}`);
  console.log(`Concurrency             : ${CONCURRENCY} parallel uploads`);
  console.log('----------------------------------------------------\n');

  if (!fs.existsSync(uploadsDir)) {
    console.error(`Error: Uploads directory does not exist at: ${uploadsDir}`);
    process.exit(1);
  }

  const bucket = getBucket();
  if (!bucket) {
    console.error('Error: Could not initialize GCS Bucket. Check gcp-key.json and .env configuration.');
    process.exit(1);
  }

  console.log('Scanning local files...');
  const allFiles = getAllFiles(uploadsDir);
  console.log(`Found ${allFiles.length} files in local uploads directory.\n`);

  if (allFiles.length === 0) {
    console.log('No files found to migrate.');
    process.exit(0);
  }

  const stats = { total: allFiles.length, uploaded: 0, skipped: 0, failed: 0 };
  const startTime = Date.now();

  // Run in concurrent batches
  for (let i = 0; i < allFiles.length; i += CONCURRENCY) {
    const chunk = allFiles.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map((filePath) => uploadSingleFile(filePath, bucket, stats)));
    const processed = Math.min(i + CONCURRENCY, allFiles.length);
    const percent = Math.round((processed / allFiles.length) * 100);
    console.log(`--- Progress: ${processed}/${allFiles.length} (${percent}%) ---`);
  }

  const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n====================================================');
  console.log('              MIGRATION COMPLETED                   ');
  console.log('====================================================');
  console.log(`Total Files Scanned : ${stats.total}`);
  console.log(`Uploaded to GCS     : ${stats.uploaded}`);
  console.log(`Already in GCS      : ${stats.skipped}`);
  console.log(`Failed              : ${stats.failed}`);
  console.log(`Time Taken          : ${elapsedSeconds} seconds`);
  console.log('====================================================');
}

runMigration().catch((err) => {
  console.error('Fatal Migration Error:', err);
  process.exit(1);
});
