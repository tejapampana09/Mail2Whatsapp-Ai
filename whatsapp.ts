import dotenv from 'dotenv';
dotenv.config();

export interface WhatsAppSendResult {
  status: 'Sent' | 'Failed' | 'Disabled';
  messageId?: string;
  error?: string;
}

export function normalizeWhatsAppNumber(toNumber: string): string {
  const digitsAndPlus = toNumber.replace(/[^\d+]/g, '').trim();
  if (!digitsAndPlus) {
    return '';
  }

  if (digitsAndPlus.startsWith('00')) {
    return `+${digitsAndPlus.slice(2)}`;
  }

  if (!digitsAndPlus.startsWith('+') && digitsAndPlus.length > 0) {
    // If it's a 10-digit number, default to Indian country code (+91)
    if (digitsAndPlus.length === 10) {
      return `+91${digitsAndPlus}`;
    }
    return `+${digitsAndPlus.replace(/^\+/, '')}`;
  }

  return digitsAndPlus;
}

export function getWhatsAppAuthFailureMessage(statusCode: number, error?: { code?: number; message?: string }): string {
  const message = error?.message?.toLowerCase() || '';
  const isAuthError = statusCode === 401 || error?.code === 190 || message.includes('authentication error') || message.includes('invalid oauth access token');

  if (!isAuthError) {
    return error?.message || `WhatsApp API request failed with HTTP ${statusCode}.`;
  }

  return [
    'WhatsApp authentication failed with Meta. Verify that the WhatsApp Business account uses a permanent access token from Meta Business Manager, not a temporary token.',
    'Confirm that the token belongs to the same app/business portfolio as the Phone Number ID and that the WhatsApp number is connected in the Meta WhatsApp Manager.',
    'Update WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID in the backend .env file and restart the server.'
  ].join(' ');
}

function buildAlertMessage(
  emailDetails: { from: string; subject: string; category: string; importance: string; summary: string },
  aiMetadata?: any
): string {
  const importanceEmoji = emailDetails.importance === 'High' ? '🔴' : emailDetails.importance === 'Medium' ? '🟡' : '🔵';
  const importanceHeader = emailDetails.importance === 'High' ? 'URGENT EMAIL ALERT' : emailDetails.importance === 'Medium' ? 'EMAIL ALERT' : 'EMAIL NOTIFICATION';
  const divider = '━━━━━━━━━━━━━━━━━━━━━';

  // Truncate summary to 300 chars
  const summary = emailDetails.summary.length > 300
    ? emailDetails.summary.substring(0, 297) + '...'
    : emailDetails.summary;

  // Truncate subject
  const subject = emailDetails.subject.length > 80
    ? emailDetails.subject.substring(0, 77) + '...'
    : emailDetails.subject;

  // Truncate from
  const from = emailDetails.from.length > 60
    ? emailDetails.from.substring(0, 57) + '...'
    : emailDetails.from;

  let message = `${importanceEmoji} *${importanceHeader}*\n${divider}\n`;
  message += `📨 *From:* ${from}\n`;
  message += `📌 *Subject:* ${subject}\n`;
  message += `🏷️ *Category:* ${emailDetails.category}  |  ⚡ *Priority:* ${emailDetails.importance}\n`;
  message += `\n💡 *AI Summary:*\n${summary}\n`;

  // Append AI metadata if available
  if (aiMetadata) {
    if (aiMetadata.actionRequired && aiMetadata.actionDetails) {
      message += `\n⚠️ *Action Required:* ${aiMetadata.actionDetails}`;
    }
    if (aiMetadata.deadline) {
      message += `\n⏰ *Deadline:* ${aiMetadata.deadline}`;
    }
    if (aiMetadata.classifications && aiMetadata.classifications.length > 0) {
      message += `\n🔖 *Tags:* ${aiMetadata.classifications.join(' • ')}`;
    }
    if (aiMetadata.spamScore && aiMetadata.spamScore > 60) {
      message += `\n🚨 *Warning:* High spam/scam probability (${aiMetadata.spamScore}%)`;
    }
    if (aiMetadata.calendarEvent) {
      message += `\n📅 *Event:* ${aiMetadata.calendarEvent.title} — ${aiMetadata.calendarEvent.start}`;
    }
  }

  message += `\n\n${divider}\n🤖 _Powered by Mail2WhatsApp AI_`;
  return message;
}

export async function sendWhatsAppAlert(
  toNumber: string,
  emailDetails: { from: string; subject: string; category: string; importance: string; summary: string },
  aiMetadata?: any
): Promise<WhatsAppSendResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneId || token.includes('replace_me') || phoneId.includes('replace_me')) {
    console.warn('WhatsApp Cloud API credentials not configured in environment variables.');
    return {
      status: 'Failed',
      error: 'WhatsApp API credentials not configured in backend environment.'
    };
  }

  if (!toNumber) {
    return {
      status: 'Failed',
      error: 'Alert destination phone number is missing in system settings.'
    };
  }

  const cleanNumber = normalizeWhatsAppNumber(toNumber);
  if (!cleanNumber) {
    return {
      status: 'Failed',
      error: 'Alert destination phone number is invalid. Use an international format such as +15551234567.'
    };
  }

  const messageText = buildAlertMessage(emailDetails, aiMetadata);

  const url = `https://graph.facebook.com/v20.0/${phoneId}/messages`;

  const templateName = process.env.WHATSAPP_TEMPLATE_NAME;
  const templateLang = process.env.WHATSAPP_TEMPLATE_LANG || 'en';

  const payload: any = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanNumber
  };

  if (templateName) {
    payload.type = 'template';
    payload.template = {
      name: templateName,
      language: {
        code: templateLang
      },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: emailDetails.from },
            { type: 'text', text: emailDetails.subject },
            { type: 'text', text: emailDetails.category },
            { type: 'text', text: emailDetails.importance },
            { type: 'text', text: emailDetails.summary }
          ]
        }
      ]
    };
  } else {
    payload.type = 'text';
    payload.text = {
      preview_url: false,
      body: messageText
    };
  }

  const dispatchMessage = async () => {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    let resJson: any = null;
    try {
      resJson = await response.json();
    } catch {
      resJson = null;
    }

    if (!response.ok) {
      const errorPayload = resJson?.error;
      const authMessage = getWhatsAppAuthFailureMessage(response.status, errorPayload);
      throw new Error(authMessage);
    }

    return resJson;
  };

  try {
    // Attempt 1
    const resData = await dispatchMessage();
    const messageId = resData.messages?.[0]?.id;
    return {
      status: 'Sent',
      messageId
    };
  } catch (err: any) {
    console.error('WhatsApp dispatch attempt 1 failed:', err.message);

    // Retry once
    try {
      console.log('Retrying WhatsApp dispatch once...');
      const resData = await dispatchMessage();
      const messageId = resData.messages?.[0]?.id;
      return {
        status: 'Sent',
        messageId
      };
    } catch (retryErr: any) {
      console.error('WhatsApp dispatch attempt 2 (retry) failed:', retryErr.message);
      return {
        status: 'Failed',
        error: retryErr.message || 'Unknown WhatsApp API dispatch failure.'
      };
    }
  }
}

export async function sendWhatsAppDigest(
  toNumber: string,
  stats: {
    total: number;
    high: number;
    medium: number;
    low: number;
    categories: Record<string, number>;
    topSubjects: string[];
  }
): Promise<WhatsAppSendResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneId || token.includes('replace_me') || phoneId.includes('replace_me')) {
    return { status: 'Failed', error: 'WhatsApp API credentials not configured.' };
  }

  const cleanNumber = normalizeWhatsAppNumber(toNumber);
  if (!cleanNumber) return { status: 'Failed', error: 'Invalid phone number.' };

  const divider = '━━━━━━━━━━━━━━━━━━━━━';
  const now = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });

  let msg = `📊 *Daily Email Digest*\n${divider}\n`;
  msg += `📅 *${now}*\n\n`;
  msg += `📬 *Total Emails:* ${stats.total}\n`;
  msg += `🔴 High Priority: ${stats.high}\n`;
  msg += `🟡 Medium Priority: ${stats.medium}\n`;
  msg += `🔵 Low Priority: ${stats.low}\n`;

  if (Object.keys(stats.categories).length > 0) {
    msg += `\n📂 *Categories:*\n`;
    for (const [cat, count] of Object.entries(stats.categories).slice(0, 5)) {
      msg += `  • ${cat}: ${count}\n`;
    }
  }

  if (stats.topSubjects.length > 0) {
    msg += `\n📌 *Top Subjects:*\n`;
    stats.topSubjects.slice(0, 3).forEach((s, i) => {
      const truncated = s.length > 50 ? s.substring(0, 47) + '...' : s;
      msg += `  ${i + 1}. ${truncated}\n`;
    });
  }

  msg += `\n${divider}\n🤖 _Mail2WhatsApp AI Daily Digest_`;

  const url = `https://graph.facebook.com/v20.0/${phoneId}/messages`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanNumber,
        type: 'text',
        text: { preview_url: false, body: msg }
      })
    });
    const resJson: any = await response.json().catch(() => null);
    if (!response.ok) throw new Error(resJson?.error?.message || `HTTP ${response.status}`);
    return { status: 'Sent', messageId: resJson?.messages?.[0]?.id };
  } catch (err: any) {
    return { status: 'Failed', error: err.message };
  }
}

export function checkWhatsAppConfig(): boolean {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  return !!(token && phoneId && !token.includes('replace_me') && !phoneId.includes('replace_me'));
}

// ----------------------------------------------------
// Voice Summary — Free Google TTS + WhatsApp Audio Upload
// ----------------------------------------------------
export async function sendWhatsAppVoiceSummary(
  toNumber: string,
  text: string
): Promise<WhatsAppSendResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneId || token.includes('replace_me')) {
    return { status: 'Failed', error: 'WhatsApp credentials not configured.' };
  }

  const cleanNumber = normalizeWhatsAppNumber(toNumber);
  if (!cleanNumber) return { status: 'Failed', error: 'Invalid phone number.' };

  try {
    // Step 1: Generate audio via Free Google Translate TTS API (No billing, no key needed)
    const ttsText = encodeURIComponent(text.length > 200 ? text.substring(0, 197) + '...' : text);
    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en-IN&client=tw-ob&q=${ttsText}`;

    const ttsRes = await fetch(ttsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!ttsRes.ok) {
      throw new Error(`Free Google TTS returned status ${ttsRes.status}`);
    }

    const audioBuffer = Buffer.from(await ttsRes.arrayBuffer());

    // Step 2: Upload audio to WhatsApp Media API
    const uploadUrl = `https://graph.facebook.com/v20.0/${phoneId}/media`;
    const uploadFormData = new (globalThis.FormData)();
    uploadFormData.append('messaging_product', 'whatsapp');
    uploadFormData.append('type', 'audio/mpeg');
    uploadFormData.append('file', new globalThis.Blob([audioBuffer], { type: 'audio/mpeg' }), 'summary.mp3');

    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: uploadFormData
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`WhatsApp media upload failed: ${errText}`);
    }

    const uploadData: any = await uploadRes.json();
    const mediaId = uploadData?.id;
    if (!mediaId) throw new Error('No media ID returned from WhatsApp upload.');

    // Step 3: Send audio message using media_id
    const sendRes = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanNumber,
        type: 'audio',
        audio: { id: mediaId }
      })
    });

    if (!sendRes.ok) {
      const errText = await sendRes.text();
      throw new Error(`WhatsApp audio send failed: ${errText}`);
    }

    const sendData: any = await sendRes.json();
    return { status: 'Sent', messageId: sendData?.messages?.[0]?.id };
  } catch (err: any) {
    console.error('[Voice] Free Voice summary failed:', err.message);
    return { status: 'Failed', error: err.message };
  }
}
