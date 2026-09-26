# Reployty Database Backup & Restore Procedure

## 1. Backup Architecture & Strategy

Reployty relies on a dual-tier backup strategy to guarantee data safety and business continuity:

1. **Continuous Point-in-Time Recovery (PITR)**:
   - PostgreSQL Write-Ahead Log (WAL) archiving enabled via `wal-g` / AWS RDS / Supabase PITR.
   - Provides recovery granularity down to specific seconds within the last 14 days.
2. **Automated Daily Full Logical Backups (`pg_dump`)**:
   - Frequency: Daily at 02:00 UTC during lowest platform traffic.
   - Compression: `gzip` / `pg_dump -Fc` custom binary archive format.
   - Encryption: Encrypted in transit (TLS) and at rest with AES-256 (AWS KMS-managed keys).
   - Storage Location: Dedicated off-site Amazon S3 / Cloud Storage bucket with Object Lock (WORM - Write Once, Read Many) to guard against ransomware.
3. **Retention Policy**:
   - Daily backups retained for 30 days.
   - Weekly backups retained for 12 weeks.
   - Monthly backups retained for 12 months.

---

## 2. Automated Daily Backup Script Example (`scripts/backup.sh`)
```bash
#!/usr/bin/env bash
set -euo pipefail

TIMESTAMP=$(date -u +"%Y%m%d_%H%M%SZ")
BACKUP_DIR="/tmp/reployty_backups"
BACKUP_FILE="${BACKUP_DIR}/reployty_backup_${TIMESTAMP}.dump"
S3_BUCKET="s3://reployty-production-backups-secure"

mkdir -p "${BACKUP_DIR}"

echo "Starting PostgreSQL backup at ${TIMESTAMP}..."
pg_dump "${DATABASE_URL}" -Fc --no-owner --no-privileges -f "${BACKUP_FILE}"

echo "Encrypting and uploading to off-site storage..."
aws s3 cp "${BACKUP_FILE}" "${S3_BUCKET}/daily/reployty_backup_${TIMESTAMP}.dump" --sse aws:kms

echo "Cleaning up local temporary files..."
rm -f "${BACKUP_FILE}"
echo "Backup successfully completed and archived."
```

---

## 3. Restore & Verification Procedure

> **SAFETY RULE**: NEVER restore a backup directly onto the production database. Always verify the restore in an isolated staging or sandbox instance first!

### Step 1: Provision Isolated Restore Target
Provision an isolated PostgreSQL instance or database (e.g. `reployty_restore_verify`).

### Step 2: Download and Restore the Backup
```bash
# 1. Download verified backup artifact
aws s3 cp s3://reployty-production-backups-secure/daily/reployty_backup_LATEST.dump ./restore_target.dump

# 2. Restore into target verification database
pg_restore -d "${RESTORE_VERIFY_DATABASE_URL}" --clean --if-exists --no-owner ./restore_target.dump
```

### Step 3: Verify Schema & Migrations
```bash
# Verify Prisma schema matches the restored database
DATABASE_URL="${RESTORE_VERIFY_DATABASE_URL}" npx prisma migrate status
```

### Step 4: Run Data-Integrity Invariant Checks
Execute the SQL invariant audit on the restored database:
```sql
-- 1. Ensure zero negative balances exist
SELECT count(*) FROM customers WHERE "stampsBalance" < 0 OR "pointsBalance" < 0;
-- Must be 0

-- 2. Ensure zero cross-tenant links exist between loyalty cards and customers
SELECT count(*) FROM loyalty_cards lc
JOIN customers c ON lc."customerId" = c.id
WHERE lc."businessId" != c."businessId";
-- Must be 0

-- 3. Ensure zero businesses have duplicate active subscriptions
SELECT "businessId", count(*) FROM subscriptions
WHERE status = 'ACTIVE'
GROUP BY "businessId"
HAVING count(*) > 1;
-- Must be 0
```

### Step 5: Smoke Test Application Connectivity
Start a test instance of the Reployty API pointed to the restored database and execute the automated smoke suite:
```bash
DATABASE_URL="${RESTORE_VERIFY_DATABASE_URL}" npm test
```

### Step 6: Log & Certify Verification
Record timestamp, source backup name, row counts, and test results in the operational log.
