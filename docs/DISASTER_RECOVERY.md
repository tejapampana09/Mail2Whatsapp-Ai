# Mail2WhatsApp AI — Disaster Recovery & Backup Plan

## 1. Automated Backups

Run the automated backup script:
```bash
bash scripts/backup-db.sh
```
This performs a non-blocking SQLite WAL checkpoint, creates a consistent snapshot, compresses it with gzip, and enforces a 7-day retention policy.

## 2. Point-in-Time Database Restoration

To restore from a backup archive:
```bash
bash scripts/restore-db.sh /home/ubuntu/backups/db/mail2whatsapp_20260821_120000.db.gz
```
The restoration script automatically:
1. Stops the running application.
2. Creates a safety rollback snapshot of the existing database.
3. Tests the integrity of the backup before applying (`PRAGMA integrity_check`).
4. Replaces the database and restarts the application.
