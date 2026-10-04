# Pilot Metrics & Measurement Framework

> **Purpose**: Define measurable metrics for evaluating a controlled pilot.
> **Important**: These metrics are defined for future use once a real pilot begins. Do not fabricate baseline data.

---

## 1. Operational Metrics

| # | Metric | Definition | Data Source | Measurement Period | Can Be Measured Now? | Known Limitations |
|---|---|---|---|---|---|---|
| 1 | **QR Scans** | Number of times the customer join URL is loaded | Application server logs (route hits to `#join/[slug]`) | Daily / Weekly | ✅ Yes — via route access logs | Does not distinguish unique visitors from repeat page loads |
| 2 | **Successful Customer Joins** | Number of new `Customer` records created with status `ACTIVE` | `Customer` table (`COUNT WHERE joinedAt >= pilot_start`) | Daily / Weekly | ✅ Yes — database query | Includes both QR-scan and direct-link joins |
| 3 | **Authentication Completion Rate** | Percentage of OTP requests that result in successful verification | `OtpChallenge` table (completed vs. total) | Weekly | ✅ Yes — database query | Affected by SMS delivery reliability; simulation mode skews this metric |
| 4 | **Stamp-Awarding Success** | Number of stamps successfully awarded | `CustomerEvent` table (`type = 'STAMP_AWARDED'`) | Daily / Weekly | ✅ Yes — database query | Does not track failed attempts separately (only successful events recorded) |
| 5 | **Redemption Success** | Number of vouchers successfully redeemed | `RewardVoucher` table (`status = 'REDEEMED'`) | Daily / Weekly | ✅ Yes — database query | Single metric; does not show redemption attempt count |
| 6 | **Duplicate Redemption Rejection** | Number of times `ALREADY_REDEEMED` was returned | Application logs (grep for `ALREADY_REDEEMED`) | Weekly | ⚠️ Partial — available in logs, not in a structured metrics table | Requires log analysis; not in a dedicated analytics table |
| 7 | **Error Rate** | Percentage of HTTP 5xx responses | Application logs (structured JSON) | Daily | ⚠️ Partial — available in logs | Requires external log aggregation for dashboarding |
| 8 | **Average Redemption Time** | Time from voucher code entry to confirmed redemption | Not directly measured | Per-session | ❌ No — requires frontend instrumentation | Would need to add client-side timing events |
| 9 | **Staff Usability Feedback** | Qualitative rating (1–5) from counter staff | Post-pilot interview | End of pilot | ❌ No — manual collection required | Subjective; sample size of 2–4 staff |
| 10 | **Customer Usability Feedback** | Qualitative feedback from participating customers | Verbal or written survey | End of pilot | ❌ No — manual collection required | Small sample; self-selection bias |

---

## 2. Engagement Indicators

| # | Metric | Definition | Data Source | Baseline Available? | Can Be Measured Now? |
|---|---|---|---|---|---|
| 1 | **Participating Customers** | Unique customers with ≥1 stamp in the pilot period | `Customer` + `CustomerEvent` tables | No baseline (new program) | ✅ Yes |
| 2 | **Loyalty Card Views** | Number of times the digital card is loaded | Application route logs (`#customer/loyalty`) | No baseline | ⚠️ Partial — route hits, not per-user tracking |
| 3 | **Customers Earning Progress** | Customers with ≥2 stamps in the pilot period | `CustomerEvent` aggregation | No baseline | ✅ Yes |
| 4 | **Rewards Unlocked** | Number of `RewardVoucher` records created | `RewardVoucher` table | No baseline | ✅ Yes |
| 5 | **Rewards Redeemed** | Number of vouchers with `status = 'REDEEMED'` | `RewardVoucher` table | No baseline | ✅ Yes |
| 6 | **Repeat Visits** | Customers with `totalVisits >= 2` during pilot | `Customer.totalVisits` field | No baseline | ✅ Yes |

---

## 3. Business Outcome Indicators

> **Caution**: These metrics require reliable baseline data from the business AND agreement from the owner to share operational data. Do not assume correlation proves Reployty caused any change.

| # | Metric | Definition | Data Source | Baseline Required? | Can Be Measured by Reployty? |
|---|---|---|---|---|---|
| 1 | **Repeat Visit Rate** | Percentage of customers returning within 30 days | `Customer.lastVisitAt` analysis | Yes (business's pre-pilot data) | ⚠️ Partial — Reployty tracks visits only from enrolled customers |
| 2 | **Customer Return Interval** | Average days between visits for repeat customers | `CustomerEvent` timestamps | Yes (business's pre-pilot data) | ✅ Yes — for Reployty-tracked customers |
| 3 | **Loyalty Program Participation** | Percentage of total customers who enrolled | Reployty customers vs. business's estimate of total foot traffic | Yes (requires foot traffic estimate) | ⚠️ Partial — denominator is an estimate |
| 4 | **Reward Cost** | Total value of rewards given during pilot | Business owner's count of redeemed items | Not required | ❌ No — cost of goods is external |
| 5 | **Revenue from Loyalty Activity** | Revenue associated with qualifying loyalty purchases | Business POS system | Yes (POS data) | ❌ No — requires POS integration not in scope |

---

## 4. Measurement Limitations

- **No POS integration**: Reployty does not connect to the business's point-of-sale system, so revenue attribution is not directly measurable
- **Simulation mode skews**: If OTP remains in simulation mode during any pilot period, authentication metrics are unreliable
- **Small sample**: A 30-day pilot at one branch with 30–50 customers provides directional indicators, not statistically significant results
- **No control group**: Without a comparable non-pilot period or location, attributing changes to Reployty vs. other factors is not possible
- **Self-reported baselines**: Pre-pilot business data depends on the owner's estimates

---

## 5. Reporting Template

At the end of the pilot, compile a report with:

```
PILOT METRICS REPORT
Business:          [Business Name]
Pilot Period:      [Start Date] to [End Date]
Duration:          [X] days

OPERATIONAL METRICS
- QR Scans:                     [count]
- Customer Joins:               [count]
- Auth Completion Rate:         [X]%
- Stamps Awarded:               [count]
- Vouchers Generated:           [count]
- Vouchers Redeemed:            [count]
- Duplicate Rejections:         [count]
- HTTP Error Rate:              [X]%

ENGAGEMENT
- Participating Customers:      [count]
- Customers with 2+ Stamps:    [count]
- Rewards Unlocked:             [count]
- Rewards Redeemed:             [count]
- Repeat Visitors (2+ visits):  [count]

QUALITATIVE
- Staff Usability Score:        [X]/5
- Customer Feedback Summary:    [brief summary]
- Incidents Reported:           [count]
- Unresolved Issues:            [count]
```
