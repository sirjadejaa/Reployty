# Reployty Client Onboarding & Launch Checklist

## 1. Overview

This checklist ensures every new business is provisioned securely, configured accurately, and launched with zero operational confusion at the checkout counter.

---

## 2. Phase A: Information Gathering (Before System Setup)

Collect these details directly from the business owner during your discovery or agreement meeting:

### Business Identity & Location
* [ ] **Trading Name**: Exact name as displayed on customer signage.
* [ ] **Business Category**: `CAFE`, `RESTAURANT`, `BAKERY`, `SALON`, `SPA`, or `RETAIL`.
* [ ] **Primary Branch Address**: Street address, city, postal code.
* [ ] **Store Operating Hours**: For configuring support and visit patterns.
* [ ] **Brand Colors**: Hex code or color preference (e.g. Amber Roast `#B45309`, Rose Pink `#DB2777`, or Royal Blue `#4F6BFF`).
* [ ] **High-Resolution Logo**: PNG or SVG format (transparent background preferred).

### Loyalty Program & Perks Rules
* [ ] **Program Type**: Digital Stamp Card (recommended for cafés/bakeries) or Spend-based Points.
* [ ] **Milestone Target**: Number of stamps required to earn the primary perk (e.g., 5, 8, or 10 stamps).
* [ ] **Perk Details**: Title, description, and redemption guidelines (e.g., *"Free Signature Pour-Over Coffee"*).
* [ ] **Voucher Expiry**: Validity window for claimed rewards (e.g., 30 or 60 days).

### Staff & Ownership
* [ ] **Owner Contact**: Full name, primary email address, mobile phone number.
* [ ] **Key Staff Members**: Names and roles (Manager vs. Cashier/Staff) for terminal access.

---

## 3. Phase B: Technical Provisioning & Configuration

Follow the standard Reployty managed provisioning workflow:

* [ ] **1. Super Admin Ingestion**:
  * Navigate to `#admin-applications` in the Super Admin platform.
  * Enter or review the business application details.
  * Click **[Provision Business]** to execute the atomic database transaction.
* [ ] **2. Secure Owner Invitation**:
  * Copy the cryptographically generated single-use invitation link (`#setup-password?token=...`).
  * Deliver link to owner via secure email or direct message.
  * Owner visits link, sets their private password, and accesses their workspace.
* [ ] **3. Branch & Store Profile Setup**:
  * Verify primary branch phone number, address, and operating timezone.
  * Confirm logo, cover image, and primary theme colors render properly.
* [ ] **4. Configure Loyalty Rules & Catalog**:
  * In `#loyalty`, configure stamp program parameters and default reward.
  * In `#rewards`, add secondary reward items (if applicable).
* [ ] **5. Staff Accounts & Cashier Access**:
  * In `#staff`, invite participating counter staff with the `STAFF` role.
  * Confirm staff can log in on the store register or cashier smartphone.
* [ ] **6. Standee QR Code Generation**:
  * Download the high-resolution counter standee QR code from `#settings` or `#admin-business-detail`.
  * Confirm destination URL maps to `#join/[business-slug]`.

---

## 4. Phase C: Operational Testing & Verification

Always run these four physical verification tests before placing the QR standee on the counter:

* [ ] **Test 1: Public Customer Scan**:
  * Scan the physical QR standee using an iPhone and an Android phone camera.
  * Verify it opens the branded join screen without error.
* [ ] **Test 2: Fast Customer Join**:
  * Complete customer enrollment with a test phone number.
  * Verify the digital stamp card renders with 0 stamps and displays the correct business branding.
* [ ] **Test 3: Stamp Awarding**:
  * Using the staff terminal, award 1 test stamp to the customer.
  * Confirm the customer's phone updates instantly to show the earned stamp.
* [ ] **Test 4: Cashier Voucher Redemption**:
  * Award stamps until the test card earns a reward voucher.
  * Enter the voucher code into the Staff Terminal (`#rewards` -> Staff Terminal).
  * Confirm the voucher status updates to **Redeemed**.
  * Confirm that entering the code a second time immediately displays **Already Redeemed**.

---

## 5. Phase D: Go-Live & Staff Briefing (Day of Launch)

* [ ] **Counter Standee Placement**: Place the 4×6" acrylic standee directly next to the payment terminal or cash drawer.
* [ ] **Staff Quick Briefing (10 Minutes)**:
  * Show cashiers the 1-page quick reference sheet.
  * Teach the 1-sentence prompt: *"Would you like to scan our counter standee to collect a digital stamp toward a free coffee?"*
  * Demonstrate how to look up and confirm a voucher in 5 seconds.
* [ ] **Emergency Contact**: Provide the owner and head cashier with a direct WhatsApp/phone contact for immediate support.
* [ ] **Schedule Week 1 Check-in**: Confirm date and time for the 7-day progress review.
