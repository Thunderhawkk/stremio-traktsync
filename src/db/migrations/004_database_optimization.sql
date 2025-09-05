-- Database Query Optimization and Indexing
-- This migration adds optimized indexes and query improvements

-- Enhanced indexing for users table
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_email_verified ON users(email_verified) WHERE email_verified = true;
CREATE INDEX IF NOT EXISTS idx_users_provider_lookup ON users(provider, provider_id) WHERE provider != 'local';
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_addon_token ON users(addon_token) WHERE addon_token IS NOT NULL;

-- Enhanced indexing for refresh_tokens table
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash_lookup ON refresh_tokens(refresh_token_hash, user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_issued_at ON refresh_tokens(issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_revoked_at ON refresh_tokens(revoked_at) WHERE revoked_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_cleanup ON refresh_tokens(issued_at) WHERE revoked_at IS NULL;

-- Enhanced indexing for trakt_tokens table
CREATE INDEX IF NOT EXISTS idx_trakt_tokens_expires_at ON trakt_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_trakt_tokens_updated_at ON trakt_tokens(updated_at DESC);

-- Enhanced indexing for list_config table
CREATE INDEX IF NOT EXISTS idx_list_config_user_type ON list_config(user_id, type);
CREATE INDEX IF NOT EXISTS idx_list_config_user_enabled ON list_config(user_id, enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_list_config_type ON list_config(type);
CREATE INDEX IF NOT EXISTS idx_list_config_enabled ON list_config(enabled);
CREATE INDEX IF NOT EXISTS idx_list_config_order_priority ON list_config(user_id, "order" NULLS LAST, created_at);
CREATE INDEX IF NOT EXISTS idx_list_config_name_search ON list_config USING gin(to_tsvector('english', name));

-- Optimization indexes for OAuth2 tables (if they exist)
CREATE INDEX IF NOT EXISTS idx_oauth2_auth_codes_expires ON oauth2_authorization_codes(expires_at) WHERE expires_at > NOW();
CREATE INDEX IF NOT EXISTS idx_oauth2_auth_codes_user_client ON oauth2_authorization_codes(user_id, client_id);
CREATE INDEX IF NOT EXISTS idx_oauth2_access_tokens_expires ON oauth2_access_tokens(expires_at) WHERE expires_at > NOW();
CREATE INDEX IF NOT EXISTS idx_oauth2_access_tokens_user_client ON oauth2_access_tokens(user_id, client_id);
CREATE INDEX IF NOT EXISTS idx_oauth2_refresh_tokens_expires ON oauth2_refresh_tokens(expires_at) WHERE expires_at IS NULL OR expires_at > NOW();
CREATE INDEX IF NOT EXISTS idx_oauth2_refresh_tokens_user_client ON oauth2_refresh_tokens(user_id, client_id);

-- Partial indexes for frequently accessed data
CREATE INDEX IF NOT EXISTS idx_users_active_sessions ON users(id, last_login_at) WHERE last_login_at > (NOW() - INTERVAL '30 days');
CREATE INDEX IF NOT EXISTS idx_trakt_tokens_valid ON trakt_tokens(user_id, expires_at) WHERE expires_at > NOW();

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_active ON refresh_tokens(user_id, issued_at DESC) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_list_config_user_type_enabled ON list_config(user_id, type, enabled, "order" NULLS LAST);

-- Statistics optimization
ANALYZE users;
ANALYZE refresh_tokens;
ANALYZE trakt_tokens;
ANALYZE list_config;

-- Add constraints for better query planning
ALTER TABLE users ADD CONSTRAINT chk_users_role CHECK (role IN ('user', 'admin', 'moderator'));
ALTER TABLE users ADD CONSTRAINT chk_users_provider CHECK (provider IN ('local', 'google', 'github', 'facebook', 'twitter'));
ALTER TABLE list_config ADD CONSTRAINT chk_list_config_type CHECK (type IN ('movie', 'series'));
ALTER TABLE list_config ADD CONSTRAINT chk_list_config_sort_order CHECK (sort_order IN ('asc', 'desc') OR sort_order IS NULL);

-- Create a view for active users (optimization for admin queries)
CREATE OR REPLACE VIEW active_users AS
SELECT 
    id,
    username,
    email,
    role,
    provider,
    email_verified,
    created_at,
    updated_at,
    last_login_at,
    CASE 
        WHEN last_login_at > (NOW() - INTERVAL '7 days') THEN 'active'
        WHEN last_login_at > (NOW() - INTERVAL '30 days') THEN 'recent'
        ELSE 'inactive'
    END as activity_status
FROM users
WHERE role != 'disabled';

-- Create a view for user statistics (optimization for dashboard)
CREATE OR REPLACE VIEW user_stats AS
SELECT 
    COUNT(*) as total_users,
    COUNT(*) FILTER (WHERE last_login_at > NOW() - INTERVAL '7 days') as active_users_7d,
    COUNT(*) FILTER (WHERE last_login_at > NOW() - INTERVAL '30 days') as active_users_30d,
    COUNT(*) FILTER (WHERE provider != 'local') as oauth_users,
    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as new_users_7d,
    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as new_users_30d
FROM users;

-- Function to clean up expired tokens (optimization for maintenance)
CREATE OR REPLACE FUNCTION cleanup_expired_tokens() RETURNS void AS $$
BEGIN
    -- Clean up expired OAuth2 authorization codes
    DELETE FROM oauth2_authorization_codes WHERE expires_at < NOW() - INTERVAL '1 hour';
    
    -- Clean up expired OAuth2 access tokens
    DELETE FROM oauth2_access_tokens WHERE expires_at < NOW() - INTERVAL '1 hour';
    
    -- Clean up expired OAuth2 refresh tokens (if they have expiry)
    DELETE FROM oauth2_refresh_tokens WHERE expires_at IS NOT NULL AND expires_at < NOW() - INTERVAL '1 hour';
    
    -- Clean up old revoked refresh tokens (older than 30 days)
    DELETE FROM refresh_tokens WHERE revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '30 days';
    
    -- Clean up very old refresh tokens (older than max refresh TTL)
    DELETE FROM refresh_tokens WHERE issued_at < NOW() - INTERVAL '30 days' AND revoked_at IS NULL;
    
    -- Update statistics
    ANALYZE users;
    ANALYZE refresh_tokens;
    ANALYZE trakt_tokens;
    ANALYZE list_config;
    ANALYZE oauth2_authorization_codes;
    ANALYZE oauth2_access_tokens;
    ANALYZE oauth2_refresh_tokens;
END;
$$ LANGUAGE plpgsql;

-- Create indexes for better VACUUM performance
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_vacuum ON refresh_tokens(revoked_at, issued_at);
CREATE INDEX IF NOT EXISTS idx_oauth2_codes_vacuum ON oauth2_authorization_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_oauth2_access_vacuum ON oauth2_access_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_oauth2_refresh_vacuum ON oauth2_refresh_tokens(expires_at);

-- Enable auto-vacuum for performance tables
ALTER TABLE users SET (
    autovacuum_vacuum_scale_factor = 0.1,
    autovacuum_analyze_scale_factor = 0.05
);

ALTER TABLE refresh_tokens SET (
    autovacuum_vacuum_scale_factor = 0.2,
    autovacuum_analyze_scale_factor = 0.1
);

-- Comments for documentation
COMMENT ON INDEX idx_users_email IS 'Optimizes user lookup by email for OAuth linking';
COMMENT ON INDEX idx_users_provider_lookup IS 'Optimizes OAuth provider user lookup';
COMMENT ON INDEX idx_refresh_tokens_hash_lookup IS 'Optimizes refresh token validation';
COMMENT ON INDEX idx_list_config_user_type_enabled IS 'Optimizes user list queries by type and status';
COMMENT ON VIEW active_users IS 'Pre-computed view for admin user management';
COMMENT ON VIEW user_stats IS 'Pre-computed statistics for dashboard metrics';
COMMENT ON FUNCTION cleanup_expired_tokens IS 'Maintenance function to clean expired tokens and update statistics';