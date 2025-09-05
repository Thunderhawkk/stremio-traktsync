import React, { useState, useEffect } from 'react';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';

interface SystemMetrics {
  cpu: number;
  memory: {
    total: number;
    used: number;
    free: number;
    usage: string;
  };
  disk: {
    usage: number;
  };
  loadAverage: number[];
  uptime: number;
}

interface ApplicationMetrics {
  pid: number;
  uptime: number;
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    arrayBuffers: number;
  };
  version: string;
  platform: string;
  nodeVersion: string;
}

interface ServiceStatus {
  database: {
    status: string;
    responseTime: number | null;
    lastCheck: string;
  };
  websocket: {
    status: string;
    connections: number;
    isInitialized: boolean;
    lastCheck: string;
  };
  cache: {
    status: string;
    keys: number;
    stats: {
      hits: number;
      misses: number;
    };
    lastCheck: string;
  };
}

interface PerformanceMetrics {
  averageResponseTime: string;
  errorRate: number;
  requestCount: number;
  errorCount: number;
  responseSamples: number;
}

interface HealthAlert {
  type: string;
  severity: 'critical' | 'warning';
  value: number;
  threshold?: number;
  service?: string;
  message: string;
  timestamp: string;
}

interface HealthMetrics {
  timestamp: string;
  system: SystemMetrics;
  application: ApplicationMetrics;
  services: ServiceStatus;
  performance: PerformanceMetrics;
  alerts: HealthAlert[];
}

function formatBytes(bytes: number): string {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 Bytes';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === 'up' || status === 'healthy' 
    ? 'default' 
    : status === 'down' 
    ? 'destructive' 
    : 'secondary';
  
  return (
    <Badge variant={variant} className="text-xs">
      {status === 'up' ? '🟢' : status === 'down' ? '🔴' : '🟡'} {status.toUpperCase()}
    </Badge>
  );
}

function AlertBadge({ severity }: { severity: 'critical' | 'warning' }) {
  return (
    <Badge variant={severity === 'critical' ? 'destructive' : 'secondary'} className="text-xs">
      {severity === 'critical' ? '🚨' : '⚠️'} {severity.toUpperCase()}
    </Badge>
  );
}

export default function HealthMonitoringPage() {
  const [metrics, setMetrics] = useState<HealthMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchMetrics = async () => {
    try {
      const response = await fetch('/api/health/metrics/live', {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      setMetrics(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch health metrics');
      console.error('Failed to fetch health metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    
    if (autoRefresh) {
      const interval = setInterval(fetchMetrics, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

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
            <h2 className="text-xl font-semibold mb-2 text-red-400">Error Loading Health Metrics</h2>
            <p className="text-muted mb-4">{error}</p>
            <button 
              onClick={() => {
                setLoading(true);
                setError(null);
                fetchMetrics();
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
          <h1 className="text-2xl font-bold">Health Monitoring</h1>
          <p className="text-muted text-sm">System metrics, service status, and performance indicators</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-refresh (30s)
          </label>
          <button
            onClick={() => {
              setLoading(true);
              fetchMetrics();
            }}
            className="px-3 py-1.5 bg-surface-2 border border-white/10 rounded-lg hover:bg-surface-3 text-sm transition-colors"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Health Alerts */}
      {metrics?.alerts && metrics.alerts.length > 0 && (
        <Card className="p-4 border-orange-500/20 bg-orange-500/5">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            ⚠️ Active Alerts ({metrics.alerts.length})
          </h3>
          <div className="space-y-2">
            {metrics.alerts.map((alert, index) => (
              <div key={index} className="flex items-start justify-between gap-3 p-3 bg-surface-1 rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertBadge severity={alert.severity} />
                    <span className="font-medium text-sm">{alert.type.replace(/_/g, ' ')}</span>
                  </div>
                  <p className="text-sm text-muted">{alert.message}</p>
                </div>
                <span className="text-xs text-muted flex-shrink-0">
                  {new Date(alert.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* System Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">System Resources</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-medium">CPU Usage</span>
                <span className="text-sm text-muted">{metrics?.system.cpu}%</span>
              </div>
              <div className="w-full bg-surface-2 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full transition-all duration-300 ${
                    (metrics?.system.cpu || 0) > 80 ? 'bg-red-500' : 
                    (metrics?.system.cpu || 0) > 60 ? 'bg-yellow-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${metrics?.system.cpu || 0}%` }}
                ></div>
              </div>
            </div>
            
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-medium">Memory Usage</span>
                <span className="text-sm text-muted">
                  {formatBytes(metrics?.system.memory.used || 0)} / {formatBytes(metrics?.system.memory.total || 0)}
                </span>
              </div>
              <div className="w-full bg-surface-2 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full transition-all duration-300 ${
                    parseFloat(metrics?.system.memory.usage || '0') > 85 ? 'bg-red-500' : 
                    parseFloat(metrics?.system.memory.usage || '0') > 70 ? 'bg-yellow-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${metrics?.system.memory.usage || 0}%` }}
                ></div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div>
                <span className="text-xs text-muted block">System Uptime</span>
                <span className="text-sm font-medium">{formatUptime(metrics?.system.uptime || 0)}</span>
              </div>
              <div>
                <span className="text-xs text-muted block">Load Average</span>
                <span className="text-sm font-medium">
                  {metrics?.system.loadAverage?.[0]?.toFixed(2) || '0.00'}
                </span>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Application Stats</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-muted block">Process ID</span>
                <span className="text-sm font-medium">{metrics?.application.pid}</span>
              </div>
              <div>
                <span className="text-xs text-muted block">App Uptime</span>
                <span className="text-sm font-medium">{formatUptime(metrics?.application.uptime || 0)}</span>
              </div>
            </div>

            <div>
              <span className="text-xs text-muted block mb-1">Heap Memory</span>
              <div className="flex justify-between text-sm">
                <span>Used: {formatBytes(metrics?.application.memory.heapUsed || 0)}</span>
                <span>Total: {formatBytes(metrics?.application.memory.heapTotal || 0)}</span>
              </div>
              <div className="w-full bg-surface-2 rounded-full h-2 mt-1">
                <div 
                  className="h-2 rounded-full bg-blue-500 transition-all duration-300"
                  style={{ 
                    width: `${((metrics?.application.memory.heapUsed || 0) / (metrics?.application.memory.heapTotal || 1)) * 100}%` 
                  }}
                ></div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div>
                <span className="text-xs text-muted block">Platform</span>
                <span className="text-sm font-medium">{metrics?.application.platform}</span>
              </div>
              <div>
                <span className="text-xs text-muted block">Node Version</span>
                <span className="text-sm font-medium">{metrics?.application.nodeVersion}</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Service Status */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Service Status</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {metrics?.services && Object.entries(metrics.services).map(([serviceName, service]) => (
            <div key={serviceName} className="p-4 bg-surface-1 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sm capitalize">{serviceName}</span>
                <StatusBadge status={service.status} />
              </div>
              <div className="space-y-1 text-xs text-muted">
                {serviceName === 'websocket' && 'connections' in service && (
                  <div>Connections: {service.connections}</div>
                )}
                {serviceName === 'cache' && 'keys' in service && (
                  <div>Keys: {service.keys}</div>
                )}
                <div>Last check: {new Date(service.lastCheck).toLocaleTimeString()}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Performance Metrics */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Performance Metrics</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-surface-1 rounded-lg">
            <div className="text-2xl font-bold text-green-400">
              {metrics?.performance.averageResponseTime}ms
            </div>
            <div className="text-xs text-muted mt-1">Avg Response Time</div>
          </div>
          <div className="text-center p-4 bg-surface-1 rounded-lg">
            <div className={`text-2xl font-bold ${
              (metrics?.performance.errorRate || 0) > 5 ? 'text-red-400' : 
              (metrics?.performance.errorRate || 0) > 2 ? 'text-yellow-400' : 'text-green-400'
            }`}>
              {metrics?.performance.errorRate}%
            </div>
            <div className="text-xs text-muted mt-1">Error Rate</div>
          </div>
          <div className="text-center p-4 bg-surface-1 rounded-lg">
            <div className="text-2xl font-bold text-blue-400">
              {metrics?.performance.requestCount}
            </div>
            <div className="text-xs text-muted mt-1">Total Requests</div>
          </div>
          <div className="text-center p-4 bg-surface-1 rounded-lg">
            <div className="text-2xl font-bold text-purple-400">
              {metrics?.performance.responseSamples}
            </div>
            <div className="text-xs text-muted mt-1">Response Samples</div>
          </div>
        </div>
      </Card>

      {/* Footer Info */}
      <div className="text-center text-xs text-muted">
        Last updated: {metrics?.timestamp ? new Date(metrics.timestamp).toLocaleString() : 'Never'}
      </div>
    </div>
  );
}