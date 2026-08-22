import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

import { env } from './config/env.config';
import logger from './logger.service';
import { requestIdMiddleware } from './middleware/request-id.middleware';
import { metricsService } from './services/metrics.service';
import { initQueues, closeQueues } from './services/queue.service';

import {
  initDb,
  getDb,
  upsertUser,
  getOAuthToken,
  saveOAuthToken,
  deleteOAuthToken,
  getAllGoogleTokens,
  saveGoogleAccountToken,
  deleteGoogleAccountToken,
  updateOAuthAccountStatus,
  createOAuthState,
  consumeOAuthState,
  getSettings,
  saveSettings,
  getEmails,
  getEmailsSince,
  addEmail,
  deleteEmail,
  clearEmails,
  getLogs,
  addLog,
  clearLogs,
  getEmailByWhatsAppMessageId,
  updateEmailReadStatus,
  getUserIdByWhatsAppNumber,
  getLatestEmail,
  createEmailEvent,
  updateEmailEventStatus,
  updateSyncState
} from './db';

import {
  getAuthUrl,
  exchangeCodeForTokens,
  getUserInfo,
  fetchUnreadEmails,
  markEmailAsRead,
  archiveEmail,
  replyToEmail,
  createCalendarEvent,
} from './gmail';

import {
  analyzeEmail,
  getFallbackAnalysis
} from './ai';

import {
  sendWhatsAppAlert,
  sendWhatsAppDigest,
  sendWhatsAppVoiceSummary,
  checkWhatsAppConfig,
  startOutboxWorker,
  stopOutboxWorker
} from './whatsapp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = env.PORT;
const JWT_SECRET = env.JWT_SECRET;

// 1. Initialize Database
initDb().then(() => {
  logger.info({ type: 'DB_INIT', description: 'Database initialized with WAL mode & enterprise schema.' });
}).catch((err) => {
  logger.error({ type: 'DB_INIT', description: `Failed to initialize database: ${err.message}` });
});

// 2. Initialize Queues and Outbox Worker
initQueues();
startOutboxWorker();

const app = express();

// Proxy Configuration
if (env.TRUST_PROXY === 'true' || env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
} else if (env.TRUST_PROXY !== 'false') {
  app.set('trust proxy', env.TRUST_PROXY);
}

// 3. Request ID & Metrics Middleware
app.use(requestIdMiddleware);

app.use((_req, res, next) => {
  const startTime = Date.now();
  metricsService.increment('http_requests_total');
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    metricsService.recordLatency(duration);
  });
  next();
});

// 4. Helmet Security Headers
app.use(helmet({
  contentSecurityPolicy: false
}));

// 5. Whitelisted CORS Configuration
const defaultOrigins = [
  'https://whatsapp2mail.duckdns.org',
  'http://localhost:3000',
  'http://localhost:5173'
];
const customOrigins = env.CORS_ORIGINS ? env.CORS_ORIGINS.split(',').map(s => s.trim()) : [];
const allowedOrigins = Array.from(new Set([...defaultOrigins, ...customOrigins]));

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true
}));

app.use(express.json({
  limit: '2mb',
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  }
}));

// 6. Global In-Memory Rate Limiter with Periodic Garbage Collection
const rateLimitWindowMs = 15 * 60 * 1000;
const rateLimitMaxRequests = 1000;
const ipRequestCounts = new Map<string, { count: number; resetTime: number }>();

// Periodic memory pruning to prevent heap leaks
const rateLimitCleaner = setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of ipRequestCounts.entries()) {
    if (now > record.resetTime) {
      ipRequestCounts.delete(ip);
    }
  }
}, 5 * 60 * 1000);
rateLimitCleaner.unref();

function rateLimiter(req: express.Request, res: express.Response, next: express.NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  
  let record = ipRequestCounts.get(ip);
  if (!record || now > record.resetTime) {
    record = { count: 0, resetTime: now + rateLimitWindowMs };
  }
  
  record.count++;
  ipRequestCounts.set(ip, record);
  
  if (record.count > rateLimitMaxRequests) {
    return res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
        requestId: (req as any).requestId
      }
    });
  }
  
  next();
}
app.use(rateLimiter);

// ----------------------------------------------------
// JWT Authentication Middleware
// ----------------------------------------------------
export interface AuthenticatedRequest extends express.Request {
  user?: {
    id: string;
    email: string;
  };
  requestId?: string;
}

function authenticateToken(req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];

  if (!token && req.query.token) {
    token = req.query.token as string;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'AUTH_REQUIRED',
        message: 'Session token required. Please log in.',
        requestId: req.requestId
      }
    });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded: any) => {
    if (err) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid or expired session token.',
          requestId: req.requestId
        }
      });
    }
    req.user = {
      id: decoded.id,
      email: decoded.email
    };
    next();
  });
}

// ----------------------------------------------------
// Production Health Checks & Metrics
// ----------------------------------------------------
app.get('/health/live', (_req, res) => {
  res.json({
    status: 'OK',
    service: 'mail2whatsapp-api',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('/health/ready', async (_req, res) => {
  try {
    const database = await getDb();
    database.prepare('SELECT 1').get();
    res.json({
      status: 'READY',
      database: 'connected',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(503).json({
      status: 'NOT_READY',
      database: 'disconnected',
      error: err.message
    });
  }
});

app.get('/health/dependencies', async (_req, res) => {
  const whatsappOk = checkWhatsAppConfig();
  const googleOk = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  const llmOk = !!(env.LLM_API_KEY && !env.LLM_API_KEY.includes('replace_me'));

  res.json({
    status: (whatsappOk && googleOk && llmOk) ? 'HEALTHY' : 'DEGRADED',
    dependencies: {
      whatsapp: whatsappOk ? 'configured' : 'missing_credentials',
      googleOAuth: googleOk ? 'configured' : 'missing_credentials',
      llmProvider: llmOk ? 'configured' : 'missing_key'
    },
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (_req, res) => {
  res.json({
    status: 'OK',
    uptime: process.uptime(),
    timestamp: Date.now()
  });
});

app.get('/metrics', (req, res) => {
  const format = req.query.format;
  if (format === 'json') {
    res.json(metricsService.getMetricsJSON());
  } else {
    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    res.send(metricsService.getPrometheusFormat());
  }
});

// ----------------------------------------------------
// Public Authentication / Handshake Endpoints
// ----------------------------------------------------
app.get('/api/handshake', (_req, res) => {
  res.json({
    llmConfigured: !!(env.LLM_API_KEY && !env.LLM_API_KEY.includes('replace_me')),
    googleConfigured: !!(env.GOOGLE_CLIENT_ID && !env.GOOGLE_CLIENT_ID.includes('replace_me')),
    whatsappConfigured: checkWhatsAppConfig(),
    provider: env.LLM_PROVIDER
  });
});

app.get('/api/auth/google', (_req, res) => {
  try {
    const authUrl = getAuthUrl();
    res.redirect(authUrl);
  } catch (err: any) {
    logger.error({ type: 'GOOGLE_AUTH', description: `Google OAuth URL generation failed: ${err.message}` });
    res.status(500).json({ error: 'Google OAuth is not configured on the server.' });
  }
});

app.get('/api/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!code || typeof code !== 'string') {
    return res.status(400).send('OAuth authorization code is missing.');
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const accessToken = tokens.access_token;
    if (!accessToken) throw new Error('Access token was not returned by Google.');

    const userInfo = await getUserInfo(accessToken);
    if (!userInfo.id || !userInfo.email) throw new Error('Unable to fetch user profile info from Google.');

    const userId = userInfo.id;
    const userEmail = userInfo.email;
    const userName = userInfo.name || 'Google User';
    const userAvatar = userInfo.picture || '';

    await upsertUser({
      id: userId,
      email: userEmail,
      name: userName,
      avatar: userAvatar
    });

    await saveOAuthToken({
      userId,
      provider: 'google',
      access_token: accessToken,
      refresh_token: tokens.refresh_token || undefined,
      expiry_date: tokens.expiry_date || undefined,
      scope: tokens.scope || undefined,
      token_type: tokens.token_type || undefined
    });

    const existingSettings = await getSettings(userId);
    if (!existingSettings) {
      await saveSettings(userId, {
        ai_model: env.LLM_MODEL,
        ai_provider: env.LLM_PROVIDER,
        language: 'English',
        gmail_poll_interval: 5,
        importance_threshold: 'Medium',
        ignored_categories: ['Spam', 'Promotion'],
        whatsapp_notifications_enabled: true,
        whatsapp_number: '',
        analyze_limit: 10
      });
    }

    const jwtToken = jwt.sign(
      { id: userId, email: userEmail },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    await addLog(userId, 'INFO', 'GOOGLE_OAUTH', `User "${userEmail}" connected successfully via Google OAuth.`);

    // Check if this is an authenticated "add additional account" flow
    const rawState = (req.query.state as string || '').trim();
    if (rawState) {
      const consumedState = await consumeOAuthState(rawState, 'add_account');
      if (!consumedState) {
        logger.warn({ type: 'OAUTH_SECURITY', description: 'Invalid, replayed, or expired OAuth state token rejected.' });
        return res.status(400).send('Invalid or expired OAuth state parameter. Please try connecting again from Settings.');
      }

      const existingUserId = consumedState.userId;
      await saveGoogleAccountToken({
        userId: existingUserId,
        provider: 'google',
        gmailEmail: userEmail,
        access_token: accessToken,
        refresh_token: tokens.refresh_token || undefined,
        expiry_date: tokens.expiry_date || undefined,
        scope: tokens.scope || undefined,
        token_type: tokens.token_type || undefined
      });
      await addLog(existingUserId, 'INFO', 'GOOGLE_OAUTH', `Additional Gmail account "${userEmail}" connected securely.`);
      return res.redirect('/?account_added=true');
    }

    res.redirect(`/?token=${jwtToken}`);
  } catch (err: any) {
    console.error('Google OAuth callback failed:', err);
    res.status(500).send(`Authentication failed: ${err.message || 'unknown error'}`);
  }
});

// Multi-Account OAuth Linking (Protected with Single-Use Server-Side State)
app.get('/api/auth/google/add-account', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const stateToken = await createOAuthState(req.user!.id, 'add_account', 5 * 60 * 1000);
    const authUrl = getAuthUrl();
    const urlWithState = authUrl + `&state=${encodeURIComponent(stateToken)}`;
    res.redirect(urlWithState);
  } catch (err: any) {
    res.status(500).json({ error: 'Cannot generate Google OAuth URL.' });
  }
});

app.get('/api/auth/me', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const user = await upsertUser({
      id: req.user!.id,
      email: req.user!.email,
      name: '',
      avatar: ''
    });
    
    const token = await getOAuthToken(req.user!.id);
    const googleConnected = !!token;
    
    res.json({
      ...user,
      googleConnected
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/gmail/accounts', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const accounts = await getAllGoogleTokens(req.user!.id);
    res.json(accounts.map(a => ({
      id: a.id,
      email: a.gmailEmail || req.user!.email,
      connectedAt: a.createdAt,
      status: a.status,
      lastSyncAt: a.lastSyncAt,
      lastSuccessfulSyncAt: a.lastSuccessfulSyncAt,
      lastError: a.lastError,
      isPrimary: !a.gmailEmail
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/gmail/accounts/:tokenId', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { tokenId } = req.params;
    await deleteGoogleAccountToken(req.user!.id, tokenId);
    res.json({ success: true, message: 'Gmail account removed.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/emails', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const emails = await getEmails(req.user!.id);
    res.json(emails);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/emails/delete', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'Email ID required for deletion.' });
    }
    await deleteEmail(req.user!.id, id);
    await addLog(req.user!.id, 'INFO', 'PURGE_EMAIL', `Email record ${id} deleted by user.`);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/logs', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const logs = await getLogs(req.user!.id);
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/logs/clear', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    await clearLogs(req.user!.id);
    await addLog(req.user!.id, 'INFO', 'LOG_PURGE', 'Audit terminal console logs cleared.');
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/settings', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    let settings = await getSettings(req.user!.id);
    if (!settings) {
      settings = await saveSettings(req.user!.id, {});
    }

    const token = await getOAuthToken(req.user!.id);
    const googleConnected = !!token;
    const whatsappConnected = checkWhatsAppConfig() && !!settings.whatsapp_number;

    res.json({
      aiModel: settings.ai_model,
      aiProvider: settings.ai_provider,
      language: settings.language,
      gmailPollInterval: settings.gmail_poll_interval,
      importanceThreshold: settings.importance_threshold,
      ignoredCategories: settings.ignored_categories,
      whatsappNotificationsEnabled: settings.whatsapp_notifications_enabled,
      whatsappNumber: settings.whatsapp_number,
      analyzeLimit: settings.analyze_limit,
      googleConnected,
      whatsappConnected
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const {
      aiModel,
      aiProvider,
      language,
      gmailPollInterval,
      importanceThreshold,
      ignoredCategories,
      whatsappNotificationsEnabled,
      whatsappNumber,
      analyzeLimit
    } = req.body;

    const updated = await saveSettings(req.user!.id, {
      ai_model: aiModel,
      ai_provider: aiProvider,
      language,
      gmail_poll_interval: gmailPollInterval,
      importance_threshold: importanceThreshold,
      ignored_categories: ignoredCategories,
      whatsapp_notifications_enabled: whatsappNotificationsEnabled,
      whatsapp_number: whatsappNumber,
      analyze_limit: analyzeLimit
    });

    const token = await getOAuthToken(req.user!.id);
    const googleConnected = !!token;
    const whatsappConnected = checkWhatsAppConfig() && !!updated.whatsapp_number;

    await addLog(req.user!.id, 'INFO', 'CONFIG_UPDATE', 'System preferences and AI parameters updated.');

    res.json({
      success: true,
      settings: {
        aiModel: updated.ai_model,
        aiProvider: updated.ai_provider,
        language: updated.language,
        gmailPollInterval: updated.gmail_poll_interval,
        importanceThreshold: updated.importance_threshold,
        ignoredCategories: updated.ignored_categories,
        whatsappNotificationsEnabled: updated.whatsapp_notifications_enabled,
        whatsappNumber: updated.whatsapp_number,
        analyzeLimit: updated.analyze_limit,
        googleConnected,
        whatsappConnected
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reset', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    await clearEmails(userId);
    await clearLogs(userId);
    await deleteOAuthToken(userId);
    await saveSettings(userId, {
      ai_model: env.LLM_MODEL,
      ai_provider: env.LLM_PROVIDER,
      language: 'English',
      gmail_poll_interval: 5,
      importance_threshold: 'Medium',
      ignored_categories: ['Spam', 'Promotion'],
      whatsapp_notifications_enabled: true,
      whatsapp_number: '',
      analyze_limit: 10
    });
    
    await addLog(userId, 'WARNING', 'DATABASE_PURGE', 'Database data and configurations cleared, sandbox reset completed.');
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sync', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const syncCount = await runSyncForUser(userId);
    res.json({
      success: true,
      added: syncCount.added,
      skipped: syncCount.skipped
    });
  } catch (err: any) {
    console.error('Manual sync error:', err);
    res.status(500).json({ error: err.message || 'Sync failed.' });
  }
});

// ----------------------------------------------------
// Core Inbox Sync Engine with Idempotent Outbox
// ----------------------------------------------------
const syncingUsers = new Set<string>();

export async function runSyncForUser(userId: string): Promise<{ added: number; skipped: number }> {
  if (syncingUsers.has(userId)) {
    console.log(`[Sync] Sync already active for user ${userId}. Skipping.`);
    return { added: 0, skipped: 0 };
  }

  syncingUsers.add(userId);

  try {
    await addLog(userId, 'INFO', 'GMAIL_POLL', 'Querying Gmail API for unread inbox messages...');
    metricsService.increment('gmail_sync_total');

    let allTokens = await getAllGoogleTokens(userId);
    if (allTokens.length === 0) {
      const legacyToken = await getOAuthToken(userId);
      if (legacyToken?.refresh_token) {
        allTokens.push({
          id: legacyToken.id,
          gmailEmail: null,
          refreshToken: legacyToken.refresh_token,
          accessToken: legacyToken.access_token,
          status: legacyToken.status || 'ACTIVE',
          lastSyncAt: legacyToken.last_sync_at,
          lastSuccessfulSyncAt: legacyToken.last_successful_sync_at,
          lastError: legacyToken.last_error,
          createdAt: legacyToken.created_at
        });
      }
    }

    if (allTokens.length === 0) {
      await addLog(userId, 'ERROR', 'GMAIL_POLL', 'Gmail poll cancelled: No Google account connected.');
      throw new Error('Google Account is not connected. Re-auth via Settings page.');
    }

    const settings = await getSettings(userId);
    if (!settings) throw new Error('User settings missing.');

    let added = 0;
    let skipped = 0;

    for (const accountToken of allTokens) {
      if (!accountToken.refreshToken) continue;

      let emailsList: any[] = [];
      try {
        emailsList = await fetchUnreadEmails(accountToken.refreshToken, settings.analyze_limit);
        await updateSyncState({
          userId,
          gmailAccountId: accountToken.id,
          status: 'IDLE',
          isSuccess: true
        });
      } catch (fetchErr: any) {
        metricsService.increment('gmail_sync_failures');
        if (fetchErr.message && (fetchErr.message.includes('invalid_grant') || fetchErr.status === 401)) {
          await updateOAuthAccountStatus(accountToken.id, 'REAUTH_REQUIRED', fetchErr.message);
          await addLog(userId, 'ERROR', 'GMAIL_AUTH', `Gmail token expired for account. Please reconnect in Settings.`);
        } else {
          await updateSyncState({
            userId,
            gmailAccountId: accountToken.id,
            status: 'ERROR',
            error: fetchErr.message,
            isSuccess: false
          });
        }
        continue;
      }

      for (const rawEmail of emailsList) {
        if (!rawEmail.id) continue;

        // 1. Persist Event Idempotently
        const { id: eventId, isDuplicate } = await createEmailEvent({
          userId,
          gmailAccountId: accountToken.id,
          gmailMessageId: rawEmail.id,
          threadId: rawEmail.threadId,
          from: rawEmail.from,
          subject: rawEmail.subject,
          snippet: rawEmail.snippet,
          content: rawEmail.body || rawEmail.snippet,
          attachments: rawEmail.attachments
        });

        if (isDuplicate) {
          skipped++;
          continue;
        }

        await updateEmailEventStatus(eventId, 'AI_PROCESSING');
        await addLog(userId, 'INFO', 'AI_ANALYSIS', `Analyzing incoming message from "${rawEmail.from}"...`);
        metricsService.increment('ai_requests_total');

        // 2. Perform AI Triage
        let analysis: any = null;
        try {
          analysis = await analyzeEmail(
            rawEmail.from,
            rawEmail.subject,
            rawEmail.body || rawEmail.snippet,
            settings.language,
            settings.ai_provider,
            settings.ai_model,
            rawEmail.downloadedAttachments
          );
        } catch (err: any) {
          metricsService.increment('ai_failures_total');
          await addLog(userId, 'WARNING', 'AI_FAIL', `LLM triage failed: ${err.message}. Running rule fallback.`);
          analysis = getFallbackAnalysis(rawEmail.from, rawEmail.subject, rawEmail.body || rawEmail.snippet);
        }

        const category = analysis.category;
        const importance = analysis.importance;
        const summary = analysis.summary;
        const aiMetadata = analysis.aiMetadata || null;

        // 3. Calendar Auto-Scheduling
        if (aiMetadata && aiMetadata.calendarEvent && aiMetadata.calendarEvent.title && aiMetadata.calendarEvent.start) {
          try {
            await createCalendarEvent(accountToken.refreshToken, {
              title: aiMetadata.calendarEvent.title,
              start: aiMetadata.calendarEvent.start,
              end: aiMetadata.calendarEvent.end
            });
            await addLog(userId, 'INFO', 'CALENDAR_SYNC', `Scheduled calendar event: "${aiMetadata.calendarEvent.title}".`);
          } catch (calErr: any) {
            console.error('Calendar sync error:', calErr.message);
          }
        }

        // 4. Filter Ignored Categories
        if (settings.ignored_categories.includes(category)) {
          await updateEmailEventStatus(eventId, 'IGNORED');
          await addLog(userId, 'WARNING', 'OMIT_FILTER', `Omitted message from "${rawEmail.from}" (category "${category}" is ignored).`);
          try { await markEmailAsRead(accountToken.refreshToken, rawEmail.id); } catch (_) {}
          skipped++;
          continue;
        }

        // 5. WhatsApp Notification Dispatch
        let whatsappStatus: 'Sent' | 'Failed' | 'Disabled' = 'Disabled';
        let whatsappMsgId: string | undefined = undefined;
        let deliveryErr: string | undefined = undefined;

        const importanceThresholds: Record<string, number> = { Low: 1, Medium: 2, High: 3 };
        const thresholdVal = importanceThresholds[settings.importance_threshold] || 2;
        const emailImportanceVal = importanceThresholds[importance] || 2;

        if (settings.whatsapp_notifications_enabled && emailImportanceVal >= thresholdVal && settings.whatsapp_number) {
          try {
            await addLog(userId, 'INFO', 'WHATSAPP_PUSH', `Urgent alert triggered. Routing alert summary to WhatsApp ${settings.whatsapp_number}...`);
            const pushResult = await sendWhatsAppAlert(
              settings.whatsapp_number,
              { from: rawEmail.from, subject: rawEmail.subject, category, importance, summary },
              aiMetadata,
              { userId, emailEventId: eventId }
            );

            whatsappStatus = pushResult.status;
            whatsappMsgId = pushResult.messageId;
            deliveryErr = pushResult.error;

            if (pushResult.status === 'Sent') {
              metricsService.increment('whatsapp_sent_total');
              await addLog(userId, 'INFO', 'WHATSAPP_PUSH', `WhatsApp alert dispatched (ID: ${pushResult.messageId}).`);

              if (importance === 'High' && env.WHATSAPP_VOICE_ENABLED === 'true') {
                const voiceText = `Urgent email from ${rawEmail.from.split('<')[0].trim()}. Subject: ${rawEmail.subject}. Summary: ${summary}`;
                sendWhatsAppVoiceSummary(settings.whatsapp_number, voiceText).catch(() => {});
              }
            } else {
              metricsService.increment('whatsapp_failed_total');
              await addLog(userId, 'ERROR', 'WHATSAPP_PUSH', `WhatsApp delivery queued in Outbox: ${pushResult.error}`);
            }
          } catch (waErr: any) {
            metricsService.increment('whatsapp_failed_total');
            whatsappStatus = 'Failed';
            deliveryErr = waErr.message || 'WhatsApp routing exception';
          }
        }

        // 6. Record to Summary History Table (For UI)
        await addEmail(userId, {
          gmail_message_id: rawEmail.id,
          from: rawEmail.from,
          subject: rawEmail.subject,
          content: rawEmail.body || rawEmail.snippet,
          summary,
          category,
          importance,
          date: rawEmail.date,
          whatsapp_status: whatsappStatus,
          whatsapp_message_id: whatsappMsgId,
          delivery_error: deliveryErr,
          is_read: false,
          attachments: rawEmail.attachments,
          ai_metadata: aiMetadata
        });

        await updateEmailEventStatus(eventId, 'PROCESSED');
        metricsService.increment('emails_processed_total');

        try { await markEmailAsRead(accountToken.refreshToken, rawEmail.id); } catch (_) {}
        added++;
      }
    }

    await addLog(userId, 'INFO', 'GMAIL_POLL', `Sync complete. ${added} emails added, ${skipped} skipped.`);
    return { added, skipped };
  } finally {
    syncingUsers.delete(userId);
  }
}

// ----------------------------------------------------
// Background Sync Daemon
// ----------------------------------------------------
const lastSyncTime = new Map<string, number>();

function startSyncDaemon() {
  console.log('Background Gmail Sync Daemon activated.');
  setInterval(async () => {
    try {
      const database = await getDb();
      const tokens = database.prepare("SELECT DISTINCT user_id FROM oauth_tokens WHERE provider = 'google' AND status = 'ACTIVE'").all();
      
      for (const t of tokens as any[]) {
        const userId = (t as any).user_id;
        const settings = await getSettings(userId);
        if (!settings) continue;

        const pollIntervalMs = (settings.gmail_poll_interval || 5) * 60 * 1000;
        const lastSync = lastSyncTime.get(userId) || 0;
        const elapsed = Date.now() - lastSync;

        if (elapsed >= pollIntervalMs) {
          lastSyncTime.set(userId, Date.now());
          runSyncForUser(userId).catch((err) => {
            console.error(`[Daemon] Sync failed for user ${userId}:`, err.message);
          });
        }
      }
    } catch (daemonErr: any) {
      console.error('[Daemon] Error in background sync interval loop:', daemonErr.message);
    }
  }, 60 * 1000);
}

startSyncDaemon();

// ----------------------------------------------------
// Daily Digest Scheduler
// ----------------------------------------------------
function startDailyDigestScheduler() {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

  function msUntilNextDigest(): number {
    const nowUTC = Date.now();
    const nowIST = new Date(nowUTC + IST_OFFSET_MS);
    const nextIST = new Date(nowIST);
    nextIST.setHours(8, 0, 0, 0);
    if (nextIST <= nowIST) nextIST.setDate(nextIST.getDate() + 1);
    return nextIST.getTime() - nowIST.getTime();
  }

  const scheduleDigest = async () => {
    try {
      const database = await getDb();
      const tokens = database.prepare("SELECT DISTINCT user_id FROM oauth_tokens WHERE provider = 'google'").all();
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

      for (const t of tokens as any[]) {
        const userId = (t as any).user_id;
        const settings = await getSettings(userId);
        if (!settings?.whatsapp_notifications_enabled || !settings?.whatsapp_number) continue;

        const emails = await getEmailsSince(userId, since24h);
        if (emails.length === 0) continue;

        const stats = {
          total: emails.length,
          high: emails.filter(e => e.importance === 'High').length,
          medium: emails.filter(e => e.importance === 'Medium').length,
          low: emails.filter(e => e.importance === 'Low').length,
          categories: emails.reduce((acc: Record<string, number>, e) => {
            acc[e.category] = (acc[e.category] || 0) + 1;
            return acc;
          }, {}),
          topSubjects: emails.filter(e => e.importance === 'High').slice(0, 3).map(e => e.subject)
        };

        const result = await sendWhatsAppDigest(settings.whatsapp_number, stats);
        if (result.status === 'Sent') {
          await addLog(userId, 'INFO', 'DAILY_DIGEST', `Daily digest sent: ${stats.total} emails, ${stats.high} urgent.`);
        }
      }
    } catch (err: any) {
      console.error('[Digest] Daily digest failed:', err.message);
    }
    setTimeout(scheduleDigest, msUntilNextDigest());
  };

  const delayMs = msUntilNextDigest();
  setTimeout(scheduleDigest, delayMs);
}

startDailyDigestScheduler();

// ----------------------------------------------------
// Webhooks: WhatsApp & Gmail Pub/Sub
// ----------------------------------------------------
app.get('/webhook/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    logger.info({ type: 'WEBHOOK_VERIFY', description: 'WhatsApp webhook verified successfully.' });
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook/whatsapp', async (req, res) => {
  try {
    const signature = req.headers['x-hub-signature-256'] as string;
    const metaSecret = env.META_APP_SECRET;

    // Cryptographic HMAC SHA-256 signature verification
    if (metaSecret && !metaSecret.includes('replace_me')) {
      if (!signature || !signature.startsWith('sha256=')) {
        logger.warn({ type: 'WEBHOOK_SECURITY', description: 'WhatsApp webhook rejected: Missing or invalid X-Hub-Signature-256 header format.' });
        return res.status(401).send('Unauthorized: Signature missing or invalid format.');
      }

      const rawBody = (req as any).rawBody || Buffer.from(JSON.stringify(req.body));
      const expectedSignature = 'sha256=' + crypto.createHmac('sha256', metaSecret).update(rawBody).digest('hex');

      const sigBuffer = Buffer.from(signature);
      const expectedBuffer = Buffer.from(expectedSignature);

      if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
        logger.warn({ type: 'WEBHOOK_SECURITY', description: 'WhatsApp webhook signature mismatch / tampering detected.' });
        return res.status(403).send('Forbidden: Invalid HMAC signature.');
      }
    }

    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return res.sendStatus(404);

    const change = body.entry?.[0]?.changes?.[0]?.value;
    if (!change || !change.messages || change.messages.length === 0) {
      return res.status(200).send('EVENT_RECEIVED');
    }

    const message = change.messages[0];
    const fromNumber = message.from;
    const msgText = message.text?.body?.trim();
    const context = message.context;

    if (!msgText) return res.status(200).send('EVENT_RECEIVED');

    let emailRow: any = null;
    if (context && context.id) {
      emailRow = await getEmailByWhatsAppMessageId(context.id);
      if (emailRow) {
        // Enforce phone authorization check: sender must own this email
        const userSettings = await getSettings(emailRow.user_id);
        const cleanFrom = fromNumber.replace(/[^\d]/g, '');
        const cleanSetting = (userSettings?.whatsapp_number || '').replace(/[^\d]/g, '');
        if (!cleanSetting || cleanFrom.slice(-10) !== cleanSetting.slice(-10)) {
          logger.warn({ type: 'WEBHOOK_AUTH', description: `Unauthorized WhatsApp reply attempt for user ${emailRow.user_id} from ${fromNumber}. Blocked.` });
          return res.status(200).send('EVENT_RECEIVED');
        }
      }
    } else {
      const cleanMsg = msgText.toLowerCase();
      const isCommand = msgText.startsWith('/reply ') || cleanMsg === '/read' || cleanMsg === '/archive' || cleanMsg === '/summary';
      if (isCommand) {
        const userId = await getUserIdByWhatsAppNumber(fromNumber);
        if (userId) emailRow = await getLatestEmail(userId);
      }
    }

    if (!emailRow) return res.status(200).send('EVENT_RECEIVED');

    const userId = emailRow.user_id;
    const tokenRow = await getOAuthToken(userId, 'google');
    if (!tokenRow || !tokenRow.refresh_token) return res.status(200).send('EVENT_RECEIVED');

    const decryptedRefreshToken = tokenRow.refresh_token;
    const cleanMsg = msgText.toLowerCase();
    const token = env.WHATSAPP_ACCESS_TOKEN;
    const phoneId = env.WHATSAPP_PHONE_NUMBER_ID;
    const cleanNumber = fromNumber.startsWith('+') ? fromNumber : `+${fromNumber}`;
    let replyStatus = '';

    if (msgText.startsWith('/reply ')) {
      const replyContent = msgText.substring(7).trim();
      if (replyContent) {
        await replyToEmail(decryptedRefreshToken, emailRow.gmail_message_id, replyContent);
        replyStatus = `✅ *Reply Sent successfully!* \n\n📨 *To:* ${emailRow.from_address}\n📝 *Message:* "${replyContent}"`;
      }
    } else if (cleanMsg === '/read') {
      await markEmailAsRead(decryptedRefreshToken, emailRow.gmail_message_id);
      await updateEmailReadStatus(emailRow.id, true);
      replyStatus = `✉️ *Email marked as read.*`;
    } else if (cleanMsg === '/archive') {
      await archiveEmail(decryptedRefreshToken, emailRow.gmail_message_id);
      replyStatus = `📥 *Email archived.*`;
    } else if (cleanMsg === '/summary') {
      replyStatus = `💡 *AI Summary:*\n${emailRow.summary}`;
    }

    if (replyStatus && token && phoneId) {
      await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: cleanNumber,
          type: 'text',
          text: { preview_url: false, body: replyStatus }
        })
      });
    }

    res.status(200).send('EVENT_RECEIVED');
  } catch (err: any) {
    logger.error({ type: 'WEBHOOK_ERR', description: `WhatsApp webhook execution error: ${err.message}` });
    res.status(200).send('EVENT_RECEIVED');
  }
});

app.post('/webhook/gmail', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'] as string;
    const tokenQuery = req.query.token as string || req.headers['x-pubsub-verification-token'] as string;

    // Secure PubSub verification if token configured
    if (env.PUBSUB_VERIFICATION_TOKEN && !env.PUBSUB_VERIFICATION_TOKEN.includes('replace_me')) {
      const isBearer = typeof authHeader === 'string' && authHeader.startsWith('Bearer ');
      const isTokenMatch = tokenQuery === env.PUBSUB_VERIFICATION_TOKEN;
      if (!isBearer && !isTokenMatch) {
        logger.warn({ type: 'PUBSUB_AUTH', description: 'Unauthorized Gmail Pub/Sub webhook trigger attempt rejected.' });
        return res.status(401).send('Unauthorized PubSub webhook');
      }
    }

    const body = req.body;
    if (!body?.message?.data) return res.status(200).send('OK');

    let rawData = '';
    try {
      rawData = Buffer.from(body.message.data, 'base64').toString('utf8');
    } catch {
      return res.status(200).send('OK');
    }

    let notification: any = null;
    try {
      notification = JSON.parse(rawData);
    } catch {
      return res.status(200).send('OK');
    }

    const emailAddress = notification?.emailAddress;
    if (!emailAddress) return res.status(200).send('OK');

    const database = await getDb();
    const user = database.prepare('SELECT id FROM users WHERE email = ?').get(emailAddress) as { id: string } | undefined;
    if (user) {
      runSyncForUser(user.id).catch((err) => {
        logger.error({ type: 'PUBSUB_SYNC', description: `PubSub sync failed for user ${user.id}: ${err.message}` });
      });
    }

    res.status(200).send('OK');
  } catch (pubSubErr: any) {
    logger.error({ type: 'PUBSUB_ERR', description: `Gmail webhook exception: ${pubSubErr.message}` });
    res.status(200).send('OK');
  }
});

// ----------------------------------------------------
// Static Privacy Policy
// ----------------------------------------------------
app.get('/privacy', (_req, res) => {
  res.send(`
    <html>
      <head><title>Privacy Policy - Mail2WhatsApp</title></head>
      <body style="font-family: sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; line-height: 1.6;">
        <h1>Privacy Policy - Mail2WhatsApp AI</h1>
        <p>Mail2WhatsApp is a private notification gateway. User data is processed locally in-memory and in self-hosted databases and is never sold or shared.</p>
      </body>
    </html>
  `);
});

// ----------------------------------------------------
// Frontend Asset Serving
// ----------------------------------------------------
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
} else {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

// ----------------------------------------------------
// Centralized Error Handling Middleware
// ----------------------------------------------------
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const requestId = (req as any).requestId;
  console.error(`[Error] Request ${requestId} failed:`, err);

  res.status(err.status || 500).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_SERVER_ERROR',
      message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred.' : err.message,
      requestId
    }
  });
});

// ----------------------------------------------------
// Graceful Shutdown Handling
// ----------------------------------------------------
const server = app.listen(PORT, () => {
  console.log(`🚀 Mail2WhatsApp AI Enterprise Server running at http://localhost:${PORT}`);
});

async function handleGracefulShutdown(signal: string) {
  console.log(`\n🛑 Received ${signal}. Commencing graceful shutdown sequence...`);
  
  server.close(async () => {
    console.log('HTTP Server closed.');
    stopOutboxWorker();
    await closeQueues();
    
    try {
      const database = await getDb();
      database.close();
      console.log('Database connection closed.');
    } catch (e) {}

    console.log('✅ Graceful shutdown complete. Exiting.');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('⚠️ Forcing process exit after timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
