// src/services/performanceAlerts.js
// Automated performance alerts and notification system for critical health issues

const { logger } = require('../utils/logger');
const { auditService, AUDIT_EVENTS, SEVERITY } = require('./auditService');
const healthMonitor = require('./healthMonitor');
const websocketService = require('./websocketService');
const cron = require('node-cron');

// Alert severity levels
const ALERT_SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical',
  EMERGENCY: 'emergency'
};

// Alert types
const ALERT_TYPES = {
  HIGH_CPU: 'high_cpu_usage',
  HIGH_MEMORY: 'high_memory_usage',
  HIGH_DISK: 'high_disk_usage',
  HIGH_RESPONSE_TIME: 'high_response_time',
  HIGH_ERROR_RATE: 'high_error_rate',
  SERVICE_DOWN: 'service_down',
  DATABASE_SLOW: 'database_slow',
  WEBSOCKET_DISCONNECTED: 'websocket_disconnected',
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
  MEMORY_LEAK: 'memory_leak_detected',
  UNUSUAL_TRAFFIC: 'unusual_traffic_pattern'
};

// Notification channels
const NOTIFICATION_CHANNELS = {
  WEBSOCKET: 'websocket',
  EMAIL: 'email',
  SLACK: 'slack',
  LOG: 'log',
  AUDIT: 'audit'
};

class PerformanceAlerts {
  constructor() {
    this.enabled = process.env.PERFORMANCE_ALERTS_ENABLED !== 'false';
    this.checkInterval = parseInt(process.env.ALERT_CHECK_INTERVAL || '30000', 10); // 30 seconds
    
    // Alert thresholds (more granular than basic health monitoring)
    this.thresholds = {
      cpu: {
        warning: parseFloat(process.env.CPU_WARNING_THRESHOLD || '70'),
        critical: parseFloat(process.env.CPU_CRITICAL_THRESHOLD || '85'),
        emergency: parseFloat(process.env.CPU_EMERGENCY_THRESHOLD || '95')
      },
      memory: {
        warning: parseFloat(process.env.MEMORY_WARNING_THRESHOLD || '75'),
        critical: parseFloat(process.env.MEMORY_CRITICAL_THRESHOLD || '90'),
        emergency: parseFloat(process.env.MEMORY_EMERGENCY_THRESHOLD || '95')
      },
      responseTime: {
        warning: parseInt(process.env.RESPONSE_WARNING_THRESHOLD || '2000', 10),
        critical: parseInt(process.env.RESPONSE_CRITICAL_THRESHOLD || '5000', 10),
        emergency: parseInt(process.env.RESPONSE_EMERGENCY_THRESHOLD || '10000', 10)
      },
      errorRate: {
        warning: parseFloat(process.env.ERROR_RATE_WARNING_THRESHOLD || '2'),
        critical: parseFloat(process.env.ERROR_RATE_CRITICAL_THRESHOLD || '5'),
        emergency: parseFloat(process.env.ERROR_RATE_EMERGENCY_THRESHOLD || '10')
      },
      diskUsage: {
        warning: parseFloat(process.env.DISK_WARNING_THRESHOLD || '80'),
        critical: parseFloat(process.env.DISK_CRITICAL_THRESHOLD || '90'),
        emergency: parseFloat(process.env.DISK_EMERGENCY_THRESHOLD || '95')
      }
    };

    // Alert history and cooldown management
    this.alertHistory = new Map(); // Alert type -> last sent timestamp
    this.cooldownPeriods = {
      [ALERT_SEVERITY.INFO]: 5 * 60 * 1000,      // 5 minutes
      [ALERT_SEVERITY.WARNING]: 10 * 60 * 1000,   // 10 minutes
      [ALERT_SEVERITY.CRITICAL]: 5 * 60 * 1000,   // 5 minutes
      [ALERT_SEVERITY.EMERGENCY]: 2 * 60 * 1000   // 2 minutes
    };

    // Active alerts tracking
    this.activeAlerts = new Map();
    
    // Performance trend tracking
    this.performanceTrends = {
      cpu: [],
      memory: [],
      responseTime: [],
      errorRate: []
    };
    this.maxTrendSamples = 100;

    // Notification handlers
    this.notificationHandlers = new Map();
    this.setupNotificationHandlers();
  }

  /**
   * Start the performance alerts system
   */
  start() {
    if (!this.enabled) {
      logger.info('performance_alerts_disabled');
      return;
    }

    logger.info({
      checkInterval: this.checkInterval,
      thresholds: this.thresholds
    }, 'starting_performance_alerts');

    // Start alert checking
    this.startAlertChecking();

    // Start trend analysis
    this.startTrendAnalysis();

    // Schedule alert cleanup
    cron.schedule('0 */6 * * *', () => {
      this.cleanupOldAlerts();
    });

    // Schedule performance reports
    cron.schedule('0 0 * * *', () => {
      this.generateDailyReport();
    });
  }

  /**
   * Setup notification handlers
   */
  setupNotificationHandlers() {
    // WebSocket notifications for real-time alerts
    this.notificationHandlers.set(NOTIFICATION_CHANNELS.WEBSOCKET, async (alert) => {
      try {
        websocketService.broadcast('performance_alert', {
          type: alert.type,
          severity: alert.severity,
          message: alert.message,
          timestamp: alert.timestamp,
          metrics: alert.metrics
        });
      } catch (error) {
        logger.error({ error }, 'websocket_notification_failed');
      }
    });

    // Audit log notifications
    this.notificationHandlers.set(NOTIFICATION_CHANNELS.AUDIT, async (alert) => {
      try {
        await auditService.log({
          eventType: AUDIT_EVENTS.SYSTEM_ERROR,
          severity: this.mapAlertSeverityToAuditSeverity(alert.severity),
          action: 'performance_alert',
          resource: 'system_performance',
          details: {
            alertType: alert.type,
            alertSeverity: alert.severity,
            message: alert.message,
            metrics: alert.metrics,
            timestamp: alert.timestamp
          }
        });
      } catch (error) {
        logger.error({ error }, 'audit_notification_failed');
      }
    });

    // Application log notifications
    this.notificationHandlers.set(NOTIFICATION_CHANNELS.LOG, async (alert) => {
      const logLevel = this.mapAlertSeverityToLogLevel(alert.severity);
      logger[logLevel]({
        alert: true,
        type: alert.type,
        severity: alert.severity,
        metrics: alert.metrics
      }, alert.message);
    });

    // Email notifications (placeholder for future implementation)
    this.notificationHandlers.set(NOTIFICATION_CHANNELS.EMAIL, async (alert) => {
      if (process.env.EMAIL_ALERTS_ENABLED === 'true') {
        // TODO: Implement email notifications
        logger.info({ alert }, 'email_notification_placeholder');
      }
    });

    // Slack notifications (placeholder for future implementation)
    this.notificationHandlers.set(NOTIFICATION_CHANNELS.SLACK, async (alert) => {
      if (process.env.SLACK_ALERTS_ENABLED === 'true') {
        // TODO: Implement Slack notifications
        logger.info({ alert }, 'slack_notification_placeholder');
      }
    });
  }

  /**
   * Start periodic alert checking
   */
  startAlertChecking() {
    setInterval(async () => {
      try {
        await this.checkPerformanceAlerts();
      } catch (error) {
        logger.error({ error }, 'performance_alert_check_failed');
      }
    }, this.checkInterval);

    // Initial check
    this.checkPerformanceAlerts();
  }

  /**
   * Start trend analysis
   */
  startTrendAnalysis() {
    setInterval(async () => {
      try {
        await this.analyzeTrends();
      } catch (error) {
        logger.error({ error }, 'trend_analysis_failed');
      }
    }, this.checkInterval * 2); // Run less frequently
  }

  /**
   * Check for performance alerts
   */
  async checkPerformanceAlerts() {
    const healthStatus = await healthMonitor.getHealthStatus();
    const metrics = healthMonitor.getMetrics();

    if (!metrics || !metrics.system || !metrics.performance) {
      return;
    }

    const alerts = [];

    // Check CPU usage
    const cpuAlert = this.checkMetricThresholds(
      'cpu',
      metrics.system.cpu,
      this.thresholds.cpu,
      ALERT_TYPES.HIGH_CPU,
      'CPU usage'
    );
    if (cpuAlert) alerts.push(cpuAlert);

    // Check memory usage
    const memoryUsage = parseFloat(metrics.system.memory.usage);
    const memoryAlert = this.checkMetricThresholds(
      'memory',
      memoryUsage,
      this.thresholds.memory,
      ALERT_TYPES.HIGH_MEMORY,
      'Memory usage'
    );
    if (memoryAlert) alerts.push(memoryAlert);

    // Check response time
    const responseTime = parseFloat(metrics.performance.averageResponseTime);
    const responseAlert = this.checkMetricThresholds(
      'responseTime',
      responseTime,
      this.thresholds.responseTime,
      ALERT_TYPES.HIGH_RESPONSE_TIME,
      'Average response time'
    );
    if (responseAlert) alerts.push(responseAlert);

    // Check error rate
    const errorRate = metrics.performance.errorRate;
    const errorAlert = this.checkMetricThresholds(
      'errorRate',
      errorRate,
      this.thresholds.errorRate,
      ALERT_TYPES.HIGH_ERROR_RATE,
      'Error rate'
    );
    if (errorAlert) alerts.push(errorAlert);

    // Check service health
    if (metrics.services) {
      Object.entries(metrics.services).forEach(([service, status]) => {
        if (status.status === 'down') {
          const serviceAlert = {
            type: ALERT_TYPES.SERVICE_DOWN,
            severity: ALERT_SEVERITY.CRITICAL,
            message: `Service ${service} is down`,
            metrics: { service, status },
            timestamp: new Date().toISOString(),
            recovery: false
          };
          alerts.push(serviceAlert);
        }
      });
    }

    // Update performance trends
    this.updateTrends(metrics);

    // Process alerts
    for (const alert of alerts) {
      await this.processAlert(alert);
    }

    // Check for recovery
    await this.checkRecovery(metrics);
  }

  /**
   * Check metric against thresholds
   */
  checkMetricThresholds(metricName, value, thresholds, alertType, description) {
    let severity = null;
    let threshold = null;

    if (value >= thresholds.emergency) {
      severity = ALERT_SEVERITY.EMERGENCY;
      threshold = thresholds.emergency;
    } else if (value >= thresholds.critical) {
      severity = ALERT_SEVERITY.CRITICAL;
      threshold = thresholds.critical;
    } else if (value >= thresholds.warning) {
      severity = ALERT_SEVERITY.WARNING;
      threshold = thresholds.warning;
    }

    if (severity) {
      return {
        type: alertType,
        severity,
        message: `${description} is ${value}${this.getUnit(metricName)}, exceeding ${severity} threshold of ${threshold}${this.getUnit(metricName)}`,
        metrics: { [metricName]: value, threshold },
        timestamp: new Date().toISOString(),
        recovery: false
      };
    }

    return null;
  }

  /**
   * Get unit for metric
   */
  getUnit(metricName) {
    const units = {
      cpu: '%',
      memory: '%',
      responseTime: 'ms',
      errorRate: '%',
      diskUsage: '%'
    };
    return units[metricName] || '';
  }

  /**
   * Process an alert
   */
  async processAlert(alert) {
    const alertKey = `${alert.type}_${alert.severity}`;
    const now = Date.now();
    
    // Check cooldown
    const lastSent = this.alertHistory.get(alertKey);
    const cooldown = this.cooldownPeriods[alert.severity];
    
    if (lastSent && (now - lastSent) < cooldown) {
      return; // Still in cooldown
    }

    // Update alert history
    this.alertHistory.set(alertKey, now);
    this.activeAlerts.set(alert.type, alert);

    // Send notifications
    await this.sendNotifications(alert);

    logger.info({
      alert: alert.type,
      severity: alert.severity,
      message: alert.message
    }, 'performance_alert_triggered');
  }

  /**
   * Send notifications for an alert
   */
  async sendNotifications(alert) {
    const channels = [NOTIFICATION_CHANNELS.LOG, NOTIFICATION_CHANNELS.AUDIT];
    
    // Add WebSocket for critical and emergency alerts
    if (alert.severity === ALERT_SEVERITY.CRITICAL || alert.severity === ALERT_SEVERITY.EMERGENCY) {
      channels.push(NOTIFICATION_CHANNELS.WEBSOCKET);
    }

    // Add email for emergency alerts
    if (alert.severity === ALERT_SEVERITY.EMERGENCY) {
      channels.push(NOTIFICATION_CHANNELS.EMAIL);
    }

    for (const channel of channels) {
      const handler = this.notificationHandlers.get(channel);
      if (handler) {
        try {
          await handler(alert);
        } catch (error) {
          logger.error({ error, channel }, 'notification_handler_failed');
        }
      }
    }
  }

  /**
   * Check for recovery from alerts
   */
  async checkRecovery(metrics) {
    for (const [alertType, activeAlert] of this.activeAlerts.entries()) {
      let isRecovered = false;

      switch (alertType) {
        case ALERT_TYPES.HIGH_CPU:
          isRecovered = metrics.system.cpu < this.thresholds.cpu.warning;
          break;
        case ALERT_TYPES.HIGH_MEMORY:
          isRecovered = parseFloat(metrics.system.memory.usage) < this.thresholds.memory.warning;
          break;
        case ALERT_TYPES.HIGH_RESPONSE_TIME:
          isRecovered = parseFloat(metrics.performance.averageResponseTime) < this.thresholds.responseTime.warning;
          break;
        case ALERT_TYPES.HIGH_ERROR_RATE:
          isRecovered = metrics.performance.errorRate < this.thresholds.errorRate.warning;
          break;
      }

      if (isRecovered) {
        const recoveryAlert = {
          type: alertType,
          severity: ALERT_SEVERITY.INFO,
          message: `RECOVERY: ${activeAlert.message.replace(/exceeding.*/, 'has returned to normal levels')}`,
          metrics: activeAlert.metrics,
          timestamp: new Date().toISOString(),
          recovery: true
        };

        await this.sendNotifications(recoveryAlert);
        this.activeAlerts.delete(alertType);

        logger.info({
          recoveredAlert: alertType,
          message: recoveryAlert.message
        }, 'performance_alert_recovered');
      }
    }
  }

  /**
   * Update performance trends
   */
  updateTrends(metrics) {
    const trends = {
      cpu: metrics.system.cpu,
      memory: parseFloat(metrics.system.memory.usage),
      responseTime: parseFloat(metrics.performance.averageResponseTime),
      errorRate: metrics.performance.errorRate
    };

    Object.entries(trends).forEach(([metric, value]) => {
      this.performanceTrends[metric].push({
        value,
        timestamp: Date.now()
      });

      // Keep only recent samples
      if (this.performanceTrends[metric].length > this.maxTrendSamples) {
        this.performanceTrends[metric] = this.performanceTrends[metric].slice(-this.maxTrendSamples);
      }
    });
  }

  /**
   * Analyze performance trends
   */
  async analyzeTrends() {
    Object.entries(this.performanceTrends).forEach(([metric, samples]) => {
      if (samples.length < 10) return; // Need enough samples

      const recentSamples = samples.slice(-10);
      const trend = this.calculateTrend(recentSamples);

      // Check for concerning trends
      if (trend.slope > 0 && trend.correlation > 0.7) {
        // Upward trend detected
        const projection = this.projectTrend(trend, samples[samples.length - 1].value);
        
        if (this.isTrendConcerning(metric, projection)) {
          this.triggerTrendAlert(metric, trend, projection);
        }
      }
    });
  }

  /**
   * Calculate trend for samples
   */
  calculateTrend(samples) {
    const n = samples.length;
    const x = samples.map((_, i) => i);
    const y = samples.map(s => s.value);

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Calculate correlation coefficient
    const meanX = sumX / n;
    const meanY = sumY / n;
    const numerator = x.reduce((sum, xi, i) => sum + (xi - meanX) * (y[i] - meanY), 0);
    const denomX = Math.sqrt(x.reduce((sum, xi) => sum + Math.pow(xi - meanX, 2), 0));
    const denomY = Math.sqrt(y.reduce((sum, yi) => sum + Math.pow(yi - meanY, 2), 0));
    const correlation = numerator / (denomX * denomY);

    return { slope, intercept, correlation };
  }

  /**
   * Project trend into future
   */
  projectTrend(trend, currentValue) {
    // Project 10 periods into the future
    return currentValue + (trend.slope * 10);
  }

  /**
   * Check if trend is concerning
   */
  isTrendConcerning(metric, projection) {
    const thresholds = this.thresholds[metric];
    if (!thresholds) return false;

    return projection >= thresholds.warning;
  }

  /**
   * Trigger trend alert
   */
  async triggerTrendAlert(metric, trend, projection) {
    const alert = {
      type: `${metric}_trend_alert`,
      severity: ALERT_SEVERITY.WARNING,
      message: `Concerning upward trend detected in ${metric}. Current trend may reach warning threshold soon. Projected value: ${projection.toFixed(2)}`,
      metrics: { metric, trend, projection },
      timestamp: new Date().toISOString(),
      recovery: false
    };

    await this.processAlert(alert);
  }

  /**
   * Generate daily performance report
   */
  async generateDailyReport() {
    const report = {
      date: new Date().toISOString().split('T')[0],
      alertsSent: this.alertHistory.size,
      activeAlerts: this.activeAlerts.size,
      trends: this.performanceTrends,
      timestamp: new Date().toISOString()
    };

    logger.info({ report }, 'daily_performance_report');

    // Audit the report generation
    await auditService.log({
      eventType: AUDIT_EVENTS.SYSTEM_ERROR,
      severity: SEVERITY.LOW,
      action: 'generate_performance_report',
      resource: 'performance_monitoring',
      details: report
    });
  }

  /**
   * Cleanup old alerts and trends
   */
  cleanupOldAlerts() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    // Clean alert history
    for (const [key, timestamp] of this.alertHistory.entries()) {
      if (now - timestamp > maxAge) {
        this.alertHistory.delete(key);
      }
    }

    // Clean trend data
    Object.keys(this.performanceTrends).forEach(metric => {
      this.performanceTrends[metric] = this.performanceTrends[metric].filter(
        sample => now - sample.timestamp < maxAge
      );
    });

    logger.info('performance_alerts_cleanup_completed');
  }

  /**
   * Get current alert status
   */
  getAlertStatus() {
    return {
      enabled: this.enabled,
      activeAlerts: Array.from(this.activeAlerts.values()),
      alertHistory: this.alertHistory.size,
      thresholds: this.thresholds,
      trends: Object.fromEntries(
        Object.entries(this.performanceTrends).map(([key, samples]) => [
          key,
          samples.slice(-10) // Last 10 samples
        ])
      )
    };
  }

  /**
   * Helper methods
   */
  mapAlertSeverityToAuditSeverity(alertSeverity) {
    const mapping = {
      [ALERT_SEVERITY.INFO]: SEVERITY.LOW,
      [ALERT_SEVERITY.WARNING]: SEVERITY.MEDIUM,
      [ALERT_SEVERITY.CRITICAL]: SEVERITY.HIGH,
      [ALERT_SEVERITY.EMERGENCY]: SEVERITY.CRITICAL
    };
    return mapping[alertSeverity] || SEVERITY.MEDIUM;
  }

  mapAlertSeverityToLogLevel(alertSeverity) {
    const mapping = {
      [ALERT_SEVERITY.INFO]: 'info',
      [ALERT_SEVERITY.WARNING]: 'warn',
      [ALERT_SEVERITY.CRITICAL]: 'error',
      [ALERT_SEVERITY.EMERGENCY]: 'error'
    };
    return mapping[alertSeverity] || 'warn';
  }

  /**
   * Stop the alert system
   */
  stop() {
    logger.info('performance_alerts_stopped');
  }
}

// Create singleton instance
const performanceAlerts = new PerformanceAlerts();

module.exports = {
  performanceAlerts,
  ALERT_SEVERITY,
  ALERT_TYPES,
  NOTIFICATION_CHANNELS
};