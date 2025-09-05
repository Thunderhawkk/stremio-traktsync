// src/middleware/healthTracking.js
// Middleware for tracking request performance and health metrics

const healthMonitor = require('../services/healthMonitor');
const { logger } = require('../utils/logger');

/**
 * Middleware to track request performance and record metrics
 */
function trackHealth(req, res, next) {
  const startTime = Date.now();
  
  // Override res.end to capture response time
  const originalEnd = res.end;
  res.end = function(...args) {
    const responseTime = Date.now() - startTime;
    const isError = res.statusCode >= 400;
    
    // Record metrics
    healthMonitor.recordResponseTime(responseTime);
    healthMonitor.recordRequest(isError);
    
    // Log slow requests
    if (responseTime > 2000) {
      logger.warn({
        method: req.method,
        url: req.url,
        responseTime,
        statusCode: res.statusCode,
        userAgent: req.get('User-Agent')
      }, 'slow_request_detected');
    }
    
    // Log errors
    if (isError) {
      logger.warn({
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        responseTime,
        userAgent: req.get('User-Agent')
      }, 'error_request_tracked');
    }
    
    originalEnd.apply(res, args);
  };
  
  next();
}

module.exports = {
  trackHealth
};