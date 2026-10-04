# Reployty Client Demonstration Playbook

## 1. Presentation Objective

This playbook guides a presenter through a polished, realistic, 10-minute client demonstration of Reployty.

**Core Positioning**:
> **"Reployty turns first-time customers into loyal regulars."**

The demonstration follows the end-to-end journey of:
1. **Platform Onboarding**: A prospect signs up and the Super Admin provisions their business.
2. **Business Owner Experience**: The owner logs in, reviews loyalty configuration, and inspects the Retention Action Center.
3. **Customer Experience**: A guest scans a counter QR standee, joins without downloading an app, and tracks digital stamps.
4. **Counter Cashier Experience**: Staff verifies and completes voucher redemption at checkout with zero friction.
5. **Retention Intelligence**: The owner sees customer activity reflected immediately and reviews automated retention workflows.

---

## 2. Pre-Demo Setup (2 Minutes)

Before meeting with the client, execute:

```bash
# 1. Reset demo database to clean initial state
npm run demo:reset

# 2. Start the local server
npm start
# (or in a separate terminal: npm run dev)
```

Open two browser windows or one desktop browser and one mobile preview:
* **Window 1 (Staff / Admin)**: `http://localhost:5173/`
* **Window 2 (Customer PWA)**: `http://localhost:5173/#join/demo-cafe` (Set DevTools device emulation to iPhone 14/15: 390×844)

---

## 3. Step-by-Step Demonstration Script

### Scene 1: Managed Onboarding & Super Admin Review (2 Minutes)
1. **Navigate to Public Form**: Go to `http://localhost:5173/#get-started`.
   * *Talking Point*: *"Prospective merchants apply through a frictionless 4-step intake form. We validate their details before provisioning, guaranteeing platform quality and dedicated setup assistance."*
   * Enter test details: "Artisan Bakeshop", Category: Bakery, Owner: "Elena Rostova", City: "Metro City". Submit form.
2. **Super Admin Review**: Sign in as Super Admin (`admin.demo@reployty.test` / `DemoPass123!`).
   * Navigate to `#admin-applications`.
   * *Talking Point*: *"Platform administrators review submitted credentials, verify business legitimacy, and provision the tenant in an atomic PostgreSQL transaction. This creates their primary branch, owner credentials, and counter standee QR code automatically."*
   * Click **[Review Application]** -> **[Provision Business]**.
   * Show generated owner setup link and counter standee QR code.

### Scene 2: Business Owner Workspace & Retention Action Center (2 Minutes)
1. **Sign In as Owner**: Sign in as `owner.cafe@reployty.test` / `DemoPass123!`.
2. **Dashboard Overview**:
   * *Talking Point*: *"Notice the live metrics: Total Customers, Active Branches, Staff Members, and Loyalty Programs. Reployty avoids vanity metrics and focuses strictly on operational truth."*
3. **Retention Action Center**:
   * Show the 4-step Retention Action Center on the dashboard:
     1. Digital Loyalty Pass (Active)
     2. Rewards Catalog (Configured perks)
     3. Customer Counter QR Standee
     4. Automated Win-Back Triggers
   * *Talking Point*: *"Business owners don't need marketing degrees. Reployty tells them exactly what action to take next to boost customer frequency."*

### Scene 3: Customer Experience — Zero-App Digital Loyalty (2 Minutes)
1. **Counter QR Joining**: Switch to Window 2 (`#join/demo-cafe`).
   * *Talking Point*: *"Customers don't want to install another 100MB mobile app. They simply scan the standee on the counter with their native camera and enter their phone number."*
2. **Verification**: Enter phone `+1 (555) 010-0001`.
   * In local demo mode, point out the Simulation Code hint and click **[Auto-Fill]**.
3. **Digital Loyalty Card**:
   * Show Alex Rivera's digital pass:
     * Card displays 4 out of 5 stamps stamped in warm amber tones.
     * Progress bar shows 80% to reward.
     * Reward banner clearly promises: "Free Signature Pour-Over".
     * Stored in browser memory / PWA home screen shortcut.

### Scene 4: Cashier Terminal & Instant Redemption (2 Minutes)
1. **Redeem Voucher**: On customer view, navigate to `#customer/rewards` and show active voucher `DEMO-FREE-BREW`.
2. **Cashier Validation**: Switch to Owner/Staff window and navigate to `#rewards` -> **Staff Terminal** tab.
   * Enter `DEMO-FREE-BREW` into the terminal. Click **[Verify Code]**.
   * *Talking Point*: *"The cashier terminal instantly validates the voucher against PostgreSQL. Notice the green shield indicator confirming the reward is valid and unredeemed."*
   * Click **[Confirm Redemption Now]**.
   * Status updates instantly to "REDEEMED" with cashier audit attribution.
3. **Try Re-redeeming**: Re-enter `DEMO-FREE-BREW`.
   * Notice the red shield alert: `ALREADY_REDEEMED`.
   * *Talking Point*: *"Zero double-dipping. Real-time duplicate protection prevents fraud across multiple branches."*

### Scene 5: Retention Workflows & Visual Automation (2 Minutes)
1. **Customer CRM 360**: Navigate to `#customers`.
   * Click on Alex Rivera.
   * Show the real-time activity timeline: Visit history, stamps awarded, and voucher redemption recorded with exact timestamps.
2. **Retention Automations**: Navigate to `#automations`.
   * Show the Visual Drag-and-Drop Workflow Builder.
   * *Talking Point*: *"Reployty monitors visit patterns. When a regular hasn't visited in 30 days, the retention engine automatically dispatches a win-back offer. Every workflow can be simulated safely before live activation."*

---

## 4. Key Questions & Reassurances

* **"What messaging providers do you integrate with?"**
  * *Answer*: Reployty supports Twilio and MSG91 out-of-the-box for SMS and WhatsApp with provider health monitoring and simulated fallbacks.
* **"Can multi-branch chains use this?"**
  * *Answer*: Yes. Staff memberships, customer visit histories, and reward redemptions support both single-store flagships and multi-location franchises.
* **"Is customer data secure?"**
  * *Answer*: All tenant data is strictly partitioned in PostgreSQL with role-based access control, cryptographic session tokens, and SHA-256 invitation hashes.

---

## 5. Post-Demo Teardown

```bash
npm run demo:reset
```
The environment is instantly restored to clean demo baseline for the next meeting.
