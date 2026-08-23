import { env } from '../../config/env.config';
import { metricsService } from '../metrics/metrics.service';
import {
  getPendingOutboxJobs,
  claimOutboxJob,
  updateOutboxJobStatus,
  resetStaleOutboxJobs
} from '../../database/db';
import { classifyWhatsAppError } from './whatsapp.types';

async function executeMetaGraphDispatch(payload: any): Promise<{ success: boolean; messageId?: string; error?: string; isTransient?: boolean }> {
  const token = env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneId) {
    return { success: false, error: 'WhatsApp credentials missing in environment.', isTransient: false };
  }

  const url = 'https://graph.facebook.com/v20.0/' + phoneId + '/messages';

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000)
    });

    let resJson: any = null;
    try {
      resJson = await res.json();
    } catch {
      resJson = null;
    }

    if (!res.ok) {
      const classified = classifyWhatsAppError(res.status, resJson?.error);
      return {
        success: false,
        error: classified.message,
        isTransient: classified.isTransient
      };
    }

    const messageId = resJson?.messages?.[0]?.id;
    return { success: true, messageId };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'WhatsApp network timeout',
      isTransient: true
    };
  }
}

let isBatchRunning = false;
let hasPendingRerun = false;
let workerStarted = false;

export async function processOutboxBatch(): Promise<{ processed: number; sent: number; retried: number; failed: number }> {
  if (isBatchRunning) {
    hasPendingRerun = true;
    return { processed: 0, sent: 0, retried: 0, failed: 0 };
  }

  isBatchRunning = true;

  try {
    metricsService.increment('worker_runs_total');
    await resetStaleOutboxJobs(env.WHATSAPP_STALE_TIMEOUT_MS);

    const pendingJobs = await getPendingOutboxJobs(env.WHATSAPP_BATCH_SIZE);
    let processed = 0;
    let sent = 0;
    let retried = 0;
    let failed = 0;
    const workerId = 'worker_' + process.pid + '_' + Date.now();

    for (const job of pendingJobs) {
      const claimed = await claimOutboxJob(job.id, workerId, 60000);
      if (!claimed) continue;

      processed++;
      let payload: any = null;
      try {
        payload = JSON.parse(job.payload);
      } catch {
        await updateOutboxJobStatus(job.id, 'DEAD_LETTER', { lastError: 'Malformed payload JSON' });
        failed++;
        continue;
      }

      const startTime = Date.now();
      let dispatchResult = await executeMetaGraphDispatch(payload);
      metricsService.recordLatency(Date.now() - startTime);

      if (!dispatchResult.success && payload.type === 'template' && (dispatchResult.error?.includes('132018') || dispatchResult.error?.includes('132001'))) {
        const fallbackText = payload.template?.components?.[0]?.parameters?.[4]?.text || 'Urgent Email Notification';
        payload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: job.phone_number,
          type: 'text',
          text: { preview_url: false, body: `📬 *Email Alert*\n━━━━━━━━━━━━━━━\n${fallbackText}\n━━━━━━━━━━━━━━━\n🤖 _Mail2WhatsApp AI_` }
        };
        dispatchResult = await executeMetaGraphDispatch(payload);
      }

      if (dispatchResult.success) {
        await updateOutboxJobStatus(job.id, 'SENT', {
          providerMessageId: dispatchResult.messageId
        });
        metricsService.increment('whatsapp_sent_total');
        sent++;
      } else {
        const nextAttemptCount = job.attempt_count + 1;
        const isTransient = dispatchResult.isTransient !== false;

        if (isTransient && nextAttemptCount <= env.WHATSAPP_MAX_RETRIES) {
          // Exponential backoff with randomized jitter
          const baseDelay = Math.min(15 * 60 * 1000, 5000 * Math.pow(2, nextAttemptCount - 1));
          const jitter = Math.floor(baseDelay * (0.8 + Math.random() * 0.4));
          const nextAttemptAt = Date.now() + jitter;

          await updateOutboxJobStatus(job.id, 'PENDING', {
            attemptCount: nextAttemptCount,
            nextAttemptAt,
            lastError: dispatchResult.error
          });
          metricsService.increment('whatsapp_retry_total');
          retried++;
        } else {
          await updateOutboxJobStatus(job.id, 'DEAD_LETTER', {
            attemptCount: nextAttemptCount,
            lastError: dispatchResult.error
          });
          metricsService.increment('whatsapp_failed_total');
          failed++;
        }
      }
    }

    return { processed, sent, retried, failed };
  } finally {
    isBatchRunning = false;
    if (hasPendingRerun) {
      hasPendingRerun = false;
      setImmediate(() => {
        processOutboxBatch().catch((err) => {
          console.error('[Outbox Worker] Pending batch rerun exception:', err.message);
        });
      });
    }
  }
}

let outboxInterval: NodeJS.Timeout | null = null;

export function startOutboxWorker() {
  if (outboxInterval || workerStarted) return;
  workerStarted = true;
  resetStaleOutboxJobs(env.WHATSAPP_STALE_TIMEOUT_MS).catch(() => {});
  
  outboxInterval = setInterval(async () => {
    try {
      await processOutboxBatch();
    } catch (err: any) {
      console.error('[Outbox Worker] Batch processing exception:', err.message);
    }
  }, env.WHATSAPP_POLL_INTERVAL_MS);
  console.log('Persistent WhatsApp Outbox Worker activated.');
}

export function stopOutboxWorker() {
  if (outboxInterval) {
    clearInterval(outboxInterval);
    outboxInterval = null;
  }
  workerStarted = false;
}
