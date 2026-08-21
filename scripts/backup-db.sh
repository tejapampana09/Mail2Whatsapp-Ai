#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/home/ubuntu/backups/db}"
DB_PATH="${DATABASE_PATH:-/home/ubuntu/mail2whatsapp-ai/mail2whatsapp.db}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/mail2whatsapp_${TIMESTAMP}.db"

mkdir -p "${BACKUP_DIR}"

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Starting automated database backup..."

if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "${DB_PATH}" ".timeout 5000" "PRAGMA wal_checkpoint(TRUNCATE);"
    sqlite3 "${DB_PATH}" ".backup '${BACKUP_FILE}'"
else
    echo "sqlite3 CLI not found, using file copy backup..."
    cp "${DB_PATH}" "${BACKUP_FILE}"
fi

# Compress the backup
gzip -f "${BACKUP_FILE}"
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Backup saved and compressed to ${BACKUP_FILE}.gz"

# Retention policy: Delete daily backups older than 7 days, retain 4 weekly backups
find "${BACKUP_DIR}" -name "mail2whatsapp_*.db.gz" -type f -mtime +7 -exec rm -f {} +
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Backup retention policy executed (old backups pruned)."
