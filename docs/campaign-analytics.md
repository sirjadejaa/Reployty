# Reployty V2 — Phase 26: Campaign Analytics, Click/Open Tracking & Conversion Attribution

## 1. Executive Summary & Positioning

Reployty's core mission is to **turn customers into regulars**. While sending campaigns informs customers of incentives, the fundamental measure of marketing effectiveness is whether those campaigns brought customers back into the store to engage, earn loyalty rewards, redeem offers, or reactivate.

Phase 26 establishes a production-grade, multi-tenant Campaign Analytics, Click/Open Tracking, and Conversion Attribution pipeline. Built directly on top of the Phase 21–25 foundation (Segmentation, Queue, Automation Engine, Retention Workflows, and External Messaging Providers), Phase 26 ensures every single metric shown to businesses reflects **real, persisted PostgreSQL events**. Absolutely no simulated numbers, `Math.random()`, or fabricated conversion metrics exist in production.

---

## 2. End-to-End Architecture

```text
Campaign (Draft -> Scheduled -> Processing -> Active)
   ↓
CampaignExecution
   ↓
CampaignDelivery (Status: QUEUED -> SENT -> DELIVERED -> OPENED -> CLICKED -> REDEEMED)
   ↓
Phase 25 External Providers (MSG91, Meta WhatsApp, SendGrid)
   │
   ├── Webhook Arrival / Ingestion
   │      ↓
   │   ProviderDeliveryEvent (Idempotent DB record)
   │      ↓
   │   CampaignAnalyticsEvent (SENT, DELIVERED, FAILED, BOUNCED, READ, OPENED, CLICKED)
   │
   └── Customer Engagement Channels
          ├── Click Tracking: /track/c/:code -> 302 Redirect -> CampaignClickEvent -> CLICKED
          └── Open Tracking: /track/o/:deliveryId -> 1x1 GIF Pixel -> OPENED
   
Customer Store Activity (Retention & Loyalty System)
   ↓
CustomerEvent (VISIT_RECORDED, STAMP_ADDED, POINTS_ADDED, REWARD_REDEEMED, OFFER_REDEEMED, CUSTOMER_REACTIVATED)
   ↓
Campaign Attribution Engine (campaignAttributionService.ts)
   ├── Tenant Verification (businessId match)
   ├── Customer Delivery Lookup (Status in [SENT, DELIVERED, OPENED, CLICKED, REDEEMED])
   ├── Attribution Window Filter (occurredAt <= sentAt + attributionWindowDays)
   ├── Last-Touch Single Attribution Rule (most recent eligible delivery wins)
   └── Atomic Deduplication (DB Unique: conv_${delivery.id}_${event.id})
   ↓
CampaignConversion record & CONVERTED analytics event
   ↓
Aggregated Business Analytics API & UI (/api/business/campaigns/:id/analytics)
```

---

## 3. Database Models & Schema Extensions

The schema additions in migration `20260929191743_add_campaign_analytics_and_attribution` introduce:

### 3.1 `CampaignAnalyticsEvent`
Tracks granular lifecycle and engagement events tied to deliveries and campaigns:
- `id`: UUID Primary Key
- `businessId`, `campaignId`, `campaignExecutionId`, `campaignDeliveryId`, `customerId`
- `channel`: `CampaignChannel` (`SMS`, `WHATSAPP`, `EMAIL`)
- `eventType`: Controlled event whitelist:
  - `SENT`, `DELIVERED`, `FAILED`, `BOUNCED`, `DROPPED`, `OPENED`, `CLICKED`, `READ`, `SPAM_REPORTED`, `CONVERTED`
- `provider`: Provider identifier (`MSG91`, `META_WHATSAPP`, `SENDGRID`, `MOCK`)
- `providerEventId`: External webhook/event ID
- `occurredAt`: UTC timestamp of event occurrence
- `idempotencyKey`: Unique string preventing duplicate records from webhook replays
- `metadata`: JSON object containing provider-specific contextual metadata

### 3.2 `CampaignTrackingLink`
Manages campaign-associated links for secure click tracking:
- `id`: UUID Primary Key
- `businessId`, `campaignId`, `deliveryId`, `customerId`
- `trackingCode`: 16-character cryptographically secure hex identifier
- `originalUrl`: Validated destination URL (`http:` or `https:`)
- `clickCount`: Total number of clicks
- `uniqueClickCount`: Number of unique customers/clickers
- `lastClickedAt`: UTC timestamp of most recent click

### 3.3 `CampaignClickEvent`
Audit log of individual click events:
- `id`: UUID Primary Key
- `businessId`, `trackingLinkId`, `customerId`, `deliveryId`
- `ipAddress`: Optional anonymized IP address
- `userAgent`: Client user-agent string
- `clickedAt`: UTC timestamp

### 3.4 `CampaignConversion`
Stores verified customer conversions attributed to campaign deliveries:
- `id`: UUID Primary Key
- `businessId`, `campaignId`, `campaignExecutionId`, `campaignDeliveryId`, `customerId`
- `conversionType`: Normalized conversion category (`RETURN_VISIT`, `LOYALTY_STAMP`, `LOYALTY_POINTS`, `REWARD_REDEMPTION`, `OFFER_REDEMPTION`, `CUSTOMER_REACTIVATED`, `PURCHASE_RECORDED`)
- `sourceEventId`: ID of originating `CustomerEvent`
- `attributionWindowDays`: Attribution window active when conversion occurred (default: 14 days)
- `occurredAt`: UTC timestamp of the customer action
- `idempotencyKey`: Deterministic unique key (`conv_${deliveryId}_${eventId}`) enforcing single-attribution under concurrency

### 3.5 Schema Relation Extensions
- `Campaign`: Added `attributionWindowDays Int @default(14)`, relations to `analyticsEvents`, `trackingLinks`, `conversions`.
- `CampaignDelivery`: Added `readAt DateTime?`, relations to `analyticsEvents`, `trackingLinks`, `conversions`.
- `Customer`: Relations to `campaignAnalyticsEvents`, `campaignConversions`, `campaignClickEvents`.

---

## 4. Provider Event Normalization

Incoming provider events from MSG91, Meta WhatsApp, and SendGrid webhooks are normalized into unified Reployty statuses:

| Provider | Raw Event Status | Normalized Delivery Status | Analytics Event Type | Timestamp Set |
| :--- | :--- | :--- | :--- | :--- |
| **Meta WhatsApp** | `sent` | `SENT` | `SENT` | `sentAt` |
| **Meta WhatsApp** | `delivered` | `DELIVERED` | `DELIVERED` | `deliveredAt` |
| **Meta WhatsApp** | `read` | `DELIVERED` | `READ` | `readAt` |
| **Meta WhatsApp** | `failed` | `FAILED` | `FAILED` | `failedAt` |
| **SendGrid** | `processed` / `deferred` | `QUEUED` / `SENDING` | `SENT` | `sentAt` |
| **SendGrid** | `delivered` | `DELIVERED` | `DELIVERED` | `deliveredAt` |
| **SendGrid** | `open` | `OPENED` | `OPENED` | `openedAt` |
| **SendGrid** | `click` | `CLICKED` | `CLICKED` | `clickedAt` |
| **SendGrid** | `bounce` / `dropped` | `FAILED` | `BOUNCED` / `DROPPED` | `failedAt` |
| **SendGrid** | `spamreport` | `DELIVERED` | `SPAM_REPORTED` | - |
| **MSG91** | `1` / `DELIVERED` | `DELIVERED` | `DELIVERED` | `deliveredAt` |
| **MSG91** | `2` / `FAILED` | `FAILED` | `FAILED` | `failedAt` |

### Webhook Idempotency
Provider webhooks are inherently subject to duplicate delivery. Reployty handles this at the database level:
- `ProviderDeliveryEvent` uses deterministic `idempotencyKey` based on provider and message/event ID.
- `CampaignAnalyticsEvent` records check and catch duplicate constraint violations gracefully without failing the webhook response.

---

## 5. Click Tracking & Security

### 5.1 Click Tracking Flow
1. Campaign link is created with `createTrackedLink(ctx, campaignId, url, deliveryId, customerId)`.
2. A 16-character opaque tracking code is generated (e.g., `https://app.reployty.in/track/c/9fa4ea0d88a65c6d` or `/t/c/9fa4ea0d88a65c6d`).
3. When clicked:
   - System verifies the code exists in `CampaignTrackingLink`.
   - Records `CampaignClickEvent`.
   - Increments total `clickCount`.
   - Updates `uniqueClickCount` only if this customer has not clicked previously.
   - Updates `CampaignDelivery.status = CLICKED` and `clickedAt = now`.
   - Records `CampaignAnalyticsEvent(CLICKED)`.
   - Issues an HTTP 302 redirect to `originalUrl`.

### 5.2 Anti-Open Redirect & SSRF Protection
- All links must use strictly whitelisted protocols: `http:` and `https:`.
- Hazardous schemes (`javascript:`, `data:`, `vbscript:`, `file:`, protocol-relative `//`) are rejected with `URL_SCHEME_FORBIDDEN`.
- Links are tied directly to tenant campaigns, preventing arbitrary open-redirect phishing primitives.

---

## 6. Email Open Tracking & Privacy

### 6.1 Transparent Pixel
For email campaigns, a 1x1 transparent GIF (43-byte standard header) is served via:
`GET /track/o/:deliveryId` (and `/t/o/:deliveryId`).

### 6.2 Idempotency & Privacy
- If already opened, the pixel is still returned with 200 `image/gif`, but no redundant analytics events are created (`open_${deliveryId}`).
- No invasive fingerprinting or canvas data is captured. Only standard user-agent and delivery context are logged.

### 6.3 Industry Open Tracking Limitations
In compliance with Section 17 & 61 of the specification, the Reployty UI explicitly displays open counts as **"Opens detected"**, because:
- **Apple Mail Privacy Protection (MPP)** automatically pre-fetches images via proxies, triggering false-positive opens.
- **Corporate Privacy Proxies & Anti-Spam Scanners** may fetch the 1x1 pixel before human viewing.
- **Image Blocking** in privacy-focused email clients (e.g., Thunderbird, ProtonMail) may suppress pixel loading even when read.

---

## 7. Conversion Attribution Rules

### 7.1 Core Attribution Flow
Whenever a business records a qualifying customer activity (via `recordRetentionEvent`), the centralized `campaignAttributionService` evaluates attribution:

```text
CustomerEvent (Type: VISIT_RECORDED, STAMP_ADDED, etc.)
  ↓
Filter candidate deliveries for customer in same business:
  - Status in [SENT, DELIVERED, OPENED, CLICKED, REDEEMED]
  - Delivery sentAt <= Event occurredAt
  - Event occurredAt <= Delivery sentAt + Campaign.attributionWindowDays
  ↓
Sort by sentAt DESC (Last-Touch Rule)
  ↓
Winning Delivery Selected
  ↓
Idempotent insert into CampaignConversion (Key: conv_${delivery.id}_${event.id})
  ↓
If REWARD_REDEMPTION or OFFER_REDEMPTION -> update Delivery.status = REDEEMED
  ↓
Create CampaignAnalyticsEvent (CONVERTED)
```

### 7.2 Attribution Window
- Configurable per campaign (default: `14` days; range: `1` to `90` days).
- Events outside the window are strictly ignored.

### 7.3 Last-Touch Single Attribution
- If a customer received multiple campaigns before converting, the **most recent eligible delivery** (`sentAt desc`) claims the attribution.
- Prevents double-attributing a single visit to multiple campaigns.

### 7.4 Supported Conversion Types
- `RETURN_VISIT`: Triggered by `VISIT_RECORDED` or `PURCHASE_RECORDED`.
- `LOYALTY_STAMP`: Customer earned a loyalty stamp (`STAMP_ADDED`).
- `LOYALTY_POINTS`: Customer earned loyalty points (`POINTS_ADDED`).
- `REWARD_REDEMPTION`: Customer redeemed an earned reward (`REWARD_REDEEMED`).
- `OFFER_REDEMPTION`: Customer redeemed a campaign offer (`OFFER_REDEEMED`).
- `CUSTOMER_REACTIVATED`: Lapsed customer returned (`CUSTOMER_REACTIVATED`).

---

## 8. Tenant Isolation & API Security

Every analytics query and mutation enforces Reployty's strict multi-tenant boundary:
1. **Authentication Session**: Required on all `/api/business/*` routes (returns 401 if missing).
2. **Tenant Membership**: Verified via user active business membership (returns 403 if unauthorized).
3. **RBAC**: Requires `CAMPAIGNS_VIEW` (Owner/Manager). Staff without this permission receive 403 Forbidden.
4. **Campaign Ownership Verification**: Querying another business's campaign ID returns 404 Not Found (`CampaignAnalyticsNotFoundError`).

---

## 9. API Endpoints Reference

| Method | Endpoint | Description | Permission |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/business/campaigns/:id/analytics` | Delivery funnel, rates, engagement, conversions, channel breakdown | `CAMPAIGNS_VIEW` |
| `GET` | `/api/business/campaigns/:id/conversions` | Paginated attributed conversion records with masked customer phone | `CAMPAIGNS_VIEW` |
| `GET` | `/api/business/campaigns/:id/timeline` | Unified chronological trace (Sent -> Delivered -> Engagement -> Conversion) | `CAMPAIGNS_VIEW` |
| `GET` | `/api/business/campaigns/:id/links` | List campaign tracked links with click counts | `CAMPAIGNS_VIEW` |
| `POST` | `/api/business/campaigns/:id/links` | Create a new tracked link with validation | `CAMPAIGNS_MANAGE` |
| `GET` | `/track/c/:code` (or `/t/c/:code`) | Public click redirect (302) | Public |
| `GET` | `/track/o/:deliveryId` (or `/t/o/:deliveryId`) | Public 1x1 transparent GIF open pixel | Public |
