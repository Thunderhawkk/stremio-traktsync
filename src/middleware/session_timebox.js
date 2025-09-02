// src/middleware/session_timebox.js
// Provides: attachSessionUser, absoluteSessionTimeout

function attachSessionUser(req, _res, next) {
  if (req.session && req.session.user) req.user = req.session.user;
  if (req.session && !req.session.createdAt) req.session.createdAt = Date.now();
  next();
}

/**
 * Enforce absolute session lifetime regardless of activity.
 * Options: { absoluteMs: number }
 */
function absoluteSessionTimeout({ absoluteMs }) {
  const cap = Number(absoluteMs || 0);
  return function (req, res, next) {
    if (!cap || !req.session) return next();
    const created = Number(req.session.createdAt || Date.now());
    if (Date.now() - created > cap) {
      // Invalidate session and force re-login
      req.session.destroy(() => res.status(440).json({ error: 'session_expired' }));
      return;
    }
    next();
  };
}

module.exports = { attachSessionUser, absoluteSessionTimeout };
