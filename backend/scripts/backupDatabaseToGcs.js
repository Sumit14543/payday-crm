// Deliberately does not import index.js, config/db.js or any schema/bootstrap code.
const backup = require('../services/databaseBackup');

async function main(args = process.argv.slice(2)) {
  if (args.includes('--help')) {
    console.log('Usage: node scripts/backupDatabaseToGcs.js [--check | --configure-lifecycle | --scheduled | --cleanup]');
    return;
  }
  if (args.length > 1 || args.some(arg => !['--check', '--configure-lifecycle', '--scheduled', '--cleanup'].includes(arg))) throw new Error('Unknown backup command; use --help.');
  require('../config/env'); // Environment loading only; no app/database initialization.
  const config = backup.readBackupConfig();
  if (!config.enabled && !args.includes('--configure-lifecycle') && !args.includes('--check')) {
    console.log(JSON.stringify({ skipped: true, reason: 'GCS_BACKUP_ENABLED=false' }));
    return;
  }
  const bucket = backup.createStorageClient().bucket(config.bucket);
  if (args.includes('--configure-lifecycle')) {
    await backup.configureBackupLifecycle(bucket, config);
    console.log(JSON.stringify({ configured: config.bucket, prefix: config.prefix, retentionDays: 7 }));
    return;
  }
  if (args.includes('--check')) {
    await backup.listBackups(bucket, config); // Verify list access, including past generations.
    const storage = await backup.checkStorageAccess(bucket, config); // Only a temporary, non-database probe object is created/deleted.
    await backup.getDumpArguments(config, config.databases[0], 'unused-check-only.cnf');
    for (const database of config.databases) await backup.checkDatabaseTables(config, database);
    console.log(JSON.stringify({ ready: true, bucket: config.bucket, prefix: config.prefix, databases: config.databases, schedule: `${config.time} Asia/Kolkata`, backupFolderRetentionDays: 7, ...storage }));
    return;
  }
  console.log(JSON.stringify(await backup.runBackupJob(bucket, config, { scheduled: args.includes('--scheduled'), cleanupOnly: args.includes('--cleanup') })));
}

if (require.main === module) main().catch(error => {
  console.error(`GCS database backup failed: ${error.message}`);
  process.exitCode = 1;
});

module.exports = { main };
