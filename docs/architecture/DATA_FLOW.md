# Mail2WhatsApp AI — Data Flow Specification

## 1. Gmail Ingestion Flow
```text
Gmail API -> Fetch Details -> Sanitize HTML -> Parse Attachments -> email_events (DB)
```

- Raw email headers (From, Subject, Date) and snippet are extracted.
- Multi-part MIME bodies are parsed; HTML parts are stripped of `<script>`, `<style>`, `<svg>`, `<head>`, and decoded to clean text.
- Attachments are cataloged and base64 encoded if relevant for vision/document analysis.
- Inserted into `email_events` with unique constraint to prevent duplicate processing.

## 2. AI Triage Pipeline
```text
email_events -> XML Untrusted Containment -> LLM (Gemini 2.5 Flash) -> Zod Validation -> Heuristic Fallback
```

- Untrusted email body and headers are isolated within `<untrusted_email_data>` XML tags.
- Zod schema enforces output structure: category, importance (`High` | `Medium` | `Low`), summary, action items, deadline, and calendar events.
- On LLM failure or timeout (20s), secondary OpenRouter models or deterministic regex rules are executed.

## 3. WhatsApp Outbox Lifecycle
```text
PENDING -> (Claim Worker Lease) -> PROCESSING -> (Meta API Dispatch) -> SENT | PENDING (Backoff) | DEAD_LETTER
```

- `PENDING`: Waiting for worker dispatch.
- `PROCESSING`: Leased by a specific worker (`locked_by`, `lease_expires_at = now + 60s`).
- `SENT`: Successfully acknowledged with `provider_message_id`.
- `PENDING` (Retrying): On transient 429 or 5xx with jittered exponential backoff.
- `DEAD_LETTER`: On permanent failure (401 invalid token, 400 bad template) or exceeding `MAX_RETRIES` (default 6).
