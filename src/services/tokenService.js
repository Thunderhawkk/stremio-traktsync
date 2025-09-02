const { repo } = require('../db/repo');

const locks = new Map();

async function withUserLock(userId, fn) {
  while (locks.get(userId)) { // simple lock
    await new Promise(r => setTimeout(r, 50));
  }
  locks.set(userId, true);
  try { return await fn(); } finally { locks.delete(userId); }
}

async function setTraktTokens(userId, tokens) {
  return repo.upsertTraktTokens({ userId, ...tokens });
}

async function getTraktTokens(userId) {
  return repo.getTraktTokens(userId);
}

module.exports = { withUserLock, setTraktTokens, getTraktTokens };
