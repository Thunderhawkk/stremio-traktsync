const { repo } = require('../db/repo');
const { hashPassword, comparePassword } = require('../utils/password');
const { signAccessToken, signRefreshToken, verifyRefresh } = require('../utils/jwt');
const crypto = require('crypto');
const cfg = require('../config');

async function register({ username, email, password }) {
  if (!password || password.length < 8) throw Object.assign(new Error('weak_password'), { status: 400 });
  const passwordHash = await hashPassword(password);
  const user = await repo.createUser({ username, email, passwordHash });
  return user;
}

async function login({ username, password }) {
  const user = await repo.findUserByUsername(username);
  if (!user) throw Object.assign(new Error('invalid_credentials'), { status: 401 });
  const ok = await comparePassword(password, user.password_hash || user.passwordHash);
  if (!ok) throw Object.assign(new Error('invalid_credentials'), { status: 401 });

  await repo.updateUserLoginAt(user.id);

  const access = signAccessToken({ sub: user.id, role: user.role, username: user.username });
  const { token: refresh, jti } = signRefreshToken({ sub: user.id });
  const hash = crypto.createHash('sha256').update(refresh).digest('hex');
  await repo.addRefreshToken({ userId: user.id, hash, issuedAt: new Date() });

  return { user: { id: user.id, username: user.username, role: user.role }, access, refresh };
}

async function refreshTokens(currentRefreshToken) {
  const payload = verifyRefresh(currentRefreshToken);
  const userId = payload.sub;
  const hash = crypto.createHash('sha256').update(currentRefreshToken).digest('hex');
  const active = await repo.isRefreshTokenActive({ userId, hash });
  if (!active) throw Object.assign(new Error('refresh_revoked'), { status: 401 });

  // Rotate: revoke old, issue new
  await repo.revokeRefreshToken({ userId, hash });
  const access = signAccessToken({ sub: userId, role: payload.role, username: payload.username });
  const { token: refresh, jti } = signRefreshToken({ sub: userId });
  const newHash = crypto.createHash('sha256').update(refresh).digest('hex');
  await repo.addRefreshToken({ userId, hash: newHash, issuedAt: new Date() });

  return { access, refresh };
}

async function logout(currentRefreshToken, userId) {
  if (!currentRefreshToken) return;
  const hash = crypto.createHash('sha256').update(currentRefreshToken).digest('hex');
  await repo.revokeRefreshToken({ userId, hash });
}

module.exports = { register, login, refreshTokens, logout };
