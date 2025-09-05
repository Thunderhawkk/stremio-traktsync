// src/routes/audit.js
// API routes for accessing audit logs and statistics

const express = require('express');
const { auditService, AUDIT_EVENTS, SEVERITY } = require('../services/auditService');
const { auditUserActions } = require('../middleware/auditLogger');
const { logger } = require('../utils/logger');

const router = express.Router();
const userAudit = auditUserActions();

// Middleware to require admin role for audit access
// Note: Admin check is now handled at the app level middleware

// Get audit logs with filtering and pagination
router.get('/logs', async (req, res) => {
  try {
    const {
      userId,
      eventType,
      severity,
      startDate,
      endDate,
      limit = 50,
      offset = 0,
      orderBy = 'timestamp',
      orderDirection = 'DESC',
      search
    } = req.query;

    // Validate parameters
    const validOrderBy = ['timestamp', 'event_type', 'severity', 'user_id'];
    const validOrderDirection = ['ASC', 'DESC'];
    const validSeverity = Object.values(SEVERITY);
    const validEventTypes = Object.values(AUDIT_EVENTS);

    if (orderBy && !validOrderBy.includes(orderBy)) {
      return res.status(400).json({ error: 'invalid_order_by' });
    }

    if (orderDirection && !validOrderDirection.includes(orderDirection.toUpperCase())) {
      return res.status(400).json({ error: 'invalid_order_direction' });
    }

    if (severity && !validSeverity.includes(severity)) {
      return res.status(400).json({ error: 'invalid_severity' });
    }

    if (eventType && !validEventTypes.includes(eventType)) {
      return res.status(400).json({ error: 'invalid_event_type' });
    }

    const filters = {
      userId,
      eventType,
      severity,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      limit: Math.min(parseInt(limit) || 50, 1000), // Cap at 1000
      offset: parseInt(offset) || 0,
      orderBy: orderBy || 'timestamp',
      orderDirection: orderDirection?.toUpperCase() || 'DESC'
    };

    const result = await auditService.getLogs(filters);

    // Log the audit log access
    await userAudit.logUserAction(
      req.user.id,
      req.sessionID,
      'view_audit_logs',
      'audit_logs',
      { filters },
      req
    );

    res.json({
      success: true,
      data: result,
      filters
    });
  } catch (error) {
    logger.error('Failed to retrieve audit logs:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to retrieve audit logs'
    });
  }
});

// Get audit log statistics
router.get('/statistics', async (req, res) => {
  try {
    const { timeRange = '24h' } = req.query;
    
    const validTimeRanges = ['1h', '24h', '7d', '30d'];
    if (!validTimeRanges.includes(timeRange)) {
      return res.status(400).json({ error: 'invalid_time_range' });
    }

    const stats = await auditService.getLogStatistics(timeRange);

    // Log the statistics access
    await userAudit.logUserAction(
      req.user.id,
      req.sessionID,
      'view_audit_statistics',
      'audit_statistics',
      { timeRange },
      req
    );

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Failed to retrieve audit statistics:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to retrieve audit statistics'
    });
  }
});

// Get available event types and severities
router.get('/metadata', async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        eventTypes: Object.values(AUDIT_EVENTS),
        severities: Object.values(SEVERITY),
        orderByOptions: ['timestamp', 'event_type', 'severity', 'user_id'],
        timeRangeOptions: ['1h', '24h', '7d', '30d']
      }
    });
  } catch (error) {
    logger.error('Failed to retrieve audit metadata:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to retrieve audit metadata'
    });
  }
});

// Get audit logs for a specific user
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, offset = 0, eventType, severity } = req.query;

    const filters = {
      userId,
      eventType,
      severity,
      limit: Math.min(parseInt(limit) || 50, 500),
      offset: parseInt(offset) || 0,
      orderBy: 'timestamp',
      orderDirection: 'DESC'
    };

    const result = await auditService.getLogs(filters);

    // Log the user audit access
    await userAudit.logUserAction(
      req.user.id,
      req.sessionID,
      'view_user_audit_logs',
      `user_audit_logs:${userId}`,
      { targetUserId: userId, filters },
      req
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Failed to retrieve user audit logs:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to retrieve user audit logs'
    });
  }
});

// Get security events (high severity events)
router.get('/security', async (req, res) => {
  try {
    const { limit = 100, offset = 0, startDate, endDate } = req.query;

    const filters = {
      severity: SEVERITY.HIGH,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      limit: Math.min(parseInt(limit) || 100, 500),
      offset: parseInt(offset) || 0,
      orderBy: 'timestamp',
      orderDirection: 'DESC'
    };

    const result = await auditService.getLogs(filters);

    // Also get critical events
    const criticalFilters = { ...filters, severity: SEVERITY.CRITICAL };
    const criticalResult = await auditService.getLogs(criticalFilters);

    // Log the security audit access
    await userAudit.logUserAction(
      req.user.id,
      req.sessionID,
      'view_security_audit_logs',
      'security_audit_logs',
      { filters },
      req
    );

    res.json({
      success: true,
      data: {
        highSeverity: result,
        critical: criticalResult
      }
    });
  } catch (error) {
    logger.error('Failed to retrieve security audit logs:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to retrieve security audit logs'
    });
  }
});

// Export audit logs (admin only)
router.get('/export', async (req, res) => {
  try {
    const { format = 'json', startDate, endDate, eventType, severity } = req.query;

    if (!['json', 'csv'].includes(format)) {
      return res.status(400).json({ error: 'invalid_format' });
    }

    const filters = {
      eventType,
      severity,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      limit: 10000, // Large limit for export
      offset: 0,
      orderBy: 'timestamp',
      orderDirection: 'DESC'
    };

    const result = await auditService.getLogs(filters);

    // Log the export action
    await userAudit.logUserAction(
      req.user.id,
      req.sessionID,
      'export_audit_logs',
      'audit_logs',
      { format, filters, recordCount: result.logs.length },
      req
    );

    if (format === 'csv') {
      const csv = convertToCSV(result.logs);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csv);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${new Date().toISOString().split('T')[0]}.json"`);
      res.json(result);
    }
  } catch (error) {
    logger.error('Failed to export audit logs:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to export audit logs'
    });
  }
});

// Clean up old audit logs (admin only)
router.delete('/cleanup', async (req, res) => {
  try {
    const { retentionDays = 90 } = req.body;

    if (retentionDays < 1 || retentionDays > 365) {
      return res.status(400).json({ error: 'invalid_retention_days' });
    }

    const deletedCount = await auditService.cleanupOldLogs(retentionDays);

    // Log the cleanup action
    await userAudit.logUserAction(
      req.user.id,
      req.sessionID,
      'cleanup_audit_logs',
      'audit_logs',
      { retentionDays, deletedCount },
      req
    );

    res.json({
      success: true,
      data: {
        deletedCount,
        retentionDays
      }
    });
  } catch (error) {
    logger.error('Failed to cleanup audit logs:', error);
    res.status(500).json({
      error: 'server_error',
      message: 'Failed to cleanup audit logs'
    });
  }
});

// Helper function to convert logs to CSV
function convertToCSV(logs) {
  if (logs.length === 0) return '';

  const headers = ['timestamp', 'event_type', 'severity', 'user_id', 'session_id', 'ip_address', 'resource', 'action', 'details'];
  const csvRows = [headers.join(',')];

  logs.forEach(log => {
    const row = headers.map(header => {
      let value = log[header];
      if (header === 'details' && typeof value === 'object') {
        value = JSON.stringify(value);
      }
      // Escape commas and quotes in CSV
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        value = `"${value.replace(/"/g, '""')}"`;
      }
      return value || '';
    });
    csvRows.push(row.join(','));
  });

  return csvRows.join('\n');
}

module.exports = router;