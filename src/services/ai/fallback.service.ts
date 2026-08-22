import { LLMResult } from './ai.types';

export function getFallbackAnalysis(from: string, subject: string, content: string): LLMResult {
  const lowerSubject = subject.toLowerCase();
  const lowerFrom = from.toLowerCase();
  const lowerContent = content.toLowerCase();

  let category = 'Work';
  let importance: 'High' | 'Medium' | 'Low' = 'Medium';
  const summary = content.substring(0, 150) + (content.length > 150 ? '...' : '');

  if (lowerSubject.includes('fraud') || lowerSubject.includes('blocked') || lowerSubject.includes('charge') || lowerSubject.includes('billing') || lowerSubject.includes('otp')) {
    category = 'Finance';
    importance = 'High';
  } else if (lowerSubject.includes('security') || lowerSubject.includes('alert') || lowerSubject.includes('leaked') || lowerFrom.includes('github')) {
    category = 'GitHub';
    importance = 'High';
  } else if (lowerSubject.includes('shipped') || lowerSubject.includes('order') || lowerSubject.includes('amazon')) {
    category = 'Shopping';
    importance = 'Low';
  } else if (lowerSubject.includes('meeting') || lowerSubject.includes('kickoff') || lowerSubject.includes('schedule') || lowerSubject.includes('rescheduled')) {
    category = 'Meetings';
    importance = 'High';
  } else if (lowerSubject.includes('recruiter') || lowerSubject.includes('career') || lowerSubject.includes('job opportunity') || lowerSubject.includes('hiring')) {
    category = 'Recruiters';
    importance = 'Medium';
  } else if (lowerSubject.includes('free') || lowerSubject.includes('lottery') || lowerSubject.includes('bitcoin') || lowerSubject.includes('claim') || lowerContent.includes('lottery') || lowerContent.includes('win free')) {
    category = 'Spam';
    importance = 'Low';
  } else if (lowerSubject.includes('newsletter') || lowerSubject.includes('weekly') || lowerSubject.includes('medium')) {
    category = 'Education';
    importance = 'Low';
  }

  return {
    category,
    importance,
    summary,
    aiMetadata: {
      actionRequired: category === 'Meetings' || category === 'Important' || category === 'Action Required',
      actionDetails: category === 'Meetings' ? 'Attend scheduled meeting' : null,
      deadline: null,
      classifications: category === 'Spam' ? ['Spam'] : (category === 'Meetings' ? ['Meeting'] : (category === 'Recruiters' ? ['Recruiter'] : [])),
      spamScore: category === 'Spam' ? 95 : 5,
      calendarEvent: null
    }
  };
}
