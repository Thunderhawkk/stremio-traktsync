const { repo } = require('../db/repo');
const { getCatalog, buildUserManifest } = require('./addonService');

const report = { lastRun: null, issues: [] };

function reset() { report.lastRun = new Date().toISOString(); report.issues = []; }

function analyzeMetas(userId, catalogId, metas) {
  let missRating = 0, missRuntime = 0, missGenres = 0;
  for (const m of metas) {
    if (typeof m.imdbRating !== 'number') missRating++;
    if (!Number.isFinite(m.runtime)) missRuntime++;
    if (!Array.isArray(m.genres) || m.genres.length === 0) missGenres++;
  }
  const total = metas.length || 1;
  const missing = [];
  if (missRating / total > 0.5) missing.push('imdbRating');
  if (missRuntime / total > 0.5) missing.push('runtime');
  if (missGenres / total > 0.5) missing.push('genres');
  if (missing.length) report.issues.push({ userId, catalogId, missing, count: total });
}

async function runQualitySweepAll() {
  reset();
  const cfg = require('../config');
  const fs = require('fs');
  const path = require('path');
  const dir = (cfg.db && cfg.db.dataDir) || '.data';
  const ids = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => path.basename(f, '.json')) : [];
  for (const userId of ids) {
    try {
      const base = {
        id: 'org.example.trakt',
        version: 'quality',
        name: 'quality',
        description: '',
        resources: ['catalog', { name: 'meta', types: ['movie','series'], idPrefixes: ['tt'] }],
        types: ['movie','series'],
        idPrefixes: ['tt'],
        catalogs: []
      };
      const manifest = await buildUserManifest({ userId, baseManifest: base });
      for (const c of (manifest.catalogs || [])) {
        const res = await getCatalog({ userId, type: c.type, catalogId: c.id, skip: 0, extras: {} });
        analyzeMetas(userId, c.id, res.metas || []);
      }
    } catch {}
  }
  report.lastRun = new Date().toISOString();
  return report;
}

function getReport() { return report; }

module.exports = { runQualitySweepAll, getReport };
