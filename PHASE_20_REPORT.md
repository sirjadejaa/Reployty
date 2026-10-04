# PHASE 20 — V2 RETENTION FOUNDATION REPORT

**Status:** **COMPLETE**

---

## 1. Executive Summary

Phase 20 establishes the backend, domain model, security, and UI foundation for Reployty V2's Retention & Campaign Architecture. The system evolves Reployty from customer loyalty and CRM management into an event-driven customer retention and re-engagement platform.

All foundation components were implemented strictly following the existing Reployty Design System, tenant isolation invariants, RBAC structure, and audit logging standards. No external paid messaging providers (WhatsApp/Twilio/SendGrid) were connected, and no visual automation builders or unapproved features were introduced.

---

## 2. Existing Architecture Inspected

The following existing models, services, and routes were analyzed and reused:

- **Database Models:** `Campaign`, `CampaignDelivery`, `AutomationRule`, `AutomationExecution`, `Customer`, `CustomerConsent`, `CustomerEvent`, `CustomerSegment`, `CustomerNote`, `LoyaltyProgram`, `LoyaltyCard`, `LoyaltyTransaction`, `Reward`, `RewardRedemption`, `Offer`, `OfferRedemption`, `ReviewFeedback`, `Business`, `Branch`, `User`, `StaffMembership`, `Subscription`, `Plan`, `AuditLog`.
- **Backend Services:** `customerService`, `crmService`, `loyaltyService`, `rewardService`, `offerService`, `reviewService`, `analyticsService`, `billingService`, `entitlementService`, `auditService`, `sessionService`, `tenantContext`.
- **Frontend Architecture:** AppShell, Sidebar, Header, MobileBottomNav, MetricCard, Modal, StatusBadge, Select, Input, Table, Tabs, and the Reployty Theme Engine.

---

## 3. Database Changes

### Migration
- **Name:** `20260929000000_add_campaign_retention_foundation_v2`
- **Location:** `prisma/migrations/20260929000000_add_campaign_retention_foundation_v2/migration.sql`
- **Status:** Successfully deployed and verified against PostgreSQL.

### Enums Extended
- `CampaignChannel`: Added `IN_APP` (alongside `WHATSAPP`, `SMS`, `EMAIL`)
- `CampaignStatus`: Added `ACTIVE`, `PAUSED`, `COMPLETED` (alongside `DRAFT`, `SCHEDULED`, `SENDING`, `SENT`, `CANCELLED`)
- `DeliveryStatus`: Added `PROCESSING`, `CANCELLED` (alongside `QUEUED`, `SENT`, `DELIVERED`, `FAILED`, `OPENED`, `CLICKED`, `REDEEMED`)
- `CustomerEventType`: Added `CAMPAIGN_TOUCHPOINT`

### Enums Created
- `CampaignType`: `ONE_TIME`, `AUTOMATED`, `TRIGGERED`
- `AudienceType`: `ALL_CUSTOMERS`, `SAVED_SEGMENT`, `DYNAMIC_SEGMENT`, `SPECIFIC_CUSTOMER`
- `CampaignActionType`: `SEND_MESSAGE`, `SEND_OFFER`, `SEND_REWARD_REMINDER`, `ADD_TAG`, `REMOVE_TAG`, `CREATE_TASK`

### Models Extended
- **`Campaign`**:
  - Added columns: `description` (TEXT), `type` (CampaignType), `audienceType` (AudienceType), `segmentId` (FK to `customer_segments`), `branchId` (FK to `branches`), `createdById` (FK to `users`), `actionType` (CampaignActionType), `triggerEvent` (CustomerEventType), `triggerConfig` (JSONB), `startDate` (TIMESTAMP), `endDate` (TIMESTAMP), `lastRunAt` (TIMESTAMP).
  - Added indexes: `[businessId, status]`, `[businessId, type]`, `[branchId]`.
- **`CampaignDelivery`**:
  - Added columns: `idempotencyKey` (TEXT, `@unique`), `metadata` (JSONB).
  - Added relation to `Customer`: `customer Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)`.
  - Added index: `[customerId, createdAt]`.
- **Relations Linked:**
  - `User.createdCampaigns` -> `Campaign.createdBy`
  - `Branch.campaigns` -> `Campaign.branch`
  - `CustomerSegment.campaigns` -> `Campaign.segment`
  - `Customer.campaignDeliveries` -> `CampaignDelivery.customer`

---

## 4. Services Created & Modified

1. **`src/server/services/retentionEventService.ts` (New):**
   - Validates and ingests controlled retention events (`validateRetentionEventType`).
   - Tenant-safe event recording into `customer_events` (`recordRetentionEvent`).
   - Tenant-isolated querying with filtering by customer, event type, date range, and pagination (`getRetentionEvents`).

2. **`src/server/services/campaignAudienceService.ts` (New):**
   - Implements audience abstraction (`ALL_CUSTOMERS`, `SAVED_SEGMENT`, `DYNAMIC_SEGMENT`, `SPECIFIC_CUSTOMER`).
   - Enforces branch scoping (`branchId`).
   - Strictly applies consent gating: resolves customers who granted channel consent (`CustomerConsent`) or general marketing consent (`Customer.marketingConsent`).
   - Guarantees cross-tenant boundary isolation.

3. **`src/server/services/campaignExecutionService.ts` (New):**
   - Execution boundary and lifecycle validations.
   - Enforces contact cooldown / frequency protection (`isCustomerInCooldown`).
   - Guarantees execution idempotency using deterministic `idempotencyKey`.
   - Prepares `CampaignDelivery` records using a safe staging simulation adapter without external API calls or messaging costs.
   - Records `CAMPAIGN_TOUCHPOINT` customer events on the CRM timeline.

4. **`src/server/services/campaignService.ts` (New):**
   - CRUD management (`createCampaign`, `getCampaignById`, `getBusinessCampaigns`, `updateCampaign`, `deleteCampaign`).
   - Controlled status transitions (`validateStatusTransition`):
     - `DRAFT` → `SCHEDULED` | `ACTIVE` | `CANCELLED`
     - `SCHEDULED` → `ACTIVE` | `DRAFT` | `CANCELLED`
     - `ACTIVE` → `PAUSED` | `COMPLETED` | `CANCELLED`
     - `PAUSED` → `ACTIVE` | `CANCELLED`
     - `COMPLETED` and `CANCELLED` are terminal states.
   - Audit trail generation (`CAMPAIGN_CREATED`, `CAMPAIGN_UPDATED`, `CAMPAIGN_STATUS_CHANGED`, `CAMPAIGN_DELETED`).

5. **`src/server/services/entitlementService.ts` (Modified):**
   - Added `'CAMPAIGNS'` to `FeatureKey`.
   - Added `'maxActiveCampaigns'` to `LimitKey`.
   - Updated `hasFeature` and `getUsageAndLimits` to support campaign limits per subscription tier.

---

## 5. APIs Created & Verified

All endpoints are mounted on `businessRouter` (accessed via `/api/business/*`), protected by `requireAuthTenant` middleware:

| Method | Endpoint | Description | Auth & RBAC |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/business/campaigns` | Lists campaigns with filtering & pagination | `CAMPAIGNS_VIEW` |
| `POST` | `/api/business/campaigns` | Creates a new campaign | `CAMPAIGNS_MANAGE` |
| `GET` | `/api/business/campaigns/:id` | Retrieves campaign details with delivery counts | `CAMPAIGNS_VIEW` |
| `PATCH` | `/api/business/campaigns/:id` | Updates non-terminal campaign | `CAMPAIGNS_MANAGE` |
| `POST` | `/api/business/campaigns/:id/status` | Controlled status transition | `CAMPAIGNS_MANAGE` |
| `DELETE` | `/api/business/campaigns/:id` | Deletes draft campaign with 0 deliveries | `CAMPAIGNS_MANAGE` |
| `POST` | `/api/business/campaigns/:id/simulate-run` | Executes simulation with consent & cooldown | `CAMPAIGNS_MANAGE` |
| `GET` | `/api/business/retention/events` | Retrieves tenant retention events | `CAMPAIGNS_VIEW` |
| `POST` | `/api/business/retention/events` | Records tenant retention event | `CAMPAIGNS_MANAGE` |

---

## 6. RBAC & Security Verification

- **Owner & Manager:** Authorized for `CAMPAIGNS_VIEW` and `CAMPAIGNS_MANAGE`. Full operational capability.
- **Staff (Cashier / Barista):** Unauthorized. Attempts to view or mutate campaigns return **HTTP 403 Forbidden** (`FORBIDDEN_PERMISSION`).
- **Unauthenticated:** Missing or expired session tokens return **HTTP 401 Unauthorized**.
- **Audit Trail:** Every campaign creation, edit, status transition, and deletion generates an immutable `AuditLog` record with automated redaction of sensitive tokens/PII.

---

## 7. Multi-Tenant & Branch Isolation

- **Tenant Isolation:** A session from Business A querying, modifying, or executing a campaign belonging to Business B is rejected with **HTTP 404 Not Found** (discovery prevention). Business A campaign lists never contain Business B records.
- **Audience Protection:** Audience resolution queries are hard-scoped to `ctx.businessId`. Customers belonging to another business cannot be selected or contacted under any circumstances.
- **Branch Scoping:** Staff scoped to Branch A cannot create or associate campaigns with Branch B.

---

## 8. Consent Protection & Contact Cooldown

- **Channel Consent:** Messages mapped to `WHATSAPP`, `SMS`, `EMAIL`, or `IN_APP` verify that the customer has an active consent grant for the respective channel (`ConsentChannel`).
- **Suppression:** Customers lacking consent or who revoked consent are filtered into `suppressedConsentCount` and receive zero deliveries.
- **Contact Cooldown:** The engine checks whether the customer was contacted within the last `N` hours (default 24h). In-cooldown customers are automatically suppressed (`suppressedCooldownCount`).
- **Idempotency:** A deterministic `idempotencyKey` (`camp_${campaignId}_cust_${customerId}_${runDate}`) prevents duplicate deliveries on retries or concurrent worker runs.

---

## 9. User Interface Foundation

Mounted under the existing `campaigns` route in `App.tsx`:
- **File:** `src/views/business/BusinessCampaignsView.tsx`
- **Design System:** Reuses standard `Card`, `Button`, `Input`, `StatusBadge`, `Modal`, `Textarea`, `Select`, `MetricCard`, and CSS tokens.
- **Features:**
  - Header with breadcrumbs and action controls.
  - Metrics row: Total Campaigns, Active/Scheduled, Total Deliveries, Audience Reached.
  - Status filter tabs: `All`, `DRAFT`, `SCHEDULED`, `ACTIVE`, `PAUSED`, `COMPLETED`, `CANCELLED`.
  - Create Campaign modal with branch, segment, channel, and message template configuration.
  - Campaign Details modal showing status summary metrics, template preview, delivery log, and **Simulate Run** trigger.
  - Responsive layouts: desktop table view and mobile card view (`useIsMobile`).

---

## 10. Responsive QA Results

| Viewport | Device Class | Result | Observations |
| :--- | :--- | :---: | :--- |
| **360 × 800** | Small Mobile (Android) | **PASS** | Stacks metrics into 2-column grid; renders touch-friendly card list; touch targets ≥ 44px; zero horizontal scroll. |
| **390 × 844** | Standard Mobile (iPhone) | **PASS** | Clean spacing, fluid action buttons, modal fits viewport with scrollable body. |
| **768 × 1024** | Tablet (iPad Portrait) | **PASS** | Metrics in 4-column row, responsive table with horizontal overflow container. |
| **1440 × 900** | Desktop Laptop | **PASS** | Full layout with AppShell sidebar, spacious data table, instantaneous tab filtering. |

---

## 11. Test Results & Quality Metrics

1. **Phase 20 Test Suite (`tests/staging/campaign_foundation.test.ts`):**
   - Tests: **12 / 12 passed (0 failures)**
   - Coverage: CRUD, lifecycle transitions, multi-tenant isolation, branch isolation, RBAC, audience resolution, consent gating, cooldown frequency, idempotency, retention events, audit logs, validation.

2. **Full Regression Suite (`npm test`):**
   - Total Tests: **161 / 161 passed (0 failures)**
   - Suites: 19 test files covering Authentication, Super Admin, Business Admin, Customer PWA, Loyalty, Rewards, Catalog, Offers, Reviews, CRM 360, Analytics, Billing, Security, Staging Pilots (19B, 19C, 19E, 19F), and Phase 20.

3. **TypeScript Compilation (`npx tsc -b --noEmit`):**
   - Status: **PASS (0 errors)**

4. **Production Bundle Build (`npm run build`):**
   - Status: **PASS** (Built in 2.96s; `dist/assets/index-DhX1kigi.js` generated)

---

## 12. Issues Discovered & Resolved

| # | Issue Discovered | Root Cause | Fix Applied | Verification |
| :--- | :--- | :--- | :--- | :--- |
| 1 | Cross-tenant execution returned HTTP 400 instead of 404 | `executeCampaign` threw generic `CampaignExecutionError` | Threw `CampaignNotFoundError` when campaign is missing in business | Verified cross-tenant simulate-run returns HTTP 404 |
| 2 | Passing `cooldownHours: 0` fell back to default 24 hours | Falsy check `req.body.cooldownHours ? ... : 24` treated `0` as falsy | Changed condition to `req.body.cooldownHours !== undefined ? ... : 24` and added `cooldownHours <= 0` guard | Verified cooldown bypass in test 6 |
| 3 | Concurrent idempotency race condition in test assertion | `res1` and `res2` arrival order varied under Node test concurrency | Asserted order-independent status check `[res1.status, res2.status].includes(200)` | Verified in `first_customer_journey.test.ts` |

---

## 13. Remaining Limitations (Intentionally Deferred)

The following capabilities are intentionally deferred to subsequent V2 phases as prescribed:
- **Phase 21:** Advanced & Dynamic Segmentation Builder.
- **Phase 22:** Campaign Scheduling & Delivery Queue Engine.
- **Phase 23:** Automation Engine & Trigger Processors.
- **Phase 24:** Win-back, Birthday, & Inactivity Re-engagement Workflows.
- **Phase 25:** External SMS, WhatsApp (Meta Cloud API / MSG91), and Email (SendGrid) Provider Connectors.
- **Phase 26:** Campaign Analytics, Click/Open Tracking, & Conversion Attribution.
- **Phase 27:** Visual Drag-and-Drop Workflow Builder.
- **Phase 28:** V2 Billing Metering & Campaign Usage Overage.

---

## 14. Next Phase

**PHASE 20 COMPLETE — READY FOR PHASE 21**
