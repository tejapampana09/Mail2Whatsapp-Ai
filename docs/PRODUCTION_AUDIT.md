# Mail2WhatsApp AI — Production Audit & Gap Analysis

**Audit Date:** August 2026  
**Auditor:** Senior SRE & Security Architecture Team  
**Scope:** Full repository audit of \Mail2WhatsApp AI\ (\server.ts\, \i.ts\, \gmail.ts\, \whatsapp.ts\, \db.ts\, \logger.service.ts\, React UI, Docker, CI/CD, and infrastructure).

---

## 1. System Overview & Current Architecture

Mail2WhatsApp AI is a self-hosted email ingestion, LLM triage, summarization, and WhatsApp routing gateway.

### High-Level Architecture Topology
\\\	ext
[ Client Browser / React SPA ]
             │
             │ HTTPS (port 443 via Caddy)
             ▼
[ Express Server (Node.js/TSX) ] ── (In-Memory Polling Daemon)
    ├── Auth Middleware (JWT)
    ├── Gmail Service (Google OAuth2 + GoogleAPIs)
    ├── AI Triage Engine (Google Gemini SDK + OpenRouter)
    ├── WhatsApp Dispatcher (Meta Graph API v20.0)
    └── Database (SQLite via better-sqlite3)
\\\

---

## 2. Component Boundaries & Code Inventory

### 2.1 Backend Core
- **\server.ts\ (46.7 KB, 1,190 lines)**: Express API routes, JWT verification, rate limiter, background polling daemon (\setInterval\), daily digest scheduler, Pub/Sub webhook (\/webhook/gmail\), WhatsApp interactive webhook (\/webhook/whatsapp\), Vite dev/prod static server.
- **\i.ts\ (14.6 KB, 389 lines)**: Gemini 2.5/3.7 integration (\@google/genai\), OpenRouter fallback, rule-based fallback heuristic classifier, JSON cleaning and extraction.
- **\gmail.ts\ (11.3 KB, 367 lines)**: Google OAuth2 token exchange, userinfo fetching, unread email listing (\is:unread -label:SPAM -label:TRASH newer_than:1d\), multi-part MIME parsing, attachment downloading, batchModify (mark as read, archive), reply drafting, Google Calendar event auto-creation.
- **\whatsapp.ts\ (14.5 KB, 416 lines)**: Meta Cloud Graph API client, template/session message builder, phone normalization, daily digest builder, voice TTS generator (Google Translate TTS -> Meta audio upload).
- **\db.ts\ (19.5 KB, 565 lines)**: SQLite store initialized via \etter-sqlite3\ (\mail2whatsapp.db\), AES-256-CBC token encryption/decryption, user/oauth/settings/email/log CRUD operations.
- **\logger.service.ts\ (1.5 KB, 72 lines)**: Pino structured logger writing simultaneously to stdout and SQLite \logs\ table.

### 2.2 Frontend (React 18 + Vite + Tailwind CSS)
- **\src/App.tsx\**: Root app coordinator, auth session token handling, periodic data fetching.
- **\src/components/Header.tsx\**: Navigation header, account switcher, user profile avatar.
- **\src/components/Dashboard.tsx\**: Triage KPI counters, category breakdown charts (Recharts), urgent email highlights.
- **\src/components/EmailHistory.tsx\**: Processed email cards, urgency badges, AI summaries, email actions (reply, archive, delete).
- **\src/components/Settings.tsx\**: AI provider configuration, prompt language, poll intervals, urgency threshold, WhatsApp recipient numbers, multi-account Gmail management.
- **\src/components/Logs.tsx\**: Audit log feed.

### 2.3 Deployment & Infrastructure
- **\Dockerfile\**: Multi-stage Alpine container (node:20-alpine).
- **\docker-compose.yml\**: Single service container with local SQLite volume mount.
- **\.github/workflows/deploy.yml\**: GitHub Actions SSH deploy running \git reset --hard\, \
pm install\, \
pm run build\, and \pm2 restart\.

---

## 3. Inventory of API Endpoints

| Method | Path | Auth Required | Description |
| :--- | :--- | :---: | :--- |
| \GET\ | \/api/handshake\ | No | Reports whether LLM, Google, WhatsApp credentials are configured |
| \GET\ | \/api/auth/google\ | No | Initiates Google OAuth consent screen redirect |
| \GET\ | \/api/auth/google/callback\ | No | Exchanges OAuth code for tokens, creates user, issues 7d JWT |
| \GET\ | \/api/auth/google/add-account\ | Yes | Initiates multi-account OAuth linking |
| \GET\ | \/api/auth/me\ | Yes | Returns authenticated user profile and Google connection status |
| \GET\ | \/api/gmail/accounts\ | Yes | Lists all connected Gmail accounts for user |
| \DELETE\ | \/api/gmail/accounts/:tokenId\ | Yes | Disconnects a secondary Gmail account |
| \GET\ | \/api/emails\ | Yes | Retrieves triage email history for user |
| \POST\ | \/api/emails/delete\ | Yes | Deletes a single email record |
| \GET\ | \/api/logs\ | Yes | Returns recent 100 execution log records |
| \POST\ | \/api/logs/clear\ | Yes | Purges audit logs |
| \GET\ | \/api/settings\ | Yes | Retrieves user triage settings and preferences |
| \POST\ | \/api/settings\ | Yes | Updates user triage preferences |
| \POST\ | \/api/sync\ | Yes | Triggers on-demand manual inbox synchronization |
| \POST\ | \/api/reset\ | Yes | Purges all emails, logs, tokens, and resets settings |
| \GET\ | \/health\ / \/api/health\ | No | Basic uptime and timestamp check |
| \GET\ | \/webhook/whatsapp\ | No | Meta Webhook challenge verification |
| \POST\ | \/webhook/whatsapp\ | No | Incoming WhatsApp interactive webhook |
| \POST\ | \/webhook/gmail\ | No | Google Cloud Pub/Sub push notification receiver |
| \GET\ | \/privacy\ | No | Static HTML Privacy Policy for Meta review |

---

## 4. Current Risks & Critical Vulnerabilities

### 4.1 Synchronous In-Process Execution (Architecture Risk: CRITICAL)
- Current sync flow is tightly coupled: \Gmail Fetch -> AI Call -> WhatsApp HTTP -> Mark Read\.
- If an AI API call hangs (30s timeout) or WhatsApp fails (429/timeout), the entire sync loop blocks, leading to socket timeouts, lost processing, and dropped emails.

### 4.2 In-Memory State & Loss on Restart (Reliability Risk: HIGH)
- \syncingUsers\ set and \lastSyncTime\ map live solely in process memory.
- If the server restarts or crashes during a sync run:
  - In-flight emails can remain in \Pending\ status indefinitely.
  - Schedulers lose their timing state.
  - Background workers cannot resume where they left off.

### 4.3 Lack of Outbox Pattern & Duplicate Dispatch Risk (Reliability Risk: HIGH)
- When WhatsApp dispatch fails or encounters a transient 5xx / 429 error, the message is not scheduled in a persistent queue with exponential backoff and jitter.
- Retries inside \server.ts\ are immediate in-memory loops. If the server terminates mid-dispatch, messages are dropped or duplicated.

### 4.4 OAuth Token Encryption Fallback Key (Security Risk: CRITICAL)
- In \db.ts\, \getEncryptionKey()\ uses a hardcoded fallback string \'default-fallback-encryption-secret-key-1234'\ if \process.env.JWT_SECRET\ is unset.
- If an admin launches in non-production or environment variables fail to load, tokens are encrypted with a public, hardcoded key.

### 4.5 In-Memory Rate Limiter on Single Server (Security Risk: MEDIUM)
- \ateLimiter\ uses an in-memory \Map\ (\ipRequestCounts\), which clears on every PM2 restart and does not scale across multiple node clusters or container replicas.

### 4.6 Missing Request ID Tracing (Observability Risk: MEDIUM)
- Logs currently lack distributed \X-Request-ID\ correlation across HTTP requests, daemon sync cycles, AI calls, and WhatsApp dispatches.

### 4.7 SQLite Concurrency & File Lock (Database Risk: MEDIUM)
- SQLite is accessed in standard rollback journal mode without explicit WAL (Write-Ahead Logging) configuration or busy timeout optimization, leading to \SQLITE_BUSY\ potential under concurrent webhook + polling load.

### 4.8 Secret Leakage in Error Responses (Security Risk: MEDIUM)
- Several endpoints return \es.status(500).json({ error: err.message })\, which can leak internal database table schemas or API credentials in production.

---

## 5. Production Gap Matrix

| Requirement Area | Current Implementation Status | Gap / Required Hardening | Severity |
| :--- | :--- | :--- | :---: |
| **Idempotency & Processing State** | Basic \mailExistsByGmailId\ check | No durable \mail_events\ table, no deterministic idempotency keys | **HIGH** |
| **Outbox & Queuing** | Synchronous inline HTTP dispatch | Needs persistent \whatsapp_outbox\ table + BullMQ/Redis worker queues | **CRITICAL** |
| **AI Reliability & Schema Validation** | Ad-hoc \JSON.parse\ + string slicing | Needs Zod schema validation, structured output repair, strict timeout bounds | **HIGH** |
| **WhatsApp Reliability & Templates** | Direct fetch with basic retry | Needs outbox state machine (\PENDING\, \PROCESSING\, \SENT\, \DEAD_LETTER\), retry backoff | **HIGH** |
| **Token Lifecycle & Reauth** | Catches errors during sync | Needs explicit \REAUTH_REQUIRED\ account status and frontend badge | **MEDIUM** |
| **Database Reliability & Maintenance** | Single \mail2whatsapp.db\ | Needs WAL mode, busy timeouts, automated backup scripts, integrity checks | **HIGH** |
| **Health Checks & Diagnostics** | Basic \/api/health\ | Needs \/health/live\, \/health/ready\, \/health/dependencies\ | **MEDIUM** |
| **Security Headers & Secrets** | Helmet enabled (CSP disabled) | Fail-fast config validation on startup, centralized config, secure sanitized errors | **HIGH** |
| **Monitoring & Alerting** | Pino logger + SQLite table | Prometheus-style metrics endpoint (\/metrics\), health monitors, alert runbooks | **MEDIUM** |

---

## 6. Phased Implementation Plan

1. **Phase 1: Audit Documentation** (Completed)
2. **Phase 2: Database Reliability & Schema Hardening**
   - SQLite WAL mode, foreign keys, busy timeout, durable tables (\mail_events\, \whatsapp_outbox\, updated \oauth_tokens\ and \sync_state\).
3. **Phase 3: Idempotency Engine**
   - Deterministic keys (\gmail:{accountId}:{msgId}\, \whatsapp:{userId}:{eventId}\, \i:{eventId}\).
4. **Phase 4: Persistent Outbox & Retry Engine**
   - Outbox table with status state machine, exponential backoff, jitter, dead-letter classification.
5. **Phase 5: Queue & Background Worker Architecture (BullMQ + Redis)**
   - Resilient queue architecture with graceful shutdown and offline fallbacks.
6. **Phase 6: Gmail Processing & Token Management**
   - Pub/Sub + Polling deduplication, token refresh with \REAUTH_REQUIRED\ state.
7. **Phase 7: AI Provider Abstraction & Zod Validation**
   - \AIProvider\ interface, Gemini/OpenRouter adapters, strict Zod schema validation & prompt injection defenses.
8. **Phase 8: WhatsApp Service Hardening**
   - Dedicated WhatsApp service, template validation, error classification (4xx/5xx).
9. **Phase 9: Security, Auth & Centralized Config**
   - Fail-fast config validation, strict JWT verification, sanitized error responses, rate-limiting.
10. **Phase 10: Structured Observability & Metrics**
    - Request ID middleware (\X-Request-ID\), Prometheus metrics, structured logs.
11. **Phase 11: Production Health Checks**
    - \/health/live\, \/health/ready\, \/health/dependencies\.
12. **Phase 12: Automated Backups & Disaster Recovery**
    - Daily backup scripts, restore verification tests, retention policies.
13. **Phase 13: Docker & Compose Hardening**
    - Production Dockerfile, multi-service Docker Compose with Redis & healthchecks.
14. **Phase 14: CI/CD Pipeline**
    - GitHub Actions automated lint, typecheck, unit/integration test, and zero-downtime deploy.
15. **Phase 15: Operations & Monitoring Runbook**
    - Complete documentation (\ARCHITECTURE.md\, \API.md\, \MONITORING.md\, \OPERATIONS_RUNBOOK.md\, \DISASTER_RECOVERY.md\, \PRIVACY_DATA_HANDLING.md\, \DEPLOYMENT.md\).
16. **Phase 16: Comprehensive Test Suite & Failure Injection**
    - Unit tests, integration tests, security tests, and reliability verification.
