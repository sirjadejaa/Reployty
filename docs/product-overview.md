# Reployty Product Overview

## 1. Product Positioning

**Reployty** is a production multi-tenant customer retention and loyalty platform built specifically for local and multi-location brick-and-mortar businesses.

> **Core Value Proposition**: *Turn first-time customers into loyal regulars.*

Local hospitality, retail, and service businesses lose up to 70% of first-time visitors after their initial visit. Reployty solves this retention challenge by replacing friction-heavy native apps and easily lost paper punch cards with a lightweight, browser-based digital loyalty experience and an automated retention marketing engine.

---

## 2. Core Functional Pillars

### 1. Zero-Friction Customer Entry (PWA)
* **App-less Architecture**: Customers do not download an app from the App Store or Google Play. They scan a counter QR code or tap a link.
* **Instant Phone Verification**: 6-digit OTP verification ensures high-fidelity contact details with explicit GDPR/TCPA marketing consent.
* **Digital Loyalty Passes**: Visual digital stamp cards and points passes styled with the business's custom brand colors and logo.
* **Wallet-Friendly Access**: Customers can add a bookmark or home-screen shortcut for instant access on return visits.

### 2. Digital Loyalty & Rewards Engine
* **Flexible Program Models**: Supports both traditional stamp cards (e.g. *Buy 5 Coffees, Get 1 Free*) and spend-based points programs (*10 Points per ₹100*).
* **Perks & Rewards Catalog**: Configurable reward inventory with redemption rules, expiration windows, and branch restrictions.
* **Fraud-Proof Cashier Terminal**: Counter staff verify 8-character voucher codes via web terminal with real-time duplicate-use prevention.

### 3. Customer CRM 360 & Dynamic Segmentation
* **Unified Customer Profiles**: Timeline tracking visits, spend history, stamps collected, rewards redeemed, and marketing consent.
* **Rule-Based Segmentation**: Build automated audiences based on recency, frequency, visit counts, or branch location (e.g., *Active VIPs*, *At-Risk Regulars (30+ Days Inactive)*).
* **Privacy & Compliance**: Granular tracking of SMS, WhatsApp, and marketing communication opt-ins.

### 4. Campaigns & Automated Retention Engine
* **Multi-Channel Outreach**: Native message dispatch via WhatsApp Business API and transactional SMS.
* **Retention Workflows**: Event-driven automation rules triggered by key customer actions:
  * Welcome onboarding message after first QR scan.
  * Milestone reward celebratory alerts.
  * Automated win-back reminders after 30 or 60 days of inactivity.
* **Visual Workflow Canvas**: Intuitive node-based workflow builder for composing triggers, delays, condition filters, and message dispatches.
* **Safe Staging Simulation**: Built-in dry-run simulator allowing merchants to test campaign deliverability and audience sizes with zero messaging costs or provider charges.

### 5. Multi-Location & Operations Management
* **Multi-Branch Hierarchy**: Organize customer visits, QR standees, and staff assignments across multiple physical branch locations.
* **Role-Based Access Control (RBAC)**: Fine-grained permissions separating Owner, Manager, and Staff roles.
* **Operational Audit Logs**: Immutable audit trail of every branch modification, staff invitation, and reward redemption.

### 6. Managed SaaS Administration
* **Client Onboarding Ingestion**: Public onboarding intake pipeline (`#get-started`) for prospective merchants.
* **Super Admin Console**: Comprehensive directory review, application approval, and automated tenant provisioning with cryptographic owner invitations.
* **Tiered Subscription Plans**: Built-in plan limits governing active branches, staff seats, and customer volume.

---

## 3. Technology Stack & Security Architecture

| Layer | Technology | Key Capabilities |
| :--- | :--- | :--- |
| **Backend API** | Node.js, Express, TypeScript | RESTful APIs, multi-tenant isolation middleware, strict input validation. |
| **Database & ORM** | PostgreSQL 16+, Prisma ORM | Relational data integrity, schema migrations, ACID transactions. |
| **Authentication** | Cryptographic Sessions, bcrypt | SHA-256 token hashing, HTTP-only secure cookies, session revocation. |
| **Frontend UI** | React 18, TypeScript, Vite | Zero external UI frameworks, responsive design tokens (`#4F6BFF`). |
| **Testing** | Node.js Test Runner, TypeScript | 370+ automated tests covering security, RBAC, tenant isolation, and workflows. |

---

## 4. Supported Business Categories

Reployty includes custom design presets and tailored workflow defaults for:
* **Cafés & Coffee Shops**: Stamp passes, morning bakery perks, counter standee QR.
* **Restaurants & Bistros**: Spend-based points, birthday rewards, digital menus.
* **Salons, Spas & Wellness**: Service catalogs, duration tracking, VIP treatment rewards.
* **Gyms & Fitness Studios**: Visit check-ins, monthly milestone awards.
* **Entertainment & Arcades**: Points passes, family game perks.
* **Boutiques & Specialty Retail**: Seasonal promotions, exclusive regular discounts.

---

## 5. Feature-Readiness Matrix

This matrix clearly distinguishes between features operational in our local/staging environment, features requiring production configuration, and factual, sales-safe wording for client conversations:

| Feature Area | Local Demo Status | Live Production Status | Production Requirements | Sales-Safe Client Wording |
| :--- | :---: | :---: | :--- | :--- |
| **Business Onboarding** | **Operational** | **Operational** | Standard web browser, Super Admin review. | *"We handle store setup, logo branding, and staff invites for you."* |
| **Customer QR Joining** | **Operational** | **Operational** | Counter standee printed with business QR. | *"Customers scan your counter standee with their phone camera to join."* |
| **OTP Authentication** | **Simulated** | **Ready for Provider** | Live SMS provider credentials (Twilio/MSG91). | *"Customers verify with a fast text code. In our live store setup, this arrives instantly via SMS."* |
| **Digital Loyalty Cards** | **Operational** | **Operational** | Browser support on customer phone (Safari/Chrome). | *"Customers get a branded digital stamp card saved directly in their mobile browser."* |
| **Stamps and Points** | **Operational** | **Operational** | Business loyalty rules configured. | *"Award stamps or points with every purchase based on your store's rules."* |
| **Rewards & Catalog** | **Operational** | **Operational** | Reward menu defined by merchant. | *"Create custom perks like free drinks, pastries, or percentage discounts."* |
| **Cashier Redemption** | **Operational** | **Operational** | Tablet or phone at counter with internet. | *"Cashiers verify 8-character voucher codes in 5 seconds with zero duplicate fraud."* |
| **Customer CRM & Timeline**| **Operational** | **Operational** | Active customer visits recorded. | *"View your customer directory, visit history, and regulars from any device."* |
| **Customer Segmentation** | **Operational** | **Operational** | Database query compiler active. | *"Group customers automatically by visit frequency or 30+ days of inactivity."* |
| **Promotional Offers** | **Operational** | **Operational** | Offer start/end dates and claim limits. | *"Publish limited-time promotions with custom expiration dates."* |
| **Google Review Links** | **Operational** | **Operational** | Public Google Maps review URL from merchant. | *"Direct satisfied regulars straight to your Google review page."* |
| **Campaigns & Outreach** | **Simulated** | **Ready for Provider** | Registered SMS / WhatsApp sender profile. | *"Schedule messages to announce new perks. Connects with verified WhatsApp/SMS senders."* |
| **Automations & Win-Backs**| **Operational** | **Operational** | Background queue worker active. | *"Automatically triggers friendly win-back perks when a regular hasn't visited in 30 days."* |
| **Messaging Integrations** | **Simulated** | **Ready for Provider** | Twilio / MSG91 API keys & approved templates. | *"Supports Twilio and MSG91. Safe simulation mode ensures zero accidental sends during demos."* |
| **Analytics & Reporting** | **Operational** | **Operational** | Historical transaction data. | *"Track total members, visit trends, and redeemed perks over time."* |
| **Subscription Billing** | **Enforced** | **Ready for Gateway** | Razorpay / Stripe gateway keys for card charging.| *"Tiered plans starting at ₹1,499/mo with a 100% free 30-day pilot for our launch partners."* |
| **Multi-Branch Operations**| **Operational** | **Operational** | Multi-location setup in dashboard. | *"Manage all your stores, staff, and customer visits from one unified owner account."* |

