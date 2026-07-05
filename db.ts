import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_FILE = path.join(__dirname, 'database.db');
let db: Database | null = null;

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

export async function initDb(): Promise<Database> {
  if (db) return db;

  db = await open({
    filename: DB_FILE,
    driver: sqlite3.Database
  });

  // Enable foreign keys
  await db.run('PRAGMA foreign_keys = ON');

  // Create Users Table
  await db.exec(`
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
  await db.exec(`
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
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Create Settings Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      user_id TEXT PRIMARY KEY,
      ai_model TEXT NOT NULL,
      ai_provider TEXT NOT NULL,
      language TEXT NOT NULL,
      gmail_poll_interval INTEGER NOT NULL,
      importance_threshold TEXT NOT NULL,
      ignored_categories TEXT NOT NULL, -- JSON array of ignored categories
      whatsapp_notifications_enabled INTEGER NOT NULL, -- 0 or 1
      whatsapp_number TEXT NOT NULL,
      analyze_limit INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Create Summary History Table (Emails)
  await db.exec(`
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
      is_read INTEGER NOT NULL, -- 0 or 1
      created_at TEXT NOT NULL,
      attachments TEXT, -- JSON array of filenames
      ai_metadata TEXT, -- JSON serialized metadata containing Action Required, deadlines, etc.
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Database Schema Migrations (Add columns if missing for existing databases)
  try {
    await db.run('ALTER TABLE emails ADD COLUMN ai_metadata TEXT');
    console.log('Database schema migrated: Added ai_metadata column.');
  } catch (err: any) {
    if (!err.message.includes('duplicate column name') && !err.message.includes('already exists')) {
      console.warn('Database schema migration warning:', err.message);
    }
  }

  // Migration: Add gmail_email to oauth_tokens for multi-account support
  try {
    await db.run('ALTER TABLE oauth_tokens ADD COLUMN gmail_email TEXT');
    console.log('Database schema migrated: Added gmail_email column to oauth_tokens.');
  } catch (err: any) {
    if (!err.message.includes('duplicate column name') && !err.message.includes('already exists')) {
      console.warn('Database schema migration warning (gmail_email):', err.message);
    }
  }

  // Create Execution Logs Table
  await db.exec(`
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

export async function getDb(): Promise<Database> {
  if (!db) {
    return await initDb();
  }
  return db;
}

// Users DB Methods
export async function getUser(id: string) {
  const database = await getDb();
  return await database.get('SELECT * FROM users WHERE id = ?', id);
}

export async function getUserByEmail(email: string) {
  const database = await getDb();
  return await database.get('SELECT * FROM users WHERE email = ?', email);
}

export async function upsertUser(user: { id: string; email: string; name: string; avatar: string }) {
  const database = await getDb();
  const now = new Date().toISOString();
  await database.run(
    `INSERT INTO users (id, email, name, avatar, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       email = excluded.email,
       name = excluded.name,
       avatar = excluded.avatar,
       updated_at = excluded.updated_at`,
    user.id,
    user.email,
    user.name,
    user.avatar,
    now,
    now
  );
  return await getUser(user.id);
}

// OAuth Tokens DB Methods
export async function getOAuthToken(userId: string, provider = 'google') {
  const database = await getDb();
  const token = await database.get(
    'SELECT * FROM oauth_tokens WHERE user_id = ? AND provider = ?',
    userId,
    provider
  );
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

  const existingToken = await database.get(
    'SELECT refresh_token FROM oauth_tokens WHERE user_id = ? AND provider = ?',
    token.userId,
    token.provider
  );

  if (existingToken) {
    // Update existing token
    const finalRefreshToken = encryptedRefresh || existingToken.refresh_token;
    await database.run(
      `UPDATE oauth_tokens SET
         access_token = ?,
         refresh_token = ?,
         expiry_date = ?,
         scope = ?,
         token_type = ?,
         updated_at = ?
       WHERE user_id = ? AND provider = ?`,
      token.access_token,
      finalRefreshToken,
      token.expiry_date || null,
      token.scope || null,
      token.token_type || null,
      now,
      token.userId,
      token.provider
    );
  } else {
    // Insert new token
    await database.run(
      `INSERT INTO oauth_tokens (id, user_id, provider, access_token, refresh_token, expiry_date, scope, token_type, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      tokenId,
      token.userId,
      token.provider,
      token.access_token,
      encryptedRefresh,
      token.expiry_date || null,
      token.scope || null,
      token.token_type || null,
      now,
      now
    );
  }
}

export async function deleteOAuthToken(userId: string, provider = 'google') {
  const database = await getDb();
  await database.run('DELETE FROM oauth_tokens WHERE user_id = ? AND provider = ?', userId, provider);
}

// Get all Google OAuth tokens for a user (multi-account)
export async function getAllGoogleTokens(userId: string) {
  const database = await getDb();
  const rows = await database.all(
    'SELECT * FROM oauth_tokens WHERE user_id = ? AND provider = ? ORDER BY created_at ASC',
    userId,
    'google'
  );
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
  const encryptedRefresh = token.refresh_token ? encryptText(token.refresh_token) : null;

  // Check if this Gmail email is already connected for this user
  const existing = await database.get(
    'SELECT id FROM oauth_tokens WHERE user_id = ? AND provider = ? AND gmail_email = ?',
    token.userId, token.provider, token.gmailEmail
  );

  if (existing) {
    await database.run(
      `UPDATE oauth_tokens SET access_token=?, refresh_token=COALESCE(?,refresh_token), expiry_date=?, updated_at=? WHERE id=?`,
      token.access_token, encryptedRefresh, token.expiry_date || null, now, existing.id
    );
  } else {
    const tokenId = 'tok_' + Math.random().toString(36).substring(2, 11);
    await database.run(
      `INSERT INTO oauth_tokens (id, user_id, provider, gmail_email, access_token, refresh_token, expiry_date, scope, token_type, created_at, updated_at)
       VALUES (?, ?, 'google', ?, ?, ?, ?, ?, ?, ?, ?)`,
      tokenId, token.userId, token.gmailEmail, token.access_token, encryptedRefresh,
      token.expiry_date || null, token.scope || null, token.token_type || null, now, now
    );
  }
}

// Delete a specific Gmail account token by its row id
export async function deleteGoogleAccountToken(userId: string, tokenId: string) {
  const database = await getDb();
  await database.run(
    'DELETE FROM oauth_tokens WHERE id = ? AND user_id = ?',
    tokenId, userId
  );
}

// Settings DB Methods
export async function getSettings(userId: string) {
  const database = await getDb();
  const settings = await database.get('SELECT * FROM settings WHERE user_id = ?', userId);
  if (settings) {
    settings.ignored_categories = JSON.parse(settings.ignored_categories);
    settings.whatsapp_notifications_enabled = !!settings.whatsapp_notifications_enabled;
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
  const existing = await database.get('SELECT * FROM settings WHERE user_id = ?', userId);

  if (existing) {
    await database.run(
      `UPDATE settings SET
         ai_model = COALESCE(?, ai_model),
         ai_provider = COALESCE(?, ai_provider),
         language = COALESCE(?, language),
         gmail_poll_interval = COALESCE(?, gmail_poll_interval),
         importance_threshold = COALESCE(?, importance_threshold),
         ignored_categories = COALESCE(?, ignored_categories),
         whatsapp_notifications_enabled = COALESCE(?, whatsapp_notifications_enabled),
         whatsapp_number = COALESCE(?, whatsapp_number),
         analyze_limit = COALESCE(?, analyze_limit),
         updated_at = ?
       WHERE user_id = ?`,
      settings.ai_model,
      settings.ai_provider,
      settings.language,
      settings.gmail_poll_interval,
      settings.importance_threshold,
      settings.ignored_categories ? JSON.stringify(settings.ignored_categories) : null,
      settings.whatsapp_notifications_enabled !== undefined ? (settings.whatsapp_notifications_enabled ? 1 : 0) : null,
      settings.whatsapp_number,
      settings.analyze_limit,
      now,
      userId
    );
  } else {
    await database.run(
      `INSERT INTO settings (user_id, ai_model, ai_provider, language, gmail_poll_interval, importance_threshold, ignored_categories, whatsapp_notifications_enabled, whatsapp_number, analyze_limit, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      userId,
      settings.ai_model || (settings.ai_provider === 'openai' ? 'gpt-4o-mini' : 'openrouter/free'),
      settings.ai_provider || 'openrouter',
      settings.language || 'English',
      settings.gmail_poll_interval || 5,
      settings.importance_threshold || 'Medium',
      JSON.stringify(settings.ignored_categories || ['Spam', 'Promotion']),
      settings.whatsapp_notifications_enabled ? 1 : 0,
      settings.whatsapp_number || '',
      settings.analyze_limit || 10,
      now
    );
  }
  return await getSettings(userId);
}

// Emails (Summary History) DB Methods
export async function getEmails(userId: string) {
  const database = await getDb();
  const rows = await database.all('SELECT * FROM emails WHERE user_id = ? ORDER BY date DESC', userId);
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
    isRead: !!r.is_read,
    attachments: r.attachments ? JSON.parse(r.attachments) : [],
    aiMetadata: r.ai_metadata ? JSON.parse(r.ai_metadata) : null,
  }));
}

export async function emailExistsByGmailId(userId: string, gmailMessageId: string): Promise<boolean> {
  const database = await getDb();
  const row = await database.get(
    'SELECT id FROM emails WHERE user_id = ? AND gmail_message_id = ?',
    userId,
    gmailMessageId
  );
  return !!row;
}

export async function getEmailsSince(userId: string, since: Date) {
  const database = await getDb();
  const rows = await database.all(
    'SELECT * FROM emails WHERE user_id = ? AND created_at >= ? ORDER BY date DESC',
    userId,
    since.toISOString()
  );
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
  await database.run(
    `INSERT INTO emails (id, user_id, gmail_message_id, from_address, subject, content, summary, category, importance, date, whatsapp_status, whatsapp_message_id, delivery_error, is_read, created_at, attachments, ai_metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    email.attachments ? JSON.stringify(email.attachments) : '[]',
    email.ai_metadata ? JSON.stringify(email.ai_metadata) : null
  );
  return emailId;
}

export async function deleteEmail(userId: string, emailId: string) {
  const database = await getDb();
  return await database.run('DELETE FROM emails WHERE user_id = ? AND id = ?', userId, emailId);
}

export async function clearEmails(userId: string) {
  const database = await getDb();
  return await database.run('DELETE FROM emails WHERE user_id = ?', userId);
}

// Logs (Execution Logs) DB Methods
export async function getLogs(userId: string) {
  const database = await getDb();
  const rows = await database.all('SELECT * FROM logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 100', userId);
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

  await database.run(
    `INSERT INTO logs (id, user_id, time, level, type, desc, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    logId,
    userId,
    timeStr,
    level,
    type,
    desc,
    now
  );
}

export async function clearLogs(userId: string) {
  const database = await getDb();
  return await database.run('DELETE FROM logs WHERE user_id = ?', userId);
}
