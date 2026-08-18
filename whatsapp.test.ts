import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getWhatsAppAuthFailureMessage,
  normalizeWhatsAppNumber,
  sendWhatsAppAlert,
  sendWhatsAppDigest
} from './whatsapp.ts';

test('normalizes mobile numbers correctly', () => {
  assert.equal(normalizeWhatsAppNumber('9542696946'), '+919542696946');
  assert.equal(normalizeWhatsAppNumber('00919542696946'), '+919542696946');
  assert.equal(normalizeWhatsAppNumber('+919542696946'), '+919542696946');
  assert.equal(normalizeWhatsAppNumber('99542696946'), '+99542696946');
  assert.equal(normalizeWhatsAppNumber('+91 99542696946'), '+9199542696946');
  assert.equal(normalizeWhatsAppNumber('  +1 (415) 555-0100 '), '+14155550100');
});

test('returns actionable authentication guidance for Meta auth errors', () => {
  const message = getWhatsAppAuthFailureMessage(400, { code: 190, message: 'Invalid OAuth access token.' });
  assert.match(message, /permanent access token/i);
  assert.match(message, /Business Manager/i);
});

test('returns failed status when WHATSAPP_TEMPLATE_NAME is missing', async () => {
  const originalTemplateName = process.env.WHATSAPP_TEMPLATE_NAME;
  delete process.env.WHATSAPP_TEMPLATE_NAME;

  try {
    const res = await sendWhatsAppAlert('+919542696946', {
      from: 'Test Sender',
      subject: 'Test Subject',
      category: 'Test Category',
      importance: 'High',
      summary: 'Test summary details'
    });
    assert.equal(res.status, 'Failed');
    assert.match(res.error || '', /template.*not configured/i);
  } finally {
    process.env.WHATSAPP_TEMPLATE_NAME = originalTemplateName;
  }
});

test('template alert generates proper Meta payload with 5 body parameters', async () => {
  const originalToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const originalPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const originalTemplateName = process.env.WHATSAPP_TEMPLATE_NAME;
  const originalTemplateLang = process.env.WHATSAPP_TEMPLATE_LANG;

  process.env.WHATSAPP_ACCESS_TOKEN = 'mock-token';
  process.env.WHATSAPP_PHONE_NUMBER_ID = 'mock-phone-id';
  process.env.WHATSAPP_TEMPLATE_NAME = 'email_alert';
  process.env.WHATSAPP_TEMPLATE_LANG = 'en_US';

  const originalFetch = globalThis.fetch;
  let lastFetchCall: { url: string; options: any } | null = null;
  globalThis.fetch = async (url: string | URL, options?: RequestInit) => {
    lastFetchCall = { url: String(url), options };
    return {
      ok: true,
      json: async () => ({
        messages: [{ id: 'mock-msg-id-123' }]
      })
    } as Response;
  };

  try {
    const res = await sendWhatsAppAlert('+919542696946', {
      from: 'John Doe',
      subject: 'Hello World',
      category: 'Personal',
      importance: 'High',
      summary: 'Short summary'
    });

    assert.equal(res.status, 'Sent');
    assert.equal(res.messageId, 'mock-msg-id-123');

    assert.ok(lastFetchCall);
    assert.equal(lastFetchCall.url, 'https://graph.facebook.com/v20.0/mock-phone-id/messages');
    
    const body = JSON.parse(lastFetchCall.options.body);
    assert.equal(body.type, 'template');
    assert.equal(body.template.name, 'email_alert');
    assert.equal(body.template.language.code, 'en_US');
    
    const params = body.template.components[0].parameters;
    assert.equal(params.length, 5);
    assert.equal(params[0].text, 'John Doe');
    assert.equal(params[1].text, 'Hello World');
    assert.equal(params[2].text, 'Personal');
    assert.equal(params[3].text, 'High');
    assert.equal(params[4].text, 'Short summary');
  } finally {
    globalThis.fetch = originalFetch;
    process.env.WHATSAPP_ACCESS_TOKEN = originalToken;
    process.env.WHATSAPP_PHONE_NUMBER_ID = originalPhoneId;
    process.env.WHATSAPP_TEMPLATE_NAME = originalTemplateName;
    process.env.WHATSAPP_TEMPLATE_LANG = originalTemplateLang;
  }
});

test('template digest generates proper Meta payload with 6 body parameters', async () => {
  const originalToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const originalPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const originalDigestTemplateName = process.env.WHATSAPP_DIGEST_TEMPLATE_NAME;
  const originalDigestTemplateLang = process.env.WHATSAPP_DIGEST_TEMPLATE_LANG;

  process.env.WHATSAPP_ACCESS_TOKEN = 'mock-token';
  process.env.WHATSAPP_PHONE_NUMBER_ID = 'mock-phone-id';
  process.env.WHATSAPP_DIGEST_TEMPLATE_NAME = 'daily_email_digest';
  process.env.WHATSAPP_DIGEST_TEMPLATE_LANG = 'en_US';

  const originalFetch = globalThis.fetch;
  let lastFetchCall: { url: string; options: any } | null = null;
  globalThis.fetch = async (url: string | URL, options?: RequestInit) => {
    lastFetchCall = { url: String(url), options };
    return {
      ok: true,
      json: async () => ({
        messages: [{ id: 'mock-msg-id-digest' }]
      })
    } as Response;
  };

  try {
    const res = await sendWhatsAppDigest('+919542696946', {
      total: 10,
      high: 2,
      medium: 5,
      low: 3,
      categories: { Work: 4, Finance: 6 },
      topSubjects: ['Meeting info', 'Invoice details']
    });

    assert.equal(res.status, 'Sent');
    assert.equal(res.messageId, 'mock-msg-id-digest');

    assert.ok(lastFetchCall);
    const body = JSON.parse(lastFetchCall.options.body);
    assert.equal(body.type, 'template');
    assert.equal(body.template.name, 'daily_email_digest');
    
    const params = body.template.components[0].parameters;
    assert.equal(params.length, 6);
    assert.equal(params[1].text, '10'); // total
    assert.equal(params[2].text, '2');  // high
    assert.equal(params[3].text, '5');  // medium
    assert.equal(params[4].text, '3');  // low
    assert.match(params[5].text, /Meeting info/); // top subjects
  } finally {
    globalThis.fetch = originalFetch;
    process.env.WHATSAPP_ACCESS_TOKEN = originalToken;
    process.env.WHATSAPP_PHONE_NUMBER_ID = originalPhoneId;
    process.env.WHATSAPP_DIGEST_TEMPLATE_NAME = originalDigestTemplateName;
    process.env.WHATSAPP_DIGEST_TEMPLATE_LANG = originalDigestTemplateLang;
  }
});

test('permanent Meta template error (132000) does not retry', async () => {
  const originalToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const originalPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const originalTemplateName = process.env.WHATSAPP_TEMPLATE_NAME;

  process.env.WHATSAPP_ACCESS_TOKEN = 'mock-token';
  process.env.WHATSAPP_PHONE_NUMBER_ID = 'mock-phone-id';
  process.env.WHATSAPP_TEMPLATE_NAME = 'email_alert';

  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async (url: string | URL, options?: RequestInit) => {
    fetchCount++;
    return {
      ok: false,
      status: 400,
      json: async () => ({
        error: { code: 132000, message: 'Template parameter count mismatch' }
      })
    } as Response;
  };

  try {
    const res = await sendWhatsAppAlert('+919542696946', {
      from: 'Test',
      subject: 'Test',
      category: 'Test',
      importance: 'High',
      summary: 'Test'
    });
    assert.equal(res.status, 'Failed');
    assert.equal(fetchCount, 1); // No retry
    assert.match(res.error || '', /parameter count\/type does not match/i);
  } finally {
    globalThis.fetch = originalFetch;
    process.env.WHATSAPP_ACCESS_TOKEN = originalToken;
    process.env.WHATSAPP_PHONE_NUMBER_ID = originalPhoneId;
    process.env.WHATSAPP_TEMPLATE_NAME = originalTemplateName;
  }
});

test('transient HTTP 5xx error retries once', async () => {
  const originalToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const originalPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const originalTemplateName = process.env.WHATSAPP_TEMPLATE_NAME;

  process.env.WHATSAPP_ACCESS_TOKEN = 'mock-token';
  process.env.WHATSAPP_PHONE_NUMBER_ID = 'mock-phone-id';
  process.env.WHATSAPP_TEMPLATE_NAME = 'email_alert';

  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async (url: string | URL, options?: RequestInit) => {
    fetchCount++;
    if (fetchCount === 1) {
      return {
        ok: false,
        status: 503,
        json: async () => ({ error: { message: 'Service Unavailable' } })
      } as Response;
    }
    return {
      ok: true,
      json: async () => ({ messages: [{ id: 'mock-msg-id-retry' }] })
    } as Response;
  };

  try {
    const res = await sendWhatsAppAlert('+919542696946', {
      from: 'Test',
      subject: 'Test',
      category: 'Test',
      importance: 'High',
      summary: 'Test'
    });
    assert.equal(res.status, 'Sent');
    assert.equal(res.messageId, 'mock-msg-id-retry');
    assert.equal(fetchCount, 2); // 1 initial + 1 retry
  } finally {
    globalThis.fetch = originalFetch;
    process.env.WHATSAPP_ACCESS_TOKEN = originalToken;
    process.env.WHATSAPP_PHONE_NUMBER_ID = originalPhoneId;
    process.env.WHATSAPP_TEMPLATE_NAME = originalTemplateName;
  }
});

test('missing credentials produces clear failure', async () => {
  const originalToken = process.env.WHATSAPP_ACCESS_TOKEN;
  delete process.env.WHATSAPP_ACCESS_TOKEN;

  try {
    const res = await sendWhatsAppAlert('+919542696946', {
      from: 'Test',
      subject: 'Test',
      category: 'Test',
      importance: 'High',
      summary: 'Test'
    });
    assert.equal(res.status, 'Failed');
    assert.match(res.error || '', /credentials not configured/i);
  } finally {
    process.env.WHATSAPP_ACCESS_TOKEN = originalToken;
  }
});
