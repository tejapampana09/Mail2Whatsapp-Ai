import { test, describe, before } from 'node:test';
import assert from 'node:assert';
import { initDb, upsertUser, createEmailEvent, createOutboxJob, claimOutboxJob, getDb } from '../../src/database/db';

describe('High-Concurrency Soak & 100x Duplicate-Event Deduplication Tests', () => {
  const soakUserId = 'soak_test_user_prime';

  before(async () => {
    await initDb();
    await upsertUser({
      id: soakUserId,
      email: 'soak_prime@example.com',
      name: 'Soak Prime User',
      avatar: ''
    });
  });

  test('100 duplicate email events from same Gmail ID produce exactly 1 durable event record', async () => {
    const gmailMessageId = 'gmail_msg_unique_' + Date.now();
    const eventPayload = {
      userId: soakUserId,
      gmailAccountId: 'acc_main',
      gmailMessageId,
      from: 'alerts@service.com',
      subject: 'Critical Infrastructure Alert',
      snippet: 'Server memory exceeded 95%'
    };

    // Execute 100 concurrent ingestion attempts
    const promises: Promise<{ id: string; isDuplicate: boolean }>[] = [];
    for (let i = 0; i < 100; i++) {
      promises.push(createEmailEvent(eventPayload));
    }

    const results = await Promise.all(promises);

    // Exactly 1 must be non-duplicate
    const nonDuplicates = results.filter(r => !r.isDuplicate);
    const duplicates = results.filter(r => r.isDuplicate);

    assert.strictEqual(nonDuplicates.length, 1, 'Only 1 ingestion must be flagged non-duplicate');
    assert.strictEqual(duplicates.length, 99, '99 ingestions must be flagged duplicate');

    // All must reference the exact same event ID
    const primaryId = nonDuplicates[0].id;
    for (const res of results) {
      assert.strictEqual(res.id, primaryId);
    }
  });

  test('100 concurrent duplicate WhatsApp outbox creation requests result in exactly 1 logical outbox record', async () => {
    const emailEventId = 'evt_soak_dedup_' + Date.now();
    const idempotencyKey = 'whatsapp:' + soakUserId + ':' + emailEventId;

    const jobPayload = {
      userId: soakUserId,
      emailEventId,
      phoneNumber: '+919876543210',
      messageType: 'TEMPLATE_NOTIFICATION' as const,
      payload: { template: 'alert_v1' },
      idempotencyKey
    };

    const outboxPromises: Promise<{ id: string; isDuplicate: boolean }>[] = [];
    for (let i = 0; i < 100; i++) {
      outboxPromises.push(createOutboxJob(jobPayload));
    }

    const outboxResults = await Promise.all(outboxPromises);

    const nonDuplicates = outboxResults.filter(r => !r.isDuplicate);
    const duplicates = outboxResults.filter(r => r.isDuplicate);

    assert.strictEqual(nonDuplicates.length, 1, 'Exactly 1 logical outbox record created');
    assert.strictEqual(duplicates.length, 99, '99 outbox creation calls deduplicated');

    const primaryOutboxId = nonDuplicates[0].id;
    for (const res of outboxResults) {
      assert.strictEqual(res.id, primaryOutboxId);
    }
  });

  test('Concurrent worker lease claiming on single job allows only 1 authoritative worker to dispatch', async () => {
    const emailEventId = 'evt_claim_dedup_' + Date.now();
    const idempotencyKey = 'whatsapp:' + soakUserId + ':' + emailEventId;

    const { id } = await createOutboxJob({
      userId: soakUserId,
      emailEventId,
      phoneNumber: '+919876543210',
      messageType: 'TEMPLATE_NOTIFICATION',
      payload: { template: 'alert_v1' },
      idempotencyKey
    });

    // 20 concurrent workers try to claim the same outbox job
    const claimPromises: Promise<boolean>[] = [];
    for (let i = 0; i < 20; i++) {
      claimPromises.push(claimOutboxJob(id, `worker_cluster_node_${i}`, 60000));
    }

    const claimResults = await Promise.all(claimPromises);
    const successfulClaims = claimResults.filter(c => c === true);
    assert.strictEqual(successfulClaims.length, 1, 'Only 1 worker in cluster successfully acquires the lease');
  });
});
