import { test, describe, before } from 'node:test';
import assert from 'node:assert';
import { initDb, upsertUser, createEmailEvent, createOutboxJob } from '../../src/database/db';

describe('Database Concurrency & Idempotency Tests', () => {
  const testUserId = 'test_user_idempotency';

  before(async () => {
    await initDb();
    // Ensure foreign key parent user exists in database
    await upsertUser({
      id: testUserId,
      email: 'test_idempotency@example.com',
      name: 'Idempotency Test User',
      avatar: ''
    });
  });

  test('createEmailEvent prevents duplicate ingestion of same Gmail message', async () => {
    const eventPayload = {
      userId: testUserId,
      gmailAccountId: 'acc_primary',
      gmailMessageId: 'msg_' + Date.now(),
      from: 'sender@example.com',
      subject: 'Test Subject',
      snippet: 'Test snippet content'
    };

    const firstResult = await createEmailEvent(eventPayload);
    assert.strictEqual(firstResult.isDuplicate, false);
    assert.ok(firstResult.id.startsWith('evt_'));

    // Attempt second ingestion with exact same Gmail message ID
    const duplicateResult = await createEmailEvent(eventPayload);
    assert.strictEqual(duplicateResult.isDuplicate, true);
    assert.strictEqual(duplicateResult.id, firstResult.id);
  });

  test('createOutboxJob is idempotent based on deterministic idempotency_key', async () => {
    const outboxPayload = {
      userId: testUserId,
      phoneNumber: '+919876543210',
      messageType: 'TEMPLATE_NOTIFICATION' as const,
      templateName: 'email_alert',
      payload: { text: 'Alert body' },
      idempotencyKey: 'whatsapp:test:alert_' + Date.now()
    };

    const firstJob = await createOutboxJob(outboxPayload);
    assert.strictEqual(firstJob.isDuplicate, false);
    assert.ok(firstJob.id.startsWith('outbox_'));

    // Second call with same idempotency key
    const duplicateJob = await createOutboxJob(outboxPayload);
    assert.strictEqual(duplicateJob.isDuplicate, true);
    assert.strictEqual(duplicateJob.id, firstJob.id);
  });
});
