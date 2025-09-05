// WebSocket Service Implementation
const { Server } = require('socket.io');
const { logger } = require('../utils/logger');

class WebSocketService {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map();
    this.userSessions = new Map();
    this.isInitialized = false;
  }

  initialize(httpServer) {
    if (this.isInitialized) {
      logger.warn('WebSocket service already initialized');
      return;
    }

    this.io = new Server(httpServer, {
      cors: {
        origin: (origin, callback) => {
          // Allow all origins in development, restrict in production
          callback(null, true);
        },
        credentials: true
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000
    });

    this.setupEventHandlers();
    this.isInitialized = true;

    logger.info('WebSocket service initialized successfully');
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      logger.info(`WebSocket client connected: ${socket.id}`);
      
      // Extract session ID from auth
      const sessionId = socket.handshake.auth?.sessionId;
      if (sessionId) {
        this.userSessions.set(socket.id, sessionId);
        this.connectedUsers.set(sessionId, socket);
        
        // Send initial connection status
        socket.emit('connection:status', { 
          connected: true, 
          sessionId,
          timestamp: new Date().toISOString()
        });

        logger.info(`User session ${sessionId} connected via WebSocket`);
      }

      // Handle sync requests
      socket.on('sync:request', (data) => {
        this.handleSyncRequest(socket, data);
      });

      // List update events removed

      // Handle Trakt refresh
      socket.on('trakt:refresh', (data) => {
        this.handleTraktRefresh(socket, data);
      });

      // Handle ping/pong for connection health
      socket.on('ping', () => {
        socket.emit('pong', { 
          timestamp: new Date().toISOString() 
        });
      });

      // Handle disconnect
      socket.on('disconnect', (reason) => {
        const sessionId = this.userSessions.get(socket.id);
        if (sessionId) {
          this.connectedUsers.delete(sessionId);
          this.userSessions.delete(socket.id);
          logger.info(`User session ${sessionId} disconnected: ${reason}`);
        }
        logger.info(`WebSocket client disconnected: ${socket.id}, reason: ${reason}`);
      });

      // Handle connection errors
      socket.on('error', (error) => {
        logger.error(`WebSocket error for ${socket.id}:`, error);
      });
    });
  }

  async handleSyncRequest(socket, data) {
    try {
      logger.info(`Sync request from ${socket.id}:`, data);
      
      // Simulate sync process - replace with actual implementation
      socket.emit('sync:response', {
        success: true,
        data: {
          lists: [],
          lastSync: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      });

      // Send initial sync data
      socket.emit('sync:initial', {
        connected: true,
        userCount: this.connectedUsers.size,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Sync request error:', error);
      socket.emit('sync:response', {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  // List update handling removed

  async handleTraktRefresh(socket, data) {
    try {
      logger.info(`Trakt refresh from ${socket.id}:`, data);
      
      // Simulate progress updates
      const progressSteps = [
        { progress: 25, status: 'Fetching lists...' },
        { progress: 50, status: 'Processing data...' },
        { progress: 75, status: 'Updating cache...' },
        { progress: 100, status: 'Complete!' }
      ];

      for (const step of progressSteps) {
        await new Promise(resolve => setTimeout(resolve, 500));
        socket.emit('trakt:refresh:progress', step);
      }

      socket.emit('trakt:refresh:complete', {
        success: true,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Trakt refresh error:', error);
      socket.emit('trakt:refresh:complete', {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Broadcast to all connected users
  broadcastToAll(event, data) {
    if (!this.io) return;
    
    this.io.emit(event, {
      ...data,
      timestamp: new Date().toISOString()
    });
    
    logger.info(`Broadcasted ${event} to all connected users`);
  }

  // Send to specific user session
  sendToUser(sessionId, event, data) {
    const socket = this.connectedUsers.get(sessionId);
    if (socket) {
      socket.emit(event, {
        ...data,
        timestamp: new Date().toISOString()
      });
      logger.info(`Sent ${event} to user ${sessionId}`);
    }
  }

  // Get connection stats
  getConnectedUsersCount() {
    return this.connectedUsers.size;
  }

  getConnectionStats() {
    return {
      connected: this.connectedUsers.size,
      sessions: Array.from(this.userSessions.values()),
      isInitialized: this.isInitialized
    };
  }

  // Health check
  isHealthy() {
    return this.isInitialized && this.io !== null;
  }

  // Cleanup
  shutdown() {
    if (this.io) {
      this.io.close();
      this.io = null;
    }
    this.connectedUsers.clear();
    this.userSessions.clear();
    this.isInitialized = false;
    
    logger.info('WebSocket service shut down');
  }
}

// Export singleton instance
const websocketService = new WebSocketService();
module.exports = websocketService;