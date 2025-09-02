const bcrypt = require('bcrypt');
const cfg = require('../config');

async function hashPassword(pw) {
  return bcrypt.hash(pw, cfg.bcryptRounds);
}
async function comparePassword(pw, hash) {
  return bcrypt.compare(pw, hash);
}

module.exports = { hashPassword, comparePassword };
