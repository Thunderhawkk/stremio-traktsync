const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const { logger } = require('../utils/logger');
const cfg = require('../config');

let client;

async function getPg() {
  if (!cfg.db.url) return null;
  if (client) return client;
  client = new Client({ connectionString: cfg.db.url });
  await client.connect();
  return client;
}

async function migrate() {
  const pg = await getPg();
  if (!pg) throw new Error('DATABASE_URL not set');
  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    logger.info({ migration: f }, 'running_migration');
    await pg.query(sql);
  }
  logger.info('migrations_complete');
}

async function seed() {
  const pg = await getPg();
  if (!pg) throw new Error('DATABASE_URL not set');
  const seedSql = fs.readFileSync(path.join(__dirname, 'migrations', 'seed.sql'), 'utf8');
  await pg.query(seedSql);
  logger.info('seed_complete');
}

if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === 'migrate') migrate().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
  else if (cmd === 'seed') seed().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { getPg };
