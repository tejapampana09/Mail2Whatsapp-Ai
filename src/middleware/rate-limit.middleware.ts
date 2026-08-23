import { Request, Response, NextFunction } from 'express';
import { getRedisClient, isRedisConnected } from '../services/queue/queue.service';

const rateLimitWindowSeconds = 15 * 60;
const rateLimitWindowMs = rateLimitWindowSeconds * 1000;
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

export async function rateLimiter(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const requestId = (req as any).requestId;

  // 1. Distributed Redis Rate Limiting (Horizontally Scalable)
  if (isRedisConnected()) {
    const redis = getRedisClient();
    if (redis) {
      try {
        const key = `ratelimit:${ip}`;
        const currentCount = await redis.incr(key);
        if (currentCount === 1) {
          await redis.expire(key, rateLimitWindowSeconds);
        }

        if (currentCount > rateLimitMaxRequests) {
          return res.status(429).json({
            success: false,
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'Too many requests. Please try again later.',
              requestId
            }
          });
        }
        return next();
      } catch {
        // Fallback to local memory if Redis call fails
      }
    }
  }

  // 2. In-Memory Process Rate Limiter (Fallback)
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
        requestId
      }
    });
  }
  
  next();
}
