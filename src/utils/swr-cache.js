// src/utils/swr-cache.js
const NodeCache = require('node-cache');
const swr = new NodeCache({ stdTTL: 0, checkperiod: 60 }); // we manage TTLs manually

function getKey(userId, listId, page=1) { return `cat:${userId}:${listId}:${page}`; }

async function getWithSWR({ key, maxAgeSec=60, swrSec=120, revalidateFn }) {
  const now = Date.now();
  const entry = swr.get(key); // { data, ts }
  if (entry) {
    const age = (now - entry.ts)/1000;
    if (age <= maxAgeSec) return { data: entry.data, served:'fresh' };
    if (age > maxAgeSec && age <= (maxAgeSec+swrSec)) {
      // Serve stale, revalidate in background
      revalidateFn().then(data => swr.set(key, { data, ts: Date.now() }, 0)).catch(()=>{});
      return { data: entry.data, served:'stale' };
    }
  }
  // No cache or too old: fetch now
  const data = await revalidateFn();
  swr.set(key, { data, ts: Date.now() }, 0);
  return { data, served:'network' };
}

module.exports = { getWithSWR, getKey };
