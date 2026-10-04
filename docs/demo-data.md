# Reployty Demo Data Architecture & Specification

## 1. Overview & Purpose

Reployty includes an isolated, repeatable, and non-destructive demo data framework designed for local client demonstrations and team walkthroughs.

The demo data framework is governed by three strict engineering guarantees:
1. **Tenant Isolation**: Demo records use isolated synthetic identifiers and the reserved `.test` domain. They never conflict with real or developer tenants.
2. **Safe Idempotency & Repeatability**: Demo data can be created, reset, and torn down repeatedly via `npm run demo:seed`, `npm run demo:reset`, and `npm run demo:clean`.
3. **Zero External Side-Effects**: All customer verification, retention messages, and campaign executions operate under local simulation mode. No external SMS, WhatsApp, or payment charges are triggered.

---

## 2. Demo Management Commands

```bash
# Seed isolated demo businesses, programs, and test accounts
npm run demo:seed

# Completely remove all synthetic demo records without touching real tenants
npm run demo:clean

# Clean and re-seed in a single command
npm run demo:reset
```

---

## 3. Demo Businesses Specification

### Business A: Demo Café
* **Name**: Demo Café
* **Slug**: `demo-cafe`
* **Category**: Café (`CAFE`)
* **Theme Preset**: `CAFE` (Primary: `#B45309`, Secondary: `#78350F`)
* **Address**: 100 Coffee Lane, Metro City, CA 90001
* **Customer Entry Link**: `http://localhost:5173/#join/demo-cafe`
* **Loyalty Model**: Stamp-based Pass ("Café Regulars Club")
  * **Target**: 5 stamps to earn reward
  * **Default Reward**: "Free Signature Pour-Over"
* **Rewards Catalog**:
  1. *Free Signature Pour-Over* (5 stamps required)
  2. *Fresh Almond Croissant* (3 stamps required)
* **Pre-staged Demo Scenario**:
  * Synthetic customer **Alex Rivera** (`alex.regular@customer.test`, phone: `+15550100001`) has **4 out of 5 stamps collected**.
  * Demonstrator can award 1 stamp to complete the pass and trigger reward claiming live.
  * Pre-generated sample voucher `DEMO-FREE-BREW` is ready in the Cashier Terminal for instant redemption validation.

### Business B: Demo Salon & Spa
* **Name**: Demo Salon & Spa
* **Slug**: `demo-salon`
* **Category**: Salon (`SALON`)
* **Theme Preset**: `SALON` (Primary: `#DB2777` Rose Pink, Secondary: `#9D174D`)
* **Address**: 250 Velvet Boulevard, Metro City, CA 90002
* **Customer Entry Link**: `http://localhost:5173/#join/demo-salon`
* **Loyalty Model**: Points-based Pass ("Glow VIP Points")
  * **Conversion**: 10 points per $10 spent
  * **Default Reward**: "Botanical Hair Spa Treatment"
* **Services Catalog**:
  * *Signature Cut & Botanical Blowdry* (45 min, $65.00)
* **Purpose**: Demonstrates theme adaptation, service business workflows, and appointment/service categorization.

---

## 4. Demo Credentials Directory

| Role | Business Context | Email | Password | Primary Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Super Admin** | Platform Console | `admin.demo@reployty.test` | `DemoPass123!` | Reviewing client applications, provisioning tenants, system metrics. |
| **Business Owner** | Demo Café | `owner.cafe@reployty.test` | `DemoPass123!` | Workspace configuration, loyalty rules, customer CRM, analytics. |
| **Cashier / Staff** | Demo Café | `cashier.cafe@reployty.test` | `DemoPass123!` | Point-of-sale terminal, adding stamps, verifying and redeeming vouchers. |
| **Business Owner** | Demo Salon | `owner.salon@reployty.test` | `DemoPass123!` | Demonstrating alternate salon theme, services menu, points program. |

---

## 5. Synthetic Customer Test Fixtures

| Customer Name | Synthetic Phone | Email | Pre-configured State |
| :--- | :--- | :--- | :--- |
| **Alex Rivera** | `+15550100001` | `alex.regular@customer.test` | 4 visits, 4 stamps collected (1 stamp away from reward), 1 active claimed voucher (`DEMO-FREE-BREW`). |
| **New Guest** | `+15550100002` | `new.guest@customer.test` | Unenrolled. Perfect for demonstrating counter QR scan and self-joining. |

---

## 6. Teardown & Isolation Guarantees

The `cleanDemo()` function performs a surgical, cascaded deletion strictly filtered by:
* `business.slug IN ('demo-cafe', 'demo-salon')`
* `user.email IN ('admin.demo@reployty.test', 'owner.cafe@reployty.test', 'cashier.cafe@reployty.test', 'owner.salon@reployty.test', 'stylist.salon@reployty.test')`
* `customer.email LIKE '%@customer.test'` or `customer.phone IN ('+15550100001', '+15550100002', '+15550100003')`

Production databases, real client applications (`BusinessOnboardingRequest`), and ongoing developer workspaces are completely untouched.
