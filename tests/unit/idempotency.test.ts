import { test, describe, before } from 'node:test';
import assert from 'node:assert';
import { initDb, createEmailEvent, createOutboxJob, getPendingOutboxJobs } from '../../db';

describe('Database Concurrency & Idempotency Tests', () => {
  before(async () => {
    await initDb();
  });

  test('createEmailEvent prevents duplicate ingestion of same Gmail message', async () => {
    const eventPayload = {
      userId: 'test_user_' + Date.now(),
      gmailAccountId: 'acc_primary',
      gmailMessageId: 'msg_' + Date.now(),
      from: 'sender@example.com',
      subject: 'Test Subject',
      snippet: 'Test snippet'
    };

    const first = await createEmailEvent(eventPayload);
    assert.strictEqual(first.isDuplicate, false);

    // Attempt duplicate ingestion
    const second = await createEmailEvent(eventPayload);
    assert.strictEqual(second.isDuplicate, true);
    assert.strictEqual(second.id, first.id);
  });

  test('createOutboxJob is idempotent based on deterministic idempotency_key', async () => {
    const idempotencyKey = 'whatsapp:test_user:event_' + Date.now();
    const jobPayload = {
      userId: 'test_user',
      phoneNumber: '+919876543210',
      messageType: 'SESSION_MESSAGE' as const,
      payload: { text: 'Hello' },
      idempotencyKey
    };

    const first = await createOutboxJob(jobPayload);
    assert.strictEqual(first.isDuplicate, false);

    const second = await createOutboxJob(jobPayload);
    assert.strictEqual(second.isDuplicate, true);
    assert.strictEqual(second.id, first.id);
  });
});
