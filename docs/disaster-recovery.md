# Reployty Disaster Recovery Plan

## 1. Objectives & Targets
- **RPO (Recovery Point Objective)**: **15 minutes** (maximum acceptable data loss during catastrophe, backed by continuous WAL archiving).
- **RTO (Recovery Time Objective)**: **30 minutes** (maximum acceptable duration to restore fully operational platform status).

---

## 2. Recovery Scenarios Matrix (A – J)

### Scenario A: Application Server Failure (Crash / OOM)
- **Detection**: CloudWatch / Datadog / Docker healthcheck fails 3 consecutive times (`GET /health` uncontactable).
- **Immediate Action**: Container orchestrator (Docker restart / ECS / Kubernetes) automatically respawns container.
- **Recovery Procedure**: Check container logs for fatal exceptions, OOM triggers, or unhandled promise rejections.
- **Verification**: `curl -f http://localhost:3000/api/health` returns 200 `{"status": "healthy"}`.

### Scenario B: Primary Database Failure (PostgreSQL Outage)
- **Detection**: Readiness probe `GET /ready` returns 503; error logs report `P1001: Can't reach database server`.
- **Immediate Action**: Failover to hot standby PostgreSQL replica (automatic via RDS Multi-AZ or manual DNS cutover).
- **Recovery Procedure**: Update `DATABASE_URL` if replica has a separate endpoint; restart application pods.
- **Verification**: `GET /ready` returns 200 `{"status": "ready", "database": {"status": "healthy"}}`.

### Scenario C: Redis Failure / Outage
- **Detection**: Redis connection error events logged; rate limiter status reports `backend: memory-fallback`.
- **Immediate Action**: Reployty automatically fails over to local in-memory sliding-window rate limiting without downtime.
- **Recovery Procedure**: Restart Redis instance or fail over to secondary Redis node. Reconnect occurs automatically.
- **Verification**: `GET /ready` reports `rateLimiting: {"backend": "redis", "redisConnected": true}`.

### Scenario D: Bad Deployment (Regressions / Critical Bugs)
- **Detection**: Elevated 5xx rate (> 1%) on Sentry or CloudWatch immediately following a release.
- **Immediate Action**: Roll back deployment immediately to previous container image tag / Git commit.
- **Recovery Procedure**: Redeploy previous stable release tag; confirm rollback health.
- **Verification**: Run production smoke test checklist against live endpoints.

### Scenario E: Corrupted / Failed Database Migration
- **Detection**: `prisma migrate deploy` fails with non-zero exit code during CI/CD.
- **Immediate Action**: CI/CD pipeline automatically aborts deployment before traffic touches new code.
- **Recovery Procedure**:
  1. Inspect failed migration step in `_prisma_migrations`.
  2. Write compensating forward migration rather than destructive down-migrations.
  3. Mark migration resolved via `prisma migrate resolve --applied <migration_name>` once verified.
- **Verification**: `npx prisma migrate status` reports clean state.

### Scenario F: Lost or Compromised Environment Secret
- **Detection**: Suspected secret exposure or unauthorized access attempt.
- **Immediate Action**: Rotate the affected secret in the secret manager (e.g. AWS Secrets Manager).
- **Recovery Procedure**:
  1. Generate new 32+ character random secret (`openssl rand -hex 32`).
  2. Update secret in production vault.
  3. Invalidate active sessions if `SESSION_SECRET` was rotated (`prisma.session.deleteMany()`).
  4. Perform rolling restart of application instances.
- **Verification**: Authenticate with fresh credentials; verify invalid tokens receive 401.

### Scenario G: Billing Webhook Outage / Processing Backlog
- **Detection**: Billing provider dashboard reports non-200 webhook delivery failures.
- **Immediate Action**: Verify webhook endpoint `POST /api/billing/webhook` logs for signature or rate-limit rejections.
- **Recovery Procedure**: Once fixed, initiate replay of missed webhook events from the payment provider dashboard. Idempotency guarantees zero duplicate payments or balance double-credits.
- **Verification**: Confirm subscription states and payment transaction records reflect replayed events.

### Scenario H: Third-Party SMS / OTP Provider Outage
- **Detection**: Elevated OTP delivery failures logged in `otpService.ts`.
- **Immediate Action**: Switch provider flag `OTP_PROVIDER` from primary to secondary SMS gateway (e.g. Twilio -> MSG91).
- **Recovery Procedure**: Update provider credentials; test challenge delivery.
- **Verification**: Complete live customer OTP login round-trip.

### Scenario I: Accidental Destructive Operation
- **Detection**: Critical tenant or table records erroneously deleted.
- **Immediate Action**: Quarantine production database; switch application to maintenance mode.
- **Recovery Procedure**:
  1. Spin up temporary PostgreSQL instance.
  2. Restore point-in-time snapshot to 5 minutes prior to the destructive event.
  3. Export missing rows using `pg_dump` with table and primary key scoping.
  4. Import recovered rows into production database.
- **Verification**: Re-run data-integrity audit scripts to confirm zero orphaned records.

### Scenario J: Cloud Region / Datacenter Outage
- **Detection**: Cloud provider status dashboard alerts complete availability zone or regional outage.
- **Immediate Action**: Activate secondary standby region infrastructure.
- **Recovery Procedure**:
  1. Restore latest off-site S3 backup into secondary region database.
  2. Deploy application containers via Terraform / Docker in secondary region.
  3. Update Route53 / Cloudflare DNS records to route traffic to secondary region load balancer.
- **Verification**: Global DNS propagation check and end-to-end user login test.

---

## 3. Rollback Strategy
1. **Application Code**: Versioned container tags allow instant rolling rollback (`docker service update --image reployty-saas:v1.2.3`).
2. **Database Migrations**: Always prefer forward-compatible migrations (additive column additions, deprecating before deleting). Avoid dropping columns in the same release that ceases using them.
