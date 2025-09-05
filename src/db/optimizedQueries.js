// src/db/optimizedQueries.js
// Optimized database queries with better performance

const { getPg } = require('./pg');
const { logger } = require('../utils/logger');

/**
 * Optimized user queries with proper indexing usage
 */
const optimizedQueries = {
  
  /**
   * Find users with pagination and filtering
   * Uses indexes: idx_users_created_at, idx_users_role, idx_users_provider_lookup
   */
  async findUsersWithPagination({ page = 1, limit = 20, role = null, provider = null, search = null }) {
    const pg = await getPg();
    if (!pg) throw new Error('Database not available');
    
    const offset = (page - 1) * limit;
    let whereClause = '1=1';
    const params = [];
    let paramIndex = 1;
    
    if (role) {
      whereClause += ` AND role = $${paramIndex}`;
      params.push(role);
      paramIndex++;
    }
    
    if (provider) {
      whereClause += ` AND provider = $${paramIndex}`;
      params.push(provider);
      paramIndex++;
    }
    
    if (search) {
      whereClause += ` AND (username ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    const countQuery = `SELECT COUNT(*) FROM users WHERE ${whereClause}`;
    const dataQuery = `
      SELECT id, username, email, role, provider, email_verified, avatar_url, created_at, updated_at, last_login_at
      FROM users 
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    params.push(limit, offset);
    
    const [countResult, dataResult] = await Promise.all([
      pg.query(countQuery, params.slice(0, -2)),
      pg.query(dataQuery, params)
    ]);
    
    return {
      data: dataResult.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
    };
  },

  /**
   * Get user statistics using optimized view
   * Uses view: user_stats
   */
  async getUserStatistics() {
    const pg = await getPg();
    if (!pg) throw new Error('Database not available');
    
    const { rows } = await pg.query('SELECT * FROM user_stats');
    return rows[0] || {};
  },

  /**
   * Get active users using optimized view
   * Uses view: active_users
   */
  async getActiveUsers(limit = 100) {
    const pg = await getPg();
    if (!pg) throw new Error('Database not available');
    
    const { rows } = await pg.query(`
      SELECT * FROM active_users 
      WHERE activity_status = 'active'
      ORDER BY last_login_at DESC
      LIMIT $1
    `, [limit]);
    
    return rows;
  },

  /**
   * Optimized refresh token cleanup
   * Uses indexes: idx_refresh_tokens_cleanup, idx_refresh_tokens_revoked_at
   */
  async cleanupExpiredTokens() {
    const pg = await getPg();
    if (!pg) throw new Error('Database not available');
    
    try {
      await pg.query('BEGIN');
      
      // Use the optimized cleanup function
      await pg.query('SELECT cleanup_expired_tokens()');
      
      await pg.query('COMMIT');
      logger.info('token_cleanup_completed');
    } catch (error) {
      await pg.query('ROLLBACK');
      logger.error({ error }, 'token_cleanup_failed');
      throw error;
    }
  },

  /**
   * Batch insert for list configurations
   * Uses prepared statements for better performance
   */
  async batchInsertListConfigs(userId, lists) {
    const pg = await getPg();
    if (!pg) throw new Error('Database not available');
    
    if (!lists || lists.length === 0) return;
    
    try {
      await pg.query('BEGIN');
      
      // Delete existing lists for user
      await pg.query('DELETE FROM list_config WHERE user_id = $1', [userId]);
      
      // Prepare batch insert
      const values = [];
      const placeholders = [];
      let paramIndex = 1;
      
      lists.forEach((list, index) => {
        const startParam = paramIndex;
        placeholders.push(`($${startParam}, $${startParam + 1}, $${startParam + 2}, $${startParam + 3}, $${startParam + 4}, $${startParam + 5}, $${startParam + 6}, $${startParam + 7}, $${startParam + 8}, NOW(), NOW())`);
        values.push(
          list.id,
          userId,
          list.name,
          list.url,
          list.type,
          list.sortBy || null,
          list.sortOrder || null,
          !!list.enabled,
          list.order || index
        );
        paramIndex += 9;
      });
      
      if (placeholders.length > 0) {
        const insertQuery = `
          INSERT INTO list_config(id, user_id, name, url, type, sort_by, sort_order, enabled, "order", created_at, updated_at)
          VALUES ${placeholders.join(', ')}
        `;
        
        await pg.query(insertQuery, values);
      }
      
      await pg.query('COMMIT');
      logger.debug({ userId, count: lists.length }, 'batch_insert_lists_completed');
    } catch (error) {
      await pg.query('ROLLBACK');
      logger.error({ error, userId }, 'batch_insert_lists_failed');
      throw error;
    }
  },

  /**
   * Get user lists with optimized query
   * Uses index: idx_list_config_user_type_enabled
   */
  async getUserListsOptimized(userId, type = null, enabledOnly = false) {
    const pg = await getPg();
    if (!pg) throw new Error('Database not available');
    
    let query = `
      SELECT * FROM list_config 
      WHERE user_id = $1
    `;
    const params = [userId];
    let paramIndex = 2;
    
    if (type) {
      query += ` AND type = $${paramIndex}`;
      params.push(type);
      paramIndex++;
    }
    
    if (enabledOnly) {
      query += ` AND enabled = true`;
    }
    
    query += ` ORDER BY "order" NULLS LAST, created_at`;
    
    const { rows } = await pg.query(query, params);
    return rows;
  },

  /**
   * Find users by email with case-insensitive search
   * Uses index: idx_users_email
   */
  async findUsersByEmailPattern(emailPattern) {
    const pg = await getPg();
    if (!pg) throw new Error('Database not available');
    
    const { rows } = await pg.query(`
      SELECT id, username, email, role, provider, created_at
      FROM users 
      WHERE email ILIKE $1
      ORDER BY email
    `, [`%${emailPattern}%`]);
    
    return rows;
  },

  /**
   * Get refresh token statistics
   * Uses indexes: idx_refresh_tokens_issued_at, idx_refresh_tokens_revoked_at
   */
  async getRefreshTokenStats() {
    const pg = await getPg();
    if (!pg) throw new Error('Database not available');
    
    const { rows } = await pg.query(`
      SELECT 
        COUNT(*) as total_tokens,
        COUNT(*) FILTER (WHERE revoked_at IS NULL) as active_tokens,
        COUNT(*) FILTER (WHERE revoked_at IS NOT NULL) as revoked_tokens,
        COUNT(*) FILTER (WHERE issued_at > NOW() - INTERVAL '24 hours') as tokens_24h,
        COUNT(*) FILTER (WHERE issued_at > NOW() - INTERVAL '7 days') as tokens_7d
      FROM refresh_tokens
    `);
    
    return rows[0] || {};
  },

  /**
   * Get user activity summary
   * Uses index: idx_users_last_login
   */
  async getUserActivitySummary(days = 30) {
    const pg = await getPg();
    if (!pg) throw new Error('Database not available');
    
    const { rows } = await pg.query(`
      SELECT 
        DATE_TRUNC('day', last_login_at) as login_date,
        COUNT(*) as user_count
      FROM users 
      WHERE last_login_at > NOW() - INTERVAL '${days} days'
      GROUP BY DATE_TRUNC('day', last_login_at)
      ORDER BY login_date DESC
    `);
    
    return rows;
  },

  /**
   * Optimized user search with full-text search capabilities
   * Uses GIN index for text search if available
   */
  async searchUsers(searchTerm, limit = 20) {
    const pg = await getPg();
    if (!pg) throw new Error('Database not available');
    
    const { rows } = await pg.query(`
      SELECT id, username, email, role, provider, avatar_url, created_at
      FROM users 
      WHERE 
        username ILIKE $1 OR 
        email ILIKE $1 OR
        (provider != 'local' AND provider_id ILIKE $1)
      ORDER BY 
        CASE 
          WHEN username ILIKE $2 THEN 1
          WHEN email ILIKE $2 THEN 2
          ELSE 3
        END,
        username
      LIMIT $3
    `, [`%${searchTerm}%`, `${searchTerm}%`, limit]);
    
    return rows;
  },

  /**
   * Get database performance metrics
   */
  async getDatabaseMetrics() {
    const pg = await getPg();
    if (!pg) throw new Error('Database not available');
    
    const queries = [
      // Table sizes
      `SELECT 
        schemaname,
        tablename,
        attname,
        n_distinct,
        correlation
       FROM pg_stats 
       WHERE schemaname = 'public' 
       ORDER BY tablename, attname`,
      
      // Index usage
      `SELECT 
        schemaname,
        tablename,
        indexname,
        idx_scan,
        idx_tup_read,
        idx_tup_fetch
       FROM pg_stat_user_indexes 
       ORDER BY idx_scan DESC`,
       
      // Connection stats (if using pool)
      `SELECT 
        numbackends as active_connections,
        xact_commit as transactions_committed,
        xact_rollback as transactions_rolled_back,
        blks_read as blocks_read,
        blks_hit as blocks_hit,
        tup_returned as tuples_returned,
        tup_fetched as tuples_fetched,
        tup_inserted as tuples_inserted,
        tup_updated as tuples_updated,
        tup_deleted as tuples_deleted
       FROM pg_stat_database 
       WHERE datname = current_database()`
    ];
    
    const results = await Promise.all(queries.map(query => pg.query(query)));
    
    return {
      tableStats: results[0].rows,
      indexStats: results[1].rows,
      connectionStats: results[2].rows[0] || {}
    };
  }
};

module.exports = optimizedQueries;