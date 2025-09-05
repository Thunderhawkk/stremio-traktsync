const { Client, Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { logger } = require('../utils/logger');
const cfg = require('../config');

let client;
let pool;

// Connection pool configuration
const poolConfig = {
  connectionString: cfg.db.url,
  max: parseInt(process.env.DB_POOL_MAX || '20', 10), // Maximum number of clients
  min: parseInt(process.env.DB_POOL_MIN || '2', 10),  // Minimum number of clients
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10), // 30 seconds
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '5000', 10), // 5 seconds
  maxUses: parseInt(process.env.DB_MAX_USES || '7500', 10), // Maximum uses per connection
  allowExitOnIdle: true
};

async function getPg() {
  if (!cfg.db.url) return null;
  
  // Use connection pool for better performance
  if (process.env.NODE_ENV === 'production' || process.env.USE_DB_POOL === 'true') {
    if (!pool) {
      pool = new Pool(poolConfig);
      
      // Handle pool errors
      pool.on('error', (err) => {
        logger.error({ err }, 'database_pool_error');
      });
      
      pool.on('connect', (client) => {
        logger.debug('database_pool_client_connected');
      });
      
      pool.on('remove', (client) => {
        logger.debug('database_pool_client_removed');
      });
    }
    return pool;
  }
  
  // Use single client for development
  if (client) return client;
  client = new Client({ connectionString: cfg.db.url });
  await client.connect();
  
  // Handle client errors
  client.on('error', (err) => {
    logger.error({ err }, 'database_client_error');
    client = null; // Reset client on error
  });
  
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

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('shutting_down_database_connections');
  if (pool) {
    await pool.end();
    logger.info('database_pool_closed');
  }
  if (client) {
    await client.end();
    logger.info('database_client_closed');
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('shutting_down_database_connections');
  if (pool) {
    await pool.end();
    logger.info('database_pool_closed');
  }
  if (client) {
    await client.end();
    logger.info('database_client_closed');
  }
  process.exit(0);
});

module.exports = { getPg, pool, client };
