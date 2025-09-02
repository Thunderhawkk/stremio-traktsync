// src/jobs/scheduler.js
// Provides: start(), refreshAllTokens(), prewarmPopularCatalogs()

const fetch = require('node-fetch');
const { repo } = require('../db/repo');
const { logger } = require('../utils/logger');
const { markWarmed } = require('../utils/cache');

const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID || '';
const TRAKT_CLIENT_SECRET = process.env.TRAKT_CLIENT_SECRET || '';

const REFRESH_INTERVAL_MS = Number(process.env.TOKEN_REFRESH_INTERVAL_MS || 15 * 60 * 1000);
const PREWARM_INTERVAL_MS = Number(process.env.PREWARM_INTERVAL_MS || 6 * 60 * 60 * 1000);
const REFRESH_SKEW_MS = Number(process.env.TOKEN_REFRESH_SKEW_MS || 10 * 60 * 1000);

async function refreshTraktPair({ clientId, clientSecret, refreshToken }) {
  const r = await fetch('https://api.trakt.tv/oauth/token', {
    method:'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      redirect_uri: 'urn:ietf:wg:oauth:2.0:oob'
    })
  });
  if (!r.ok) {
    const t = await r.text().catch(()=> '');
    const err = new Error(`refresh_failed ${r.status} ${t}`);
    err.status = r.status;
    throw err;
  }
  return r.json();
}

function needsRefresh(expires_at){
  if (!expires_at) return true;
  const exp = new Date(expires_at).getTime();
  return (exp - Date.now()) <= REFRESH_SKEW_MS;
}

async function refreshAllTokens(){
  if (!TRAKT_CLIENT_ID || !TRAKT_CLIENT_SECRET) {
    return { refreshed:0, failed:0, reauthNeeded:0, note:'Missing Trakt client credentials' };
  }
  const users = await repo.listUsers();
  let refreshed=0, failed=0, reauthNeeded=0;

  for (const u of users) {
    try {
      const tt = await repo.getTraktTokens(u.id);
      if (!tt || !tt.refresh_token) continue;
      if (!needsRefresh(tt.expires_at)) continue;

      const out = await refreshTraktPair({
        clientId: TRAKT_CLIENT_ID,
        clientSecret: TRAKT_CLIENT_SECRET,
        refreshToken: tt.refresh_token
      });

      const expiresAtIso = out.created_at
        ? new Date(out.created_at + out.expires_in * 1000).toISOString()
        : new Date(Date.now() + out.expires_in * 1000).toISOString();

      await repo.upsertTraktTokens({
        userId: u.id,
        access_token: out.access_token,
        refresh_token: out.refresh_token || tt.refresh_token,
        expires_at: expiresAtIso
      });
      await repo.setLastAutoRefreshAt(u.id, new Date().toISOString());
      refreshed++;
    } catch (e) {
      failed++;
      if (String(e && e.message || '').includes('invalid_grant')) reauthNeeded++;
      logger.warn({ userId:u.id, err:String(e&&e.message||e) }, 'token_refresh_failed');
    }
  }
  return { refreshed, failed, reauthNeeded };
}

async function prewarmPopularCatalogs(){
  try {
    const users = await repo.listUsers();
    for (const u of users) {
      const lists = await repo.getLists(u.id);
      const top = (lists||[]).filter(l => l.enabled !== false).slice(0,2);
      for (const l of top) {
        try {
          await fetch(`${process.env.BASE_URL || ''}/api/catalog/preview`, {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ userId: u.id, listId: l.id })
          }).catch(()=>{});
        } catch {}
      }
    }
    markWarmed();
  } catch (e) {
    logger.warn({ err:String(e&&e.message||e) }, 'prewarm_failed');
  }
}

function start(){
  setInterval(() => {
    refreshAllTokens().then(sum => logger.info(sum, 'token_refresh_summary'))
      .catch(err => logger.warn({ err:String(err&&err.message||err) }, 'token_refresh_loop_error'));
  }, REFRESH_INTERVAL_MS);

  setInterval(() => {
    prewarmPopularCatalogs().catch(err => logger.warn({ err:String(err&&err.message||err) }, 'prewarm_loop_error'));
  }, PREWARM_INTERVAL_MS);
}

module.exports = { start, refreshAllTokens, prewarmPopularCatalogs };
