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
const urlOrSlug = z.string().min(3); // independent from save schema [12]

// Coercive list item schema: trim strings, coerce booleans/numbers, lowercase type. [1][12]
const typeCoerce = z.preprocess(v => String(v ?? '').toLowerCase(), z.enum(['movie', 'series'])); // movie|series [12]
const listItemLoose = z.object({
  id: z.preprocess(v => (v == null || v === '') ? undefined : String(v), z.string().optional()), // normalize to UUID later [12]
  name: z.string().trim().min(1),                 // trim + min chaining on ZodString [1][12]
  url: z.string().trim().optional().default(''),  // allow drafts (empty) and trim [12]
  type: typeCoerce,                                // "Movie"/"Series" -> movie/series [12]
  sortBy: z.string().trim().optional(),
  sortOrder: z.string().trim().optional(),
  enabled: z.coerce.boolean().optional(),          // "true"/"false" -> boolean [12]
  order: z.coerce.number().int().optional()        // "0","1" -> number [12]
});

// Save payload: lists/settings both optional so client can save either. [12]
const saveSchema = z.object({
  body: z.object({
    lists: z.array(listItemLoose).optional(),
    catalogPrefix: z.string().optional(),
    addonName: z.string().optional()
  })
});

function clearUserCatalogCache(userId) {
  const prefix = `${userId}:catalog:`;
  cache.keys().forEach(key => { if (key.startsWith(prefix)) cache.del(key); });
}

// GET /config — return lists + settings for UI. [11]
router.get('/config', async (req, res) => {
  const lists = await repo.getLists(req.user.id);
  const settings = await getUserSettings(repo, req.user.id).catch(() => ({ addonName: 'Trakt Lists', catalogPrefix: '' }));
  res.json({
    lists,
    catalogPrefix: settings.catalogPrefix || '',
    addonName: settings.addonName || 'Trakt Lists'
  });
});

// POST /config — single consolidated route to save lists and/or settings. [11]
router.post('/config', validate(saveSchema), async (req, res) => {
  try {
    const { lists, catalogPrefix, addonName } = req.validated.body || {};

    // 1) Save lists if provided
    if (Array.isArray(lists)) {
      // Use existing to compute stable order for new rows. [12]
      const existing = await repo.getLists(req.user.id).catch(() => []);
      const maxOrder = existing.reduce((m, r) => Number.isInteger(r.order) ? Math.max(m, r.order) : m, -1);
      let nextOrder = maxOrder + 1;

      // Normalize every row before persisting. [12]
      const normalized = lists.map((l) => {
        const uuidOk = z.string().uuid().safeParse(l.id).success; // runtime check, not schema gate [12]
        return {
          id: uuidOk ? l.id : uuidv4(),
          name: (l.name || '').trim(),
          url: typeof l.url === 'string' ? l.url.trim() : '',
          type: l.type === 'series' ? 'series' : 'movie',
          sortBy: l.sortBy || '',
          sortOrder: l.sortOrder || '',
          enabled: typeof l.enabled === 'boolean' ? l.enabled : true,
          order: Number.isInteger(l.order) ? l.order : (nextOrder++)
        };
      });

      // Reject truly invalid rows (missing essential fields) with a precise 400. [12]
      const bad = normalized
        .map((r, i) => ({ i, ok: r.name.length >= 1 && r.url.length >= 3 }))
        .filter(x => !x.ok)
        .map(x => x.i);
      if (bad.length) {
        return res.status(400).json({ ok: false, error: 'invalid_rows', rows: bad });
      }

      await repo.saveLists(req.user.id, normalized);
      clearUserCatalogCache(req.user.id);
    }

    // 2) Save settings if provided
    if (typeof catalogPrefix === 'string' || typeof addonName === 'string') {
      await updateUserSettings(repo, req.user.id, { catalogPrefix, addonName });
    }

    // 3) Always bump so Stremio refetches the manifest. [12]
    await bumpManifestVersion(req.user.id);

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'save_failed' });
  }
});

// Validate list (unchanged logic for quick checks). [12]
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

// Delete list (unchanged)
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
