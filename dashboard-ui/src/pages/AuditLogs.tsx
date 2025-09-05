import React, { useState, useEffect } from 'react';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';

interface AuditLog {
  id: string;
  event_type: string;
  severity: string;
  user_id: string | null;
  session_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  resource: string | null;
  action: string | null;
  details: any;
  timestamp: string;
}

interface AuditLogsData {
  logs: AuditLog[];
  total: number;
  limit: number;
  offset: number;
}

function SeverityBadge({ severity }: { severity: string }) {
  const variant = severity === 'critical' 
    ? 'destructive' 
    : severity === 'high'
    ? 'destructive'
    : severity === 'medium'
    ? 'secondary'
    : 'default';
  
  const emoji = severity === 'critical' || severity === 'high' ? '🚨' : 
                severity === 'medium' ? '⚠️' : 'ℹ️';
  
  return (
    <Badge variant={variant} className="text-xs">
      {emoji} {severity.toUpperCase()}
    </Badge>
  );
}

export default function AuditLogsPage() {
  const [auditData, setAuditData] = useState<AuditLogsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    eventType: '',
    severity: '',
    limit: 50,
    offset: 0
  });

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.eventType) params.append('eventType', filters.eventType);
      if (filters.severity) params.append('severity', filters.severity);
      params.append('limit', filters.limit.toString());
      params.append('offset', filters.offset.toString());

      const response = await fetch(`/api/audit/logs?${params}`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Access denied. Admin privileges required.');
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      setAuditData(data.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch audit logs');
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, [filters]);

  const handleFilterChange = (key: string, value: string | number) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      offset: key === 'limit' ? 0 : prev.offset // Reset offset when changing limit
    }));
  };

  const goToPage = (newOffset: number) => {
    setFilters(prev => ({ ...prev, offset: newOffset }));
  };

  if (loading) {
    return (
      <div className="max-w-[1160px] mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-20 pb-12">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-[1160px] mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-20 pb-12">
        <Card className="p-6">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2 text-red-400">Error Loading Audit Logs</h2>
            <p className="text-muted mb-4">{error}</p>
            <button 
              onClick={() => {
                setLoading(true);
                setError(null);
                fetchAuditLogs();
              }}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
            >
              Retry
            </button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-[1160px] mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-20 pb-12 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Audit Logs</h1>
          <p className="text-muted text-sm">System activity logs and security events</p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/dashboard"
            className="px-3 py-1.5 bg-surface-2 border border-white/10 rounded-lg hover:bg-surface-3 text-sm transition-colors"
          >
            ← Back to Dashboard
          </a>
          <button
            onClick={() => fetchAuditLogs()}
            className="px-3 py-1.5 bg-surface-2 border border-white/10 rounded-lg hover:bg-surface-3 text-sm transition-colors"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Event Type</label>
            <select
              value={filters.eventType}
              onChange={(e) => handleFilterChange('eventType', e.target.value)}
              className="w-full px-3 py-2 bg-surface-2 border border-white/10 rounded-lg text-sm"
            >
              <option value="">All Events</option>
              <option value="login_success">Login Success</option>
              <option value="login_failed">Login Failed</option>
              <option value="logout">Logout</option>
              <option value="api_access">API Access</option>
              <option value="unauthorized_access">Unauthorized Access</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Severity</label>
            <select
              value={filters.severity}
              onChange={(e) => handleFilterChange('severity', e.target.value)}
              className="w-full px-3 py-2 bg-surface-2 border border-white/10 rounded-lg text-sm"
            >
              <option value="">All Severities</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Items per page</label>
            <select
              value={filters.limit}
              onChange={(e) => handleFilterChange('limit', parseInt(e.target.value))}
              className="w-full px-3 py-2 bg-surface-2 border border-white/10 rounded-lg text-sm"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => setFilters({ eventType: '', severity: '', limit: 50, offset: 0 })}
              className="px-4 py-2 bg-surface-2 border border-white/10 rounded-lg hover:bg-surface-3 text-sm transition-colors"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </Card>

      {/* Results Summary */}
      {auditData && (
        <div className="flex justify-between items-center text-sm text-muted">
          <span>
            Showing {auditData.logs.length} of {auditData.total} logs
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => goToPage(Math.max(0, filters.offset - filters.limit))}
              disabled={filters.offset === 0}
              className="px-3 py-1 bg-surface-2 border border-white/10 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-3"
            >
              Previous
            </button>
            <button
              onClick={() => goToPage(filters.offset + filters.limit)}
              disabled={filters.offset + filters.limit >= (auditData.total || 0)}
              className="px-3 py-1 bg-surface-2 border border-white/10 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-3"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Audit Logs */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface-2">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Timestamp
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Event
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Severity
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  User
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  IP Address
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {auditData?.logs.map((log) => (
                <tr key={log.id} className="hover:bg-surface-1">
                  <td className="px-4 py-3 text-sm text-muted">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="font-medium">{log.event_type.replace(/_/g, ' ')}</div>
                    {log.action && (
                      <div className="text-xs text-muted">{log.action}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <SeverityBadge severity={log.severity} />
                  </td>
                  <td className="px-4 py-3 text-sm text-muted">
                    {log.user_id ? log.user_id.substring(0, 8) + '...' : 'System'}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted">
                    {log.ip_address || 'N/A'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {log.resource && (
                      <div className="font-medium text-xs">{log.resource}</div>
                    )}
                    {log.details && Object.keys(log.details).length > 0 && (
                      <details className="text-xs text-muted">
                        <summary className="cursor-pointer hover:text-white">
                          View Details
                        </summary>
                        <pre className="mt-1 p-2 bg-surface-2 rounded text-xs overflow-x-auto">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {auditData?.logs.length === 0 && (
          <div className="text-center py-8 text-muted">
            No audit logs found matching the current filters.
          </div>
        )}
      </Card>
    </div>
  );
}