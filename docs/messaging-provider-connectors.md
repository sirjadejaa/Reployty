# External Messaging Provider Connectors (Phase 25)

## 1. Overview & Unified Abstraction Architecture

Reployty routes customer communications across three external production delivery channels:
- **SMS:** MSG91 Flow API (India DLT Compliant & International E.164)
- **WhatsApp:** Meta WhatsApp Cloud API v21.0 (Template-driven, WABA)
- **Email:** SendGrid v3 Mail Send API (Verified Sender & Transactional Delivery)

To prevent tight coupling and preserve strict multi-tenant isolation, all provider dispatching flows through a unified abstraction layer:

```text
CampaignDelivery / AutomationExecution / RetentionTrigger
   │
   ▼
[ messagingProviderService ]
   │── Multi-tenant Config Resolution (`BusinessMessagingConfig`)
   │── Consent Gating (CHANNEL_OPT_OUT / CONSENT_NOT_GRANTED / CONSENT_REVOKED)
   │── Rate Limiting (Leaky Bucket per Tenant/Channel)
   │── Delivery Idempotency Guard (SENT / DELIVERED check)
   ▼
[ IMessagingProvider Interface ]
   │
   ├── [ Msg91Provider ] ──────────► MSG91 Flow API (DLT / SMS)
   ├── [ MetaWhatsAppProvider ] ───► Meta Cloud API v21.0 (Templates)
   └── [ SendGridProvider ] ───────► SendGrid v3 Mail Send API (Email)
   │
   ▼
Provider Webhooks (`/api/webhooks/*`)
   │── Signature Verification (HMAC-SHA256 for Meta)
   │── Webhook Rate Limiting (`webhookRateLimiter`)
   │── Idempotent Event Deduplication (`ProviderDeliveryEvent.idempotencyKey`)
   └── Status Transition (`SENT` -> `DELIVERED` / `FAILED`)
```

---

## 2. Channel Adapters & Requirements

### 2.1 SMS Connector: MSG91 Flow API
- **Endpoint:** `POST https://control.msg91.com/api/v5/flow/`
- **Phone Normalization:**
  - 10-digit Indian numbers (`9876543210`) automatically normalize to `+919876543210`.
  - Leading zeros stripped (`09876543210` -> `+919876543210`).
  - Standard E.164 formatting enforced.
- **DLT Compliance:**
  - Mandatory Sender ID (6 characters) and DLT Template Flow ID.
  - Template variable substitution maps dynamically to template tokens.
- **Error Classification:**
  - `400`, `401`, `422`, `404`: Classified as `PERMANENT` (fails immediately without wasted retries).
  - `429`, `500`, `502`, `503`, `504`: Classified as `TRANSIENT` (eligible for queue retry with exponential backoff).

### 2.2 WhatsApp Connector: Meta Cloud API v21.0
- **Endpoint:** `POST https://graph.facebook.com/v21.0/{phoneNumberId}/messages`
- **Authentication:** Bearer token via System User or App Access Token.
- **Message Format:** Strictly template-based (`type: "template"`) for business-initiated conversations outside 24h service windows.
- **Webhook Handshake & Verification:**
  - `GET /api/webhooks/whatsapp`: Validates `hub.mode === 'subscribe'` and verifies `hub.verify_token`.
  - `POST /api/webhooks/whatsapp`: Verifies `X-Hub-Signature-256` header against `sha256(payload, appSecret)`.
- **Status Mapping:**
  - Ingests `sent`, `delivered`, `read`, and `failed` delivery receipts.

### 2.3 Email Connector: SendGrid v3 Mail Send API
- **Endpoint:** `POST https://api.sendgrid.com/v3/mail/send`
- **Authentication:** Bearer token (`SG.xxxx`).
- **Sender Validation:** Strictly requires validated Sender Email address and optional Display Name.
- **Message Tracking:**
  - Tracks SendGrid `X-Message-Id` header returned in 202 Accepted responses.
- **Webhook Event Ingestion:**
  - `POST /api/webhooks/sendgrid`: Ingests batched event arrays (`delivered`, `bounce`, `dropped`, `spamreport`).

---

## 3. Security, Tenant Isolation & Secret Protection

1. **Zero Plaintext Secrets:**
   - Provider API keys and authentication tokens are masked in all client-facing read APIs:
     ```json
     {
       "apiKey": "••••••••••••1234",
       "isConfigured": true,
       "isEnabled": true
     }
     ```
   - If an update payload passes a masked secret back (`••••••••••••1234`), the service preserves the existing encrypted credential without overwriting.
2. **Tenant Scoping & Multi-Tenancy:**
   - Every lookup query filters by `businessId`.
   - Deliveries for Business A can never use or read credentials configured by Business B.
3. **SSRF Mitigation:**
   - All provider API base URLs are hardcoded constants server-side. No customer-supplied or dynamic hostnames are contacted.
4. **RBAC Authorization:**
   - Messaging configuration and testing endpoints are restricted to `OWNER` and `MANAGER` roles with `SETTINGS_MANAGE` permission. `STAFF` requests return `403 Forbidden`. Unauthenticated requests return `401 Unauthorized`.

---

## 4. Idempotency & Webhook Deduplication

- **Pre-Send Dispatch Idempotency:**
  - Before contacting external provider APIs, `dispatchDeliveryToProvider` checks if the delivery is already `SENT` or `DELIVERED`. If so, it returns immediately without re-dispatching.
- **Atomic Database Webhook Deduplication:**
  - Each incoming status update generates a deterministic idempotency key:
    ```text
    {provider}:{providerMessageId}:{status}:{timestamp}
    ```
  - The `ProviderDeliveryEvent` table enforces a unique constraint on `idempotencyKey`. Duplicate webhook deliveries fail cleanly at the database layer and return `200 OK` to external providers without double-counting status changes.

---

## 5. Environment Variables & Setup Guide

Add the following environment variables to your deployment environment (optional platform defaults):

```bash
# Global fallback/platform messaging credentials (optional)
MSG91_AUTH_KEY="your-msg91-auth-key"
MSG91_SENDER_ID="RPLOYT"

META_WHATSAPP_ACCESS_TOKEN="EAA..."
META_WHATSAPP_PHONE_NUMBER_ID="1000123456789"
META_WHATSAPP_WEBHOOK_VERIFY_TOKEN="your_secure_verify_token"
META_WHATSAPP_APP_SECRET="your_meta_app_secret"

SENDGRID_API_KEY="SG.xxxx"
SENDGRID_FROM_EMAIL="notifications@reployty.com"
SENDGRID_FROM_NAME="Reployty"
```
