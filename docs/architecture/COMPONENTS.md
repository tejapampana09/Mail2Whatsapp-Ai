# Mail2WhatsApp AI — Component Directory & Responsibilities

| Module | Location | Responsibility |
| :--- | :--- | :--- |
| **Server** | `src/app/server.ts` | Express application bootstrap, middleware attachment, endpoint mounting, static frontend serving. |
| **Shutdown** | `src/app/shutdown.ts` | Graceful SIGTERM/SIGINT signal handling, connection draining, outbox worker stoppage. |
| **Config** | `src/config/env.config.ts` | Strict Zod environment variable parsing, validation, and typing. |
| **Constants** | `src/config/constants.ts` | Application defaults, timeouts, and batch limits. |
| **Database** | `src/database/db.ts` | SQLite connection, WAL mode, queries, migrations, and memory mock for tests. |
| **Schema** | `src/database/schema.ts` | Complete SQLite DDL table schemas and indexes. |
| **Gmail Service** | `src/services/gmail/gmail.service.ts` | Google OAuth2 client, Gmail API interaction, token management, calendar scheduling. |
| **WhatsApp Service** | `src/services/whatsapp/whatsapp.service.ts` | Alert building, template formatting, outbox job enqueuing. |
| **Outbox Worker** | `src/services/whatsapp/outbox.worker.ts` | Persistent background worker, atomic lease claiming, Meta Graph API dispatch, backoff. |
| **AI Service** | `src/services/ai/ai.service.ts` | Gemini SDK integration, OpenRouter fallback, prompt containment. |
| **Fallback Service** | `src/services/ai/fallback.service.ts` | Rule-based heuristic email classifier and triage fallback. |
| **PubSub Auth** | `src/services/pubsub/pubsub-auth.service.ts` | Cryptographic Google OIDC JWT verification using `google-auth-library`. |
| **Queue Service** | `src/services/queue/queue.service.ts` | Optional BullMQ/Redis queue connector. |
| **Metrics Service** | `src/services/metrics/metrics.service.ts` | Prometheus text exposition metrics and JSON statistics collector. |
| **Crypto Utils** | `src/utils/crypto.ts` | Authenticated AES-256-GCM encryption/decryption with CBC backward compatibility. |
| **Sanitization** | `src/utils/sanitization.ts` | HTML to plain text stripper and WhatsApp parameter sanitizer. |
| **Phone Utils** | `src/utils/phone.ts` | International and canonical phone number normalizer. |
| **Auth Middleware** | `src/middleware/auth.middleware.ts` | Session JWT validator for protected API endpoints. |
| **Rate Limiter** | `src/middleware/rate-limit.middleware.ts` | In-memory sliding-window IP rate limiter with automatic heap garbage collection. |
| **Request ID** | `src/middleware/request-id.middleware.ts` | End-to-end distributed tracing ID injector (`X-Request-Id`). |
