// src/services/auth.js
// Argon2id primary with bcrypt fallback and on-login rehash to Argon2id.

const argon2 = require('argon2');
const bcrypt = require('bcryptjs');
const { repo } = require('../db/repo');

const ARGON_OPTS = {
  type: argon2.argon2id,
  memoryCost: Number(process.env.ARGON_MEMORY_KIB || 64 * 1024),
  timeCost: Number(process.env.ARGON_TIME || 2),
  parallelism: Number(process.env.ARGON_PARALLEL || 1)
};

function isArgonHash(h){ return typeof h === 'string' && h.startsWith('$argon2'); }
function isBcryptHash(h){ return typeof h === 'string' && h.startsWith('$2'); }

async function hashPassword(plain){
  if (typeof plain !== 'string' || plain.length < 8) throw new Error('weak_password');
  return argon2.hash(plain, ARGON_OPTS);
}

async function verifyAndMaybeMigrate({ user, plain }){
  const digest = user.passwordHash || user.password_hash || user.password;
  if (!digest) return false;

  if (isArgonHash(digest)) {
    return argon2.verify(digest, plain, ARGON_OPTS);
  }
  if (isBcryptHash(digest)) {
    const ok = await bcrypt.compare(plain, digest);
    if (!ok) return false;
    try {
      const newHash = await hashPassword(plain);
      if (typeof repo.updateUserPasswordHash === 'function') await repo.updateUserPasswordHash(user.id, newHash);
      else if (typeof repo.updateUser === 'function') await repo.updateUser(user.id, { passwordHash: newHash });
    } catch {}
    return true;
  }
  return false;
}

async function createUser({ username, email, password, role='user', provider='local', provider_id=null, avatar_url=null, email_verified=false }){
  const passwordHash = password ? await hashPassword(password) : null;
  return repo.createUser({ username, email, passwordHash, role, provider, provider_id, avatar_url, email_verified });
}

async function login({ username, password }){
  const u = await repo.findUserByUsername(username);
  if (!u) return null;
  const ok = await verifyAndMaybeMigrate({ user: u, plain: password });
  if (!ok) return null;
  await repo.updateUserLoginAt(u.id).catch(()=>{});
  return u;
}

module.exports = { hashPassword, createUser, login };
