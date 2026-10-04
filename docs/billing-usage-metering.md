# Reployty V2 — Phase 28: Billing Metering, Campaign Usage & Overage Enforcement

## 1. Executive Summary & Positioning

Reployty's core mission is to **turn customers into regulars**. While campaigns and automations deliver high-impact re-engagement messages across SMS, WhatsApp, and Email, businesses need transparency into their resource consumption, while the platform must protect its operational margins against unbounded messaging costs.

Phase 28 establishes a real-time, concurrency-safe, multi-tenant **Billing Metering and Overage Enforcement Engine**. It answers two fundamental questions for every tenant at any instant:
1. *"How much of the platform is this business using during its current billing period?"*
2. *"Has this business reached or exceeded the usage included in its subscription plan?"*

Built directly upon Phase 15 (Subscriptions & Plans), Phase 22 (Campaign Queue), Phase 23 (Automation Engine), Phase 25 (Provider Connectors), and Phase 26 (Attribution & Analytics), this metering engine enforces limits deterministically in PostgreSQL. There is zero fake billing data, zero reliance on in-memory counters, and zero vulnerability to double-metering on network retries.

---

## 2. End-to-End Metering Architecture

```text
Campaign Queue Worker (campaignQueueService.ts)
   ↓
Pre-Dispatch Allowance Verification
   ├── Check [start, end) period usage against plan quota
   ├── If quota exceeded & policy = BLOCK:
   │     ↳ Mark delivery FAILED with USAGE_LIMIT_REACHED (No external provider call)
   └── If quota available OR policy in (ALLOW_OVERAGE, WARN_ONLY):
         ↳ Proceed to Phase 25 Provider Connector (MSG91 / Meta / SendGrid)
               ↓
Post-Dispatch Idempotent Recording (usageMeterService.ts)
   ├── Channel Meter: 'msg_${delivery.id}' -> (SMS_MESSAGE / WHATSAPP_MESSAGE / EMAIL_MESSAGE)
   └── Campaign Delivery Meter: 'dlv_${delivery.id}' -> CAMPAIGN_DELIVERY
         ↳ Concurrency-safe UPSERT/P2002 deduplication

Automation Execution Worker (automationExecutionService.ts)
   ↓
On Execution Completion:
   └── Record 'auto_${execution.id}' -> AUTOMATION_EXECUTION
         ↳ Idempotent deduplication

Business Billing & Admin Dashboards
   ↓
Usage Summary & Aggregate Ledger (/api/business/billing/usage)
   ├── Real-time PostgreSQL aggregation over current billing cycle [start, end)
   ├── Progress calculation: NORMAL | NEAR_LIMIT (>=80%) | LIMIT_REACHED (>=100%) | OVERAGE | BLOCKED
   └── Estimated overage calculation in integer minor units (paise / cents)
```

---

## 3. Database Schema & Persistence

Phase 28 introduces the `UsageMeterType` enum and `UsageMeterEvent` model via migration `20260930084205_phase28_billing_usage_metering`:

### 3.1 `UsageMeterType` Enum
- `SMS_MESSAGE`: Billed per SMS message dispatched to an external provider.
- `WHATSAPP_MESSAGE`: Billed per WhatsApp template/session message dispatched.
- `EMAIL_MESSAGE`: Billed per transactional or marketing email dispatched.
- `CAMPAIGN_DELIVERY`: Platform delivery event across any campaign channel.
- `AUTOMATION_EXECUTION`: Billed per completed lifecycle automation run.

### 3.2 `UsageMeterEvent` Table
```prisma
model UsageMeterEvent {
  id              String           @id @default(uuid())
  businessId      String
  subscriptionId  String?
  meterType       UsageMeterType
  channel         CampaignChannel?
  campaignId      String?
  deliveryId      String?
  executionId     String?
  quantity        Int              @default(1)
  isOverage       Boolean          @default(false)
  unitPriceMinor  Int?
  idempotencyKey  String           @unique
  metadata        Json?
  occurredAt      DateTime         @default(now())

  business        Business         @relation(fields: [businessId], references: [id], onDelete: Cascade)

  @@index([businessId, occurredAt])
  @@index([businessId, meterType, occurredAt])
  @@index([businessId, subscriptionId, occurredAt])
  @@index([businessId, campaignId])
  @@map("usage_meter_events")
}
```

### 3.3 Key Indexes
1. `(businessId, occurredAt)`: Rapid cycle boundary scans.
2. `(businessId, meterType, occurredAt)`: Targeted per-meter count aggregations during allowance checks.
3. `(businessId, subscriptionId, occurredAt)`: Historical billing cycle reporting and audit reconciliation.
4. `(businessId, campaignId)`: Instant per-campaign billable usage queries.

---

## 4. Idempotency & Concurrency Safety

In high-volume message delivery and distributed queue environments, transient network errors and provider worker crashes can trigger delivery retries. The metering system guarantees:

1. **Unique Idempotency Keys**:
   - Dispatched message: `msg_${delivery.id}`
   - Campaign delivery: `dlv_${delivery.id}`
   - Automation run: `auto_${execution.id}`
   - Super Admin correction: `corr_${uuid}`
2. **Deduplication Engine**:
   - `recordUsageIdempotent` utilizes PostgreSQL unique constraint collision handling (`idempotencyKey String @unique`).
   - If a delivery is retried 5 times by the background queue, exactly 1 meter event exists in the database.
3. **Simulations & Dry-Runs**:
   - Campaign test dispatches and automation dry-runs explicitly do NOT generate meter records (`quantity = 0` or omitted from queue dispatch).

---

## 5. Allowance Checking & Policy Enforcement

When a campaign is processed by `campaignQueueService.ts`, every delivery evaluates tenant plan limits before invoking external providers:

```typescript
const allowance = await checkAllowance(business.id, meterType, 1);
```

### 5.1 Overage Policies
- `BLOCK`: Hard cap. If `used + requested > allowance`, dispatch is aborted, delivery is marked `FAILED` with failure reason `USAGE_LIMIT_REACHED`.
- `ALLOW_OVERAGE`: Soft cap. Deliveries proceed past the allowance; subsequent meter events are tagged `isOverage = true` and compute accrued cost via `unitPriceMinor`.
- `WARN_ONLY`: Soft monitoring. Deliveries proceed without blocking, triggering platform alerts at 80% and 100% capacity.
- `Unlimited (-1)`: Enterprise or custom plans with `-1` quota never block and never trigger overage.

### 5.2 Meter State Machine
- `NORMAL`: Usage < 80% of plan allowance.
- `NEAR_LIMIT`: Usage >= 80% and < 100%.
- `LIMIT_REACHED`: Usage >= 100% (and not yet blocked or overage allowed).
- `OVERAGE`: Usage > 100% with `ALLOW_OVERAGE` policy active.
- `BLOCKED`: Usage >= 100% with `BLOCK` policy active.

---

## 6. Real-Time Ledger & Aggregation Queries

All usage calculations operate over the tenant's current billing cycle:
`[currentPeriodStart, currentPeriodEnd)`

- Active subscriptions take boundaries from `Subscription.currentPeriodStart` and `Subscription.currentPeriodEnd`.
- Tenants on default/free tiers fall back to the first and last day of the current calendar month in UTC.
- Aggregations use PostgreSQL `groupBy` over `meterType` and `channel` filtered by the composite index `(businessId, meterType, occurredAt)`.

---

## 7. Multi-Tenant Isolation & Role-Based Access Control

| Endpoint | Access Level | Description |
|---|---|---|
| `GET /api/business/billing/usage` | `BILLING_VIEW` | Tenant dashboard metrics, quotas, period dates, and estimated overages. |
| `GET /api/business/billing/usage/by-campaign/:id` | `BILLING_VIEW` | Granular breakdown of billable deliveries for a campaign. |
| `GET /api/business/billing/usage/history` | `BILLING_VIEW` | Filtered, paginated audit ledger of meter events. |
| `GET /api/admin/businesses/:id/usage` | Super Admin | Platform-wide inspection of any tenant's usage, quotas, and overage health. |
| `POST /api/admin/businesses/:id/usage/correct` | Super Admin | Append-only ledger adjustments with mandatory reason and immutable audit log. |

---

## 8. Financial Precision (Integer Minor Units)

In strict adherence to financial integrity standards:
- All monetary amounts (e.g. overage rates, estimated charges) are stored and computed in **integer minor units** (paise for INR, cents for USD).
- Floating-point calculations are strictly forbidden in persistence and calculation pipelines, preventing rounding drift across high-volume usage events.
