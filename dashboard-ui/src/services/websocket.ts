import { io, Socket } from 'socket.io-client';

interface WebSocketResponse {
  success: boolean;
  data?: any;
  error?: string;
  timestamp: string;
}

interface ProgressUpdate {
  progress: number;
  status: string;
}

class WebSocketClient {
  private socket: Socket | null = null;
  private isConnected = false;
  private listeners = new Map<string, Set<Function>>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private autoConnect = false; // Disabled by default

  constructor() {
    // Enable auto-connect for better user experience
    this.autoConnect = true;
    this.connect();
  }

  private connect(): void {
    if (this.socket) {
      this.socket.disconnect();
    }

    // Get session ID from cookie or sessionStorage
    const sessionId = this.getSessionId();
    
    this.socket = io('/', {
      auth: {
        sessionId
      },
      transports: ['websocket', 'polling'],
      timeout: 20000,
      forceNew: true
    });

    this.setupEventListeners();
  }

  private getSessionId(): string | null {
    // Try to get session ID from cookies
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'sid' || name === 'session') {
        return value;
      }
    }
    
    // Fallback to sessionStorage
    return sessionStorage.getItem('sessionId');
  }

  private setupEventListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.emit('connection:status', { connected: true });
    });

    this.socket.on('disconnect', (reason: string) => {
      console.log('WebSocket disconnected:', reason);
      this.isConnected = false;
      this.emit('connection:status', { connected: false, reason });
      
      if (reason === 'io server disconnect') {
        // Server disconnected, don't reconnect automatically
        return;
      }
      
      this.handleReconnect();
    });

    this.socket.on('connect_error', (error: Error) => {
      console.error('WebSocket connection error:', error);
      this.emit('connection:error', { error: error.message });
      this.handleReconnect();
    });

    // Handle sync events
    this.socket.on('initial:sync', (data: any) => {
      this.emit('sync:initial', data);
    });

    this.socket.on('sync:response', (data: WebSocketResponse) => {
      this.emit('sync:response', data);
    });

    // Handle list events
    this.socket.on('list:updated', (data: any) => {
      this.emit('list:updated', data);
    });

    this.socket.on('list:update:error', (data: any) => {
      this.emit('list:error', data);
    });

    // Handle Trakt events
    this.socket.on('trakt:refresh:progress', (data: ProgressUpdate) => {
      this.emit('trakt:progress', data);
    });

    this.socket.on('trakt:refresh:complete', (data: WebSocketResponse) => {
      this.emit('trakt:complete', data);
    });

    // Handle ping/pong
    this.socket.on('pong', () => {
      this.emit('ping:response');
    });
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      this.emit('connection:failed');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    
    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }

  // Public API methods
  public enableConnection(): void {
    if (!this.autoConnect) {
      this.autoConnect = true;
      this.connect();
    }
  }

  public requestSync(): void {
    if (!this.isConnected || !this.socket) {
      console.warn('WebSocket not connected, cannot request sync');
      return;
    }

    this.socket.emit('sync:request', {
      timestamp: new Date().toISOString()
    });
  }

  public updateList(listId: string, changes: any): void {
    if (!this.isConnected || !this.socket) {
      console.warn('WebSocket not connected, cannot update list');
      return;
    }

    this.socket.emit('list:update', {
      listId,
      changes,
      timestamp: new Date().toISOString()
    });
  }

  public refreshTrakt(): void {
    if (!this.isConnected || !this.socket) {
      console.warn('WebSocket not connected, cannot refresh Trakt');
      return;
    }

    this.socket.emit('trakt:refresh', {
      timestamp: new Date().toISOString()
    });
  }

  public ping(): void {
    if (!this.isConnected || !this.socket) {
      console.warn('WebSocket not connected, cannot ping');
      return;
    }

    this.socket.emit('ping');
  }

  // Event system
  public on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  public off(event: string, callback?: Function): void {
    if (!this.listeners.has(event)) return;
    
    if (callback) {
      this.listeners.get(event)!.delete(callback);
    } else {
      this.listeners.get(event)!.clear();
    }
  }

  private emit(event: string, data?: any): void {
    if (!this.listeners.has(event)) return;
    
    this.listeners.get(event)!.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('Error in WebSocket event callback:', error);
      }
    });
  }

  // Status getters
  public getConnectionStatus(): boolean {
    return false; // Always return false to prevent connection status display
  }

  public getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  // Cleanup
  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
    this.listeners.clear();
  }
}

// Export singleton instance
export const wsClient = new WebSocketClient();
export default wsClient;