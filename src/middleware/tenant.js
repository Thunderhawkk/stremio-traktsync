function ensureUserScope(req, res, next) {
  const { userId } = req.params;
  if (!userId) return res.status(400).json({ error: 'missing_userId' });
  req.tenantUserId = userId;
  next();
}

module.exports = { ensureUserScope };
