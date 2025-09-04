// src/routes/config.js
const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { authRequired } = require('../middleware/auth');
const { repo, ensureAddonToken } = require('../db/repo');
const { bumpManifestVersion } = require('../db/version');
const { v4: uuidv4 } = require('uuid');
const cfg = require('../config');
const { validateListExists, getUserListItems } = require('../services/traktService');
const { cache } = require('../utils/cache');
const { getUserSettings, updateUserSettings } = require('../state/userSettings');

const router = express.Router();
router.use(authRequired);

// For validate-list/preview-list only
const urlOrSlug = z.string().min(3);

// Coercive list item schema
const typeCoerce = z.preprocess(v => String(v ?? '').toLowerCase(), z.enum(['movie', 'series']));
const listItemLoose = z.object({
  id: z.preprocess(v => (v == null || v === '') ? undefined : String(v), z.string().optional()),
  name: z.string().trim().min(1),
  url: z.string().trim().optional().default(''),
  type: typeCoerce,
  sortBy: z.string().trim().optional(),
  sortOrder: z.string().trim().optional(),
  enabled: z.coerce.boolean().optional(),
  order: z.coerce.number().int().optional(),
  hideUnreleased: z.coerce.boolean().optional() // NEW
});

// Save payload: lists/settings both optional
const saveSchema = z.object({
  body: z.object({
    lists: z.array(listItemLoose).optional(),
    catalogPrefix: z.string().optional(),
    addonName: z.string().optional(),
    hideUnreleasedAll: z.coerce.boolean().optional() // NEW
  })
});

function clearUserCatalogCache(userId) {
  const prefix = `${userId}:catalog:`;
  cache.keys().forEach(key => { if (key.startsWith(prefix)) cache.del(key); });
}

// GET /config — return lists + settings
router.get('/config', async (req, res) => {
  try{
    const lists = await repo.getLists(req.user.id);
    const settings = await getUserSettings(repo, req.user.id).catch(() => ({}));
    res.json({
      lists,
      catalogPrefix: settings.catalogPrefix || '',
      addonName: settings.addonName || 'Trakt Lists',
      hideUnreleasedAll: !!settings.hideUnreleasedAll // NEW
    });
  }catch(e){
    res.status(500).json({ error: 'load_config_failed' });
  }
});

// POST /config — save lists and/or settings
router.post('/config', validate(saveSchema), async (req, res) => {
  const { lists, catalogPrefix, addonName, hideUnreleasedAll } = req.validated.body || {};

  // For cache invalidation on global toggle change
  const before = await getUserSettings(repo, req.user.id).catch(() => ({}));
  const beforeFlag = !!before.hideUnreleasedAll;

  if (Array.isArray(lists)) {
    const existing = await repo.getLists(req.user.id).catch(() => []);
    const maxOrder = existing.reduce((m, r) => Number.isInteger(r.order) ? Math.max(m, r.order) : m, -1);
    let nextOrder = maxOrder + 1;
    const normalized = lists.map((l) => ({
      id: (l.id && typeof l.id === 'string' && l.id) ? l.id : undefined,
      name: (l.name || '').trim(),
      url: typeof l.url === 'string' ? l.url.trim() : '',
      type: l.type === 'series' ? 'series' : 'movie',
      sortBy: l.sortBy || '',
      sortOrder: l.sortOrder || '',
      enabled: typeof l.enabled === 'boolean' ? l.enabled : true,
      order: Number.isInteger(l.order) ? l.order : (nextOrder++),
      hideUnreleased: !!l.hideUnreleased
    }));
    const bad = normalized
      .map((r, i) => ({ i, ok: r.name.length >= 1 && r.url.length >= 3 }))
      .filter(x => !x.ok).map(x => x.i);
    if (bad.length) return res.status(400).json({ ok: false, error: 'invalid_rows', rows: bad });
    await repo.saveLists(req.user.id, normalized);
    clearUserCatalogCache(req.user.id); // lists changed
  }

  // Persist provided settings; ignore undefined keys
  let changedGlobal = false;
  if (
    typeof catalogPrefix === 'string' ||
    typeof addonName === 'string' ||
    typeof hideUnreleasedAll === 'boolean'
  ) {
    await updateUserSettings(repo, req.user.id, { catalogPrefix, addonName, hideUnreleasedAll }); // NEW
    if (typeof hideUnreleasedAll === 'boolean') {
      changedGlobal = beforeFlag !== hideUnreleasedAll;
    }
  }

  if (changedGlobal) {
    clearUserCatalogCache(req.user.id); // global filter changed => purge caches
  }

  await bumpManifestVersion(req.user.id);
  res.json({ ok: true });
});

// Validate list (quick checks)
const validateSchema = z.object({ body: z.object({ url: urlOrSlug, type: z.enum(['movie','series']) }) });
router.post('/validate-list', validate(validateSchema), async (req, res) => {
  const { url, type } = req.validated.body;
  try {
    const exists = await validateListExists(url);
    if (!exists.ok) return res.status(400).json({ ok: false, error: 'invalid_list' });
    const items = await getUserListItems({ userId: req.user.id, urlOrSlug: url, stremioType: type, limit: 1 });
    return res.json({ ok: true, count: Array.isArray(items) ? items.length : 0 });
  } catch {
    return res.status(400).json({ ok: false, error: 'validation_failed' });
  }
});

router.post('/validate-all', async (req, res) => {
  try {
    const lists = await repo.getLists(req.user.id);
    const out = [];
    for (const l of (lists || [])) {
      try {
        const r = await validateListExists(l.url || '');
        out.push({ id: l.id, name: l.name, ok: !!r.ok });
      } catch {
        out.push({ id: l.id, name: l.name, ok: false });
      }
    }
    const ok = out.filter(x => x.ok).length;
    res.json({ total: out.length, ok, failed: out.length - ok, results: out });
  } catch (e) {
    res.status(500).json({ error: 'validate_all_failed' });
  }
});

// Preview (unchanged core)
const previewSchema = z.object({
  body: z.object({
    url: urlOrSlug,
    type: z.enum(['movie','series']),
    extras: z.object({
      sort: z.string().optional(),
      order: z.string().optional(),
      genre: z.string().optional(),
      yearMin: z.string().optional(),
      yearMax: z.string().optional(),
      ratingMin: z.string().optional(),
      ratingMax: z.string().optional()
    }).optional()
  })
});

function mapGenre(input) {
  if (!input) return null;
  const s = String(input).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
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
  return s.split(' ').map(w => w ? w.toUpperCase() + w.slice(1).toLowerCase() : w).join(' ');
}

function applyPreviewFilters(items, extras = {}) {
  let out = items.slice();
  const genre = String(extras.genre || '').trim();
  const yMin = Number(extras.yearMin) || undefined;
  const yMax = Number(extras.yearMax) || undefined;
  const rMin = Number(extras.ratingMin) || undefined;
  const rMax = Number(extras.ratingMax) || undefined;
  if (genre) {
    const g = mapGenre(genre);
    out = out.filter(it => {
      const core = it[it.type];
      const arr = Array.isArray(core?.genres) ? core.genres : [];
      return arr.some(x => mapGenre(x) === g);
    });
  }
  if (yMin) out = out.filter(it => (Number(it[it.type]?.year)||0) >= yMin);
  if (yMax) out = out.filter(it => (Number(it[it.type]?.year)||0) <= yMax);
  if (rMin) out = out.filter(it => (typeof it[it.type]?.rating === 'number' ? it[it.type]?.rating : 0) >= rMin);
  if (rMax) out = out.filter(it => (typeof it[it.type]?.rating === 'number' ? it[it.type]?.rating : 0) <= rMax);
  return out;
}

function applyPreviewSort(items, sort, order) {
  const dir = (String(order||'desc').toLowerCase()==='asc') ? 1 : -1;
  const s = String(sort||'').toLowerCase();
  const arr = items.slice();
  if (s === 'rating') arr.sort((a,b) => (((a[a.type]?.rating)||0) - ((b[b.type]?.rating)||0)) * dir);
  else if (s === 'year') arr.sort((a,b) => (((a[a.type]?.year)||0) - ((b[b.type]?.year)||0)) * dir);
  else if (s === 'runtime') arr.sort((a,b) => (((a[a.type]?.runtime)||0) - ((b[b.type]?.runtime)||0)) * dir);
  else if (s === 'name') arr.sort((a,b) => String(a[a.type]?.title||'').localeCompare(String(b[b.type]?.title||'')) * dir);
  return arr;
}

router.post('/preview-list', validate(previewSchema), async (req, res) => {
  const { url, type, extras } = req.validated.body;
  try {
    const exists = await validateListExists(url);
    if (!exists.ok) return res.status(400).json({ error: 'invalid_list' });
    let items = await getUserListItems({ userId: req.user.id, urlOrSlug: url, stremioType: type, limit: 50 });
    items = applyPreviewFilters(items || [], extras || {});
    if (extras?.sort) items = applyPreviewSort(items, extras.sort, extras.order);
    const previews = (items || []).slice(0, 25).map(it => {
      const core = it[it.type];
      return { title: core?.title, year: core?.year, ids: core?.ids, rating: core?.rating, runtime: core?.runtime, genres: core?.genres };
    });
    return res.json({ previews });
  } catch {
    return res.status(400).json({ error: 'preview_failed' });
  }
});

// Delete list
router.delete('/config/:id', async (req, res) => {
  const lists = await repo.getLists(req.user.id);
  const next = lists.filter(l => l.id !== req.params.id);
  await repo.saveLists(req.user.id, next);
  clearUserCatalogCache(req.user.id);
  await bumpManifestVersion(req.user.id);
  res.json({ ok: true });
});

// Addon info (tokenized manifest link)
router.get('/addon-info', async (req, res) => {
  const lists = await repo.getLists(req.user.id);
  const enabled = lists.filter(l => l.enabled).length;
  const token = await ensureAddonToken(req.user.id);
  const base = `${cfg.baseUrl}/u/${req.user.id}/manifest.json`;
  const tokenized = `${base}?t=${token}`;
  res.json({
    manifestUrl: tokenized,
    enabledCatalogs: enabled,
    stremioLink: `stremio://${encodeURIComponent(tokenized)}`
  });
});

module.exports = router;
