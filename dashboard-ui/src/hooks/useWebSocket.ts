import { useEffect, useState, useCallback, useRef } from 'react';
import wsClient from '../services/websocket';

interface WebSocketStatus {
  connected: boolean;
  reconnecting: boolean;
  error?: string;
}

interface UseWebSocketOptions {
  autoConnect?: boolean;
  onConnect?: () => void;
  onDisconnect?: (reason?: string) => void;
  onError?: (error: string) => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const [status, setStatus] = useState<WebSocketStatus>({
    connected: wsClient.getConnectionStatus(),
    reconnecting: false
  });

  const callbacksRef = useRef(options);
  callbacksRef.current = options;

  useEffect(() => {
    const handleConnectionStatus = (data: { connected: boolean; reason?: string }) => {
      setStatus(prev => ({
        ...prev,
        connected: data.connected,
        reconnecting: false,
        error: undefined
      }));

      if (data.connected) {
        callbacksRef.current.onConnect?.();
      } else {
        callbacksRef.current.onDisconnect?.(data.reason);
        setStatus(prev => ({ ...prev, reconnecting: true }));
      }
    };

    const handleConnectionError = (data: { error: string }) => {
      setStatus(prev => ({
        ...prev,
        error: data.error,
        reconnecting: true
      }));
      
      callbacksRef.current.onError?.(data.error);
    };

    const handleConnectionFailed = () => {
      setStatus(prev => ({
        ...prev,
        reconnecting: false,
        error: 'Connection failed'
      }));
    };

    // Register event listeners
    wsClient.on('connection:status', handleConnectionStatus);
    wsClient.on('connection:error', handleConnectionError);
    wsClient.on('connection:failed', handleConnectionFailed);

    // Cleanup
    return () => {
      wsClient.off('connection:status', handleConnectionStatus);
      wsClient.off('connection:error', handleConnectionError);
      wsClient.off('connection:failed', handleConnectionFailed);
    };
  }, []);

  const requestSync = useCallback(() => {
    wsClient.requestSync();
  }, []);

  // List update method removed

  const refreshTrakt = useCallback(() => {
    wsClient.refreshTrakt();
  }, []);

  const ping = useCallback(() => {
    wsClient.ping();
  }, []);

  return {
    status,
    requestSync,
    refreshTrakt,
    ping
  };
}

export function useWebSocketEvent<T = any>(event: string, callback: (data: T) => void) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const handler = (data: T) => {
      callbackRef.current(data);
    };

    wsClient.on(event, handler);

    return () => {
      wsClient.off(event, handler);
    };
  }, [event]);
}

export function useSync() {
  const [syncData, setSyncData] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const { requestSync } = useWebSocket();

  useWebSocketEvent('sync:initial', (data) => {
    setSyncData(data);
    setSyncing(false);
  });

  useWebSocketEvent('sync:response', (data: { success: boolean; data?: any; error?: string }) => {
    setSyncing(false);
    
    if (data.success) {
      setSyncData(data.data);
      setSyncError(null);
    } else {
      setSyncError(data.error || 'Sync failed');
    }
  });

  const sync = useCallback(() => {
    setSyncing(true);
    setSyncError(null);
    requestSync();
  }, [requestSync]);

  return {
    syncData,
    syncing,
    syncError,
    sync
  };
}

export function useTraktSync() {
  const [progress, setProgress] = useState<{ progress: number; status: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { refreshTrakt } = useWebSocket();

  useWebSocketEvent('trakt:progress', (data: { progress: number; status: string }) => {
    setProgress(data);
  });

  useWebSocketEvent('trakt:complete', (data: { success: boolean; error?: string }) => {
    setSyncing(false);
    setProgress(null);
    
    if (!data.success) {
      setError(data.error || 'Trakt sync failed');
    } else {
      setError(null);
    }
  });

  const startSync = useCallback(() => {
    setSyncing(true);
    setProgress(null);
    setError(null);
    refreshTrakt();
  }, [refreshTrakt]);

  return {
    progress,
    syncing,
    error,
    startSync
  };
}

// List update hooks removed