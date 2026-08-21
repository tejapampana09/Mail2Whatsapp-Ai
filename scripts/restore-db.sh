#!/usr/bin/env bash
set -euo pipefail

if [ -z "${1:-}" ]; then
    echo "Usage: $0 <path_to_backup_file.db.gz>"
    exit 1
fi

BACKUP_ARCHIVE="$1"
DB_PATH="${DATABASE_PATH:-/home/ubuntu/mail2whatsapp-ai/mail2whatsapp.db}"

if [ ! -f "${BACKUP_ARCHIVE}" ]; then
    echo "Error: Backup file ${BACKUP_ARCHIVE} does not exist."
    exit 1
fi

echo "WARNING: Restoring will overwrite existing database at ${DB_PATH}."
read -p "Are you sure you want to proceed? (y/N): " CONFIRM
if [[ "${CONFIRM}" != [yY] && "${CONFIRM}" != [yY][eE][sS] ]]; then
    echo "Restore aborted by user."
    exit 0
fi

# Stop application if PM2 is running
if command -v pm2 >/dev/null 2>&1; then
    pm2 stop mail2whatsapp || true
fi

# Create a rollback safety copy of current db
if [ -f "${DB_PATH}" ]; then
    cp "${DB_PATH}" "${DB_PATH}.rollback_before_restore"
fi

TEMP_UNCOMPRESSED="/tmp/restore_temp_$$.db"
gunzip -c "${BACKUP_ARCHIVE}" > "${TEMP_UNCOMPRESSED}"

# Verify integrity of backup before replacing
if command -v sqlite3 >/dev/null 2>&1; then
    INTEGRITY_CHECK=$(sqlite3 "${TEMP_UNCOMPRESSED}" "PRAGMA integrity_check;")
    if [ "${INTEGRITY_CHECK}" != "ok" ]; then
        echo "ERROR: Backup integrity check failed: ${INTEGRITY_CHECK}"
        rm -f "${TEMP_UNCOMPRESSED}"
        exit 1
    fi
fi

mv "${TEMP_UNCOMPRESSED}" "${DB_PATH}"
rm -f "${DB_PATH}-wal" "${DB_PATH}-shm"

echo "✅ Database successfully restored from ${BACKUP_ARCHIVE}."

if command -v pm2 >/dev/null 2>&1; then
    pm2 start mail2whatsapp
fi
