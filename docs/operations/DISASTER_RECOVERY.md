# Mail2WhatsApp AI — Disaster Recovery

## 1. Live SQLite Database Backup
Execute atomic live backup using SQLite VACUUM INTO or sqlite3 online backup:
```bash
sqlite3 mail2whatsapp.db ".backup 'mail2whatsapp_backup.db'"
gzip -9 mail2whatsapp_backup.db
```

## 2. Restoring from Backup
```bash
pm2 stop mail2whatsapp
gunzip -k mail2whatsapp_backup.db.gz
cp mail2whatsapp_backup.db mail2whatsapp.db
sqlite3 mail2whatsapp.db "PRAGMA integrity_check;"
pm2 start mail2whatsapp
```
