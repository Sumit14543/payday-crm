// Deliberately does not import index.js, config/db.js or any schema/bootstrap code.
const backup = require('../services/databaseBackup');
const notifications = require('../services/databaseBackupNotifications');

async function main(args = process.argv.slice(2)) {
  if (args.includes('--help')) {
    console.log('Usage: node scripts/backupDatabaseToGcs.js [--check | --configure-lifecycle | --scheduled | --cleanup | --verify | --test-alert | --smtp-check]');
    return;
  }
  if (args.length > 1 || args.some(arg => !['--check', '--configure-lifecycle', '--scheduled', '--cleanup', '--verify', '--test-alert', '--smtp-check'].includes(arg))) throw new Error('Unknown backup command; use --help.');
  require('../config/env'); // Environment loading only; no app/database initialization.
  const config = backup.readBackupConfig();
  if (!config.enabled && !args.includes('--configure-lifecycle') && !args.includes('--check')) {
    console.log(JSON.stringify({ skipped: true, reason: 'GCS_BACKUP_ENABLED=false' }));
    return;
  }
  if (args.includes('--smtp-check')) {
    const smtp = await notifications.checkSmtp();
    console.log(JSON.stringify({ smtp }));
    if (!smtp.ready) process.exitCode = 1;
    return;
  }
  if (args.includes('--test-alert')) {
    const report = notifications.makeReport(config, { error: new Error('Simulated backup failure to verify email alerts.'), test: true });
    const result = await notifications.deliverReports(config, report);
    console.log(JSON.stringify({ testAlert: true, notification: result }));
    if (!result.accepted) process.exitCode = 1;
    return;
  }
  if (args.includes('--configure-lifecycle')) {
    const bucket = backup.createStorageClient().bucket(config.bucket);
    await backup.configureBackupLifecycle(bucket, config);
    console.log(JSON.stringify({ configured: config.bucket, prefix: config.prefix, retentionDays: 7 }));
    return;
  }
  if (args.includes('--check')) {
    const bucket = backup.createStorageClient().bucket(config.bucket);
    await backup.listBackups(bucket, config); // Verify list access, including past generations.
    const storage = await backup.checkStorageAccess(bucket, config); // Only a temporary, non-database probe object is created/deleted.
    await backup.getDumpArguments(config, config.databases[0], 'unused-check-only.cnf');
    for (const database of config.databases) await backup.checkDatabaseTables(config, database);
    console.log(JSON.stringify({ ready: true, bucket: config.bucket, prefix: config.prefix, databases: config.databases, schedule: `${config.time} Asia/Kolkata`, backupFolderRetentionDays: 7, ...storage }));
    return;
  }
  if (args.includes('--verify')) {
    const bucket = backup.createStorageClient().bucket(config.bucket);
    console.log(JSON.stringify({ verified: await backup.verifyLatestBackups(bucket, config) }));
    return;
  }
  const result = await notifications.runWithNotifications(config, () => {
    const bucket = backup.createStorageClient().bucket(config.bucket);
    return backup.runBackupJob(bucket, config, { scheduled: args.includes('--scheduled'), cleanupOnly: args.includes('--cleanup') });
  });
  console.log(JSON.stringify(result));
  if (!result.notification.accepted) process.exitCode = 1;
}

if (require.main === module) main().catch(error => {
  console.error(`GCS database backup failed: ${error.message}`);
  if (error.notification) console.error(JSON.stringify({ notification: error.notification }));
  process.exitCode = 1;
});

module.exports = { main };
