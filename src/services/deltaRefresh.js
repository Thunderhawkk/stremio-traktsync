// src/services/deltaRefresh.js
// Background "delta refresh" that checks Trakt updates since the last run
// and invalidates per-user catalog caches when changes are detected.

const { repo } = require('../db/repo');
const { getUserSettings, updateUserSettings } = require('../state/userSettings');
const { cache } = require('../utils/cache');
const { getUserListItems } = require('../services/traktService');

// Minimal fetchers for Trakt "updated since" endpoints.
// These endpoints return items updated since a UTC ISO date.
// We page until empty or a sane cap to avoid excessive load. [Trakt updates docs]
async function fetchUpdatedMoviesSince({ userId, sinceISO, page = 1, limit = 100 }) {
  // Reuse the Trakt service token context; implement a dedicated method there if you prefer.
  // If a dedicated client exists, call /movies/updates/{since}?page=&limit=&extended=full. [Updates]
  return getUserListItems({ userId, urlOrSlug: `__updates_movies__:${sinceISO}:${page}:${limit}`, stremioType: 'movie', limit, page });
}

async function fetchUpdatedShowsSince({ userId, sinceISO, page = 1, limit = 100 }) {
  // Same approach for shows: /shows/updates/{since}?page=&limit=&extended=full. [Updates]
  return getUserListItems({ userId, urlOrSlug: `__updates_shows__:${sinceISO}:${page}:${limit}`, stremioType: 'series', limit, page });
}

// Purge all catalog caches for a user (page scoped keys) [cache]
function clearUserCatalogCache(userId){
  const prefix = `${userId}:catalog:`;
  for (const k of cache.keys()){
    if (k.startsWith(prefix)) cache.del(k);
  }
}

const scheduled = new Set(); // userIds scheduled
const DEFAULT_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

// Schedule a background task per user (idempotent)
function ensureDeltaScheduleForUser(userId, intervalMs = DEFAULT_INTERVAL_MS){
  const uid = String(userId || '');
  if (!uid || scheduled.has(uid)) return;
  scheduled.add(uid);

  setInterval(async () => {
    try{
      const s = await getUserSettings(repo, uid).catch(() => ({}));
      const sinceISO = typeof s.lastDeltaAt === 'string' && s.lastDeltaAt ? s.lastDeltaAt : new Date(Date.now() - 6*60*60*1000).toISOString(); // 6h baseline
      // Poll a couple of pages per run to be light on rate limits. [Trakt updates guidance]
      const pagesToCheck = 2;
      let changed = false;

      for (let p=1; p<=pagesToCheck; p++){
        const m = await fetchUpdatedMoviesSince({ userId: uid, sinceISO, page: p, limit: 100 }).catch(() => []);
        if (Array.isArray(m) && m.length) changed = true;
        const sh = await fetchUpdatedShowsSince({ userId: uid, sinceISO, page: p, limit: 100 }).catch(() => []);
        if (Array.isArray(sh) && sh.length) changed = true;
        if (!Array.isArray(m) || m.length < 100) { /* likely last page */ }
        if (!Array.isArray(sh) || sh.length < 100) { /* likely last page */ }
      }

      if (changed){
        clearUserCatalogCache(uid); // only purge when there were updates [cache best practice]
      }
      // Move the watermark forward after the run
      await updateUserSettings(repo, uid, { lastDeltaAt: new Date().toISOString() }).catch(()=>{});
    }catch{
      // swallow to keep interval alive
    }
  }, Math.max(60*1000, Number(intervalMs) || DEFAULT_INTERVAL_MS));
}

module.exports = { ensureDeltaScheduleForUser, clearUserCatalogCache };
