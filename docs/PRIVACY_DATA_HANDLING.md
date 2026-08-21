# Mail2WhatsApp AI — Data Privacy & Compliance

## 1. Compliance with Google API Services User Data Policy

- **Limited Use Disclosure**: Mail2WhatsApp AI's use and transfer of information received from Google APIs adheres to Google API Services User Data Policy, including the Limited Use requirements.
- **Minimal Scopes**: Only `gmail.modify` and `calendar.events` scopes are requested to triage and notify.
- **Passive Data Isolation**: Email contents are processed in memory and never used to train third-party AI models.

## 2. Meta WhatsApp Policy Compliance
- Proactive messages outside the 24-hour customer window are routed strictly via Meta-approved templates (`WHATSAPP_TEMPLATE_NAME`).
- Session messages are restricted to responses to user commands within the 24-hour interaction window.

## 3. Data Retention & Encryption
- OAuth Refresh Tokens are encrypted at rest using AES-256-CBC.
- Email events and audit logs are automatically pruned after 30 days via `scripts/maintenance.ts`.
