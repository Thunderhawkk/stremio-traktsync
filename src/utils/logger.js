const pino = require('pino');
const cfg = require('../config');

const logger = pino({ level: cfg.logLevel, redact: ['req.headers.authorization', 'access_token', 'refresh_token'] });

module.exports = { logger };
