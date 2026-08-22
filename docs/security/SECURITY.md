# Mail2WhatsApp AI — Security Architecture

## 1. Authentication & Webhook Security
- **Google Cloud Pub/Sub Webhook**: Authenticated exclusively using Google OIDC JWT tokens. Tokens are cryptographically verified against Google's public JWKS certificates via `OAuth2Client.verifyIdToken()`, with strict checks on issuer (`accounts.google.com`), `PUBSUB_AUDIENCE`, and `PUBSUB_SERVICE_ACCOUNT`. Shared-secret bypasses are strictly prohibited.
- **WhatsApp Webhook**: Verified using Meta `X-Hub-Signature-256` HMAC-SHA256 with constant-time equality check (`crypto.timingSafeEqual`).
- **User Dashboard API**: Protected by session JWTs signed with `JWT_SECRET`.

## 2. Token & Data Encryption
- **At-Rest Encryption**: OAuth access tokens and refresh tokens are encrypted in SQLite using authenticated **`AES-256-GCM`** (`v2:<iv12>:<tag16>:<cipher>`) with `DB_ENCRYPTION_KEY`.
- **Anti-Tampering**: GCM authentication tags detect any ciphertext tampering or bit-flipping.
- **Zero Log Leakage**: Pino structured logging strictly filters out authorization headers, passwords, tokens, and encryption keys.

## 3. Input Validation & Prompt Injection Defense
- **Prompt Isolation**: Untrusted email headers and content are enclosed in `<untrusted_email_data>` XML containment blocks with explicit system instructions prohibiting command execution.
- **HTML Sanitization**: All HTML input is stripped of executable scripts, stylesheets, svgs, and iframes before processing.
- **Phone Number Matching**: Canonical phone normalizer prevents substring/wildcard matching vulnerabilities.
