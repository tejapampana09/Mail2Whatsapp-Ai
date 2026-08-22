export interface ProcessedEmail {
  id: string;
  gmail_message_id?: string;
  from: string;
  subject: string;
  content: string;
  summary: string;
  category: string;
  importance: 'High' | 'Medium' | 'Low' | 'Spam';
  date: string;
  whatsapp_status: 'Sent' | 'Failed' | 'Disabled';
  whatsapp_message_id?: string;
  delivery_error?: string;
  is_read: boolean;
  attachments?: { filename: string; mimeType: string; size: number }[];
  ai_metadata?: {
    actionItems?: string[];
    sentiment?: string;
    calendarEvent?: {
      title: string;
      start: string;
      end?: string;
    };
  };
}

export interface ActivityLog {
  id: string;
  time: string;
  level: 'INFO' | 'WARNING' | 'ERROR';
  type: string;
  desc: string;
}

export interface SystemSettings {
  ai_model?: string;
  ai_provider?: string;
  language?: string;
  gmail_poll_interval?: number;
  importance_threshold?: 'High' | 'Medium' | 'Low';
  ignored_categories?: string[];
  whatsapp_notifications_enabled?: boolean;
  whatsapp_number?: string;
  analyze_limit?: number;
  aiModel?: string;
  aiProvider?: string;
  gmailPollInterval?: number;
  importanceThreshold?: 'High' | 'Medium' | 'Low';
  ignoredCategories?: string[];
  whatsappNotificationsEnabled?: boolean;
  whatsappNumber?: string;
  analyzeLimit?: number;
  googleConnected?: boolean;
  whatsappConnected?: boolean;
}

export interface OutboxJob {
  id: string;
  user_id: string;
  email_event_id?: string;
  phone_number: string;
  message_type: 'TEMPLATE_NOTIFICATION' | 'SESSION_MESSAGE' | 'VOICE_SUMMARY' | 'DIGEST';
  template_name?: string;
  payload: string;
  status: 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'DEAD_LETTER' | 'CANCELLED';
  attempt_count: number;
  next_attempt_at: number;
  lease_expires_at?: number;
  locked_by?: string;
  last_error?: string;
  provider_message_id?: string;
  idempotency_key: string;
  sent_at?: string;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppSendResult {
  status: 'Sent' | 'Failed' | 'Disabled';
  messageId?: string;
  error?: string;
}
