# Pilot Support Runbook

> **Purpose**: Operational support procedures for the developer during a controlled pilot.
> **Scope**: Single-developer support for one pilot business.

---

## 1. Health Inspection

### Application Health

```bash
# Liveness check
curl -f https://[production-domain]/health

# Readiness check (includes database connectivity)
curl -f https://[production-domain]/ready
```

**Expected healthy response**:
```json
{
  "status": "ready",
  "database": { "status": "healthy", "latencyMs": 3 },
  "timestamp": "2026-10-04T10:00:00.000Z"
}
```

**If readiness fails (503)**: Check database connectivity, check managed DB dashboard for outages.

### Log Inspection

```bash
# View recent application logs (container-based)
docker logs --tail 100 [container_id]

# Search for errors
docker logs [container_id] | grep '"level":"error"'

# Search for specific request
docker logs [container_id] | grep '[request-id]'
```

---

## 2. Identifying Failed Requests

Look for HTTP 4xx/5xx responses in structured logs:

```bash
# Find all server errors (5xx)
docker logs [container_id] | grep '"statusCode":5'

# Find authentication failures (401)
docker logs [container_id] | grep '"statusCode":401'

# Find permission denials (403)
docker logs [container_id] | grep '"statusCode":403'
```

Each log entry includes:
- `requestId`: Unique correlation ID for tracing
- `statusCode`: HTTP status
- `durationMs`: Request processing time
- `businessId`: Affected tenant (if authenticated)

---

## 3. Identifying Authentication Failures

### Staff/Owner Login Failures

```bash
# Check login attempts
docker logs [container_id] | grep 'POST /api/auth/login'
```

**Common causes**:
- Wrong password → 401 response
- Account suspended → 401 with suspension message
- Session expired → 401 on subsequent requests

### Customer OTP Failures

```bash
# Check OTP request attempts
docker logs [container_id] | grep '/api/customer/auth/request-otp'

# Check OTP verification attempts
docker logs [container_id] | grep '/api/customer/auth/verify-otp'
```

**Common causes**:
- Rate limited (5 requests per 15 minutes per phone) → 429 response
- Expired OTP (10-minute window) → 400 response
- Max attempts exceeded (5 attempts) → 400 response
- SMS delivery failure → Check provider dashboard

---

## 4. Identifying Failed Redemptions

```bash
# Check redemption attempts
docker logs [container_id] | grep 'Staff Terminal'
docker logs [container_id] | grep 'ALREADY_REDEEMED'
docker logs [container_id] | grep 'EXPIRED'
docker logs [container_id] | grep 'INVALID'
```

### Database Verification

```sql
-- Check recent voucher activity
SELECT id, code, status, "claimedAt", "redeemedAt", "redeemedByUserId"
FROM "RewardVoucher"
WHERE "businessId" = '[business_id]'
ORDER BY "createdAt" DESC
LIMIT 20;
```

---

## 5. Background Worker Problems

Workers run inside `WorkerManager`. Check worker execution:

```bash
docker logs [container_id] | grep 'Worker \['
```

**Active workers**:
- `campaign_scheduler`: dispatches scheduled campaigns
- `stale_delivery_recovery`: resets abandoned deliveries
- `retention_triggers`: evaluates inactivity/birthday rules
- `subscription_downgrades`: checks plan limits
- `otp_cleanup`: deletes expired OTP challenges
- `session_cleanup`: purges old sessions
- `expired_vouchers`: marks expired unredeemed vouchers

---

## 6. Reviewing Audit Events

```sql
-- Recent administrative actions for pilot business
SELECT action, "entityType", "entityId", "actorUserId", "createdAt"
FROM "AuditLog"
WHERE "businessId" = '[business_id]'
ORDER BY "createdAt" DESC
LIMIT 50;
```

---

## 7. Escalating a Security Issue

If a tenant-isolation breach, data leak, or unauthorized access is suspected:

1. **Immediately** revoke the compromised session:
   ```sql
   UPDATE "Session" SET "revokedAt" = NOW() WHERE "userId" = '[affected_user_id]';
   ```
2. **Suspend** the affected business if needed:
   ```sql
   UPDATE "Business" SET status = 'SUSPENDED' WHERE id = '[business_id]';
   ```
3. **Audit** all operations by the compromised actor:
   ```sql
   SELECT * FROM "AuditLog" WHERE "actorUserId" = '[userId]' ORDER BY "createdAt" DESC;
   ```
4. **Notify** the business owner directly via phone/WhatsApp
5. **Document** the incident using the Incident Log Template (below)
6. **Deploy** a hotfix if a code defect is found

---

## 8. Recording a Bug Report

When staff or the business owner reports a problem:

1. Ask: **What were you trying to do?**
2. Ask: **What happened instead?**
3. Ask: **When did it happen?** (approximate time)
4. Ask: **Can you show me your screen?** (screenshot if possible)
5. Note the customer phone number or voucher code involved
6. Check application logs for the corresponding timeframe
7. Record in the feedback tracker with classification: `BUG`

---

## 9. Communicating an Outage

If the application is down:

1. **Check health endpoints** to confirm the outage
2. **Message the business owner** via WhatsApp/phone:
   > "Hi [Owner Name], we've detected a temporary issue with the Reployty system. Your customer data is safe. We're working to resolve this and will update you within [timeframe]. In the meantime, staff can note customer purchases manually and we'll backfill stamps once the system is restored."
3. **Do NOT promise an exact resolution time** unless certain
4. **Send a follow-up** once resolved:
   > "The issue has been resolved. The system is back online and working normally. All customer data is intact. Sorry for the inconvenience."

---

## 10. Incident Log Template

```
Incident ID:        INC-[YYYYMMDD]-[NNN]
Date and Time:      [YYYY-MM-DD HH:MM UTC]
Affected Business:  [Business Name / Business ID]
Affected Workflow:  [e.g., Customer joining, Stamp awarding, Voucher redemption]
Severity:           [P1 Critical / P2 High / P3 Medium / P4 Low]
Description:        [What happened]
Customer Impact:    [Number of affected customers, if known]
Immediate Action:   [What was done immediately]
Root Cause:         [Identified cause, or "Under investigation"]
Resolution:         [How it was fixed]
Follow-up Action:   [Preventive measures or monitoring changes]
```

> **Do NOT include** passwords, OTP codes, full session tokens, or unnecessary personal data in incident reports.
