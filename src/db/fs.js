const fs = require('fs');
const path = require('path');
const cfg = require('../config');

const dir = cfg.db.dataDir;
const files = {
  users: path.join(dir, 'users.json'),
  traktTokens: path.join(dir, 'traktTokens.json'),
  lists: path.join(dir, 'lists.json'),
  refresh: path.join(dir, 'refreshTokens.json')
};

function ensure() {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  for (const k of Object.keys(files)) {
    if (!fs.existsSync(files[k])) fs.writeFileSync(files[k], '[]');
  }
}

function read(name) {
  ensure();
  return JSON.parse(fs.readFileSync(files[name], 'utf8'));
}
function write(name, data) {
  ensure();
  fs.writeFileSync(files[name], JSON.stringify(data, null, 2));
}

module.exports = { read, write };
