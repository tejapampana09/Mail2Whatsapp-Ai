# Mail2WhatsApp AI — Production Monitoring & Observability

## 1. Prometheus Metrics Dictionary

| Metric | Type | Description |
|---|---|---|
| `http_requests_total` | Counter | Total incoming HTTP requests |
| `emails_processed_total` | Counter | Total emails processed through AI triage |
| `whatsapp_sent_total` | Counter | Total WhatsApp messages dispatched |
| `whatsapp_failed_total` | Counter | Total WhatsApp delivery failures |
| `ai_requests_total` | Counter | Total AI triage requests |
| `process_uptime_seconds` | Gauge | Current process uptime in seconds |

## 2. Alert Rules & SLA Thresholds

- **WhatsApp Failure Spike**: `whatsapp_failed_total > 5 within 10m` -> Investigate Meta token expiry or phone number formatting.
- **Database Lock Contention**: Logged `SQLITE_BUSY` -> Check disk I/O and checkpoint WAL.
- **Process Memory Alert**: Memory usage > 500MB -> Trigger automatic recycling via PM2.
