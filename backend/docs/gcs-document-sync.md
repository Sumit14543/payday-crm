# GCS document mirror

All regular files under the CRM's configured uploads directory, default `backend/uploads`, and existing OS fallback `payday-uploads` are mirrored to the existing `GCS_BUCKET_NAME` and `GCS_PREFIX`. This includes uploaded KYC/proofs and generated CIBIL, sanction, agreement and signed-agreement PDFs, regardless of whether the writing controller calls the immediate-upload helper.

An independent Linux cron job runs every ten minutes (`*/10 * * * *`) under `flock`, at minutes 00, 10, 20, 30, 40 and 50 of each hour. Stable new/changed files are picked up at the next scheduled scan, subject to the 20-second stability check, file size and network availability. A run has a four-minute budget; overlapping cron ticks skip the lock. Files left pending or failed are retried on later scans. Existing application uploads/downloads continue to use their current paths. No DB schema/data changes, application imports, CRM restarts, bucket-policy changes, signed URL changes or document deletions are needed.

## Integrity and source preservation

- Every scan reads fresh GCS metadata under only the configured document prefix. Database-backup prefixes are rejected, and backup retention is untouched.
- Local MD5 and remote size/MD5 are compared, detecting different content even when byte sizes match. A private cache avoids rereading unchanged source files; GCS presence/hash is still checked on every run.
- A private stable snapshot is created before each upload. Source identity/size/timestamps are checked before and after reading. Recent/actively changing files are deferred and checked again later.
- Uploads use GCS CRC32C validation, generation preconditions and remote size/MD5 verification. No public ACL or IAM change is made.
- A changed cloud object's previous generation is copied into `_sync-history/<path hash>/<generation>.<extension>` before replacement. History is not automatically deleted by this feature.
- The active application upload root wins duplicate relative paths; conflicting legacy-root copies are also saved under `_source-copies/<root hash>/...`.
- Server files remain in place. The local filesystem acts as the durable pending queue, so interrupted processes and failed requests are recovered by later scans even if the cache is lost.
- Symlinks are skipped, control files are excluded, and private state/snapshots are outside the application/web root. A suddenly killed process may leave a private snapshot directory; it does not expose or remove the original document.

The initial hash pass reads existing local content, using two workers. Later passes reuse hashes only while source inode, device, size, modification time and change time still match. Large new files require enough private temporary disk space for their snapshot.

## Deployment and operations

The **Deploy GCS Document Sync Only** workflow copies only this service and its two commands. It installs the independent cron, backfills all available documents under the same lock, then checks cloud size/hash again without uploading. Regular CRM deployment and the DB-backup workflow are not triggered by document-sync-only commits.

```sh
NODE_ENV=production node scripts/installGcsDocumentSyncCron.js --install
# Run under the same flock lock used by cron:
NODE_ENV=production node scripts/syncDocumentsToGcs.js --backfill
NODE_ENV=production node scripts/syncDocumentsToGcs.js --verify
# Preview/remove only this feature's cron entry:
NODE_ENV=production node scripts/installGcsDocumentSyncCron.js --preview
NODE_ENV=production node scripts/installGcsDocumentSyncCron.js --remove
```

The CLI prints count-only summaries and safe error codes, never filenames/customer data/DB references. `failed`, `readErrors`, `deferred` and `unprocessed` must be considered when assessing completion; `--verify` returns nonzero for missing/mismatched copies. Normal operation must be monitored through the private `sync.log` and summary counts. A server/cron outage delays retries until operation resumes.

Existing `ENABLE_GCS_SYNC=true`, GCS credentials, `GCS_BUCKET_NAME`, `GCS_PREFIX` and `UPLOADS_DIR` are reused. `GCS_DOCUMENT_SYNC_STATE_DIR` optionally overrides the private default `~/.local/state/payday-crm-document-sync`; it must remain outside the application/uploads directory. State and snapshot directories use 0700; files use 0600. Bucket-admin permissions are unnecessary; object list/get/create and object copy access are needed.

This mirrors documents actually available on the server. A DB reference whose original file is absent from both server and cloud cannot be recreated by copying. Those references require separate source recovery; the mirror does not fabricate or regenerate signed/financial documents. External-provider-only files, other applications, and unknown storage roots are outside this service's scope.
