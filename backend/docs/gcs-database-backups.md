# GCS database backups

Daily backup time: **21:00 Asia/Kolkata** (15:30 UTC). The existing document bucket is reused with an isolated backup folder:

```text
gs://waqt-finance-loan-documents-prod/waqtmoneypay/database-backups/<database>/<UTC timestamp>_<uuid>.sql.gz
```

`GCS_BACKUP_BUCKET` overrides the destination; otherwise the existing `GCS_BUCKET_NAME` is used, followed by the default above. No bucket creation is needed.

## Database behavior

The independent cron command uses `mysqldump --single-transaction --quick --skip-lock-tables`. It does not import the application, database bootstrap, schemas or migrations. Its only preflight SQL reads table-engine metadata; consistent non-locking snapshots require InnoDB. It does not change rows, schema, grants or database configuration, or restart the CRM. Stored routines, triggers and events are included using the existing user's permissions.

SQL is compressed in a private temporary directory. Upload starts only after mysqldump exits successfully. GCS CRC32C and remote size are checked before success is reported. Local temporary files are removed on success and failure. Passwords use a mode-0600 MySQL option file, never command arguments or logs. Temporary directories are mode 0700. A sudden OS/power failure may leave a private working directory in OS temporary storage, outside the web root.

Only `DB_NAME` is backed up by default. Additional tenant/master databases require the explicit `GCS_BACKUP_DATABASES` list. Each database has a separate transactionally consistent snapshot; the script does not discover or alter databases.

## Seven-day cleanup and shared-bucket limits

The cron command runs every five minutes. It calculates the daily due time in India time independently of the server timezone, waits until 21:00 before the first backup, skips an already uploaded daily snapshot and retries failed snapshots on later ticks. `flock` prevents overlapping scheduled jobs.

Every tick also deletes managed SQL archives whose GCS `timeCreated` is at least **168 hours** old, whether a new snapshot is due or not. It checks both the exact folder/name pattern and the backup ownership metadata, and deletes only the recorded object generation. Documents, other folders, unknown files and recent backups are ignored. Historical generations in the backup folder are included in cleanup. Deletion requires the server and cron to be available; it normally occurs within five minutes after expiry.

**Soft Delete is a bucket-wide setting.** The existing bucket was checked on 13 November 2026 using a non-database probe: anonymous access was denied and a deleted generation had seven additional days of Soft Delete retention. Therefore, an archive is removed from the live backup folder after seven days, but its recoverable deleted copy can remain for approximately seven more days (about fourteen days total). This implementation does not promise permanent deletion at day seven on this shared bucket.

The scripts do not change shared Soft Delete, Object Versioning, IAM, public access settings, document lifecycle rules or retention policies. Strict permanent seven-day storage requires a dedicated backup bucket configured without Soft Delete/versioning or longer retention. Turning off Soft Delete on the shared bucket would also affect loan-document recovery and is not performed.

`--check` uploads, verifies and deletes a tiny non-database probe. It refuses storage that permits anonymous reads and reports `softDeleteExtraDays` from deleted-object metadata (or `unknown` when it cannot be determined). Scheduled operation requires only object list/create/get/delete permissions; bucket administration permissions are unnecessary.

Google references: [Soft Delete](https://docs.cloud.google.com/storage/docs/soft-delete), [lifecycle behavior](https://docs.cloud.google.com/storage/docs/lifecycle#behavior), [mysqldump](https://dev.mysql.com/doc/refman/8.4/en/mysqldump.html).

## Deployment

The **Deploy Database Backup Only** GitHub workflow copies only the backup/notification services, two commands and defaults. It runs the read-only readiness check and then installs the independent cron entry. Backup-only commits skip the regular application deployment, so this rollout does not restart the CRM or run its database initialization.

Backup-code pushes also run an immediate full backup smoke test under the same cron lock, read back the latest archive to verify GCS CRC32C, gzip integrity and the dump-completion marker, and send a clearly marked simulated failure alert. This manual test does not replace the daily 21:00 snapshot. A workflow dispatch can opt into the same test with `full_test`; readiness-only dispatches do not create an immediate snapshot.

From the production backend directory with its normal Node environment active:

```sh
NODE_ENV=production node scripts/backupDatabaseToGcs.js --check
NODE_ENV=production node scripts/installGcsBackupCron.js --preview
NODE_ENV=production node scripts/installGcsBackupCron.js --install
```

The `--check` command does not take an immediate database backup. The installer preserves unrelated cron jobs. `mysqldump`/`mariadb-dump`, `flock` and `crontab` must already be installed. Reading and decompressing an archive verifies its integrity, not its restorability; restore testing belongs on an isolated test database.

An administrator can optionally install an independent GCS lifecycle fallback with `node scripts/backupDatabaseToGcs.js --configure-lifecycle`. This merges only `Delete`, `age: 7`, `matchesPrefix: ["waqtmoneypay/database-backups/"]` into existing rules using a metadata precondition. It rejects detected earlier-delete conflicts and incompatible retention/holds. It does not alter bucket-wide protection settings. The automatic deployment does not invoke this command. Google applies lifecycle actions asynchronously; it is not an exact deletion deadline.

## Optional environment overrides

No changes to database settings are required. Optional settings belong in the existing private backend environment file:

```dotenv
GCS_BACKUP_ENABLED=true
GCS_BACKUP_BUCKET=waqt-finance-loan-documents-prod
GCS_BACKUP_PREFIX=waqtmoneypay/database-backups
GCS_BACKUP_TIME_IST=21:00
GCS_BACKUP_NOTIFY_EMAIL=waqtit3@gmail.com
# GCS_BACKUP_DATABASES=your_crm_database,your_master_database
# GCS_BACKUP_DB_USER=existing_backup_reader
# GCS_BACKUP_DB_PASSWORD=provided_securely_on_server
# GCS_BACKUP_DUMP_COMMAND=/usr/bin/mariadb-dump
# GCS_BACKUP_KEY_FILE=/private/path/service-account.json
# GCS_BACKUP_STATE_DIR=/private/path/backup-job-state
```

Credential precedence: `GCS_BACKUP_KEY_FILE`, `GCP_SERVICE_ACCOUNT_KEY` (JSON/base64), `GOOGLE_APPLICATION_CREDENTIALS`, existing `backend/gcp-key.json`, then Application Default Credentials. Never commit credentials or SQL backups.

## Operations

```sh
# Manual extra snapshot; normal operation waits for 21:00 IST:
NODE_ENV=production node scripts/backupDatabaseToGcs.js
# Expiry cleanup without a new snapshot:
NODE_ENV=production node scripts/backupDatabaseToGcs.js --cleanup
# Remove only this feature's scheduled job:
NODE_ENV=production node scripts/installGcsBackupCron.js --remove
```

Private locks and logs default to `~/.local/state/payday-crm-db-backup/`, outside the web root. Failures return a nonzero exit status without logging SQL or passwords. Monitor `backup.log` and daily GCS object timestamps. Expiry continues independently of snapshot success, so failed jobs need prompt attention. This implementation never restores into or writes to the production database.

## Email alerts

Actual successful uploads and failed backup attempts generate email to **waqtit3@gmail.com** by default. Idle cron ticks do not send mail. Identical failed retries are grouped hourly; a different failure gets a separate alert. Success includes the India time, GCS path, compressed size and table count. No database contents, SQL attachments, passwords or signed access URLs are emailed.

The independent notification service reuses existing `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USERNAME`, `SMTP_PASSWORD`, and `SMTP_FROM_EMAIL` settings, without importing the application or database module. It uses verified TLS and bounded timeouts. SMTP acceptance is required before an alert is marked delivered; acceptance does not prove Gmail inbox delivery.

An atomic private outbox persists unsent alerts. Later cron ticks retry them even when no new database snapshot is due. A successful snapshot remains successful when SMTP is unavailable; CLI output separately reports the pending notification and returns nonzero to surface the mail problem. If the host, cron, Node runtime or SMTP service is down, the same process cannot guarantee an immediate failure email. External infrastructure monitoring is required to detect those outages.

```sh
# Read and verify the latest uploaded archive; no SQL is executed:
NODE_ENV=production node scripts/backupDatabaseToGcs.js --verify
# Clearly labelled simulated failure email; does not fail or alter a real backup:
NODE_ENV=production node scripts/backupDatabaseToGcs.js --test-alert
```
