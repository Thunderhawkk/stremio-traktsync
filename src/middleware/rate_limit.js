// src/middleware/rate_limit.js
// Enhanced Express rate-limiting with adaptive limits and monitoring

const rateLimit = require('express-rate-limit');
const { logger } = require('../utils/logger');

// Store for tracking rate limit violations
const violationStore = new Map();

// Enhanced rate limiter with logging and adaptive behavior
function createEnhancedLimiter(options) {
  const {
    windowMs,
    max,
    name,
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    keyGenerator = (req) => req.ip,
    handler = null,
    adaptiveScaling = false
  } = options;

  // Custom handler with logging
  const customHandler = (req, res, next, options) => {
    const key = keyGenerator(req);
    const identifier = `${name}_${key}`;
    
    // Track violations
    const now = Date.now();
    if (!violationStore.has(identifier)) {
      violationStore.set(identifier, { count: 0, firstViolation: now, lastViolation: now });
    }
    
    const violation = violationStore.get(identifier);
    violation.count++;
    violation.lastViolation = now;
    
    // Log rate limit violation
    logger.warn({
      rateLimiter: name,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      method: req.method,
      violationCount: violation.count,
      windowMs,
      maxRequests: max
    }, 'rate_limit_exceeded');
    
    // Adaptive response based on violation history
    let statusCode = 429;
    let retryAfter = Math.ceil(windowMs / 1000);
    
    if (adaptiveScaling && violation.count > 5) {
      // Exponential backoff for repeat offenders
      retryAfter = Math.min(retryAfter * Math.pow(2, Math.min(violation.count - 5, 4)), 3600); // Max 1 hour
      statusCode = 429;
    }
    
    res.status(statusCode)
       .set('Retry-After', retryAfter)
       .json({ 
         error: 'rate_limit_exceeded',
         message: `Too many requests to ${name}. Try again in ${retryAfter} seconds.`,
         retryAfter
       });
  };

  return rateLimit({
    windowMs,
    max: adaptiveScaling ? (req) => {
      const key = keyGenerator(req);
      const identifier = `${name}_${key}`;
      const violation = violationStore.get(identifier);
      
      // Reduce limit for repeat offenders
      if (violation && violation.count > 3) {
        return Math.max(Math.floor(max * 0.5), 1);
      }
      return max;
    } : max,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests,
    skipFailedRequests,
    keyGenerator,
    handler: handler || customHandler,
    skip: (req) => {
      // Skip rate limiting for health checks
      if (req.path === '/healthz' || req.path.startsWith('/api/health/status')) {
        return true;
      }
      return false;
    }
  });
}

// App-level default (600 req / 15m per IP)
const limiterApp = createEnhancedLimiter({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RL_APP_MAX || 600),
  name: 'app',
  adaptiveScaling: true
});

// Strict for auth (20 req / 15m)
const limiterAuthStrict = createEnhancedLimiter({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RL_AUTH_MAX || 20),
  name: 'auth',
  skipSuccessfulRequests: false,
  skipFailedRequests: true, // Don't count failed auth attempts toward limit
  adaptiveScaling: true
});

// API endpoints with user-based rate limiting
const limiterAPI = createEnhancedLimiter({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RL_API_MAX || 300),
  name: 'api',
  keyGenerator: (req) => {
    // Use user ID if authenticated, otherwise IP
    return req.user?.id || req.ip;
  },
  adaptiveScaling: true
});

// Dashboard-specific rate limiting
const limiterDashboard = createEnhancedLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: Number(process.env.RL_DASHBOARD_MAX || 100),
  name: 'dashboard',
  keyGenerator: (req) => req.user?.id || req.ip
});

// Strict for Trakt device flow
const limiterTraktDevice = createEnhancedLimiter({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RL_TRAKT_DEVICE_MAX || 60),
  name: 'trakt_device',
  adaptiveScaling: true
});

// Light for status checks
const limiterStatusLight = createEnhancedLimiter({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RL_STATUS_MAX || 240),
  name: 'status'
});

// Heavy operations (list refresh, analytics)
const limiterHeavyOps = createEnhancedLimiter({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RL_HEAVY_MAX || 10),
  name: 'heavy_ops',
  keyGenerator: (req) => req.user?.id || req.ip,
  adaptiveScaling: true
});

// Session management operations
const limiterSession = createEnhancedLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: Number(process.env.RL_SESSION_MAX || 30),
  name: 'session',
  keyGenerator: (req) => req.user?.id || req.ip
});

// Health monitoring endpoints
const limiterHealth = createEnhancedLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: Number(process.env.RL_HEALTH_MAX || 60),
  name: 'health',
  keyGenerator: (req) => req.user?.id || req.ip
});

// Cleanup old violation records periodically
setInterval(() => {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  
  let cleaned = 0;
  for (const [key, violation] of violationStore.entries()) {
    if (now - violation.lastViolation > maxAge) {
      violationStore.delete(key);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    logger.info({ cleanedViolations: cleaned }, 'rate_limit_violations_cleaned');
  }
}, 60 * 60 * 1000); // Run every hour

// Rate limit status endpoint
function getRateLimitStatus(req, res) {
  const stats = {
    activeViolations: violationStore.size,
    limits: {
      app: process.env.RL_APP_MAX || 600,
      auth: process.env.RL_AUTH_MAX || 20,
      api: process.env.RL_API_MAX || 300,
      dashboard: process.env.RL_DASHBOARD_MAX || 100,
      heavy_ops: process.env.RL_HEAVY_MAX || 10,
      session: process.env.RL_SESSION_MAX || 30,
      health: process.env.RL_HEALTH_MAX || 60
    }
  };
  
  // Add user-specific info if authenticated
  if (req.user) {
    const userViolations = Array.from(violationStore.entries())
      .filter(([key]) => key.includes(req.user.id))
      .map(([key, violation]) => ({
        limiter: key.split('_')[0],
        count: violation.count,
        lastViolation: violation.lastViolation
      }));
    
    stats.userViolations = userViolations;
  }
  
  res.json(stats);
}

module.exports = { 
  limiterApp, 
  limiterAuthStrict, 
  limiterAPI,
  limiterDashboard,
  limiterTraktDevice, 
  limiterStatusLight,
  limiterHeavyOps,
  limiterSession,
  limiterHealth,
  getRateLimitStatus
};
