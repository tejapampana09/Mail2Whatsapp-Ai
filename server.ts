import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

import {
  initDb,
  getDb,
  upsertUser,
  getOAuthToken,
  saveOAuthToken,
  deleteOAuthToken,
  getSettings,
  saveSettings,
  getEmails,
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
  markEmailAsRead
} from './gmail.ts';

import {
  analyzeEmail,
  getFallbackAnalysis
} from './ai.ts';

import {
  sendWhatsAppAlert,
  checkWhatsAppConfig
} from './whatsapp.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'default-super-secure-local-jwt-secret-key-123456';

// Initialize Database
initDb().then(() => {
  console.log('SQLite Database initialized successfully.');
}).catch((err) => {
  console.error('Failed to initialize database:', err);
});

const app = express();

// Security Middlewares
app.use(cors());
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
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

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
    console.error('Google OAuth URL generation failed:', err);
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
// Secured API Endpoints (Required JWT Authentication)
// ----------------------------------------------------

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

// ----------------------------------------------------
// Inbox Core Synchronization Process
// ----------------------------------------------------

async function runSyncForUser(userId: string): Promise<{ added: number; skipped: number }> {
  await addLog(userId, 'INFO', 'GMAIL_POLL', 'Querying Gmail API check for new unread messages...');

  const token = await getOAuthToken(userId);
  if (!token || !token.refresh_token) {
    await addLog(userId, 'ERROR', 'GMAIL_POLL', 'Gmail poll cancelled: Google account is not connected.');
    throw new Error('Google Account is not connected. Re-auth via Settings page.');
  }

  const settings = await getSettings(userId);
  if (!settings) {
    throw new Error('User settings missing. Reset application settings.');
  }

  const emailsList = await fetchUnreadEmails(token.refresh_token, settings.analyze_limit);
  let added = 0;
  let skipped = 0;

  for (const rawEmail of emailsList) {
    // Skip already-processed emails (duplicate guard by gmail_message_id)
    if (rawEmail.id) {
      const alreadyExists = await emailExistsByGmailId(userId, rawEmail.id);
      if (alreadyExists) {
        skipped++;
        continue;
      }
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
    } catch (err: any) {
      console.error(`AI analysis failed for email ${rawEmail.id}:`, err);
      await addLog(userId, 'WARNING', 'AI_FAIL', `LLM analysis failed: ${err.message}. Running rule fallback parser.`);
      const fallback = getFallbackAnalysis(rawEmail.from, rawEmail.subject, rawEmail.body || rawEmail.snippet);
      category = fallback.category;
      importance = fallback.importance;
      summary = fallback.summary;
    }

    // Skip if category is ignored
    if (settings.ignored_categories.includes(category)) {
      await addLog(userId, 'WARNING', 'OMIT_FILTER', `Omitted message from "${rawEmail.from}" (category "${category}" is ignored).`);
      try { await markEmailAsRead(token.refresh_token, rawEmail.id); } catch (_) {}
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
        const pushResult = await sendWhatsAppAlert(settings.whatsapp_number, { from: rawEmail.from, subject: rawEmail.subject, category, importance, summary });
        whatsappStatus = pushResult.status;
        whatsappMsgId = pushResult.messageId;
        deliveryErr = pushResult.error;
        if (pushResult.status === 'Sent') {
          await addLog(userId, 'INFO', 'WHATSAPP_PUSH', `WhatsApp notification dispatched successfully (ID: ${pushResult.messageId}).`);
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
    await db.run(
      `UPDATE emails SET category=?, importance=?, summary=?, whatsapp_status=?, whatsapp_message_id=?, delivery_error=? WHERE id=?`,
      category, importance, summary, whatsappStatus, whatsappMsgId || null, deliveryErr || null, emailRecordId
    );

    // Mark as read in Gmail
    try { await markEmailAsRead(token.refresh_token, rawEmail.id); } catch (_) {}

    await addLog(userId, 'INFO', 'ROUTER_MATCH', `Email synced & logged under [Category: ${category} | Priority: ${importance}].`);
    added++;
  }

  await addLog(userId, 'INFO', 'GMAIL_POLL', `Sync complete. ${added} emails added, ${skipped} skipped.`);
  return { added, skipped };
}

// ----------------------------------------------------
// Background Sync Daemon
// ----------------------------------------------------

async function startSyncDaemon() {
  console.log('Background Sync Daemon activated.');
  
  // Check every 60 seconds
  setInterval(async () => {
    try {
      const database = await initDb();
      // Query all users that have Google credentials
      const tokens = await database.all("SELECT user_id FROM oauth_tokens WHERE provider = 'google'");
      
      for (const t of tokens) {
        const userId = t.user_id;
        const settings = await getSettings(userId);
        if (!settings) continue;

        const pollIntervalMin = settings.gmail_poll_interval || 5;

        // Query the latest GMAIL_POLL log to see when the last poll occurred
        const lastPollLog = await database.get(
          "SELECT created_at FROM logs WHERE user_id = ? AND type = 'GMAIL_POLL' ORDER BY created_at DESC LIMIT 1",
          userId
        );

        let runSync = false;
        if (!lastPollLog) {
          runSync = true;
        } else {
          const lastPollTime = new Date(lastPollLog.created_at).getTime();
          const elapsedMin = (Date.now() - lastPollTime) / (60 * 1000);
          if (elapsedMin >= pollIntervalMin) {
            runSync = true;
          }
        }

        if (runSync) {
          console.log(`[Daemon] Triggering background sync for user ${userId}...`);
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
