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

  test('Simulate WhatsApp 429 Rate Limit: classify as transient with backoff retry', async () => {
    const { classifyWhatsAppError } = await import('../../whatsapp');
    const classified = classifyWhatsAppError(429, { message: 'Rate limit hit' });
    assert.strictEqual(classified.isTransient, true);
  });

  test('Simulate WhatsApp 500/503 Upstream Server Outage: classify as transient with retry', async () => {
    const { classifyWhatsAppError } = await import('../../whatsapp');
    const classified500 = classifyWhatsAppError(500, { message: 'Meta internal error' });
    assert.strictEqual(classified500.isTransient, true);

    const classified503 = classifyWhatsAppError(503, { message: 'Service unavailable' });
    assert.strictEqual(classified503.isTransient, true);
  });

  test('Simulate WhatsApp 401 Auth Revocation: classify as non-transient permanent failure', async () => {
    const { classifyWhatsAppError } = await import('../../whatsapp');
    const classified = classifyWhatsAppError(401, { code: 190, message: 'Invalid OAuth token' });
    assert.strictEqual(classified.isTransient, false);
  });
});
