import { test, describe, before } from 'node:test';
import assert from 'node:assert';
import { initDb, upsertUser, createOutboxJob, claimOutboxJob, resetStaleOutboxJobs, getDb } from '../../db';

describe('Failure Injection & Crash Recovery Tests', () => {
  const crashUserId = 'crash_tester_user';

  before(async () => {
    await initDb();
    // Ensure foreign key parent user exists in database
    await upsertUser({
      id: crashUserId,
      email: 'crash_tester@example.com',
      name: 'Crash Tester User',
      avatar: ''
    });
  });

  test('Simulate worker crash: Locked outbox jobs are automatically recovered after timeout', async () => {
    const idempotencyKey = 'whatsapp:crash_test:' + Date.now();
    const job = await createOutboxJob({
      userId: crashUserId,
      phoneNumber: '+919999999999',
      messageType: 'SESSION_MESSAGE',
      payload: { text: 'Simulated Crash' },
      idempotencyKey
    });

    // Claim the job (moves from PENDING -> PROCESSING)
    const claimed = await claimOutboxJob(job.id);
    assert.strictEqual(claimed, true);

    // Verify it is now in PROCESSING state
    const db = await getDb();
    const processingRow = db.prepare('SELECT status FROM whatsapp_outbox WHERE id = ?').get(job.id) as any;
    assert.strictEqual(processingRow.status, 'PROCESSING');

    // Simulate crash recovery: Reset stale jobs with 0ms threshold (immediate reset for test)
    const recoveredCount = await resetStaleOutboxJobs(0);
    assert.strictEqual(recoveredCount >= 1, true);

    // Verify status has reverted to PENDING for retry
    const recoveredRow = db.prepare('SELECT status FROM whatsapp_outbox WHERE id = ?').get(job.id) as any;
    assert.strictEqual(recoveredRow.status, 'PENDING');
  });
});
