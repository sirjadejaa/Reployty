# Pilot Feedback Template

> **Purpose**: Collect structured feedback from the business owner, staff, and customers during and after the pilot.

---

## 1. Business Owner Feedback

**Collected**: Weekly check-ins + end-of-pilot interview

```
OWNER FEEDBACK
Business:          [Business Name]
Date:              [YYYY-MM-DD]
Collected By:      [Developer Name]

OVERALL EXPERIENCE (1-5 scale, 5 = excellent)
- Overall satisfaction:         [ ] / 5
- Setup and onboarding:         [ ] / 5
- Value for the business:       [ ] / 5
- Would recommend to others:    [ ] / 5

OPEN QUESTIONS
1. What worked well?
   [Response]

2. What was frustrating or confusing?
   [Response]

3. How did customers react to scanning the QR code?
   [Response]

4. Did staff find the terminal easy to use during busy hours?
   [Response]

5. Was the reward attractive enough for customers?
   [Response]

6. What feature would make the biggest difference for your business?
   [Response]

7. Any privacy or security concerns?
   [Response]

8. Would you continue using Reployty after the pilot? Why or why not?
   [Response]
```

---

## 2. Staff Feedback

**Collected**: End-of-pilot brief interview (5 minutes per staff member)

```
STAFF FEEDBACK
Business:          [Business Name]
Staff Name:        [Name]
Role:              [Cashier / Barista / Manager]
Date:              [YYYY-MM-DD]

USABILITY (1-5 scale, 5 = very easy)
- Signing in:                   [ ] / 5
- Finding a customer:           [ ] / 5
- Awarding a stamp:             [ ] / 5
- Verifying a voucher:          [ ] / 5
- Redeeming a voucher:          [ ] / 5
- Speed during busy hours:      [ ] / 5

OPEN QUESTIONS
1. What was the easiest part of using Reployty?
   [Response]

2. What was the most difficult or annoying part?
   [Response]

3. Did any customer ask you for help with the QR code or their phone?
   [Response]

4. Did the terminal ever slow you down at the register?
   [Response]

5. Anything you'd change about the staff workflow?
   [Response]
```

---

## 3. Customer Feedback (Optional)

**Collected**: At checkout (brief verbal survey) or via follow-up message if consent was given.

```
CUSTOMER FEEDBACK
Business:          [Business Name]
Date:              [YYYY-MM-DD]
Customer ID:       [Optional — phone last 4 digits]

EXPERIENCE (1-5 scale, 5 = very easy)
- Ease of joining (QR scan):   [ ] / 5
- QR standee clarity:          [ ] / 5
- Digital card usability:      [ ] / 5
- Reward attractiveness:       [ ] / 5
- Overall experience:          [ ] / 5

OPEN QUESTIONS
1. Was it clear how to join?
   [Response]

2. Do you know how many stamps you have?
   [Response]

3. Is the reward worth collecting stamps for?
   [Response]

4. Any concerns about sharing your phone number?
   [Response]

5. Would you use this again next time you visit?
   [Response]
```

---

## 4. Issue Classification

When feedback reveals a problem, classify it:

| Classification | Definition | Example |
|---|---|---|
| `BUG` | Something is broken or produces incorrect results | Voucher shows wrong status after redemption |
| `USABILITY` | Feature works but is confusing or slow | Staff can't find the redemption terminal quickly |
| `CONFIGURATION` | Setting needs adjustment for this business | Stamp threshold should be 8 instead of 5 |
| `TRAINING` | Staff or customer needs better instructions | Staff forgot how to look up a customer |
| `FEATURE_REQUEST` | A new capability is requested | "Can we send a birthday discount?" |
| `PRODUCTION_BLOCKER` | Prevents the pilot from continuing | OTP messages not being delivered |

---

## 5. Issue Prioritization Matrix

| Factor | Weight | Questions to Ask |
|---|---|---|
| **Severity** | High | Does this prevent a core workflow from completing? |
| **Frequency** | High | Does this happen to every customer or rarely? |
| **Customer Impact** | High | Does this affect the customer's experience at the counter? |
| **Security Impact** | Critical | Does this expose data or allow unauthorized access? |
| **Operational Impact** | Medium | Does this slow down the register or staff workflow? |
| **Effort to Resolve** | Context | Can this be fixed with a configuration change or does it require code? |

### Priority Levels

- **P1 — Critical**: Security issue or complete workflow failure → Fix immediately
- **P2 — High**: Major usability problem affecting most users → Fix within 48 hours
- **P3 — Medium**: Annoyance or minor workflow issue → Fix within the pilot period
- **P4 — Low**: Cosmetic or nice-to-have → Record for post-pilot improvements

> **Do not** automatically add every feature request to the roadmap.
> **Do not** store unnecessary sensitive information (full phone numbers, personal details) in feedback records.
