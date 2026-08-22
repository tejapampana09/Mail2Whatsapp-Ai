import { test, describe } from 'node:test';
import assert from 'node:assert';
import { verifyPubSubOidcToken } from '../../services/pubsub-auth.service';

describe('Google Pub/Sub OIDC JWT Verification Security Tests', () => {
  test('Rejects missing or empty authorization header', async () => {
    const res1 = await verifyPubSubOidcToken(undefined);
    assert.strictEqual(res1.valid, false);
    assert.match(res1.error || '', /Missing Authorization header/i);

    const res2 = await verifyPubSubOidcToken('');
    assert.strictEqual(res2.valid, false);
  });

  test('Rejects non-Bearer authorization header scheme', async () => {
    const res = await verifyPubSubOidcToken('Basic dXNlcjpwYXNz');
    assert.strictEqual(res.valid, false);
    assert.match(res.error || '', /Invalid Authorization header scheme/i);
  });

  test('Rejects malformed or forged JWT string', async () => {
    const forgedToken = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.forged_signature';
    const res = await verifyPubSubOidcToken(forgedToken);
    assert.strictEqual(res.valid, false);
    assert.match(res.error || '', /verification failed/i);
  });

  test('Rejects random junk string token', async () => {
    const res = await verifyPubSubOidcToken('Bearer not_a_jwt_at_all');
    assert.strictEqual(res.valid, false);
    assert.match(res.error || '', /verification failed/i);
  });

  test('CRITICAL REGRESSION TEST: Shared-secret string token MUST NOT authenticate', async () => {
    const sharedSecret = 'mail2whatsapp_secure_webhook_token_2026';
    const res = await verifyPubSubOidcToken(`Bearer ${sharedSecret}`);
    assert.strictEqual(res.valid, false, 'Shared secret token must be strictly rejected by OIDC JWT verifier');
    assert.match(res.error || '', /verification failed/i);
  });

  test('CRITICAL REGRESSION TEST: Any arbitrary shared secret token is rejected', async () => {
    const res = await verifyPubSubOidcToken('Bearer test_pubsub_token_2026');
    assert.strictEqual(res.valid, false);
    assert.match(res.error || '', /verification failed/i);
  });
});
