import Database from 'better-sqlite3';
import crypto from 'crypto';

let db: Database.Database | null = null;

const ENCRYPTION_ALGORITHM = 'aes-256-cbc';

function getEncryptionKey(): Buffer {
  const secret = process.env.JWT_SECRET || 'default-fallback-encryption-secret-key-1234';
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptText(text: string): string {
  if (!text) return '';
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, getEncryptionKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

export function decryptText(encryptedText: string): string {
  if (!encryptedText) return '';
  try {
    const parts = encryptedText.split(':');
    if (parts.length < 2) return '';
    const iv = Buffer.from(parts.shift()!, 'hex');
    const encrypted = parts.join(':');
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, getEncryptionKey(), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('Failed to decrypt token:', err);
    return '';
  }
}

export async function initDb(): Promise<Database.Database> {
  if (db) return db;

  db = new Database('mail2whatsapp.db');

  // Create Users Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      avatar TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Create OAuth Tokens Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS oauth_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expiry_date INTEGER,
      scope TEXT,
      token_type TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      gmail_email TEXT,
      UNIQUE(user_id, provider, gmail_email),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Partial unique index required for ON CONFLICT(user_id, provider) WHERE gmail_email IS NULL
  // SQLite treats NULLs as distinct in UNIQUE constraints, so a regular UNIQUE(user_id, provider, gmail_email)
  // won't enforce uniqueness when gmail_email IS NULL — this index fixes that.
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_tokens_primary
    ON oauth_tokens(user_id, provider)
    WHERE gmail_email IS NULL
  `);

  // Create Settings Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      user_id TEXT PRIMARY KEY,
      ai_model TEXT NOT NULL,
      ai_provider TEXT NOT NULL,
      language TEXT NOT NULL,
      gmail_poll_interval INTEGER NOT NULL,
      importance_threshold TEXT NOT NULL,
      ignored_categories TEXT NOT NULL,
      whatsapp_notifications_enabled INTEGER NOT NULL,
      whatsapp_number TEXT NOT NULL,
      analyze_limit INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Create Summary History Table (Emails)
  db.exec(`
    CREATE TABLE IF NOT EXISTS emails (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      gmail_message_id TEXT,
      from_address TEXT NOT NULL,
      subject TEXT NOT NULL,
      content TEXT NOT NULL,
      summary TEXT NOT NULL,
      category TEXT NOT NULL,
      importance TEXT NOT NULL,
      date TEXT NOT NULL,
      whatsapp_status TEXT NOT NULL, -- 'Sent' | 'Failed' | 'Disabled' | 'Pending'
      whatsapp_message_id TEXT,
      delivery_error TEXT,
      is_read INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      attachments TEXT,
      ai_metadata TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Create Execution Logs Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      time TEXT NOT NULL,
      level TEXT NOT NULL, -- 'INFO' | 'WARNING' | 'ERROR'
      type TEXT NOT NULL,
      desc TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  return db;
}

export async function getDb(): Promise<Database.Database> {
  if (!db) {
    return await initDb();
  }
  return db;
}

// Users DB Methods
export async function getUser(id: string) {
  const database = await getDb();
  const stmt = database.prepare('SELECT * FROM users WHERE id = ?');
  return stmt.get(id) as any;
}

export async function getUserByEmail(email: string) {
  const database = await getDb();
  const stmt = database.prepare('SELECT * FROM users WHERE email = ?');
  return stmt.get(email) as any;
}

export async function upsertUser(user: { id: string; email: string; name: string; avatar: string }) {
  const database = await getDb();
  const now = new Date().toISOString();
  const stmt = database.prepare(
    `INSERT INTO users (id, email, name, avatar, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       email = excluded.email,
       name = excluded.name,
       avatar = excluded.avatar,
       updated_at = excluded.updated_at`
  );
  stmt.run(user.id, user.email, user.name, user.avatar, now, now);
  return await getUser(user.id);
}

// OAuth Tokens DB Methods
export async function getOAuthToken(userId: string, provider = 'google') {
  const database = await getDb();
  const stmt = database.prepare(
    'SELECT * FROM oauth_tokens WHERE user_id = ? AND provider = ? AND gmail_email IS NULL'
  );
  const token: any = stmt.get(userId, provider);
  if (token && token.refresh_token) {
    token.refresh_token = decryptText(token.refresh_token);
  }
  return token;
}

export async function saveOAuthToken(token: {
  userId: string;
  provider: string;
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
  scope?: string;
  token_type?: string;
}) {
  const database = await getDb();
  const now = new Date().toISOString();
  const tokenId = 'tok_' + Math.random().toString(36).substring(2, 11);
  const encryptedRefresh = token.refresh_token ? encryptText(token.refresh_token) : null;

  const stmt = database.prepare(
    `INSERT INTO oauth_tokens (id, user_id, provider, access_token, refresh_token, expiry_date, scope, token_type, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, provider) WHERE gmail_email IS NULL DO UPDATE SET
       access_token = excluded.access_token,
       refresh_token = COALESCE(excluded.refresh_token, oauth_tokens.refresh_token),
       expiry_date = excluded.expiry_date,
       scope = excluded.scope,
       token_type = excluded.token_type,
       updated_at = excluded.updated_at`
  );

  stmt.run(
    tokenId,
    token.userId,
    token.provider,
    token.access_token,
    encryptedRefresh,
    token.expiry_date || null,
    token.scope || null,
    token.token_type || null,
    now,
    now,
  );
}

export async function deleteOAuthToken(userId: string, provider = 'google') {
  const database = await getDb();
  const stmt = database.prepare('DELETE FROM oauth_tokens WHERE user_id = ? AND provider = ?');
  stmt.run(userId, provider);
}

// Get all Google OAuth tokens for a user (multi-account)
export async function getAllGoogleTokens(userId: string) {
  const database = await getDb();
  const stmt = database.prepare(
    'SELECT * FROM oauth_tokens WHERE user_id = ? AND provider = ? ORDER BY created_at ASC'
  );
  const rows: any[] = stmt.all(userId, 'google');
  return rows.map(r => ({
    id: r.id,
    gmailEmail: r.gmail_email || null,
    refreshToken: r.refresh_token ? decryptText(r.refresh_token) : null,
    accessToken: r.access_token,
    createdAt: r.created_at
  }));
}

// Save additional Gmail account token (multi-account)
export async function saveGoogleAccountToken(token: {
  userId: string;
  provider: string;
  gmailEmail: string;
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
  scope?: string;
  token_type?: string;
}) {
  const database = await getDb();
  const now = new Date().toISOString();
  const tokenId = 'tok_' + Math.random().toString(36).substring(2, 11);
  const encryptedRefresh = token.refresh_token ? encryptText(token.refresh_token) : null;

  const stmt = database.prepare(
    `INSERT INTO oauth_tokens (id, user_id, provider, gmail_email, access_token, refresh_token, expiry_date, scope, token_type, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, provider, gmail_email) DO UPDATE SET
        access_token = excluded.access_token,
        refresh_token = COALESCE(excluded.refresh_token, oauth_tokens.refresh_token),
        expiry_date = excluded.expiry_date,
        updated_at = excluded.updated_at`
  );
  stmt.run(
    tokenId,
    token.userId,
    token.provider,
    token.gmailEmail,
    token.access_token,
    encryptedRefresh,
    token.expiry_date || null,
    token.scope || null,
    token.token_type || null,
    now,
    now
  );
}

// Delete a specific Gmail account token by its row id
export async function deleteGoogleAccountToken(userId: string, tokenId: string) {
  const database = await getDb();
  const stmt = database.prepare(
    'DELETE FROM oauth_tokens WHERE id = ? AND user_id = ?'
  );
  stmt.run(tokenId, userId);
}

// Settings DB Methods
export async function getSettings(userId: string) {
  const database = await getDb();
  const stmt = database.prepare('SELECT * FROM settings WHERE user_id = ?');
  const settings: any = stmt.get(userId);
  if (settings) {
    settings.ignored_categories = JSON.parse(settings.ignored_categories);
    settings.whatsapp_notifications_enabled = settings.whatsapp_notifications_enabled === 1;
  }
  return settings;
}

export async function saveSettings(userId: string, settings: {
  ai_model?: string;
  ai_provider?: string;
  language?: string;
  gmail_poll_interval?: number;
  importance_threshold?: string;
  ignored_categories?: string[];
  whatsapp_notifications_enabled?: boolean;
  whatsapp_number?: string;
  analyze_limit?: number;
}) {
  const database = await getDb();
  const now = new Date().toISOString();

  const stmt = database.prepare(
    `INSERT INTO settings (user_id, ai_model, ai_provider, language, gmail_poll_interval, importance_threshold, ignored_categories, whatsapp_notifications_enabled, whatsapp_number, analyze_limit, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
        ai_model = COALESCE(excluded.ai_model, settings.ai_model),
        ai_provider = COALESCE(excluded.ai_provider, settings.ai_provider),
        language = COALESCE(excluded.language, settings.language),
        gmail_poll_interval = COALESCE(excluded.gmail_poll_interval, settings.gmail_poll_interval),
        importance_threshold = COALESCE(excluded.importance_threshold, settings.importance_threshold),
        ignored_categories = COALESCE(excluded.ignored_categories, settings.ignored_categories),
        whatsapp_notifications_enabled = COALESCE(excluded.whatsapp_notifications_enabled, settings.whatsapp_notifications_enabled),
        whatsapp_number = COALESCE(excluded.whatsapp_number, settings.whatsapp_number),
        analyze_limit = COALESCE(excluded.analyze_limit, settings.analyze_limit),
        updated_at = excluded.updated_at`
  );

  stmt.run(
      userId,
      settings.ai_model || (settings.ai_provider === 'openai' ? 'gpt-4o-mini' : 'openrouter/free'),
      settings.ai_provider || 'openrouter',
      settings.language || 'English',
      settings.gmail_poll_interval || 5,
      settings.importance_threshold || 'Medium',
      JSON.stringify(settings.ignored_categories || ['Spam', 'Promotion']),
      settings.whatsapp_notifications_enabled === undefined ? 1 : (settings.whatsapp_notifications_enabled ? 1 : 0),
      settings.whatsapp_number || '',
      settings.analyze_limit || 10,
      now
    );
  return await getSettings(userId);
}

// Emails (Summary History) DB Methods
export async function getEmails(userId: string) {
  const database = await getDb();
  const stmt = database.prepare('SELECT * FROM emails WHERE user_id = ? ORDER BY date DESC');
  const rows: any[] = stmt.all(userId);
  return rows.map((r) => ({
    id: r.id,
    from: r.from_address,
    subject: r.subject,
    content: r.content,
    summary: r.summary,
    category: r.category,
    importance: r.importance,
    date: r.date,
    whatsappStatus: r.whatsapp_status,
    whatsappMessageId: r.whatsapp_message_id,
    deliveryError: r.delivery_error,
    isRead: r.is_read === 1,
    attachments: r.attachments ? JSON.parse(r.attachments) : [],
    aiMetadata: r.ai_metadata ? JSON.parse(r.ai_metadata) : null,
  }));
}

export async function emailExistsByGmailId(userId: string, gmailMessageId: string): Promise<boolean> {
  const database = await getDb();
  const stmt = database.prepare(
    'SELECT id FROM emails WHERE user_id = ? AND gmail_message_id = ?'
  );
  const row = stmt.get(userId, gmailMessageId);
  return !!row;
}

export async function getEmailsSince(userId: string, since: Date) {
  const database = await getDb();
  const stmt = database.prepare(
    'SELECT * FROM emails WHERE user_id = ? AND created_at >= ? ORDER BY date DESC'
  );
  const rows: any[] = stmt.all(userId, since.toISOString());
  return rows.map((r) => ({
    id: r.id,
    from: r.from_address,
    subject: r.subject,
    category: r.category,
    importance: r.importance,
    date: r.date,
    whatsappStatus: r.whatsapp_status,
  }));
}

export async function addEmail(userId: string, email: {
  id?: string;
  gmail_message_id?: string;
  from: string;
  subject: string;
  content: string;
  summary: string;
  category: string;
  importance: string;
  date: string;
  whatsapp_status: string;
  whatsapp_message_id?: string;
  delivery_error?: string;
  is_read?: boolean;
  attachments?: string[];
  ai_metadata?: any;
}) {
  const database = await getDb();
  const now = new Date().toISOString();
  const emailId = email.id || 'email_' + Math.random().toString(36).substring(2, 11);
  const stmt = database.prepare(
    `INSERT INTO emails (id, user_id, gmail_message_id, from_address, subject, content, summary, category, importance, date, whatsapp_status, whatsapp_message_id, delivery_error, is_read, created_at, attachments, ai_metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  stmt.run(
      emailId,
      userId,
      email.gmail_message_id || null,
      email.from,
      email.subject,
      email.content,
      email.summary,
      email.category,
      email.importance,
      email.date,
      email.whatsapp_status,
      email.whatsapp_message_id || null,
      email.delivery_error || null,
      email.is_read ? 1 : 0,
      now,
      JSON.stringify(email.attachments || []),
      email.ai_metadata ? JSON.stringify(email.ai_metadata) : null
    );
  return emailId;
}

export async function deleteEmail(userId: string, emailId: string) {
  const database = await getDb();
  const stmt = database.prepare('DELETE FROM emails WHERE user_id = ? AND id = ?');
  return stmt.run(userId, emailId);
}

export async function clearEmails(userId: string) {
  const database = await getDb();
  const stmt = database.prepare('DELETE FROM emails WHERE user_id = ?');
  return stmt.run(userId);
}

// Logs (Execution Logs) DB Methods
export async function getLogs(userId: string) {
  const database = await getDb();
  const stmt = database.prepare('SELECT * FROM logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 100');
  const rows: any[] = stmt.all(userId);
  return rows.map((r) => ({
    id: r.id,
    time: r.time,
    level: r.level,
    type: r.type,
    desc: r.desc,
  }));
}

export async function addLog(userId: string, level: 'INFO' | 'WARNING' | 'ERROR', type: string, desc: string) {
  const database = await getDb();
  const now = new Date().toISOString();
  const logId = 'log_' + Math.random().toString(36).substring(2, 11);
  const timeStr = new Date().toLocaleTimeString();

  const stmt = database.prepare(
    `INSERT INTO logs (id, user_id, time, level, type, desc, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  stmt.run(logId, userId, timeStr, level, type, desc, now);
}

export async function clearLogs(userId: string) {
  const database = await getDb();
  const stmt = database.prepare('DELETE FROM logs WHERE user_id = ?');
  return stmt.run(userId);
}
