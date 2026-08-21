import { test, describe } from 'node:test';
import assert from 'node:assert';
import { normalizeWhatsAppNumber, classifyWhatsAppError, buildAlertMessage } from '../../whatsapp';

describe('WhatsApp Service Unit Tests', () => {
  test('normalizeWhatsAppNumber handles 10 digit Indian numbers', () => {
    assert.strictEqual(normalizeWhatsAppNumber('9876543210'), '+919876543210');
  });

  test('normalizeWhatsAppNumber handles numbers with spaces and dashes', () => {
    assert.strictEqual(normalizeWhatsAppNumber('+1 (555) 123-4567'), '+15551234567');
  });

  test('normalizeWhatsAppNumber handles international 00 prefix', () => {
    assert.strictEqual(normalizeWhatsAppNumber('00447911123456'), '+447911123456');
  });

  test('classifyWhatsAppError correctly classifies permanent 401 auth errors', () => {
    const res = classifyWhatsAppError(401);
    assert.strictEqual(res.isTransient, false);
    assert.match(res.message, /authentication failure/i);
  });

  test('classifyWhatsAppError correctly classifies transient 429 rate limits', () => {
    const res = classifyWhatsAppError(429);
    assert.strictEqual(res.isTransient, true);
    assert.match(res.message, /rate limited/i);
  });

  test('classifyWhatsAppError correctly classifies 500 upstream server errors as transient', () => {
    const res = classifyWhatsAppError(500);
    assert.strictEqual(res.isTransient, true);
  });

  test('buildAlertMessage formats urgent notifications with alert icons', () => {
    const msg = buildAlertMessage({
      from: 'boss@company.com',
      subject: 'Urgent Server Outage',
      category: 'Work',
      importance: 'High',
      summary: 'Production server is down and needs immediate attention.'
    });

    assert.match(msg, /URGENT EMAIL ALERT/);
    assert.match(msg, /boss@company.com/);
    assert.match(msg, /Urgent Server Outage/);
  });
});
