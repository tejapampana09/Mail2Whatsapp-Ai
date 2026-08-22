export interface WhatsAppSendResult {
  status: 'Sent' | 'Failed' | 'Disabled';
  messageId?: string;
  error?: string;
}

export interface WhatsAppErrorClassification {
  isTransient: boolean;
  code?: number;
  message: string;
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
