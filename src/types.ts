export type EmailCategory =
  | 'Finance'
  | 'Work'
  | 'Personal'
  | 'Shopping'
  | 'Education'
  | 'GitHub'
  | 'Spam'
  | 'Promotion'
  | 'Important'
  | 'Action Required'
  | 'Meetings'
  | 'Recruiters';

export type ImportanceLevel = 'High' | 'Medium' | 'Low';

export interface ProcessedEmail {
  id: string;
  from: string;
  subject: string;
  content: string;
  summary: string;
  category: EmailCategory;
  importance: ImportanceLevel;
  date: string;
  whatsappStatus: 'Sent' | 'Failed' | 'Disabled' | 'Pending';
  isRead: boolean;
  attachments?: string[];
}

export interface ActivityLog {
  id: string;
  time: string;
  level: 'INFO' | 'WARNING' | 'ERROR';
  type: string;
  desc: string;
}

export interface SystemSettings {
  aiModel: string;
  aiProvider: string;
  language: string;
  gmailPollInterval: number;
  importanceThreshold: ImportanceLevel;
  ignoredCategories: string[];
  whatsappNotificationsEnabled: boolean;
  whatsappNumber: string;
  analyzeLimit: number;
  googleConnected?: boolean;
  whatsappConnected?: boolean;
}

export interface DashboardStats {
  totalProcessed: number;
  highImportanceCount: number;
  recentActivity: Array<{ id: string; time: string; type: string; desc: string }>;
}
