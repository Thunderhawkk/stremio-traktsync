const { logger } = require('../utils/logger');

function notFound(req, res) {
  res.status(404).json({ error: 'not_found' });
}

function errorHandler(err, req, res, next) { // eslint-disable-line
  logger.error({ err }, 'unhandled_error');
  if (res.headersSent) return;
  res.status(err.status || 500).json({ error: 'server_error' });
}

module.exports = { notFound, errorHandler };
