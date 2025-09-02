// src/state/userSettings.js
// Safe, merge-only persistence of addonName and catalogPrefix per user.
// Preserves other config keys like lists, trakt tokens, addon tokens.

const fs = require('fs/promises');
const path = require('path');

const DEFAULTS = { addonName: 'Trakt Lists', catalogPrefix: '' }; // UI defaults [kept]
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data', 'user-settings');
const mem = new Map(); // userId -> { addonName, catalogPrefix } cache

async function ensureDir(){ await fs.mkdir(DATA_DIR, { recursive: true }).catch(()=>{}); }
function fileFor(userId){
  const safe = String(userId || '').replace(/[^A-Za-z0-9_-]/g, '');
  return path.join(DATA_DIR, `${safe}.json`);
}

function pickStrings(obj = {}){
  return {
    addonName: typeof obj.addonName === 'string' ? obj.addonName.trim() : undefined,
    catalogPrefix: typeof obj.catalogPrefix === 'string' ? obj.catalogPrefix.trim() : undefined
  };
}

async function getUserSettings(repo, userId){
  // 1) DB path
  try{
    if (repo && typeof repo.getConfig === 'function'){
      const cfg = await repo.getConfig(userId);
      const out = {
        addonName: typeof cfg?.addonName === 'string' ? cfg.addonName : DEFAULTS.addonName,
        catalogPrefix: typeof cfg?.catalogPrefix === 'string' ? cfg.catalogPrefix : DEFAULTS.catalogPrefix
      };
      mem.set(userId, out);
      return out;
    }
  }catch{}

  // 2) File path
  try{
    await ensureDir();
    const f = fileFor(userId);
    const buf = await fs.readFile(f).catch(()=>null);
    if (buf){
      const j = JSON.parse(String(buf));
      const out = {
        addonName: typeof j?.addonName === 'string' ? j.addonName : DEFAULTS.addonName,
        catalogPrefix: typeof j?.catalogPrefix === 'string' ? j.catalogPrefix : DEFAULTS.catalogPrefix
      };
      mem.set(userId, out);
      return out;
    }
  }catch{}

  // 3) Memory/defaults
  return mem.get(userId) || DEFAULTS;
}

async function updateUserSettings(repo, userId, partial){
  // Normalize inputs
  const p = pickStrings(partial);
  const have = await getUserSettings(repo, userId); // ensures memory hydrated

  // 1) DB path — merge onto existing config document if available
  try{
    if (repo && typeof repo.getConfig === 'function'){
      const current = (await repo.getConfig(userId)) || {};
      const next = { ...current }; // keep lists, tokens, any other keys intact
      if (p.addonName !== undefined) next.addonName = p.addonName;
      if (p.catalogPrefix !== undefined) next.catalogPrefix = p.catalogPrefix;
      if (typeof repo.updateConfig === 'function'){
        await repo.updateConfig(userId, next); // write merged object (not replace with partial)
      }
      const out = {
        addonName: typeof next.addonName === 'string' ? next.addonName : DEFAULTS.addonName,
        catalogPrefix: typeof next.catalogPrefix === 'string' ? next.catalogPrefix : DEFAULTS.catalogPrefix
      };
      mem.set(userId, out);
      return out;
    }
  }catch{}

  // 2) File path
  try{
    await ensureDir();
    const f = fileFor(userId);
    const buf = await fs.readFile(f).catch(()=>null);
    const current = buf ? JSON.parse(String(buf)) : {};
    const next = { ...current };
    if (p.addonName !== undefined) next.addonName = p.addonName;
    if (p.catalogPrefix !== undefined) next.catalogPrefix = p.catalogPrefix;
    await fs.writeFile(f, JSON.stringify(next, null, 2), 'utf8');
    const out = {
      addonName: typeof next.addonName === 'string' ? next.addonName : DEFAULTS.addonName,
      catalogPrefix: typeof next.catalogPrefix === 'string' ? next.catalogPrefix : DEFAULTS.catalogPrefix
    };
    mem.set(userId, out);
    return out;
  }catch{}

  // 3) Memory-only fallback
  const out = {
    addonName: p.addonName ?? have.addonName ?? DEFAULTS.addonName,
    catalogPrefix: p.catalogPrefix ?? have.catalogPrefix ?? DEFAULTS.catalogPrefix
  };
  mem.set(userId, out);
  return out;
}

module.exports = { getUserSettings, updateUserSettings };
