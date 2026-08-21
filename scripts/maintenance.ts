import { getDb } from '../db';
import { resetStaleOutboxJobs } from '../whatsapp';

async function runMaintenance() {
  console.log('[Maintenance] Starting 30-day scheduled database maintenance task...');

  const database = await getDb();

  // 1. Recover any stale locked outbox jobs (> 5 minutes locked)
  const recoveredOutbox = await resetStaleOutboxJobs(5 * 60 * 1000);
  console.log(`[Maintenance] Recovered ${recoveredOutbox} stale outbox jobs.`);

  // 2. Prune old email events (> 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const pruneEvents = database.prepare('DELETE FROM email_events WHERE created_at < ? AND status IN ('PROCESSED', 'IGNORED', 'FAILED')');
  const pruneResult = pruneEvents.run(thirtyDaysAgo);
  console.log(`[Maintenance] Pruned ${pruneResult.changes} processed email events older than 30 days.`);

  // 3. Prune old audit terminal logs (> 30 days)
  const pruneLogs = database.prepare('DELETE FROM logs WHERE created_at < ?');
  const pruneLogsResult = pruneLogs.run(thirtyDaysAgo);
  console.log(`[Maintenance] Pruned ${pruneLogsResult.changes} system logs older than 30 days.`);

  // 4. Prune completed outbox jobs (> 14 days)
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const pruneOutbox = database.prepare('DELETE FROM whatsapp_outbox WHERE created_at < ? AND status = 'SENT'');
  const pruneOutboxResult = pruneOutbox.run(fourteenDaysAgo);
  console.log(`[Maintenance] Pruned ${pruneOutboxResult.changes} sent outbox records older than 14 days.`);

  // 5. Perform SQLite WAL Checkpoint & optimize
  database.pragma('wal_checkpoint(TRUNCATE)');
  database.pragma('optimize');
  console.log('[Maintenance] SQLite WAL Checkpoint and database optimization completed successfully.');
  
  process.exit(0);
}

runMaintenance().catch((err) => {
  console.error('[Maintenance] Maintenance task failed:', err);
  process.exit(1);
});
