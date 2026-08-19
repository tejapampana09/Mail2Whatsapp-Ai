import { google } from 'googleapis';
import dotenv from 'dotenv';
dotenv.config();

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

export function getOAuth2Client() {
  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    throw new Error('Google OAuth Client credentials not fully configured in environment variables.');
  }
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

export function getAuthUrl() {
  const oauth2Client = getOAuth2Client();
  const scopes = [
    'openid',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/calendar.events'
  ];
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // Force consent so we always get refresh token
    scope: scopes
  });
}

export async function exchangeCodeForTokens(code: string) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

export async function getUserInfo(accessToken: string) {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ access_token: accessToken });
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const response = await oauth2.userinfo.get();
  return response.data;
}

export interface GmailAttachmentDetails {
  filename: string;
  mimeType: string;
  data: string; // base64url
}

export interface GmailMessageDetails {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  body: string;
  attachments: string[];
  downloadedAttachments?: GmailAttachmentDetails[];
}

export async function fetchUnreadEmails(
  refreshToken: string,
  limit = 10
): Promise<GmailMessageDetails[]> {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  // Query: is:unread -label:SPAM -label:TRASH newer_than:1d
  const response = await gmail.users.messages.list({
    userId: 'me',
    q: 'is:unread -label:SPAM -label:TRASH newer_than:1d',
    maxResults: limit
  });

  const messages = response.data.messages || [];
  const emails: GmailMessageDetails[] = [];

  for (const msg of messages) {
    if (!msg.id) continue;
    try {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id
      });
      
      const payload = detail.data.payload;
      const headers = payload?.headers || [];
      
      const fromHeader = headers.find((h) => h.name?.toLowerCase() === 'from')?.value || 'Unknown Sender';
      const subjectHeader = headers.find((h) => h.name?.toLowerCase() === 'subject')?.value || '(No Subject)';
      const dateHeader = headers.find((h) => h.name?.toLowerCase() === 'date')?.value || new Date().toISOString();
      const snippet = detail.data.snippet || '';
      
      const body = extractBody(payload);
      const attachments = extractAttachments(payload);
      
      const downloadedAttachments: GmailAttachmentDetails[] = [];
      if (payload && payload.parts) {
        await downloadTargetAttachments(gmail, msg.id, payload.parts, downloadedAttachments);
      }
      
      emails.push({
        id: msg.id,
        from: fromHeader,
        subject: subjectHeader,
        date: dateHeader,
        snippet,
        body,
        attachments,
        downloadedAttachments
      });
    } catch (err) {
      console.error(`Failed to fetch message details for ID ${msg.id}:`, err);
    }
  }

  return emails;
}

async function downloadTargetAttachments(
  gmail: any,
  messageId: string,
  parts: any[],
  results: GmailAttachmentDetails[]
) {
  for (const part of parts) {
    if (part.filename && part.body && part.body.attachmentId) {
      const mime = part.mimeType || '';
      if (mime === 'application/pdf' || mime.startsWith('image/')) {
        try {
          const res = await gmail.users.messages.attachments.get({
            userId: 'me',
            messageId: messageId,
            id: part.body.attachmentId
          });
          if (res.data && res.data.data) {
            results.push({
              filename: part.filename,
              mimeType: mime,
              data: res.data.data
            });
          }
        } catch (err) {
          console.error(`Failed to download attachment ${part.filename} (ID: ${part.body.attachmentId}):`, err);
        }
      }
    }
    if (part.parts) {
      await downloadTargetAttachments(gmail, messageId, part.parts, results);
    }
  }
}

function extractBody(payload: any): string {
  if (!payload) return '';

  if (payload.body && payload.body.data) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
  }

  if (payload.parts) {
    return parseParts(payload.parts);
  }

  return '';
}

function parseParts(parts: any[]): string {
  const plain = parts.find((p) => p.mimeType === 'text/plain');
  if (plain && plain.body && plain.body.data) {
    return Buffer.from(plain.body.data, 'base64url').toString('utf-8');
  }

  const html = parts.find((p) => p.mimeType === 'text/html');
  if (html && html.body && html.body.data) {
    return Buffer.from(html.body.data, 'base64url').toString('utf-8');
  }

  for (const part of parts) {
    if (part.parts) {
      const res = parseParts(part.parts);
      if (res) return res;
    }
  }

  return '';
}

function extractAttachments(payload: any): string[] {
  const filenames: string[] = [];

  function traverse(parts: any[]) {
    for (const part of parts) {
      if (part.filename && part.body && part.body.attachmentId) {
        filenames.push(part.filename);
      }
      if (part.parts) {
        traverse(part.parts);
      }
    }
  }

  if (payload && payload.parts) {
    traverse(payload.parts);
  }

  return filenames;
}

export async function markEmailAsRead(refreshToken: string, id: string) {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  await gmail.users.messages.batchModify({
    userId: 'me',
    requestBody: {
      ids: [id],
      removeLabelIds: ['UNREAD']
    }
  });
}
export async function getGmailSyncStatus(refreshToken: string): Promise<boolean> {
  try {
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    await gmail.users.getProfile({ userId: 'me' });
    return true;
  } catch (err) {
    return false;
  }
}

export async function watchGmailAccount(refreshToken: string, topicName: string): Promise<any> {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const response = await gmail.users.watch({
    userId: 'me',
    requestBody: {
      labelIds: ['INBOX'],
      topicName: topicName
    }
  });
  return response.data;
}

export async function archiveEmail(refreshToken: string, id: string): Promise<void> {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  await gmail.users.messages.batchModify({
    userId: 'me',
    requestBody: {
      ids: [id],
      removeLabelIds: ['INBOX']
    }
  });
}

export async function replyToEmail(
  refreshToken: string,
  originalGmailId: string,
  replyBody: string
): Promise<any> {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  // 1. Fetch metadata of the original email
  const original = await gmail.users.messages.get({
    userId: 'me',
    id: originalGmailId,
    format: 'metadata',
    metadataHeaders: ['Message-ID', 'Subject', 'From', 'References']
  });

  const headers = original.data.payload?.headers || [];
  const messageIdHeader = headers.find(h => h.name?.toLowerCase() === 'message-id')?.value || '';
  const subjectHeader = headers.find(h => h.name?.toLowerCase() === 'subject')?.value || '';
  const fromHeader = headers.find(h => h.name?.toLowerCase() === 'from')?.value || '';
  const referencesHeader = headers.find(h => h.name?.toLowerCase() === 'references')?.value || '';
  const threadId = original.data.threadId;

  // Extract email recipient from "From: Name <email>" format
  let toRecipient = fromHeader;
  const match = fromHeader.match(/<([^>]+)>/);
  if (match) {
    toRecipient = match[1];
  }

  // 2. Build the raw MIME email
  const cleanSubject = subjectHeader.toLowerCase().startsWith('re:') ? subjectHeader : `Re: ${subjectHeader}`;
  const refs = referencesHeader ? `${referencesHeader} ${messageIdHeader}` : messageIdHeader;

  const emailLines = [
    `To: ${toRecipient}`,
    `Subject: ${cleanSubject}`,
    `In-Reply-To: ${messageIdHeader}`,
    `References: ${refs}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    replyBody
  ];

  const rawContent = emailLines.join('\r\n');
  const base64Raw = Buffer.from(rawContent)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  // 3. Send the reply using Gmail API
  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: base64Raw,
      threadId: threadId || undefined
    }
  });

  return response.data;
}

export async function createCalendarEvent(
  refreshToken: string,
  eventDetails: { title: string; start: string; end?: string }
): Promise<any> {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  // Parse start date, fallback to 1 hour event if end is missing
  const start = new Date(eventDetails.start);
  const end = eventDetails.end ? new Date(eventDetails.end) : new Date(start.getTime() + 60 * 60 * 1000);

  const response = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: eventDetails.title,
      start: {
        dateTime: start.toISOString(),
        timeZone: 'UTC'
      },
      end: {
        dateTime: end.toISOString(),
        timeZone: 'UTC'
      },
      description: 'Automatically scheduled by Mail2WhatsApp AI.'
    }
  });

  return response.data;
}
