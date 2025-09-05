// src/services/addonService.js
const { repo } = require('../db/repo');
const { getUserListItems } = require('../services/traktService'); // should request extended=full so items include genres/released where available [Trakt API]
const { cache, k } = require('../utils/cache');
// Optional settings reader (graceful fallback)
let getUserSettings = null;
try { ({ getUserSettings } = require('../state/userSettings')); }
catch { getUserSettings = async () => ({ addonName: 'Trakt Lists', catalogPrefix: '', hideUnreleasedAll: false }); }
// Optional delta scheduler (safe no‑op if module missing)
let ensureDeltaScheduleForUser = () => {};
try { ({ ensureDeltaScheduleForUser } = require('../services/deltaRefresh')); } catch { ensureDeltaScheduleForUser = () => {}; }
// Canonical genres (safe fallback if constants file missing)
let GENRES = [
  'Action','Adventure','Animation','Comedy','Crime','Documentary','Drama',
  'Family','Fantasy','History','Horror','Music','Mystery','Romance',
  'Science Fiction','Thriller','War','Western'
];
try { ({ GENRES } = require('../constants/genres')); } catch {}
const PAGE_SIZE = 100;
function round1(val){ return (typeof val === 'number' && isFinite(val)) ? Math.round(val * 10)/10 : undefined; }

// Normalized genre canonicalization (maps variants to a stable form)
function mapGenre(input){
  if (!input) return null; // [unchanged]
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
  return s.split(' ').map(w => w
    ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    : w
  ).join(' ');
}

// Robust alias matching
const GENRE_ALIASES = new Map([
  ['science fiction',['science fiction','science-fiction','sci fi','sci-fi','scifi','sci fi & fantasy','sci-fi & fantasy']],
  ['action',['action','action & adventure','actions']],
  ['adventure',['adventure','action & adventure']],
  ['animation',['animation','animated']],
  ['crime',['crime']],
  ['documentary',['documentary','doc']],
  ['drama',['drama']],
  ['family',['family']],
  ['fantasy',['fantasy','sci-fi & fantasy']],
  ['history',['history','historical']],
  ['horror',['horror']],
  ['music',['music','musical']],
  ['mystery',['mystery']],
  ['romance',['romance']],
  ['thriller',['thriller']],
  ['war',['war']],
  ['western',['western']]
]);

function norm(s){ return String(s||'').toLowerCase().replace(/[_\-]+/g,' ').replace(/\s+/g,' ').trim(); }
function canon(s){
  const m = mapGenre(s) || '';
  const n = norm(m || s);
  if (/(^| )sci( fi)?( |$)/.test(n) || /science fiction/.test(n)) return 'science fiction';
  return n;
}

function genreMatch(metaGenres, target){
  if (!Array.isArray(metaGenres) || !metaGenres.length || !target) return false;
  const tgt = canon(target);
  const aliases = new Set([tgt, ...(GENRE_ALIASES.get(tgt)||[])].map(norm));
  for (const g of metaGenres){
    const cg = canon(g);
    if (aliases.has(cg)) return true;
  }
  // loose contains for labels like "sci-fi & fantasy"
  for (const g of metaGenres){
    const cg = canon(g);
    for (const a of aliases){ if (cg.includes(a)) return true; }
  }
  return false;
}

// ---------- NEW: unlimited AND/OR parser used by applyFilters ----------
function genreSlug(s) {
  const t = mapGenre(String(s || '')) || '';
  return t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
function parseGenreGroups(input) {
  if (!input) return [];
  const cleaned = String(input).replace(/[()]/g, '');
  return cleaned
    .split(/\s*\+\s*/g)               // AND groups
    .map(seg =>
      seg
        .split(/\s*,\s*/g)            // OR terms within a group
        .map(genreSlug)
        .filter(Boolean)
    )
    .filter(group => group.length > 0);
}
function makeAndOrPredicate(andGroups) {
  if (!andGroups.length) return () => true;
  return (itemGenres = []) => {
    const set = new Set((Array.isArray(itemGenres) ? itemGenres : []).map(genreSlug));
    return andGroups.every(orGroup => orGroup.some(g => set.has(g)));
  };
}
// ----------------------------------------------------------------------

function applyFilters(metas, extras = {}){
  let out = metas.slice();
  const raw = String(extras.genre || '').trim();
  const yMin = Number(extras.yearMin) || undefined;
  const yMax = Number(extras.yearMax) || undefined;
  const rMin = Number(extras.ratingMin) || undefined;
  const rMax = Number(extras.ratingMax) || undefined;

  // Only apply genre filter if metas expose genres; never nuke the list solely due to metadata gaps
  const anyGenresExposed = out.some(m => Array.isArray(m.genres) && m.genres.length);

  if (anyGenresExposed && raw) {
    // NEW: unified unlimited AND/OR parsing (supports "A + B + C" and "A + (B,C)")
    const groups = parseGenreGroups(raw);
    if (groups.length) {
      const mustMatch = makeAndOrPredicate(groups);
      const before = out.length;
      out = out.filter(m => mustMatch(m.genres || []));
      // If everything was filtered out and we used AND, keep empty (true intersection), do not fall back to OR
    } else {
      // Fallback single-genre (bug fix: pass string, not array)
      const single = genreSlug(raw);
      if (single) {
        const matchCanon = (arr, c) => {
          if (!Array.isArray(arr) || !arr.length || !c) return false;
          const canonArr = Array.from(new Set(arr.map(x => genreSlug(x)).filter(Boolean)));
          return canonArr.some(g => g === c || g.includes(c));
        };
        out = out.filter(m => matchCanon(m.genres, single));
      }
    }
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
  // Background delta refresh (no‑op if scheduler missing)
  ensureDeltaScheduleForUser(userId); // polls Trakt “updated since” and purges caches on change
  // Settings → manifest naming
  const s = await getUserSettings(repo, userId).catch(() => ({ addonName: 'Trakt Lists', catalogPrefix: '' }));
  const addonName = s?.addonName || baseManifest.name || 'Trakt Lists';
  const prefix = (s?.catalogPrefix || '').trim();
  const customType = (prefix || addonName).replace(/\s+/g, '').replace(/[^A-Za-z0-9]/g, '') || 'MyTrakt';

  // Catalogs with published genre options so Stremio shows native picker
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
        { name: 'genre', isRequired: false, options: GENRES }, // Stremio genre extra
        { name: 'yearMin', isRequired: false },
        { name: 'yearMax', isRequired: false },
        { name: 'ratingMin', isRequired: false },
        { name: 'ratingMax', isRequired: false }
      ],
      __listType: l.type
    }));

  const types = [customType];
  const resources = Array.isArray(baseManifest.resources) && baseManifest.resources.length
    ? baseManifest.resources
    : ['catalog', { name: 'meta', types: ['movie','series'], idPrefixes: ['tt'] }];

  const manifest = { ...baseManifest, name: addonName, resources, types, catalogs };

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
  // Pull enough pages to serve PAGE_SIZE starting at skip
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

    // Defaults from saved list if extras missing (include genre/ranges)
    const effExtras = { ...extras };
    if (!effExtras.sort && l.sortBy) effExtras.sort = l.sortBy;
    if (!effExtras.order && l.sortOrder) effExtras.order = l.sortOrder;
    if (!effExtras.genre && l.genre) effExtras.genre = l.genre;
    if (!effExtras.yearMin && l.yearMin) effExtras.yearMin = l.yearMin;
    if (!effExtras.yearMax && l.yearMax) effExtras.yearMax = l.yearMax;
    if (!effExtras.ratingMin && l.ratingMin) effExtras.ratingMin = l.ratingMin;
    if (!effExtras.ratingMax && l.ratingMax) effExtras.ratingMax = l.ratingMax;

    // Hide unreleased movies (per-list OR global)
    let settings = {};
    try { settings = await getUserSettings(repo, userId); } catch {}
    const hideUnreleased = !!(l.hideUnreleased) || !!(settings && settings.hideUnreleasedAll);
    const now = Date.now();

    // Is this a “narrowing” query requiring filter-aware pagination?
    const hasNarrowing =
      (effExtras.genre && String(effExtras.genre).trim()) ||
      effExtras.yearMin || effExtras.yearMax || effExtras.ratingMin || effExtras.ratingMax;

    const MAX_PAGES = 10; // safety cap (1000 items)
    const LIMIT = 100;

    if (hasNarrowing){
      // Filter-aware pagination: gather across pages, apply filters on each chunk, and accumulate
      let filteredPool = [];
      for (let page=1; page<=MAX_PAGES; page++){
        const raw = await getUserListItems({ userId, urlOrSlug: l.url, stremioType: l.type, limit: LIMIT, page }).catch(() => []);
        const arr = Array.isArray(raw) ? raw : [];
        if (!arr.length) break;

        const pruned = hideUnreleased
          ? arr.filter(it => {
              if (it.type !== 'movie') return true;
              const relISO = it.movie && it.movie.released ? String(it.movie.released) : '';
              const relMs = Date.parse(relISO);
              return !Number.isFinite(relMs) || relMs <= now;
            })
          : arr;

        const metasChunk = [];
        for (const it of pruned){
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
          metasChunk.push({
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

        const filteredChunk = applyFilters(metasChunk, effExtras);
        filteredPool = filteredPool.concat(filteredChunk);

        if (filteredPool.length >= (Number(skip) || 0) + PAGE_SIZE) break;
      }

      if (effExtras.sort) filteredPool = applySort(filteredPool, effExtras.sort, effExtras.order);
      const pageSlice = filteredPool.slice(Number(skip) || 0, (Number(skip) || 0) + PAGE_SIZE);
      const result = { metas: pageSlice };
      cache.set(cacheKey, { ...result, _cachedAt: new Date().toISOString() });
      return { ...result, _cached: false, _cachedAt: new Date().toISOString() };
    } else {
      const items = await fetchTraktSlice({
        userId,
        urlOrSlug: l.url,
        stremioType: l.type,
        skip: Math.max(0, Number(skip) || 0)
      });

      const pruned = hideUnreleased
        ? items.filter(it => {
            if (it.type !== 'movie') return true;
            const relISO = it.movie && it.movie.released ? String(it.movie.released) : '';
            const relMs = Date.parse(relISO);
            return !Number.isFinite(relMs) || relMs <= now;
          })
        : items;

      const metas = [];
      for (const it of pruned){
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
    }
  }catch{
    const fallback = { metas: [] };
    cache.set(cacheKey, { ...fallback, _cachedAt: new Date().toISOString() });
    return { ...fallback, _cached: false, _cachedAt: new Date().toISOString() };
  }
}

module.exports = { buildUserManifest, getCatalog };
