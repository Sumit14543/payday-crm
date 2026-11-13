const sync = require('../services/gcsDocumentSync');

async function main(args = process.argv.slice(2)) {
  if (args.length > 1 || args.some(arg => !['--once', '--backfill', '--verify'].includes(arg))) throw new Error('Use --once, --backfill or --verify.');
  require('../config/env');
  const config = sync.readSyncConfig();
  const bucket = require('../config/gcs').getBucket(config.bucket);
  if (!bucket) throw new Error('GCS document storage is unavailable.');
  const result = await sync.runSync(bucket, config, {
    verifyOnly: args.includes('--verify'), budgetMs: args.includes('--backfill') || args.includes('--verify') ? 45 * 60 * 1000 : 4 * 60 * 1000,
    onProgress: counts => console.log('GCS_DOCUMENT_SYNC_PROGRESS ' + JSON.stringify(counts)),
  });
  console.log('GCS_DOCUMENT_SYNC_COUNTS ' + JSON.stringify(result));
  if (result.failed || result.readErrors || ((args.includes('--backfill') || args.includes('--verify')) && result.unprocessed) || (args.includes('--verify') && result.wouldUpload)) process.exitCode = 1;
}

if (require.main === module) main().catch(error => {
  console.error('GCS document sync failed: ' + (error.code || error.name));
  process.exitCode = 1;
});
module.exports = { main };
