// src/middleware/rate_limit.js
// Express rate-limiting profiles

const rateLimit = require('express-rate-limit');

// App-level default (e.g., 600 req / 15m per IP)
const limiterApp = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RL_APP_MAX || 600),
  standardHeaders: true,
  legacyHeaders: false
});

// Strict for auth (e.g., 20 req / 15m)
const limiterAuthStrict = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RL_AUTH_MAX || 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_auth_requests' }
});

// Strict for device code init/poll (e.g., 60 req / 15m)
const limiterTraktDevice = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RL_TRAKT_DEVICE_MAX || 60),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_device_requests' }
});

// Light for status checks (e.g., 240 req / 15m ~ one per 3.75s average)
const limiterStatusLight = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RL_STATUS_MAX || 240),
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = { limiterApp, limiterAuthStrict, limiterTraktDevice, limiterStatusLight };
