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

export async function sendWhatsAppAlert(
  toNumber: string,
  emailDetails: { from: string; subject: string; category: string; importance: string; summary: string }
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

  // Format alert text template beautifully
  const messageText = `📧 *New Urgent Email Alert*

*From:* ${emailDetails.from}
*Subject:* ${emailDetails.subject}
*Category:* ${emailDetails.category}
*Urgency:* ${emailDetails.importance}

*Gemini/LLM Summary:*
${emailDetails.summary}`;

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

export function checkWhatsAppConfig(): boolean {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  return !!(token && phoneId && !token.includes('replace_me') && !phoneId.includes('replace_me'));
}
