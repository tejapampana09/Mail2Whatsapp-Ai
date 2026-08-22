import { env } from './config/env.config';
import { metricsService } from './services/metrics.service';
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
export function sanitizeWhatsAppParam(val: string, maxLen = 300): string {
  if (!val) return '';
  return val
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, maxLen);
}

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
            { type: 'text', text: sanitizeWhatsAppParam(emailDetails.from, 60) },
            { type: 'text', text: sanitizeWhatsAppParam(emailDetails.subject, 80) },
            { type: 'text', text: sanitizeWhatsAppParam(emailDetails.category, 30) },
            { type: 'text', text: sanitizeWhatsAppParam(emailDetails.importance, 20) },
            { type: 'text', text: sanitizeWhatsAppParam(emailDetails.summary, 300) }
          ]
        }
      ]
    };
  } else {
    payload.type = 'text';
    payload.text = { preview_url: false, body: messageText };
  }

  const userId = options?.userId || 'system';
  const idempotencyKey = 'whatsapp:' + userId + ':' + (options?.emailEventId || ('manual_' + Date.now()));

  const outboxRecord = await createOutboxJob({
    userId,
    emailEventId: options?.emailEventId,
    phoneNumber: cleanNumber,
    messageType,
    templateName: templateName || undefined,
    payload,
    idempotencyKey
  });

  if (outboxRecord.isDuplicate) {
    console.log(`[WhatsApp] Event ${options?.emailEventId || 'alert'} already queued in outbox (idempotency key: ${idempotencyKey}). Duplicate suppressed.`);
    return { status: 'Sent' };
  }

  return { status: 'Sent' };
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
    ? stats.topSubjects.map((s, i) => (i + 1) + '. ' + sanitizeWhatsAppParam(s, 45)).join(' | ')
    : 'None';

  let messageType: 'TEMPLATE_NOTIFICATION' | 'SESSION_MESSAGE' | 'DIGEST' = 'DIGEST';

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

  const todayKey = new Date().toISOString().slice(0, 10);
  const idempotencyKey = 'digest:' + cleanNumber + ':' + todayKey;

  await createOutboxJob({
    userId: 'system',
    phoneNumber: cleanNumber,
    messageType,
    templateName: digestTemplateName || undefined,
    payload,
    idempotencyKey
  });

  return { status: 'Sent' };
}

export async function sendWhatsAppVoiceSummary(
  _toNumber: string,
  _summaryText: string
): Promise<WhatsAppSendResult> {
  // Unofficial translate_tts endpoint removed for privacy and security compliance.
  // Voice summary is gracefully disabled unless an enterprise authenticated TTS provider is configured.
  if (env.TTS_PROVIDER === 'none' || env.WHATSAPP_VOICE_ENABLED !== 'true') {
    return { status: 'Disabled', error: 'Voice summaries are disabled or require an authenticated TTS provider.' };
  }

  return { status: 'Disabled', error: 'Enterprise TTS provider not configured.' };
}

// ----------------------------------------------------
// Persistent Outbox Background Processing Worker
// ----------------------------------------------------
export async function processOutboxBatch(): Promise<{ processed: number; sent: number; retried: number; failed: number }> {
  await resetStaleOutboxJobs(env.WHATSAPP_STALE_TIMEOUT_MS);

  const pendingJobs = await getPendingOutboxJobs(env.WHATSAPP_BATCH_SIZE);
  let processed = 0;
  let sent = 0;
  let retried = 0;
  let failed = 0;
  const workerId = 'worker_' + process.pid + '_' + Date.now();

  for (const job of pendingJobs) {
    const claimed = await claimOutboxJob(job.id, workerId, 60000);
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

    const startTime = Date.now();
    let dispatchResult = await executeMetaGraphDispatch(payload);
    metricsService.recordLatency(Date.now() - startTime);

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
      metricsService.increment('whatsapp_sent_total');
      sent++;
    } else {
      const nextAttemptCount = job.attempt_count + 1;
      const isTransient = dispatchResult.isTransient !== false;

      if (isTransient && nextAttemptCount <= env.WHATSAPP_MAX_RETRIES) {
        // Exponential backoff with randomized jitter: delay = min(MAX_BACKOFF, BASE_BACKOFF * 2^attempt) + jitter
        const baseDelay = Math.min(15 * 60 * 1000, 5000 * Math.pow(2, nextAttemptCount - 1));
        const jitter = Math.floor(baseDelay * (0.8 + Math.random() * 0.4));
        const nextAttemptAt = Date.now() + jitter;

        await updateOutboxJobStatus(job.id, 'PENDING', {
          attemptCount: nextAttemptCount,
          nextAttemptAt,
          lastError: dispatchResult.error
        });
        metricsService.increment('whatsapp_retry_total');
        retried++;
      } else {
        await updateOutboxJobStatus(job.id, 'DEAD_LETTER', {
          attemptCount: nextAttemptCount,
          lastError: dispatchResult.error
        });
        metricsService.increment('whatsapp_failed_total');
        failed++;
      }
    }
  }

  return { processed, sent, retried, failed };
}

let outboxInterval: NodeJS.Timeout | null = null;

export function startOutboxWorker() {
  if (outboxInterval) return;
  // Startup stale recovery
  resetStaleOutboxJobs(env.WHATSAPP_STALE_TIMEOUT_MS).catch(() => {});
  
  outboxInterval = setInterval(async () => {
    try {
      await processOutboxBatch();
    } catch (err: any) {
      console.error('[Outbox Worker] Batch processing exception:', err.message);
    }
  }, env.WHATSAPP_POLL_INTERVAL_MS);
  console.log('Persistent WhatsApp Outbox Worker activated.');
}

export function stopOutboxWorker() {
  if (outboxInterval) {
    clearInterval(outboxInterval);
    outboxInterval = null;
  }
}
