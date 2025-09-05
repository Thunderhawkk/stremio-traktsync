// src/index.js
require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const path = require('path');
const { createServer } = require('http');
const websocketService = require('./services/websocketService');
const passport = require('./config/oauth2');
const scheduler = require('./jobs/scheduler');
const databaseMonitor = require('./services/databaseMonitor');
const healthMonitor = require('./services/healthMonitor');
const { performanceAlerts } = require('./services/performanceAlerts');
const { trackHealth } = require('./middleware/healthTracking');

const { logger } = require('./utils/logger');
const { initDb } = require('./db/repo');

const pages         = require('./routes/pages');
const authRoutes    = require('./routes/auth');
const oauth2Routes  = require('./routes/oauth2');
const configRoutes  = require('./routes/config');
const traktRoutes   = require('./routes/trakt');
const addonRoutes   = require('./routes/addon');
const debugRoutes   = require('./routes/debug');
const healthRoutes  = require('./routes/health');
const sessionRoutes = require('./routes/session');
const auditRoutes   = require('./routes/audit');
const performanceAlertsRoutes = require('./routes/performanceAlerts');

const { attachSessionUser, absoluteSessionTimeout, enhancedSessionTracking } = require('./middleware/session_timebox');
const { limiterApp, limiterAuthStrict, limiterAPI, limiterDashboard, limiterHeavyOps, limiterSession, limiterHealth, getRateLimitStatus } = require('./middleware/rate_limit');
const { auditLogger } = require('./middleware/auditLogger');
const { requireAdminForPage, requireAdmin } = require('./middleware/adminAuth');
const { router: listsRouter } = require('./routes/lists');
const stremioRoutes = require('./routes/stremio');
// Collections removed - no longer needed
// Recommendations removed
const watchlistRoutes = require('./routes/watchlist');

const app = express();

// Security + perf
app.set('etag', 'strong');
app.use(compression({ threshold: '1kb' }));

// CSP (allow AOS CDN for landing; remove unpkg if not used)
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'", "'unsafe-inline'", "https://unpkg.com"],
      "style-src": ["'self'", "'unsafe-inline'", "https://unpkg.com"],
      "img-src": ["'self'", "data:", "blob:"],
      "font-src": ["'self'", "data:"],
      // allow XHR/fetch to Stremio API (and keep self)
      "connect-src": ["'self'", "https://api.strem.io"]
    }
  },
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'no-referrer' }
}));

// Body + cookies + CORS + sessions FIRST (before any route using req.session)
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// CORS (tighten in prod)
app.use(cors({ origin: (origin, cb) => cb(null, true), credentials: true }));

// Sessions
const PROD = process.env.NODE_ENV === 'production';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';
const IDLE_MIN = Number(process.env.SESSION_IDLE_MINUTES || 30);
const ABS_MIN  = Number(process.env.SESSION_ABSOLUTE_MINUTES || 720);

app.set('trust proxy', 1);
app.use(session({
  name: process.env.SESSION_NAME || 'sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: process.env.COOKIE_SAMESITE || 'lax',
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : PROD,
    maxAge: IDLE_MIN * 60 * 1000
  }
}));

app.use(attachSessionUser);
app.use(absoluteSessionTimeout({ absoluteMs: ABS_MIN * 60 * 1000 }));
app.use(enhancedSessionTracking); // Enhanced session tracking
app.use(passport.initialize());
app.use(passport.session());
app.use(limiterApp);

// Audit logging middleware (after rate limiting, before health tracking)
app.use(auditLogger({
  enablePerformanceLogging: true,
  enableErrorLogging: true,
  enableSecurityLogging: true,
  skipSuccessfulGets: true
}));

// Health tracking middleware (after auth setup)
app.use(trackHealth);

// Legacy static assets used by server-rendered pages
app.use('/css',    express.static(path.join(__dirname, '..', 'public', 'css'), { immutable: true, maxAge: '7d' }));
app.use('/public', express.static(path.join(__dirname, 'public'),             { immutable: true, maxAge: '7d' }));

// Vite build mounts (must be before `pages` so SPA wins for /dashboard)
const distDir = path.join(__dirname, '..', 'dashboard-ui', 'dist');

// Serve built hashed assets at root so /assets/... works from any route
app.use('/assets', express.static(path.join(distDir, 'assets'), { immutable: true, maxAge: '1y' })); // [root]/assets/*

// Serve whole dist for convenience under /u and /dashboard
app.use('/u',         express.static(distDir, { index: false }));
app.use('/dashboard', express.static(distDir, { index: false }));

// Landing (built HTML entry) at bare URL and /install variants
app.get('/', (req, res, next) => {
  res.sendFile(path.join(distDir, 'landing.html'), err => err && next(err));
});
app.get(['/install', '/u/install'], (req, res, next) => {
  res.sendFile(path.join(distDir, 'landing.html'), err => err && next(err));
});

// Analytics page (public)
app.get(['/analytics', '/analytics/*'], (req, res, next) => {
  res.sendFile(path.join(distDir, 'analytics.html'), err => err && next(err));
});

// Health monitoring page (requires admin authentication)
app.get(['/health', '/health/*'], requireAdminForPage, (req, res, next) => {
  res.sendFile(path.join(distDir, 'health.html'), err => err && next(err));
});

// Audit logs page (requires admin authentication)
app.get(['/audit', '/audit/*'], requireAdminForPage, (req, res, next) => {
  res.sendFile(path.join(distDir, 'audit.html'), err => err && next(err));
});

// Protect dashboard shell: redirect unauthenticated to login
app.get(['/dashboard', '/dashboard/*'], limiterDashboard, (req, res, next) => {
  if (!req.session || !req.session.user) return res.redirect('/login');
  res.sendFile(path.join(distDir, 'index.html'), err => err && next(err));
});

// Stremio Addon Manager static
app.use('/reorder', express.static(path.join(__dirname, '..', 'vendor', 'stremio-addon-manager', 'dist')));
app.get('/reorder/*', (req,res) =>
  res.sendFile(path.join(__dirname, '..', 'vendor', 'stremio-addon-manager', 'dist', 'index.html'))
);

// Health
app.get('/healthz', (_req, res) => res.json({ ok: true }));

// IMPORTANT: server-rendered pages AFTER SPA mounts so /dashboard stays SPA.
// This ensures /login and /register are handled by legacy templates (not SPA), fixing blank pages.
app.use(pages);

// Auth API
app.use('/api/auth', limiterAuthStrict, authRoutes);
app.use('/auth', oauth2Routes);

// WebSocket status endpoint (public) - moved before API auth
app.get('/ws/status', (_req, res) => {
  const stats = websocketService.getConnectionStats();
  res.json({
    connected: stats.connected,
    status: websocketService.isHealthy() ? 'active' : 'inactive',
    isInitialized: stats.isInitialized
  });
});

// Debug + config
app.use('/api', debugRoutes);
app.use('/api', configRoutes);

// Rate limit status endpoint
app.get('/api/rate-limit/status', getRateLimitStatus);

// Health monitoring API (admin only)
app.use('/api/health', limiterHealth, requireAdmin, healthRoutes);

// Session management API
app.use('/api/session', limiterSession, sessionRoutes);

// Audit logging API (admin only)
app.use('/api/audit', limiterAPI, requireAdmin, auditRoutes);

// Performance alerts API (admin only)
app.use('/api/alerts', limiterAPI, requireAdmin, performanceAlertsRoutes);

// Trakt API
app.use('/api/trakt', traktRoutes);

// Lists + Stremio APIs (heavy operations)
app.use('/api', limiterAPI, listsRouter);
app.use('/api/stremio', limiterAPI, stremioRoutes);

// Collections API - removed

// Recommendations API - removed

// Watchlist Analytics API (heavy operations)
app.use('/api/watchlist', limiterHeavyOps, watchlistRoutes);

// Addon public routes
app.use('/u', addonRoutes);

// Health (already defined above)
// app.get('/healthz', (_req, res) => res.json({ ok: true }));

// Errors
app.use(require('./middleware/error').notFound);
app.use(require('./middleware/error').errorHandler);

// Start
(async () => {
  await initDb();
  scheduler.start(); // <-- start token refresh + prewarm loops
  databaseMonitor.start(); // <-- start database monitoring
  healthMonitor.start(); // <-- start comprehensive health monitoring
  performanceAlerts.start(); // <-- start performance alerts system
  
  const port = process.env.PORT || 8080;
  
  // Create HTTP server
  const httpServer = createServer(app);
  
  // Initialize WebSocket service
  websocketService.initialize(httpServer);
  
  httpServer.listen(port, () => {
    logger.info({ 
      port, 
      env: process.env.NODE_ENV || 'development',
      websockets: websocketService.isHealthy()
    }, 'server_started_with_websockets');
  });
})();
