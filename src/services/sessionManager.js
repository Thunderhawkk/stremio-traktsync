// src/services/sessionManager.js
// Enhanced session management with persistent storage and security features

const crypto = require('crypto');
const { logger } = require('../utils/logger');
const { repo } = require('../db/repo');

class SessionManager {
  constructor() {
    this.activeSessions = new Map(); // In-memory cache for performance
    this.sessionTimeout = parseInt(process.env.SESSION_IDLE_MINUTES || '30', 10) * 60 * 1000;
    this.absoluteTimeout = parseInt(process.env.SESSION_ABSOLUTE_MINUTES || '720', 10) * 60 * 1000;
    this.maxConcurrentSessions = parseInt(process.env.MAX_CONCURRENT_SESSIONS || '5', 10);
    this.sessionCleanupInterval = 30 * 60 * 1000; // 30 minutes
    
    // Start session cleanup
    this.startCleanup();
  }

  /**
   * Create a new session
   */
  async createSession(userId, userAgent, ipAddress, deviceInfo = {}) {
    try {
      const sessionId = this.generateSessionId();
      const now = new Date();
      
      const sessionData = {
        id: sessionId,
        userId,
        userAgent: userAgent || 'Unknown',
        ipAddress: ipAddress || 'Unknown',
        deviceInfo: {
          browser: deviceInfo.browser || 'Unknown',
          os: deviceInfo.os || 'Unknown',
          device: deviceInfo.device || 'Unknown',
          ...deviceInfo
        },
        createdAt: now,
        lastActivity: now,
        isActive: true,
        fingerprint: this.generateFingerprint(userAgent, ipAddress, deviceInfo)
      };

      // Check concurrent session limit
      await this.enforceSessionLimit(userId);

      // Store in database
      await this.storeSession(sessionData);
      
      // Cache in memory
      this.activeSessions.set(sessionId, sessionData);

      logger.info({
        sessionId,
        userId,
        ipAddress,
        userAgent: userAgent?.substring(0, 100)
      }, 'session_created');

      return sessionData;
    } catch (error) {
      logger.error({ error, userId }, 'session_creation_failed');
      throw error;
    }
  }

  /**
   * Update session activity
   */
  async updateActivity(sessionId, additionalData = {}) {
    try {
      const session = this.activeSessions.get(sessionId);
      if (!session) {
        const dbSession = await this.getSessionFromDb(sessionId);
        if (!dbSession) return null;
        
        // Load into cache
        this.activeSessions.set(sessionId, dbSession);
        return await this.updateActivity(sessionId, additionalData);
      }

      // Check if session is expired
      const now = new Date();
      const timeSinceCreated = now - new Date(session.createdAt);
      const timeSinceActivity = now - new Date(session.lastActivity);

      if (timeSinceCreated > this.absoluteTimeout || timeSinceActivity > this.sessionTimeout) {
        await this.destroySession(sessionId);
        return null;
      }

      // Update activity
      session.lastActivity = now;
      Object.assign(session, additionalData);
      
      // Update in database (async)
      this.updateSessionInDb(sessionId, {
        lastActivity: now,
        ...additionalData
      }).catch(error => {
        logger.error({ error, sessionId }, 'session_update_failed');
      });

      return session;
    } catch (error) {
      logger.error({ error, sessionId }, 'session_activity_update_failed');
      return null;
    }
  }

  /**
   * Get session information
   */
  async getSession(sessionId) {
    try {
      let session = this.activeSessions.get(sessionId);
      
      if (!session) {
        session = await this.getSessionFromDb(sessionId);
        if (session) {
          this.activeSessions.set(sessionId, session);
        }
      }

      if (!session || !session.isActive) {
        return null;
      }

      // Check expiration
      const now = new Date();
      const timeSinceCreated = now - new Date(session.createdAt);
      const timeSinceActivity = now - new Date(session.lastActivity);

      if (timeSinceCreated > this.absoluteTimeout || timeSinceActivity > this.sessionTimeout) {
        await this.destroySession(sessionId);
        return null;
      }

      return session;
    } catch (error) {
      logger.error({ error, sessionId }, 'session_retrieval_failed');
      return null;
    }
  }

  /**
   * Destroy a session
   */
  async destroySession(sessionId) {
    try {
      const session = this.activeSessions.get(sessionId);
      
      // Remove from cache
      this.activeSessions.delete(sessionId);
      
      // Mark as inactive in database
      await this.destroySessionInDb(sessionId);

      if (session) {
        logger.info({
          sessionId,
          userId: session.userId,
          duration: new Date() - new Date(session.createdAt)
        }, 'session_destroyed');
      }

      return true;
    } catch (error) {
      logger.error({ error, sessionId }, 'session_destruction_failed');
      return false;
    }
  }

  /**
   * Get all active sessions for a user
   */
  async getUserSessions(userId) {
    try {
      const sessions = await this.getUserSessionsFromDb(userId);
      const activeSessions = [];

      for (const session of sessions) {
        if (session.isActive) {
          const now = new Date();
          const timeSinceCreated = now - new Date(session.createdAt);
          const timeSinceActivity = now - new Date(session.lastActivity);

          if (timeSinceCreated <= this.absoluteTimeout && timeSinceActivity <= this.sessionTimeout) {
            activeSessions.push({
              ...session,
              isCurrent: this.activeSessions.has(session.id)
            });
          } else {
            // Session expired, clean it up
            await this.destroySession(session.id);
          }
        }
      }

      return activeSessions;
    } catch (error) {
      logger.error({ error, userId }, 'user_sessions_retrieval_failed');
      return [];
    }
  }

  /**
   * Destroy all sessions for a user except current one
   */
  async destroyOtherUserSessions(userId, currentSessionId) {
    try {
      const sessions = await this.getUserSessions(userId);
      let destroyed = 0;

      for (const session of sessions) {
        if (session.id !== currentSessionId) {
          await this.destroySession(session.id);
          destroyed++;
        }
      }

      logger.info({ userId, destroyed }, 'other_user_sessions_destroyed');
      return destroyed;
    } catch (error) {
      logger.error({ error, userId }, 'destroy_other_sessions_failed');
      return 0;
    }
  }

  /**
   * Check for suspicious activity
   */
  async checkSuspiciousActivity(sessionId, ipAddress, userAgent) {
    try {
      const session = await this.getSession(sessionId);
      if (!session) return { suspicious: false };

      const flags = [];

      // Check for IP change
      if (session.ipAddress !== ipAddress) {
        flags.push('ip_change');
      }

      // Check for user agent change
      if (session.userAgent !== userAgent) {
        flags.push('user_agent_change');
      }

      // Check for unusual activity patterns
      const recentSessions = await this.getRecentUserSessions(session.userId, 24); // Last 24 hours
      if (recentSessions.length > 10) {
        flags.push('high_activity');
      }

      const suspicious = flags.length > 0;
      
      if (suspicious) {
        logger.warn({
          sessionId,
          userId: session.userId,
          flags,
          oldIp: session.ipAddress,
          newIp: ipAddress
        }, 'suspicious_session_activity');

        // Update session with security flags
        await this.updateActivity(sessionId, {
          securityFlags: flags,
          lastSuspiciousActivity: new Date()
        });
      }

      return { suspicious, flags };
    } catch (error) {
      logger.error({ error, sessionId }, 'suspicious_activity_check_failed');
      return { suspicious: false, error: true };
    }
  }

  /**
   * Generate secure session ID
   */
  generateSessionId() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generate device fingerprint
   */
  generateFingerprint(userAgent, ipAddress, deviceInfo) {
    const fingerprintData = `${userAgent}|${ipAddress}|${JSON.stringify(deviceInfo)}`;
    return crypto.createHash('sha256').update(fingerprintData).digest('hex');
  }

  /**
   * Enforce session limit per user
   */
  async enforceSessionLimit(userId) {
    try {
      const sessions = await this.getUserSessions(userId);
      
      if (sessions.length >= this.maxConcurrentSessions) {
        // Remove oldest sessions
        const sortedSessions = sessions.sort((a, b) => new Date(a.lastActivity) - new Date(b.lastActivity));
        const sessionsToRemove = sortedSessions.slice(0, sessions.length - this.maxConcurrentSessions + 1);
        
        for (const session of sessionsToRemove) {
          await this.destroySession(session.id);
        }

        logger.info({ 
          userId, 
          removed: sessionsToRemove.length 
        }, 'session_limit_enforced');
      }
    } catch (error) {
      logger.error({ error, userId }, 'session_limit_enforcement_failed');
    }
  }

  /**
   * Start periodic cleanup
   */
  startCleanup() {
    setInterval(() => {
      this.cleanupExpiredSessions().catch(error => {
        logger.error({ error }, 'session_cleanup_failed');
      });
    }, this.sessionCleanupInterval);
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions() {
    try {
      const now = new Date();
      let cleaned = 0;

      // Clean in-memory cache
      for (const [sessionId, session] of this.activeSessions.entries()) {
        const timeSinceCreated = now - new Date(session.createdAt);
        const timeSinceActivity = now - new Date(session.lastActivity);

        if (timeSinceCreated > this.absoluteTimeout || timeSinceActivity > this.sessionTimeout) {
          this.activeSessions.delete(sessionId);
          cleaned++;
        }
      }

      // Clean database
      const dbCleaned = await this.cleanupExpiredSessionsInDb();
      
      if (cleaned > 0 || dbCleaned > 0) {
        logger.info({ 
          memorySessionsCleaned: cleaned, 
          dbSessionsCleaned: dbCleaned 
        }, 'expired_sessions_cleaned');
      }
    } catch (error) {
      logger.error({ error }, 'session_cleanup_error');
    }
  }

  /**
   * Database operations (to be implemented based on your DB schema)
   */
  async storeSession(sessionData) {
    // Implementation depends on your database schema
    // This would store the session in your sessions table
    try {
      await repo.createSession(sessionData);
    } catch (error) {
      logger.error({ error }, 'session_store_failed');
      throw error;
    }
  }

  async getSessionFromDb(sessionId) {
    try {
      return await repo.getSession(sessionId);
    } catch (error) {
      logger.error({ error, sessionId }, 'session_fetch_failed');
      return null;
    }
  }

  async updateSessionInDb(sessionId, updates) {
    try {
      await repo.updateSession(sessionId, updates);
    } catch (error) {
      logger.error({ error, sessionId }, 'session_update_db_failed');
    }
  }

  async destroySessionInDb(sessionId) {
    try {
      await repo.destroySession(sessionId);
    } catch (error) {
      logger.error({ error, sessionId }, 'session_destroy_db_failed');
    }
  }

  async getUserSessionsFromDb(userId) {
    try {
      return await repo.getUserSessions(userId);
    } catch (error) {
      logger.error({ error, userId }, 'user_sessions_fetch_failed');
      return [];
    }
  }

  async getRecentUserSessions(userId, hours) {
    try {
      return await repo.getRecentUserSessions(userId, hours);
    } catch (error) {
      logger.error({ error, userId }, 'recent_sessions_fetch_failed');
      return [];
    }
  }

  async cleanupExpiredSessionsInDb() {
    try {
      return await repo.cleanupExpiredSessions(this.absoluteTimeout, this.sessionTimeout);
    } catch (error) {
      logger.error({ error }, 'db_session_cleanup_failed');
      return 0;
    }
  }
}

// Create singleton instance
const sessionManager = new SessionManager();

module.exports = sessionManager;