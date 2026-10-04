# 19C-STAGING — FIRST CUSTOMER JOURNEY REPORT

**Environment:**
LOCAL/STAGING

**Business:**
Staging Café

**Branch:**
Main Branch

**Customer:**
Staging Journey Customer (`alex.regular@staging.reployty.com`)

---

### Verification Matrix

- **QR:** PASS
- **OTP SIMULATION:** PASS
- **Customer Session:** PASS
- **Profile:** PASS
- **Consent:** PASS
- **Loyalty Card:** PASS
- **Catalog:** PASS
- **Stamp Award:** PASS
- **Reward:** PASS
- **Reward Redemption:** PASS
- **Idempotency:** PASS
- **Offer:** PASS
- **Review Workflow:** PASS
- **CRM Timeline:** PASS
- **Customer Segmentation:** PASS
- **Analytics:** PASS
- **Tenant Isolation:** PASS
- **Customer Session Security:** PASS
- **Concurrency:** PASS
- **Responsive:** PASS
- **Database Integrity:** PASS
- **TypeScript:** PASS
- **Build:** PASS
- **Full Regression:** PASS (102/102 tests passed, 0 failures)

---

### Step-by-Step Validation Details

| Step | Component / Action | Expected Result | Verified Result | Status |
|---|---|---|---|---|
| **Step 1** | QR Entry (`GET /api/customer/qr/:code`) | Public business context resolved; no internal secrets, user hashes, or staff data leaked | Resolved `Staging Café`, `Main Branch`, category `CAFE`, theme `CAFE`. Zero credentials or private fields exposed | **PASS** |
| **Step 2** | Customer PWA Context | Mobile-first branding payload returned | Primary/secondary colors, theme preset, and branch information properly delivered | **PASS** |
| **Step 3** | OTP Simulation (`POST /api/customer/auth/request-otp` & `verify-otp`) | Challenge created; `devOtp` issued in staging; invalid & reused codes rejected; session issued | Rate limiting, challenge expiry, code verification, single-use enforcement, and customer creation all verified | **PASS** |
| **Step 4** | Customer Profile (`GET /api/customer/me` & `PUT /api/customer/profile`) | Profile retrieval and update scoped to customer and business | Customer personal details updated and persisted across requests | **PASS** |
| **Step 5** | Consent (`PUT /api/customer/consent`) | Explicit marketing and channel preferences stored server-side | Customer consent updated to `MARKETING: true` and recorded with audit timestamp | **PASS** |
| **Step 6** | Loyalty Card (`GET /api/customer/loyalty`) | Server-authoritative card showing initial 0 stamps | Program `Stamps & Rewards` (STAMP, 10 target stamps) returned with 0 stamps collected | **PASS** |
| **Step 7** | Customer Catalog (`GET /api/customer/catalog`) | Read-only catalog reflecting 19B café menu items | Menu items (Cappuccino, Latte, Americano, Garlic Bread, Brownie) visible with prices; customer cannot mutate | **PASS** |
| **Step 8** | Stamp Award (`POST /api/business/loyalty/award-stamp`) | Staff awards 1st stamp; customer balance updates to 1 | 1 stamp awarded by staff terminal; customer card shows 1 stamp; transaction recorded in history | **PASS** |
| **Step 9** | Repeat Stamp Test | Staff awards 9 stamps; customer balance reaches 10 | Customer card reflects 10 stamps; card transitions to threshold; immutable transaction log maintained | **PASS** |
| **Step 10** | Reward Earning (`GET /api/customer/rewards`) | "Free Coffee" reward becomes eligible | `Free Coffee` (requires 10 stamps) evaluated as `isEligible: true` | **PASS** |
| **Step 11** | Reward Redemption & Anti-Fraud | Reward claimed; 10 stamps deducted; voucher code validated by staff; re-redemption blocked | Single-use voucher code generated; stamps deducted from 10 to 0; duplicate claim rejected; staff validated checkout; re-validation blocked (HTTP 409) | **PASS** |
| **Step 12** | Offer Flow (`GET /api/customer/offers`) | Customer views 10% Off offer; staff validates and redeems | "10% Off on Your Next Visit" evaluated as eligible; staff validated and redeemed with idempotency key | **PASS** |
| **Step 13** | Review Workflow (`POST /api/customer/reviews`) | 5-star routed to Google CTA; 2-star routed to Private Feedback | Rating 5 yielded `sentiment: POSITIVE` with Google Review CTA; Rating 2 yielded `sentiment: NEGATIVE` routed to private CRM feedback | **PASS** |
| **Step 14** | Customer CRM 360 & Timeline | Unified chronological timeline displays customer lifecycle | Customer 360 and timeline API returned complete lifecycle events: Joined, Stamps Added, Reward Claimed, Offer Redeemed, Reviews | **PASS** |
| **Step 15** | Customer Segmentation | Server-side evaluation against business customer segments | Customer segments queried and evaluated via business CRM engine | **PASS** |
| **Step 16** | Analytics Reflection (`GET /api/business/analytics/overview`) | Customer activity reflected in business metrics | Customer count, stamp transactions, reward redemptions, and reviews recorded in analytics | **PASS** |
| **Step 17** | Session Security | Customer token cannot access Business Admin or Super Admin | Requests with customer bearer token to `/api/business/profile` and `/api/admin/overview` rejected with 401/403 | **PASS** |
| **Step 18** | Cross-Tenant IDOR | Customer cannot access or claim isolation tenant data | Staging customer attempts to claim Isolation Test Bistro rewards rejected (404/400); Bistro staff cannot access Staging customer | **PASS** |
| **Step 19** | Concurrency & Idempotency | Concurrent/duplicate requests handled safely | Replay of identical idempotency keys handled safely without duplicate stamps or balances | **PASS** |
| **Step 20** | Customer Logout (`POST /api/customer/auth/logout`) | Customer session revoked; subsequent requests unauthorized | Session revoked; cookie cleared; subsequent calls to protected `/api/customer/me` return HTTP 401 | **PASS** |
| **Step 21** | Database Integrity Audit | Zero orphan records; strict tenant isolation | Prisma audit confirmed customer, loyalty cards, redemptions, and reviews strictly bound to Staging Café; no negative balances | **PASS** |
| **Step 22** | Responsive QA | CSS mobile-first viewport rules validated | Responsive media queries verified for 360x800, 390x844, 768x1024, and 1440x900 viewports | **PASS** |

---

### Issues Found & Fixed

1. **Reward Claim Query on Completed Loyalty Cards:**
   - *Issue:* In `src/server/services/rewardService.ts` (`claimCustomerReward`), the query for the customer's loyalty card filtered strictly by `status: 'ACTIVE'`. When a customer earned the 10th stamp, `awardStamps` marked the card as `status: 'COMPLETED'`. Consequently, `claimCustomerReward` failed to locate the card and returned `INSUFFICIENT_STAMPS` (HTTP 400).
   - *Fix:* Updated the loyalty card lookup to `status: { in: ['ACTIVE', 'COMPLETED'] }`. When the reward is claimed, the card's stamps are decremented and reset to `'ACTIVE'` status cleanly.

---

### Known Production Dependencies Still Required

- Production hosting infrastructure
- Managed production PostgreSQL
- Production Redis cluster
- Production domain and TLS termination
- Real SMS / OTP gateway provider (Twilio / MSG91)
- Real payment gateway provider (Stripe / Razorpay)

---

### Mandatory Status Language

**19C-STAGING — First complete customer journey validated in local/staging environment using simulated OTP/payment infrastructure where applicable.**

---

### Final Decision

**19C-STAGING = COMPLETE**
