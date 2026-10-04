# Reployty Pilot Business Proposal & Execution Framework

> **Important Note**: This document outlines a *proposed* 30-day pilot framework. It must be customized for the specific partner business before execution. No live production pilot should be initiated until all technical prerequisites are satisfied and explicit merchant approval is confirmed.

---

## 1. Executive Summary & Pilot Goals

**Host Business**: `[Insert Business Name]`  
**Target Location**: `[Insert Primary Branch Address]`  
**Proposed Pilot Duration**: 30 Calendar Days (`[Start Date]` to `[End Date]`)  
**Commercial Terms**: **100% Free Trial**. Zero setup fees, zero software charges, zero cancellation penalties.

### Primary Objectives
1. **Frictionless Customer Enrollment**: Verify that walk-in customers can scan the counter QR standee and join in under 15 seconds without assistance.
2. **Smooth Cashier Operations**: Verify that counter staff can award stamps and validate reward vouchers during busy hours in under 5 seconds without slowing the register line.
3. **Customer Value Clarity**: Confirm that customers clearly understand how many stamps they have collected and what reward they are working towards.
4. **Fraud Prevention**: Verify that reward vouchers are single-use and cannot be redeemed multiple times.
5. **Operational Feedback**: Gather qualitative feedback from the business owner, cashiers, and regulars to guide platform polish.

---

## 2. Recommended Pilot Scope (Controlled & Low-Risk)

To ensure operational safety, the initial pilot is strictly bounded:

* **Locations**: 1 Flagship Branch only.
* **Loyalty Model**: 1 Simple Stamp Card (e.g. *Buy 5 items, Get 1 Free* or *Collect 6 stamps for 15% off*).
* **Rewards Catalog**: 1 or 2 high-perceived-value, low-cost perks (e.g. *Free Pour-Over / Pastry*).
* **Participating Staff**: 2–4 primary counter cashiers or baristas.
* **Hardware Needed**: None purchased. Staff use an existing register tablet or their smartphone.

---

## 3. Technical & Operational Prerequisites (Must be Met Before Day 1)

Before real customers or transactions are processed, the following infrastructure must be active:

| Prerequisite Item | Status | Verification Detail |
| :--- | :---: | :--- |
| **1. Dedicated Production Hosting** | `[Pending]` | Node.js API hosted with automated health monitoring. |
| **2. Production Domain & SSL (HTTPS)**| `[Pending]` | Secure domain configured (e.g. `rewards.yourbrand.com`). |
| **3. Hosted PostgreSQL Database** | `[Pending]` | Cloud database with automated daily backups. |
| **4. Live SMS / WhatsApp OTP Sender** | `[Pending]` | Verified provider credentials configured for customer sign-in codes. |
| **5. Physical Counter Standee** | `[Pending]` | 4×6" acrylic standee printed with business logo and customer QR code. |
| **6. Staff Instruction Card** | `[Pending]` | 1-page laminated quick-reference card placed beside the cash register. |
| **7. Support Escalation Channel** | `[Pending]` | Direct phone/WhatsApp support contact for the owner and staff. |

---

## 4. Measurable Success Framework (Operational Metrics)

We evaluate pilot performance using concrete operational metrics rather than unverified revenue claims:

| Operational Metric | Target Benchmark | How It Is Measured |
| :--- | :--- | :--- |
| **Counter QR Scans** | 50+ scans / week | Built-in QR scan counter. |
| **Sign-Up Completion Rate** | > 80% of scans complete OTP | Customer join conversions. |
| **Loyalty Participation** | 30+ unique customers with 2+ visits | Active loyalty cards in CRM. |
| **Cashier Redemption Speed** | < 10 seconds per voucher | Staff terminal transaction timestamps. |
| **Redemption Error / Fraud Rate**| 0 duplicate redemptions allowed | Built-in duplicate rejection engine. |
| **Staff Usability Score** | ≥ 4 out of 5 satisfaction rating | End-of-pilot staff feedback interview. |
| **Customer Feedback** | Positive reaction to zero-app flow | Qualitative feedback collected at checkout. |

> *Note: A 30-day pilot measures customer adoption, counter usability, and operational feasibility. It serves as a leading indicator, not a definitive long-term retention or revenue guarantee.*

---

## 5. Weekly Pilot Timeline & Touchpoints

```text
WEEK 0 (Setup)       WEEK 1 (Launch)       WEEK 2 (Check-in)     WEEK 3 (Mid-Point)    WEEK 4 (Review)
Install standee &    Staff introduces QR   Review sign-ups &     First rewards         Final feedback review
train staff (15 min) to regulars at pay    counter speed with    claimed by regulars.  & next steps decision
```

* **Day 0 (Setup & Training)**: 15-minute on-site staff walk-through. Place counter standee. Run 1 test transaction.
* **Day 7 (Launch Check-in)**: Check number of customers enrolled. Verify that staff feel comfortable with the terminal.
* **Day 14 (Mid-Pilot Review)**: Review visit frequency and customer comments. Adjust reward thresholds if needed.
* **Day 21 (Redemption Milestone)**: First group of regulars unlocks their free reward. Verify redemption flow at the counter.
* **Day 30 (Conclusion & Next Steps)**: Comprehensive review meeting with the owner. Share report of total customers engaged, visits tracked, and vouchers redeemed. Discuss moving to a regular paid plan or cleanly deactivating.

---

## 6. Pilot Agreement & Rollback Guarantee

* **Merchant Freedom**: The merchant may pause or cancel the pilot at any time with 24 hours' notice.
* **Data Ownership**: All customer records collected during the pilot belong exclusively to the merchant. Reployty provides a full CSV export upon request.
* **Zero Cost**: No credit card required. No unexpected billing at Day 31.
