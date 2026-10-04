# Pilot Completion Checklist

> **Purpose**: Structured process for concluding a controlled pilot period, evaluating results, and deciding next steps.

---

## 1. Pre-Completion Review (Week 4, Day 25–28)

- [ ] **Review agreed objectives**: Compare original pilot goals against actual outcomes
- [ ] **Compile operational metrics**: Generate the metrics report from [`docs/pilot-metrics.md`](file:///Users/jadejanildeepsinh/Desktop/REPLOYTY/docs/pilot-metrics.md)
- [ ] **Count key figures**:
  - Total customers enrolled
  - Total stamps awarded
  - Total vouchers generated
  - Total vouchers redeemed
  - Duplicate redemption rejections
  - Error rate during pilot
- [ ] **Review incident log**: List all incidents and their resolution status

---

## 2. Business Owner Interview (Day 28–30)

- [ ] **Schedule 30-minute review meeting** with the business owner
- [ ] **Share the metrics report** before the meeting
- [ ] **Discuss**:
  - [ ] Did the pilot meet the agreed objectives?
  - [ ] What worked well for the business?
  - [ ] What was the biggest challenge?
  - [ ] How did customers react?
  - [ ] How did staff feel about the workflow?
  - [ ] Is the reward structure appropriate?
  - [ ] Any privacy or trust concerns from customers?

---

## 3. Staff Feedback Collection (Day 28–30)

- [ ] **Conduct 5-minute interviews** with each participating staff member
- [ ] **Use the staff feedback template** from [`docs/pilot-feedback-template.md`](file:///Users/jadejanildeepsinh/Desktop/REPLOYTY/docs/pilot-feedback-template.md)
- [ ] **Record feedback** with appropriate classification

---

## 4. Customer Feedback Review (Day 28–30)

- [ ] **Review any customer feedback** collected during the pilot
- [ ] **Note common themes**: ease of joining, QR clarity, reward value, privacy concerns
- [ ] **Record** using the customer feedback template

---

## 5. Incident & Support Review

- [ ] **List all incidents** from the incident log
- [ ] **Count by severity**: P1, P2, P3, P4
- [ ] **Identify unresolved defects**: any open bugs or issues
- [ ] **Document root causes** for recurring problems

---

## 6. Decision Discussion

Discuss with the business owner:

- [ ] **Continue**: Pilot was successful; transition to ongoing use
  - Requires: agreement on subscription terms, continued hosting
- [ ] **Extend**: Pilot shows promise but needs more time or adjustments
  - Requires: agreement on extended duration, any configuration changes
- [ ] **Pause**: Pilot needs to be temporarily suspended
  - Requires: agreement on data handling during pause
- [ ] **End**: Pilot is concluding; business does not wish to continue
  - Requires: data export/deletion process

> **Do NOT automatically convert to a paid subscription.** Commercial terms and payment must be explicitly agreed and approved.

---

## 7. Customer Data Handling

At pilot conclusion, confirm with the business owner:

- [ ] **Data ownership**: Customer records belong to the business
- [ ] **Data export**: If requested, provide CSV export of customer records
- [ ] **Data retention**: Agree on how long records are kept if the pilot ends
- [ ] **Data deletion**: If the business requests deletion, confirm scope and execute
- [ ] **Privacy obligations**: Any ongoing privacy obligations to enrolled customers

---

## 8. Technical Cleanup (If Pilot Ends)

If the business decides not to continue:

- [ ] **Deactivate the business** in the system (`status = 'SUSPENDED'` or `'INACTIVE'`)
- [ ] **Revoke active sessions** for the business owner and staff
- [ ] **Remove the counter QR standee** from the business premises
- [ ] **Export customer data** if requested
- [ ] **Schedule data deletion** per agreed timeline
- [ ] **Decommission production resources** if no other pilot is active

---

## 9. Lessons Learned

Document:

- [ ] **What went well**: processes, features, or interactions that succeeded
- [ ] **What needs improvement**: bugs, usability issues, or process gaps
- [ ] **What was missing**: features, documentation, or support that should be added
- [ ] **Recommendations for the next pilot**: changes before approaching the next business

---

## 10. Pilot Outcome Record

```
PILOT OUTCOME
Business:          [Business Name]
Pilot Period:      [Start Date] to [End Date]
Duration:          [X] days
Outcome:           [NOT STARTED / ACTIVE / COMPLETED / PAUSED / ENDED]

SUMMARY
[2-3 sentence summary of what happened and the result]

KEY METRICS
- Customers enrolled:           [count]
- Stamps awarded:               [count]
- Rewards redeemed:             [count]
- Incidents (P1/P2):           [count]
- Owner satisfaction:           [X] / 5
- Staff satisfaction:           [X] / 5

DECISION
[Continue / Extend / Pause / End]

NEXT ACTIONS
1. [Action item]
2. [Action item]
3. [Action item]
```

> **Do not fabricate pilot results.** If no pilot occurred, record outcome as `NOT STARTED` with an honest explanation.
