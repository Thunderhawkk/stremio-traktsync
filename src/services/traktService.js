// src/services/traktService.js
const axios = require('axios');
const cfg = require('../config');
const { repo } = require('../db/repo');

// Resolve Trakt OAuth app credentials
const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID || (cfg.trakt && cfg.trakt.clientId) || '';
const TRAKT_CLIENT_SECRET = process.env.TRAKT_CLIENT_SECRET || (cfg.trakt && cfg.trakt.clientSecret) || '';

// Axios client targeting Trakt API
const trakt = axios.create({
  baseURL: 'https://api.trakt.tv',
  timeout: 15000
});

// Inject required headers on every request (prevents 403 on public endpoints)
trakt.interceptors.request.use((config) => {
  config.headers = config.headers || {};
  config.headers['trakt-api-version'] = '2';
  config.headers['trakt-api-key'] = TRAKT_CLIENT_ID;
  return config;
});

// Helper for optional Authorization header
function authHeaders(accessToken) {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

// Strip query/hash and trailing slashes
function sanitizeInput(raw) {
  return String(raw).replace(/[?#].*$/, '').replace(/\/+$/, '').trim();
}

// Resolve an input into:
// - userListPath: "username/lists/slug" (preferred)
// - listIdOrSlug: "123456" or "my-slug" for /lists/{idOrSlug} fallback
async function resolveListRef(input) {
  const clean = sanitizeInput(input);

  // users/{user}/lists/{slug}
  let m = clean.match(/^https?:\/\/(?:www\.)?trakt\.tv\/users\/([^/]+)\/lists\/([^/]+)$/i);
  if (m) return { userListPath: `${m[1]}/lists/${m[2]}`, listIdOrSlug: m[2] };

  // lists/{idOrSlug}
  m = clean.match(/^https?:\/\/(?:www\.)?trakt\.tv\/lists\/([^/]+)$/i);
  if (m) return { userListPath: null, listIdOrSlug: m[1] };

  // mdblist.com/lists/{user}/{slug}
  m = clean.match(/^https?:\/\/(?:www\.)?mdblist\.com\/lists\/([^/]+)\/([^/]+)$/i);
  if (m) return { userListPath: `${m[1]}/lists/${m[2]}`, listIdOrSlug: m[2] };

  // "username/lists/slug"
  m = clean.match(/^([a-zA-Z0-9_-]+)\/lists\/([a-zA-Z0-9-]+)$/);
  if (m) return { userListPath: `${m[1]}/lists/${m[2]}`, listIdOrSlug: m[2] };

  // Unknown; pass through for fallback probing
  return { userListPath: null, listIdOrSlug: clean || null };
}

// Device auth: init
async function deviceInit() {
  const { data, status } = await trakt.post('/oauth/device/code', { client_id: TRAKT_CLIENT_ID });
  if (status !== 200) throw new Error('trakt_device_init_failed');
  return data;
}

// Device auth: poll
async function devicePoll(device_code) {
  try {
    const { data, status } = await trakt.post('/oauth/device/token', {
      code: device_code,
      client_id: TRAKT_CLIENT_ID,
      client_secret: TRAKT_CLIENT_SECRET
    });
    if (status !== 200) return null;
    const expires_at = new Date(Date.now() + data.expires_in * 1000).toISOString();
    return { ...data, expires_at };
  } catch (e) {
    if (e.response && e.response.status === 400) return null; // authorization_pending / slow_down
    throw e;
  }
}

// Refresh Trakt token via refresh_token
async function refreshTraktToken(userId) {
  const current = await repo.getTraktTokens(userId);
  if (!current || !current.refresh_token) throw new Error('no_refresh_token');
  const { data, status } = await trakt.post('/oauth/token', {
    client_id: TRAKT_CLIENT_ID,
    client_secret: TRAKT_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: current.refresh_token
  });
  if (status !== 200) throw new Error('trakt_refresh_failed');
  const expires_at = new Date(Date.now() + data.expires_in * 1000).toISOString();
  await repo.upsertTraktTokens({
    userId,
    access_token: data.access_token,
    refresh_token: data.refresh_token || current.refresh_token,
    expires_at
  });
  return { access_token: data.access_token, refresh_token: data.refresh_token || current.refresh_token, expires_at };
}

// Ensure a valid (or fresh) access token if available; public lists work without it
async function ensureValidToken(userId) {
  const t = await repo.getTraktTokens(userId);
  if (!t || !t.access_token) return null;
  const marginMs = 5 * 60 * 1000;
  const expMs = Date.parse(t.expires_at || 0);
  if (isFinite(expMs) && (expMs - Date.now()) > marginMs) return t.access_token;
  try {
    const refreshed = await refreshTraktToken(userId);
    return refreshed.access_token;
  } catch {
    return t.access_token;
  }
}

// Strong existence check: ok if either items/movies or items/shows returns HTTP 200
async function validateListExists(urlOrSlug) {
  const resolved = await resolveListRef(urlOrSlug);
  const paths = [];
  if (resolved.userListPath) {
    paths.push(`/users/${resolved.userListPath}/items/movies?limit=1`);
    paths.push(`/users/${resolved.userListPath}/items/shows?limit=1`);
  } else if (resolved.listIdOrSlug) {
    paths.push(`/lists/${resolved.listIdOrSlug}/items/movies?limit=1`);
    paths.push(`/lists/${resolved.listIdOrSlug}/items/shows?limit=1`);
  } else {
    return { ok: false, resolved };
  }

  // Do not throw on non-2xx so we can inspect status reliably
  for (const p of paths) {
    const r = await trakt.get(p, { validateStatus: () => true });
    if (r.status === 200) return { ok: true, resolved };
  }
  return { ok: false, resolved };
}

async function getUserListItems({ userId, urlOrSlug, stremioType, limit = 50, page = 1 }) {
  const traktType = stremioType === 'series' ? 'shows' : 'movies';
  const resolved = await resolveListRef(urlOrSlug);
  const accessToken = await ensureValidToken(userId);
  const headers = authHeaders(accessToken);

  const qp = `extended=full&limit=${encodeURIComponent(limit)}&page=${encodeURIComponent(page)}`;

  // Prefer user/slug
  if (resolved.userListPath) {
    const path = `/users/${resolved.userListPath}/items/${traktType}?${qp}`;
    try {
      const { data, status } = await trakt.get(path, { headers });
      if (status === 200 && Array.isArray(data)) return data;
    } catch {}
  }

  // Fallback to /lists/{idOrSlug}
  if (resolved.listIdOrSlug) {
    const path2 = `/lists/${resolved.listIdOrSlug}/items/${traktType}?${qp}`;
    try {
      const { data, status } = await trakt.get(path2, { headers });
      if (status === 200 && Array.isArray(data)) return data;
    } catch {}
  }

  return [];
}


module.exports = {
  deviceInit,
  devicePoll,
  refreshTraktToken,
  ensureValidToken,
  validateListExists,
  getUserListItems
};
