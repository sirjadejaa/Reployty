# Reployty Pricing, Plans & Factual Claims Reference

## 1. Existing Configured System Plans (As Implemented in Database)

The Reployty codebase has four subscription tiers configured in PostgreSQL (`prisma/seed.ts` and `src/server/services/entitlementService.ts`). All limits and feature access flags are actively enforced by server-side middleware:

| Plan Tier | Configured Price (Monthly / Yearly) | Max Customers | Max Branches | Max Staff | Included Core Features |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Free Starter** (`free`) | **₹0** (Free Forever) | 100 | 1 | 2 | Customer CRM, Digital Loyalty Pass, Catalog, 2 Rewards, 1 Offer |
| **Starter Regulars** (`starter`) | **₹1,499** / mo (₹14,990 / yr) | 1,000 | 2 | 5 | All Free features + Up to 50 Rewards, 25 Offers, Google Reviews, Analytics, Data Exports |
| **Growth Retention** (`growth`) | **₹2,999** / mo (₹29,990 / yr) | 5,000 | 5 | 15 | All Starter features + Up to 500 Rewards, 250 Offers, AI Review Assistant, Multi-Branch Intelligence |
| **Enterprise Scale** (`enterprise`) | **₹9,999** / mo (₹99,990 / yr) | 50,000 | 50 | 100 | Dedicated high-volume limits, advanced retention reporting, custom staff permissions |

---

## 2. Client-Facing Pricing Discussion & Proposals

When discussing pricing with prospective merchants, use these guidelines to maintain complete transparency:

### Proposed Pilot Pricing (Introductory)
* **First 30 Days**: **100% Free Trial**. Zero setup fee, zero monthly fee.
* **Standee & Setup Assistance**: Included at no charge for the first pilot business.
* **No Automatic Conversion**: The pilot does not automatically charge the business at Day 31. The merchant explicitly chooses whether to continue.

### Proposed Ongoing Commercial Options (For Post-Pilot Discussion)
1. **Free Tier**: Ideal for micro-cafés or single-chair barbershops with under 100 customers. Zero risk to test long-term.
2. **Standard Commercial Tier**: Proposed at **₹1,499 / month** (or local currency equivalent ~$19–$25 USD/mo). Covers up to 1,000 customers and full staff terminal access.
3. **Outbound Messaging Pass-Through**:
   * Internal loyalty cards, QR joining, and cashier redemptions incur **zero per-message costs** (pure web browser application).
   * If a business enables outbound SMS or WhatsApp win-back campaigns, provider carrier costs (e.g. Twilio/MSG91 rates of ~$0.01–$0.02 per message) are billed at cost or via merchant-connected accounts.

---

## 3. Factual Product & Sales Claims Reference

To prevent exaggerated sales promises or regulatory missteps, always adhere to this factual claims matrix during client conversations:

| Feature / Capability | Actual Technical Status | Unsupported / Unverified Claim (AVOID) | Verified Sales-Safe Wording (USE THIS) |
| :--- | :--- | :--- | :--- |
| **Digital Loyalty Pass** | Fully verified in browser. | *"Guaranteed to double your return visits."* | *"Gives customers a frictionless way to track their stamps directly on their phone."* |
| **Counter QR Joining** | Verified with OTP verification. | *"Takes zero seconds and 100% of people join."* | *"Customers can scan your counter standee with their camera and join in about 15 seconds."* |
| **Cashier Terminal** | Instant lookup and duplicate protection. | *"100% immune to all retail fraud."* | *"Validates voucher codes in real time and automatically prevents duplicate redemptions."* |
| **Automated Win-Backs** | Event-driven workflow engine. | *"Guaranteed to win back 30% of lost revenue."* | *"Automatically alerts or messages regulars who haven't visited in 30 days to encourage a return."* |
| **Customer Data** | Encrypted in PostgreSQL. | *"We have military-grade AI data algorithms."* | *"All your customer records belong strictly to you and can be exported at any time."* |
| **Multi-Branch Support**| Relational branch scoping. | *"Can scale to 10,000 stores tomorrow."* | *"Allows you to manage multiple locations and view visits by store from one dashboard."* |

---

## 4. Demo Feedback Collection Process & Questionnaire

Collect honest operational feedback after every demo or pilot check-in to guide future improvements:

### The 5-Minute Post-Demo Questionnaire
1. **Clarity (1–5)**: *"On a scale of 1 to 5, how clear was the customer journey from scanning the QR code to seeing their digital stamps?"*
2. **Staff Workflow (1–5)**: *"How comfortable would your cashiers feel typing an 8-character voucher code into the terminal at checkout?"*
3. **Biggest Hesitation**: *"What is the single biggest concern that would prevent you from putting a QR standee on your counter next week?"*
4. **Missing Capabilities**: *"Is there anything critical to how you run your store today that you did not see?"*
5. **Pilot Interest**: *"Would you be interested in testing this completely free for 30 days at your main location?"*

### Feedback Review & Prioritization Process
1. **Log in Notes**: Record the verbatim response in your `lead-tracker` notes.
2. **Categorize**:
   * *Usability Friction* (e.g., text too small on mobile screen, button hard to find) -> Immediate polish.
   * *Operational Objection* (e.g., staff turnover, internet dropouts) -> Refine discovery and training.
   * *Feature Request* (e.g., POS integration, gift cards) -> Log for future product roadmap; do not promise on the spot.
