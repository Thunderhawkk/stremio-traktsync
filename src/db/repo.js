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
    logger.info({ usePg }, 'db_initialized');
  } else {
    logger.warn('DATABASE_URL not set; using filesystem fallback');
    ensureDirSync(DATA_DIR);
  }
}

const repo = {
  // Users
  async createUser({ username, email, passwordHash, role = 'user' }) {
    if (usePg) {
      const pg = await getPg();
      const id = uuidv4();
      const ts = new Date();
      await pg.query(
        `INSERT INTO users(id, username, email, password_hash, role, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, username, email || null, passwordHash, role, ts, ts]
      );
      return { id, username, email, role, createdAt: ts, updatedAt: ts };
    } else {
      const users = fsdb.read('users');
      if (users.find(u => u.username === username)) throw new Error('username_taken');
      const user = {
        id: uuidv4(),
        username,
        email: email || null,
        passwordHash,
        role,
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
      const pg = await getPg();
      await pg.query('BEGIN');
      await pg.query(`DELETE FROM list_config WHERE user_id=$1`, [userId]);
      for (const l of lists) {
        await pg.query(
          `
          INSERT INTO list_config(id, user_id, name, url, type, sort_by, sort_order, enabled, "order", created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
          `,
          [
            l.id,
            userId,
            l.name,
            l.url,
            l.type,
            l.sortBy || null,
            l.sortOrder || null,
            !!l.enabled,
            l.order || null
          ]
        );
      }
      await pg.query('COMMIT');
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
  setLastManualRefreshAt: repo.setLastManualRefreshAt.bind(repo)
};
