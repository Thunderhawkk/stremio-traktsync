// src/state/userSettings.js
// Safe, merge-only persistence of addonName, catalogPrefix, hideUnreleasedAll, and lastDeltaAt per user.

const fs = require('fs/promises');
const path = require('path');

const DEFAULTS = {
  addonName: 'Trakt Lists',
  catalogPrefix: '',
  hideUnreleasedAll: false,
  lastDeltaAt: '' // ISO string watermark for delta refresh
};
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data', 'user-settings');
const mem = new Map(); // userId -> settings cache

async function ensureDir(){ await fs.mkdir(DATA_DIR, { recursive: true }).catch(()=>{}); }
function fileFor(userId){
  const safe = String(userId || '').replace(/[^A-Za-z0-9_-]/g, '');
  return path.join(DATA_DIR, `${safe}.json`);
}

// Normalize input (accept string/boolean for flag; ISO string for lastDeltaAt)
function pickSettings(obj = {}) {
  const out = {};
  if (typeof obj.addonName === 'string') out.addonName = obj.addonName.trim();
  if (typeof obj.catalogPrefix === 'string') out.catalogPrefix = obj.catalogPrefix.trim();

  const v = obj.hideUnreleasedAll;
  if (typeof v === 'boolean') out.hideUnreleasedAll = v;
  else if (typeof v === 'string'){
    const s = v.trim().toLowerCase();
    if (s === 'true' || s === '1') out.hideUnreleasedAll = true;
    else if (s === 'false' || s === '0') out.hideUnreleasedAll = false;
  }

  if (typeof obj.lastDeltaAt === 'string' && obj.lastDeltaAt) out.lastDeltaAt = obj.lastDeltaAt.trim();
  return out;
}

async function getUserSettings(repo, userId){
  // 1) DB-backed (if available)
  try{
    if (repo && typeof repo.getConfig === 'function'){
      const cfg = await repo.getConfig(userId);
      const out = {
        addonName: typeof cfg?.addonName === 'string' ? cfg.addonName : DEFAULTS.addonName,
        catalogPrefix: typeof cfg?.catalogPrefix === 'string' ? cfg.catalogPrefix : DEFAULTS.catalogPrefix,
        hideUnreleasedAll: typeof cfg?.hideUnreleasedAll === 'boolean' ? cfg.hideUnreleasedAll : DEFAULTS.hideUnreleasedAll,
        lastDeltaAt: typeof cfg?.lastDeltaAt === 'string' ? cfg.lastDeltaAt : DEFAULTS.lastDeltaAt
      };
      mem.set(userId, out);
      return out;
    }
  }catch{}

  // 2) File-backed
  try{
    await ensureDir();
    const f = fileFor(userId);
    const buf = await fs.readFile(f).catch(()=>null);
    if (buf){
      const j = JSON.parse(String(buf));
      const out = {
        addonName: typeof j?.addonName === 'string' ? j.addonName : DEFAULTS.addonName,
        catalogPrefix: typeof j?.catalogPrefix === 'string' ? j.catalogPrefix : DEFAULTS.catalogPrefix,
        hideUnreleasedAll: typeof j?.hideUnreleasedAll === 'boolean' ? j.hideUnreleasedAll : DEFAULTS.hideUnreleasedAll,
        lastDeltaAt: typeof j?.lastDeltaAt === 'string' ? j.lastDeltaAt : DEFAULTS.lastDeltaAt
      };
      mem.set(userId, out);
      return out;
    }
  }catch{}

  return mem.get(userId) || DEFAULTS;
}

async function updateUserSettings(repo, userId, partial){
  const p = pickSettings(partial);
  const have = await getUserSettings(repo, userId).catch(() => DEFAULTS);

  // 1) DB
  try{
    if (repo && typeof repo.getConfig === 'function'){
      const current = (await repo.getConfig(userId)) || {};
      const next = { ...current };
      if (p.addonName !== undefined) next.addonName = p.addonName;
      if (p.catalogPrefix !== undefined) next.catalogPrefix = p.catalogPrefix;
      if (p.hideUnreleasedAll !== undefined) next.hideUnreleasedAll = p.hideUnreleasedAll;
      if (p.lastDeltaAt !== undefined) next.lastDeltaAt = p.lastDeltaAt;

      if (typeof repo.updateConfig === 'function'){
        await repo.updateConfig(userId, next);
      }
      const out = {
        addonName: typeof next.addonName === 'string' ? next.addonName : DEFAULTS.addonName,
        catalogPrefix: typeof next.catalogPrefix === 'string' ? next.catalogPrefix : DEFAULTS.catalogPrefix,
        hideUnreleasedAll: typeof next.hideUnreleasedAll === 'boolean' ? next.hideUnreleasedAll : DEFAULTS.hideUnreleasedAll,
        lastDeltaAt: typeof next.lastDeltaAt === 'string' ? next.lastDeltaAt : DEFAULTS.lastDeltaAt
      };
      mem.set(userId, out);
      return out;
    }
  }catch{}

  // 2) File
  try{
    await ensureDir();
    const f = fileFor(userId);
    const buf = await fs.readFile(f).catch(()=>null);
    const current = buf ? JSON.parse(String(buf)) : {};
    const next = { ...current };
    if (p.addonName !== undefined) next.addonName = p.addonName;
    if (p.catalogPrefix !== undefined) next.catalogPrefix = p.catalogPrefix;
    if (p.hideUnreleasedAll !== undefined) next.hideUnreleasedAll = p.hideUnreleasedAll;
    if (p.lastDeltaAt !== undefined) next.lastDeltaAt = p.lastDeltaAt;

    await fs.writeFile(f, JSON.stringify(next, null, 2), 'utf8');

    const out = {
      addonName: typeof next.addonName === 'string' ? next.addonName : DEFAULTS.addonName,
      catalogPrefix: typeof next.catalogPrefix === 'string' ? next.catalogPrefix : DEFAULTS.catalogPrefix,
      hideUnreleasedAll: typeof next.hideUnreleasedAll === 'boolean' ? next.hideUnreleasedAll : DEFAULTS.hideUnreleasedAll,
      lastDeltaAt: typeof next.lastDeltaAt === 'string' ? next.lastDeltaAt : DEFAULTS.lastDeltaAt
    };
    mem.set(userId, out);
    return out;
  }catch{}

  // 3) Memory fallback
  const out = {
    addonName: p.addonName ?? have.addonName ?? DEFAULTS.addonName,
    catalogPrefix: p.catalogPrefix ?? have.catalogPrefix ?? DEFAULTS.catalogPrefix,
    hideUnreleasedAll:
      (typeof p.hideUnreleasedAll === 'boolean' ? p.hideUnreleasedAll
        : (typeof have.hideUnreleasedAll === 'boolean' ? have.hideUnreleasedAll : DEFAULTS.hideUnreleasedAll)),
    lastDeltaAt: typeof p.lastDeltaAt === 'string' ? p.lastDeltaAt : (have.lastDeltaAt || DEFAULTS.lastDeltaAt)
  };
  mem.set(userId, out);
  return out;
}

module.exports = { getUserSettings, updateUserSettings };
