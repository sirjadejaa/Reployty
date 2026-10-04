# Reployty Production Runbook

## 1. Overview
This runbook provides actionable, step-by-step procedures for operating, deploying, debugging, and recovering **Reployty** in production environments.

---

## 2. Deployment Procedure

### Pre-Deployment Verification Gate
Before triggering any production deployment:
```bash
# 1. Type verification
npx tsc --noEmit

# 2. Production build verification
npm run build

# 3. Prisma schema validation
npx prisma validate

# 4. Check migration status
npx prisma migrate status

# 5. Full test suite execution
npm test
```

### Production Deployment Steps
1. **Container Build**: Build the production image using the multi-stage `Dockerfile`:
   ```bash
   docker build -t reployty-saas:v1.0.0 .
   ```
2. **Apply Database Migrations**: Apply pending non-destructive migrations safely using Prisma migrate deploy:
   ```bash
   # NEVER run prisma migrate reset or prisma db push in production
   npx prisma migrate deploy
   ```
3. **Rolling Update**: Update the container orchestrator (e.g. Docker Swarm, ECS, Kubernetes):
   ```bash
   # Example Kubernetes rollout
   kubectl set image deployment/reployty-app reployty=reployty-saas:v1.0.0
   kubectl rollout status deployment/reployty-app
   ```
4. **Health Probe Verification**:
   ```bash
   curl -f https://app.reployty.com/api/health
   curl -f https://app.reployty.com/api/ready
   ```

---

## 3. Database Migration Management

### Safe Migration Rules
* **Additive First**: New columns must be optional (`?`) or have safe default values.
* **Never Drop in Same Release**: Deprecate columns in code first, verify in production, then drop in a subsequent release.
* **Pre-Migration Snapshot**: Always take an automated snapshot before executing schema updates on production:
  ```bash
  pg_dump -Fc "$DATABASE_URL" > /backups/pre-migrate-$(date +%s).dump
  ```
* **Verify Migration Status**:
  ```bash
  npx prisma migrate status
  ```

---

## 4. Rollback Procedure

### Application Rollback
If a defect is detected post-deployment:
1. Immediately roll back to the previously verified container image:
   ```bash
   # Kubernetes rollback
   kubectl rollout undo deployment/reployty-app
   ```
2. Invalidate CDN cache if frontend assets were affected:
   ```bash
   # Cloudflare / CloudFront cache purge
   aws cloudfront create-invalidation --distribution-id $DIST_ID --paths "/*"
   ```
3. Verify application health:
   ```bash
   curl -f https://app.reployty.com/api/health
   ```

### Database Rollback Strategy
* Because Reployty enforces backward-compatible additive migrations, rolling back the application code rarely requires rolling back database schema.
* If a migration failed or caused an issue:
  1. Inspect `_prisma_migrations` table.
  2. Implement a compensating forward migration rather than a destructive down-migration.
  3. Mark resolved: `npx prisma migrate resolve --rolled-back <migration_name>` (if not applied) or apply compensating migration.

---

## 5. Application & Worker Restarts

### Graceful Application Restart
* The server handles `SIGTERM` and `SIGINT` gracefully:
  1. Closes background intervals via `workerManager.stopScheduledJobs()`.
  2. Stops accepting new HTTP connections and allows in-flight requests 10s to complete.
  3. Safely disconnects Prisma database client via `disconnectDatabase()`.
* Command:
  ```bash
  kill -SIGTERM <pid>
  # or
  docker restart <container_id>
  ```

### Background Worker Management
* Background jobs run inside `WorkerManager`:
  * `campaign_scheduler`: Dispatches scheduled campaigns whose target time has arrived.
  * `stale_delivery_recovery`: Resets deliveries abandoned in `PROCESSING` state by crashed workers.
  * `retention_triggers`: Evaluates customer inactivity, win-back, and birthday rules.
  * `subscription_downgrades`: Evaluates plan limits and grace-period expiries.
  * `otp_cleanup`: Deletes expired OTP challenges older than 1 hour.
  * `session_cleanup`: Purges customer and staff sessions expired > 7 days.
  * `expired_vouchers`: Updates unclaimed reward redemptions whose `expiresAt` elapsed.
* **Overlap Protection**: Each job holds an in-memory lock; overlapping executions are safely skipped.
* **Worker Inspection**: View worker status in logs by querying for `Worker [`:
  ```bash
  docker logs <container_id> | grep "Worker \["
  ```

---

## 6. Provider Credential Rotation

### Rotation Procedure
1. Obtain new API keys from the provider portal (MSG91, Meta WhatsApp Cloud API, SendGrid, Stripe/Razorpay).
2. Update the environment variables in your secure vault (e.g. AWS Secrets Manager, Doppler, Doppler/Vault).
3. Do **NOT** delete the old key immediately; ensure a 15-minute overlap window where possible.
4. Trigger a rolling restart of the application pods to pick up the updated secrets.
5. Verify outbound delivery using the test endpoints or sandbox mode.
6. Revoke the old key in the provider portal.

---

## 7. Webhook Verification & Troubleshooting

### Diagnostic Checklist
1. **Endpoint**: `POST /api/webhooks/messaging` or `POST /api/billing/webhook`.
2. **Signature Verification**:
   * WhatsApp: Verified via `X-Hub-Signature-256` HMAC-SHA256 with `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
   * MSG91: Verified via header token / auth secret.
   * SendGrid: Verified via SendGrid event webhook ECDSA signature or auth token.
   * Billing: Verified via HMAC-SHA256 signature against `BILLING_WEBHOOK_SECRET`.
3. **Replay Ingestion**: If provider experienced an outage, initiate replay from provider dashboard. All webhook processors use database transactions and idempotency keys to guarantee zero duplicate events or double charges.

---

## 8. Database Backup & Restore

### Automated Backup Verification
* **Frequency**: Daily full backup at 02:00 UTC + continuous Write-Ahead Log (WAL) archiving.
* **Retention**: 30 days retention policy on encrypted object storage (S3/GCS with AES-256).

### Manual Backup Command
```bash
pg_dump -Fc --no-acl --no-owner "$DATABASE_URL" > /backups/reployty-manual-$(date +%Y%m%d_%H%M%S).dump
```

### Restore Procedure (Staging / Recovery Database)
```bash
# 1. Restore to target recovery database (NEVER overwrite production directly without sandbox validation)
pg_restore -v --clean --if-exists --no-acl --no-owner -d "$RECOVERY_DATABASE_URL" /backups/reployty-backup.dump

# 2. Run Prisma migration status against restored database
DATABASE_URL="$RECOVERY_DATABASE_URL" npx prisma migrate status

# 3. Verify record counts
psql "$RECOVERY_DATABASE_URL" -c "SELECT COUNT(*) FROM \"Business\"; SELECT COUNT(*) FROM \"Customer\";"
```

---

## 9. Incident Response Procedures

### Severity 1: Tenant-Isolation Incident
* **Trigger**: Report or detection of any user accessing data belonging to another `businessId`.
* **Immediate Action**:
  1. Revoke the compromised user session immediately.
  2. Isolate tenant access by temporarily setting `business.status = 'SUSPENDED'`.
  3. Audit `AuditLog` table for all operations performed by the session actor:
     ```sql
     SELECT * FROM "AuditLog" WHERE "actorUserId" = '<userId>' ORDER BY "createdAt" DESC;
     ```
  4. Inspect API endpoint for missing `tenantContext.businessId` where clause.
  5. Deploy emergency hotfix with regression test.

### Severity 1: Billing / Metering Anomaly
* **Trigger**: Double-charge report, quota bypass, or negative balance.
* **Immediate Action**:
  1. Inspect `BillingHistory`, `UsageMeter`, and `Subscription` for the affected business.
  2. Verify webhook idempotency keys in `BillingWebhookLog`.
  3. Correct usage via `adjustUsageBalance` service with required audit reason.
