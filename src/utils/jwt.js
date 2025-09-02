const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const cfg = require('../config');

function signAccessToken(payload) {
  return jwt.sign(payload, cfg.jwt.secret, { expiresIn: Math.floor(cfg.jwt.accessTtlMs / 1000) });
}
function signRefreshToken(payload) {
  // include jti for rotation tracking
  const jti = crypto.randomUUID();
  return { token: jwt.sign({ ...payload, jti }, cfg.jwt.refreshSecret, { expiresIn: Math.floor(cfg.jwt.refreshTtlMs / 1000) }), jti };
}
function verifyAccess(token) {
  return jwt.verify(token, cfg.jwt.secret);
}
function verifyRefresh(token) {
  return jwt.verify(token, cfg.jwt.refreshSecret);
}

module.exports = { signAccessToken, signRefreshToken, verifyAccess, verifyRefresh };
