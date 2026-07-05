import { Pool, types } from 'pg';
import crypto from 'crypto';

// Handle timestamp conversion
types.setTypeParser(1114, (stringValue) => new Date(stringValue + 'Z'));

let db: Pool | null = null;

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

export async function initDb(): Promise<Pool> {
  if (db) return db;

  db = new Pool({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT ? parseInt(process.env.PG_PORT, 10) : 5432,
  });

  // Create Users Table
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      avatar TEXT,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL
    )
  `);

  // Create OAuth Tokens Table
  await db.query(`
    CREATE TABLE IF NOT EXISTS oauth_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expiry_date BIGINT,
      scope TEXT,
      token_type TEXT,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      gmail_email TEXT,
      UNIQUE(user_id, provider, gmail_email),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Create Settings Table
  await db.query(`
    CREATE TABLE IF NOT EXISTS settings (
      user_id TEXT PRIMARY KEY,
      ai_model TEXT NOT NULL,
      ai_provider TEXT NOT NULL,
      language TEXT NOT NULL,
      gmail_poll_interval INT NOT NULL,
      importance_threshold TEXT NOT NULL,
      ignored_categories JSONB NOT NULL,
      whatsapp_notifications_enabled BOOLEAN NOT NULL,
      whatsapp_number TEXT NOT NULL,
      analyze_limit INT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Create Summary History Table (Emails)
  await db.query(`
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
      date TIMESTAMPTZ NOT NULL,
      whatsapp_status TEXT NOT NULL, -- 'Sent' | 'Failed' | 'Disabled' | 'Pending'
      whatsapp_message_id TEXT,
      delivery_error TEXT,
      is_read BOOLEAN NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      attachments JSONB,
      ai_metadata JSONB,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Create Execution Logs Table
  await db.query(`
    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      time TEXT NOT NULL,
      level TEXT NOT NULL, -- 'INFO' | 'WARNING' | 'ERROR'
      type TEXT NOT NULL,
      desc TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  return db;
}

export async function getDb(): Promise<Pool> {
  if (!db) {
    return await initDb();
  }
  return db;
}

// Users DB Methods
export async function getUser(id: string) {
  const database = await getDb();
  const res = await database.query('SELECT * FROM users WHERE id = $1', [id]);
  return res.rows[0];
}

export async function getUserByEmail(email: string) {
  const database = await getDb();
  const res = await database.query('SELECT * FROM users WHERE email = $1', [email]);
  return res.rows[0];
}

export async function upsertUser(user: { id: string; email: string; name: string; avatar: string }) {
  const database = await getDb();
  const now = new Date();
  await database.query(
    `INSERT INTO users (id, email, name, avatar, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT(id) DO UPDATE SET
       email = EXCLUDED.email,
       name = EXCLUDED.name,
       avatar = EXCLUDED.avatar,
       updated_at = EXCLUDED.updated_at`,
    [user.id, user.email, user.name, user.avatar, now, now]
  );
  return await getUser(user.id);
}

// OAuth Tokens DB Methods
export async function getOAuthToken(userId: string, provider = 'google') {
  const database = await getDb();
  const res = await database.query(
    'SELECT * FROM oauth_tokens WHERE user_id = $1 AND provider = $2 AND gmail_email IS NULL',
    [userId, provider]
  );
  const token = res.rows[0];
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
  const now = new Date();
  const tokenId = 'tok_' + Math.random().toString(36).substring(2, 11);
  const encryptedRefresh = token.refresh_token ? encryptText(token.refresh_token) : null;

  await database.query(
    `INSERT INTO oauth_tokens (id, user_id, provider, access_token, refresh_token, expiry_date, scope, token_type, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT(user_id, provider) WHERE gmail_email IS NULL DO UPDATE SET
       access_token = EXCLUDED.access_token,
       refresh_token = COALESCE(EXCLUDED.refresh_token, oauth_tokens.refresh_token),
       expiry_date = EXCLUDED.expiry_date,
       scope = EXCLUDED.scope,
       token_type = EXCLUDED.token_type,
       updated_at = EXCLUDED.updated_at`,
    [
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
    ]
  );
}

export async function deleteOAuthToken(userId: string, provider = 'google') {
  const database = await getDb();
  await database.query('DELETE FROM oauth_tokens WHERE user_id = $1 AND provider = $2', [userId, provider]);
}

// Get all Google OAuth tokens for a user (multi-account)
export async function getAllGoogleTokens(userId: string) {
  const database = await getDb();
  const res = await database.query(
    'SELECT * FROM oauth_tokens WHERE user_id = $1 AND provider = $2 ORDER BY created_at ASC',
    [userId, 'google']
  );
  return res.rows.map(r => ({
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
  const now = new Date();
  const tokenId = 'tok_' + Math.random().toString(36).substring(2, 11);
  const encryptedRefresh = token.refresh_token ? encryptText(token.refresh_token) : null;

  await database.query(
    `INSERT INTO oauth_tokens (id, user_id, provider, gmail_email, access_token, refresh_token, expiry_date, scope, token_type, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT(user_id, provider, gmail_email) DO UPDATE SET
        access_token = EXCLUDED.access_token,
        refresh_token = COALESCE(EXCLUDED.refresh_token, oauth_tokens.refresh_token),
        expiry_date = EXCLUDED.expiry_date,
        updated_at = EXCLUDED.updated_at`,
    [
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
    ]
  );
}

// Delete a specific Gmail account token by its row id
export async function deleteGoogleAccountToken(userId: string, tokenId: string) {
  const database = await getDb();
  await database.query(
    'DELETE FROM oauth_tokens WHERE id = $1 AND user_id = $2',
    [tokenId, userId]
  );
}

// Settings DB Methods
export async function getSettings(userId: string) {
  const database = await getDb();
  const res = await database.query('SELECT * FROM settings WHERE user_id = $1', [userId]);
  return res.rows[0];
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
  const now = new Date();

  await database.query(
    `INSERT INTO settings (user_id, ai_model, ai_provider, language, gmail_poll_interval, importance_threshold, ignored_categories, whatsapp_notifications_enabled, whatsapp_number, analyze_limit, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT(user_id) DO UPDATE SET
        ai_model = COALESCE($2, settings.ai_model),
        ai_provider = COALESCE($3, settings.ai_provider),
        language = COALESCE($4, settings.language),
        gmail_poll_interval = COALESCE($5, settings.gmail_poll_interval),
        importance_threshold = COALESCE($6, settings.importance_threshold),
        ignored_categories = COALESCE($7, settings.ignored_categories),
        whatsapp_notifications_enabled = COALESCE($8, settings.whatsapp_notifications_enabled),
        whatsapp_number = COALESCE($9, settings.whatsapp_number),
        analyze_limit = COALESCE($10, settings.analyze_limit),
        updated_at = $11`,
    [
      userId,
      settings.ai_model || (settings.ai_provider === 'openai' ? 'gpt-4o-mini' : 'openrouter/free'),
      settings.ai_provider || 'openrouter',
      settings.language || 'English',
      settings.gmail_poll_interval || 5,
      settings.importance_threshold || 'Medium',
      JSON.stringify(settings.ignored_categories || ['Spam', 'Promotion']),
      settings.whatsapp_notifications_enabled === undefined ? true : settings.whatsapp_notifications_enabled,
      settings.whatsapp_number || '',
      settings.analyze_limit || 10,
      now
    ]
  );
  return await getSettings(userId);
}

// Emails (Summary History) DB Methods
export async function getEmails(userId: string) {
  const database = await getDb();
  const res = await database.query('SELECT * FROM emails WHERE user_id = $1 ORDER BY date DESC', [userId]);
  return res.rows.map((r) => ({
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
    isRead: r.is_read,
    attachments: r.attachments || [],
    aiMetadata: r.ai_metadata || null,
  }));
}

export async function emailExistsByGmailId(userId: string, gmailMessageId: string): Promise<boolean> {
  const database = await getDb();
  const res = await database.query(
    'SELECT id FROM emails WHERE user_id = $1 AND gmail_message_id = $2',
    [userId, gmailMessageId]
  );
  return res.rows.length > 0;
}

export async function getEmailsSince(userId: string, since: Date) {
  const database = await getDb();
  const res = await database.query(
    'SELECT * FROM emails WHERE user_id = $1 AND created_at >= $2 ORDER BY date DESC',
    [userId, since]
  );
  return res.rows.map((r) => ({
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
  const now = new Date();
  const emailId = email.id || 'email_' + Math.random().toString(36).substring(2, 11);
  await database.query(
    `INSERT INTO emails (id, user_id, gmail_message_id, from_address, subject, content, summary, category, importance, date, whatsapp_status, whatsapp_message_id, delivery_error, is_read, created_at, attachments, ai_metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [
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
      email.is_read || false,
      now,
      JSON.stringify(email.attachments || []),
      email.ai_metadata ? JSON.stringify(email.ai_metadata) : null
    ]
  );
  return emailId;
}

export async function deleteEmail(userId: string, emailId: string) {
  const database = await getDb();
  return await database.query('DELETE FROM emails WHERE user_id = $1 AND id = $2', [userId, emailId]);
}

export async function clearEmails(userId: string) {
  const database = await getDb();
  return await database.query('DELETE FROM emails WHERE user_id = $1', [userId]);
}

// Logs (Execution Logs) DB Methods
export async function getLogs(userId: string) {
  const database = await getDb();
  const res = await database.query('SELECT * FROM logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100', [userId]);
  return res.rows.map((r) => ({
    id: r.id,
    time: r.time,
    level: r.level,
    type: r.type,
    desc: r.desc,
  }));
}

export async function addLog(userId: string, level: 'INFO' | 'WARNING' | 'ERROR', type: string, desc: string) {
  const database = await getDb();
  const now = new Date();
  const logId = 'log_' + Math.random().toString(36).substring(2, 11);
  const timeStr = new Date().toLocaleTimeString();

  await database.query(
    `INSERT INTO logs (id, user_id, time, level, type, desc, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [logId, userId, timeStr, level, type, desc, now]
  );
}

export async function clearLogs(userId: string) {
  const database = await getDb();
  return await database.query('DELETE FROM logs WHERE user_id = $1', [userId]);
}
