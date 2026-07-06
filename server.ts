import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';
import { PubSub } from '@google-cloud/pubsub';
import { createServer as createViteServer } from 'vite';

import logger from './logger.service';

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
  getSettings,
  saveSettings,
  getEmails,
  getEmailsSince,
  addEmail,
  emailExistsByGmailId,
  deleteEmail,
  clearEmails,
  getLogs,
  addLog,
  clearLogs
} from './db.ts';

import {
  getAuthUrl,
  exchangeCodeForTokens,
  getUserInfo,
  fetchUnreadEmails,
  markEmailAsRead,
  watchGmailAccount
} from './gmail.ts';

import {
  analyzeEmail,
  getFallbackAnalysis
} from './ai.ts';

import {
  sendWhatsAppAlert,
  sendWhatsAppDigest,
  sendWhatsAppVoiceSummary,
  checkWhatsAppConfig
} from './whatsapp.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('FATAL: JWT_SECRET environment variable is not defined in production!');
}
const JWT_SECRET = process.env.JWT_SECRET || 'default-super-secure-local-jwt-secret-key-123456';

// Initialize Database
initDb().then(() => {
  logger.info({ type: 'DB_INIT', description: 'Database initialized successfully.' });
}).catch((err) => {
  logger.error({ type: 'DB_INIT', description: `Failed to initialize database: ${err.message}` });
});

const app = express();

// Helmet HTTP Security Headers (prevent clickjacking, mime sniffing, XSS, etc.)
app.use(helmet({
  contentSecurityPolicy: false // Disable default CSP to prevent blocking loading client-side Vite scripts
}));

// Secure Whitelisted CORS Configuration
const allowedOrigins = [
  'https://whatsapp2mail.duckdns.org',
  'http://54.162.62.35.nip.io',
  'http://localhost:3000',
  'http://localhost:5173'
];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());

// In-Memory Rate Limiter (Security)
const rateLimitWindowMs = 15 * 60 * 1000; // 15 minutes
const rateLimitMaxRequests = 500; // Limit each IP to 500 requests per window
const ipRequestCounts = new Map<string, { count: number; resetTime: number }>();

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
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  
  next();
}
app.use(rateLimiter);

// JWT Authentication Middleware
export interface AuthenticatedRequest extends express.Request {
  user?: {
    id: string;
    email: string;
  };
}

function authenticateToken(req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  // Fallback to query parameter for browser redirects (e.g. add-account redirect)
  if (!token && req.query.token) {
    token = req.query.token as string;
  }

  if (!token) {
    return res.status(401).json({ error: 'Session token required. Please log in.' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded: any) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired session token.' });
    }
    req.user = {
      id: decoded.id,
      email: decoded.email
    };
    next();
  });
}

// ----------------------------------------------------
// Public Authentication / Handshake Endpoints
// ----------------------------------------------------

app.get('/api/handshake', (_req, res) => {
  res.json({
    llmConfigured: !!(process.env.LLM_API_KEY && !process.env.LLM_API_KEY.includes('replace_me')),
    googleConfigured: !!(process.env.GOOGLE_CLIENT_ID && !process.env.GOOGLE_CLIENT_ID.includes('replace_me')),
    whatsappConfigured: checkWhatsAppConfig(),
    provider: process.env.LLM_PROVIDER || 'openrouter'
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
    if (!accessToken) {
      throw new Error('Access token was not returned by Google.');
    }

    const userInfo = await getUserInfo(accessToken);
    if (!userInfo.id || !userInfo.email) {
      throw new Error('Unable to fetch user profile info from Google.');
    }

    const userId = userInfo.id;
    const userEmail = userInfo.email;
    const userName = userInfo.name || 'Google User';
    const userAvatar = userInfo.picture || '';

    // Upsert User
    await upsertUser({
      id: userId,
      email: userEmail,
      name: userName,
      avatar: userAvatar
    });

    // Save Tokens
    await saveOAuthToken({
      userId,
      provider: 'google',
      access_token: accessToken,
      refresh_token: tokens.refresh_token || undefined,
      expiry_date: tokens.expiry_date || undefined,
      scope: tokens.scope || undefined,
      token_type: tokens.token_type || undefined
    });

    // Save Initial Settings if not present
    const existingSettings = await getSettings(userId);
    if (!existingSettings) {
      const defaultModel = process.env.LLM_MODEL || (
        process.env.LLM_PROVIDER === 'openai' ? 'gpt-4o-mini' :
        (process.env.LLM_PROVIDER === 'google' || process.env.LLM_PROVIDER === 'gemini') ? 'gemini-1.5-flash' :
        'openrouter/free'
      );
      await saveSettings(userId, {
        ai_model: defaultModel,
        ai_provider: process.env.LLM_PROVIDER || 'openrouter',
        language: 'English',
        gmail_poll_interval: 5,
        importance_threshold: 'Medium',
        ignored_categories: ['Spam', 'Promotion'],
        whatsapp_notifications_enabled: true,
        whatsapp_number: '+919542696946',
        analyze_limit: 10
      });
    }

    // Generate local JWT Session token
    const jwtToken = jwt.sign(
      { id: userId, email: userEmail },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Write log
    await addLog(userId, 'INFO', 'GOOGLE_OAUTH', `User "${userEmail}" connected successfully via Google OAuth.`);

    // Set up Gmail push notifications (watch)
    if (tokens.refresh_token) {
      const topicName = process.env.GOOGLE_PUB_SUB_TOPIC;
      if (topicName) {
        try {
          await watchGmailAccount(tokens.refresh_token, topicName);
          await addLog(userId, 'INFO', 'GMAIL_WATCH', `Successfully set up Gmail watch for ${userEmail}.`);

          // Ensure Pub/Sub topic and subscription are configured
          const pubsub = new PubSub();
          const topic = pubsub.topic(topicName);
          const [topicExists] = await topic.exists();
          if (!topicExists) {
            await topic.create();
            console.log(`[Pub/Sub] Created Pub/Sub topic: ${topicName}`);
          }

          const subscriptionName = process.env.GOOGLE_PUB_SUB_SUBSCRIPTION || 'gmail-push-subscription';
          const subscription = topic.subscription(subscriptionName);
          const [subExists] = await subscription.exists();
          if (!subExists) {
            const webhookUrl = process.env.WEBHOOK_URL;
            if (!webhookUrl) {
              throw new Error('WEBHOOK_URL environment variable not set for Pub/Sub push.');
            }
            await subscription.create({
              pushEndpoint: webhookUrl,
              ackDeadlineSeconds: 60,
            });
            console.log(`[Pub/Sub] Created push subscription: ${subscriptionName} -> ${webhookUrl}`);
          }
        } catch (watchErr: any) {
          console.error('Failed to set up Gmail watch:', watchErr);
          await addLog(userId, 'ERROR', 'GMAIL_WATCH', `Failed to set up Gmail watch for ${userEmail}: ${watchErr.message}`);
        }
      } else {
        await addLog(userId, 'WARNING', 'GMAIL_WATCH', 'Gmail watch setup skipped: GOOGLE_PUB_SUB_TOPIC not configured.');
      }
    }

    // Check if this is an "add additional account" flow
    const state = req.query.state as string || '';
    if (state.startsWith('add_account:')) {
      const [flow, existingUserId, existingJwt] = state.split(':');
      if (existingUserId) {
        // Save as additional Gmail account token for the existing user
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
        await addLog(existingUserId, 'INFO', 'GOOGLE_OAUTH', `Additional Gmail account "${userEmail}" connected.`);

        // Set up Gmail push notifications for the additional account
        if (tokens.refresh_token) {
          const topicName = process.env.GOOGLE_PUB_SUB_TOPIC;
          if (topicName) {
            try {
              await watchGmailAccount(tokens.refresh_token, topicName);
              await addLog(existingUserId, 'INFO', 'GMAIL_WATCH', `Successfully set up Gmail watch for ${userEmail}.`);

              // Ensure Pub/Sub topic and subscription are configured
              const pubsub = new PubSub();
              const topic = pubsub.topic(topicName);
              const [topicExists] = await topic.exists();
              if (!topicExists) {
                await topic.create();
                console.log(`[Pub/Sub] Created Pub/Sub topic: ${topicName}`);
              }

              const subscriptionName = process.env.GOOGLE_PUB_SUB_SUBSCRIPTION || 'gmail-push-subscription';
              const subscription = topic.subscription(subscriptionName);
              const [subExists] = await subscription.exists();
              if (!subExists) {
                const webhookUrl = process.env.WEBHOOK_URL;
                if (!webhookUrl) {
                  throw new Error('WEBHOOK_URL environment variable not set for Pub/Sub push.');
                }
                await subscription.create({
                  pushEndpoint: webhookUrl,
                  ackDeadlineSeconds: 60,
                });
                console.log(`[Pub/Sub] Created push subscription: ${subscriptionName} -> ${webhookUrl}`);
              }
            } catch (watchErr: any) {
              console.error('Failed to set up Gmail watch for additional account:', watchErr);
              await addLog(existingUserId, 'ERROR', 'GMAIL_WATCH', `Failed to set up watch for ${userEmail}: ${watchErr.message}`);
            }
          } else {
            await addLog(existingUserId, 'WARNING', 'GMAIL_WATCH', `Watch setup skipped for ${userEmail}: GOOGLE_PUB_SUB_TOPIC not configured.`);
          }
        }

        // Return to dashboard without changing JWT
        return res.redirect(`/?token=${existingJwt || ''}&account_added=true`);
      }
    }

    // Redirect to frontend dashboard with token
    res.redirect(`/?token=${jwtToken}`);
  } catch (err: any) {
    console.error('Google OAuth callback failed:', err);
    res.status(500).send(`Authentication failed: ${err.message || 'unknown error'}`);
  }
});

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// ----------------------------------------------------
// Gmail Multi-Account OAuth — Connect Additional Account
// ----------------------------------------------------
app.get('/api/auth/google/add-account', authenticateToken, (req: AuthenticatedRequest, res) => {
  try {
    // Pass current user's JWT as state so callback knows to ADD, not replace
    const authUrl = getAuthUrl();
    // Append state to tell callback this is an add-account flow
    const urlWithState = authUrl + `&state=add_account:${req.user!.id}:${req.query.token}`;
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
    
    // Check if Google is connected by seeing if we have a valid token
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

// List all connected Gmail accounts for current user
app.get('/api/gmail/accounts', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const accounts = await getAllGoogleTokens(req.user!.id);
    res.json(accounts.map(a => ({
      id: a.id,
      email: a.gmailEmail || req.user!.email,
      connectedAt: a.createdAt,
      isPrimary: !a.gmailEmail
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Remove a specific Gmail account connection
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

    await addLog(req.user!.id, 'INFO', 'CONFIG_UPDATE', 'System preferences and AI classification parameters updated.');

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
    const defaultModel = process.env.LLM_MODEL || (
      process.env.LLM_PROVIDER === 'openai' ? 'gpt-4o-mini' :
      (process.env.LLM_PROVIDER === 'google' || process.env.LLM_PROVIDER === 'gemini') ? 'gemini-1.5-flash' :
      'openrouter/free'
    );
    await saveSettings(userId, {
      ai_model: defaultModel,
      ai_provider: process.env.LLM_PROVIDER || 'openrouter',
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

// Inbox synchronization route
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
    console.error('Manual sync triggered error:', err);
    res.status(500).json({ error: err.message || 'Sync failed.' });
  }
});

// In-memory lock to prevent concurrent sync operations for the same user
const syncingUsers = new Set<string>();

// ----------------------------------------------------
// Inbox Core Synchronization Process
// ----------------------------------------------------

async function runSyncForUser(userId: string): Promise<{ added: number; skipped: number }> {
  if (syncingUsers.has(userId)) {
    console.log(`[Sync] Sync already in progress for user ${userId}. Skipping.`);
    return { added: 0, skipped: 0 };
  }

  syncingUsers.add(userId);

  try {
    await addLog(userId, 'INFO', 'GMAIL_POLL', 'Querying Gmail API check for new unread messages...');

    // Support multiple connected Gmail accounts
    const allTokens = await getAllGoogleTokens(userId);
    // Also check legacy single-token row (gmail_email may be null for old rows)
    if (allTokens.length === 0) {
      const legacyToken = await getOAuthToken(userId);
      if (legacyToken?.refresh_token) {
        allTokens.push({ id: legacyToken.id, gmailEmail: null, refreshToken: legacyToken.refresh_token, accessToken: legacyToken.access_token, createdAt: legacyToken.created_at });
      }
    }

    if (allTokens.length === 0) {
      await addLog(userId, 'ERROR', 'GMAIL_POLL', 'Gmail poll cancelled: No Google account connected.');
      throw new Error('Google Account is not connected. Re-auth via Settings page.');
    }

    const settings = await getSettings(userId);
    if (!settings) {
      throw new Error('User settings missing. Reset application settings.');
    }

    let added = 0;
    let skipped = 0;
    const processedGmailMessageIds = new Set<string>();

    // Loop over each connected Gmail account and fetch emails
    for (const accountToken of allTokens) {
      if (!accountToken.refreshToken) continue;
      const emailsList = await fetchUnreadEmails(accountToken.refreshToken, settings.analyze_limit);
      const accountLabel = accountToken.gmailEmail ? ` [${accountToken.gmailEmail}]` : '';
      if (emailsList.length > 0) {
        await addLog(userId, 'INFO', 'GMAIL_POLL', `Fetched ${emailsList.length} unread email(s) from account${accountLabel}.`);
      }

      for (const rawEmail of emailsList) {
        // Skip if email from another connected account has already been processed in this sync run
        if (rawEmail.id && processedGmailMessageIds.has(rawEmail.id)) {
          skipped++;
          continue;
        }

        // Skip already-processed emails (duplicate guard by gmail_message_id)
        if (rawEmail.id) {
          const alreadyExists = await emailExistsByGmailId(userId, rawEmail.id);
          if (alreadyExists) {
            skipped++;
            continue;
          }
        }

        // Add to processed list for this run
        if (rawEmail.id) {
          processedGmailMessageIds.add(rawEmail.id);
        }

        await addLog(userId, 'INFO', 'AI_ANALYSIS', `Analyzing incoming message from "${rawEmail.from}"...`);

        // Save to DB IMMEDIATELY to prevent re-processing even if AI or WhatsApp fails
        const emailRecordId = await addEmail(userId, {
          gmail_message_id: rawEmail.id,
          from: rawEmail.from,
          subject: rawEmail.subject,
          content: rawEmail.body || rawEmail.snippet,
          summary: rawEmail.snippet || '(Processing...)',
          category: 'Work',
          importance: 'Medium',
          date: rawEmail.date,
          whatsapp_status: 'Pending',
          is_read: false,
          attachments: rawEmail.attachments
        });

        // AI Analysis (with rule-based fallback)
        let category = 'Work';
        let importance: 'High' | 'Medium' | 'Low' = 'Medium';
        let summary = rawEmail.snippet || '(No Content)';
        let aiMetadata: any = null;
        try {
          const analysis = await analyzeEmail(
            rawEmail.from,
            rawEmail.subject,
            rawEmail.body || rawEmail.snippet,
            settings.language,
            settings.ai_provider,
            settings.ai_model
          );
          category = analysis.category;
          importance = analysis.importance;
          summary = analysis.summary;
          aiMetadata = analysis.aiMetadata || null;
        } catch (err: any) {
          console.error(`AI analysis failed for email ${rawEmail.id}:`, err);
          await addLog(userId, 'WARNING', 'AI_FAIL', `LLM analysis failed: ${err.message}. Running rule fallback parser.`);
          const fallback = getFallbackAnalysis(rawEmail.from, rawEmail.subject, rawEmail.body || rawEmail.snippet);
          category = fallback.category;
          importance = fallback.importance;
          summary = fallback.summary;
          aiMetadata = fallback.aiMetadata || null;
        }

        // Skip if category is ignored
        if (settings.ignored_categories.includes(category)) {
          await addLog(userId, 'WARNING', 'OMIT_FILTER', `Omitted message from "${rawEmail.from}" (category "${category}" is ignored).`);
          try { await markEmailAsRead(accountToken.refreshToken, rawEmail.id); } catch (_) {}
          skipped++;
          continue;
        }

        // WhatsApp Push Alert
        let whatsappStatus = 'Disabled';
        let whatsappMsgId: string | undefined = undefined;
        let deliveryErr: string | undefined = undefined;
        const importanceThresholds: Record<string, number> = { Low: 1, Medium: 2, High: 3 };
        const thresholdVal = importanceThresholds[settings.importance_threshold] || 2;
        const emailImportanceVal = importanceThresholds[importance] || 2;
        if (settings.whatsapp_notifications_enabled && emailImportanceVal >= thresholdVal && settings.whatsapp_number) {
          try {
            await addLog(userId, 'INFO', 'WHATSAPP_PUSH', `Urgent alert triggered. Routing alert summary to WhatsApp number ${settings.whatsapp_number}...`);
            const pushResult = await sendWhatsAppAlert(settings.whatsapp_number, { from: rawEmail.from, subject: rawEmail.subject, category, importance, summary }, aiMetadata);
            whatsappStatus = pushResult.status;
            whatsappMsgId = pushResult.messageId;
            deliveryErr = pushResult.error;
            if (pushResult.status === 'Sent') {
              await addLog(userId, 'INFO', 'WHATSAPP_PUSH', `WhatsApp notification dispatched successfully (ID: ${pushResult.messageId}).`);
              // Send voice summary for High priority emails if enabled
              if (importance === 'High' && process.env.WHATSAPP_VOICE_ENABLED === 'true') {
                const voiceText = `Urgent email. From ${rawEmail.from.split('<')[0].trim()}. Subject: ${rawEmail.subject}. Summary: ${summary}`;
                sendWhatsAppVoiceSummary(settings.whatsapp_number, voiceText).then(vr => {
                  if (vr.status === 'Sent') console.log('[Voice] Voice summary sent.');
                  else console.warn('[Voice] Voice summary failed:', vr.error);
                });
              }
            } else {
              await addLog(userId, 'ERROR', 'WHATSAPP_PUSH', `WhatsApp notification delivery failed: ${pushResult.error}`);
            }
          } catch (waErr: any) {
            whatsappStatus = 'Failed';
            deliveryErr = waErr.message || 'WhatsApp routing exception';
            await addLog(userId, 'ERROR', 'WHATSAPP_PUSH', `WhatsApp routing system failed: ${deliveryErr}`);
          }
        }

        // Update DB record with final analysis results
        const db = await getDb();
        db.prepare(
          `UPDATE emails SET category=?, importance=?, summary=?, whatsapp_status=?, whatsapp_message_id=?, delivery_error=?, ai_metadata=? WHERE id=?`
        ).run(category, importance, summary, whatsappStatus, whatsappMsgId || null, deliveryErr || null, aiMetadata ? JSON.stringify(aiMetadata) : null, emailRecordId);

        // Mark as read in Gmail
        try { await markEmailAsRead(accountToken.refreshToken, rawEmail.id); } catch (_) {}

        await addLog(userId, 'INFO', 'ROUTER_MATCH', `Email synced & logged under [Category: ${category} | Priority: ${importance}].`);
        added++;
      } // end for rawEmail
    } // end for accountToken

    await addLog(userId, 'INFO', 'GMAIL_POLL', `Sync complete. ${added} emails added, ${skipped} skipped.`);
    return { added, skipped };
  } finally {
    syncingUsers.delete(userId);
  }
}

// ----------------------------------------------------
// Background Sync Daemon
// ----------------------------------------------------

// In-memory per-user last sync timestamp to prevent runaway loops
const lastSyncTime = new Map<string, number>();

async function startSyncDaemon() {
  console.log('Background Sync Daemon activated.');
  
  // Check every 60 seconds
  setInterval(async () => {
    try {
      const database = await initDb();
      const tokens = database.prepare("SELECT DISTINCT user_id FROM oauth_tokens WHERE provider = 'google'").all();
      
      for (const t of tokens as any[]) {
        const userId = (t as any).user_id;
        const settings = await getSettings(userId);
        if (!settings) continue;

        const pollIntervalMs = (settings.gmail_poll_interval || 5) * 60 * 1000;
        const lastSync = lastSyncTime.get(userId) || 0;
        const elapsed = Date.now() - lastSync;

        if (elapsed >= pollIntervalMs) {
          console.log(`[Daemon] Triggering background sync for user ${userId}...`);
          lastSyncTime.set(userId, Date.now()); // Set BEFORE running to prevent concurrent triggers
          runSyncForUser(userId).catch((err) => {
            console.error(`[Daemon] Sync failed for user ${userId}:`, err);
          });
        }
      }
    } catch (daemonErr) {
      console.error('[Daemon] Error in background sync interval loop:', daemonErr);
    }
  }, 60 * 1000);
}

startSyncDaemon();


// ----------------------------------------------------
// Daily Digest Scheduler (Every morning at 8:00 AM IST)
// ----------------------------------------------------
async function startDailyDigestScheduler() {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // IST = UTC+5:30

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
      const tokens = database.prepare('SELECT DISTINCT user_id FROM oauth_tokens WHERE provider = ?').all('google');
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

      for (const t of tokens) {
        const userId = t.user_id;
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

        console.log(`[Digest] Sending daily digest to user ${userId} with ${stats.total} emails...`);
        const result = await sendWhatsAppDigest(settings.whatsapp_number, stats);
        if (result.status === 'Sent') {
          await addLog(userId, 'INFO', 'DAILY_DIGEST', `Daily digest sent: ${stats.total} emails, ${stats.high} urgent.`);
        } else {
          await addLog(userId, 'WARNING', 'DAILY_DIGEST', `Daily digest failed: ${result.error}`);
        }
      }
    } catch (err: any) {
      console.error('[Digest] Daily digest failed:', err.message);
    }

    // Schedule next digest
    setTimeout(scheduleDigest, msUntilNextDigest());
  };

  const delayMs = msUntilNextDigest();
  console.log(`[Digest] Daily digest scheduled. Next trigger in ${Math.round(delayMs / 60000)} minutes.`);
  setTimeout(scheduleDigest, delayMs);
}

startDailyDigestScheduler();

// ----------------------------------------------------
// Gmail Pub/Sub Push Webhook (Instant Email Detection)
// ----------------------------------------------------
app.post('/webhook/gmail', async (req, res) => {
  try {
    const body = req.body;
    if (!body?.message?.data) {
      return res.status(200).send('OK'); // Acknowledge invalid messages
    }

    // Decode base64 Pub/Sub message
    const rawData = Buffer.from(body.message.data, 'base64').toString('utf8');
    const notification = JSON.parse(rawData);
    const historyId = notification.historyId;
    const emailAddress = notification.emailAddress;

    if (!emailAddress) {
      return res.status(200).send('OK');
    }

    console.log(`[Pub/Sub] Gmail push received for ${emailAddress}, historyId: ${historyId}`);

    // Find user by email and trigger sync
    const database = await getDb();
    const user = database.prepare('SELECT id FROM users WHERE email = ?').get(emailAddress);
    if (user) {
      console.log(`[Pub/Sub] Triggering instant sync for user ${user.id}...`);
      runSyncForUser(user.id).catch((err) => {
        console.error(`[Pub/Sub] Instant sync failed for user ${user.id}:`, err.message);
      });
    }

    res.status(200).send('OK');
  } catch (err: any) {
    console.error('[Pub/Sub] Webhook error:', err.message);
    res.status(200).send('OK'); // Always ACK to prevent Pub/Sub retry storm
  }
});

// ----------------------------------------------------
// DevOps / Health Check Endpoint
// ----------------------------------------------------
app.get('/health', (_req, res) => {
  res.json({
    status: 'OK',
    uptime: process.uptime(),
    timestamp: Date.now()
  });
});

// ----------------------------------------------------
// Privacy Policy Endpoint (Meta App Review Compliance)
// ----------------------------------------------------
app.get('/privacy', (_req, res) => {
  res.send(`
    <html>
      <head>
        <title>Privacy Policy - Mail2WhatsApp</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; line-height: 1.6; color: #333; }
          h1 { color: #111; border-bottom: 1px solid #eee; padding-bottom: 10px; }
          h2 { color: #333; margin-top: 30px; }
        </style>
      </head>
      <body>
        <h1>Privacy Policy</h1>
        <p><strong>Last updated:</strong> July 5, 2026</p>
        <p>Mail2WhatsApp ("we", "our", or "us") operates this notification gateway tool. We are committed to protecting your privacy and security.</p>
        <h2>1. Information Processing</h2>
        <p>Our application processes incoming email headers and summaries from your connected Gmail account for the sole purpose of analyzing urgency levels and routing priority notifications to your configured WhatsApp number.</p>
        <h2>2. Data Storage & Privacy</h2>
        <p>All database logs, configuration files, and authentication tokens are stored locally on your own private server and are never shared, uploaded, or exposed to third-party services, except for the required Google and Meta API endpoints.</p>
        <h2>3. Third-Party Services</h2>
        <p>This service utilizes the Google Gmail API for mail synchronization and the Meta Graph API for message dispatch. Your use of these integrations is governed by their respective privacy policies.</p>
        <h2>4. Contact</h2>
        <p>For any privacy concerns, please contact your system administrator.</p>
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
  // Integrate Vite dev server middleware dynamically
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
