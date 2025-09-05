// src/services/auditService.js
// Comprehensive audit logging service for tracking user actions and security events

const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const { getPg } = require('../db/pg');
const fsdb = require('../db/fs');
const cfg = require('../config');

// Audit event types
const AUDIT_EVENTS = {
  // Authentication events
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAILED: 'login_failed',
  LOGOUT: 'logout',
  PASSWORD_CHANGE: 'password_change',
  PASSWORD_RESET: 'password_reset',
  TOKEN_REFRESH: 'token_refresh',
  
  // User management
  USER_CREATED: 'user_created',
  USER_UPDATED: 'user_updated',
  USER_DELETED: 'user_deleted',
  ROLE_CHANGED: 'role_changed',
  
  // Session management
  SESSION_CREATED: 'session_created',
  SESSION_UPDATED: 'session_updated',
  SESSION_TERMINATED: 'session_terminated',
  SESSION_EXPIRED: 'session_expired',
  SUSPICIOUS_ACTIVITY: 'suspicious_activity',
  
  // Content interactions
  LIST_CREATED: 'list_created',
  LIST_UPDATED: 'list_updated',
  LIST_DELETED: 'list_deleted',
  CONTENT_WATCHED: 'content_watched',
  CONTENT_RATED: 'content_rated',
  
  // API interactions
  API_ACCESS: 'api_access',
  API_ERROR: 'api_error',
  RATE_LIMIT_HIT: 'rate_limit_hit',
  
  // Security events
  UNAUTHORIZED_ACCESS: 'unauthorized_access',
  INVALID_TOKEN: 'invalid_token',
  BRUTE_FORCE_ATTEMPT: 'brute_force_attempt',
  ACCOUNT_LOCKED: 'account_locked',
  
  // System events
  CONFIG_CHANGED: 'config_changed',
  MAINTENANCE_MODE: 'maintenance_mode',
  SYSTEM_ERROR: 'system_error'
};

// Severity levels
const SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

class AuditService {
  constructor() {
    this.usePg = !!(cfg.db && cfg.db.url);
    this.auditBuffer = [];
    this.bufferSize = 100;
    this.flushInterval = 5000; // 5 seconds
    
    if (this.usePg) {
      this.initDatabase();
      this.startPeriodicFlush();
    } else {
      // For filesystem storage, log immediately without buffering
      logger.info('audit_service_initialized_filesystem_mode');
    }
  }

  async initDatabase() {
    if (!this.usePg) return;
    
    try {
      const pg = await getPg();
      
      // Create audit_logs table
      await pg.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          event_type VARCHAR(50) NOT NULL,
          severity VARCHAR(20) NOT NULL DEFAULT 'medium',
          user_id UUID,
          session_id TEXT,
          ip_address INET,
          user_agent TEXT,
          resource VARCHAR(255),
          action VARCHAR(50),
          details JSONB,
          metadata JSONB,
          timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      // Create indexes for efficient querying
      await pg.query(`
        CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON audit_logs(severity, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_ip_address ON audit_logs(ip_address, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_session_id ON audit_logs(session_id);
      `);

      // Create audit_search_log for search queries
      await pg.query(`
        CREATE TABLE IF NOT EXISTS audit_search_log (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID,
          search_term TEXT,
          search_filters JSONB,
          results_count INTEGER,
          execution_time_ms INTEGER,
          ip_address INET,
          timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      // Create audit_performance_log for performance monitoring
      await pg.query(`
        CREATE TABLE IF NOT EXISTS audit_performance_log (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          endpoint VARCHAR(255) NOT NULL,
          method VARCHAR(10) NOT NULL,
          response_time_ms INTEGER NOT NULL,
          status_code INTEGER NOT NULL,
          user_id UUID,
          ip_address INET,
          error_details TEXT,
          timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      logger.info('audit_database_tables_initialized_successfully');
    } catch (error) {
      logger.error('Failed to initialize audit database:', error);
    }
  }

  startPeriodicFlush() {
    if (!this.usePg) return;
    
    setInterval(() => {
      this.flushBuffer();
    }, this.flushInterval);
  }

  async flushBuffer() {
    if (this.auditBuffer.length === 0) return;

    const logsToFlush = [...this.auditBuffer];
    this.auditBuffer = [];

    try {
      if (this.usePg) {
        await this.bulkInsertLogs(logsToFlush);
      } else {
        // Fallback to file system logging
        logsToFlush.forEach(log => {
          logger.info({ audit: true, ...log }, 'audit_event');
        });
      }
    } catch (error) {
      logger.error('Failed to flush audit buffer:', error);
      // Re-add logs to buffer for retry
      this.auditBuffer.unshift(...logsToFlush);
    }
  }

  async bulkInsertLogs(logs) {
    if (!this.usePg || logs.length === 0) return;

    try {
      const pg = await getPg();
      const values = logs.map((log, index) => {
        const baseIndex = index * 10;
        return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8}, $${baseIndex + 9}, $${baseIndex + 10})`;
      }).join(', ');

      const params = logs.flatMap(log => [
        log.id,
        log.event_type,
        log.severity,
        log.user_id || null,
        log.session_id || null,
        log.ip_address || null,
        log.user_agent || null,
        log.resource || null,
        log.action || null,
        JSON.stringify(log.details || {})
      ]);

      await pg.query(`
        INSERT INTO audit_logs (id, event_type, severity, user_id, session_id, ip_address, user_agent, resource, action, details)
        VALUES ${values}
      `, params);

      logger.debug(`Flushed ${logs.length} audit logs to database`);
    } catch (error) {
      logger.error('Failed to bulk insert audit logs:', error);
      throw error;
    }
  }

  async log(eventData) {
    const auditLog = {
      id: uuidv4(),
      event_type: eventData.eventType,
      severity: eventData.severity || SEVERITY.MEDIUM,
      user_id: eventData.userId || null,
      session_id: eventData.sessionId || null,
      ip_address: eventData.ipAddress || null,
      user_agent: eventData.userAgent || null,
      resource: eventData.resource || null,
      action: eventData.action || null,
      details: eventData.details || {},
      metadata: {
        timestamp: new Date().toISOString(),
        source: eventData.source || 'system',
        version: process.env.npm_package_version || '1.0.0'
      },
      timestamp: new Date().toISOString()
    };

    if (this.usePg) {
      // Add to buffer for PostgreSQL
      this.auditBuffer.push(auditLog);

      // Immediate flush for critical events
      if (auditLog.severity === SEVERITY.CRITICAL) {
        await this.flushBuffer();
      }

      // Flush if buffer is full
      if (this.auditBuffer.length >= this.bufferSize) {
        await this.flushBuffer();
      }
    } else {
      // For filesystem storage, write to audit log file immediately
      try {
        const auditLogs = fsdb.read('audit_logs') || [];
        auditLogs.push(auditLog);
        
        // Keep only last 1000 logs to prevent file from growing too large
        if (auditLogs.length > 1000) {
          auditLogs.splice(0, auditLogs.length - 1000);
        }
        
        fsdb.write('audit_logs', auditLogs);
        logger.debug(`Wrote audit log to filesystem: ${auditLog.event_type}`);
      } catch (error) {
        logger.error('Failed to write audit log to filesystem:', error);
      }
    }

    // Also log to application logger
    logger.info({
      audit: true,
      event: auditLog.event_type,
      severity: auditLog.severity,
      userId: auditLog.user_id,
      resource: auditLog.resource
    }, `audit_${auditLog.event_type}`);

    return auditLog.id;
  }

  // Convenience methods for common audit events
  async logLogin(userId, sessionId, ipAddress, userAgent, success = true) {
    return this.log({
      eventType: success ? AUDIT_EVENTS.LOGIN_SUCCESS : AUDIT_EVENTS.LOGIN_FAILED,
      severity: success ? SEVERITY.LOW : SEVERITY.MEDIUM,
      userId: success ? userId : null,
      sessionId,
      ipAddress,
      userAgent,
      action: 'login',
      details: { success }
    });
  }

  async logLogout(userId, sessionId, ipAddress) {
    return this.log({
      eventType: AUDIT_EVENTS.LOGOUT,
      severity: SEVERITY.LOW,
      userId,
      sessionId,
      ipAddress,
      action: 'logout'
    });
  }

  async logApiAccess(userId, endpoint, method, statusCode, responseTime, ipAddress, userAgent) {
    return this.log({
      eventType: AUDIT_EVENTS.API_ACCESS,
      severity: statusCode >= 400 ? SEVERITY.MEDIUM : SEVERITY.LOW,
      userId,
      ipAddress,
      userAgent,
      resource: endpoint,
      action: method.toLowerCase(),
      details: {
        statusCode,
        responseTime,
        endpoint,
        method
      }
    });
  }

  async logSecurityEvent(eventType, userId, sessionId, ipAddress, userAgent, details = {}) {
    return this.log({
      eventType,
      severity: SEVERITY.HIGH,
      userId,
      sessionId,
      ipAddress,
      userAgent,
      action: 'security_event',
      details
    });
  }

  async logUserAction(userId, sessionId, action, resource, details = {}, ipAddress = null) {
    return this.log({
      eventType: this.getEventTypeForAction(action),
      severity: SEVERITY.LOW,
      userId,
      sessionId,
      ipAddress,
      resource,
      action,
      details
    });
  }

  getEventTypeForAction(action) {
    const actionMap = {
      'create_list': AUDIT_EVENTS.LIST_CREATED,
      'update_list': AUDIT_EVENTS.LIST_UPDATED,
      'delete_list': AUDIT_EVENTS.LIST_DELETED,
      'watch_content': AUDIT_EVENTS.CONTENT_WATCHED,
      'rate_content': AUDIT_EVENTS.CONTENT_RATED
    };
    return actionMap[action] || AUDIT_EVENTS.API_ACCESS;
  }

  // Query methods for retrieving audit logs
  async getLogs(filters = {}) {
    if (this.usePg) {
      try {
        const pg = await getPg();
        const {
          userId,
          eventType,
          severity,
          startDate,
          endDate,
          limit = 100,
          offset = 0,
          orderBy = 'timestamp',
          orderDirection = 'DESC'
        } = filters;

        let whereClause = 'WHERE 1=1';
        const params = [];
        let paramIndex = 1;

        if (userId) {
          whereClause += ` AND user_id = $${paramIndex++}`;
          params.push(userId);
        }

        if (eventType) {
          whereClause += ` AND event_type = $${paramIndex++}`;
          params.push(eventType);
        }

        if (severity) {
          whereClause += ` AND severity = $${paramIndex++}`;
          params.push(severity);
        }

        if (startDate) {
          whereClause += ` AND timestamp >= $${paramIndex++}`;
          params.push(startDate);
        }

        if (endDate) {
          whereClause += ` AND timestamp <= $${paramIndex++}`;
          params.push(endDate);
        }

        const orderClause = `ORDER BY ${orderBy} ${orderDirection}`;
        const limitClause = `LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        params.push(limit, offset);

        const query = `
          SELECT id, event_type, severity, user_id, session_id, ip_address, 
                 user_agent, resource, action, details, timestamp
          FROM audit_logs 
          ${whereClause} 
          ${orderClause} 
          ${limitClause}
        `;
        
        const countQuery = `SELECT COUNT(*) as total FROM audit_logs ${whereClause}`;
        
        const [dataResult, countResult] = await Promise.all([
          pg.query(query, params),
          pg.query(countQuery, params.slice(0, -2)) // Remove limit and offset for count
        ]);
        
        return {
          logs: dataResult.rows,
          total: parseInt(countResult.rows[0].total)
        };
      } catch (error) {
        logger.error('Failed to query audit logs from database:', error);
        return { logs: [], total: 0 };
      }
    } else {
      // Filesystem storage
      try {
        const auditLogs = fsdb.read('audit_logs') || [];
        let filteredLogs = [...auditLogs];
        
        // Apply filters
        if (filters.userId) {
          filteredLogs = filteredLogs.filter(log => log.user_id === filters.userId);
        }
        
        if (filters.eventType) {
          filteredLogs = filteredLogs.filter(log => log.event_type === filters.eventType);
        }
        
        if (filters.severity) {
          filteredLogs = filteredLogs.filter(log => log.severity === filters.severity);
        }
        
        if (filters.startDate) {
          filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) >= new Date(filters.startDate));
        }
        
        if (filters.endDate) {
          filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) <= new Date(filters.endDate));
        }
        
        // Sort logs
        filteredLogs.sort((a, b) => {
          const aVal = a[filters.orderBy || 'timestamp'];
          const bVal = b[filters.orderBy || 'timestamp'];
          if (filters.orderDirection === 'ASC') {
            return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
          } else {
            return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
          }
        });
        
        // Apply pagination
        const offset = filters.offset || 0;
        const limit = filters.limit || 100;
        const paginatedLogs = filteredLogs.slice(offset, offset + limit);
        
        return {
          logs: paginatedLogs,
          total: filteredLogs.length
        };
      } catch (error) {
        logger.error('Failed to read audit logs from filesystem:', error);
        return { logs: [], total: 0 };
      }
    }
  }

  async getLogStatistics(timeRange = '24h') {
    if (!this.usePg) {
      return {};
    }

    try {
      const pg = await getPg();
      const timeClause = this.getTimeRangeClause(timeRange);

      const [eventTypeStats, severityStats, userStats] = await Promise.all([
        pg.query(`
          SELECT event_type, COUNT(*) as count 
          FROM audit_logs 
          WHERE ${timeClause} 
          GROUP BY event_type 
          ORDER BY count DESC 
          LIMIT 10
        `),
        pg.query(`
          SELECT severity, COUNT(*) as count 
          FROM audit_logs 
          WHERE ${timeClause} 
          GROUP BY severity
        `),
        pg.query(`
          SELECT user_id, COUNT(*) as count 
          FROM audit_logs 
          WHERE ${timeClause} AND user_id IS NOT NULL 
          GROUP BY user_id 
          ORDER BY count DESC 
          LIMIT 10
        `)
      ]);

      return {
        eventTypes: eventTypeStats.rows,
        severityDistribution: severityStats.rows,
        topUsers: userStats.rows,
        timeRange
      };
    } catch (error) {
      logger.error('Failed to get audit statistics:', error);
      throw error;
    }
  }

  getTimeRangeClause(timeRange) {
    const intervals = {
      '1h': '1 hour',
      '24h': '24 hours',
      '7d': '7 days',
      '30d': '30 days'
    };
    
    const interval = intervals[timeRange] || '24 hours';
    return `timestamp >= NOW() - INTERVAL '${interval}'`;
  }

  // Clean up old audit logs
  async cleanupOldLogs(retentionDays = 90) {
    if (!this.usePg) return;

    try {
      const pg = await getPg();
      const result = await pg.query(`
        DELETE FROM audit_logs 
        WHERE timestamp < NOW() - INTERVAL '${retentionDays} days'
      `);

      logger.info(`Cleaned up ${result.rowCount} old audit logs older than ${retentionDays} days`);
      return result.rowCount;
    } catch (error) {
      logger.error('Failed to cleanup old audit logs:', error);
      throw error;
    }
  }
}

// Create singleton instance
const auditService = new AuditService();

module.exports = {
  auditService,
  AUDIT_EVENTS,
  SEVERITY
};