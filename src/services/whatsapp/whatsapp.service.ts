import { env } from '../../config/env.config';
import { createOutboxJob } from '../../database/db';
import { normalizeWhatsAppNumber } from '../../utils/phone';
import { sanitizeWhatsAppParam } from '../../utils/sanitization';
import { WhatsAppSendResult, WhatsAppErrorClassification } from './whatsapp.types';
import { startOutboxWorker, stopOutboxWorker, processOutboxBatch } from './outbox.worker';

export {
  normalizeWhatsAppNumber,
  sanitizeWhatsAppParam,
  startOutboxWorker,
  stopOutboxWorker,
  processOutboxBatch
};
export type {
  WhatsAppSendResult,
  WhatsAppErrorClassification
};

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
  if (env.TTS_PROVIDER === 'none' || env.WHATSAPP_VOICE_ENABLED !== 'true') {
    return { status: 'Disabled', error: 'Voice summaries are disabled or require an authenticated TTS provider.' };
  }

  return { status: 'Disabled', error: 'Enterprise TTS provider not configured.' };
}
