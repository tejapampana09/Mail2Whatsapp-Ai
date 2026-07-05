import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import logger from './logger.service';
import { analyzeEmail, getFallbackAnalysis } from './ai';
import { sendWhatsAppAlert } from './whatsapp';
import { getSettings, markEmailAsRead, addEmail, getDb, emailExistsByGmailId, getAllGoogleTokens } from './db';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null
});

export const emailQueue = new Queue('email-processing', { connection });

const worker = new Worker('email-processing', async job => {
  const { rawEmail, userId, refreshToken } = job.data;

  logger.info({ userId, type: 'QUEUE_PROCESS', description: `Processing email ${rawEmail.id} from queue.` });

  try {
    const settings = await getSettings(userId);
    if (!settings) {
      throw new Error('User settings missing. Reset application settings.');
    }

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
      logger.warn({ userId, type: 'AI_FAIL', description: `LLM analysis failed: ${err.message}. Running rule fallback parser.` });
      const fallback = getFallbackAnalysis(rawEmail.from, rawEmail.subject, rawEmail.body || rawEmail.snippet);
      category = fallback.category;
      importance = fallback.importance;
      summary = fallback.summary;
      aiMetadata = fallback.aiMetadata || null;
    }

    // Skip if category is ignored
    if (settings.ignored_categories.includes(category)) {
      logger.warn({ userId, type: 'OMIT_FILTER', description: `Omitted message from "${rawEmail.from}" (category "${category}" is ignored).` });
      try { await markEmailAsRead(refreshToken, rawEmail.id); } catch (_) {}
      return;
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
        logger.info({ userId, type: 'WHATSAPP_PUSH', description: `Urgent alert triggered. Routing alert summary to WhatsApp number ${settings.whatsapp_number}...` });
        const pushResult = await sendWhatsAppAlert(settings.whatsapp_number, { from: rawEmail.from, subject: rawEmail.subject, category, importance, summary }, aiMetadata, userId);
        whatsappStatus = pushResult.status;
        whatsappMsgId = pushResult.messageId;
        deliveryErr = pushResult.error;
        if (pushResult.status === 'Sent') {
          logger.info({ userId, type: 'WHATSAPP_PUSH', description: `WhatsApp notification dispatched successfully (ID: ${pushResult.messageId}).` });
        } else {
          logger.error({ userId, type: 'WHATSAPP_PUSH', description: `WhatsApp notification delivery failed: ${deliveryErr}` });
        }
      } catch (waErr: any) {
        whatsappStatus = 'Failed';
        deliveryErr = waErr.message || 'WhatsApp routing exception';
        logger.error({ userId, type: 'WHATSAPP_PUSH', description: `WhatsApp routing system failed: ${deliveryErr}` });
      }
    }

    // Update DB record with final analysis results
    const db = await getDb();
    await db.query(
      `UPDATE emails SET category=$1, importance=$2, summary=$3, whatsapp_status=$4, whatsapp_message_id=$5, delivery_error=$6, ai_metadata=$7 WHERE user_id=$8 AND gmail_message_id=$9`,
      [category, importance, summary, whatsappStatus, whatsappMsgId || null, deliveryErr || null, aiMetadata ? JSON.stringify(aiMetadata) : null, userId, rawEmail.id]
    );

    // Mark as read in Gmail
    try { await markEmailAsRead(refreshToken, rawEmail.id); } catch (_) {}

    logger.info({ userId, type: 'ROUTER_MATCH', description: `Email synced & logged under [Category: ${category} | Priority: ${importance}].` });

  } catch (error: any) {
    logger.error({ userId, type: 'QUEUE_FAIL', description: `Failed to process email ${rawEmail.id}: ${error.message}` });
    throw error; // Throw error to let BullMQ handle retry
  }
}, { connection });

worker.on('failed', (job, err) => {
  logger.error({ userId: job?.data.userId, type: 'QUEUE_WORKER_FAIL', description: `Job ${job?.id} failed: ${err.message}` });
});

logger.info({ type: 'QUEUE_INIT', description: 'Email processing queue and worker initialized.' });
