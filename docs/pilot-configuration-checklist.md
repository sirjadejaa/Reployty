# Pilot Business Configuration Checklist

> **Purpose**: Repeatable checklist for configuring a pilot business using existing Reployty functionality.
> **Prerequisite**: Business owner has agreed to participate; production infrastructure is deployed.

---

## Phase A: Business Profile

- [ ] **Business Name**: Enter the exact trading name as displayed on customer signage
- [ ] **Category**: Select from: `CAFE`, `RESTAURANT`, `BAKERY`, `SALON`, `SPA`, `RETAIL`
- [ ] **Description**: 1–2 sentence description of the business for customer-facing display
- [ ] **Public Contact**:
  - [ ] Phone number
  - [ ] Email address (optional)
  - [ ] Website URL (optional)
- [ ] **Address**: Full street address, city, state/province, postal code, country
- [ ] **Timezone**: Confirm the business operating timezone
- [ ] **Branding**:
  - [ ] Primary color hex code (e.g., `#B45309` Amber Roast)
  - [ ] Theme preset selection
  - [ ] High-resolution logo (PNG/SVG, transparent background preferred)
  - [ ] Cover image (optional)

> **How**: Super Admin provisions via `#admin-applications` → **[Provision Business]**. Branding configured in `#settings` → Branding by the business owner.

---

## Phase B: Branch Configuration

- [ ] **Branch Name**: Primary location name (e.g., "Main Street Location")
- [ ] **Address**: Branch-specific address (auto-filled from business if single-branch)
- [ ] **Timezone**: Confirm if different from business headquarters
- [ ] **Contact Details**: Branch phone number
- [ ] **Staff Assignments**: Assign staff members to this branch (Phase D)

> **How**: Primary branch is created automatically during provisioning. Additional branches can be added via `#branches`.

---

## Phase C: Loyalty Program

- [ ] **Program Name**: Customer-facing name (e.g., "Loyalty Rewards", "VIP Stamp Card")
- [ ] **Stamp/Points Rules**:
  - [ ] Type: Stamp Card (recommended for pilot) or Points-based
  - [ ] Stamps required for reward (e.g., 5, 8, or 10)
  - [ ] Qualifying purchase conditions (e.g., "any purchase", "minimum $5 spend")
- [ ] **Reward Threshold**: Number of stamps/points to unlock the primary reward
- [ ] **Reward Description**: Clear customer-facing title (e.g., "Free Signature Pour-Over Coffee")
- [ ] **Expiration Policy**: Voucher validity window (e.g., 30 days, 60 days, or no expiry)
- [ ] **Redemption Restrictions**: Any limitations (e.g., "one per visit", "not combinable with other offers")

> **How**: Configure in `#loyalty` for stamp program parameters. Add rewards in `#rewards`.

---

## Phase D: Customer Experience

- [ ] **QR Joining Route**: Confirm URL format is `#join/[business-slug]`
- [ ] **Customer Registration Flow**:
  - [ ] Phone number entry
  - [ ] OTP verification (requires live SMS provider)
  - [ ] Name collection
  - [ ] Marketing consent checkbox
- [ ] **Authentication Method**: Phone OTP (default and only supported method)
- [ ] **Digital Card Appearance**:
  - [ ] Business logo renders correctly
  - [ ] Brand colors match
  - [ ] Stamp progress displays accurately
  - [ ] Reward description is clear
- [ ] **Consent Wording**: Verify the join screen displays:
  - [ ] Terms of service acknowledgment
  - [ ] Privacy notice
  - [ ] Marketing opt-in (separate, optional)
- [ ] **Customer Support Information**: Add support contact visible on the customer card

> **How**: QR code is generated during provisioning. Customer experience auto-renders from business configuration.

---

## Phase E: Staff Experience

- [ ] **Staff Accounts**:
  - [ ] Create 2–4 staff accounts via `#staff` with the `STAFF` role
  - [ ] Deliver secure invitation links to each staff member
  - [ ] Confirm each staff member can log in
- [ ] **Branch Access**: Verify each staff member is assigned to the correct branch
- [ ] **Permission Verification**:
  - [ ] Staff CAN: award stamps, verify vouchers, redeem vouchers, view customer cards
  - [ ] Staff CANNOT: modify loyalty rules, delete customers, access billing, change ownership
- [ ] **Stamp-Awarding Workflow**: Staff enters customer phone → confirms identity → awards stamp
- [ ] **Voucher Lookup**: Staff enters voucher code in Staff Terminal → sees validation result
- [ ] **Redemption Procedure**: Staff clicks [Confirm Redemption Now] → voucher marked REDEEMED
- [ ] **Escalation Process**: Staff contacts business owner via phone/WhatsApp for issues

> **How**: Staff management in `#staff`. Redemption terminal in `#rewards` → Staff Terminal tab.

---

## Phase F: Pre-Launch Verification

Run these four tests before placing the QR standee on the counter:

- [ ] **Test 1**: Scan QR from iPhone and Android → opens branded join screen
- [ ] **Test 2**: Complete customer enrollment with test phone → see 0-stamp card
- [ ] **Test 3**: Award 1 stamp from staff terminal → customer card updates
- [ ] **Test 4**: Award stamps until reward earned → redeem voucher → confirm REDEEMED → re-enter code → confirm ALREADY_REDEEMED

---

## Phase G: Go-Live

- [ ] Place counter standee next to payment terminal
- [ ] Brief staff (10 minutes) using the Staff Quick Guide
- [ ] Confirm emergency support contact is available
- [ ] Schedule Week 1 check-in date
