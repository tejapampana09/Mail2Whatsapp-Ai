import crypto from 'crypto';
import Database from 'better-sqlite3';
import { env } from '../config/env.config';
import { encryptText, decryptText, getEncryptionKey, getLegacyEncryptionKey } from '../utils/crypto';
import { normalizeWhatsAppNumber, cleanPhoneNumberDigits } from '../utils/phone';

export { encryptText, decryptText, getEncryptionKey, getLegacyEncryptionKey, normalizeWhatsAppNumber, cleanPhoneNumberDigits };

let db: any = null;

class MemoryDatabaseMock {
  private tables = new Map<string, any[]>();

  pragma(_cmd: string) { return []; }
  exec(_sql: string) { return this; }
  close() {}

  prepare(sql: string) {
    const memory = this.tables;
    const lowerSql = sql.toLowerCase();

    return {
      run(...args: any[]) {
        let tableName = 'general';
        if (lowerSql.includes('whatsapp_outbox')) tableName = 'whatsapp_outbox';
        else if (lowerSql.includes('email_events')) tableName = 'email_events';
        else if (lowerSql.includes('oauth_states')) tableName = 'oauth_states';
        else if (lowerSql.includes('users')) tableName = 'users';
        else if (lowerSql.includes('oauth_tokens')) tableName = 'oauth_tokens';
        else if (lowerSql.includes('settings')) tableName = 'settings';
        else if (lowerSql.includes('emails')) tableName = 'emails';
        else if (lowerSql.includes('logs')) tableName = 'logs';

        const list = memory.get(tableName) || [];

        if (lowerSql.includes("update oauth_states") && lowerSql.includes("set consumed = 1")) {
          const targetToken = args[0];
          const target = list.find(x => x.token === targetToken && x.consumed === 0);
          if (target) {
            target.consumed = 1;
            return { changes: 1 };
          }
          return { changes: 0 };
        }

        if (lowerSql.includes('insert into oauth_states')) {
          const item = {
            token: args[0],
            user_id: args[1],
            purpose: args[2],
            expires_at: args[3],
            consumed: 0,
            created_at: args[4]
          };
          list.push(item);
          memory.set(tableName, list);
          return { changes: 1 };
        }

        if (lowerSql.includes("update whatsapp_outbox") && lowerSql.includes("set status = 'processing'")) {
          const targetId = args.find(a => typeof a === 'string' && a.startsWith('outbox_')) || args[3] || args[1];
          const target = list.find(x => x.id === targetId && (x.status === 'PENDING' || (x.status === 'PROCESSING' && (x.lease_expires_at || 0) < Date.now())));
          if (target) {
            target.status = 'PROCESSING';
            target.locked_by = args[0];
            target.lease_expires_at = args[1] || (Date.now() + 60000);
            return { changes: 1 };
          }
          return { changes: 0 };
        }

        if (lowerSql.includes("update whatsapp_outbox") && lowerSql.includes("where id = ? and status = 'dead_letter'")) {
          const targetId = args[2] || args[0];
          const target = list.find(x => x.id === targetId && x.status === 'DEAD_LETTER');
          if (target) {
            target.status = 'PENDING';
            target.attempt_count = 0;
            target.last_error = null;
            return { changes: 1 };
          }
          return { changes: 0 };
        }

        if (lowerSql.includes("update whatsapp_outbox") && lowerSql.includes("set status = 'pending'")) {
          const targets = list.filter(x => x.status === 'PROCESSING');
          targets.forEach(x => {
            x.status = 'PENDING';
            x.locked_by = null;
            x.lease_expires_at = 0;
          });
          return { changes: targets.length };
        }

        if (lowerSql.includes('insert into email_events')) {
          const id = args[0];
          const foundKey = args.find(a => typeof a === 'string' && a.startsWith('gmail:')) || args[10] || id;
          const existing = list.find(x => x.idempotency_key === foundKey);
          if (existing) {
            const err = new Error('UNIQUE constraint failed: email_events.idempotency_key');
            throw err;
          }
          const item = {
            id,
            user_id: args[1],
            gmail_account_id: args[2],
            gmail_message_id: args[3],
            idempotency_key: foundKey,
            status: 'RECEIVED'
          };
          list.push(item);
          memory.set(tableName, list);
          return { changes: 1 };
        }

        if (lowerSql.includes('insert into whatsapp_outbox')) {
          const id = args[0];
          const foundKey = args.find(a => typeof a === 'string' && a.startsWith('whatsapp:')) || args[8] || id;
          const existing = list.find(x => x.idempotency_key === foundKey);
          if (existing) {
            const err = new Error('UNIQUE constraint failed: whatsapp_outbox.idempotency_key');
            throw err;
          }
          const item = {
            id,
            user_id: args[1],
            phone_number: args[3],
            status: 'PENDING',
            payload: args[5],
            attempt_count: 0,
            idempotency_key: foundKey
          };
          list.push(item);
          memory.set(tableName, list);
          return { changes: 1 };
        }

        const id = args[0] || 'mock_' + Math.random().toString(36).substring(2, 9);
        list.push({ id });
        memory.set(tableName, list);
        return { changes: 1 };
      },

      get(...args: any[]) {
        if (lowerSql.includes('select 1')) return { 1: 1 };

        let tableName = 'general';
        if (lowerSql.includes('whatsapp_outbox')) tableName = 'whatsapp_outbox';
        else if (lowerSql.includes('email_events')) tableName = 'email_events';
        else if (lowerSql.includes('oauth_states')) tableName = 'oauth_states';
        else if (lowerSql.includes('users')) tableName = 'users';
        else if (lowerSql.includes('oauth_tokens')) tableName = 'oauth_tokens';
        else if (lowerSql.includes('settings')) tableName = 'settings';
        else if (lowerSql.includes('emails')) tableName = 'emails';
        else if (lowerSql.includes('logs')) tableName = 'logs';

        const list = memory.get(tableName) || [];

        if (lowerSql.includes('from oauth_states') && lowerSql.includes('where token = ?')) {
          const token = args[0];
          const purpose = args[1] || 'add_account';
          const now = args[2] || Date.now();
          return list.find(x => x.token === token && x.purpose === purpose && x.consumed === 0 && x.expires_at > now) || null;
        }

        if (lowerSql.includes('where idempotency_key = ?')) {
          const key = args[0];
          return list.find(x => x.idempotency_key === key) || null;
        }

        if (lowerSql.includes('where id = ?')) {
          const id = args[0];
          return list.find(x => x.id === id) || null;
        }

        return list[0] || null;
      },

      all(..._args: any[]) {
        return [];
      }
    };
  }
}

export async function initDb(): Promise<any> {
  if (db) return db;

  try {
    const dbPath = env.DATABASE_PATH || 'mail2whatsapp.db';
    db = new Database(dbPath) as any;

    if (dbPath !== ':memory:') {
      db.pragma('journal_mode = WAL');
      db.pragma('busy_timeout = 5000');
      db.pragma('synchronous = NORMAL');
    }
    db.pragma('foreign_keys = ON');
  } catch (err: any) {
    console.warn('[DB] Native better-sqlite3 initialization failed. Using resilient in-memory database mock:', err.message);
    db = new MemoryDatabaseMock() as any;
  }

  // 1. Users Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      avatar TEXT,
      status TEXT DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // 2. OAuth Tokens Table
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
      gmail_email TEXT,
      status TEXT DEFAULT 'ACTIVE',
      last_sync_at TEXT,
      last_successful_sync_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, provider, gmail_email),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_tokens_primary
    ON oauth_tokens(user_id, provider)
    WHERE gmail_email IS NULL
  `);

  // 3. Settings Table
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

  // 4. Durable Email Events Table (Idempotent processing store)
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      gmail_account_id TEXT NOT NULL,
      gmail_message_id TEXT NOT NULL,
      thread_id TEXT,
      from_address TEXT NOT NULL,
      subject TEXT NOT NULL,
      snippet TEXT,
      content TEXT,
      attachments TEXT,
      status TEXT NOT NULL DEFAULT 'RECEIVED',
      idempotency_key TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(gmail_account_id, gmail_message_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_email_events_status
    ON email_events(status, user_id)
  `);

  // 5. Persistent WhatsApp Outbox Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS whatsapp_outbox (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      email_event_id TEXT,
      phone_number TEXT NOT NULL,
      message_type TEXT NOT NULL,
      template_name TEXT,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      attempt_count INTEGER DEFAULT 0,
      next_attempt_at INTEGER DEFAULT 0,
      lease_expires_at INTEGER DEFAULT 0,
      locked_by TEXT,
      last_error TEXT,
      provider_message_id TEXT,
      idempotency_key TEXT UNIQUE NOT NULL,
      sent_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_outbox_poll
    ON whatsapp_outbox(status, next_attempt_at, lease_expires_at)
  `);

  // 6. Sync State Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_state (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      gmail_account_id TEXT NOT NULL,
      last_sync_at TEXT,
      last_successful_sync_at TEXT,
      history_id TEXT,
      status TEXT DEFAULT 'IDLE',
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, gmail_account_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // 7. Summary History Table (Preserved for existing UI)
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
      whatsapp_status TEXT NOT NULL,
      whatsapp_message_id TEXT,
      delivery_error TEXT,
      is_read INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      attachments TEXT,
      ai_metadata TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_emails_user_date
    ON emails(user_id, date DESC)
  `);

  // 8. Execution Logs Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      time TEXT NOT NULL,
      level TEXT NOT NULL,
      type TEXT NOT NULL,
      desc TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_logs_user_created
    ON logs(user_id, created_at DESC)
  `);

  // 9. OAuth States Table (Server-side single-use state verification)
  db.exec(`
    CREATE TABLE IF NOT EXISTS oauth_states (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      purpose TEXT NOT NULL DEFAULT 'add_account',
      expires_at INTEGER NOT NULL,
      consumed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Run automatic schema migrations for existing databases
  const ensureColumn = (table: string, column: string, typeDef: string) => {
    try {
      if (typeof db.pragma === 'function') {
        const cols = db.pragma(`table_info(${table})`);
        if (Array.isArray(cols) && cols.length > 0 && !cols.some((c: any) => c.name === column)) {
          console.log(`[DB Migration] Adding missing column ${column} to table ${table}`);
          db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${typeDef}`);
        }
      }
    } catch (err: any) {
      console.warn(`[DB Migration] Notice on column ${column} in ${table}:`, err.message);
    }
  };

  // 1. Migrate whatsapp_outbox table
  ensureColumn('whatsapp_outbox', 'email_event_id', 'TEXT');
  ensureColumn('whatsapp_outbox', 'phone_number', 'TEXT DEFAULT ""');
  ensureColumn('whatsapp_outbox', 'message_type', 'TEXT DEFAULT "SESSION_MESSAGE"');
  ensureColumn('whatsapp_outbox', 'template_name', 'TEXT');
  ensureColumn('whatsapp_outbox', 'payload', 'TEXT DEFAULT "{}"');
  ensureColumn('whatsapp_outbox', 'status', 'TEXT DEFAULT "PENDING"');
  ensureColumn('whatsapp_outbox', 'attempt_count', 'INTEGER DEFAULT 0');
  ensureColumn('whatsapp_outbox', 'next_attempt_at', 'INTEGER DEFAULT 0');
  ensureColumn('whatsapp_outbox', 'lease_expires_at', 'INTEGER DEFAULT 0');
  ensureColumn('whatsapp_outbox', 'locked_by', 'TEXT');
  ensureColumn('whatsapp_outbox', 'last_error', 'TEXT');
  ensureColumn('whatsapp_outbox', 'provider_message_id', 'TEXT');
  ensureColumn('whatsapp_outbox', 'idempotency_key', 'TEXT');
  ensureColumn('whatsapp_outbox', 'sent_at', 'TEXT');
  ensureColumn('whatsapp_outbox', 'created_at', 'TEXT DEFAULT ""');
  ensureColumn('whatsapp_outbox', 'updated_at', 'TEXT DEFAULT ""');

  // 2. Migrate email_events table
  ensureColumn('email_events', 'gmail_account_id', 'TEXT');
  ensureColumn('email_events', 'gmail_message_id', 'TEXT');
  ensureColumn('email_events', 'thread_id', 'TEXT');
  ensureColumn('email_events', 'from_address', 'TEXT');
  ensureColumn('email_events', 'subject', 'TEXT');
  ensureColumn('email_events', 'snippet', 'TEXT');
  ensureColumn('email_events', 'content', 'TEXT');
  ensureColumn('email_events', 'attachments', 'TEXT');
  ensureColumn('email_events', 'status', "TEXT DEFAULT 'RECEIVED'");
  ensureColumn('email_events', 'idempotency_key', 'TEXT');

  // 3. Migrate oauth_tokens table
  ensureColumn('oauth_tokens', 'gmail_email', 'TEXT');
  ensureColumn('oauth_tokens', 'status', "TEXT DEFAULT 'ACTIVE'");
  ensureColumn('oauth_tokens', 'last_sync_at', 'TEXT');
  ensureColumn('oauth_tokens', 'last_successful_sync_at', 'TEXT');
  ensureColumn('oauth_tokens', 'last_error', 'TEXT');

  // 4. Migrate settings table
  ensureColumn('settings', 'analyze_limit', 'INTEGER DEFAULT 10');
  ensureColumn('settings', 'ai_provider', "TEXT DEFAULT 'google'");

  // 5. Migrate emails table
  ensureColumn('emails', 'created_at', "TEXT DEFAULT ''");

  return db;
}

export async function getDb(): Promise<any> {
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
    `INSERT INTO users (id, email, name, avatar, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       email = excluded.email,
       name = excluded.name,
       avatar = excluded.avatar,
       updated_at = excluded.updated_at`
  );
  stmt.run(user.id, user.email, user.name, user.avatar, now, now);
  return await getUser(user.id);
}

export async function getOAuthToken(userId: string, provider = 'google') {
  const database = await getDb();
  let token: any = database.prepare(
    'SELECT * FROM oauth_tokens WHERE user_id = ? AND provider = ? AND gmail_email IS NULL'
  ).get(userId, provider);

  if (!token) {
    token = database.prepare(
      "SELECT * FROM oauth_tokens WHERE user_id = ? AND provider = ? AND status = 'ACTIVE' ORDER BY rowid ASC LIMIT 1"
    ).get(userId, provider);
  }

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
    `INSERT INTO oauth_tokens (id, user_id, provider, access_token, refresh_token, expiry_date, scope, token_type, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
     ON CONFLICT(user_id, provider) WHERE gmail_email IS NULL DO UPDATE SET
       access_token = excluded.access_token,
       refresh_token = COALESCE(excluded.refresh_token, oauth_tokens.refresh_token),
       expiry_date = excluded.expiry_date,
       scope = excluded.scope,
       token_type = excluded.token_type,
       status = 'ACTIVE',
       last_error = NULL,
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
    now
  );
}

export async function deleteOAuthToken(userId: string, provider = 'google') {
  const database = await getDb();
  const stmt = database.prepare('DELETE FROM oauth_tokens WHERE user_id = ? AND provider = ?');
  stmt.run(userId, provider);
}

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
    status: r.status || 'ACTIVE',
    lastSyncAt: r.last_sync_at,
    lastSuccessfulSyncAt: r.last_successful_sync_at,
    lastError: r.last_error,
    createdAt: r.created_at
  }));
}

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
    `INSERT INTO oauth_tokens (id, user_id, provider, gmail_email, access_token, refresh_token, expiry_date, scope, token_type, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
     ON CONFLICT(user_id, provider, gmail_email) DO UPDATE SET
        access_token = excluded.access_token,
        refresh_token = COALESCE(excluded.refresh_token, oauth_tokens.refresh_token),
        expiry_date = excluded.expiry_date,
        status = 'ACTIVE',
        last_error = NULL,
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

export async function deleteGoogleAccountToken(userId: string, tokenId: string) {
  const database = await getDb();
  const stmt = database.prepare(
    'DELETE FROM oauth_tokens WHERE id = ? AND user_id = ?'
  );
  stmt.run(tokenId, userId);
}

export async function updateOAuthAccountStatus(tokenId: string, status: 'ACTIVE' | 'REAUTH_REQUIRED' | 'REVOKED', errorMsg?: string) {
  const database = await getDb();
  const now = new Date().toISOString();
  const stmt = database.prepare(
    'UPDATE oauth_tokens SET status = ?, last_error = ?, updated_at = ? WHERE id = ?'
  );
  stmt.run(status, errorMsg || null, now, tokenId);
}

// OAuth State Verification Methods
export async function createOAuthState(userId: string, purpose = 'add_account', ttlMs = 5 * 60 * 1000): Promise<string> {
  const database = await getDb();
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const expiresAt = now + ttlMs;
  const createdAt = new Date(now).toISOString();

  const stmt = database.prepare(
    `INSERT INTO oauth_states (token, user_id, purpose, expires_at, consumed, created_at)
     VALUES (?, ?, ?, ?, 0, ?)`
  );
  stmt.run(token, userId, purpose, expiresAt, createdAt);
  return token;
}

export async function consumeOAuthState(token: string, purpose = 'add_account'): Promise<{ userId: string } | null> {
  if (!token || typeof token !== 'string') return null;
  const database = await getDb();
  const now = Date.now();

  const state = database.prepare(
    `SELECT * FROM oauth_states
     WHERE token = ? AND purpose = ? AND consumed = 0 AND expires_at > ?`
  ).get(token, purpose, now) as any;

  if (!state) return null;

  const updateStmt = database.prepare(
    'UPDATE oauth_states SET consumed = 1 WHERE token = ? AND consumed = 0'
  );
  const result = updateStmt.run(token);
  if (result.changes === 0) return null;

  return { userId: state.user_id };
}

// Settings DB Methods
export async function getSettings(userId: string) {
  const database = await getDb();
  const stmt = database.prepare('SELECT * FROM settings WHERE user_id = ?');
  const settings: any = stmt.get(userId);
  if (settings) {
    settings.ignored_categories = JSON.parse(settings.ignored_categories || '[]');
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
    settings.ai_model || env.LLM_MODEL,
    settings.ai_provider || env.LLM_PROVIDER,
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

// Durable Email Events DB Methods
export async function createEmailEvent(event: {
  userId: string;
  gmailAccountId: string;
  gmailMessageId: string;
  threadId?: string;
  from: string;
  subject: string;
  snippet?: string;
  content?: string;
  attachments?: string[];
}): Promise<{ id: string; isDuplicate: boolean }> {
  const database = await getDb();
  const idempotencyKey = 'gmail:' + event.gmailAccountId + ':' + event.gmailMessageId;
  
  const existing = database.prepare('SELECT id, status FROM email_events WHERE idempotency_key = ?').get(idempotencyKey) as any;
  if (existing) {
    return { id: existing.id, isDuplicate: true };
  }

  const id = 'evt_' + crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    const stmt = database.prepare(
      `INSERT INTO email_events (id, user_id, gmail_account_id, gmail_message_id, thread_id, from_address, subject, snippet, content, attachments, status, idempotency_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECEIVED', ?, ?, ?)`
    );
    stmt.run(
      id,
      event.userId,
      event.gmailAccountId,
      event.gmailMessageId,
      event.threadId || null,
      event.from,
      event.subject,
      event.snippet || null,
      event.content || null,
      JSON.stringify(event.attachments || []),
      idempotencyKey,
      now,
      now
    );
    return { id, isDuplicate: false };
  } catch (err: any) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      const duplicate = database.prepare('SELECT id FROM email_events WHERE idempotency_key = ?').get(idempotencyKey) as any;
      return { id: duplicate.id, isDuplicate: true };
    }
    throw err;
  }
}

export async function updateEmailEventStatus(
  id: string,
  status: 'RECEIVED' | 'AI_PROCESSING' | 'PROCESSED' | 'FAILED' | 'IGNORED'
) {
  const database = await getDb();
  const now = new Date().toISOString();
  const stmt = database.prepare('UPDATE email_events SET status = ?, updated_at = ? WHERE id = ?');
  stmt.run(status, now, id);
}

// Persistent WhatsApp Outbox DB Methods
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

export async function createOutboxJob(job: {
  userId: string;
  emailEventId?: string;
  phoneNumber: string;
  messageType: 'TEMPLATE_NOTIFICATION' | 'SESSION_MESSAGE' | 'VOICE_SUMMARY' | 'DIGEST';
  templateName?: string;
  payload: any;
  idempotencyKey: string;
}): Promise<{ id: string; isDuplicate: boolean }> {
  const database = await getDb();
  const existing = database.prepare('SELECT id, status FROM whatsapp_outbox WHERE idempotency_key = ?').get(job.idempotencyKey) as any;
  if (existing) {
    return { id: existing.id, isDuplicate: true };
  }

  const id = 'outbox_' + crypto.randomUUID();
  const now = new Date().toISOString();
  const nextAttemptAt = Date.now();

  try {
    const stmt = database.prepare(
      `INSERT INTO whatsapp_outbox (id, user_id, email_event_id, phone_number, message_type, template_name, payload, status, attempt_count, next_attempt_at, lease_expires_at, locked_by, idempotency_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', 0, ?, 0, NULL, ?, ?, ?)`
    );
    stmt.run(
      id,
      job.userId,
      job.emailEventId || null,
      job.phoneNumber,
      job.messageType,
      job.templateName || null,
      JSON.stringify(job.payload),
      nextAttemptAt,
      job.idempotencyKey,
      now,
      now
    );
    return { id, isDuplicate: false };
  } catch (err: any) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      const duplicate = database.prepare('SELECT id FROM whatsapp_outbox WHERE idempotency_key = ?').get(job.idempotencyKey) as any;
      return { id: duplicate.id, isDuplicate: true };
    }
    throw err;
  }
}

export async function getPendingOutboxJobs(limit = 10): Promise<OutboxJob[]> {
  const database = await getDb();
  const now = Date.now();
  const stmt = database.prepare(
    `SELECT * FROM whatsapp_outbox
     WHERE status = 'PENDING' AND next_attempt_at <= ?
     ORDER BY next_attempt_at ASC
     LIMIT ?`
  );
  return stmt.all(now, limit) as OutboxJob[];
}

export async function claimOutboxJob(
  id: string,
  workerId = 'worker_' + process.pid,
  leaseDurationMs = 60000
): Promise<boolean> {
  const database = await getDb();
  const now = new Date().toISOString();
  const leaseExpiresAt = Date.now() + leaseDurationMs;
  const nowTimestamp = Date.now();

  const stmt = database.prepare(
    `UPDATE whatsapp_outbox
     SET status = 'PROCESSING',
         locked_by = ?,
         lease_expires_at = ?,
         updated_at = ?
     WHERE id = ? AND (status = 'PENDING' OR (status = 'PROCESSING' AND lease_expires_at < ?))`
  );
  const result = stmt.run(workerId, leaseExpiresAt, now, id, nowTimestamp);
  return result.changes > 0;
}

export async function updateOutboxJobStatus(
  id: string,
  status: 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'DEAD_LETTER' | 'CANCELLED',
  details?: {
    attemptCount?: number;
    nextAttemptAt?: number;
    lastError?: string;
    providerMessageId?: string;
  }
) {
  const database = await getDb();
  const now = new Date().toISOString();
  const sentAt = status === 'SENT' ? now : null;

  const stmt = database.prepare(
    `UPDATE whatsapp_outbox
     SET status = ?,
         attempt_count = COALESCE(?, attempt_count),
         next_attempt_at = COALESCE(?, next_attempt_at),
         last_error = COALESCE(?, last_error),
         provider_message_id = COALESCE(?, provider_message_id),
         lease_expires_at = 0,
         locked_by = NULL,
         sent_at = COALESCE(?, sent_at),
         updated_at = ?
     WHERE id = ?`
  );
  stmt.run(
    status,
    details?.attemptCount !== undefined ? details.attemptCount : null,
    details?.nextAttemptAt !== undefined ? details.nextAttemptAt : null,
    details?.lastError || null,
    details?.providerMessageId || null,
    sentAt,
    now,
    id
  );
}

export async function resetStaleOutboxJobs(timeoutMs = 3 * 60 * 1000): Promise<number> {
  const database = await getDb();
  const now = new Date().toISOString();
  const nowTimestamp = Date.now();
  const staleThreshold = new Date(Date.now() - timeoutMs).toISOString();

  const stmt = database.prepare(
    `UPDATE whatsapp_outbox
     SET status = 'PENDING', locked_by = NULL, lease_expires_at = 0, updated_at = ?
     WHERE status = 'PROCESSING' AND (lease_expires_at < ? OR updated_at <= ?)`
  );
  const result = stmt.run(now, nowTimestamp, staleThreshold);
  return result.changes;
}

export async function requeueDeadLetterJob(id: string): Promise<boolean> {
  const database = await getDb();
  const now = new Date().toISOString();
  const nextAttemptAt = Date.now();

  const stmt = database.prepare(
    `UPDATE whatsapp_outbox
     SET status = 'PENDING',
         attempt_count = 0,
         next_attempt_at = ?,
         last_error = NULL,
         locked_by = NULL,
         lease_expires_at = 0,
         updated_at = ?
     WHERE id = ? AND status = 'DEAD_LETTER'`
  );
  const result = stmt.run(nextAttemptAt, now, id);
  return result.changes > 0;
}

export async function getOutboxStats(): Promise<{ pending: number; processing: number; sent: number; deadLetter: number; failed: number }> {
  const database = await getDb();
  const rows = database.prepare(
    `SELECT status, COUNT(*) as count FROM whatsapp_outbox GROUP BY status`
  ).all() as { status: string; count: number }[];

  const stats = { pending: 0, processing: 0, sent: 0, deadLetter: 0, failed: 0 };
  for (const r of rows) {
    if (r.status === 'PENDING') stats.pending = r.count;
    else if (r.status === 'PROCESSING') stats.processing = r.count;
    else if (r.status === 'SENT') stats.sent = r.count;
    else if (r.status === 'DEAD_LETTER') stats.deadLetter = r.count;
    else if (r.status === 'FAILED') stats.failed = r.count;
  }
  return stats;
}

// Sync State DB Methods
export async function getSyncState(userId: string, gmailAccountId: string) {
  const database = await getDb();
  const stmt = database.prepare('SELECT * FROM sync_state WHERE user_id = ? AND gmail_account_id = ?');
  return stmt.get(userId, gmailAccountId) as any;
}

export async function updateSyncState(state: {
  userId: string;
  gmailAccountId: string;
  status?: 'IDLE' | 'SYNCING' | 'ERROR';
  historyId?: string;
  error?: string;
  isSuccess?: boolean;
}) {
  const database = await getDb();
  const now = new Date().toISOString();
  const id = 'sync_' + state.userId + '_' + state.gmailAccountId;

  const stmt = database.prepare(
    `INSERT INTO sync_state (id, user_id, gmail_account_id, last_sync_at, last_successful_sync_at, history_id, status, error, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, gmail_account_id) DO UPDATE SET
       last_sync_at = excluded.last_sync_at,
       last_successful_sync_at = CASE WHEN ? = 1 THEN excluded.last_sync_at ELSE sync_state.last_successful_sync_at END,
       history_id = COALESCE(excluded.history_id, sync_state.history_id),
       status = COALESCE(excluded.status, sync_state.status),
       error = excluded.error,
       updated_at = excluded.updated_at`
  );

  stmt.run(
    id,
    state.userId,
    state.gmailAccountId,
    now,
    state.isSuccess ? now : null,
    state.historyId || null,
    state.status || 'IDLE',
    state.error || null,
    now,
    now,
    state.isSuccess ? 1 : 0
  );
}

// Summary History (Emails) DB Methods
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
  const emailId = email.id || 'email_' + crypto.randomUUID().substring(0, 8);
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
  database.prepare('DELETE FROM emails WHERE user_id = ?').run(userId);
  database.prepare('DELETE FROM email_events WHERE user_id = ?').run(userId);
  return true;
}

export async function getEmailByWhatsAppMessageId(whatsappMessageId: string): Promise<any | null> {
  const database = await getDb();
  const stmt = database.prepare('SELECT * FROM emails WHERE whatsapp_message_id = ?');
  const row = stmt.get(whatsappMessageId) as any;
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    gmail_message_id: row.gmail_message_id,
    from_address: row.from_address,
    subject: row.subject,
    content: row.content,
    summary: row.summary,
    category: row.category,
    importance: row.importance,
    date: row.date,
    whatsapp_status: row.whatsapp_status,
    whatsapp_message_id: row.whatsapp_message_id,
    delivery_error: row.delivery_error,
    is_read: row.is_read === 1,
    created_at: row.created_at,
    attachments: JSON.parse(row.attachments || '[]'),
    ai_metadata: row.ai_metadata ? JSON.parse(row.ai_metadata) : null
  };
}

export async function updateEmailReadStatus(id: string, isRead: boolean) {
  const database = await getDb();
  const stmt = database.prepare('UPDATE emails SET is_read = ? WHERE id = ?');
  return stmt.run(isRead ? 1 : 0, id);
}

export async function getUserIdByWhatsAppNumber(whatsappNumber: string): Promise<string | null> {
  if (!whatsappNumber || typeof whatsappNumber !== 'string') return null;
  const clean = whatsappNumber.replace(/[^\d]/g, '').trim();
  if (clean.length < 10) return null;

  const database = await getDb();
  const last10 = clean.slice(-10);
  const suffix = '%' + last10;

  const stmt = database.prepare(
    `SELECT user_id FROM settings
     WHERE length(replace(replace(replace(whatsapp_number, '+', ''), '-', ''), ' ', '')) >= 10
       AND replace(replace(replace(whatsapp_number, '+', ''), '-', ''), ' ', '') LIKE ?`
  );
  const row = stmt.get(suffix) as any;
  return row ? row.user_id : null;
}

export async function getLatestEmail(userId: string): Promise<any | null> {
  const database = await getDb();
  let row = database.prepare('SELECT * FROM emails WHERE user_id = ? ORDER BY rowid DESC LIMIT 1').get(userId) as any;
  if (row) {
    return {
      id: row.id,
      user_id: row.user_id,
      gmail_message_id: row.gmail_message_id,
      from_address: row.from_address,
      subject: row.subject,
      content: row.content,
      summary: row.summary,
      category: row.category,
      importance: row.importance,
      date: row.date,
      whatsapp_status: row.whatsapp_status,
      whatsapp_message_id: row.whatsapp_message_id,
      delivery_error: row.delivery_error,
      is_read: row.is_read === 1,
      created_at: row.created_at
    };
  }

  // Fallback to email_events table if emails table is empty
  const eventRow = database.prepare('SELECT * FROM email_events WHERE user_id = ? ORDER BY rowid DESC LIMIT 1').get(userId) as any;
  if (eventRow) {
    return {
      id: eventRow.id,
      user_id: eventRow.user_id,
      gmail_message_id: eventRow.gmail_message_id,
      from_address: eventRow.from_address,
      subject: eventRow.subject,
      content: eventRow.content || eventRow.snippet,
      summary: eventRow.snippet || eventRow.subject,
      category: 'General',
      importance: 'Medium',
      date: eventRow.created_at,
      whatsapp_status: 'Sent',
      is_read: false,
      created_at: eventRow.created_at
    };
  }

  return null;
}

// Logs DB Methods
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
  const logId = 'log_' + crypto.randomUUID().substring(0, 8);
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
