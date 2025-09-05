// src/middleware/session_timebox.js
// Provides: attachSessionUser, absoluteSessionTimeout, enhancedSessionTracking

const sessionManager = require('../services/sessionManager');
const { logger } = require('../utils/logger');

function attachSessionUser(req, _res, next) {
  if (req.session && req.session.user) req.user = req.session.user;
  if (req.session && !req.session.createdAt) req.session.createdAt = Date.now();
  next();
}

/**
 * Enhanced session tracking middleware
 */
function enhancedSessionTracking(req, res, next) {
  // Skip for static files and health checks
  if (req.path.startsWith('/assets') || req.path.startsWith('/css') || req.path === '/healthz') {
    return next();
  }

  const sessionId = req.sessionID;
  const userId = req.user?.id;
  
  if (sessionId && userId) {
    // Extract device information from user agent
    const userAgent = req.get('User-Agent') || '';
    const deviceInfo = extractDeviceInfo(userAgent);
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    
    // Check for suspicious activity
    sessionManager.checkSuspiciousActivity(sessionId, ipAddress, userAgent)
      .then(result => {
        if (result.suspicious) {
          logger.warn({
            sessionId,
            userId,
            flags: result.flags,
            ipAddress,
            userAgent: userAgent.substring(0, 100)
          }, 'suspicious_session_activity_detected');
        }
      })
      .catch(error => {
        logger.error({ error, sessionId }, 'suspicious_activity_check_failed');
      });
    
    // Update session activity
    sessionManager.updateActivity(sessionId, {
      lastActivity: new Date(),
      ipAddress,
      userAgent,
      deviceInfo
    }).catch(error => {
      logger.error({ error, sessionId }, 'session_activity_update_failed');
    });
  }
  
  next();
}

/**
 * Create session when user logs in
 */
async function createUserSession(req, user) {
  try {
    const userAgent = req.get('User-Agent') || '';
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
    const deviceInfo = extractDeviceInfo(userAgent);
    
    const sessionData = await sessionManager.createSession(
      user.id,
      userAgent,
      ipAddress,
      deviceInfo
    );
    
    // Store session ID in express session
    req.session.sessionId = sessionData.id;
    
    logger.info({
      sessionId: sessionData.id,
      userId: user.id,
      ipAddress,
      device: deviceInfo.device
    }, 'user_session_created');
    
    return sessionData;
  } catch (error) {
    logger.error({ error, userId: user.id }, 'user_session_creation_failed');
    throw error;
  }
}

/**
 * Destroy session when user logs out
 */
async function destroyUserSession(req) {
  try {
    const sessionId = req.session?.sessionId || req.sessionID;
    if (sessionId) {
      await sessionManager.destroySession(sessionId);
      logger.info({ sessionId }, 'user_session_destroyed');
    }
  } catch (error) {
    logger.error({ error }, 'user_session_destruction_failed');
  }
}

/**
 * Extract device information from user agent
 */
function extractDeviceInfo(userAgent) {
  const ua = userAgent.toLowerCase();
  
  let device = 'desktop';
  let os = 'unknown';
  let browser = 'unknown';
  
  // Device detection
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
    device = 'mobile';
  } else if (ua.includes('tablet') || ua.includes('ipad')) {
    device = 'tablet';
  }
  
  // OS detection
  if (ua.includes('windows')) os = 'Windows';
  else if (ua.includes('mac')) os = 'macOS';
  else if (ua.includes('linux')) os = 'Linux';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('ios') || ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';
  
  // Browser detection
  if (ua.includes('chrome') && !ua.includes('edg')) browser = 'Chrome';
  else if (ua.includes('firefox')) browser = 'Firefox';
  else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari';
  else if (ua.includes('edg')) browser = 'Edge';
  else if (ua.includes('opera')) browser = 'Opera';
  
  return { device, os, browser };
}

/**
 * Enforce absolute session lifetime regardless of activity.
 * Options: { absoluteMs: number }
 */
function absoluteSessionTimeout({ absoluteMs }) {
  const cap = Number(absoluteMs || 0);
  return function (req, res, next) {
    if (!cap || !req.session) return next();
    const created = Number(req.session.createdAt || Date.now());
    if (Date.now() - created > cap) {
      // Destroy session in session manager too
      const sessionId = req.session.sessionId || req.sessionID;
      if (sessionId) {
        sessionManager.destroySession(sessionId).catch(error => {
          logger.error({ error, sessionId }, 'session_cleanup_on_timeout_failed');
        });
      }
      
      // Invalidate session and force re-login
      req.session.destroy(() => res.status(440).json({ error: 'session_expired' }));
      return;
    }
    next();
  };
}

module.exports = { 
  attachSessionUser, 
  absoluteSessionTimeout, 
  enhancedSessionTracking,
  createUserSession,
  destroyUserSession,
  extractDeviceInfo
};
