import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { env } from '../../config/env.config';
import { processOutboxBatch } from '../whatsapp/outbox.worker';

let redisClient: Redis | null = null;
let isRedisAvailable = false;

// Initialize Redis connection
export function getRedisClient(): Redis | null {
  if (redisClient) return redisClient;

  // Only attempt Redis connection if explicitly configured
  const redisEnabled = env.REDIS_URL || process.env.REDIS_ENABLED === 'true';
  if (!redisEnabled) {
    return null;
  }

  try {
    const redisOptions: any = env.REDIS_URL 
      ? env.REDIS_URL 
      : {
          host: env.REDIS_HOST || '127.0.0.1',
          port: env.REDIS_PORT || 6379,
          password: env.REDIS_PASSWORD || undefined,
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
          retryStrategy: (times: number) => {
            if (times > 2) {
              return null; // Stop retrying quickly if Redis is not running
            }
            return 1000;
          }
        };

    redisClient = new Redis(redisOptions);

    redisClient.on('connect', () => {
      isRedisAvailable = true;
      console.log('✅ Redis connected successfully for BullMQ background queues.');
    });

    redisClient.on('error', (_err) => {
      isRedisAvailable = false;
    });

    return redisClient;
  } catch {
    isRedisAvailable = false;
    return null;
  }
}

export function isRedisConnected(): boolean {
  return isRedisAvailable;
}

// Queue Definitions
let emailProcessingQueue: Queue | null = null;
let whatsappOutboxQueue: Queue | null = null;
let gmailSyncQueue: Queue | null = null;

export function initQueues() {
  const redisEnabled = env.REDIS_URL || process.env.REDIS_ENABLED === 'true';
  if (!redisEnabled) {
    console.log('[Queue] Redis background queue not enabled. Running with native SQLite persistent outbox worker.');
    return;
  }

  const client = getRedisClient();
  if (!client) return;

  try {
    const connection = {
      host: env.REDIS_HOST || '127.0.0.1',
      port: env.REDIS_PORT || 6379,
      password: env.REDIS_PASSWORD || undefined
    };

    emailProcessingQueue = new Queue('email-processing', { connection });
    whatsappOutboxQueue = new Queue('whatsapp-outbox', { connection });
    gmailSyncQueue = new Queue('gmail-sync', { connection });

    // BullMQ WhatsApp Outbox Worker
    new Worker('whatsapp-outbox', async (_job) => {
      await processOutboxBatch();
    }, { connection, concurrency: 2 });

    console.log('BullMQ Queues initialized: [email-processing, whatsapp-outbox, gmail-sync].');
  } catch (err: any) {
    console.warn('[Queue] Running with native SQLite persistent outbox fallback:', err.message);
  }
}

export async function enqueueEmailProcessingJob(data: any, jobId?: string) {
  if (emailProcessingQueue && isRedisAvailable) {
    return await emailProcessingQueue.add('process-email', data, {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true
    });
  }
}

export async function enqueueWhatsAppOutboxJob(data: any, jobId?: string) {
  if (whatsappOutboxQueue && isRedisAvailable) {
    return await whatsappOutboxQueue.add('dispatch-whatsapp', data, {
      jobId,
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true
    });
  }
}

export async function closeQueues() {
  if (emailProcessingQueue) await emailProcessingQueue.close();
  if (whatsappOutboxQueue) await whatsappOutboxQueue.close();
  if (gmailSyncQueue) await gmailSyncQueue.close();
  if (redisClient) await redisClient.quit();
}
