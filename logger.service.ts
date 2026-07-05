import pino from 'pino';
import { addLog } from './db';

const isProduction = process.env.NODE_ENV === 'production';

const pinoLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: isProduction ? undefined : {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

interface LogDetails {
  userId?: string;
  type: string;
  description: string;
}

class Logger {
  private async log(level: 'INFO' | 'WARNING' | 'ERROR', details: LogDetails) {
    const { userId, type, description } = details;

    if (userId) {
      try {
        await addLog(userId, level, type, description);
      } catch (dbError) {
        pinoLogger.error({
          msg: 'Failed to write log to database',
          err: dbError,
          originalLog: details
        });
      }
    }

    const pinoDetails = {
      userId,
      type,
      description
    };

    switch (level) {
      case 'INFO':
        pinoLogger.info(pinoDetails, description);
        break;
      case 'WARNING':
        pinoLogger.warn(pinoDetails, description);
        break;
      case 'ERROR':
        pinoLogger.error(pinoDetails, description);
        break;
    }
  }

  info(details: LogDetails) {
    this.log('INFO', details);
  }

  warn(details: LogDetails) {
    this.log('WARNING', details);
  }

  error(details: LogDetails) {
    this.log('ERROR', details);
  }
}

const logger = new Logger();
export default logger;
