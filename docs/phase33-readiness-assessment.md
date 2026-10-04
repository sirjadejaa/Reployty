# Phase 33 — Pilot Readiness Assessment

> **Assessment Date**: 2026-10-04
> **Assessor**: Automated inspection of Reployty repository + independent test verification
> **Baseline**: 377/377 tests passing, 0 TypeScript errors, 20 Prisma migrations up to date

---

## 1. Status Legend

| Status | Meaning |
|---|---|
| `VERIFIED` | Feature exists, tested, and confirmed working via automated tests or manual inspection |
| `LOCAL_ONLY` | Working on localhost; not verified on production infrastructure |
| `SIMULATED` | Code exists with simulation/mock implementation; no live provider connected |
| `NOT VERIFIED` | Code exists but not independently confirmed for pilot use |
| `BLOCKED` | Cannot proceed without resolving a prerequisite |
| `NOT REQUIRED FOR THIS PILOT` | Intentionally deferred; not needed for initial controlled pilot |

---

## 2. Pilot Readiness Matrix

| # | Area | Status | Evidence | Blocker | Required Action |
|---|---|---|---|---|---|
| 1 | **Business provisioning** | `VERIFIED` / `LOCAL_ONLY` | `managedProvisioningService.ts` (796 lines): atomic transaction creates Business, Branch, Owner User, Membership, QR Code, Invitation, AuditLog. `managed_business_provisioning.test.ts` covers full lifecycle. 377 tests pass. | Production DB required | Deploy to managed PostgreSQL before real pilot |
| 2 | **Owner authentication** | `VERIFIED` / `LOCAL_ONLY` | `sessionService.ts`: bcrypt password hashing, `crypto.randomBytes(32)` session tokens, expiry enforcement. `tenantContext.ts`: server-side membership + role verification chain. `auth/api.test.ts` (181 lines) covers login/logout/session flows. | Production HTTPS + domain | Deploy with TLS before real pilot |
| 3 | **Customer joining** | `VERIFIED` / `LOCAL_ONLY` | `customerAuthService.ts`: `findOrCreateCustomer()` uses `@@unique([businessId, phone])` with transaction isolation. Records `CUSTOMER_JOINED` event, timestamps consent. `first_customer_journey.test.ts` covers join flow. | Live OTP provider | Connect Twilio/MSG91 before real pilot |
| 4 | **OTP delivery** | `SIMULATED` | `otpService.ts`: `DevSimulationOtpProvider` logs OTP to console in dev. `OtpProvider` interface supports pluggable providers. Rate limiter: 5 requests/15 min per phone. `.env.example` has `OTP_PROVIDER=simulation`. | No live SMS provider account | Register Twilio/MSG91 account, configure credentials, verify sender |
| 5 | **Digital loyalty card** | `VERIFIED` / `LOCAL_ONLY` | `DigitalLoyaltyCard.tsx` renders stamp progress, reward banner, business branding. `loyaltyService.ts` (32,716 bytes) manages stamp/points logic. `CustomerLoyaltyView.tsx` renders full PWA experience. Test coverage in `first_customer_journey.test.ts`. | None for local demo | Ready for pilot after deployment |
| 6 | **Stamp awarding** | `VERIFIED` / `LOCAL_ONLY` | `loyaltyService.ts` handles stamp awarding with duplicate protection, branch scoping, and `CustomerEvent` timeline recording. Tested in E2E suite. | None | Ready |
| 7 | **Reward redemption** | `VERIFIED` / `LOCAL_ONLY` | `rewardService.ts` (32,637 bytes): voucher generation, single-use enforcement, `ALREADY_REDEEMED` rejection, staff audit attribution. Demo confirms `DEMO-FREE-BREW` flow with double-redemption rejection. | None | Ready |
| 8 | **Staff permissions** | `VERIFIED` / `LOCAL_ONLY` | `tenantContext.ts`: `requirePermission()`, `requireRole()`, `requireSuperAdmin()` enforce RBAC. Role → Permissions via `rolePermissions` join. Staff cannot access OWNER/SUPER_ADMIN operations (403 tested). `security_hardening.test.ts` covers cross-tenant and RBAC. | None | Ready |
| 9 | **Customer CRM** | `VERIFIED` / `LOCAL_ONLY` | `crmService.ts` (39,132 bytes): customer directory, visit history, activity timeline, segmentation (`VIP`, `AT_RISK`, `NEW`). Tested in `first_customer_journey.test.ts` and CRM test suites. | None | Ready |
| 10 | **Messaging** | `SIMULATED` | `messagingProviderService.ts` (764 lines): provider registry supports `MSG91`, `MetaWhatsApp`, `SendGrid` with mock fallback. `external_provider_connectors.test.ts` verifies connector architecture with mock provider. | No live provider credentials | Register accounts, configure secrets, test delivery |
| 11 | **Monitoring** | `VERIFIED` / `LOCAL_ONLY` | `/health/live` and `/health/ready` endpoints verified. Structured JSON logging with PII sanitization. Alert thresholds documented in `docs/monitoring.md`. `docs/incident-response.md` covers severity tiers. | External uptime monitor (e.g., BetterStack) not configured | Connect uptime monitor to production health endpoints |
| 12 | **Backups** | `NOT VERIFIED` | `docs/backup-restore.md` defines strategy (daily pg_dump, WAL archiving, S3 storage). Restore procedure documented. No automated backup infrastructure exists yet (local PostgreSQL). | No production database or S3 bucket | Provision managed DB with automated backups; test restore |
| 13 | **Privacy and consent** | `VERIFIED` / `LOCAL_ONLY` | `findOrCreateCustomer()` records `CustomerConsent` with timestamped `NOTIFICATIONS` and optional `MARKETING` channels. `auditService.ts` redacts sensitive fields (passwords, OTPs, tokens, API keys). Consent stored per-customer. | Privacy policy URL not publicly hosted | Draft and publish privacy policy before collecting real data |
| 14 | **Production deployment** | `BLOCKED` | No production hosting, domain, or HTTPS. Application runs on `localhost:5173` (Vite dev) / `localhost:3000` (API). `Dockerfile` and `docker-compose.yml` exist for containerized deployment. Build verified passing. | Domain, hosting, managed DB, SSL | Purchase domain, provision cloud host, deploy |
| 15 | **Support process** | `LOCAL_ONLY` | `docs/incident-response.md` defines severity levels and SLA targets. `docs/production-runbook.md` covers deployment, rollback, worker management. No live support channel established. | No support contact for pilot business | Set up WhatsApp/phone support channel before pilot launch |

---

## 3. Overall Pilot Readiness Verdict

### ⚠️ NOT PILOT-READY for real customers

**Rationale**: The application is feature-complete and thoroughly tested in a local environment. However, three hard blockers prevent a real pilot with actual customers:

1. **No production infrastructure**: No cloud hosting, domain, HTTPS, or managed database
2. **No live OTP delivery**: Customer authentication relies on simulated OTP; real phone verification requires a registered SMS provider
3. **No pilot partner**: No business has agreed to participate

### ✅ LOCAL DEMO READY

The application is fully operational for local demonstrations, prospect meetings, and discovery conversations. The existing demo flow (`npm run demo:reset` → demo walkthrough) is verified working.

---

## 4. Blocker Resolution Priority

| Priority | Blocker | Estimated Cost | Owner |
|---|---|---|---|
| 1 | Secure pilot partner agreement | $0 | Developer (business development) |
| 2 | Purchase production domain | ~$10/year | Developer |
| 3 | Provision cloud hosting (Railway/Render/Fly.io) | ~$7/month | Developer |
| 4 | Provision managed PostgreSQL | Included or ~$15/month | Developer |
| 5 | Register SMS provider (Twilio/MSG91) | ~$10 initial credits | Developer |
| 6 | Deploy and verify production build | $0 (effort) | Developer |
| 7 | Connect uptime monitoring | $0 (free tier) | Developer |
| 8 | Publish privacy policy | $0 (effort) | Developer |

> **HARD RULE**: Do not purchase any infrastructure until a pilot partner has agreed and explicit deployment approval is given.
