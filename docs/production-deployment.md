# Reployty Production Deployment Guide

## 1. Architecture Overview
Reployty is a multi-tenant loyalty, CRM, and customer engagement SaaS platform architected as:
- **Frontend SPA**: React 19, TypeScript, Lucide Icons, Vanilla CSS Design System, built with Vite into static assets (`dist/`).
- **Backend API**: Express 5 on Node.js 22 with TypeScript, handling REST APIs, session management, tenant isolation, and RBAC.
- **Primary Database**: PostgreSQL 16 managed through Prisma ORM with connection pooling.
- **Distributed Cache & Rate Limiter**: Redis 7 supporting atomic Lua rate limiting across multiple scaled instances.
- **Reverse Proxy / Ingress**: NGINX, Cloudflare, or AWS ALB terminating TLS/HTTPS and enforcing HSTS.

---

## 2. Pre-Deployment Checklist
Before triggering a production deployment, ensure the following are verified:

1. **Environment Variables**: All required production variables are populated in the secret manager (see [Environment Variables Reference](./environment-variables.md)).
2. **Database Migrations**: Run `prisma migrate deploy` (NEVER `prisma db push` or `prisma migrate reset` in production).
3. **Database Connection Pooling**: Ensure `DATABASE_URL` specifies appropriate connection limits (e.g., `connection_limit=20`) or points to PgBouncer.
4. **Build Verification**: `npm run build` succeeds cleanly with zero TypeScript errors (`tsc -b`).
5. **Automated Tests**: Full test suite passes (`npm test`).
6. **Seed Protection**: Verify that `ALLOW_PRODUCTION_BOOTSTRAP` is `false` (or unset) to prevent any development seed scripts from running demo data.

---

## 3. Production Deployment Options

### Option A: Docker / Containerized Deployment (Recommended)
1. **Build Container Image**:
   ```bash
   docker build -t reployty-saas:latest -f Dockerfile .
   ```
2. **Deploy via Docker Compose**:
   ```bash
   docker compose up -d
   ```
3. **Run Production Migrations**:
   ```bash
   docker compose exec app npx prisma migrate deploy
   ```

### Option B: Cloud Platform (AWS ECS, Render, Fly.io, Railway)
1. **Build Command**:
   ```bash
   npm ci && npx prisma generate && npm run build
   ```
2. **Pre-Deploy / Migration Command**:
   ```bash
   npx prisma migrate deploy
   ```
3. **Start Command**:
   ```bash
   npm start
   ```

---

## 4. Zero-Downtime Rolling Deployment Strategy
1. **Forward-Compatible Schema**: Ensure database migrations are backwards-compatible so both version `N` and version `N+1` can query the database concurrently during rolling restarts.
2. **Health Check Probes**:
   - **Liveness Probe**: `GET /health` (returns 200 if process is up).
   - **Readiness Probe**: `GET /ready` (returns 200 when database connectivity is healthy; returns 503 if database is disconnected).
3. **Graceful Shutdown**: The server catches `SIGTERM` and `SIGINT`, waits for active HTTP requests to complete, flushes background workers, and closes database connections cleanly.

---

## 5. Domain, TLS & Security Verification
- Ensure the custom domain (e.g. `app.reployty.com`) points to the load balancer / reverse proxy.
- Verify TLS 1.3 certificate is valid.
- Confirm `Strict-Transport-Security: max-age=31536000; includeSubDomains` is present.
- Confirm `ALLOWED_ORIGINS` exactly matches `https://app.reployty.com` with NO wildcards.
- Verify cookies have `Secure`, `HttpOnly`, and `SameSite=Lax`.
