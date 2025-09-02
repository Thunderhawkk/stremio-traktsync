// src/middleware/auth.js
// Unified auth that accepts session or previously attached user.

function attachSessionUser(req, _res, next) {
  if (req.session && req.session.user) {
    // keep a single source in req.user for downstream checks
    req.user = req.session.user;
  }
  next();
}

function authRequired(req, res, next) {
  const u = req.user || (req.session && req.session.user);
  if (!u) return res.status(401).json({ error: 'unauthorized' });
  req.user = u;
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    const u = req.user || (req.session && req.session.user);
    if (!u) return res.status(401).json({ error: 'unauthorized' });
    if (String(u.role || '').toLowerCase() !== String(role).toLowerCase()) {
      return res.status(403).json({ error: 'forbidden' });
    }
    req.user = u;
    next();
  };
}

module.exports = { attachSessionUser, authRequired, requireRole };
