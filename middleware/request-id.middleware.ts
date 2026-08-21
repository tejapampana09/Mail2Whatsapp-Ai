import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const incomingRequestId = req.headers['x-request-id'];
  const requestId = (typeof incomingRequestId === 'string' && incomingRequestId.length > 0)
    ? incomingRequestId
    : crypto.randomUUID();

  (req as any).requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
}
