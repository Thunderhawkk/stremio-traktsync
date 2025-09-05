const fs = require('fs');
const path = require('path');
const cfg = require('../config');

const dir = cfg.db.dataDir;
const files = {
  users: path.join(dir, 'users.json'),
  traktTokens: path.join(dir, 'traktTokens.json'),
  lists: path.join(dir, 'lists.json'),
  refresh: path.join(dir, 'refreshTokens.json'),
  audit_logs: path.join(dir, 'audit_logs.json')
};

function ensure() {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  for (const k of Object.keys(files)) {
    if (!fs.existsSync(files[k])) fs.writeFileSync(files[k], '[]');
  }
}

function read(name) {
  ensure();
  // For files not predefined, create them as needed
  if (!files[name]) {
    files[name] = path.join(dir, `${name}.json`);
  }
  if (!fs.existsSync(files[name])) {
    fs.writeFileSync(files[name], '[]');
  }
  return JSON.parse(fs.readFileSync(files[name], 'utf8'));
}
function write(name, data) {
  ensure();
  // For files not predefined, create them as needed
  if (!files[name]) {
    files[name] = path.join(dir, `${name}.json`);
  }
  fs.writeFileSync(files[name], JSON.stringify(data, null, 2));
}

module.exports = { read, write };
