# Mail2WhatsApp AI — 24/7 Operations Runbook

## 1. Service Management (PM2 & Systemd)

```bash
# Check service status
pm2 status mail2whatsapp

# View real-time logs
pm2 logs mail2whatsapp --lines 100

# Graceful reload with zero downtime
pm2 reload mail2whatsapp

# Restart service
pm2 restart mail2whatsapp
```

## 2. Incident Playbooks

### Incident 1: WhatsApp Notifications Stopped
1. Check `/health/dependencies` to verify WhatsApp configuration status.
2. Inspect WhatsApp Outbox:
   ```bash
   sqlite3 mail2whatsapp.db "SELECT id, status, attempt_count, last_error FROM whatsapp_outbox WHERE status != 'SENT' ORDER BY created_at DESC LIMIT 10;"
   ```
3. If error contains `190` or `Session expired`, obtain a Permanent System User Token from Meta Business Manager and update `WHATSAPP_ACCESS_TOKEN` in `.env`.

### Incident 2: Gmail Sync Authorization Error (`invalid_grant`)
1. User's Google Refresh Token was revoked or expired.
2. Have user navigate to Settings in the web UI and click **Reconnect Gmail**.

## 3. Routine Maintenance
Execute daily maintenance script via cron:
```bash
# Add to crontab: Run every night at 2:00 AM UTC
0 2 * * * cd /home/ubuntu/mail2whatsapp-ai && npx tsx scripts/maintenance.ts >> /var/log/mail2whatsapp-maint.log 2>&1
```
