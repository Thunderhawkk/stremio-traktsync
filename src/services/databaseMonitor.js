// src/services/databaseMonitor.js
// Database monitoring and maintenance service

const { repo } = require('../db/repo');
const fsdb = require('../db/fs');
const { logger } = require('../utils/logger');
const cron = require('node-cron');
const cfg = require('../config');

class DatabaseMonitor {
  constructor() {
    this.monitoringEnabled = process.env.DB_MONITORING_ENABLED !== 'false';
    this.cleanupEnabled = process.env.DB_CLEANUP_ENABLED !== 'false';
    this.metricsInterval = parseInt(process.env.DB_METRICS_INTERVAL || '300000', 10); // 5 minutes
    this.cleanupInterval = process.env.DB_CLEANUP_CRON || '0 2 * * *'; // Daily at 2 AM
    this.usePg = !!(cfg.db && cfg.db.url);
    
    this.lastMetrics = null;
    this.lastCleanup = null;
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
      let userStats, tokenStats, dbMetrics;
      
      if (this.usePg) {
        // Use PostgreSQL optimized queries if available
        try {
          const { optimized } = require('../db/repo');
          [userStats, tokenStats, dbMetrics] = await Promise.all([
            optimized.getUserStatistics(),
            optimized.getRefreshTokenStats(),
            optimized.getDatabaseMetrics()
          ]);
        } catch (error) {
          logger.warn('Optimized queries not available, using fallback methods');
          throw error;
        }
      } else {
        // Use filesystem storage fallback
        userStats = await this.getUserStatisticsFS();
        tokenStats = await this.getRefreshTokenStatsFS();
        dbMetrics = await this.getDatabaseMetricsFS();
      }

      const metrics = {
        timestamp: new Date().toISOString(),
        users: userStats,
        tokens: tokenStats,
        database: dbMetrics,
        performance: {
          cacheHitRatio: this.usePg ? this.calculateCacheHitRatio(dbMetrics.connectionStats) : null,
          avgResponseTime: this.calculateAvgResponseTime()
        }
      };

      this.lastMetrics = metrics;

      // Log important metrics
      logger.info({
        totalUsers: userStats.total_users || 0,
        activeUsers7d: userStats.active_users_7d || 0,
        activeTokens: tokenStats.active_tokens || 0,
        cacheHitRatio: metrics.performance.cacheHitRatio,
        storageType: this.usePg ? 'postgresql' : 'filesystem'
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
   * Get user statistics for filesystem storage
   */
  async getUserStatisticsFS() {
    try {
      const users = fsdb.read('users') || [];
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      return {
        total_users: users.length,
        active_users_1d: users.filter(u => u.lastLoginAt && new Date(u.lastLoginAt) > oneDayAgo).length,
        active_users_7d: users.filter(u => u.lastLoginAt && new Date(u.lastLoginAt) > sevenDaysAgo).length,
        active_users_30d: users.filter(u => u.lastLoginAt && new Date(u.lastLoginAt) > thirtyDaysAgo).length,
        new_users_7d: users.filter(u => u.createdAt && new Date(u.createdAt) > sevenDaysAgo).length,
        new_users_30d: users.filter(u => u.createdAt && new Date(u.createdAt) > thirtyDaysAgo).length
      };
    } catch (error) {
      logger.error('Failed to get user statistics from filesystem:', error);
      return {
        total_users: 0,
        active_users_1d: 0,
        active_users_7d: 0,
        active_users_30d: 0,
        new_users_7d: 0,
        new_users_30d: 0
      };
    }
  }

  /**
   * Get refresh token statistics for filesystem storage
   */
  async getRefreshTokenStatsFS() {
    try {
      const tokens = fsdb.read('refresh') || [];
      const now = new Date();
      
      const activeTokens = tokens.filter(token => {
        if (token.revokedAt) return false;
        if (token.expiresAt && new Date(token.expiresAt) < now) return false;
        return true;
      });

      const revokedTokens = tokens.filter(token => token.revokedAt);
      const expiredTokens = tokens.filter(token => {
        return token.expiresAt && new Date(token.expiresAt) < now && !token.revokedAt;
      });

      return {
        total_tokens: tokens.length,
        active_tokens: activeTokens.length,
        revoked_tokens: revokedTokens.length,
        expired_tokens: expiredTokens.length
      };
    } catch (error) {
      logger.error('Failed to get token statistics from filesystem:', error);
      return {
        total_tokens: 0,
        active_tokens: 0,
        revoked_tokens: 0,
        expired_tokens: 0
      };
    }
  }

  /**
   * Get database metrics for filesystem storage
   */
  async getDatabaseMetricsFS() {
    try {
      const fs = require('fs');
      const path = require('path');
      const dataDir = cfg.dataDir || '.data';
      
      let totalSize = 0;
      let fileCount = 0;
      
      if (fs.existsSync(dataDir)) {
        const files = fs.readdirSync(dataDir);
        fileCount = files.length;
        
        files.forEach(file => {
          try {
            const stats = fs.statSync(path.join(dataDir, file));
            totalSize += stats.size;
          } catch (err) {
            // Ignore file errors
          }
        });
      }

      return {
        storage_type: 'filesystem',
        data_directory: dataDir,
        file_count: fileCount,
        total_size_bytes: totalSize,
        total_size_mb: Math.round(totalSize / (1024 * 1024) * 100) / 100,
        last_check: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to get database metrics from filesystem:', error);
      return {
        storage_type: 'filesystem',
        error: error.message,
        last_check: new Date().toISOString()
      };
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

    // Check cache hit ratio (only for PostgreSQL)
    if (this.usePg && metrics.performance.cacheHitRatio) {
      const cacheHitRatio = parseFloat(metrics.performance.cacheHitRatio);
      if (cacheHitRatio < 80) {
        alerts.push({
          type: 'low_cache_hit_ratio',
          value: cacheHitRatio,
          threshold: 80,
          message: 'Database cache hit ratio is below optimal threshold'
        });
      }
    }

    // Check for too many revoked tokens
    const tokenStats = metrics.tokens;
    if (tokenStats && tokenStats.revoked_tokens > tokenStats.active_tokens * 2) {
      alerts.push({
        type: 'excessive_revoked_tokens',
        value: tokenStats.revoked_tokens,
        threshold: tokenStats.active_tokens * 2,
        message: 'Too many revoked tokens - cleanup recommended'
      });
    }

    // Check for inactive users
    const userStats = metrics.users;
    if (userStats && userStats.total_users > 0) {
      const inactiveUsers = userStats.total_users - (userStats.active_users_30d || 0);
      if (inactiveUsers > userStats.total_users * 0.8) {
        alerts.push({
          type: 'high_inactive_users',
          value: inactiveUsers,
          threshold: userStats.total_users * 0.8,
          message: 'High percentage of inactive users detected'
        });
      }
    }

    // Check filesystem storage size (filesystem only)
    if (!this.usePg && metrics.database && metrics.database.total_size_mb > 500) {
      alerts.push({
        type: 'high_storage_usage',
        value: metrics.database.total_size_mb,
        threshold: 500,
        message: 'Filesystem storage usage is high - cleanup recommended'
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
      if (this.usePg) {
        // Clean up expired tokens for PostgreSQL
        const { optimized } = require('../db/repo');
        await optimized.cleanupExpiredTokens();
      } else {
        // Clean up expired tokens for filesystem storage
        await this.cleanupExpiredTokensFS();
      }
      
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
   * Cleanup expired tokens for filesystem storage
   */
  async cleanupExpiredTokensFS() {
    try {
      const tokens = fsdb.read('refresh') || [];
      const now = new Date();
      const expiredCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days
      
      // Remove tokens that are revoked and older than 30 days
      const cleanTokens = tokens.filter(token => {
        if (!token.revokedAt) return true; // Keep active tokens
        return new Date(token.revokedAt) > expiredCutoff; // Keep recently revoked tokens
      });
      
      const removedCount = tokens.length - cleanTokens.length;
      if (removedCount > 0) {
        fsdb.write('refresh', cleanTokens);
        logger.info(`Cleaned up ${removedCount} expired refresh tokens`);
      }
    } catch (error) {
      logger.error('Failed to cleanup expired tokens from filesystem:', error);
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
        lastCheck: new Date().toISOString(),
        summary: {
          totalUsers: metrics.users.total_users || 0,
          activeUsers: metrics.users.active_users_7d || 0,
          activeTokens: metrics.tokens.active_tokens || 0,
          cacheHitRatio: metrics.performance.cacheHitRatio,
          storageType: this.usePg ? 'postgresql' : 'filesystem'
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
        lastCheck: new Date().toISOString(),
        lastKnownGood: this.lastMetrics?.timestamp || null,
        storageType: this.usePg ? 'postgresql' : 'filesystem'
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