// src/db/version.js
// Stores a numeric manifest revision and exposes semver "1.0.<rev>" for Stremio.

const { repo } = require('./repo'); // adjust if needed
const mem = new Map(); // fallback when repo lacks config methods

async function readRev(userId){
  // Prefer repo.getConfig manifestRev when available
  try {
    if (typeof repo.getConfig === 'function') {
      const cfg = await repo.getConfig(userId);
      if (typeof cfg?.manifestRev === 'number') return cfg.manifestRev;
      // Migrate old stored version "39" to rev 39
      if (typeof cfg?.manifestVersion === 'string' && /^\d+$/.test(cfg.manifestVersion)) {
        return Number(cfg.manifestVersion);
      }
      if (typeof cfg?.manifestVersion === 'string' && /^\d+\.\d+\.\d+$/.test(cfg.manifestVersion)) {
        const m = cfg.manifestVersion.match(/^\d+\.\d+\.(\d+)$/);
        if (m) return Number(m[1]);
      }
    }
  } catch {}
  return mem.get(userId) || 0;
}

async function writeRev(userId, rev){
  try {
    if (typeof repo.updateConfig === 'function') {
      // Keep both for clarity
      await repo.updateConfig(userId, { manifestRev: rev, manifestVersion: `1.0.${rev}` });
    }
  } catch {}
  mem.set(userId, rev);
}

async function readManifestVersion(userId){
  const rev = await readRev(userId);
  return `1.0.${rev}`;
}

async function bumpManifestVersion(userId){
  const next = (await readRev(userId)) + 1;
  await writeRev(userId, next);
  return `1.0.${next}`;
}

module.exports = {
  readManifestVersion,
  bumpManifestVersion,
  getManifestVersion: readManifestVersion // alias for legacy imports
};
