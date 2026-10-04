# Reployty Provider Production Setup Guide

## 1. Overview
Reployty integrates with three primary messaging providers (Phase 25) and one payment provider (Phase 15):
1. **SMS**: MSG91
2. **WhatsApp**: Meta WhatsApp Cloud API
3. **Email**: SendGrid
4. **Billing / Payments**: Stripe / Razorpay

This document explains the exact production configuration, webhook security, and onboarding requirements for each provider.

---

## 2. SMS Gateway: MSG91

### Required Environment Variables
```env
MSG91_AUTH_KEY="your_msg91_production_auth_key"
MSG91_SENDER_ID="RPLOYT" # 6-character registered DLT sender ID
MSG91_ROUTE="4" # Transactional route
```

### India DLT Compliance Requirements
* For businesses operating in India, templates and Sender IDs must be registered on the Telecom Regulatory Authority of India (TRAI) DLT portal (e.g. Jio / Airtel / Vodafone).
* Each campaign or OTP template must have an approved **DLT Template ID (PE ID & Template ID)** passed in template metadata.

### Webhook Configuration
* Webhook URL: `https://app.reployty.com/api/webhooks/messaging`
* Events: Sent, Delivered, Failed, Rejected.
* Security: Header secret comparison using timing-safe string comparison.

---

## 3. WhatsApp: Meta WhatsApp Cloud API

### Required Environment Variables
```env
WHATSAPP_PHONE_NUMBER_ID="your_meta_phone_number_id"
WHATSAPP_ACCESS_TOKEN="your_system_user_permanent_access_token"
WHATSAPP_BUSINESS_ACCOUNT_ID="your_waba_id"
WHATSAPP_WEBHOOK_VERIFY_TOKEN="your_custom_webhook_verify_token"
```

### Setup Steps
1. Create a Meta Business Manager account and register a WhatsApp Business Account (WABA).
2. Assign a dedicated phone number to the Cloud API.
3. Generate a Permanent System User Token with permissions `whatsapp_business_management` and `whatsapp_business_messaging`.
4. Configure Webhook in Meta App Dashboard:
   * Callback URL: `https://app.reployty.com/api/webhooks/messaging`
   * Verify Token: Match `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
   * Subscription Fields: `messages`.
5. Meta will send `X-Hub-Signature-256` HMAC-SHA256 headers; Reployty automatically verifies this signature before parsing payload.

---

## 4. Email: SendGrid

### Required Environment Variables
```env
SENDGRID_API_KEY="SG.your_production_api_key"
SENDGRID_FROM_EMAIL="notifications@reployty.com"
SENDGRID_FROM_NAME="Reployty"
```

### Setup Steps
1. Complete Domain Authentication in SendGrid (DKIM, SPF, CNAME records in DNS) to ensure high inbox deliverability.
2. Enable Event Webhook in SendGrid Settings:
   * HTTP POST URL: `https://app.reployty.com/api/webhooks/messaging`
   * Selected Events: Delivered, Opened, Clicked, Bounced, Dropped, Spam Report.
   * Enable Signed Event Webhook: Configure verification key in `SENDGRID_WEBHOOK_PUBLIC_KEY`.

---

## 5. Billing & Payment Gateway

### Required Environment Variables
```env
BILLING_PROVIDER="stripe" # or "razorpay"
STRIPE_SECRET_KEY="sk_live_..."
STRIPE_PUBLISHABLE_KEY="pk_live_..."
BILLING_WEBHOOK_SECRET="whsec_..."
```

### Webhook Configuration
* Endpoint: `POST https://app.reployty.com/api/billing/webhook`
* Subscribed Events:
  * `customer.subscription.created`
  * `customer.subscription.updated`
  * `customer.subscription.deleted`
  * `invoice.payment_succeeded`
  * `invoice.payment_failed`
* Verification: Verified via cryptographically secure HMAC signature.
