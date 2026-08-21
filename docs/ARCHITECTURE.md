# Mail2WhatsApp AI — Enterprise System Architecture

## 1. System Overview & Topology

Mail2WhatsApp AI is an autonomous, production-grade notification and triage gateway designed for 24/7 unattended operation with high availability and resilience.

```mermaid
flowchart TD
    subgraph Ingestion Layer
        GMAIL[Gmail API / Pub/Sub] -->|Push Notification / Polling| INBOX_SYNC[Sync Engine / server.ts]
    end

    subgraph Persistence & Concurrency
        INBOX_SYNC -->|Idempotent Event Write| DB_EVENTS[(SQLite WAL: email_events)]
        INBOX_SYNC -->|Enqueue Job| QUEUE[BullMQ / Redis / Memory Queue]
    end

    subgraph AI Intelligence Layer
        QUEUE -->|Extract & Sanitize Data| AI_SERVICE[AI Triage Engine]
        AI_SERVICE -->|Strict System Prompt| GEMINI[Google Gemini Flash API]
        AI_SERVICE -.->|Automatic Fallback| OPENROUTER[OpenRouter API]
        AI_SERVICE -.->|Deterministic Fallback| RULE_ENGINE[Heuristic Classifier]
    end

    subgraph Dispatch & Outbox
        AI_SERVICE -->|Action Required / High Priority| OUTBOX[(SQLite: whatsapp_outbox)]
        OUTBOX_WORKER[Outbox Worker] -->|Claim & Backoff Retry| OUTBOX
        OUTBOX_WORKER -->|HTTPS REST| META_API[WhatsApp Cloud API]
    end
```

## 2. Core Reliability Guarantees

### 2.1 Database Concurrency (SQLite WAL Mode)
- **WAL Mode (`PRAGMA journal_mode = WAL;`)**: Allows concurrent reads without blocking writes.
- **Busy Timeout (`PRAGMA busy_timeout = 5000;`)**: Prevents `SQLITE_BUSY` contention errors.
- **Normal Synchronous (`PRAGMA synchronous = NORMAL;`)**: Optimal balance between persistence durability and I/O performance.

### 2.2 End-to-End Idempotency
- **Ingestion Deduplication**: Deterministic compound key `gmail:{gmailAccountId}:{gmailMessageId}` in `email_events`.
- **Dispatch Deduplication**: Deterministic key `whatsapp:{userId}:{emailEventId}:{messageType}` in `whatsapp_outbox`.

### 2.3 Persistent Outbox State Machine
| State | Transition Trigger | Action |
|---|---|---|
| `PENDING` | Created or retry scheduled | Waiting for worker claim |
| `PROCESSING` | Worker claim lock | Locked for dispatch attempt |
| `SENT` | WhatsApp HTTP 200 OK | Finished successfully |
| `FAILED` | Transient network error | Increments attempt count, applies exponential backoff + jitter, returns to `PENDING` |
| `DEAD_LETTER` | 7 failed attempts or 4xx permanent error | Moved to DLQ, alerts logged |
