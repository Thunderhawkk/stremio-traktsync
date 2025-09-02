// src/routes/trakt.js
const express = require('express');
const fetch = require('node-fetch');
const { authRequired } = require('../middleware/auth');
const { repo } = require('../db/repo');
const { limiterTraktDevice, limiterStatusLight } = require('../middleware/rate_limit');

const router = express.Router();

const OAUTH_DEVICE_CODE_URL  = 'https://api.trakt.tv/oauth/device/code';
const OAUTH_DEVICE_TOKEN_URL = 'https://api.trakt.tv/oauth/device/token';
const OAUTH_TOKEN_URL        = 'https://api.trakt.tv/oauth/token';

const CLIENT_ID     = process.env.TRAKT_CLIENT_ID || '';
const CLIENT_SECRET = process.env.TRAKT_CLIENT_SECRET || '';

function noCache(_req,res,next){
  res.set('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma','no-cache'); res.set('Expires','0'); res.set('Surrogate-Control','no-store');
  next();
}

function expISO(expires_in_sec, created_at_ms){
  const base = (created_at_ms && Number.isFinite(created_at_ms)) ? created_at_ms : Date.now();
  return new Date(base + Math.max(0, Number(expires_in_sec)||0) * 1000).toISOString();
}

// GET /api/trakt/token/status
router.get('/token/status', authRequired, limiterStatusLight, noCache, async (req,res)=>{
  try{
    const tt = await repo.getTraktTokens(req.user.id).catch(()=>null);
    if (!tt || !tt.access_token) return res.json({ connected:false });
    res.json({
      connected: true,
      expires_at: tt.expires_at || null,
      last_auto_refresh_at: tt.last_auto_refresh_at || tt.lastAutoRefreshAt || null
    });
  }catch(e){
    res.status(500).json({ connected:false, error:String(e&&e.message||e) });
  }
});

router.get('/me/lists', authRequired, limiterStatusLight, async (req, res) => {
  try {
    const tt = await repo.getTraktTokens(req.user.id);
    if (!tt?.access_token) return res.status(401).json({ error: 'not_authorized' });
    const r = await fetch('https://api.trakt.tv/users/me/lists', {
      headers: {
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': process.env.TRAKT_CLIENT_ID || '',
        'Authorization': `Bearer ${tt.access_token}`
      }
    });
    if (!r.ok) return res.status(r.status).json({ error: 'trakt_error' });
    const arr = await r.json();
    // Return minimal fields for import
    res.json(arr.map(x => ({
      name: x?.name,
      slug: x?.ids?.slug,
      privacy: x?.privacy
    })));
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// POST /api/trakt/auth/init (device code)
router.post('/auth/init', authRequired, limiterTraktDevice, async (_req,res)=>{
  try{
    if (!CLIENT_ID) return res.status(500).json({ error:'missing_client_id' });
    const r = await fetch(OAUTH_DEVICE_CODE_URL, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ client_id: CLIENT_ID })
    });
    if (!r.ok){
      const t = await r.text().catch(()=> '');
      return res.status(r.status).json({ error: t || 'device_code_failed' });
    }
    const out = await r.json();
    res.json(out);
  }catch(e){
    res.status(500).json({ error:String(e&&e.message||e) });
  }
});

// POST /api/trakt/auth/poll
router.post('/auth/poll', authRequired, limiterTraktDevice, async (req,res)=>{
  try{
    if (!CLIENT_ID || !CLIENT_SECRET) return res.status(500).json({ error:'missing_client_credentials' });
    const { device_code } = req.body || {};
    if (!device_code) return res.status(400).json({ error:'missing_device_code' });

    const r = await fetch(OAUTH_DEVICE_TOKEN_URL, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ code: device_code, device_code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET })
    });
    if (r.status === 400 || r.status === 429) return res.sendStatus(202); // pending/slow down per device flow [3]
    if (r.status === 404 || r.status === 410 || r.status === 418) return res.status(400).json({ error:'invalid_or_expired_or_denied' });
    if (!r.ok){
      const t = await r.text().catch(()=> '');
      return res.status(r.status).json({ error: t || 'poll_failed' });
    }

    const out = await r.json();
    const expires_at = out.created_at ? expISO(out.expires_in, out.created_at*1000) : expISO(out.expires_in);
    await repo.upsertTraktTokens({
      userId: req.user.id,
      access_token: out.access_token,
      refresh_token: out.refresh_token || null,
      expires_at
    }).catch(()=>{});
    res.json({ authorized:true, expires_at });
  }catch(e){
    res.status(500).json({ error:String(e&&e.message||e) });
  }
});

// POST /api/trakt/token/refresh
router.post('/token/refresh', authRequired, async (req,res)=>{
  try{
    if (!CLIENT_ID || !CLIENT_SECRET) return res.status(500).json({ error:'missing_client_credentials' });
    const tt = await repo.getTraktTokens(req.user.id).catch(()=>null);
    if (!tt || !tt.refresh_token) return res.status(400).json({ error:'no_refresh_token' });

    const r = await fetch(OAUTH_TOKEN_URL, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: tt.refresh_token,
        grant_type: 'refresh_token',
        redirect_uri: 'urn:ietf:wg:oauth:2.0:oob'
      })
    });
    if (!r.ok){
      const t = await r.text().catch(()=> '');
      return res.status(r.status).json({ error: t || 'refresh_failed' });
    }
    const out = await r.json();
    const expires_at = out.created_at ? expISO(out.expires_in, out.created_at*1000) : expISO(out.expires_in);
    await repo.upsertTraktTokens({
      userId: req.user.id,
      access_token: out.access_token,
      refresh_token: out.refresh_token || tt.refresh_token,
      expires_at
    }).catch(()=>{});
    await repo.setLastAutoRefreshAt(req.user.id, new Date().toISOString()).catch(()=>{});
    res.json({ ok:true, expires_at });
  }catch(e){
    res.status(500).json({ error:String(e&&e.message||e) });
  }
});

// POST /api/trakt/token/clear  — robust across repo implementations
router.post('/token/clear', authRequired, async (req,res)=>{
  try{
    const userId = req.user.id;
    // Try the explicit helper if present
    if (typeof repo.clearTraktTokens === 'function') {
      await repo.clearTraktTokens(userId);
    // Fallback: upsert nulls
    } else if (typeof repo.upsertTraktTokens === 'function') {
      await repo.upsertTraktTokens({ userId, access_token: null, refresh_token: null, expires_at: null });
    // Fallback: known alternative helper names
    } else if (typeof repo.deleteTraktTokens === 'function') {
      await repo.deleteTraktTokens(userId);
    // Fallback: direct user update shape (adjust keys to your schema)
    } else if (repo.users?.update) {
      await repo.users.update(userId, {
        trakt_access_token: null,
        trakt_refresh_token: null,
        trakt_expires_at: null
      });
    } else if (typeof repo.updateUser === 'function') {
      await repo.updateUser(userId, {
        trakt_access_token: null,
        trakt_refresh_token: null,
        trakt_expires_at: null
      });
    } else {
      return res.status(500).json({ error: 'token_clear_not_supported' });
    }
    res.json({ ok:true });
  }catch(e){
    res.status(500).json({ error:String(e&&e.message||e) });
  }
});

module.exports = router;
