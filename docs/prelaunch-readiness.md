# Reployty Pre-Launch Infrastructure & Technical Readiness Audit

## 1. Classification & Status Legend

This document maintains an accurate, unvarnished audit of Reployty's technical readiness for moving from a local development environment to an active production deployment.

* **`COMPLETE`**: Fully built, tested, and active in the codebase.
* **`NEEDS VERIFICATION`**: Code is implemented and tested locally, but requires validation on production hosting.
* **`NOT STARTED`**: Work has not yet begun (requires external account creation, domain purchase, or infrastructure setup).
* **`BLOCKED`**: Depends on an unfulfilled prerequisite (e.g. requires live domain or verified business entity).
* **`NOT REQUIRED YET`**: Deferred to post-pilot phases (e.g. self-serve credit card billing).

---

## 2. Category 1: Mandatory Before Any Real Customer Data is Processed

These 12 items represent hard legal, security, and operational gates before a single real customer phone number or business record may be stored.

| Requirement | Current Status | Notes & Verification Plan |
| :--- | :---: | :--- |
| **1. Production Environment Separation** | `COMPLETE` | Strict separation of development, staging, and production configs in `.env`. Automated tests verify demo data is ignored in production (`NODE_ENV=production`). |
| **2. Production Cloud Database (PostgreSQL 16+)** | `NOT STARTED` | Currently running on local PostgreSQL (`localhost:5432`). Requires provisioning managed instance (e.g. Neon, Supabase, AWS RDS, or Render). |
| **3. Automated Database Backups & Retention** | `NOT STARTED` | Scripting created in `docs/backup-restore.md`. Requires setting up automated daily cron dumps and S3/GCS bucket storage. |
| **4. Disaster Recovery & Restore Testing** | `NEEDS VERIFICATION` | Recovery runbook drafted (`docs/disaster-recovery.md`). Physical restore rehearsal must be executed on the hosted database. |
| **5. Secure Cloud Hosting (HTTPS / TLS 1.3)** | `NOT STARTED` | Running on local machine (`http://localhost:5173`). Requires deployment to a production Node.js host (e.g. Railway, Render, Fly.io, or VPS) behind an SSL proxy. |
| **6. Production Domain Name & DNS** | `NOT STARTED` | No commercial domain purchased yet. Required for public mobile PWA scanning and staff terminal access. |
| **7. Production Secret Management** | `NEEDS VERIFICATION` | Secrets loaded via environment variables. Must ensure strong 64+ char random strings for `SESSION_SECRET` and database credentials in production host settings. |
| **8. Real SMS / WhatsApp OTP Delivery** | `BLOCKED` | Connectors implemented (`messagingProviderService.ts`). Blocked on registering a commercial Twilio or MSG91 account and phone number. |
| **9. Privacy Policy & Explicit Consent** | `COMPLETE` | Customer join flow explicitly presents TCPA/GDPR marketing consent checkboxes and records timestamped consent channels. |
| **10. Role-Based Access Control (RBAC)** | `COMPLETE` | 100% verified. 377 automated tests prove complete tenant isolation and strict permission enforcement (`STAFF` vs `OWNER` vs `SUPER_ADMIN`). |
| **11. Uptime Monitoring & Health Probes** | `COMPLETE` | `/health/live` and `/health/ready` endpoints built and verified against live DB connections and rate limiters. Needs connection to uptime monitor (e.g. BetterStack). |
| **12. Incident Response Runbook** | `COMPLETE` | Comprehensive runbook published in `docs/incident-response.md` with escalation tiers and severity criteria. |

---

## 3. Category 2: Required Only for Specific Extended Features

These items are required only if the merchant or pilot chooses to activate specific communication or monetization modules:

| Requirement | Current Status | Notes & Dependencies |
| :--- | :---: | :--- |
| **1. WhatsApp Business API Verification** | `BLOCKED` | Requires Meta Business Manager verification, approved business display name, and template approvals. (Simulated safely in local testing). |
| **2. Outbound Transactional Email** | `NOT STARTED` | SendGrid / Resend API keys required if merchants choose email over SMS. |
| **3. Live Payment Gateway (Stripe / Razorpay)**| `NOT REQUIRED YET` | Core subscription entitlements are managed internally. First pilot is 100% free; live card charging is deferred until commercial launch. |
| **4. External Delivery Webhook Endpoints** | `NEEDS VERIFICATION` | `/api/webhooks/twilio` and `/api/webhooks/msg91` endpoints built with HMAC signature verification; requires public HTTPS URL for provider callbacks. |
| **5. Google Review API Integration** | `NOT REQUIRED YET` | Merchants currently configure direct Google Review links. Direct API integration is optional. |

---

## 4. Category 3: Optional or Post-Pilot Enhancements

These items are intentionally deferred to post-pilot phases to avoid premature technical complexity:

* **Self-Serve Credit Card Invoicing**: Manual subscription invoicing is used for pilot partners.
* **Advanced Multi-Branch Analytics BI**: Core branch reporting is fully functional; predictive retention modeling is deferred.
* **Point-of-Sale Hardware Integration (Square / Toast / Clover)**: Reployty operates as a lightweight, zero-integration standalone terminal. Direct POS hardware plugins are deferred.
* **Native Mobile Apps (App Store / Google Play)**: The web-based mobile PWA completely replaces the need for native apps, eliminating app store fees and customer download friction.

---

## 5. Pre-Pilot Execution Roadmap (Zero Dollar Spend Until Pilot Agrees)

```text
CURRENT (Free)              WHEN 1ST PILOT AGREES (~$20)          POST-PILOT (~$50+)
• Run locally on laptop     • Purchase domain ($10/yr)            • Upgrade database tier
• Deliver 10-min demos      • Provision basic cloud host ($7/mo)  • Add SMS message credits
• Use simulated OTP         • Connect basic SMS credits ($10)     • Activate payment gateway
• Zero cash outlay          • Deploy production build             • Expand to 3–5 locations
```

**Developer Action Plan**:
1. Do **not** purchase hosting, domains, or SMS credits today.
2. Complete prospect research and deliver discovery conversations using the verified local demo setup.
3. Only when a qualified local business explicitly agrees to run a 30-day pilot:
   * Purchase the production domain.
   * Deploy to basic cloud hosting.
   * Add $10 in SMS credits for real OTP verification.
   * Deliver the physical counter standee.
