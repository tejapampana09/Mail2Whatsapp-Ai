import fs from 'fs';
import path from 'path';
import { getDb } from '../../database/db';
import logger from '../../logger.service';
import { env } from '../../config/env.config';

export interface BackupResult {
  success: boolean;
  backupPath?: string;
  sizeBytes?: number;
  error?: string;
}

const DEFAULT_BACKUP_DIR = path.resolve(process.cwd(), 'backups');
const BACKUP_RETENTION_DAYS = 7;

export async function createDatabaseBackup(customBackupDir?: string): Promise<BackupResult> {
  const backupDir = customBackupDir || DEFAULT_BACKUP_DIR;

  try {
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `mail2whatsapp_backup_${timestamp}.db`;
    const targetPath = path.join(backupDir, backupFileName);

    const db = await getDb();

    if (typeof db.backup === 'function') {
      await db.backup(targetPath);
    } else {
      // Memory fallback or direct copy
      const dbPath = env.DATABASE_PATH || 'mail2whatsapp.db';
      if (fs.existsSync(dbPath)) {
        fs.copyFileSync(dbPath, targetPath);
      } else {
        return { success: false, error: 'Database file not found for backup' };
      }
    }

    const stats = fs.statSync(targetPath);
    logger.info({
      type: 'DB_BACKUP_SUCCESS',
      description: `Automated database backup created: ${backupFileName} (${(stats.size / 1024).toFixed(1)} KB)`
    });

    // Prune backups older than retention window
    pruneOldBackups(backupDir, BACKUP_RETENTION_DAYS);

    return {
      success: true,
      backupPath: targetPath,
      sizeBytes: stats.size
    };
  } catch (err: any) {
    logger.error({
      type: 'DB_BACKUP_FAILURE',
      description: `Database backup failed: ${err.message}`
    });
    return {
      success: false,
      error: err.message
    };
  }
}

function pruneOldBackups(backupDir: string, retentionDays: number) {
  try {
    const files = fs.readdirSync(backupDir);
    const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    for (const file of files) {
      if (file.startsWith('mail2whatsapp_backup_') && file.endsWith('.db')) {
        const filePath = path.join(backupDir, file);
        const fileStats = fs.statSync(filePath);
        if (fileStats.mtimeMs < cutoffTime) {
          fs.unlinkSync(filePath);
          logger.info({
            type: 'DB_BACKUP_PRUNE',
            description: `Pruned old database backup: ${file}`
          });
        }
      }
    }
  } catch (pruneErr: any) {
    logger.warn({
      type: 'DB_BACKUP_PRUNE_WARN',
      description: `Failed to prune old backups: ${pruneErr.message}`
    });
  }
}

let backupTimer: NodeJS.Timeout | null = null;

export function startAutomatedBackupScheduler(intervalMs = 24 * 60 * 60 * 1000) {
  if (backupTimer) return;

  // Run initial backup 60 seconds after server startup
  setTimeout(() => {
    createDatabaseBackup().catch(() => {});
  }, 60 * 1000);

  backupTimer = setInterval(() => {
    createDatabaseBackup().catch(() => {});
  }, intervalMs);

  console.log('Automated Database Backup Scheduler activated (24-hour cycle, 7-day retention).');
}

export function stopAutomatedBackupScheduler() {
  if (backupTimer) {
    clearInterval(backupTimer);
    backupTimer = null;
  }
}
