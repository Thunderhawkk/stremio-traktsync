// src/services/addonService.js
const { repo } = require('../db/repo');
const { getUserListItems } = require('../services/traktService'); // Trakt fetcher returns list items with extended fields (e.g., movie.released) [Trakt API]
const { cache, k } = require('../utils/cache');

// Optional settings reader (graceful fallback)
let getUserSettings = null;
try { ({ getUserSettings } = require('../state/userSettings')); }
catch { getUserSettings = async () => ({ addonName: 'Trakt Lists', catalogPrefix: '', hideUnreleasedAll: false }); }

const PAGE_SIZE = 100;

function round1(val){ return (typeof val === 'number' && isFinite(val)) ? Math.round(val * 10)/10 : undefined; }

// Robust, normalized genre mapping (unchanged)
function mapGenre(input){
  if (!input) return null;
  const s = String(input).replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();
  if (!s) return null;
  const l = s.toLowerCase();
  if (l.includes('sci') && (l.includes('fi') || l.includes('fiction'))) return 'Science Fiction';
  if (l.includes('comedy')) return 'Comedy';
  if (l.includes('drama')) return 'Drama';
  if (l.includes('romance')) return 'Romance';
  if (l.includes('family')) return 'Family';
  if (l.includes('action')) return 'Action';
  if (l.includes('adventure')) return 'Adventure';
  if (l.includes('animation')) return 'Animation';
  if (l.includes('crime')) return 'Crime';
  if (l.includes('documentary')) return 'Documentary';
  if (l.includes('fantasy')) return 'Fantasy';
  if (l.includes('history')) return 'History';
  if (l.includes('horror')) return 'Horror';
  if (l.includes('music')) return 'Music';
  if (l.includes('mystery')) return 'Mystery';
  if (l.includes('thriller')) return 'Thriller';
  if (l.includes('war')) return 'War';
  if (l.includes('western')) return 'Western';
  let t = s;
  let m = t.match(/^([A-Z]+)([a-z]+)$/);
  if (m) { const upper = m[3], lower = m[4]; if (lower === upper.slice(1).toLowerCase()) t = upper; }
  m = t.match(/^([A-Z][A-Z ]+)([a-z][a-z ]+)$/);
  if (m) {
    const upper = m[3], lower = m[4];
    if (upper.slice(1).toLowerCase().replace(/\s+/g,' ') === lower.toLowerCase().replace(/\s+/g,' ')) t = upper;
  }
  return t.split(' ').map(w => w ? w.toUpperCase() + w.slice(1).toLowerCase() : w).join(' ');
}

function applyFilters(metas, extras = {}){
  let out = metas.slice();
  const genre = String(extras.genre || '').trim();
  const yMin = Number(extras.yearMin) || undefined;
  const yMax = Number(extras.yearMax) || undefined;
  const rMin = Number(extras.ratingMin) || undefined;
  const rMax = Number(extras.ratingMax) || undefined;

  if (genre){
    const g = mapGenre(genre);
    out = out.filter(m => Array.isArray(m.genres) && m.genres.some(x => mapGenre(x) === g));
  }
  if (yMin) out = out.filter(m => Number(m.releaseInfo) ? Number(m.releaseInfo) >= yMin : true);
  if (yMax) out = out.filter(m => Number(m.releaseInfo) ? Number(m.releaseInfo) <= yMax : true);
  if (rMin) out = out.filter(m => typeof m.imdbRating === 'number' ? m.imdbRating >= rMin : true);
  if (rMax) out = out.filter(m => typeof m.imdbRating === 'number' ? m.imdbRating <= rMax : true);

  return out;
}

function applySort(metas, sort, order){
  const dir = (String(order||'desc').toLowerCase()==='asc') ? 1 : -1;
  const s = String(sort||'').toLowerCase();
  const arr = metas.slice();
  if (s === 'rating') arr.sort((a,b) => ((a.imdbRating||0)-(b.imdbRating||0)) * dir);
  else if (s === 'year') arr.sort((a,b) => ((Number(a.releaseInfo)||0)-(Number(b.releaseInfo)||0)) * dir);
  else if (s === 'runtime') arr.sort((a,b) => ((a.runtime||0)-(b.runtime||0)) * dir);
  else if (s === 'name') arr.sort((a,b) => (String(a.name||'')).localeCompare(String(b.name||'')) * dir);
  return arr;
}

// Make a safe label for manifest.types (left selector label)
function toTypeLabel(input){
  const raw = String(input || '').trim() || 'MyTrakt';
  const noSpaces = raw.replace(/\s+/g, '');
  return noSpaces.replace(/[^A-Za-z0-9]/g, '') || 'MyTrakt';
}

async function buildUserManifest({ userId, baseManifest }){
  const lists = await repo.getLists(userId);

  // Read settings to determine top-level name and the custom catalog group label.
  const s = await getUserSettings(repo, userId).catch(() => ({ addonName: 'Trakt Lists', catalogPrefix: '' }));
  const addonName = s?.addonName || baseManifest.name || 'Trakt Lists';
  const prefix = (s?.catalogPrefix || '').trim();
  const customType = (prefix || addonName).replace(/\s+/g, '').replace(/[^A-Za-z0-9]/g, '') || 'MyTrakt';

  // Build catalogs under a single custom type for a grouped left selector entry
  // IMPORTANT: catalog.name is only the list name to avoid prefix duplication in Home
  const catalogs = (lists || [])
    .filter(l => l.enabled)
    .map(l => ({
      type: customType,
      id: l.id,
      name: l.name || 'List',
      extra: [
        { name: 'skip', isRequired: false },
        { name: 'sort', isRequired: false, options: ['rating','year','runtime','name'] },
        { name: 'order', isRequired: false, options: ['asc','desc'] },
        { name: 'genre', isRequired: false },
        { name: 'yearMin', isRequired: false },
        { name: 'yearMax', isRequired: false },
        { name: 'ratingMin', isRequired: false },
        { name: 'ratingMax', isRequired: false }
      ],
      __listType: l.type
    }));

  const types = [customType];

  // Keep meta resource for Cinemeta/meta lookups
  const resources = Array.isArray(baseManifest.resources) && baseManifest.resources.length
    ? baseManifest.resources
    : ['catalog', { name: 'meta', types: ['movie','series'], idPrefixes: ['tt'] }];

  const manifest = {
    ...baseManifest,
    name: addonName,
    resources,
    types,
    catalogs
  };

  // Warm cache page 0 per catalog
  setImmediate(() => {
    try{
      for (const c of catalogs){
        const warmKey = k(userId, `catalog:${c.id}:0:{}`);
        if (!cache.get(warmKey)) getCatalog({ userId, type: c.type, catalogId: c.id, skip: 0, extras: {} }).catch(()=>{});
      }
    }catch{}
  });

  return manifest;
}

async function fetchTraktSlice({ userId, urlOrSlug, stremioType, skip }){
  const pageStart = Math.floor(skip / 100) + 1;
  const offset = skip % 100;
  let out = [];
  const p1 = await getUserListItems({ userId, urlOrSlug, stremioType, limit: 100, page: pageStart });
  const a1 = Array.isArray(p1) ? p1 : [];
  if (offset < a1.length) out = out.concat(a1.slice(offset));
  let nextPage = pageStart + 1;
  while (out.length < PAGE_SIZE) {
    const pn = await getUserListItems({ userId, urlOrSlug, stremioType, limit: 100, page: nextPage });
    const an = Array.isArray(pn) ? pn : [];
    if (!an.length) break;
    out = out.concat(an);
    nextPage += 1;
  }
  return out.slice(0, PAGE_SIZE);
}

async function getCatalog({ userId, type, catalogId, skip = 0, extras = {} }){
  const extrasKey = JSON.stringify({
    sort: extras.sort || undefined,
    order: extras.order || undefined,
    genre: extras.genre || undefined,
    yearMin: extras.yearMin || undefined,
    yearMax: extras.yearMax || undefined,
    ratingMin: extras.ratingMin || undefined,
    ratingMax: extras.ratingMax || undefined
  });
  const cacheKey = k(userId, `catalog:${catalogId}:${skip}:${extrasKey}`);
  const hit = cache.get(cacheKey);
  if (hit) return { ...hit, _cached: true, _cachedAt: hit._cachedAt || new Date().toISOString() };

  try{
    const lists = await repo.getLists(userId);
    const l = (lists || []).find(x => x.id === catalogId && x.enabled);
    if (!l) {
      const empty = { metas: [] };
      cache.set(cacheKey, { ...empty, _cachedAt: new Date().toISOString() });
      return { ...empty, _cached: false, _cachedAt: new Date().toISOString() };
    }

    // Defaults from saved list if extras missing
    const effExtras = { ...extras };
    if (!effExtras.sort && l.sortBy) effExtras.sort = l.sortBy;
    if (!effExtras.order && l.sortOrder) effExtras.order = l.sortOrder;

    // Fetch with the list’s real type (movie/series) so metas are correct
    const items = await fetchTraktSlice({
      userId,
      urlOrSlug: l.url,
      stremioType: l.type,
      skip: Math.max(0, Number(skip) || 0)
    });

    // NEW: hide unreleased movies (per-list OR global setting)
    // Trakt list item for movies includes movie.released (ISO date) with extended=full [Trakt API]
    let settings = {};
    try { settings = await getUserSettings(repo, userId); } catch {}
    const hideUnreleased = !!(l.hideUnreleased) || !!(settings && settings.hideUnreleasedAll);
    const now = Date.now();
    const filteredItems = hideUnreleased
      ? items.filter(it => {
          if (it.type !== 'movie') return true;           // only filter movies
          const relISO = it.movie && it.movie.released ? String(it.movie.released) : '';
          const relMs = Date.parse(relISO);
          // Keep if release date missing/invalid (be permissive) or already released
          return !Number.isFinite(relMs) || relMs <= now;
        })
      : items;

    const metas = [];
    for (const it of filteredItems){
      const core = it[it.type];
      const imdb = core?.ids?.imdb;
      if (!imdb || !/^tt\d+$/i.test(imdb)) continue;

      const name = core.title || '';
      const year = Number.isFinite(core.year) ? core.year : undefined;
      const overview = core.overview || undefined;
      const runtimeMin = Number.isFinite(core.runtime) ? core.runtime : undefined;
      const ratingNum = round1(core.rating);
      const genresRaw = Array.isArray(core.genres) ? core.genres : null;
      const genres = genresRaw && genresRaw.length
        ? Array.from(new Set(genresRaw.map(mapGenre).filter(Boolean)))
        : undefined;
      const releaseInfo = year ? String(year) : undefined;

      metas.push({
        id: imdb,
        type: it.type === 'show' ? 'series' : 'movie',
        name,
        description: overview,
        imdbRating: ratingNum,
        releaseInfo,
        runtime: runtimeMin,
        genres
      });
    }

    let out = applyFilters(metas, effExtras);
    if (effExtras.sort) out = applySort(out, effExtras.sort, effExtras.order);

    const result = { metas: out };
    cache.set(cacheKey, { ...result, _cachedAt: new Date().toISOString() });
    return { ...result, _cached: false, _cachedAt: new Date().toISOString() };
  }catch{
    const fallback = { metas: [] };
    cache.set(cacheKey, { ...fallback, _cachedAt: new Date().toISOString() });
    return { ...fallback, _cached: false, _cachedAt: new Date().toISOString() };
  }
}

module.exports = { buildUserManifest, getCatalog };
