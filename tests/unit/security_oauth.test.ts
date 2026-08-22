import { test, describe, before } from 'node:test';
import assert from 'node:assert';
import { initDb, upsertUser, createOAuthState, consumeOAuthState } from '../../db';

describe('OAuth Server-Side State Security Tests', () => {
  const testUserId = 'oauth_sec_user_1';

  before(async () => {
    await initDb();
    await upsertUser({
      id: testUserId,
      email: 'oauth_sec@example.com',
      name: 'OAuth Sec User',
      avatar: ''
    });
  });

  test('createOAuthState generates unique, high-entropy 64-char hex tokens', async () => {
    const token1 = await createOAuthState(testUserId, 'add_account');
    const token2 = await createOAuthState(testUserId, 'add_account');
    assert.strictEqual(token1.length, 64);
    assert.strictEqual(token2.length, 64);
    assert.notStrictEqual(token1, token2);
  });

  test('consumeOAuthState consumes valid unexpired state exactly once', async () => {
    const token = await createOAuthState(testUserId, 'add_account', 60000);
    
    // First consumption: success
    const result1 = await consumeOAuthState(token, 'add_account');
    assert.notStrictEqual(result1, null);
    assert.strictEqual(result1?.userId, testUserId);

    // Second consumption (Replay Attack): must fail
    const result2 = await consumeOAuthState(token, 'add_account');
    assert.strictEqual(result2, null);
  });

  test('consumeOAuthState rejects expired state token', async () => {
    // Create token with negative TTL (already expired)
    const token = await createOAuthState(testUserId, 'add_account', -1000);
    const result = await consumeOAuthState(token, 'add_account');
    assert.strictEqual(result, null);
  });

  test('consumeOAuthState rejects mismatched purpose', async () => {
    const token = await createOAuthState(testUserId, 'add_account', 60000);
    const result = await consumeOAuthState(token, 'different_purpose');
    assert.strictEqual(result, null);
  });

  test('consumeOAuthState rejects non-existent / forged token', async () => {
    const forgedToken = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const result = await consumeOAuthState(forgedToken, 'add_account');
    assert.strictEqual(result, null);
  });
});
