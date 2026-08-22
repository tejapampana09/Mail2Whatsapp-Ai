import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

describe('Database Backup & Restore Verification Drill', () => {
  const tmpDir = path.join(process.cwd(), 'tests', 'scratch_test_db_' + Date.now());

  test('Backup drill: creates valid SQLite backup and restores with integrity verification', async () => {
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
      const DatabaseConstructor = (await import('better-sqlite3')).default;
      const originalDbPath = path.join(tmpDir, 'source.db');
      const backupDbPath = path.join(tmpDir, 'backup.db');
      const restoredDbPath = path.join(tmpDir, 'restored.db');

      // 1. Initialize source DB with sample data
      const sourceDb = new DatabaseConstructor(originalDbPath);
      sourceDb.pragma('journal_mode = WAL');
      sourceDb.exec(`
        CREATE TABLE test_records (
          id TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `);

      const sampleId = 'rec_' + crypto.randomUUID();
      sourceDb.prepare('INSERT INTO test_records VALUES (?, ?, ?)').run(sampleId, 'Verified Backup Payload', new Date().toISOString());

      // 2. Perform SQLite online backup
      await sourceDb.backup(backupDbPath);
      sourceDb.close();

      assert.strictEqual(fs.existsSync(backupDbPath), true);
      assert.strictEqual(fs.statSync(backupDbPath).size > 0, true);

      // 3. Verify integrity of backup
      const backupDb = new DatabaseConstructor(backupDbPath);
      const integrity = backupDb.pragma('integrity_check');
      assert.strictEqual(integrity[0].integrity_check, 'ok');
      backupDb.close();

      // 4. Restore: Copy backup to restored location and verify data recovery
      fs.copyFileSync(backupDbPath, restoredDbPath);
      const restoredDb = new DatabaseConstructor(restoredDbPath);
      const row: any = restoredDb.prepare('SELECT * FROM test_records WHERE id = ?').get(sampleId);

      assert.notStrictEqual(row, null);
      assert.strictEqual(row.payload, 'Verified Backup Payload');
      restoredDb.close();
    } finally {
      // Cleanup scratch directory
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (_) {}
    }
  });
});
