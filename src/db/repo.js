// src/db/repo.js
// Original repo with additions:
// - manifestVersion (get/bump) per user
// - lastAutoRefreshAt / lastManualRefreshAt per user (get/set)
// - listUsers helper for Admin
// - safe PG + FS support without breaking existing flows

const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const os = require('os');

const { getPg } = require('./pg');
const fsdb = require('./fs');
const cfg = require('../config');
const { logger } = require('../utils/logger');

let usePg = false;

/* ----- filesystem helpers (atomic per-user doc) ----- */
const DATA_DIR = (cfg.db && cfg.db.dataDir) || '.data';

function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function userFile(userId) {
  ensureDirSync(DATA_DIR);
  return path.join(DATA_DIR, `${String(userId)}.json`);
}

async function readUserDoc(userId) {
  try {
    const buf = await fsp.readFile(userFile(userId));
    const doc = JSON.parse(buf.toString('utf8'));
    // Ensure new fields exist
    if (typeof doc.manifestVersion !== 'number') doc.manifestVersion = 1;
    if (!Object.prototype.hasOwnProperty.call(doc, 'lastAutoRefreshAt')) doc.lastAutoRefreshAt = null;
    if (!Object.prototype.hasOwnProperty.call(doc, 'lastManualRefreshAt')) doc.lastManualRefreshAt = null;
    if (!Array.isArray(doc.lists)) doc.lists = [];
    return doc;
  } catch {
    return {
      lists: [],
      addonToken: null,
      traktTokens: null,
      manifestVersion: 1,
      lastAutoRefreshAt: null,
      lastManualRefreshAt: null
    };
  }
}

async function writeUserDocAtomic(userId, doc) {
  const file = userFile(userId);
  ensureDirSync(path.dirname(file));
  const base = path.basename(file);
  const tmp = path.join(
    path.dirname(file),
    `.${base}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`
  );
  const json = JSON.stringify(doc, null, 2);

  // Write temp in the SAME directory to avoid cross-device rename
  await fsp.writeFile(tmp, json, 'utf8');

  try {
    // Try atomic replace first
    await fsp.rename(tmp, file);
  } catch (e) {
    // Handle EXDEV/EPERM by copying and then unlinking temp
    if (e && (e.code === 'EXDEV' || e.code === 'EPERM')) {
      await fsp.copyFile(tmp, file);
      await fsp.unlink(tmp).catch(() => {});
    } else {
      // Cleanup temp and rethrow other errors
      await fsp.unlink(tmp).catch(() => {});
      throw e;
    }
  }
}
/* --------------------------------------------------- */

async function initDb() {
  usePg = !!(cfg.db && cfg.db.url);
  if (usePg) {
    const pg = await getPg();
    // Minimal bootstrap; safe to run multiple times
    await pg.query(`CREATE TABLE IF NOT EXISTS _init (id INT PRIMARY KEY);`);
    // Ensure pgcrypto for gen_random_bytes used below
    await pg.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`).catch(() => {});
    // Ensure columns required for features exist
    await pg.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS addon_token TEXT,
        ADD COLUMN IF NOT EXISTS manifest_version INT DEFAULT 1,
        ADD COLUMN IF NOT EXISTS last_auto_refresh_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS last_manual_refresh_at TIMESTAMPTZ;
    `).catch(() => {});
    // Optional safety: create tables used elsewhere if missing
    await pg.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        user_id UUID NOT NULL,
        refresh_token_hash TEXT NOT NULL,
        issued_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ
      );
    `).catch(() => {});
    await pg.query(`
      CREATE TABLE IF NOT EXISTS trakt_tokens (
        user_id UUID PRIMARY KEY,
        access_token TEXT,
        refresh_token TEXT,
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `).catch(() => {});
    await pg.query(`
      CREATE TABLE IF NOT EXISTS list_config (
        id UUID NOT NULL,
        user_id UUID NOT NULL,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        type TEXT NOT NULL,
        sort_by TEXT,
        sort_order TEXT,
        enabled BOOLEAN,
        "order" INT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `).catch(() => {});
    
    // Session management tables
    await pg.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id TEXT PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_agent TEXT NOT NULL,
        ip_address INET,
        device_info JSONB,
        fingerprint TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        is_active BOOLEAN NOT NULL DEFAULT true,
        security_flags TEXT[],
        last_suspicious_activity TIMESTAMPTZ,
        expires_at TIMESTAMPTZ NOT NULL
      );
    `).catch(() => {});
    
    // Session indexes
    await pg.query(`CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id, is_active, last_activity DESC);`).catch(() => {});
    await pg.query(`CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(is_active, last_activity) WHERE is_active = true;`).catch(() => {});
    await pg.query(`CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);`).catch(() => {});
    
    // Add session columns to users table
    await pg.query(`
      ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS last_session_id TEXT,
        ADD COLUMN IF NOT EXISTS session_count INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS last_ip_address INET;
    `).catch(() => {});
    logger.info({ usePg }, 'db_initialized');
  } else {
    logger.warn('DATABASE_URL not set; using filesystem fallback');
    ensureDirSync(DATA_DIR);
  }
}

const repo = {
  // Users
  async createUser({ username, email, passwordHash, role = 'user', provider = 'local', provider_id = null, avatar_url = null, email_verified = false }) {
    if (usePg) {
      const pg = await getPg();
      const id = uuidv4();
      const ts = new Date();
      await pg.query(
        `INSERT INTO users(id, username, email, password_hash, role, provider, provider_id, avatar_url, email_verified, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [id, username, email || null, passwordHash || null, role, provider, provider_id, avatar_url, email_verified, ts, ts]
      );
      return { id, username, email, role, provider, provider_id, avatar_url, email_verified, createdAt: ts, updatedAt: ts };
    } else {
      const users = fsdb.read('users');
      if (users.find(u => u.username === username)) throw new Error('username_taken');
      const user = {
        id: uuidv4(),
        username,
        email: email || null,
        passwordHash: passwordHash || null,
        role,
        provider,
        provider_id,
        avatar_url,
        email_verified,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      users.push(user);
      fsdb.write('users', users);
      return user;
    }
  },

  async findUserByUsername(username) {
    if (usePg) {
      const pg = await getPg();
      const { rows } = await pg.query(`SELECT * FROM users WHERE username=$1`, [username]);
      return rows && rows[0] ? rows[0] : null;
    } else {
      const users = fsdb.read('users');
      return users.find(u => u.username === username) || null;
    }
  },

  async findUserById(id) {
    if (usePg) {
      const pg = await getPg();
      const { rows } = await pg.query(`SELECT * FROM users WHERE id=$1`, [id]);
      return rows && rows[0] ? rows[0] : null;
    } else {
      return fsdb.read('users').find(u => u.id === id) || null;
    }
  },

  async findUserByEmail(email) {
    if (usePg) {
      const pg = await getPg();
      const { rows } = await pg.query(`SELECT * FROM users WHERE email=$1`, [email]);
      return rows && rows[0] ? rows[0] : null;
    } else {
      const users = fsdb.read('users');
      return users.find(u => u.email === email) || null;
    }
  },

  async findUserByProvider(provider, providerId) {
    if (usePg) {
      const pg = await getPg();
      const { rows } = await pg.query(
        `SELECT * FROM users WHERE provider=$1 AND provider_id=$2`,
        [provider, providerId]
      );
      return rows && rows[0] ? rows[0] : null;
    } else {
      const users = fsdb.read('users');
      return users.find(u => u.provider === provider && u.provider_id === providerId) || null;
    }
  },

  async updateUser(id, updates) {
    const ts = new Date();
    if (usePg) {
      const pg = await getPg();
      const updateFields = [];
      const values = [];
      let paramIndex = 1;
      
      Object.keys(updates).forEach(key => {
        if (updates[key] !== undefined) {
          updateFields.push(`${key}=$${paramIndex}`);
          values.push(updates[key]);
          paramIndex++;
        }
      });
      
      if (updateFields.length === 0) return null;
      
      updateFields.push(`updated_at=$${paramIndex}`);
      values.push(ts);
      values.push(id);
      
      const { rows } = await pg.query(
        `UPDATE users SET ${updateFields.join(', ')} WHERE id=$${paramIndex + 1} RETURNING *`,
        values
      );
      return rows && rows[0] ? rows[0] : null;
    } else {
      const users = fsdb.read('users');
      const user = users.find(u => u.id === id);
      if (user) {
        Object.assign(user, updates, { updatedAt: ts.toISOString() });
        fsdb.write('users', users);
        return user;
      }
      return null;
    }
  },

  async updateUserLoginAt(id) {
    const ts = new Date();
    if (usePg) {
      const pg = await getPg();
      await pg.query(`UPDATE users SET last_login_at=$1 WHERE id=$2`, [ts, id]);
    } else {
      const users = fsdb.read('users');
      const u = users.find(x => x.id === id);
      if (u) {
        u.lastLoginAt = ts.toISOString();
        fsdb.write('users', users);
      }
    }
  },

  // New: list users (for Admin)
  async listUsers() {
    if (usePg) {
      const pg = await getPg();
      const { rows } = await pg.query(`SELECT id, username, role, created_at, updated_at FROM users ORDER BY created_at`);
      return rows || [];
    } else {
      const users = fsdb.read('users');
      return (users || []).map(u => ({ id: u.id, username: u.username, role: u.role, created_at: u.createdAt, updated_at: u.updatedAt }));
    }
  },

  // Refresh tokens (keep fsdb for minimal change)
  async addRefreshToken({ userId, hash, issuedAt }) {
    if (usePg) {
      const pg = await getPg();
      await pg.query(
        `INSERT INTO refresh_tokens(user_id, refresh_token_hash, issued_at) VALUES ($1,$2,$3)`,
        [userId, hash, issuedAt]
      );
    } else {
      const list = fsdb.read('refresh');
      list.push({ userId, refreshTokenHash: hash, issuedAt, revokedAt: null });
      fsdb.write('refresh', list);
    }
  },

  async revokeRefreshToken({ userId, hash }) {
    if (usePg) {
      const pg = await getPg();
      await pg.query(
        `UPDATE refresh_tokens SET revoked_at=NOW() WHERE user_id=$1 AND refresh_token_hash=$2 AND revoked_at IS NULL`,
        [userId, hash]
      );
    } else {
      const list = fsdb.read('refresh');
      const item = list.find(r => r.userId === userId && r.refreshTokenHash === hash && !r.revokedAt);
      if (item) {
        item.revokedAt = new Date().toISOString();
        fsdb.write('refresh', list);
      }
    }
  },

  async isRefreshTokenActive({ userId, hash }) {
    if (usePg) {
      const pg = await getPg();
      const { rows } = await pg.query(
        `SELECT 1 FROM refresh_tokens WHERE user_id=$1 AND refresh_token_hash=$2 AND revoked_at IS NULL`,
        [userId, hash]
      );
      return rows.length > 0;
    } else {
      const list = fsdb.read('refresh');
      return !!list.find(r => r.userId === userId && r.refreshTokenHash === hash && !r.revokedAt);
    }
  },

  async revokeAllUserRefreshTokens(userId) {
    if (usePg) {
      const pg = await getPg();
      await pg.query(`UPDATE refresh_tokens SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL`, [userId]);
    } else {
      const list = fsdb.read('refresh');
      list.forEach(r => {
        if (r.userId === userId && !r.revokedAt) r.revokedAt = new Date().toISOString();
      });
      fsdb.write('refresh', list);
    }
  },

  // Trakt tokens (filesystem: per-user file)
  async upsertTraktTokens({ userId, access_token, refresh_token, expires_at }) {
    if (usePg) {
      const pg = await getPg();
      await pg.query(
        `
        INSERT INTO trakt_tokens(user_id, access_token, refresh_token, expires_at, created_at, updated_at)
        VALUES ($1,$2,$3,$4,NOW(),NOW())
        ON CONFLICT(user_id) DO UPDATE
          SET access_token=EXCLUDED.access_token,
              refresh_token=EXCLUDED.refresh_token,
              expires_at=EXCLUDED.expires_at,
              updated_at=NOW()
        `,
        [userId, access_token, refresh_token, expires_at]
      );
    } else {
      const doc = await readUserDoc(userId);
      doc.traktTokens = { access_token, refresh_token, expires_at };
      await writeUserDocAtomic(userId, doc);
    }
  },

  async getTraktTokens(userId) {
    if (usePg) {
      const pg = await getPg();
      const { rows } = await pg.query(`SELECT * FROM trakt_tokens WHERE user_id=$1`, [userId]);
      return rows && rows[0] ? rows[0] : null;
    } else {
      const doc = await readUserDoc(userId);
      return doc.traktTokens || null;
    }
  },

  async deleteTraktTokens(userId) {
    if (usePg) {
      const pg = await getPg();
      await pg.query(`DELETE FROM trakt_tokens WHERE user_id=$1`, [userId]);
    } else {
      const doc = await readUserDoc(userId);
      doc.traktTokens = null;
      await writeUserDocAtomic(userId, doc);
    }
  },

  // List config (filesystem: per-user file)
  async getLists(userId) {
    if (usePg) {
      const pg = await getPg();
      const { rows } = await pg.query(
        `SELECT * FROM list_config WHERE user_id=$1 ORDER BY "order" NULLS LAST, created_at`,
        [userId]
      );
      return rows;
    } else {
      const doc = await readUserDoc(userId);
      const lists = Array.isArray(doc.lists) ? doc.lists : [];
      // keep previous ordering rule
      return lists.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    }
  },

  async saveLists(userId, lists) {
    if (usePg) {
      // Use optimized batch insert
      const optimizedQueries = require('./optimizedQueries');
      await optimizedQueries.batchInsertListConfigs(userId, lists);
    } else {
      const doc = await readUserDoc(userId);
      const now = new Date().toISOString();
      doc.lists = (Array.isArray(lists) ? lists : []).map(l => ({
        ...l,
        userId,
        createdAt: l.createdAt || now,
        updatedAt: now
      }));
      await writeUserDocAtomic(userId, doc);
    }
  },

  // Stable addon token helpers
  async ensureAddonToken(userId) {
    if (usePg) {
      const pg = await getPg();
      const { rows } = await pg.query(`SELECT addon_token FROM users WHERE id=$1`, [userId]);
      if (rows && rows[0] && rows[0].addon_token) return rows[0].addon_token;
      const { rows: gen } = await pg.query(
        `UPDATE users SET addon_token=encode(gen_random_bytes(16),'hex') WHERE id=$1 RETURNING addon_token`,
        [userId]
      );
      return gen && gen[0] ? gen[0].addon_token : null;
    } else {
      const doc = await readUserDoc(userId);
      if (doc.addonToken) return doc.addonToken;
      doc.addonToken = require('crypto').randomBytes(16).toString('hex');
      await writeUserDocAtomic(userId, doc);
      return doc.addonToken;
    }
  },

  async getAddonToken(userId) {
    if (usePg) {
      const pg = await getPg();
      const { rows } = await pg.query(`SELECT addon_token FROM users WHERE id=$1`, [userId]);
      return rows && rows[0] ? rows[0].addon_token : null;
    } else {
      const doc = await readUserDoc(userId);
      return doc.addonToken || null;
    }
  },

  /* ===== Added: manifestVersion helpers ===== */
  async getManifestVersion(userId) {
    if (usePg) {
      const pg = await getPg();
      const { rows } = await pg.query(
        `SELECT COALESCE(manifest_version,1) AS v FROM users WHERE id=$1`,
        [userId]
      );
      return rows && rows[0] ? Number(rows[0].v) : 1;
    } else {
      const doc = await readUserDoc(userId);
      return Number.isFinite(doc.manifestVersion) ? doc.manifestVersion : 1;
    }
  },

  async bumpManifestVersion(userId) {
    if (usePg) {
      const pg = await getPg();
      const { rows } = await pg.query(
        `UPDATE users
           SET manifest_version = COALESCE(manifest_version,1) + 1,
               updated_at = NOW()
         WHERE id=$1
         RETURNING manifest_version`,
        [userId]
      );
      return rows && rows[0] ? Number(rows[0].manifest_version) : 1;
    } else {
      const doc = await readUserDoc(userId);
      doc.manifestVersion = (Number.isFinite(doc.manifestVersion) ? doc.manifestVersion : 1) + 1;
      await writeUserDocAtomic(userId, doc);
      return doc.manifestVersion;
    }
  },

  /* ===== Added: auto/manual refresh timestamps ===== */
  async getLastAutoRefreshAt(userId) {
    if (usePg) {
      const pg = await getPg();
      const { rows } = await pg.query(
        `SELECT last_auto_refresh_at FROM users WHERE id=$1`,
        [userId]
      );
      return rows && rows[0] ? rows[0].last_auto_refresh_at : null;
    } else {
      const doc = await readUserDoc(userId);
      return doc.lastAutoRefreshAt || null;
    }
  },

  async setLastAutoRefreshAt(userId, isoString) {
    const ts = isoString || new Date().toISOString();
    if (usePg) {
      const pg = await getPg();
      await pg.query(
        `UPDATE users SET last_auto_refresh_at=$1, updated_at=NOW() WHERE id=$2`,
        [ts, userId]
      );
      return ts;
    } else {
      const doc = await readUserDoc(userId);
      doc.lastAutoRefreshAt = ts;
      await writeUserDocAtomic(userId, doc);
      return ts;
    }
  },

  async getLastManualRefreshAt(userId) {
    if (usePg) {
      const pg = await getPg();
      const { rows } = await pg.query(
        `SELECT last_manual_refresh_at FROM users WHERE id=$1`,
        [userId]
      );
      return rows && rows[0] ? rows[0].last_manual_refresh_at : null;
    } else {
      const doc = await readUserDoc(userId);
      return doc.lastManualRefreshAt || null;
    }
  },

  async setLastManualRefreshAt(userId, isoString) {
    const ts = isoString || new Date().toISOString();
    if (usePg) {
      const pg = await getPg();
      await pg.query(
        `UPDATE users SET last_manual_refresh_at=$1, updated_at=NOW() WHERE id=$2`,
        [ts, userId]
      );
      return ts;
    } else {
      const doc = await readUserDoc(userId);
      doc.lastManualRefreshAt = ts;
      await writeUserDocAtomic(userId, doc);
      return ts;
    }
  },

  // Session Management Methods
  async createSession(sessionData) {
    if (usePg) {
      const pg = await getPg();
      await pg.query(
        `INSERT INTO user_sessions(
          id, user_id, user_agent, ip_address, device_info, fingerprint, 
          created_at, last_activity, is_active, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          sessionData.id,
          sessionData.userId,
          sessionData.userAgent,
          sessionData.ipAddress,
          JSON.stringify(sessionData.deviceInfo || {}),
          sessionData.fingerprint,
          sessionData.createdAt,
          sessionData.lastActivity,
          sessionData.isActive,
          new Date(sessionData.createdAt.getTime() + 12 * 60 * 60 * 1000) // 12 hours from creation
        ]
      );
      
      // Update user's last session info
      await pg.query(
        `UPDATE users SET last_session_id=$1, last_ip_address=$2, session_count=COALESCE(session_count,0)+1, updated_at=NOW() WHERE id=$3`,
        [sessionData.id, sessionData.ipAddress, sessionData.userId]
      );
    } else {
      // For filesystem, store in user doc
      const doc = await readUserDoc(sessionData.userId);
      if (!doc.sessions) doc.sessions = [];
      doc.sessions.push(sessionData);
      doc.lastSessionId = sessionData.id;
      doc.sessionCount = (doc.sessionCount || 0) + 1;
      await writeUserDocAtomic(sessionData.userId, doc);
    }
  },

  async getSession(sessionId) {
    if (usePg) {
      const pg = await getPg();
      const { rows } = await pg.query(
        `SELECT * FROM user_sessions WHERE id=$1 AND is_active=true AND expires_at > NOW()`,
        [sessionId]
      );
      if (rows && rows[0]) {
        const session = rows[0];
        session.deviceInfo = session.device_info;
        session.securityFlags = session.security_flags;
        session.lastSuspiciousActivity = session.last_suspicious_activity;
        return session;
      }
      return null;
    } else {
      // Search through all user docs for the session
      const users = fsdb.read('users');
      for (const user of users) {
        const doc = await readUserDoc(user.id).catch(() => ({ sessions: [] }));
        if (doc.sessions) {
          const session = doc.sessions.find(s => s.id === sessionId && s.isActive);
          if (session) return session;
        }
      }
      return null;
    }
  },

  async updateSession(sessionId, updates) {
    if (usePg) {
      const pg = await getPg();
      const updateFields = [];
      const values = [];
      let paramIndex = 1;
      
      const columnMap = {
        lastActivity: 'last_activity',
        deviceInfo: 'device_info',
        securityFlags: 'security_flags',
        lastSuspiciousActivity: 'last_suspicious_activity'
      };
      
      Object.keys(updates).forEach(key => {
        if (updates[key] !== undefined) {
          const dbColumn = columnMap[key] || key;
          updateFields.push(`${dbColumn}=$${paramIndex}`);
          let value = updates[key];
          
          // JSON stringify for objects
          if (key === 'deviceInfo' && typeof value === 'object') {
            value = JSON.stringify(value);
          }
          
          values.push(value);
          paramIndex++;
        }
      });
      
      if (updateFields.length > 0) {
        values.push(sessionId);
        await pg.query(
          `UPDATE user_sessions SET ${updateFields.join(', ')} WHERE id=$${paramIndex}`,
          values
        );
      }
    } else {
      // Update in filesystem
      const users = fsdb.read('users');
      for (const user of users) {
        const doc = await readUserDoc(user.id).catch(() => ({ sessions: [] }));
        if (doc.sessions) {
          const sessionIndex = doc.sessions.findIndex(s => s.id === sessionId);
          if (sessionIndex !== -1) {
            Object.assign(doc.sessions[sessionIndex], updates);
            await writeUserDocAtomic(user.id, doc);
            break;
          }
        }
      }
    }
  },

  async destroySession(sessionId) {
    if (usePg) {
      const pg = await getPg();
      await pg.query(
        `UPDATE user_sessions SET is_active=false, last_activity=NOW() WHERE id=$1`,
        [sessionId]
      );
    } else {
      // Update in filesystem
      const users = fsdb.read('users');
      for (const user of users) {
        const doc = await readUserDoc(user.id).catch(() => ({ sessions: [] }));
        if (doc.sessions) {
          const session = doc.sessions.find(s => s.id === sessionId);
          if (session) {
            session.isActive = false;
            session.lastActivity = new Date();
            await writeUserDocAtomic(user.id, doc);
            break;
          }
        }
      }
    }
  },

  async getUserSessions(userId) {
    if (usePg) {
      const pg = await getPg();
      const { rows } = await pg.query(
        `SELECT * FROM user_sessions 
         WHERE user_id=$1 AND is_active=true AND expires_at > NOW() 
         ORDER BY last_activity DESC`,
        [userId]
      );
      return rows.map(session => ({
        ...session,
        deviceInfo: session.device_info,
        securityFlags: session.security_flags,
        lastSuspiciousActivity: session.last_suspicious_activity
      }));
    } else {
      const doc = await readUserDoc(userId).catch(() => ({ sessions: [] }));
      return (doc.sessions || []).filter(s => s.isActive);
    }
  },

  async getRecentUserSessions(userId, hours) {
    if (usePg) {
      const pg = await getPg();
      const { rows } = await pg.query(
        `SELECT * FROM user_sessions 
         WHERE user_id=$1 AND created_at > NOW() - INTERVAL '${hours} hours' 
         ORDER BY created_at DESC`,
        [userId]
      );
      return rows.map(session => ({
        ...session,
        deviceInfo: session.device_info,
        securityFlags: session.security_flags,
        lastSuspiciousActivity: session.last_suspicious_activity
      }));
    } else {
      const doc = await readUserDoc(userId).catch(() => ({ sessions: [] }));
      const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
      return (doc.sessions || []).filter(s => new Date(s.createdAt) > cutoff);
    }
  },

  async cleanupExpiredSessions(absoluteTimeout, idleTimeout) {
    if (usePg) {
      const pg = await getPg();
      const { rows } = await pg.query('SELECT cleanup_expired_sessions() as deleted_count');
      return rows[0] ? rows[0].deleted_count : 0;
    } else {
      // Cleanup filesystem sessions
      const users = fsdb.read('users');
      let cleaned = 0;
      
      for (const user of users) {
        try {
          const doc = await readUserDoc(user.id);
          if (doc.sessions) {
            const now = new Date();
            const originalLength = doc.sessions.length;
            
            doc.sessions = doc.sessions.filter(session => {
              const createdAt = new Date(session.createdAt);
              const lastActivity = new Date(session.lastActivity);
              const timeSinceCreated = now - createdAt;
              const timeSinceActivity = now - lastActivity;
              
              return session.isActive && 
                     timeSinceCreated <= absoluteTimeout && 
                     timeSinceActivity <= idleTimeout;
            });
            
            if (doc.sessions.length !== originalLength) {
              cleaned += originalLength - doc.sessions.length;
              await writeUserDocAtomic(user.id, doc);
            }
          }
        } catch (error) {
          // Skip users with read errors
        }
      }
      
      return cleaned;
    }
  }
};

module.exports = {
  initDb,
  repo,
  ensureAddonToken: repo.ensureAddonToken.bind(repo),
  getAddonToken: repo.getAddonToken.bind(repo),
  deleteTraktTokens: repo.deleteTraktTokens.bind(repo),
  // convenience re-exports for new helpers
  getManifestVersion: repo.getManifestVersion.bind(repo),
  bumpManifestVersion: repo.bumpManifestVersion.bind(repo),
  getLastAutoRefreshAt: repo.getLastAutoRefreshAt.bind(repo),
  setLastAutoRefreshAt: repo.setLastAutoRefreshAt.bind(repo),
  getLastManualRefreshAt: repo.getLastManualRefreshAt.bind(repo),
  setLastManualRefreshAt: repo.setLastManualRefreshAt.bind(repo),
  // optimized queries
  optimized: require('./optimizedQueries')
};
