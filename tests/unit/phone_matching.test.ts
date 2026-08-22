import { test, describe, before } from 'node:test';
import assert from 'node:assert';
import { initDb, upsertUser, saveSettings, getUserIdByWhatsAppNumber } from '../../db';

describe('Phone Number Normalization & Anti-Wildcard Security Tests', () => {
  const user1 = 'phone_user_alpha';
  const user2 = 'phone_user_beta';

  before(async () => {
    await initDb();
    await upsertUser({
      id: user1,
      email: 'alpha@example.com',
      name: 'Alpha User',
      avatar: ''
    });
    await saveSettings(user1, {
      whatsapp_number: '+919876543210',
      whatsapp_notifications_enabled: true
    });

    await upsertUser({
      id: user2,
      email: 'beta@example.com',
      name: 'Beta User',
      avatar: ''
    });
    await saveSettings(user2, {
      whatsapp_number: '+14155552671',
      whatsapp_notifications_enabled: true
    });
  });

  test('Correctly resolves exact matching user by canonical phone number', async () => {
    const resolved1 = await getUserIdByWhatsAppNumber('+919876543210');
    assert.strictEqual(resolved1, user1);

    const resolved2 = await getUserIdByWhatsAppNumber('14155552671');
    assert.strictEqual(resolved2, user2);
  });

  test('Rejects short / incomplete phone numbers without returning arbitrary users (Anti-Wildcard)', async () => {
    // These should NOT match user1 or return ANY user
    assert.strictEqual(await getUserIdByWhatsAppNumber(''), null);
    assert.strictEqual(await getUserIdByWhatsAppNumber('   '), null);
    assert.strictEqual(await getUserIdByWhatsAppNumber('123'), null);
    assert.strictEqual(await getUserIdByWhatsAppNumber('98765'), null);
    assert.strictEqual(await getUserIdByWhatsAppNumber('++++'), null);
  });

  test('Rejects non-registered phone number', async () => {
    const unknown = await getUserIdByWhatsAppNumber('+919999999999');
    assert.strictEqual(unknown, null);
  });
});
