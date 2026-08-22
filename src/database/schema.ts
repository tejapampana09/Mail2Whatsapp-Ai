export const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    avatar TEXT,
    status TEXT DEFAULT 'ACTIVE',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

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
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_tokens_primary
  ON oauth_tokens(user_id, provider)
  WHERE gmail_email IS NULL;

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
  );

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
  );

  CREATE INDEX IF NOT EXISTS idx_email_events_status
  ON email_events(status, user_id);

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
  );

  CREATE INDEX IF NOT EXISTS idx_outbox_poll
  ON whatsapp_outbox(status, next_attempt_at, lease_expires_at);

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
  );

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
  );

  CREATE INDEX IF NOT EXISTS idx_emails_user_date
  ON emails(user_id, date DESC);

  CREATE TABLE IF NOT EXISTS logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    time TEXT NOT NULL,
    level TEXT NOT NULL,
    type TEXT NOT NULL,
    desc TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_logs_user_created
  ON logs(user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS oauth_states (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'add_account',
    expires_at INTEGER NOT NULL,
    consumed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_oauth_states_lookup
  ON oauth_states(token, consumed, expires_at);
`;
