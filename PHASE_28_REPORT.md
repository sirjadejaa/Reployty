# REPLOYTY — PHASE 28 FINAL STAGING REPORT
## V2 Billing Metering + Campaign Usage + Overage Enforcement

---

### 1. Executive Summary & Positioning

Reployty's core mission is to **turn customers into regulars**. While campaigns and automations drive customer visits, loyalty rewards, and retention, businesses require full clarity regarding their platform resource consumption, and the platform must enforce subscription plan entitlements with mathematical rigor.

Phase 28 establishes a real-time, concurrency-safe, multi-tenant **Billing Metering and Overage Enforcement Engine**. It deterministically answers two fundamental questions for every business:
1. *"How much of the platform is this business using during its current billing period?"*
2. *"Has this business reached or exceeded the usage included in its subscription plan?"*

Built directly upon Phase 15 (Subscriptions & Plans), Phase 22 (Campaign Queue), Phase 23 (Automation Engine), Phase 25 (Provider Connectors), and Phase 26 (Attribution & Analytics), this metering layer enforces allowances in PostgreSQL without simulated numbers, without floating-point currency drift, and without risk of double-metering on queue retries.

---

### 2. Billable Units & Meter Architecture

| Meter Type | Unit | Trigger Point | Idempotency Key Format |
|---|---|---|---|
| `SMS_MESSAGE` | Per dispatched SMS | External provider dispatch via `campaignQueueService` | `msg_${delivery.id}` |
| `WHATSAPP_MESSAGE` | Per dispatched WhatsApp message | External provider dispatch via `campaignQueueService` | `msg_${delivery.id}` |
| `EMAIL_MESSAGE` | Per dispatched email | External provider dispatch via `campaignQueueService` | `msg_${delivery.id}` |
| `CAMPAIGN_DELIVERY` | Per campaign recipient delivery | Successful dispatch across any campaign channel | `dlv_${delivery.id}` |
| `AUTOMATION_EXECUTION` | Per completed rule execution | Completed lifecycle run via `automationExecutionService` | `auto_${execution.id}` |

- **Dry-runs & Simulations**: Explicitly meter 0 units.
- **Provider Retries**: Deduplicated atomically via PostgreSQL `idempotencyKey` unique constraint (`P2002` handling).
- **Financial Precision**: All pricing and overage rates are stored and aggregated as **integer minor units** (e.g., paise/cents).

---

### 3. Database Schema & Migration

Applied migration `20260930084205_phase28_billing_usage_metering`:
- Created enum `UsageMeterType` (`SMS_MESSAGE`, `WHATSAPP_MESSAGE`, `EMAIL_MESSAGE`, `CAMPAIGN_DELIVERY`, `AUTOMATION_EXECUTION`).
- Created table `usage_meter_events` with fields:
  - `id` (UUID PK)
  - `businessId` (UUID FK to `businesses`)
  - `subscriptionId` (UUID nullable)
  - `meterType` (`UsageMeterType`)
  - `channel` (`CampaignChannel` nullable)
  - `campaignId` (UUID nullable)
  - `deliveryId` (UUID nullable)
  - `executionId` (UUID nullable)
  - `quantity` (Int, default 1)
  - `isOverage` (Boolean, default false)
  - `unitPriceMinor` (Int nullable)
  - `idempotencyKey` (String, `@unique`)
  - `metadata` (Json nullable)
  - `occurredAt` (DateTime, default `now()`)
- Composite performance indexes:
  - `@@index([businessId, occurredAt])`
  - `@@index([businessId, meterType, occurredAt])`
  - `@@index([businessId, subscriptionId, occurredAt])`
  - `@@index([businessId, campaignId])`

---

### 4. Enforcement Engine & Overage Policies

The `usageMeterService.ts` provides:
1. `checkAllowance(businessId, meterType, count)`: Evaluates current period consumption against plan quotas.
2. `requireAllowance(businessId, meterType, count)`: Pre-dispatch gatekeeper in `campaignQueueService.ts`. Rejects delivery and transitions state to `FAILED` with `USAGE_LIMIT_REACHED` if quota is exhausted under `BLOCK` policy.
3. **Policies**:
   - `BLOCK`: Hard cap. Prevents further message dispatches.
   - `ALLOW_OVERAGE`: Soft cap. Allows dispatches, marks subsequent events as `isOverage = true`, and calculates accrued fees in minor units.
   - `WARN_ONLY`: Soft monitoring with alert badges at 80% and 100%.
   - `Unlimited (-1)`: Enterprise tier without caps or overage charges.
4. **Meter Health States**:
   - `NORMAL`: < 80% allowance
   - `NEAR_LIMIT`: 80% – 99.9% allowance
   - `LIMIT_REACHED`: 100% allowance
   - `OVERAGE`: > 100% with `ALLOW_OVERAGE` policy
   - `BLOCKED`: 100% with `BLOCK` policy

---

### 5. API Endpoints & Multi-Tenant RBAC

- `GET /api/business/billing/usage`: Current billing cycle usage summary, meter status badges, channel distribution, and estimated overage charges (`BILLING_VIEW` required).
- `GET /api/business/billing/usage/by-campaign/:campaignId`: Breakdown of billable deliveries for a campaign (`BILLING_VIEW` required).
- `GET /api/business/billing/usage/history`: Server-side filtered, paginated ledger of meter events (`BILLING_VIEW` required).
- `GET /api/admin/businesses/:businessId/usage`: Super Admin inspection of any tenant's usage, quotas, and overage health.
- `POST /api/admin/businesses/:businessId/usage/correct`: Super Admin append-only adjustment ledger (`corr_${uuid}`) with mandatory reason and immutable audit log.

---

### 6. Verification & Test Results

- **Staging Suite**: `tests/staging/billing_usage_metering.test.ts`
  - 22 / 22 tests passing:
    1. Meter event creation & integer minor unit validation
    2. Idempotency key deduplication (single record on duplicate dispatch)
    3. Concurrency safety under parallel dispatches
    4. External provider queue retry deduplication
    5. Automation execution metering via Phase 23 worker
    6. Simulation & dry-run produces 0 billable events
    7. Exact billing period boundary filtering `[start, end)`
    8. Pre-dispatch allowance blocking (`USAGE_LIMIT_REACHED`)
    9. Soft limit overage tracking (`isOverage = true` + `unitPriceMinor`)
    10. Unlimited plans (`-1` quota) never block or overage
    11. Campaign-scoped billable delivery breakdown
    12. Live business usage summary API contract
    13. Paginated usage history ledger API
    14. Strict tenant isolation between Business A and Business B
    15. RBAC enforcement (`BILLING_VIEW` 403 on staff without permission)
    16. Unauthenticated requests rejected with 401
    17. Super Admin tenant usage inspection
    18. Super Admin append-only usage correction with audit log
    19. Super Admin correction without reason rejected with 400
    20. End-to-end integration with Phase 27 visual workflow builder
    21. Frontend usage dashboard UI rendering & ledger collapse
    22. Responsive design system tokens and viewport compatibility
- **Full Platform Regression Suite**:
  - `npm test`: **344 / 344 tests passing** (0 failures, 0 skipped).
- **TypeScript Static Analysis**:
  - `npx tsc -b --noEmit`: 0 errors.
- **Production Asset Build**:
  - `npm run build`: Vite production bundle compiled cleanly in 3.29s.

---

### 7. Hard Stop Declaration

As instructed by the user prompt and Phase 28 specifications:
- **Phase 28 is COMPLETE.**
- **HARD STOP executed.**
- No Phase 29 or later work has been initiated.
