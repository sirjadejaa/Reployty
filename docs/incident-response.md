# Reployty Incident Response & Observability Runbook

## 1. Severity Levels & SLA Response Targets

| Severity | Definition | Target Initial Response | Target Resolution | Escalation Contact |
| :--- | :--- | :--- | :--- | :--- |
| **CRITICAL (P1)** | Platform outage, database unavailable, billing webhook failure affecting all tenants, severe data corruption. | < 15 minutes | < 2 hours | Engineering Lead, DevOps On-Call |
| **HIGH (P2)** | Major feature failure (e.g. OTP delivery blocked, loyalty redemptions failing, Redis cluster offline). | < 30 minutes | < 4 hours | On-Call Backend Engineer |
| **MEDIUM (P3)** | Isolated customer issue, minor analytics export delay, non-blocking UI anomaly. | < 2 hours | < 24 hours | Product Support, Engineer |
| **LOW (P4)** | Cosmetic UI glitch, minor documentation clarification, trivial enhancement request. | < 24 hours | Next Sprint | Development Team |

---

## 2. Observability Metrics & Dashboard Specifications

### Application Metrics
- **Request Volume**: Requests per second (RPS) partitioned by route group (`/api/auth`, `/api/business`, `/api/customer`, `/api/admin`).
- **HTTP Error Rates**: Percentage of 4xx and 5xx responses (Alert when 5xx > 1% over 5m).
- **Latency Distribution**: p50, p95, and p99 response times (Target: p95 < 65ms on core transactional endpoints).
- **Uptime / Liveness**: Continuous monitoring of `GET /health`.

### Database Metrics (PostgreSQL)
- **Active Connection Utilization**: Number of active client connections vs. `max_connections` (Alert when pool usage > 80%).
- **Query Latency**: Slow query logs (> 200ms).
- **Deadlocks & Transaction Rollbacks**: Sudden spikes indicate concurrency locking anomalies.
- **Disk Space Usage**: Alert when database volume utilization > 75%.

### Distributed Cache & Rate Limiting (Redis)
- **Cluster Availability**: Heartbeat check every 10s.
- **Memory Consumption**: Total RAM usage vs. configured limit (`maxmemory 256mb`).
- **Eviction Count**: Monitors volatile-lru eviction frequency.
- **Fallback Trigger Rate**: Frequency of fallback to local in-memory rate limiting.

### Security & Fraud Telemetry
- **Failed Login Rate**: Number of HTTP 401 responses on `/api/auth/login`.
- **OTP Challenge Spikes**: Sudden bursts in `/api/customer/auth/request-otp` calls indicate automated credential stuffing or SMS pumping.
- **Rate Limit Trigger Events**: HTTP 429 response frequency per namespace (`login`, `webhook`, `ai_review`, `export`).
- **Webhook Authentication Rejections**: HTTP 401 responses on `/api/billing/webhook`.

### Billing & Subscription Health
- **Webhook Processing Failures**: Failed webhook execution count.
- **Duplicate Webhook Attempts**: Deduplicated events via `processed_webhook_events`.
- **Grace Period Transitions**: Number of accounts entering or exiting `GRACE_PERIOD`.

### Background Worker Telemetry
- **Execution Frequency**: Confirmation of scheduled worker execution every 5-10 minutes.
- **Worker Execution Duration**: Tracks `subscription_downgrades`, `otp_cleanup`, `session_cleanup`.
- **Overlap Prevention Events**: Alerts if worker job takes longer than scheduling interval.

---

## 3. Alerting Rules & Thresholds

| Alert Name | Severity | Condition | Action |
| :--- | :--- | :--- | :--- |
| `APIHighServerErrorRate` | CRITICAL | 5xx responses > 2% for 3 consecutive minutes | Page on-call engineer, check container logs and database health |
| `DatabaseConnectionExhaustion` | CRITICAL | Active DB connections > 85% of pool for 2m | Inspect runaway queries; restart idle pool connections |
| `ReadinessProbeFailure` | CRITICAL | `GET /ready` returns 503 for 60s | Investigate database reachability immediately |
| `OtpSmsPumpingDetected` | HIGH | OTP requests from single subnet > 50 in 5m | Verify rate limiters; block abusive CIDR range if necessary |
| `BillingWebhookFailure` | HIGH | 3 consecutive failures on `/api/billing/webhook` | Check webhook secret rotation and payload validity |
| `RedisUnavailable` | MEDIUM | Redis disconnected, system operating on fallback | Inspect Redis container / managed cluster health |
| `WorkerExecutionFailure` | MEDIUM | Any background job fails 2 consecutive runs | Inspect worker logs in `workerManager.ts` |

---

## 4. Post-Incident Review (PIR)
For every P1 or P2 incident:
1. Conduct blame-free post-mortem within 48 hours.
2. Document root cause, timeline of events, time to detect (TTD), and time to resolve (TTR).
3. File actionable preventative engineering tasks to permanently close vulnerability or bottleneck.
