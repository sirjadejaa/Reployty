# 19E-STAGING — REAL BUSINESS PILOT VALIDATION REPORT

**Status Statement:**  
> **"19E-STAGING — Real Business Pilot validated in the existing local/staging environment."**

---

## 1. Environment
- **Environment Tier:** LOCAL/STAGING
- **Database Engine:** PostgreSQL (Prisma ORM `@prisma/client` 5.22.0)
- **API Runtime:** Express 4.21.2 + TypeScript + tsx runner
- **Frontend Engine:** React 18.3.1 + Vite 6.4.3 SPA with Reployty Design System Tokens
- **Auth Architecture:** Tenant-scoped session tokens (Bearer auth) & Customer JWT tokens via HTTP cookies/headers
- **OTP Mechanism:** Local/Staging OTP simulation provider (in-memory, strictly unexposed in logs or production)
- **Timezone Context:** `Asia/Kolkata` (IST)
- **Currency System:** INR (`₹`), integer minor units (paise)

---

## 2. Pilot Business
- **Legal / Display Name:** Artisan Roast Roastery & Kitchen
- **Category:** `CAFE`
- **Internal Slug:** `artisan-roast-pilot-*` (distinct staging tenant)
- **Theme Preset:** `CAFE` (Primary: `#B45309` Amber-700, Secondary: `#78350F` Amber-900)
- **Address:** Plot 14, Pali Hill Road, Bandra West, Mumbai, Maharashtra 400050, IN
- **Phone:** `+912226401234`
- **Email:** `contact@artisanroast.staging.reployty.com`
- **Subscription Plan:** Growth Plan (`ACTIVE`, ₹4,999/mo, 10,000 customers, 5 branches, 25 staff)

---

## 3. Branch
- **Branch Name:** Bandra Flagship Roastery
- **Branch Code:** `BANDRA`
- **Address:** Ground Floor, Pali Hill Roastery, Bandra West, Mumbai 400050
- **Status:** `ACTIVE`
- **Branch Scoping:** Validated that staff membership and operational permissions are scoped to this branch; cross-branch attempts are rejected with HTTP 403/404.

---

## 4. Owner
- **Full Name:** Kabir Mehta (Founder)
- **Role:** `OWNER` (`isOwner: true`)
- **Authentication:** Password authenticated via Argon2/bcrypt hash; session created with business context bound.
- **Access Boundary:** Full business administration privileges; strict 403 Forbidden on Super Admin platform routes; cannot access other tenant spaces.

---

## 5. Staff Roles & RBAC Matrix
Realistic pilot operator hierarchy established and validated:
1. **Owner (`Kabir Mehta`):** Full business management permissions (`SETTINGS_MANAGE`, `STAFF_MANAGE`, `BILLING_MANAGE`, `CATALOG_MANAGE`, `LOYALTY_MANAGE`, `OFFERS_MANAGE`, `REWARDS_MANAGE`, `ANALYTICS_VIEW`, `CUSTOMERS_MANAGE`).
2. **Manager (`Pooja Sharma` — Head of Operations):** Operations lead with CRM, catalog, reward, offer, loyalty, and analytics management privileges. Explicitly denied billing mutation.
3. **Staff (`Rohan Verma` — Lead Barista):** Counter operator with operational permissions:
   - Allowed: `CUSTOMERS_VIEW`, `CUSTOMERS_EDIT`, `LOYALTY_MANAGE` (stamp awarding), `LOYALTY_VIEW`, `OFFERS_VIEW`, `OFFERS_REDEEM`, `REWARDS_REDEEM`.
   - Denied: `SETTINGS_MANAGE` (HTTP 403), `STAFF_MANAGE` (HTTP 403), `BILLING_MANAGE` (HTTP 403), `CATALOG_MANAGE` (HTTP 403), `ANALYTICS_VIEW` (HTTP 403).

---

## 6. Loyalty Configuration
- **Program Name:** Artisan Coffee Club
- **Program Type:** `STAMP`
- **Target Stamps:** 10 stamps
- **Stamp Ratio:** 1 stamp per qualifying coffee purchase
- **Integrity Checks:** Positive integer stamp validation; balance cannot become negative; immutable audit entries created for every stamp awarded.

---

## 7. Rewards & Lifecycle Bug Retest
- **Reward Title:** Free Single-Origin Specialty Brew
- **Required Stamps:** 10 stamps
- **Voucher Validity:** 30 days
- **Lifecycle Bug Verification (Phase 19C fix re-tested):**
  1. Card reached 10/10 stamps (`COMPLETED` status).
  2. Customer claimed reward voucher successfully (`REWARD_CLAIMED` audit log produced).
  3. 10 stamps deducted atomically; card cleanly reset to `ACTIVE` state with 0 stamps collected.
  4. Duplicate claim immediately rejected with HTTP 409 Conflict.
  5. Barista verified voucher code `ARTISAN-...` at counter; voucher status set to `REDEEMED`.
  6. Duplicate redemption attempt rejected with HTTP 409 Conflict.

---

## 8. Catalog
Configured authentic roastery & kitchen menu stored in integer minor units (paise):
- **Menu:** Roastery & Kitchen Menu
- **Category 1:** Espresso & Filter Coffee
  - *Estate Pour-Over (Ratnagiri Estate):* ₹280.00 (`28000` minor units)
  - *Cortado (Double Ristretto & Steamed Milk):* ₹240.00 (`24000` minor units)
  - *Cold Drip Nitro Reserve:* ₹320.00 (`32000` minor units)
- **Category 2:** Artisanal Bakes & Kitchen
  - *Almond Sourdough Croissant:* ₹220.00 (`22000` minor units)
  - *Avocado Tartine with Fermented Chili:* ₹380.00 (`38000` minor units)
- **Access Control:** Owner and Manager manage items; Staff and Customers have read-only access.

---

## 9. Offers
- **Offer Title:** 15% Off Your First Roastery Visit
- **Offer Type:** `PERCENTAGE_DISCOUNT` (15%)
- **Thresholds:** Min purchase ₹500 (`50000` minor units), Max cap ₹150 (`15000` minor units)
- **Usage Limit:** 1 per customer
- **Redemption Validation:** Customer eligible on order ₹600; discount computed as ₹90 (`9000` minor units); redeemed with idempotency key; duplicate redemption rejected with HTTP 409.

---

## 10. QR Validation
- **QR Code Identifier:** `PILOT-QR-pilot_*`
- **QR Type:** `BRANCH_COUNTER`
- **Destination:** `/join/artisan-roast-pilot-*`
- **Public Resolver:** `GET /api/customer/qr/:code` returns HTTP 200 with business name, category (`CAFE`), branch name (`Bandra Flagship Roastery`), and theme tokens (`#B45309`, `#78350F`).
- **Privacy & Security Leak Check:** Public QR response verified to leak **zero** credentials, zero staff PII, zero internal secrets, and zero customer data.

---

## 11. CRM Validation
- **Customer:** Aarav Sen (`+9198200...`)
- **Customer 360:** Profile retrieved via `GET /api/business/customers/:id` showing status `ACTIVE`, total visits, stamps collected, and active vouchers.
- **Timeline Engine:** `GET /api/business/customers/:id/timeline` verified live database events generated through actual workflows:
  - `CUSTOMER_ENROLLED`
  - `STAMP_AWARDED`
  - `REWARD_CLAIMED`
  - `REWARD_REDEEMED`
  - `OFFER_REDEEMED`
  - `REVIEW_SUBMITTED`
- Zero fake lifecycle events were injected.

---

## 12. Review Validation
- **5-Star Review Flow:** Rating: 5, Sentiment: `POSITIVE`, Feedback: `"World class single-origin pour over and warm hospitality!"` → Triggers Google Review CTA routing with external review URL.
- **2-Star Private Feedback Flow:** Rating: 2, Sentiment: `NEGATIVE`, Feedback: `"WiFi connection in the outdoor seating area was weak during my meeting."` → Strictly kept as internal private feedback; no Google CTA shown; alerts internal management.
- **Privacy:** Review submission stores customer context safely without leaking phone or PII to third parties.

---

## 13. Analytics Validation
Live database events reflected in `GET /api/business/analytics/overview`:
- Customers count: `1`
- Stamps awarded: `10`
- Reward claims: `1`
- Reward redemptions: `1`
- Offer redemptions: `1`
- Reviews logged: `2` (Avg rating: `3.5`)
- Retention metrics calculated purely from database events without hard-coded numbers.

---

## 14. Tenant Isolation
Tested against existing staging tenants (`Staging Café` and `Isolation Test Bistro`):
- Cross-tenant business profile lookup: Rejected (HTTP 401/403/404).
- Cross-tenant branch inspection: Rejected (HTTP 404).
- Cross-tenant reward claim attempt: Rejected (HTTP 404).
- Pilot Owner attempting access to other tenant routes: Rejected (HTTP 401/403).
- Customer session attempting access to business admin endpoints: Rejected (HTTP 401).

---

## 15. Branch Isolation
- Barista staff assigned to `Bandra Flagship Roastery` cannot view or mutate entities of other branches.
- Branch-scoped offers and loyalty rules respect branch IDs; non-matching branch IDs are excluded.

---

## 16. Audit Validation
- Comprehensive audit log records produced:
  - `OFFER_CREATED`
  - `REWARD_CLAIMED`
  - `REWARD_REDEEMED`
  - `OFFER_REDEEMED`
  - `CATALOG_CREATED`
  - `STAFF_CREATED`
- **Zero-Secret Verification:** Verified across all audit logs that passwords, password hashes, OTP codes, session tokens, and secrets are strictly absent.

---

## 17. Responsive Validation
Verified Reployty Design System responsive layouts across target viewports:
- **360x800 (Compact Mobile / Android):** Single-column stacked cards, mobile bottom navigation bar active, touch targets >= 44px, zero horizontal overflow.
- **390x844 (Standard iPhone):** Customer PWA loyalty pass and QR reader scale within safe area insets.
- **768x1024 (Tablet / iPad):** Adaptive 2-column grid for catalog and CRM dashboard; collapsible sidebar navigation.
- **1440x900 (Desktop / Laptop):** Full multi-pane AdminAppShell with persistent sidebar, table pagination, and metric comparison charts.

---

## 18. Security Validation
- Session token generation using cryptographically secure random bytes (`crypto.randomBytes(32)`).
- Session tenant-binding enforced on every request via `tenantMiddleware`.
- Customer session token isolated from staff/owner sessions.
- Timing-safe comparisons used on authentication and webhook signatures.
- Customer phone numbers masked in operational views; zero OTPs logged in production/audit streams.

---

## 19. Database Integrity
- Automated referential integrity checks performed across all pilot models:
  - Business records: `1`
  - Branches: `1`
  - Staff memberships: `3` (Owner, Manager, Staff)
  - Loyalty cards: `1`
  - Reward redemptions: `1`
  - Offer redemptions: `1`
  - Customer reviews: `2`
- **Orphan records:** `0`
- **Duplicate memberships:** `0`
- **Cross-tenant references:** `0`

---

## 20. TypeScript Result
- Command: `npx tsc -b --noEmit`
- Result: **0 errors** (Clean compilation)

---

## 21. Build Result
- Command: `npm run build` (`tsc -b && vite build`)
- Result: **Built successfully in 2.85s**
- Assets generated:
  - `dist/index.html` (1.20 kB)
  - `dist/assets/index-GW_jm7Pd.css` (34.22 kB)
  - `dist/assets/index-abSEcqLR.js` (1,834.49 kB)

---

## 22. Regression Test Result
- Command: `npm test`
- Scope: All production, staging, e2e, and security test suites
- Test Count: **128 tests**
- Pass Count: **128 passed**
- Fail Count: **0 failed**
- Duration: **10.66s**

---

## 23. Issues Found
1. **Offer Type Enum Mismatch:** The pilot test initially passed `type: 'PERCENTAGE'`, whereas the Prisma schema and database require `PERCENTAGE_DISCOUNT`.
2. **QR Code Type Enum Mismatch:** The test initially passed `type: 'TABLE_TENT'`, whereas the Prisma schema requires `BRANCH_COUNTER`.

---

## 24. Fixes Made
1. Corrected `type: 'PERCENTAGE_DISCOUNT'` in `real_business_pilot.test.ts` to adhere to the existing `OfferType` database enum.
2. Corrected `type: 'BRANCH_COUNTER'` in `real_business_pilot.test.ts` to adhere to the existing `QRType` database enum.

---

## 25. Remaining Limitations (Local/Staging Only)
- In-memory simulation of SMS/OTP delivery (real SMS gateways are not provisioned in local/staging).
- In-memory simulation of payment/billing gateways (Stripe/Razorpay test keys not provisioned).
- Localhost execution; no SSL/TLS certificate termination or external CDN edge routing.

---

## 26. Production Dependencies Still Required (Phase 20 / 19D)
- Provisioning managed production PostgreSQL instance with automated backups and read replicas.
- Provisioning production Redis cluster for distributed caching and rate limiting.
- Production SMS gateway integration (e.g., Twilio, Gupshup, Fast2SMS) with DLT registration for India.
- Production payment gateway integration (Stripe / Razorpay) with live webhook secrets.
- Managed container / cloud hosting deployment with custom domain, automated SSL/TLS certificates, and WAF rules.

---

## 27. Final Sign-off
**"19E-STAGING — Real Business Pilot validated in the existing local/staging environment."**

*Hard stop observed. Awaiting next explicit instructions before proceeding.*
