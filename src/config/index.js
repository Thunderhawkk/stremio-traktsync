const ms = require('ms');

const cfg = {
  baseUrl: process.env.BASE_URL || 'http://localhost:8080',
  jwt: {
    secret: process.env.JWT_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessTtlMs: ms(process.env.JWT_ACCESS_TTL || '30m'),
    refreshTtlMs: ms(process.env.JWT_REFRESH_TTL || '14d')
  },
  bcryptRounds: Math.min(Math.max(parseInt(process.env.BCRYPT_ROUNDS || '11', 10), 10), 12),
  cookies: {
    secure: String(process.env.COOKIE_SECURE || '').toLowerCase() === 'true',
    sameSite: 'lax'
  },
  corsOrigin: process.env.CORS_ORIGIN || process.env.BASE_URL || 'http://localhost:8080',
  addonSigning: {
    secret: process.env.ADDON_SIGNING_SECRET || '',
    ttlSeconds: parseInt(process.env.ADDON_LINK_TTL_SECONDS || '604800', 10)
  },
  trakt: {
    clientId: process.env.TRAKT_CLIENT_ID || '',
    clientSecret: process.env.TRAKT_CLIENT_SECRET || '',
    redirectUri: process.env.TRAKT_REDIRECT_URI || 'urn:ietf:wg:oauth:2.0:oob'
  },
  OMDB_API_KEY: process.env.OMDB_API_KEY || '',
  FANARTTV_API_KEY: process.env.FANARTTV_API_KEY || '',
  db: {
    url: process.env.DATABASE_URL || '',
    dataDir: process.env.DATA_DIR || '.data'
  },
  logLevel: process.env.LOG_LEVEL || process.env.log_level || 'info',
  stremioApiBase: process.env.STREMIO_API_BASE || 'https://api.strem.io'
};

module.exports = cfg;
