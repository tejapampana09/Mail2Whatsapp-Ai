import { test, describe } from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';

describe('WhatsApp Webhook HMAC Signature Security Tests', () => {
  const metaSecret = 'test_meta_app_secret_2026';

  function generateSignature(payload: string, secret = metaSecret): string {
    return 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  function verifyWebhookSignature(payload: string, signature: string | undefined, secret = metaSecret): boolean {
    if (!signature || !signature.startsWith('sha256=')) return false;
    const expectedSignature = generateSignature(payload, secret);
    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (sigBuffer.length !== expectedBuffer.length) return false;
    return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  }

  test('Valid HMAC-SHA256 signature passes verification', () => {
    const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
    const sig = generateSignature(payload);
    assert.strictEqual(verifyWebhookSignature(payload, sig), true);
  });

  test('Missing signature header is rejected', () => {
    const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
    assert.strictEqual(verifyWebhookSignature(payload, undefined), false);
    assert.strictEqual(verifyWebhookSignature(payload, ''), false);
  });

  test('Invalid / forged signature is rejected (HTTP 403 simulation)', () => {
    const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
    const forgedSig = 'sha256=0000000000000000000000000000000000000000000000000000000000000000';
    assert.strictEqual(verifyWebhookSignature(payload, forgedSig), false);
  });

  test('Tampered payload with valid signature for original payload is rejected', () => {
    const originalPayload = JSON.stringify({ object: 'whatsapp_business_account', data: 'legit' });
    const tamperedPayload = JSON.stringify({ object: 'whatsapp_business_account', data: 'malicious' });
    const sig = generateSignature(originalPayload);
    assert.strictEqual(verifyWebhookSignature(tamperedPayload, sig), false);
  });

  test('Signature generated with wrong secret is rejected', () => {
    const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
    const wrongSig = generateSignature(payload, 'wrong_secret_key');
    assert.strictEqual(verifyWebhookSignature(payload, wrongSig), false);
  });
});
