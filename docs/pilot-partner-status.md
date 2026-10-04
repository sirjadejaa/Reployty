# Pilot Partner Status

> **Last Updated**: 2026-10-04
> **Status**: `NO_PARTNER`

---

## 1. Current Status

| Field | Value |
|---|---|
| **Partner Status** | `NO_PARTNER` |
| **Business Category** | Not applicable |
| **Business Name** | Not applicable |
| **Number of Branches** | Not applicable |
| **Decision-Maker Confirmation** | Not obtained |
| **Pilot Scope Agreement** | Not discussed |
| **Pilot Start Approval** | Not obtained |
| **Contact & Support Arrangement** | Not established |

---

## 2. Status Definitions

| Status | Meaning |
|---|---|
| `NO_PARTNER` | No prospective business has been identified or approached |
| `PROSPECT_IDENTIFIED` | A specific local business has been identified as a potential pilot candidate |
| `CONVERSATION_STARTED` | Initial contact made; discovery call or meeting scheduled or completed |
| `DEMO_COMPLETED` | The prospect has seen a live demonstration of Reployty |
| `PILOT_DISCUSSION` | Active discussion about pilot terms, scope, and timeline |
| `PILOT_AGREED` | Business owner has verbally or in writing agreed to participate |
| `PILOT_READY` | All technical prerequisites satisfied; deployment and configuration complete |
| `PILOT_ACTIVE` | Pilot is live; real customers are using the system |
| `PILOT_COMPLETED` | Agreed pilot period has ended; review and evaluation complete |
| `PILOT_PAUSED` | Pilot temporarily suspended due to business request or technical issue |

---

## 3. Outstanding Requirements Before Advancing

To move from `NO_PARTNER` to `PROSPECT_IDENTIFIED`:

- [ ] Identify 3–5 local businesses in the target categories (café, bakery, salon, restaurant, retail)
- [ ] Research each prospect using the framework in [`docs/prospect-research.md`](file:///Users/jadejanildeepsinh/Desktop/REPLOYTY/docs/prospect-research.md)
- [ ] Assess which prospects currently use paper stamp cards or no loyalty program
- [ ] Prioritize prospects with high foot traffic and repeat-customer potential

To move from `PROSPECT_IDENTIFIED` to `CONVERSATION_STARTED`:

- [ ] Reach out via in-person visit, phone, or email
- [ ] Use the discovery call guide in [`docs/discovery-call-guide.md`](file:///Users/jadejanildeepsinh/Desktop/REPLOYTY/docs/discovery-call-guide.md)
- [ ] Listen to the business owner's current challenges with customer retention
- [ ] Offer a 10-minute demonstration

To move from `CONVERSATION_STARTED` to `DEMO_COMPLETED`:

- [ ] Prepare the local demo environment (`npm run demo:reset && npm run dev`)
- [ ] Follow the client demo script in [`docs/client-demo-guide.md`](file:///Users/jadejanildeepsinh/Desktop/REPLOYTY/docs/client-demo-guide.md)
- [ ] Address questions honestly; distinguish between demo simulation and live capability
- [ ] Collect initial feedback and interest level

To move from `DEMO_COMPLETED` to `PILOT_AGREED`:

- [ ] Present the pilot proposal using [`docs/pilot-plan-template.md`](file:///Users/jadejanildeepsinh/Desktop/REPLOYTY/docs/pilot-plan-template.md)
- [ ] Agree on pilot scope (1 branch, 1 loyalty program, 2–4 staff)
- [ ] Confirm 30-day duration and weekly check-in schedule
- [ ] Obtain explicit verbal or written agreement from the decision-maker
- [ ] Confirm support contact method (WhatsApp/phone)

---

## 4. Important Constraints

- **Do not fabricate a partner**. This document must reflect the actual status.
- **Do not claim a prospect agreed** unless explicit confirmation was received.
- **Do not purchase infrastructure** until a partner has agreed and deployment is approved.
- **Do not collect real customer data** during local demos.
