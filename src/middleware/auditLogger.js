// src/middleware/auditLogger.js
// Middleware for automatic audit logging of HTTP requests and security events

const { auditService, AUDIT_EVENTS, SEVERITY } = require('../services/auditService');
const { logger } = require('../utils/logger');

// Extract IP address from request
function getClientIP(req) {
  return req.ip || 
         req.connection?.remoteAddress || 
         req.socket?.remoteAddress ||
         req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         'unknown';
}

// Extract user agent
function getUserAgent(req) {
  return req.get('User-Agent') || 'unknown';
}

// Check if endpoint should be audited
function shouldAuditEndpoint(path, method) {
  // Skip health checks and static assets
  const skipPatterns = [
    /^\/health$/,
    /^\/favicon\.ico$/,
    /^\/static\//,
    /^\/assets\//,
    /\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/
  ];

  return !skipPatterns.some(pattern => pattern.test(path));
}

// Check if this is a security-sensitive endpoint
function isSecuritySensitive(path, method) {
  const sensitivePatterns = [
    { pattern: /^\/api\/auth\//, methods: ['POST', 'DELETE'] },
    { pattern: /^\/api\/users\//, methods: ['POST', 'PUT', 'DELETE'] },
    { pattern: /^\/api\/admin\//, methods: ['GET', 'POST', 'PUT', 'DELETE'] },
    { pattern: /^\/api\/.*\/delete/, methods: ['DELETE', 'POST'] }
  ];

  return sensitivePatterns.some(({ pattern, methods }) => 
    pattern.test(path) && methods.includes(method.toUpperCase())
  );
}

// Main audit logging middleware
function auditLogger(options = {}) {
  const {
    enablePerformanceLogging = true,
    enableErrorLogging = true,
    enableSecurityLogging = true,
    skipSuccessfulGets = true
  } = options;

  return async (req, res, next) => {
    const startTime = Date.now();
    const originalSend = res.send;
    const originalJson = res.json;

    // Extract request information
    const ipAddress = getClientIP(req);
    const userAgent = getUserAgent(req);
    const userId = req.user?.id || null;
    const sessionId = req.sessionID || req.session?.id || null;
    const endpoint = req.originalUrl || req.url;
    const method = req.method;

    // Skip non-auditable endpoints
    if (!shouldAuditEndpoint(endpoint, method)) {
      return next();
    }

    // Enhanced request logging
    req.audit = {
      startTime,
      ipAddress,
      userAgent,
      userId,
      sessionId,
      endpoint,
      method
    };

    // Override response methods to capture response details
    res.send = function(body) {
      res.locals.responseBody = body;
      return originalSend.call(this, body);
    };

    res.json = function(obj) {
      res.locals.responseBody = obj;
      return originalJson.call(this, obj);
    };

    // Log request completion
    const logRequest = async () => {
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      const statusCode = res.statusCode;
      const isError = statusCode >= 400;
      const isSecuritySensitiveEndpoint = isSecuritySensitive(endpoint, method);

      try {
        // Performance logging
        if (enablePerformanceLogging) {
          await auditService.log({
            eventType: AUDIT_EVENTS.API_ACCESS,
            severity: isError ? SEVERITY.MEDIUM : SEVERITY.LOW,
            userId,
            sessionId,
            ipAddress,
            userAgent,
            resource: endpoint,
            action: method.toLowerCase(),
            details: {
              statusCode,
              responseTime,
              contentLength: res.get('Content-Length') || 0,
              isSecuritySensitive: isSecuritySensitiveEndpoint,
              requestSize: req.get('Content-Length') || 0
            }
          });
        }

        // Error logging
        if (enableErrorLogging && isError) {
          await auditService.log({
            eventType: AUDIT_EVENTS.API_ERROR,
            severity: statusCode >= 500 ? SEVERITY.HIGH : SEVERITY.MEDIUM,
            userId,
            sessionId,
            ipAddress,
            userAgent,
            resource: endpoint,
            action: method.toLowerCase(),
            details: {
              statusCode,
              responseTime,
              errorType: getErrorType(statusCode),
              errorMessage: res.locals.errorMessage || 'HTTP error'
            }
          });
        }

        // Security logging for sensitive endpoints
        if (enableSecurityLogging && isSecuritySensitiveEndpoint) {
          await auditService.log({
            eventType: AUDIT_EVENTS.API_ACCESS,
            severity: isError ? SEVERITY.HIGH : SEVERITY.MEDIUM,
            userId,
            sessionId,
            ipAddress,
            userAgent,
            resource: endpoint,
            action: method.toLowerCase(),
            details: {
              statusCode,
              responseTime,
              securitySensitive: true,
              requestHeaders: sanitizeHeaders(req.headers)
            }
          });
        }

        // Rate limiting violations
        if (statusCode === 429) {
          await auditService.log({
            eventType: AUDIT_EVENTS.RATE_LIMIT_HIT,
            severity: SEVERITY.MEDIUM,
            userId,
            sessionId,
            ipAddress,
            userAgent,
            resource: endpoint,
            action: 'rate_limit',
            details: {
              endpoint,
              method,
              rateLimitType: res.get('X-RateLimit-Type') || 'unknown'
            }
          });
        }

        // Unauthorized access attempts
        if (statusCode === 401 || statusCode === 403) {
          await auditService.log({
            eventType: AUDIT_EVENTS.UNAUTHORIZED_ACCESS,
            severity: SEVERITY.HIGH,
            userId,
            sessionId,
            ipAddress,
            userAgent,
            resource: endpoint,
            action: 'unauthorized_access',
            details: {
              statusCode,
              endpoint,
              method,
              authHeader: !!req.get('Authorization'),
              sessionExists: !!sessionId
            }
          });
        }

      } catch (error) {
        logger.error('Failed to log audit event:', error);
      }
    };

    // Attach logging to response finish event
    res.on('finish', logRequest);
    res.on('close', logRequest);

    next();
  };
}

// Authentication event logger
function auditAuthEvents() {
  return {
    async logLogin(userId, sessionId, ipAddress, userAgent, success = true, additionalDetails = {}) {
      try {
        await auditService.log({
          eventType: success ? AUDIT_EVENTS.LOGIN_SUCCESS : AUDIT_EVENTS.LOGIN_FAILED,
          severity: success ? SEVERITY.LOW : SEVERITY.MEDIUM,
          userId: success ? userId : null,
          sessionId,
          ipAddress,
          userAgent,
          action: 'login',
          details: {
            success,
            loginMethod: additionalDetails.method || 'password',
            ...additionalDetails
          }
        });
      } catch (error) {
        logger.error('Failed to log authentication event:', error);
      }
    },

    async logLogout(userId, sessionId, ipAddress, reason = 'user_initiated') {
      try {
        await auditService.log({
          eventType: AUDIT_EVENTS.LOGOUT,
          severity: SEVERITY.LOW,
          userId,
          sessionId,
          ipAddress,
          action: 'logout',
          details: { reason }
        });
      } catch (error) {
        logger.error('Failed to log logout event:', error);
      }
    },

    async logPasswordChange(userId, sessionId, ipAddress, userAgent, success = true) {
      try {
        await auditService.log({
          eventType: AUDIT_EVENTS.PASSWORD_CHANGE,
          severity: SEVERITY.MEDIUM,
          userId,
          sessionId,
          ipAddress,
          userAgent,
          action: 'password_change',
          details: { success }
        });
      } catch (error) {
        logger.error('Failed to log password change event:', error);
      }
    },

    async logSuspiciousActivity(userId, sessionId, ipAddress, userAgent, activityType, details = {}) {
      try {
        await auditService.log({
          eventType: AUDIT_EVENTS.SUSPICIOUS_ACTIVITY,
          severity: SEVERITY.HIGH,
          userId,
          sessionId,
          ipAddress,
          userAgent,
          action: 'suspicious_activity',
          details: {
            activityType,
            ...details
          }
        });
      } catch (error) {
        logger.error('Failed to log suspicious activity:', error);
      }
    }
  };
}

// Session event logger
function auditSessionEvents() {
  return {
    async logSessionCreate(userId, sessionId, ipAddress, userAgent, deviceInfo = {}) {
      try {
        await auditService.log({
          eventType: AUDIT_EVENTS.SESSION_CREATED,
          severity: SEVERITY.LOW,
          userId,
          sessionId,
          ipAddress,
          userAgent,
          action: 'session_create',
          details: {
            deviceInfo,
            timestamp: new Date().toISOString()
          }
        });
      } catch (error) {
        logger.error('Failed to log session creation:', error);
      }
    },

    async logSessionTerminate(userId, sessionId, ipAddress, reason = 'user_logout') {
      try {
        await auditService.log({
          eventType: AUDIT_EVENTS.SESSION_TERMINATED,
          severity: SEVERITY.LOW,
          userId,
          sessionId,
          ipAddress,
          action: 'session_terminate',
          details: { reason }
        });
      } catch (error) {
        logger.error('Failed to log session termination:', error);
      }
    }
  };
}

// User action logger
function auditUserActions() {
  return {
    async logUserAction(userId, sessionId, action, resource, details = {}, req = null) {
      try {
        const ipAddress = req ? getClientIP(req) : null;
        const userAgent = req ? getUserAgent(req) : null;

        await auditService.log({
          eventType: getEventTypeForAction(action),
          severity: getSeverityForAction(action),
          userId,
          sessionId,
          ipAddress,
          userAgent,
          resource,
          action,
          details
        });
      } catch (error) {
        logger.error('Failed to log user action:', error);
      }
    }
  };
}

// Helper functions
function getErrorType(statusCode) {
  if (statusCode === 400) return 'bad_request';
  if (statusCode === 401) return 'unauthorized';
  if (statusCode === 403) return 'forbidden';
  if (statusCode === 404) return 'not_found';
  if (statusCode === 422) return 'validation_error';
  if (statusCode === 429) return 'rate_limited';
  if (statusCode >= 500) return 'server_error';
  return 'client_error';
}

function sanitizeHeaders(headers) {
  const sanitized = { ...headers };
  delete sanitized.authorization;
  delete sanitized.cookie;
  delete sanitized['x-api-key'];
  return sanitized;
}

function getEventTypeForAction(action) {
  const actionMap = {
    'create_list': AUDIT_EVENTS.LIST_CREATED,
    'update_list': AUDIT_EVENTS.LIST_UPDATED,
    'delete_list': AUDIT_EVENTS.LIST_DELETED,
    'watch_content': AUDIT_EVENTS.CONTENT_WATCHED,
    'rate_content': AUDIT_EVENTS.CONTENT_RATED,
    'create_user': AUDIT_EVENTS.USER_CREATED,
    'update_user': AUDIT_EVENTS.USER_UPDATED,
    'delete_user': AUDIT_EVENTS.USER_DELETED
  };
  return actionMap[action] || AUDIT_EVENTS.API_ACCESS;
}

function getSeverityForAction(action) {
  const criticalActions = ['delete_user', 'change_role'];
  const highActions = ['delete_list', 'update_user'];
  const mediumActions = ['create_user', 'create_list', 'update_list'];
  
  if (criticalActions.includes(action)) return SEVERITY.CRITICAL;
  if (highActions.includes(action)) return SEVERITY.HIGH;
  if (mediumActions.includes(action)) return SEVERITY.MEDIUM;
  return SEVERITY.LOW;
}

module.exports = {
  auditLogger,
  auditAuthEvents,
  auditSessionEvents,
  auditUserActions
};