import { Request, Response, NextFunction } from 'express';

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

export function rateLimiter(req: Request, res: Response, next: NextFunction) {
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
