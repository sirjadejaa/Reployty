# Reployty Environment Variables Reference

This document describes all environment variables used by the Reployty Multi-Tenant SaaS platform.

> **CRITICAL SECURITY RULE**: Never store production secrets, keys, or database credentials in committed code, git repositories, or unencrypted text files.

---

## 1. Environment Variable Matrix

| Variable | Environment | Required? | Description | Example |
| :--- | :--- | :--- | :--- | :--- |
| `NODE_ENV` | All | Yes | Target runtime environment (`development`, `staging`, `production`, `test`) | `production` |
| `PORT` | All | No (default: 3000) | TCP port for HTTP server to listen on | `3000` |
| `APP_URL` | Production | Yes | Public canonical HTTPS URL of the SaaS | `https://app.reployty.com` |
| `DATABASE_URL` | All | Yes | PostgreSQL connection string | `postgresql://user:pass@host:5432/reployty?schema=public` |
| `DIRECT_DATABASE_URL` | Production | Optional | Direct connection string for Prisma migrations (if using PgBouncer pooler) | `postgresql://user:pass@host:5432/reployty?schema=public` |
| `TEST_DATABASE_URL` | Test | Yes (Tests) | Dedicated database for automated integration and E2E tests | `postgresql://user:pass@localhost:5432/reployty_test?schema=public` |
| `REDIS_URL` | Production | Recommended | Redis connection URL for distributed rate limiting & session coordination | `redis://redis-cluster.internal:6379` |
| `SESSION_SECRET` | Production | Recommended | Cryptographic secret for signing staff sessions | *(32+ char random hex string)* |
| `CUSTOMER_SESSION_SECRET` | Production | Recommended | Cryptographic secret for signing customer PWA sessions | *(32+ char random hex string)* |
| `ALLOWED_ORIGINS` | Production | Yes | Comma-separated list of exact allowed CORS origins (HTTPS only, no `*`, no `localhost`) | `https://app.reployty.com,https://admin.reployty.com` |
| `BILLING_WEBHOOK_SECRET` | Production | Yes | Secret or signature key verified on incoming billing provider webhooks | `whsec_98f12a...` |
| `PAYMENT_PROVIDER` | All | No (default: `simulated`) | Active billing provider adapter (`simulated`, `stripe`, `razorpay`) | `simulated` |
| `OTP_PROVIDER` | All | No (default: `simulation`) | Active SMS/OTP delivery provider (`simulation`, `twilio`, `msg91`) | `simulation` |
| `SENTRY_DSN` | Production | Optional | Third-party error tracking DSN | `https://examplePublicKey@o0.ingest.sentry.io/0` |
| `ALLOW_PRODUCTION_BOOTSTRAP` | Production | No (default: `false`) | If `true`, permits initial seeding of system roles and plans only | `false` |

---

## 2. Server-Side Fail-Fast Validation
The centralized configuration layer (`src/server/config/env.ts`) automatically validates these rules at server boot:
1. In `production`, `APP_URL` must start with `https://`.
2. In `production`, `ALLOWED_ORIGINS` cannot contain wildcards (`*`) or `localhost` / `127.0.0.1`.
3. In `production`, `DATABASE_URL` and `BILLING_WEBHOOK_SECRET` must be set.
4. If any critical configuration is missing or malformed, the process immediately halts with a clean exit code (`process.exit(1)`) without leaking secret values in the logs.
