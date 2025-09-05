// src/routes/health.js
// Health monitoring API routes

const express = require('express');
const router = express.Router();
const healthMonitor = require('../services/healthMonitor');
const { authRequired } = require('../middleware/auth');
const { logger } = require('../utils/logger');

/**
 * Public health endpoint for basic status
 */
router.get('/status', async (req, res) => {
  try {
    const status = await healthMonitor.getHealthStatus();
    
    res.json({
      status: status.status,
      lastCheck: status.lastCheck,
      uptime: status.uptime,
      alerts: {
        total: status.alerts.total,
        critical: status.alerts.critical,
        warning: status.alerts.warning
      },
      services: Object.keys(status.services || {}).reduce((acc, service) => {
        acc[service] = status.services[service].status;
        return acc;
      }, {})
    });
  } catch (error) {
    logger.error({ error }, 'health_status_endpoint_error');
    res.status(500).json({ error: 'Failed to get health status' });
  }
});

/**
 * Detailed health metrics (authenticated)
 */
router.get('/metrics', authRequired, async (req, res) => {
  try {
    const metrics = healthMonitor.getMetrics();
    res.json(metrics);
  } catch (error) {
    logger.error({ error }, 'health_metrics_endpoint_error');
    res.status(500).json({ error: 'Failed to get health metrics' });
  }
});

/**
 * Live health metrics (authenticated, real-time)
 */
router.get('/metrics/live', authRequired, async (req, res) => {
  try {
    const liveMetrics = await healthMonitor.collectAllMetrics();
    res.json(liveMetrics);
  } catch (error) {
    logger.error({ error }, 'live_health_metrics_endpoint_error');
    res.status(500).json({ error: 'Failed to get live health metrics' });
  }
});

/**
 * Health alerts (authenticated)
 */
router.get('/alerts', authRequired, async (req, res) => {
  try {
    const alerts = await healthMonitor.performHealthChecks();
    res.json({
      alerts,
      summary: {
        total: alerts.length,
        critical: alerts.filter(a => a.severity === 'critical').length,
        warning: alerts.filter(a => a.severity === 'warning').length
      }
    });
  } catch (error) {
    logger.error({ error }, 'health_alerts_endpoint_error');
    res.status(500).json({ error: 'Failed to get health alerts' });
  }
});

/**
 * System information (authenticated)
 */
router.get('/system', authRequired, async (req, res) => {
  try {
    const metrics = healthMonitor.getMetrics();
    
    if (!metrics.system) {
      return res.status(503).json({ error: 'System metrics not available' });
    }
    
    res.json({
      system: metrics.system,
      application: metrics.application,
      timestamp: metrics.timestamp
    });
  } catch (error) {
    logger.error({ error }, 'system_info_endpoint_error');
    res.status(500).json({ error: 'Failed to get system information' });
  }
});

/**
 * Service status (authenticated)
 */
router.get('/services', authRequired, async (req, res) => {
  try {
    const metrics = healthMonitor.getMetrics();
    
    if (!metrics.services) {
      return res.status(503).json({ error: 'Service metrics not available' });
    }
    
    res.json({
      services: metrics.services,
      timestamp: metrics.timestamp
    });
  } catch (error) {
    logger.error({ error }, 'service_status_endpoint_error');
    res.status(500).json({ error: 'Failed to get service status' });
  }
});

module.exports = router;