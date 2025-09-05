// src/services/healthMonitor.js
// Comprehensive health monitoring service

const os = require('os');
const fs = require('fs').promises;
const { logger } = require('../utils/logger');
const databaseMonitor = require('./databaseMonitor');
const websocketService = require('./websocketService');
const { cache } = require('../utils/cache');
const cron = require('node-cron');

class HealthMonitor {
  constructor() {
    this.monitoringEnabled = process.env.HEALTH_MONITORING_ENABLED !== 'false';
    this.metricsInterval = parseInt(process.env.HEALTH_METRICS_INTERVAL || '60000', 10); // 1 minute
    this.alertThresholds = {
      cpuUsage: parseFloat(process.env.CPU_THRESHOLD || '80'),
      memoryUsage: parseFloat(process.env.MEMORY_THRESHOLD || '85'),
      diskUsage: parseFloat(process.env.DISK_THRESHOLD || '90'),
      responseTime: parseInt(process.env.RESPONSE_TIME_THRESHOLD || '5000', 10),
      errorRate: parseFloat(process.env.ERROR_RATE_THRESHOLD || '5')
    };
    
    this.metrics = {
      system: null,
      application: null,
      services: null,
      performance: null
    };
    
    this.alerts = [];
    this.responseTimeSamples = [];
    this.errorCount = 0;
    this.requestCount = 0;
    this.lastCheck = null;
  }

  /**
   * Start health monitoring
   */
  start() {
    if (!this.monitoringEnabled) {
      logger.info('health_monitoring_disabled');
      return;
    }

    logger.info({
      metricsInterval: this.metricsInterval,
      alertThresholds: this.alertThresholds
    }, 'starting_health_monitoring');

    // Start metrics collection
    this.startMetricsCollection();

    // Start periodic health checks
    this.startHealthChecks();

    // Clear old metrics periodically
    cron.schedule('0 0 * * *', () => {
      this.clearOldMetrics();
    });
  }

  /**
   * Start collecting system and application metrics
   */
  startMetricsCollection() {
    setInterval(async () => {
      try {
        await this.collectAllMetrics();
      } catch (error) {
        logger.error({ error }, 'health_metrics_collection_failed');
      }
    }, this.metricsInterval);

    // Collect initial metrics
    this.collectAllMetrics().catch(error => {
      logger.error({ error }, 'initial_health_metrics_failed');
    });
  }

  /**
   * Start periodic health checks
   */
  startHealthChecks() {
    setInterval(async () => {
      try {
        await this.performHealthChecks();
      } catch (error) {
        logger.error({ error }, 'health_checks_failed');
      }
    }, this.metricsInterval * 2); // Run less frequently than metrics collection
  }

  /**
   * Collect all health metrics
   */
  async collectAllMetrics() {
    const timestamp = new Date().toISOString();
    
    // Collect system metrics
    this.metrics.system = await this.collectSystemMetrics();
    
    // Collect application metrics
    this.metrics.application = await this.collectApplicationMetrics();
    
    // Collect service status
    this.metrics.services = await this.collectServiceMetrics();
    
    // Collect performance metrics
    this.metrics.performance = await this.collectPerformanceMetrics();
    
    this.lastCheck = timestamp;

    // Log important metrics
    logger.info({
      timestamp,
      cpu: this.metrics.system.cpu,
      memory: this.metrics.system.memory.usage,
      uptime: this.metrics.application.uptime,
      responseTime: this.metrics.performance.averageResponseTime
    }, 'health_metrics_collected');

    return {
      timestamp,
      ...this.metrics
    };
  }

  /**
   * Collect system metrics (CPU, memory, disk)
   */
  async collectSystemMetrics() {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    // Calculate CPU usage
    let cpuUsage = 0;
    if (cpus.length > 0) {
      const cpuTimes = cpus.map(cpu => {
        const total = Object.values(cpu.times).reduce((acc, time) => acc + time, 0);
        const idle = cpu.times.idle;
        return { total, idle };
      });
      
      const totalCpuTime = cpuTimes.reduce((acc, cpu) => acc + cpu.total, 0);
      const totalIdleTime = cpuTimes.reduce((acc, cpu) => acc + cpu.idle, 0);
      cpuUsage = ((totalCpuTime - totalIdleTime) / totalCpuTime * 100).toFixed(2);
    }

    // Get disk usage (approximate for current directory)
    let diskUsage = 0;
    try {
      const stats = await fs.stat(process.cwd());
      // This is a simplified disk usage calculation
      // In production, you might want to use a library like 'diskusage'
      diskUsage = 0; // Placeholder - requires platform-specific implementation
    } catch (error) {
      logger.warn({ error }, 'disk_usage_calculation_failed');
    }

    return {
      cpu: parseFloat(cpuUsage),
      memory: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        usage: (usedMem / totalMem * 100).toFixed(2)
      },
      disk: {
        usage: diskUsage
      },
      loadAverage: os.loadavg(),
      uptime: os.uptime()
    };
  }

  /**
   * Collect application-specific metrics
   */
  async collectApplicationMetrics() {
    const memUsage = process.memoryUsage();
    
    return {
      pid: process.pid,
      uptime: process.uptime(),
      memory: {
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external,
        arrayBuffers: memUsage.arrayBuffers
      },
      version: process.version,
      platform: process.platform,
      nodeVersion: process.version
    };
  }

  /**
   * Collect service status metrics
   */
  async collectServiceMetrics() {
    const services = {};

    // Database health
    try {
      const dbStatus = await databaseMonitor.getStatus();
      services.database = {
        status: dbStatus.status === 'healthy' ? 'up' : 'down',
        responseTime: null, // Could be enhanced with actual response time
        lastCheck: dbStatus.lastMetricsUpdate
      };
    } catch (error) {
      services.database = {
        status: 'down',
        error: error.message,
        lastCheck: new Date().toISOString()
      };
    }

    // WebSocket service health
    try {
      const wsStatus = websocketService.isHealthy();
      const wsStats = websocketService.getConnectionStats();
      services.websocket = {
        status: wsStatus ? 'up' : 'down',
        connections: wsStats.connected,
        isInitialized: wsStats.isInitialized,
        lastCheck: new Date().toISOString()
      };
    } catch (error) {
      services.websocket = {
        status: 'down',
        error: error.message,
        lastCheck: new Date().toISOString()
      };
    }

    // Cache health
    try {
      const cacheKeys = cache.keys().length;
      services.cache = {
        status: 'up',
        keys: cacheKeys,
        stats: cache.getStats ? cache.getStats() : { hits: 0, misses: 0 },
        lastCheck: new Date().toISOString()
      };
    } catch (error) {
      services.cache = {
        status: 'down',
        error: error.message,
        lastCheck: new Date().toISOString()
      };
    }

    return services;
  }

  /**
   * Collect performance metrics
   */
  async collectPerformanceMetrics() {
    // Calculate average response time
    const avgResponseTime = this.responseTimeSamples.length > 0
      ? this.responseTimeSamples.reduce((a, b) => a + b, 0) / this.responseTimeSamples.length
      : 0;

    // Calculate error rate
    const errorRate = this.requestCount > 0
      ? (this.errorCount / this.requestCount * 100).toFixed(2)
      : 0;

    return {
      averageResponseTime: avgResponseTime.toFixed(2),
      errorRate: parseFloat(errorRate),
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      responseSamples: this.responseTimeSamples.length
    };
  }

  /**
   * Perform health checks and generate alerts
   */
  async performHealthChecks() {
    const currentAlerts = [];

    // Check system metrics
    if (this.metrics.system) {
      // CPU usage alert
      if (this.metrics.system.cpu > this.alertThresholds.cpuUsage) {
        currentAlerts.push({
          type: 'high_cpu_usage',
          severity: 'warning',
          value: this.metrics.system.cpu,
          threshold: this.alertThresholds.cpuUsage,
          message: `CPU usage is ${this.metrics.system.cpu}%, exceeding threshold of ${this.alertThresholds.cpuUsage}%`,
          timestamp: new Date().toISOString()
        });
      }

      // Memory usage alert
      const memUsage = parseFloat(this.metrics.system.memory.usage);
      if (memUsage > this.alertThresholds.memoryUsage) {
        currentAlerts.push({
          type: 'high_memory_usage',
          severity: 'warning',
          value: memUsage,
          threshold: this.alertThresholds.memoryUsage,
          message: `Memory usage is ${memUsage}%, exceeding threshold of ${this.alertThresholds.memoryUsage}%`,
          timestamp: new Date().toISOString()
        });
      }
    }

    // Check performance metrics
    if (this.metrics.performance) {
      // Response time alert
      const avgResponseTime = parseFloat(this.metrics.performance.averageResponseTime);
      if (avgResponseTime > this.alertThresholds.responseTime) {
        currentAlerts.push({
          type: 'high_response_time',
          severity: 'warning',
          value: avgResponseTime,
          threshold: this.alertThresholds.responseTime,
          message: `Average response time is ${avgResponseTime}ms, exceeding threshold of ${this.alertThresholds.responseTime}ms`,
          timestamp: new Date().toISOString()
        });
      }

      // Error rate alert
      const errorRate = this.metrics.performance.errorRate;
      if (errorRate > this.alertThresholds.errorRate) {
        currentAlerts.push({
          type: 'high_error_rate',
          severity: 'critical',
          value: errorRate,
          threshold: this.alertThresholds.errorRate,
          message: `Error rate is ${errorRate}%, exceeding threshold of ${this.alertThresholds.errorRate}%`,
          timestamp: new Date().toISOString()
        });
      }
    }

    // Check service health
    if (this.metrics.services) {
      Object.entries(this.metrics.services).forEach(([service, status]) => {
        if (status.status === 'down') {
          currentAlerts.push({
            type: 'service_down',
            severity: 'critical',
            service: service,
            message: `Service ${service} is down: ${status.error || 'Unknown error'}`,
            timestamp: new Date().toISOString()
          });
        }
      });
    }

    // Update alerts
    this.alerts = currentAlerts;

    // Log alerts if any
    if (currentAlerts.length > 0) {
      logger.warn({ alerts: currentAlerts }, 'health_alerts_detected');
    }

    return currentAlerts;
  }

  /**
   * Record response time for performance metrics
   */
  recordResponseTime(responseTime) {
    this.responseTimeSamples.push(responseTime);
    
    // Keep only last 1000 samples
    if (this.responseTimeSamples.length > 1000) {
      this.responseTimeSamples = this.responseTimeSamples.slice(-1000);
    }
  }

  /**
   * Record request for performance metrics
   */
  recordRequest(isError = false) {
    this.requestCount++;
    if (isError) {
      this.errorCount++;
    }
  }

  /**
   * Get current health status
   */
  async getHealthStatus() {
    if (!this.lastCheck) {
      await this.collectAllMetrics();
    }

    const criticalAlerts = this.alerts.filter(alert => alert.severity === 'critical');
    const warningAlerts = this.alerts.filter(alert => alert.severity === 'warning');

    return {
      status: criticalAlerts.length > 0 ? 'critical' : warningAlerts.length > 0 ? 'warning' : 'healthy',
      lastCheck: this.lastCheck,
      alerts: {
        critical: criticalAlerts.length,
        warning: warningAlerts.length,
        total: this.alerts.length
      },
      services: this.metrics.services,
      uptime: this.metrics.application?.uptime || 0
    };
  }

  /**
   * Get detailed metrics
   */
  getMetrics() {
    return {
      timestamp: this.lastCheck,
      ...this.metrics,
      alerts: this.alerts
    };
  }

  /**
   * Clear old metrics to prevent memory leaks
   */
  clearOldMetrics() {
    // Reset counters daily
    this.errorCount = 0;
    this.requestCount = 0;
    this.responseTimeSamples = [];
    
    logger.info('health_metrics_cleared');
  }

  /**
   * Stop monitoring
   */
  stop() {
    logger.info('health_monitoring_stopped');
  }
}

// Create singleton instance
const healthMonitor = new HealthMonitor();

module.exports = healthMonitor;