# Reployty 10-Minute Client Demonstration Guide

## 1. Objective & Philosophy

This guide is designed for showing Reployty to an independent business owner, store manager, or franchisee in **10 minutes**.

**Guiding Principles**:
* Speak like a local business partner, not a software engineer.
* Avoid tech jargon (*multi-tenant, webhooks, asynchronous queues, Postgres, APIs*).
* Focus on the customer journey: How does a customer scan? How fast is checkout? How does the owner see who returned?
* Listen more than you talk: Ask open questions and observe what resonates.

---

## 2. Pre-Meeting Preparation Checklist (3 Minutes)

Run these quick checks locally before starting your call or in-person walk-through:

```bash
# 1. Reset synthetic demo data to a pristine state
npm run demo:reset

# 2. Start the local server
npm run dev
```

Prepare your presentation screen layout:
* **Left Screen (or Main Monitor)**: Business Owner & Staff Portal at `http://localhost:5173/`
  * Pre-login with Demo Café credentials: `owner.cafe@reployty.test` / `DemoPass123!`
* **Right Screen (or Mobile Preview / Phone)**: Customer PWA at `http://localhost:5173/#join/demo-cafe`
  * Tip: In Google Chrome, press `F12` or `Cmd+Option+I` and toggle Device Mode to an iPhone (390×844) for a realistic mobile presentation.

---

## 3. The 10-Minute Walkthrough Script

### Part 1: The Business Problem (1.5 Minutes)
*"Thanks for taking a few minutes to chat. Most independent business owners tell us two things:*
1. *They get lots of first-time customers, but keeping them coming back consistently is tough.*
2. *Paper stamp cards get lost at the bottom of bags or forgotten at home, and nobody wants to download another heavy mobile app just to buy a coffee or get a haircut.*

*Reployty solves this by putting a lightweight digital stamp card right in the customer's phone browser with a quick QR scan at the counter. Let me show you how simple it feels for both your customers and your staff."*

---

### Part 2: The Customer Experience (2.5 Minutes)
*Switch focus to the mobile phone view (`#join/demo-cafe`).*

1. **The Counter Scan**:
   * *"When a customer pays at your counter, they point their phone camera at a small standee with your QR code."*
   * Show the branded welcome screen. Point out that the colors and logo match your business.
2. **Fast 10-Second Joining**:
   * *"They enter their mobile number. In our live system, they get a quick 6-digit text message code. No passwords, no App Store downloads."*
   * Enter test customer phone `+1 (555) 010-0001` and click **[Auto-Fill]** to complete verification.
3. **The Digital Loyalty Pass**:
   * *"Here is what the customer sees on their phone."*
   * Point out:
     * Brand name and color theme.
     * The visual stamp card: *"Alex Rivera has 4 out of 5 stamps collected."*
     * The progress bar: *"One more visit until a Free Signature Pour-Over."*
     * The customer can save this directly as a shortcut on their phone's home screen.

---

### Part 3: The Cashier & Counter Experience (2 Minutes)
*Show the staff perspective on your main screen.*

1. **Awarding Loyalty Progress**:
   * *"When Alex makes a purchase, the cashier can award their next stamp by entering their phone number or scanning their pass."*
2. **Redeeming a Voucher**:
   * On the customer's phone, show their claimed reward voucher: `DEMO-FREE-BREW`.
   * Switch to the Owner/Staff window and open **Rewards -> Staff Terminal**.
   * Enter `DEMO-FREE-BREW` and click **[Verify Code]**.
   * *"Notice the green checkmark: the terminal verifies the reward, confirms who earned it, and shows it hasn't expired."*
   * Click **[Confirm Redemption Now]**.
   * Show that the voucher status immediately changes to **Redeemed**.
3. **Preventing Fraud**:
   * Try entering `DEMO-FREE-BREW` again.
   * Point out the clear red alert: *"Already Redeemed"*.
   * *"This completely prevents double-dipping or shared screenshot fraud across different shifts or branches."*

---

### Part 4: The Business Dashboard & Customer Insights (2 Minutes)
*Navigate to `#dashboard` and `#customers`.*

1. **Live Activity Overview**:
   * *"On your owner dashboard, you see real numbers: total customers, visits this week, active stamps, and completed rewards."*
2. **Customer CRM & Visit History**:
   * Click on **Customers** -> select **Alex Rivera**.
   * Show the timeline: *"You can see every visit, every stamp earned, and when rewards were redeemed. If a regular hasn't visited in 30 days, Reployty flags them as 'At-Risk' so you know to reach out."*

---

### Part 5: Automated Retention Workflows (1 Minute)
*Navigate to `#automations`.*

1. **Win-Back Automations**:
   * *"Instead of you having to remember to message customers manually, Reployty can send an automatic friendly reminder via SMS or WhatsApp when a regular hasn't visited for 30 days—perhaps offering a 10% perk to welcome them back."*
   * Emphasize: *"You can test and simulate all messages before anything is sent."*

---

### Part 6: Open Discussion & Discovery (1 Minute)
*Stop screen sharing or close the laptop lid slightly. Transition to an open dialogue.*

**Ask 3–4 natural questions**:
1. *"How do you currently keep track of your repeat customers or encourage them to return?"*
2. *"If you use paper punch cards today, what frustrates you most about them?"*
3. *"How do you think your counter staff would feel about verifying vouchers on a phone or tablet at the register?"*
4. *"If we ran a small 30-day trial at your main location with a simple counter standee, what would make it an absolute win for you?"*

---

## 4. Golden Rules for Demonstration Success

* **Do not rush**: If the owner stops to ask about customer phone privacy or counter speed, pause and address their specific question directly.
* **Never pretend a feature is live if it is in test mode**: If asked about live SMS messages during a local demo, explain: *"Right now in this demonstration we use a local simulator so we don't send real text messages to random numbers. During your onboarding, we connect your verified business SMS/WhatsApp sender."*
* **Keep staff workflow simple**: Business owners worry most about lines backing up at the register. Reassure them that counter checkouts take less than 5 seconds.
