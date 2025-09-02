// src/routes/debug.js
const express = require('express');
const axios = require('axios');

const router = express.Router();

const TRAKT_BASE = 'https://api.trakt.tv';
const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID || '';

const probe = axios.create({
  baseURL: TRAKT_BASE,
  timeout: 15000,
  validateStatus: () => true // never throw on non-2xx so we see real status codes
});

probe.interceptors.request.use((cfg) => {
  cfg.headers = cfg.headers || {};
  cfg.headers['trakt-api-version'] = '2';
  cfg.headers['trakt-api-key'] = TRAKT_CLIENT_ID;
  return cfg;
});

router.get('/debug/trakt-probe', async (req, res) => {
  const raw = req.query.url || '';
  const clean = String(raw).replace(/[?#].*$/, '').replace(/\/+$/, ''); // strip query/hash/slash [4]

  // Regex extractors
  const mUser = clean.match(/^https?:\/\/(?:www\.)?trakt\.tv\/users\/([^/]+)\/lists\/([^/]+)$/i); // users/{user}/lists/{slug} [3]
  const mList = clean.match(/^https?:\/\/(?:www\.)?trakt\.tv\/lists\/([^/]+)$/i); // lists/{idOrSlug} [3]

  let user = null, slug = null, idOrSlug = null;
  if (mUser) { user = mUser[1]; slug = mUser[2]; } else if (mList) { idOrSlug = mList[1]; }

  const tries = [];
  const add = (label, path) => tries.push({ label, path, status: null });

  if (user && slug) {
    add('users-movies', `/users/${user}/lists/${slug}/items/movies?limit=1`); // items/movies [3]
    add('users-shows', `/users/${user}/lists/${slug}/items/shows?limit=1`);   // items/shows [3]
  }
  if (idOrSlug) {
    add('lists-movies', `/lists/${idOrSlug}/items/movies?limit=1`); // fallback by id/slug [3]
    add('lists-shows', `/lists/${idOrSlug}/items/shows?limit=1`);   // fallback by id/slug [3]
  }
  if (!tries.length) return res.status(400).json({ error: 'bad_input', input: raw, clean }); // parse failed [4]

  for (const t of tries) {
    const r = await probe.get(t.path);
    t.status = r.status;
  }
  res.json({ input: raw, clean, user, slug, idOrSlug, attempts: tries });
});

module.exports = router;
