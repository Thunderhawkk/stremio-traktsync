// src/services/databaseMonitor.js
// Database monitoring and maintenance service

const { optimized } = require('../db/repo');
const { logger } = require('../utils/logger');
const cron = require('node-cron');

class DatabaseMonitor {
  constructor() {
    this.monitoringEnabled = process.env.DB_MONITORING_ENABLED !== 'false';
    this.cleanupEnabled = process.env.DB_CLEANUP_ENABLED !== 'false';
    this.metricsInterval = parseInt(process.env.DB_METRICS_INTERVAL || '300000', 10); // 5 minutes
    this.cleanupInterval = process.env.DB_CLEANUP_CRON || '0 2 * * *'; // Daily at 2 AM
    
    this.lastMetrics = null;
    this.cleanupRunning = false;
  }

  /**
   * Start database monitoring
   */
  start() {
    if (!this.monitoringEnabled) {
      logger.info('database_monitoring_disabled');
      return;
    }

    logger.info({
      metricsInterval: this.metricsInterval,
      cleanupInterval: this.cleanupInterval
    }, 'starting_database_monitoring');

    // Start metrics collection
    this.startMetricsCollection();

    // Start automated cleanup
    if (this.cleanupEnabled) {
      this.startAutomatedCleanup();
    }
  }

  /**
   * Start collecting database metrics
   */
  startMetricsCollection() {
    setInterval(async () => {
      try {
        await this.collectMetrics();
      } catch (error) {
        logger.error({ error }, 'metrics_collection_failed');
      }
    }, this.metricsInterval);

    // Collect initial metrics
    this.collectMetrics().catch(error => {
      logger.error({ error }, 'initial_metrics_collection_failed');
    });
  }

  /**
   * Start automated cleanup
   */
  startAutomatedCleanup() {
    cron.schedule(this.cleanupInterval, async () => {
      if (this.cleanupRunning) {
        logger.warn('cleanup_already_running');
        return;
      }

      try {
        this.cleanupRunning = true;
        await this.performMaintenance();
      } catch (error) {
        logger.error({ error }, 'automated_cleanup_failed');
      } finally {
        this.cleanupRunning = false;
      }
    });

    logger.info({ schedule: this.cleanupInterval }, 'automated_cleanup_scheduled');
  }

  /**
   * Collect database metrics
   */
  async collectMetrics() {
    try {
      const [userStats, tokenStats, dbMetrics] = await Promise.all([
        optimized.getUserStatistics(),
        optimized.getRefreshTokenStats(),
        optimized.getDatabaseMetrics()
      ]);

      const metrics = {
        timestamp: new Date().toISOString(),
        users: userStats,
        tokens: tokenStats,
        database: dbMetrics,
        performance: {
          cacheHitRatio: this.calculateCacheHitRatio(dbMetrics.connectionStats),
          avgResponseTime: this.calculateAvgResponseTime()
        }
      };

      this.lastMetrics = metrics;

      // Log important metrics
      logger.info({
        totalUsers: userStats.total_users,
        activeUsers7d: userStats.active_users_7d,
        activeTokens: tokenStats.active_tokens,
        cacheHitRatio: metrics.performance.cacheHitRatio
      }, 'database_metrics_collected');

      // Check for performance issues
      this.checkPerformanceAlerts(metrics);

      return metrics;
    } catch (error) {
      logger.error({ error }, 'metrics_collection_error');
      throw error;
    }
  }

  /**
   * Calculate cache hit ratio from database stats
   */
  calculateCacheHitRatio(connectionStats) {
    if (!connectionStats || !connectionStats.blks_read || !connectionStats.blks_hit) {
      return null;
    }
    
    const totalReads = connectionStats.blks_read + connectionStats.blks_hit;
    if (totalReads === 0) return 0;
    
    return (connectionStats.blks_hit / totalReads * 100).toFixed(2);
  }

  /**
   * Calculate average response time (placeholder - would need query timing)
   */
  calculateAvgResponseTime() {
    // This would require implementing query timing middleware
    // For now, return null as placeholder
    return null;
  }

  /**
   * Check for performance alerts
   */
  checkPerformanceAlerts(metrics) {
    const alerts = [];

    // Check cache hit ratio
    const cacheHitRatio = parseFloat(metrics.performance.cacheHitRatio);
    if (cacheHitRatio < 80) {
      alerts.push({
        type: 'low_cache_hit_ratio',
        value: cacheHitRatio,
        threshold: 80,
        message: 'Database cache hit ratio is below optimal threshold'
      });
    }

    // Check for too many revoked tokens
    const tokenStats = metrics.tokens;
    if (tokenStats.revoked_tokens > tokenStats.active_tokens * 2) {
      alerts.push({
        type: 'excessive_revoked_tokens',
        value: tokenStats.revoked_tokens,
        threshold: tokenStats.active_tokens * 2,
        message: 'Too many revoked tokens - cleanup recommended'
      });
    }

    // Check for inactive users
    const userStats = metrics.users;
    const inactiveUsers = userStats.total_users - userStats.active_users_30d;
    if (inactiveUsers > userStats.total_users * 0.8) {
      alerts.push({
        type: 'high_inactive_users',
        value: inactiveUsers,
        threshold: userStats.total_users * 0.8,
        message: 'High percentage of inactive users detected'
      });
    }

    if (alerts.length > 0) {
      logger.warn({ alerts }, 'database_performance_alerts');
    }
  }

  /**
   * Perform database maintenance
   */
  async performMaintenance() {
    logger.info('starting_database_maintenance');
    
    try {
      // Clean up expired tokens
      await optimized.cleanupExpiredTokens();
      
      // Log maintenance completion
      logger.info('database_maintenance_completed');
      
      return {
        timestamp: new Date().toISOString(),
        operations: ['token_cleanup'],
        success: true
      };
    } catch (error) {
      logger.error({ error }, 'database_maintenance_failed');
      throw error;
    }
  }

  /**
   * Get current database status
   */
  async getStatus() {
    try {
      const metrics = await this.collectMetrics();
      
      return {
        status: 'healthy',
        lastMetricsUpdate: metrics.timestamp,
        summary: {
          totalUsers: metrics.users.total_users,
          activeUsers: metrics.users.active_users_7d,
          activeTokens: metrics.tokens.active_tokens,
          cacheHitRatio: metrics.performance.cacheHitRatio
        },
        maintenance: {
          cleanupEnabled: this.cleanupEnabled,
          lastCleanup: this.lastCleanup,
          nextCleanup: this.getNextCleanupTime()
        }
      };
    } catch (error) {
      logger.error({ error }, 'database_status_check_failed');
      return {
        status: 'error',
        error: error.message,
        lastKnownGood: this.lastMetrics?.timestamp || null
      };
    }
  }

  /**
   * Get next cleanup time based on cron schedule
   */
  getNextCleanupTime() {
    // This would require a cron parser library for accurate calculation
    // For now, return approximate next day at 2 AM
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(2, 0, 0, 0);
    return tomorrow.toISOString();
  }

  /**
   * Force immediate maintenance
   */
  async forceMaintenance() {
    if (this.cleanupRunning) {
      throw new Error('Maintenance already running');
    }

    try {
      this.cleanupRunning = true;
      const result = await this.performMaintenance();
      this.lastCleanup = new Date().toISOString();
      return result;
    } finally {
      this.cleanupRunning = false;
    }
  }

  /**
   * Get historical metrics (if stored)
   */
  getMetrics() {
    return this.lastMetrics;
  }

  /**
   * Stop monitoring
   */
  stop() {
    // In a full implementation, we would clear intervals and cron jobs
    logger.info('database_monitoring_stopped');
  }
}

// Create singleton instance
const databaseMonitor = new DatabaseMonitor();

module.exports = databaseMonitor;