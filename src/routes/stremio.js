// src/routes/stremio.js
// One-time account login (no storage), list installed addons, and persist addon reorder.
// Credentials and authKey are NOT stored or logged.

const express = require('express');
const fetch = require('node-fetch');
const cfg = require('../config');

const router = express.Router();
const API = (cfg && cfg.stremioApiBase) || 'https://api.strem.io';

async function text(r) { try { return await r.text(); } catch { return ''; } }

// Extract authKey from various shapes Stremio returns
function pickAuthKey(j) {
  return j?.authKey || j?.auth || j?.user?.authKey || null;
}

// POST /api/stremio/login  -> { authKey }
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'missing_credentials' });

    // Attempt 1: REST style
    let r = await fetch(`${API}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Accept':'application/json' },
      body: JSON.stringify({ email, password })
    });

    let ok = r.ok, detail = ok ? '' : (await text(r));
    let j = ok ? (await r.json().catch(() => ({}))) : null;
    let key = ok ? pickAuthKey(j) : null;

    // Attempt 2: RPC style (fallback if REST failed or no key extracted)
    if (!ok || !key) {
      const r2 = await fetch(`${API}/api`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Accept':'application/json' },
        body: JSON.stringify({ method: 'login', params: { email, password } })
      });
      if (!r2.ok) {
        const d2 = await text(r2);
        return res.status(r2.status).json({ error: 'stremio_login_failed', detail: d2 || detail });
      }
      const j2 = await r2.json().catch(() => ({}));
      key = pickAuthKey(j2);
      if (!key) return res.status(500).json({ error: 'no_authkey' });
    }

    // No storage; return for immediate use
    return res.json({ authKey: key });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

// GET /api/stremio/addons -> { addons:[{id,name,icon}] }
router.get('/addons', async (req, res) => {
  try {
    const key = String(req.header('X-Stremio-Auth') || '').trim();
    if (!key) return res.status(401).json({ error: 'missing_authkey' });

    const r = await fetch(`${API}/api/addonCollectionGet`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Accept':'application/json' },
      body: JSON.stringify({ authKey: key })
    });
    if (!r.ok) {
      const detail = await text(r);
      return res.status(r.status).json({ error: 'stremio_api_error', detail });
    }

    const data = await r.json().catch(() => ({}));
    const addons = Array.isArray(data?.addons)
      ? data.addons.map(a => ({
          id: a?.id || a?.transportUrl || a?.url || '',
          name: a?.name || '',
          icon: a?.logo || a?.icon || ''
        }))
      : [];

    return res.json({ addons });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

// POST /api/stremio/reorder { order:[id,...] } -> { ok:true }
router.post('/reorder', async (req, res) => {
  try {
    const key = String(req.header('X-Stremio-Auth') || '').trim();
    if (!key) return res.status(401).json({ error: 'missing_authkey' });

    const order = Array.isArray(req.body?.order) ? req.body.order : [];
    if (!order.length) return res.status(400).json({ error: 'empty_order' });

    const r = await fetch(`${API}/api/addonCollectionSet`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Accept':'application/json' },
      body: JSON.stringify({ authKey: key, order })
    });
    if (!r.ok) {
      const detail = await text(r);
      return res.status(r.status).json({ error: 'stremio_api_error', detail });
    }

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

module.exports = router;
