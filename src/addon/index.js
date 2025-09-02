// src/addon/index.js
const { addonBuilder } = require('stremio-addon-sdk');
const { buildUserManifest, getCatalog } = require('../services/addonService');
const { repo } = require('../db/repo');
const { getUserSettings } = require('../state/userSettings');
const { readManifestVersion } = require('../db/version');

function createAddonForUser(userId) {
  const baseManifest = {
    id: 'org.example.trakt',
    version: '1.0.0',
    name: 'Trakt Lists (Multi-tenant)',
    description: 'Per-user Trakt lists addon',
    resources: ['catalog'],
    types: ['movie', 'series'],
    idPrefixes: ['tt', 'trakt'],
    catalogs: []
  };

  const builder = new addonBuilder(baseManifest);

  builder.defineManifestHandler(async () => {
    const manifest = await buildUserManifest({ userId, baseManifest });

    // semver for Stremio
    const semver = await readManifestVersion(userId);

    // defensive overlay (buildUserManifest already applied, but keep guard)
    let addonName = manifest.name || 'Trakt Lists';
    let catalogPrefix = addonName;
    try {
      const s = await getUserSettings(repo, userId);
      addonName = s?.addonName || addonName;
      catalogPrefix = (s?.catalogPrefix || '').trim() || addonName;
    } catch {}

    const patched = {
      ...manifest,
      version: semver,
      name: addonName,
      catalogs: (manifest.catalogs || []).map(c => ({ ...c, name: c.name || catalogPrefix }))
    };
    return patched; // top-level manifest object
  });

  builder.defineCatalogHandler(async (args) => {
    return await getCatalog({ userId, type: args.type, catalogId: args.id });
  });

  return builder.getInterface();
}

module.exports = { createAddonForUser };
