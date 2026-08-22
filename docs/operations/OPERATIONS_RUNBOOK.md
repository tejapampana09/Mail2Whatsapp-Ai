# Mail2WhatsApp AI — Operations Runbook

## 1. Incident: WhatsApp Outbox Dead-Letter Replay
If Meta API experiences a prolonged outage and jobs enter `DEAD_LETTER` status:
1. Check the dead-letter count in metrics: `GET /metrics` (`mail2whatsapp_outbox_dead_letter_total`).
2. Replay specific dead-letter job via API:
   ```bash
   curl -X POST https://whatsapp2mail.duckdns.org/api/outbox/<job_id>/requeue \
     -H "Authorization: Bearer <ADMIN_SESSION_TOKEN>"
   ```

## 2. Incident: Process Crash or Container Restart
1. When the container boots, `resetStaleOutboxJobs()` executes immediately.
2. Any jobs left in `PROCESSING` state by the crashed instance are reverted to `PENDING` without losing messages.
3. Check application logs via PM2:
   ```bash
   pm2 logs mail2whatsapp --lines 50
   ```

## 3. Rotating Secrets
- **Rotating JWT_SECRET / DB_ENCRYPTION_KEY**: The encryption module includes legacy CBC backward compatibility for uninterrupted rolling migrations.
