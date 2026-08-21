import { env } from './config/env.config';
import {
  createOutboxJob,
  getPendingOutboxJobs,
  claimOutboxJob,
  updateOutboxJobStatus,
  resetStaleOutboxJobs
} from './db';

export interface WhatsAppSendResult {
  status: 'Sent' | 'Failed' | 'Disabled';
  messageId?: string;
  error?: string;
}

export function normalizeWhatsAppNumber(toNumber: string): string {
  const digitsAndPlus = toNumber.replace(/[^\d+]/g, '').trim();
  if (!digitsAndPlus) return '';

  if (digitsAndPlus.startsWith('00')) {
    return '+' + digitsAndPlus.slice(2);
  }

  if (!digitsAndPlus.startsWith('+') && digitsAndPlus.length > 0) {
    if (digitsAndPlus.length === 10) {
      return '+91' + digitsAndPlus;
    }
    return '+' + digitsAndPlus.replace(/^\+/, '');
  }

  return digitsAndPlus;
}

export function checkWhatsAppConfig(): boolean {
  const token = env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = env.WHATSAPP_PHONE_NUMBER_ID;
  return !!(token && phoneId && !token.includes('replace_me') && !phoneId.includes('replace_me'));
}

export function classifyWhatsAppError(statusCode: number, errorPayload?: any): { isTransient: boolean; message: string } {
  const code = errorPayload?.code;
  const rawMsg = errorPayload?.message || '';

  if (statusCode === 401 || code === 190) {
    return {
      isTransient: false,
      message: 'Meta WhatsApp authentication failure. Permanent system user token required.'
    };
  }

  if (statusCode === 400) {
    if (code === 132018) {
      return {
        isTransient: false,
        message: 'WhatsApp Template parameter mismatch (#132018). Ensure template variable counts match Meta configuration.'
      };
    }
    return {
      isTransient: false,
      message: 'WhatsApp API client error (400): ' + rawMsg
    };
  }

  if (statusCode === 403) {
    return {
      isTransient: false,
      message: 'WhatsApp API permission denied (403): ' + rawMsg
    };
  }

  if (statusCode === 429) {
    return {
      isTransient: true,
      message: 'WhatsApp API rate limited (429). Retrying with backoff...'
    };
  }

  if (statusCode >= 500 || statusCode === 408) {
    return {
      isTransient: true,
      message: 'WhatsApp upstream server error (' + statusCode + '): ' + rawMsg
    };
  }

  return {
    isTransient: true,
    message: rawMsg || ('WhatsApp request failed with status ' + statusCode)
  };
}

export function buildAlertMessage(
  emailDetails: { from: string; subject: string; category: string; importance: string; summary: string },
  aiMetadata?: any
): string {
  const importanceEmoji = emailDetails.importance === 'High' ? '🔴' : emailDetails.importance === 'Medium' ? '🟡' : '🔵';
  const importanceHeader = emailDetails.importance === 'High' ? 'URGENT EMAIL ALERT' : emailDetails.importance === 'Medium' ? 'EMAIL ALERT' : 'EMAIL NOTIFICATION';
  const divider = '━━━━━━━━━━━━━━━━━━━━━';

  const summary = emailDetails.summary.length > 300
    ? emailDetails.summary.substring(0, 297) + '...'
    : emailDetails.summary;

  const subject = emailDetails.subject.length > 80
    ? emailDetails.subject.substring(0, 77) + '...'
    : emailDetails.subject;

  const from = emailDetails.from.length > 60
    ? emailDetails.from.substring(0, 57) + '...'
    : emailDetails.from;

  let message = importanceEmoji + ' *' + importanceHeader + '*\n' + divider + '\n';
  message += '📨 *From:* ' + from + '\n';
  message += '📌 *Subject:* ' + subject + '\n';
  message += '🏷️ *Category:* ' + emailDetails.category + '  |  ⚡ *Priority:* ' + emailDetails.importance + '\n';
  message += '\n💡 *AI Summary:*\n' + summary + '\n';

  if (aiMetadata) {
    if (aiMetadata.actionRequired && aiMetadata.actionDetails) {
      message += '\n⚠️ *Action Required:* ' + aiMetadata.actionDetails;
    }
    if (aiMetadata.deadline) {
      message += '\n⏰ *Deadline:* ' + aiMetadata.deadline;
    }
    if (aiMetadata.classifications && aiMetadata.classifications.length > 0) {
      message += '\n🔖 *Tags:* ' + aiMetadata.classifications.join(' • ');
    }
    if (aiMetadata.spamScore && aiMetadata.spamScore > 60) {
      message += '\n🚨 *Warning:* High spam/scam probability (' + aiMetadata.spamScore + '%)';
    }
    if (aiMetadata.calendarEvent) {
      message += '\n📅 *Event:* ' + aiMetadata.calendarEvent.title + ' — ' + aiMetadata.calendarEvent.start;
    }
  }

  message += '\n\n' + divider + '\n🤖 _Powered by Mail2WhatsApp AI_';
  return message;
}

// ----------------------------------------------------
// Direct Meta Cloud API Dispatcher
// ----------------------------------------------------
async function executeMetaGraphDispatch(payload: any): Promise<{ success: boolean; messageId?: string; error?: string; isTransient?: boolean }> {
  const token = env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneId) {
    return { success: false, error: 'WhatsApp credentials missing in environment.', isTransient: false };
  }

  const url = 'https://graph.facebook.com/v20.0/' + phoneId + '/messages';

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000)
    });

    let resJson: any = null;
    try {
      resJson = await res.json();
    } catch {
      resJson = null;
    }

    if (!res.ok) {
      const classified = classifyWhatsAppError(res.status, resJson?.error);
      return {
        success: false,
        error: classified.message,
        isTransient: classified.isTransient
      };
    }

    const messageId = resJson?.messages?.[0]?.id;
    return { success: true, messageId };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'WhatsApp network timeout',
      isTransient: true
    };
  }
}

// ----------------------------------------------------
// Outbox Enqueuing & Direct Immediate Dispatch
// ----------------------------------------------------
export async function sendWhatsAppAlert(
  toNumber: string,
  emailDetails: { from: string; subject: string; category: string; importance: string; summary: string },
  aiMetadata?: any,
  options?: { userId?: string; emailEventId?: string }
): Promise<WhatsAppSendResult> {
  if (!checkWhatsAppConfig()) {
    return { status: 'Disabled', error: 'WhatsApp credentials not configured.' };
  }

  const cleanNumber = normalizeWhatsAppNumber(toNumber);
  if (!cleanNumber) {
    return { status: 'Failed', error: 'Invalid phone number format.' };
  }

  const templateName = env.WHATSAPP_TEMPLATE_NAME;
  const templateLang = env.WHATSAPP_TEMPLATE_LANG || 'en';
  const messageText = buildAlertMessage(emailDetails, aiMetadata);

  let payload: any = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanNumber
  };

  let messageType: 'TEMPLATE_NOTIFICATION' | 'SESSION_MESSAGE' = 'SESSION_MESSAGE';

  if (templateName) {
    messageType = 'TEMPLATE_NOTIFICATION';
    payload.type = 'template';
    payload.template = {
      name: templateName,
      language: { code: templateLang },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: emailDetails.from.substring(0, 60) },
            { type: 'text', text: emailDetails.subject.substring(0, 80) },
            { type: 'text', text: emailDetails.category },
            { type: 'text', text: emailDetails.importance },
            { type: 'text', text: emailDetails.summary.substring(0, 300) }
          ]
        }
      ]
    };
  } else {
    payload.type = 'text';
    payload.text = { preview_url: false, body: messageText };
  }

  const idempotencyKey = 'whatsapp:' + (options?.userId || 'system') + ':' + (options?.emailEventId || Date.now());

  if (options?.userId) {
    await createOutboxJob({
      userId: options.userId,
      emailEventId: options.emailEventId,
      phoneNumber: cleanNumber,
      messageType,
      templateName: templateName || undefined,
      payload,
      idempotencyKey
    });
  }

  let result = await executeMetaGraphDispatch(payload);
  
  // If template fails due to parameter count mismatch (#132018) or not found (#132001), automatically fallback to rich text
  if (!result.success && templateName && (result.error?.includes('132018') || result.error?.includes('132001') || result.error?.includes('template') || result.error?.includes('Template'))) {
    console.warn(`[WhatsApp] Template "${templateName}" failed (${result.error}). Attempting automatic rich text fallback...`);
    const fallbackPayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanNumber,
      type: 'text',
      text: { preview_url: false, body: messageText }
    };
    const fallbackResult = await executeMetaGraphDispatch(fallbackPayload);
    if (fallbackResult.success) {
      return { status: 'Sent', messageId: fallbackResult.messageId };
    }
  }

  if (result.success) {
    return { status: 'Sent', messageId: result.messageId };
  }

  return { status: 'Failed', error: result.error };
}

export async function sendWhatsAppDigest(
  toNumber: string,
  stats: { total: number; high: number; medium: number; low: number; categories: Record<string, number>; topSubjects: string[] }
): Promise<WhatsAppSendResult> {
  if (!checkWhatsAppConfig()) {
    return { status: 'Disabled', error: 'WhatsApp credentials not configured.' };
  }

  const cleanNumber = normalizeWhatsAppNumber(toNumber);
  if (!cleanNumber) return { status: 'Failed', error: 'Invalid phone number.' };

  const digestTemplateName = env.WHATSAPP_DIGEST_TEMPLATE_NAME;
  const digestTemplateLang = env.WHATSAPP_DIGEST_TEMPLATE_LANG || 'en';

  let payload: any = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanNumber
  };

  const top3Str = stats.topSubjects.length > 0
    ? stats.topSubjects.map((s, i) => (i + 1) + '. ' + s.substring(0, 45)).join(' | ')
    : 'None';

  if (digestTemplateName) {
    payload.type = 'template';
    payload.template = {
      name: digestTemplateName,
      language: { code: digestTemplateLang },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: String(stats.total) },
            { type: 'text', text: String(stats.high) },
            { type: 'text', text: String(stats.medium) },
            { type: 'text', text: String(stats.low) },
            { type: 'text', text: top3Str }
          ]
        }
      ]
    };
  } else {
    let body = '📊 *Daily Email Briefing*\n━━━━━━━━━━━━━━━━━━━━━\n';
    body += '📬 *Total Processed:* ' + stats.total + '\n';
    body += '🔴 *Urgent:* ' + stats.high + '  |  🟡 *Important:* ' + stats.medium + '  |  🔵 *Routine:* ' + stats.low + '\n\n';
    if (stats.topSubjects.length > 0) {
      body += '⚡ *Top Priority Emails:*\n';
      stats.topSubjects.forEach((s, idx) => {
        body += (idx + 1) + '. ' + s + '\n';
      });
    }
    body += '\n━━━━━━━━━━━━━━━━━━━━━\n🤖 _Mail2WhatsApp AI Enterprise_';
    payload.type = 'text';
    payload.text = { preview_url: false, body };
  }

  const result = await executeMetaGraphDispatch(payload);
  if (result.success) return { status: 'Sent', messageId: result.messageId };
  return { status: 'Failed', error: result.error };
}

export async function sendWhatsAppVoiceSummary(
  toNumber: string,
  summaryText: string
): Promise<WhatsAppSendResult> {
  if (!checkWhatsAppConfig()) return { status: 'Disabled', error: 'WhatsApp not configured.' };
  const cleanNumber = normalizeWhatsAppNumber(toNumber);
  if (!cleanNumber) return { status: 'Failed', error: 'Invalid number.' };

  const token = env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = env.WHATSAPP_PHONE_NUMBER_ID;

  try {
    const ttsUrl = 'https://translate.google.com/translate_tts?ie=UTF-8&q=' + encodeURIComponent(summaryText.substring(0, 180)) + '&tl=en&client=tw-ob';
    const ttsRes = await fetch(ttsUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000)
    });

    if (!ttsRes.ok) throw new Error('TTS fetch failed with HTTP ' + ttsRes.status);
    const audioBuffer = await ttsRes.arrayBuffer();

    const form = new FormData();
    form.append('file', new Blob([audioBuffer], { type: 'audio/mpeg' }), 'summary.mp3');
    form.append('type', 'audio/mpeg');
    form.append('messaging_product', 'whatsapp');

    const uploadRes = await fetch('https://graph.facebook.com/v20.0/' + phoneId + '/media', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: form,
      signal: AbortSignal.timeout(15000)
    });

    if (!uploadRes.ok) throw new Error('Media upload failed: ' + (await uploadRes.text()));
    const uploadData = await uploadRes.json();
    const mediaId = uploadData.id;

    const audioPayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanNumber,
      type: 'audio',
      audio: { id: mediaId }
    };

    const sendRes = await executeMetaGraphDispatch(audioPayload);
    if (sendRes.success) return { status: 'Sent', messageId: sendRes.messageId };
    return { status: 'Failed', error: sendRes.error };
  } catch (err: any) {
    return { status: 'Failed', error: err.message };
  }
}

// ----------------------------------------------------
// Persistent Outbox Background Processing Worker
// ----------------------------------------------------
const RETRY_BACKOFF_DELAYS = [
  5 * 1000,        // Attempt 1: 5s
  15 * 1000,       // Attempt 2: 15s
  30 * 1000,       // Attempt 3: 30s
  60 * 1000,       // Attempt 4: 1m
  5 * 60 * 1000,   // Attempt 5: 5m
  15 * 60 * 1000   // Attempt 6: 15m
];

export async function processOutboxBatch(): Promise<{ processed: number; sent: number; retried: number; failed: number }> {
  await resetStaleOutboxJobs(3 * 60 * 1000);

  const pendingJobs = await getPendingOutboxJobs(10);
  let processed = 0;
  let sent = 0;
  let retried = 0;
  let failed = 0;

  for (const job of pendingJobs) {
    const claimed = await claimOutboxJob(job.id);
    if (!claimed) continue;

    processed++;
    let payload: any = null;
    try {
      payload = JSON.parse(job.payload);
    } catch {
      await updateOutboxJobStatus(job.id, 'DEAD_LETTER', { lastError: 'Malformed payload JSON' });
      failed++;
      continue;
    }

    let dispatchResult = await executeMetaGraphDispatch(payload);

    if (!dispatchResult.success && payload.type === 'template' && (dispatchResult.error?.includes('132018') || dispatchResult.error?.includes('132001'))) {
      const fallbackText = payload.template?.components?.[0]?.parameters?.[4]?.text || 'Urgent Email Notification';
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: job.phone_number,
        type: 'text',
        text: { preview_url: false, body: `📬 *Email Alert*\n━━━━━━━━━━━━━━━\n${fallbackText}\n━━━━━━━━━━━━━━━\n🤖 _Mail2WhatsApp AI_` }
      };
      dispatchResult = await executeMetaGraphDispatch(payload);
    }

    if (dispatchResult.success) {
      await updateOutboxJobStatus(job.id, 'SENT', {
        providerMessageId: dispatchResult.messageId
      });
      sent++;
    } else {
      const nextAttemptCount = job.attempt_count + 1;
      const isTransient = dispatchResult.isTransient !== false;

      if (isTransient && nextAttemptCount <= RETRY_BACKOFF_DELAYS.length) {
        const baseDelay = RETRY_BACKOFF_DELAYS[nextAttemptCount - 1] || 15 * 60 * 1000;
        const jitter = Math.floor(baseDelay * (0.8 + Math.random() * 0.4));
        const nextAttemptAt = Date.now() + jitter;

        await updateOutboxJobStatus(job.id, 'PENDING', {
          attemptCount: nextAttemptCount,
          nextAttemptAt,
          lastError: dispatchResult.error
        });
        retried++;
      } else {
        await updateOutboxJobStatus(job.id, 'DEAD_LETTER', {
          attemptCount: nextAttemptCount,
          lastError: dispatchResult.error
        });
        failed++;
      }
    }
  }

  return { processed, sent, retried, failed };
}

let outboxInterval: NodeJS.Timeout | null = null;

export function startOutboxWorker() {
  if (outboxInterval) return;
  outboxInterval = setInterval(async () => {
    try {
      await processOutboxBatch();
    } catch (err: any) {
      console.error('[Outbox Worker] Batch processing exception:', err.message);
    }
  }, 15000);
  console.log('Persistent WhatsApp Outbox Worker activated.');
}

export function stopOutboxWorker() {
  if (outboxInterval) {
    clearInterval(outboxInterval);
    outboxInterval = null;
  }
}
