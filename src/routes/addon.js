// src/routes/addon.js
const express = require('express');
const apicache = require('apicache');
const { getAddonToken } = require('../db/repo');
const { getManifestVersion } = require('../db/version'); // alias to readManifestVersion
const { buildUserManifest, getCatalog } = require('../services/addonService');
const { getMeta } = require('../services/metaService');
const { repo } = require('../db/repo');
const path = require('path');

const router = express.Router();
const cacheMw = apicache.middleware;

function baseManifest(version) {
  // version is already semver (e.g., "1.0.39"), keep it as a string
  return {
    id: 'org.example.trakt',
    version: String(version || '1.0.0'),
    name: 'Trakt Lists (Multi-user)',
    description: 'Fast paginated catalogs; meta via Cinemeta+Trakt',
    resources: ['catalog', { name: 'meta', types: ['movie', 'series'], idPrefixes: ['tt'] }],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    catalogs: []
  };
}

async function validateToken(req, _res, userId, tokenFromPath) {
  const queryToken = req.query.t;
  const token = await getAddonToken(userId);
  if (!token) return true;
  const provided = tokenFromPath || queryToken || '';
  return provided === token;
}

function setNoStore(res) { res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0'); res.set('Pragma', 'no-cache'); }
function setNoCache(res) { res.set('Cache-Control', 'no-cache, must-revalidate, max-age=0'); res.set('Pragma', 'no-cache'); }

function parseExtra(extraStr, query) {
  const out = {};
  if (typeof extraStr === 'string' && extraStr.length) {
    extraStr.split('&').forEach(kv => { const [k, v] = kv.split('='); if (k) out[decodeURIComponent(k)] = v ? decodeURIComponent(v) : ''; });
  }
  Object.keys(query || {}).forEach(k => { out[k] = query[k]; });
  return out;
}

router.use('/assets', express.static(path.join(__dirname, '..', 'public', 'landing', 'assets')));

router.get('/:userId/debug.json', async (req, res) => {
  const { userId } = req.params;
  if (!(await validateToken(req, res, userId, null))) return res.status(403).json({ error: 'invalid_token' });
  try {
    const lists = await repo.getLists(userId);
    let settings = {};
    try {
      const { getUserSettings } = require('../state/userSettings');
      settings = await getUserSettings(repo, userId); // pass repo explicitly [12]
    } catch {}
    const mv = await getManifestVersion(userId);
    const manifest = await buildUserManifest({ userId, baseManifest: baseManifest(mv) });
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate'); // always fresh [13]
    res.json({ userId, settings, lists, manifest });
  } catch (e) {
    res.status(500).json({ error: 'debug_failed' });
  }
});

router.get('/install', (req, res, next) => {
  const file = path.join(__dirname, '..', 'public', 'landing', 'index.html'); // absolute path [2]
  res.sendFile(file, err => { if (err) next(err); });
});

// Manifest (token in path)
router.get('/:userId/:t/manifest.json', cacheMw('5 minutes'), async (req, res) => {
  const { userId, t } = req.params;
  if (!(await validateToken(req, res, userId, t))) return res.status(403).json({ error: 'invalid_token' });
  const mv = await getManifestVersion(userId);          // semver string
  const manifest = await buildUserManifest({ userId, baseManifest: baseManifest(mv) });
  setNoStore(res);
  return res.json(manifest);                            // top-level manifest object
});

// Manifest (token via query or no token required)
router.get('/:userId/manifest.json', cacheMw('5 minutes'), async (req, res) => {
  const { userId } = req.params;
  if (!(await validateToken(req, res, userId, null))) return res.status(403).json({ error: 'invalid_token' });
  const mv = await getManifestVersion(userId);
  const manifest = await buildUserManifest({ userId, baseManifest: baseManifest(mv) });
  setNoStore(res);
  return res.json(manifest);
});

// Catalog (extras honored; no cache)
router.get('/:userId/:t/catalog/:type/:catalogId.json', async (req, res) => {
  const { userId, t, type, catalogId } = req.params;
  if (!(await validateToken(req, res, userId, t))) return res.status(403).json({ error: 'invalid_token' });
  const skip = Number(req.query.skip || 0) || 0;
  const extras = parseExtra('', req.query);
  const result = await getCatalog({ userId, type, catalogId, skip, extras });
  setNoCache(res);
  return res.json(result);
});

router.get('/:userId/:t/catalog/:type/:catalogId/:extra.json', async (req, res) => {
  const { userId, t, type, catalogId, extra } = req.params;
  if (!(await validateToken(req, res, userId, t))) return res.status(403).json({ error: 'invalid_token' });
  const extras = parseExtra(extra, req.query);
  const skip = Number(extras.skip || 0) || 0;
  const result = await getCatalog({ userId, type, catalogId, skip, extras });
  setNoCache(res);
  return res.json(result);
});

// Variants without token in path
router.get('/:userId/catalog/:type/:catalogId.json', async (req, res) => {
  const { userId, type, catalogId } = req.params;
  if (!(await validateToken(req, res, userId, null))) return res.status(403).json({ error: 'invalid_token' });
  const extras = parseExtra('', req.query);
  const skip = Number(extras.skip || 0) || 0;
  const result = await getCatalog({ userId, type, catalogId, skip, extras });
  setNoCache(res);
  return res.json(result);
});

router.get('/:userId/catalog/:type/:catalogId/:extra.json', async (req, res) => {
  const { userId, type, catalogId, extra } = req.params;
  if (!(await validateToken(req, res, userId, null))) return res.status(403).json({ error: 'invalid_token' });
  const extras = parseExtra(extra, req.query);
  const skip = Number(extras.skip || 0) || 0;
  const result = await getCatalog({ userId, type, catalogId, skip, extras });
  setNoCache(res);
  return res.json(result);
});

// Meta (no cache)
router.get('/:userId/:t/meta/:type/:id.json', async (req, res) => {
  const { userId, t, type, id } = req.params;
  if (!(await validateToken(req, res, userId, t))) return res.status(403).json({ error: 'invalid_token' });
  const imdb = String(id || '');
  if (!/^tt\d+$/i.test(imdb)) return res.json({ meta: null });
  const result = await getMeta({ userId, type, imdb });
  setNoCache(res);
  return res.json(result);
});

router.get('/:userId/meta/:type/:id.json', async (req, res) => {
  const { userId, type, id } = req.params;
  if (!(await validateToken(req, res, userId, null))) return res.status(403).json({ error: 'invalid_token' });
  const imdb = String(id || '');
  if (!/^tt\d+$/i.test(imdb)) return res.json({ meta: null });
  const result = await getMeta({ userId, type, imdb });
  setNoCache(res);
  return res.json(result);
});

module.exports = router;
