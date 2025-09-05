// src/utils/logger.ts
import pino from 'pino';
import cfg from '../config';

export const logger = pino({ 
  level: cfg.logLevel, 
  redact: ['req.headers.authorization', 'access_token', 'refresh_token'] 
});