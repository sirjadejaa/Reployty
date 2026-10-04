# Reployty Production Monitoring & Observability Guide

## 1. Observability Architecture
Reployty adheres to a lightweight, production-safe observability model designed for high reliability without third-party vendor lock-in.

Key pillars:
1. **Health Probes**: Liveness (`/health`, `/health/live`) and Readiness (`/ready`, `/health/ready`).
2. **Structured Logging**: JSON logging with request correlation IDs (`X-Request-Id`) and automatic PII/credential sanitization.
3. **Metrics Tracking**: Error rates, database query latency, worker execution durations, and delivery queue backlog.
4. **Actionable Alerting**: Threshold-based alarms on critical platform failures.

---

## 2. Health & Readiness Probes

### Liveness Probe
* **Endpoints**: `GET /health` and `GET /health/live` (available at root and `/api/*`).
* **Purpose**: Indicates the Node.js event loop is responsive and the HTTP listener is accepting connections.
* **Response**: HTTP 200 OK
  ```json
  {
    "status": "healthy",
    "system": "Reployty Multi-Tenant SaaS",
    "uptimeSeconds": 1423,
    "timestamp": "2026-09-30T10:00:00.000Z",
    "environment": "production"
  }
  ```

### Readiness Probe
* **Endpoints**: `GET /ready` and `GET /health/ready` (available at root and `/api/*`).
* **Purpose**: Evaluates database connectivity (`SELECT 1`) and rate-limiting subsystem health before routing traffic.
* **Response Healthy**: HTTP 200 OK
  ```json
  {
    "status": "ready",
    "database": {
      "status": "healthy",
      "latencyMs": 3
    },
    "rateLimiting": {
      "backend": "redis",
      "redisConfigured": true,
      "redisConnected": true
    },
    "timestamp": "2026-09-30T10:00:00.000Z"
  }
  ```
* **Response Unhealthy**: HTTP 503 Service Unavailable (load balancer will immediately take pod out of traffic rotation).

---

## 3. Structured Logging & Sanitization

### Log Format
All log output is structured JSON formatted for log ingestion (AWS CloudWatch, Datadog, Grafana Loki, or ELK):
```json
{
  "timestamp": "2026-09-30T10:00:00.000Z",
  "level": "info",
  "message": "HTTP POST /api/business/campaigns",
  "requestId": "a8f7c9e1-2b3d-4e5f-8a9b-0c1d2e3f4a5b",
  "statusCode": 200,
  "durationMs": 14,
  "businessId": "b123"
}
```

### Automatic Sanitization Guarantee
The logging subsystem (`src/server/utils/logger.ts`) recursively redacts the following sensitive fields before emitting output:
* Passwords (`password`, `currentPassword`, `newPassword`)
* OTPs (`otp`, `code`, `otpCode`)
* Session tokens (`token`, `sessionToken`, `refreshToken`)
* Provider credentials (`apiKey`, `authKey`, `secret`, `webhookSecret`, `accessToken`)
* Payment details (`cardNumber`, `cvv`, `accountNumber`)

---

## 4. Production Alerting Thresholds

The following critical alert thresholds must be configured in your cloud monitoring dashboard:

| Alert Name | Condition | Severity | Action |
| :--- | :--- | :---: | :--- |
| **App Down** | 3 consecutive failures on `/health` | Critical | Orchestrator container restart |
| **Database Unreachable** | `/ready` returns 503 for > 30s | Critical | Check DB cluster status / failover |
| **High 5xx Rate** | 5xx errors > 1% over 5-minute window | High | Inspect server error logs for regressions |
| **High Latency** | P95 latency > 800ms for > 5m | Medium | Check database pool & slow query log |
| **Queue Backlog** | Stale `PROCESSING` queue items > 10 | High | Worker will auto-recover; check worker logs |
| **Webhook Failure Rate**| Webhook 4xx/5xx > 5% over 10m | High | Check provider webhook secret validity |
| **Rate Limit Spike** | 429 responses > 100/min | Medium | Investigate potential abuse or scraper IP |
