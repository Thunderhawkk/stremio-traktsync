// src/routes/performanceAlerts.js
// API routes for managing performance alerts and notifications

const express = require('express');
const { performanceAlerts, ALERT_SEVERITY, ALERT_TYPES, NOTIFICATION_CHANNELS } = require('../services/performanceAlerts');
const { auditUserActions } = require('../middleware/auditLogger');
const { logger } = require('../utils/logger');

const router = express.Router();
const userAudit = auditUserActions();

// Middleware to require admin role for alert management
// Note: Admin check is now handled at the app level middleware

// Get current alert status and active alerts
router.get('/status', async (req, res) => {
  try {
    const status = performanceAlerts.getAlertStatus();

    // Log the status access
    await userAudit.logUserAction(
      req.user.id,
      req.sessionID,
      'view_alert_status',
      'performance_alerts',
      { activeAlerts: status.activeAlerts.length },
      req
    );

    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    logger.error('Failed to get alert status:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to retrieve alert status'
    });
  }
});

// Get alert configuration and thresholds
router.get('/config', async (req, res) => {
  try {
    const config = {
      enabled: performanceAlerts.enabled,
      checkInterval: performanceAlerts.checkInterval,
      thresholds: performanceAlerts.thresholds,
      cooldownPeriods: performanceAlerts.cooldownPeriods,
      availableChannels: Object.values(NOTIFICATION_CHANNELS),
      availableAlertTypes: Object.values(ALERT_TYPES),
      availableSeverities: Object.values(ALERT_SEVERITY)
    };

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    logger.error('Failed to get alert config:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to retrieve alert configuration'
    });
  }
});

// Update alert thresholds
router.put('/config/thresholds', async (req, res) => {
  try {
    const { thresholds } = req.body;

    if (!thresholds || typeof thresholds !== 'object') {
      return res.status(400).json({
        error: 'invalid_input',
        message: 'Thresholds object is required'
      });
    }

    // Validate threshold structure
    const validMetrics = ['cpu', 'memory', 'responseTime', 'errorRate', 'diskUsage'];
    const validSeverities = ['warning', 'critical', 'emergency'];

    for (const [metric, values] of Object.entries(thresholds)) {
      if (!validMetrics.includes(metric)) {
        return res.status(400).json({
          error: 'invalid_metric',
          message: `Invalid metric: ${metric}`
        });
      }

      for (const [severity, value] of Object.entries(values)) {
        if (!validSeverities.includes(severity)) {
          return res.status(400).json({
            error: 'invalid_severity',
            message: `Invalid severity: ${severity}`
          });
        }

        if (typeof value !== 'number' || value < 0) {
          return res.status(400).json({
            error: 'invalid_threshold_value',
            message: `Threshold value must be a positive number: ${metric}.${severity}`
          });
        }
      }

      // Validate threshold order (warning < critical < emergency)
      if (values.warning >= values.critical || values.critical >= values.emergency) {
        return res.status(400).json({
          error: 'invalid_threshold_order',
          message: `Thresholds must be in ascending order: warning < critical < emergency for ${metric}`
        });
      }
    }

    // Update thresholds
    Object.assign(performanceAlerts.thresholds, thresholds);

    // Log the configuration change
    await userAudit.logUserAction(
      req.user.id,
      req.sessionID,
      'update_alert_thresholds',
      'performance_alerts',
      { thresholds },
      req
    );

    logger.info({
      userId: req.user.id,
      thresholds
    }, 'alert_thresholds_updated');

    res.json({
      success: true,
      message: 'Alert thresholds updated successfully',
      data: { thresholds: performanceAlerts.thresholds }
    });
  } catch (error) {
    logger.error('Failed to update alert thresholds:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to update alert thresholds'
    });
  }
});

// Get alert history
router.get('/history', async (req, res) => {
  try {
    const { limit = 100, severity, alertType } = req.query;

    // This is a simplified implementation. In a production environment,
    // you might want to store alert history in a database
    const history = {
      total: performanceAlerts.alertHistory.size,
      recentAlerts: [], // Would be populated from database
      activeAlerts: Array.from(performanceAlerts.activeAlerts.values()),
      filters: { severity, alertType }
    };

    // Log the history access
    await userAudit.logUserAction(
      req.user.id,
      req.sessionID,
      'view_alert_history',
      'performance_alerts',
      { limit, severity, alertType },
      req
    );

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    logger.error('Failed to get alert history:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to retrieve alert history'
    });
  }
});

// Test alert system (send test alert)
router.post('/test', async (req, res) => {
  try {
    const { alertType = ALERT_TYPES.HIGH_CPU, severity = ALERT_SEVERITY.WARNING } = req.body;

    if (!Object.values(ALERT_TYPES).includes(alertType)) {
      return res.status(400).json({
        error: 'invalid_alert_type',
        message: 'Invalid alert type'
      });
    }

    if (!Object.values(ALERT_SEVERITY).includes(severity)) {
      return res.status(400).json({
        error: 'invalid_severity',
        message: 'Invalid severity level'
      });
    }

    // Create test alert
    const testAlert = {
      type: alertType,
      severity,
      message: `TEST ALERT: This is a test ${severity} alert for ${alertType}`,
      metrics: { test: true, triggeredBy: req.user.username },
      timestamp: new Date().toISOString(),
      recovery: false
    };

    // Send test alert through notification system
    await performanceAlerts.sendNotifications(testAlert);

    // Log the test alert
    await userAudit.logUserAction(
      req.user.id,
      req.sessionID,
      'send_test_alert',
      'performance_alerts',
      { alertType, severity },
      req
    );

    logger.info({
      userId: req.user.id,
      username: req.user.username,
      alertType,
      severity
    }, 'test_alert_sent');

    res.json({
      success: true,
      message: 'Test alert sent successfully',
      data: { alert: testAlert }
    });
  } catch (error) {
    logger.error('Failed to send test alert:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to send test alert'
    });
  }
});

// Acknowledge/dismiss an active alert
router.post('/acknowledge/:alertType', async (req, res) => {
  try {
    const { alertType } = req.params;
    const { reason = 'Acknowledged by admin' } = req.body;

    if (!performanceAlerts.activeAlerts.has(alertType)) {
      return res.status(404).json({
        error: 'alert_not_found',
        message: 'Active alert not found'
      });
    }

    const alert = performanceAlerts.activeAlerts.get(alertType);
    
    // Remove from active alerts
    performanceAlerts.activeAlerts.delete(alertType);

    // Create acknowledgment alert
    const ackAlert = {
      type: `${alertType}_acknowledged`,
      severity: ALERT_SEVERITY.INFO,
      message: `Alert ${alertType} acknowledged by ${req.user.username}: ${reason}`,
      metrics: { 
        originalAlert: alert,
        acknowledgedBy: req.user.username,
        reason 
      },
      timestamp: new Date().toISOString(),
      recovery: true
    };

    // Send acknowledgment notification
    await performanceAlerts.sendNotifications(ackAlert);

    // Log the acknowledgment
    await userAudit.logUserAction(
      req.user.id,
      req.sessionID,
      'acknowledge_alert',
      'performance_alerts',
      { alertType, reason },
      req
    );

    logger.info({
      userId: req.user.id,
      username: req.user.username,
      alertType,
      reason
    }, 'alert_acknowledged');

    res.json({
      success: true,
      message: 'Alert acknowledged successfully',
      data: { acknowledgedAlert: alertType, reason }
    });
  } catch (error) {
    logger.error('Failed to acknowledge alert:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to acknowledge alert'
    });
  }
});

// Get performance trends data
router.get('/trends', async (req, res) => {
  try {
    const { metric, samples = 50 } = req.query;
    const maxSamples = Math.min(parseInt(samples) || 50, 1000);

    let trends = performanceAlerts.performanceTrends;

    if (metric) {
      if (!trends[metric]) {
        return res.status(400).json({
          error: 'invalid_metric',
          message: 'Invalid metric name'
        });
      }
      trends = { [metric]: trends[metric] };
    }

    // Limit samples for each metric
    const limitedTrends = Object.fromEntries(
      Object.entries(trends).map(([key, data]) => [
        key,
        data.slice(-maxSamples)
      ])
    );

    // Log the trends access
    await userAudit.logUserAction(
      req.user.id,
      req.sessionID,
      'view_performance_trends',
      'performance_alerts',
      { metric, samples: maxSamples },
      req
    );

    res.json({
      success: true,
      data: {
        trends: limitedTrends,
        samplesPerMetric: Object.fromEntries(
          Object.entries(limitedTrends).map(([key, data]) => [key, data.length])
        )
      }
    });
  } catch (error) {
    logger.error('Failed to get performance trends:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to retrieve performance trends'
    });
  }
});

// Enable/disable alert system
router.put('/enabled', async (req, res) => {
  try {
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        error: 'invalid_input',
        message: 'Enabled must be a boolean value'
      });
    }

    performanceAlerts.enabled = enabled;

    // Log the configuration change
    await userAudit.logUserAction(
      req.user.id,
      req.sessionID,
      enabled ? 'enable_alerts' : 'disable_alerts',
      'performance_alerts',
      { enabled },
      req
    );

    logger.info({
      userId: req.user.id,
      username: req.user.username,
      enabled
    }, 'alert_system_toggled');

    res.json({
      success: true,
      message: `Alert system ${enabled ? 'enabled' : 'disabled'} successfully`,
      data: { enabled }
    });
  } catch (error) {
    logger.error('Failed to toggle alert system:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to toggle alert system'
    });
  }
});

module.exports = router;