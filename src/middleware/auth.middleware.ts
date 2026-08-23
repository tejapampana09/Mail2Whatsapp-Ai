import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.config';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
  requestId?: string;
}

export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : undefined;

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

  jwt.verify(token, env.JWT_SECRET, (err, decoded: any) => {
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
    req.user = decoded;
    next();
  });
}
