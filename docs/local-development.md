# Reployty — Local Development & Environment Operations Guide

## 1. Overview & Architecture

Reployty is an enterprise-grade multi-tenant SaaS platform built with:
- **Backend**: Node.js + TypeScript, Express REST API, Prisma ORM, PostgreSQL (14+)
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS / Vanilla Design Tokens
- **Tenant Isolation**: TenantContext middleware enforcing schema-level and row-level business isolation
- **Authentication**: Dual-layer sessions (Business Owner/Staff session `reployty_session` + Customer PWA session `reployty_customer_session`)
- **Simulation Layer**: Native local development simulation for SMS, WhatsApp, and Customer OTP delivery

---

## 2. System Requirements & Prerequisites

- **Node.js**: `v20.x` or higher (`v22+` recommended)
- **Package Manager**: `npm` v10+
- **PostgreSQL**: PostgreSQL 14+ running locally or in Docker
- **PostgreSQL CLI**: `psql`, `pg_dump`, `createdb`, `dropdb`
- **Port Allocations**:
  - `3000`: Backend Express API (`src/server/index.ts`)
  - `5173`: Frontend Vite Dev Server (`src/main.tsx`)
  - `5432`: PostgreSQL Database Instance

---

## 3. Environment Variables Configuration

Create a `.env` file in the project root with the following structure:

```bash
# Database Connection (Standard PostgreSQL URI)
DATABASE_URL="postgresql://<user>:<password>@localhost:5432/reployty?schema=public"

# Environment & Server Ports
NODE_ENV="development"
PORT=3000
VITE_API_URL="http://localhost:3000"

# Cryptographic Secrets (minimum 32 characters)
SESSION_SECRET="reployty-local-dev-owner-session-secret-min32bytes-2026"
CUSTOMER_SESSION_SECRET="reployty-local-dev-customer-session-secret-min32bytes-2026"

# Simulation & Delivery Mode
# Set to 'true' for local development without external SMS/WhatsApp credentials
SIMULATION_MODE="true"
ENABLE_AUDIT_LOGGING="true"
```

---

## 4. Database Setup & Migrations

### Verify Migration Status
```bash
npx prisma migrate status
```
*Expected: "20 migrations found in prisma/migrations. Database schema is up to date."*

### Apply Pending Migrations
```bash
npx prisma migrate dev
```

### Seed Development Fixtures
Populate system roles (`OWNER`, `MANAGER`, `STAFF`), default subscription plans (`free`, `starter`, `growth`, `enterprise`), and sample tenants:
```bash
npx prisma db seed
```

---

## 5. Starting Local Development

### Run Both Backend & Frontend Simultaneously
```bash
npm run dev:all
```

### Run Backend Only (Express API on Port 3000)
```bash
npm run dev:server
```

### Run Frontend Only (Vite SPA on Port 5173)
```bash
npm run dev:client
```

---

## 6. Local Test Suite Execution

### Run All Test Suites (372 Unit, Integration, Staging & E2E Tests)
```bash
npm test
```

### Run the Phase 30 End-to-End Validation Suite
```bash
node --import tsx --test tests/staging/phase30_e2e_business_validation.test.ts
```

### Run Managed Business Provisioning Tests
```bash
node --import tsx --test tests/staging/managed_business_provisioning.test.ts
```

---

## 7. Database Backup, Restore & Disaster Recovery Drill

### 7.1 Creating a Local Backup Dump (`pg_dump`)
```bash
# Export schema + data to SQL dump file
pg_dump -h localhost -p 5432 -U <user> -d reployty \
  --clean --if-exists --no-owner --no-privileges \
  -f ./backups/reployty_backup_$(date +%Y%m%d_%H%M%S).sql
```

### 7.2 Restoring Database from Dump (`psql`)
```bash
# 1. Terminate active connections (if restoring over existing database)
psql -h localhost -p 5432 -U <user> -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'reployty' AND pid <> pg_backend_pid();"

# 2. Re-create clean database
dropdb -h localhost -p 5432 -U <user> --if-exists reployty
createdb -h localhost -p 5432 -U <user> reployty

# 3. Restore dump file
psql -h localhost -p 5432 -U <user> -d reployty -f ./backups/<backup_file>.sql
```

### 7.3 Verifying Restored Database Integrity
```bash
# Verify all 58 tables are restored
psql -h localhost -p 5432 -U <user> -d reployty -t -c \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"

# Verify migration status
npx prisma migrate status
```

---

## 8. Simulation Mode for Messaging & OTP

When `SIMULATION_MODE=true` is set:
1. **SMS & WhatsApp Dispatch**: Messages are routed to memory/audit logs without triggering external provider HTTP requests (Twilio / Meta Graph API).
2. **Customer OTP Authentication**: A 6-digit verification code is generated, printed to standard output console (`[SIMULATION OTP] Sent to <phone>: <code >`), and returned as `devOtp` in local development API responses for automated test suites.
3. **Usage Metering**: Billable events (`SMS_MESSAGE`, `CAMPAIGN_DELIVERY`, etc.) continue to be accurately recorded in PostgreSQL `UsageMeterEvent` to ensure realistic billing validation.

---

## 9. Production Build & Bundle Validation

Ensure code conforms to strict TypeScript compilation and production bundling rules:
```bash
# Typecheck without emit
npx tsc -b --noEmit

# Production Vite build
npm run build
```
Build artifacts are placed in `dist/` and can be previewed locally using:
```bash
npx vite preview
```
