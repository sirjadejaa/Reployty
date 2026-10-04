# Reployty Lead Tracker & Outreach Management Guide

## 1. Overview & Setup

To manage your client acquisition pipeline without paying for heavy sales software (like HubSpot or Salesforce), Reployty provides a clean, portable lead-tracking framework.

You can maintain this in a local Markdown file, a Google Sheet, or export it as a CSV.

---

## 2. Standard Pipeline Stages & Definitions

Every prospective business progresses through one of the following 11 mutually exclusive statuses:

| Status Code | Stage Name | When to Apply | Next Expected Action |
| :--- | :--- | :--- | :--- |
| `RESEARCHED` | Identified | Business evaluated and qualified via public channels. | Review against 7-point checklist. |
| `READY_TO_CONTACT` | Pre-Contact | Contact method and tailored message prepared. | Send first personal outreach. |
| `CONTACTED` | First Touch | Message sent (WhatsApp, IG DM, Email, or In-Person). | Wait 3–4 business days for reply. |
| `REPLIED` | In Dialogue | Owner or manager responded. | Answer questions, propose quick 10-min chat. |
| `DISCOVERY_SCHEDULED` | Discovery Set | Time confirmed to discuss current loyalty setup. | Prepare tailored discovery questions. |
| `DEMO_SCHEDULED` | Demo Booked | 10-minute product demonstration scheduled. | Reset demo database (`npm run demo:reset`). |
| `DEMO_COMPLETED` | Demo Finished | Walkthrough delivered. Feedback requested. | Send follow-up summary within 24 hours. |
| `PILOT_DISCUSSION` | Pilot Review | Owner reviewing 30-day pilot scope and terms. | Clarify onboarding and counter standee setup. |
| `PILOT_ACCEPTED` | Pilot Confirmed| Owner agreed to run a 30-day trial at 1 branch. | Execute pre-launch checklist and onboarding. |
| `NOT_INTERESTED` | Closed — Disqualified| Business declined or does not fit loyalty model. | Record reason closed. Do not contact again. |
| `FOLLOW_UP_LATER` | Nurture | Busy season, renovation, or requested later date. | Set calendar reminder for specified date. |

---

## 3. Lead Tracking Template (Markdown Table Format)

Copy and paste this table into your local tracking document or import it into your spreadsheet:

| ID | Business Name | Category | City / Area | Contact Channel | Initial Contact | Last Touch | Current Status | Next Action | Follow-Up Date | Notes & Objections | Reason Closed |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **001** | *The Daily Grind* | Café | Downtown | WhatsApp (+91...) | 2026-10-05 | 2026-10-05 | `CONTACTED` | Send polite check-in | 2026-10-09 | Uses paper punch cards today; owner on-site mornings. | — |
| **002** | *Artisan Sourdough* | Bakery | West End | In-Person visit | 2026-10-04 | 2026-10-06 | `DEMO_SCHEDULED` | Run 10-min demo | 2026-10-08 | Owner Elena agreed to see demo on Wednesday 3 PM. | — |
| **003** | *Modern Fade Barbers*| Salon | Metro North | Instagram DM | 2026-10-02 | 2026-10-04 | `NOT_INTERESTED` | None (closed) | — | Owner prefers appointments only via existing booking app. | No loyalty fit |

---

## 4. How to Update the Tracker After Every Interaction

Follow these 4 simple habits to keep your pipeline accurate:

1. **Log Immediately (2 Minutes)**:
   * Right after an in-person visit, call, or message reply, update `Last Touch` with today's date.
   * Update `Current Status` to reflect where the conversation stands.
2. **Always Define a `Next Action` & `Follow-Up Date`**:
   * Never leave a lead in `CONTACTED` or `REPLIED` without a specific next action (e.g. *"Check in if no reply"*) and an exact follow-up date (3–4 days later).
3. **Record Objections Honestly**:
   * If an owner says *"My staff won't scan codes"*, record it under `Notes`. This helps refine your demo and objection-handling script.
4. **Respect "No"**:
   * If an owner declines, immediately mark `NOT_INTERESTED` and document `Reason Closed`. Never send follow-ups to someone who has explicitly opted out.

---

## 5. CSV Export Format Specification

For easy import into spreadsheets:

```csv
id,business_name,category,city_area,contact_channel,initial_contact,last_touch,current_status,next_action,follow_up_date,notes,reason_closed
001,"The Daily Grind",CAFE,"Downtown","WhatsApp",2026-10-05,2026-10-05,CONTACTED,"Send polite check-in",2026-10-09,"Uses paper punch cards; owner on-site mornings.",""
```
