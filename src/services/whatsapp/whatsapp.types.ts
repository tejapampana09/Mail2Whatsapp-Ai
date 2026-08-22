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
