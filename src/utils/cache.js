const NodeCache = require('node-cache');
const cacheRaw = new NodeCache({ stdTTL: 300, checkperiod: 60 });

const stats = { hits: 0, misses: 0, sets: 0, dels: 0, lastWarmAt: null };

const cache = {
  get(key){ const v = cacheRaw.get(key); if(v !== undefined) stats.hits++; else stats.misses++; return v; },
  set(key,val,ttl){ stats.sets++; return cacheRaw.set(key,val,ttl); },
  del(key){ stats.dels++; return cacheRaw.del(key); },
  keys(){ return cacheRaw.keys(); }
};

function k(userId, s){ return `${userId}:${s}`; }
function markWarmed(){ stats.lastWarmAt = new Date().toISOString(); }
function getStats(){ return { ...stats, keys: cacheRaw.keys().length }; }

module.exports = { cache, k, getStats, markWarmed };
