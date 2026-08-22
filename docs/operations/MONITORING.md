# Mail2WhatsApp AI — Monitoring & Metrics

## 1. Prometheus Metrics Endpoint
Standard Prometheus text exposition is available at `GET /metrics`:

- `mail2whatsapp_emails_received_total`: Total number of incoming emails received.
- `mail2whatsapp_emails_processed_total`: Total number of emails triaged by AI.
- `mail2whatsapp_email_failures_total`: Total email ingestion or parsing failures.
- `mail2whatsapp_outbox_pending`: Current gauge of pending WhatsApp outbox jobs.
- `mail2whatsapp_outbox_processing`: Current gauge of in-flight leased outbox jobs.
- `mail2whatsapp_outbox_dead_letter_total`: Total jobs permanently failed or dead-lettered.
- `mail2whatsapp_whatsapp_success_total`: Total WhatsApp messages delivered.
- `mail2whatsapp_whatsapp_failure_total`: Total delivery failures to Meta API.
- `mail2whatsapp_whatsapp_latency_ms`: Average delivery latency in ms.
- `mail2whatsapp_pubsub_received_total`: Total Google Pub/Sub push webhooks received.
- `mail2whatsapp_pubsub_duplicate_total`: Total duplicate Pub/Sub notifications suppressed.
- `process_uptime_seconds`: Process uptime.

## 2. Health Check Endpoints
- `GET /health/live`: Liveness probe for process uptime (returns HTTP 200).
- `GET /health/ready`: Readiness probe verifying SQLite database connectivity.
- `GET /health/dependencies`: Detailed health breakdown of DB, WhatsApp API config, AI provider, and Queues.
