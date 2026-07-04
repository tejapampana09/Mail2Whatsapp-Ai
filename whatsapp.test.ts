import test from 'node:test';
import assert from 'node:assert/strict';

import { getWhatsAppAuthFailureMessage, normalizeWhatsAppNumber } from './whatsapp.ts';

test('normalizes mobile numbers to E.164 format', () => {
  assert.equal(normalizeWhatsAppNumber('99542696946'), '+99542696946');
  assert.equal(normalizeWhatsAppNumber('+91 99542696946'), '+9199542696946');
  assert.equal(normalizeWhatsAppNumber('  +1 (415) 555-0100 '), '+14155550100');
});

test('returns actionable authentication guidance for Meta auth errors', () => {
  const message = getWhatsAppAuthFailureMessage(400, { code: 190, message: 'Invalid OAuth access token.' });
  assert.match(message, /permanent access token/i);
  assert.match(message, /Business Manager/i);
});
