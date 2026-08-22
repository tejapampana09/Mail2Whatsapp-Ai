# Mail2WhatsApp AI — Architecture Overview

## 1. System Overview
Mail2WhatsApp AI is an enterprise-grade notification gateway designed to ingest incoming emails from Gmail in real time, analyze and prioritize them using large language models (LLMs) with heuristic safety fallbacks, and reliably dispatch actionable notifications via the Meta WhatsApp Cloud API.

The system is architected for 30+ days continuous, unattended operation, surviving crashes, restarts, duplicate Gmail notifications, rate limits, and network partitions.

## 2. Core Architecture & Pipeline

```mermaid
flowchart TD
    A[Incoming Email] --> B[Gmail Service]
    B --> C[Google Cloud Pub/Sub Push]
    C --> D[POST /webhook/gmail]
    D --> E{Google OIDC JWT Valid?}
    E -- No --> F[HTTP 401 Reject]
    E -- Yes --> G[Gmail Message Ingestion & HTML Sanitization]
    G --> H[email_events SQLite Deduplication]
    H --> I[AI Triage: Gemini / OpenRouter / Fallback]
    I --> J[whatsapp_outbox: PENDING State]
    J --> K[Persistent Outbox Worker]
    K --> L[Atomic Lease Claim: locked_by + lease_expires_at]
    L --> M[Meta WhatsApp Cloud API]
    M -- 200 OK --> N[Status: SENT]
    M -- 429 / 5xx --> O[Exponential Backoff + Jitter: PENDING]
    M -- 401 / Max Retries --> P[Status: DEAD_LETTER]
    
    subgraph Asynchronous Orchestration
        Q[Redis / BullMQ Queue] -.-> K
    end
```

## 3. Data Flow
1. **Pub/Sub Notification**: Google Cloud Pub/Sub sends an HTTPS POST webhook containing `Authorization: Bearer <Google-signed OIDC JWT>`.
2. **Cryptographic Authentication**: The webhook endpoint verifies the token signature against Google's public JWKS certificates, ensuring valid issuer (`accounts.google.com`), `PUBSUB_AUDIENCE`, and `PUBSUB_SERVICE_ACCOUNT`.
3. **Gmail Ingestion**: Email payload is fetched from Gmail API, and raw HTML is sanitized to clean plaintext.
4. **Database Event Commit**: Record is inserted into `email_events` with `UNIQUE(gmail_account_id, gmail_message_id)`.
5. **AI Prioritization**: Content is enclosed inside `<untrusted_email_data>` XML containment boundaries and processed by Gemini Flash (or OpenRouter/Heuristic fallback) adhering to strict Zod schemas.
6. **Durable Outbox**: Actionable alerts are enqueued to `whatsapp_outbox` with status `PENDING` and a deterministic `idempotency_key`.
7. **Decoupled Worker Dispatch**: The background outbox worker atomically leases rows, dispatches outside DB transactions, and handles jittered exponential backoffs.

## 4. Single Source of Truth
The authoritative store for WhatsApp message delivery is the persistent SQLite `whatsapp_outbox` table in WAL mode. Redis/BullMQ acts strictly as an optional asynchronous orchestration accelerator.
