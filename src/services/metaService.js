const axios = require('axios');
const cfg = require('../config');

const http = axios.create({ timeout: 12000 });
const CINEMETA_BASE = 'https://v3-cinemeta.strem.io';

const r1 = (n) => (typeof n === 'number' && isFinite(n)) ? Math.round(n * 10) / 10 : undefined;

function mapGenre(input) {
  if (!input) return null;
  const s = String(input).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  const l = s.toLowerCase();
  if (l.includes('sci') && (l.includes('fi') || l.includes('fiction'))) return 'Science Fiction';
  if (l.includes('comedy')) return 'Comedy';
  if (l.includes('drama')) return 'Drama';
  if (l.includes('romance')) return 'Romance';
  if (l.includes('family')) return 'Family';
  if (l.includes('action')) return 'Action';
  if (l.includes('adventure')) return 'Adventure';
  if (l.includes('animation')) return 'Animation';
  if (l.includes('crime')) return 'Crime';
  if (l.includes('documentary')) return 'Documentary';
  if (l.includes('fantasy')) return 'Fantasy';
  if (l.includes('history')) return 'History';
  if (l.includes('horror')) return 'Horror';
  if (l.includes('music')) return 'Music';
  if (l.includes('mystery')) return 'Mystery';
  if (l.includes('thriller')) return 'Thriller';
  if (l.includes('war')) return 'War';
  if (l.includes('western')) return 'Western';
  let t = s;
  let m = t.match(/^([A-Z]+)([a-z]+)$/);
  if (m) { const upper = m[12], lower = m[14]; if (lower === upper.slice(1).toLowerCase()) t = upper; }
  m = t.match(/^([A-Z][A-Z ]+)([a-z][a-z ]+)$/);
  if (m) {
    const upper = m[12], lower = m[14];
    if (upper.slice(1).toLowerCase().replace(/\s+/g, ' ') === lower.toLowerCase().replace(/\s+/g, ' ')) t = upper;
  }
  return t.split(' ').map(w => w ? w.toUpperCase() + w.slice(1).toLowerCase() : w).join(' ');
}

async function fetchCinemeta(type, imdb) {
  const url = `${CINEMETA_BASE}/meta/${encodeURIComponent(type)}/${encodeURIComponent(imdb)}.json`;
  const { data, status } = await http.get(url, { validateStatus: () => true });
  if (status !== 200 || !data?.meta) return null;
  const m = data.meta;
  return {
    name: m.name || m.title || '',
    poster: Array.isArray(m.posters) && m.posters ? m.posters : (m.poster || undefined),
    background: m.background || undefined,
    description: m.description || m.overview || undefined,
    genres: Array.isArray(m.genres) ? m.genres : undefined,
    imdbRating: r1(typeof m.imdbRating === 'number' ? m.imdbRating : m.rating),
    year: m.year || (m.releaseInfo ? parseInt(String(m.releaseInfo), 10) : undefined),
    runtime: typeof m.runtime === 'number' ? m.runtime
      : (Number.isFinite(parseInt(m.runtime, 10)) ? parseInt(m.runtime, 10) : undefined)
  };
}

async function fetchTrakt(type, imdb, clientId) {
  const base = 'https://api.trakt.tv';
  const path = `/${type === 'series' ? 'shows' : 'movies'}/${encodeURIComponent(imdb)}?extended=full`;
  const { data, status } = await http.get(base + path, {
    validateStatus: () => true,
    headers: { 'trakt-api-version': '2', 'trakt-api-key': clientId }
  });
  if (status !== 200 || !data) return null;
  return {
    name: data.title || '',
    description: data.overview || undefined,
    year: Number.isFinite(data.year) ? data.year : undefined,
    runtime: Number.isFinite(data.runtime) ? data.runtime : undefined,
    imdbRating: r1(typeof data.rating === 'number' ? data.rating : undefined),
    genres: Array.isArray(data.genres) ? data.genres : undefined
  };
}

async function fetchOmdb(imdb, key) {
  if (!key) return null;
  const url = `https://www.omdbapi.com/?apikey=${encodeURIComponent(key)}&i=${encodeURIComponent(imdb)}`;
  const { data, status } = await http.get(url, { validateStatus: () => true });
  if (status !== 200 || !data || data.Response === 'False') return null;
  const genres = typeof data.Genre === 'string' ? data.Genre.split(',').map(s => s.trim()).filter(Boolean) : undefined;
  return {
    genres,
    poster: data.Poster && /^https?:\/\//.test(data.Poster) ? data.Poster : undefined
  };
}

async function getMeta({ userId, type, imdb }) {
  const clientId = process.env.TRAKT_CLIENT_ID || (cfg.trakt && cfg.trakt.clientId) || '';
  const omdbKey = process.env.OMDB_API_KEY || (cfg.OMDB_API_KEY || '');

  const cm = await fetchCinemeta(type, imdb).catch(() => null);
  const tk = await fetchTrakt(type, imdb, clientId).catch(() => null);
  const om = await fetchOmdb(imdb, omdbKey).catch(() => null);

  const name = cm?.name ?? tk?.name ?? '';
  const poster = cm?.poster ?? om?.poster ?? undefined;
  const background = cm?.background ?? undefined;
  const description = cm?.description ?? tk?.description ?? undefined;
  const year = cm?.year ?? tk?.year ?? undefined;
  const runtime = cm?.runtime ?? tk?.runtime ?? undefined;
  const imdbRating = cm?.imdbRating ?? tk?.imdbRating ?? undefined;

  const rawGenres = (tk?.genres && tk.genres.length ? tk.genres
                    : (cm?.genres && cm.genres.length ? cm.genres
                    : (om?.genres || null))) || null;
  const genres = rawGenres ? Array.from(new Set(rawGenres.map(mapGenre).filter(Boolean))) : undefined;

  return {
    meta: {
      id: imdb,
      type,
      name,
      poster,
      background,
      description,
      genres,
      imdbRating,
      releaseInfo: year ? (runtime ? `${year} • ${runtime} min` : String(year)) : (runtime ? `${runtime} min` : undefined),
      runtime
    }
  };
}

module.exports = { getMeta };
