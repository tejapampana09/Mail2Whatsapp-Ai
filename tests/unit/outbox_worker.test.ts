import { test, describe, before } from 'node:test';
import assert from 'node:assert';
import {
  initDb,
  upsertUser,
  createOutboxJob,
  claimOutboxJob,
  updateOutboxJobStatus,
  resetStaleOutboxJobs,
  requeueDeadLetterJob,
  getOutboxStats
} from '../../src/database/db';

describe('Persistent WhatsApp Outbox State Machine & Lease Claiming Tests', () => {
  before(async () => {
    await initDb();
    for (let i = 1; i <= 5; i++) {
      await upsertUser({
        id: `user_test_worker_${i}`,
        email: `worker_test_${i}@example.com`,
        name: `Worker Test User ${i}`,
        avatar: ''
      });
    }
  });

  test('createOutboxJob enqueues job with PENDING status and deterministic idempotency', async () => {
    const userId = 'user_test_worker_1';
    const idempotencyKey = 'whatsapp:test:msg_001';

    const result1 = await createOutboxJob({
      userId,
      phoneNumber: '+919876543210',
      messageType: 'SESSION_MESSAGE',
      payload: { text: { body: 'Test alert' } },
      idempotencyKey
    });

    assert.strictEqual(result1.isDuplicate, false);
    assert.ok(result1.id.startsWith('outbox_'));

    // Duplicate insert should be detected
    const result2 = await createOutboxJob({
      userId,
      phoneNumber: '+919876543210',
      messageType: 'SESSION_MESSAGE',
      payload: { text: { body: 'Test alert duplicate' } },
      idempotencyKey
    });

    assert.strictEqual(result2.isDuplicate, true);
    assert.strictEqual(result2.id, result1.id);
  });

  test('claimOutboxJob claims atomically with lease preventing dual worker execution', async () => {
    await initDb();
    const userId = 'user_test_worker_2';
    const idempotencyKey = 'whatsapp:test:msg_002';

    const { id } = await createOutboxJob({
      userId,
      phoneNumber: '+919876543210',
      messageType: 'SESSION_MESSAGE',
      payload: { text: { body: 'Concurrency lease test' } },
      idempotencyKey
    });

    // Worker 1 claims
    const worker1Claimed = await claimOutboxJob(id, 'worker_node_1', 60000);
    assert.strictEqual(worker1Claimed, true);

    // Worker 2 attempts to claim same row while lease is active
    const worker2Claimed = await claimOutboxJob(id, 'worker_node_2', 60000);
    assert.strictEqual(worker2Claimed, false);
  });

  test('resetStaleOutboxJobs recovers crashed worker leases back to PENDING', async () => {
    await initDb();
    const userId = 'user_test_worker_3';
    const idempotencyKey = 'whatsapp:test:msg_003';

    const { id } = await createOutboxJob({
      userId,
      phoneNumber: '+919876543210',
      messageType: 'SESSION_MESSAGE',
      payload: { text: { body: 'Stale recovery test' } },
      idempotencyKey
    });

    // Claim with expired lease (lease duration = -1000ms)
    await claimOutboxJob(id, 'worker_crashed', -1000);

    // Reset stale jobs
    const recovered = await resetStaleOutboxJobs(0);
    assert.ok(recovered >= 1);

    // After reset, worker 2 can claim
    const worker2Claimed = await claimOutboxJob(id, 'worker_node_2', 60000);
    assert.strictEqual(worker2Claimed, true);
  });

  test('requeueDeadLetterJob safely transitions DEAD_LETTER back to PENDING for replay', async () => {
    await initDb();
    const userId = 'user_test_worker_4';
    const idempotencyKey = 'whatsapp:test:msg_004';

    const { id } = await createOutboxJob({
      userId,
      phoneNumber: '+919876543210',
      messageType: 'SESSION_MESSAGE',
      payload: { text: { body: 'Dead letter replay test' } },
      idempotencyKey
    });

    await claimOutboxJob(id, 'worker_1', 60000);
    await updateOutboxJobStatus(id, 'DEAD_LETTER', {
      attemptCount: 6,
      lastError: 'HTTP 401: Token revoked'
    });

    const requeued = await requeueDeadLetterJob(id);
    assert.strictEqual(requeued, true);

    const stats = await getOutboxStats();
    assert.ok(stats.pending >= 1);
  });
});
