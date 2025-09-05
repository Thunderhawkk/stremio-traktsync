// src/routes/session.js
// Session management API routes

const express = require('express');
const router = express.Router();
const sessionManager = require('../services/sessionManager');
const { authRequired } = require('../middleware/auth');
const { logger } = require('../utils/logger');

/**
 * Get current user's active sessions
 */
router.get('/sessions', authRequired, async (req, res) => {
  try {
    const userId = req.user.id;
    const sessions = await sessionManager.getUserSessions(userId);
    
    // Sanitize session data for response
    const sanitizedSessions = sessions.map(session => ({
      id: session.id,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      deviceInfo: session.deviceInfo,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      isCurrent: session.id === req.sessionID,
      securityFlags: session.securityFlags || [],
      location: session.location || 'Unknown' // Could be enhanced with GeoIP
    }));
    
    res.json({
      sessions: sanitizedSessions,
      total: sanitizedSessions.length,
      maxAllowed: sessionManager.maxConcurrentSessions
    });
  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'get_user_sessions_failed');
    res.status(500).json({ error: 'Failed to retrieve sessions' });
  }
});

/**
 * Terminate a specific session
 */
router.delete('/sessions/:sessionId', authRequired, async (req, res) => {
  try {
    const userId = req.user.id;
    const { sessionId } = req.params;
    
    // Verify session belongs to user
    const session = await sessionManager.getSession(sessionId);
    if (!session || session.userId !== userId) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Don't allow terminating current session this way
    if (sessionId === req.sessionID) {
      return res.status(400).json({ error: 'Cannot terminate current session. Use logout instead.' });
    }
    
    await sessionManager.destroySession(sessionId);
    
    logger.info({ 
      sessionId, 
      userId, 
      terminatedBy: req.user.username 
    }, 'session_terminated_by_user');
    
    res.json({ message: 'Session terminated successfully' });
  } catch (error) {
    logger.error({ error, sessionId: req.params.sessionId, userId: req.user?.id }, 'session_termination_failed');
    res.status(500).json({ error: 'Failed to terminate session' });
  }
});

/**
 * Terminate all other sessions (except current)
 */
router.post('/sessions/terminate-others', authRequired, async (req, res) => {
  try {
    const userId = req.user.id;
    const currentSessionId = req.sessionID;
    
    const terminated = await sessionManager.destroyOtherUserSessions(userId, currentSessionId);
    
    logger.info({ 
      userId, 
      terminatedCount: terminated,
      terminatedBy: req.user.username 
    }, 'other_sessions_terminated');
    
    res.json({ 
      message: `${terminated} session(s) terminated successfully`,
      terminated 
    });
  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'terminate_other_sessions_failed');
    res.status(500).json({ error: 'Failed to terminate other sessions' });
  }
});

/**
 * Get session security information
 */
router.get('/sessions/:sessionId/security', authRequired, async (req, res) => {
  try {
    const userId = req.user.id;
    const { sessionId } = req.params;
    
    const session = await sessionManager.getSession(sessionId);
    if (!session || session.userId !== userId) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const securityInfo = {
      sessionId: session.id,
      fingerprint: session.fingerprint,
      securityFlags: session.securityFlags || [],
      lastSuspiciousActivity: session.lastSuspiciousActivity,
      ipAddress: session.ipAddress,
      deviceInfo: session.deviceInfo,
      riskScore: (session.securityFlags?.length || 0) * 25, // Simple risk calculation
      recommendations: []
    };
    
    // Add security recommendations
    if (session.securityFlags?.includes('ip_change')) {
      securityInfo.recommendations.push('Your IP address has changed during this session. If this was not expected, consider terminating the session.');
    }
    
    if (session.securityFlags?.includes('user_agent_change')) {
      securityInfo.recommendations.push('Your browser information has changed during this session. This could indicate suspicious activity.');
    }
    
    if (session.securityFlags?.includes('high_activity')) {
      securityInfo.recommendations.push('Unusually high activity detected. Review your recent actions and consider changing your password.');
    }
    
    res.json(securityInfo);
  } catch (error) {
    logger.error({ error, sessionId: req.params.sessionId, userId: req.user?.id }, 'session_security_info_failed');
    res.status(500).json({ error: 'Failed to retrieve session security information' });
  }
});

/**
 * Update session preferences
 */
router.patch('/sessions/:sessionId/preferences', authRequired, async (req, res) => {
  try {
    const userId = req.user.id;
    const { sessionId } = req.params;
    const { preferences } = req.body;
    
    const session = await sessionManager.getSession(sessionId);
    if (!session || session.userId !== userId) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Validate preferences
    const allowedPreferences = ['timezone', 'language', 'theme', 'notifications'];
    const validPreferences = {};
    
    if (preferences && typeof preferences === 'object') {
      for (const [key, value] of Object.entries(preferences)) {
        if (allowedPreferences.includes(key)) {
          validPreferences[key] = value;
        }
      }
    }
    
    await sessionManager.updateActivity(sessionId, {
      preferences: validPreferences
    });
    
    res.json({ 
      message: 'Session preferences updated successfully',
      preferences: validPreferences
    });
  } catch (error) {
    logger.error({ error, sessionId: req.params.sessionId, userId: req.user?.id }, 'session_preferences_update_failed');
    res.status(500).json({ error: 'Failed to update session preferences' });
  }
});

/**
 * Get session analytics for current user
 */
router.get('/analytics', authRequired, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get recent sessions (last 30 days)
    const recentSessions = await sessionManager.getRecentUserSessions(userId, 24 * 30);
    
    // Analyze sessions
    const analytics = {
      totalSessions: recentSessions.length,
      activeSessions: recentSessions.filter(s => s.isActive).length,
      uniqueIPs: [...new Set(recentSessions.map(s => s.ipAddress))].length,
      deviceTypes: {},
      browserTypes: {},
      securityEvents: recentSessions.filter(s => s.securityFlags?.length > 0).length,
      averageSessionDuration: 0,
      loginPattern: {}
    };
    
    // Device and browser analysis
    recentSessions.forEach(session => {
      const device = session.deviceInfo?.device || 'Unknown';
      const browser = session.deviceInfo?.browser || 'Unknown';
      
      analytics.deviceTypes[device] = (analytics.deviceTypes[device] || 0) + 1;
      analytics.browserTypes[browser] = (analytics.browserTypes[browser] || 0) + 1;
      
      // Login pattern by hour
      const hour = new Date(session.createdAt).getHours();
      analytics.loginPattern[hour] = (analytics.loginPattern[hour] || 0) + 1;
    });
    
    // Calculate average session duration for completed sessions
    const completedSessions = recentSessions.filter(s => !s.isActive);
    if (completedSessions.length > 0) {
      const totalDuration = completedSessions.reduce((sum, session) => {
        const duration = new Date(session.lastActivity) - new Date(session.createdAt);
        return sum + duration;
      }, 0);
      analytics.averageSessionDuration = Math.round(totalDuration / completedSessions.length / 1000 / 60); // minutes
    }
    
    res.json(analytics);
  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'session_analytics_failed');
    res.status(500).json({ error: 'Failed to retrieve session analytics' });
  }
});

module.exports = router;