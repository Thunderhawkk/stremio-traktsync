-- Session Management Enhancement Migration
-- Add comprehensive session tracking with security features

-- Create sessions table
CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_agent TEXT NOT NULL,
  ip_address INET,
  device_info JSONB,
  fingerprint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  security_flags TEXT[],
  last_suspicious_activity TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL
);

-- Create indexes for sessions table
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id, is_active, last_activity DESC);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(is_active, last_activity) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_sessions_fingerprint ON user_sessions(fingerprint);
CREATE INDEX IF NOT EXISTS idx_user_sessions_ip ON user_sessions(ip_address);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_created ON user_sessions(created_at DESC);

-- Add session tracking columns to users table if not exists
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS last_session_id TEXT,
  ADD COLUMN IF NOT EXISTS session_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_ip_address INET;

-- Create function to automatically cleanup expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions() RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete sessions that are explicitly expired
  DELETE FROM user_sessions 
  WHERE expires_at < NOW() OR 
        (last_activity < NOW() - INTERVAL '30 minutes' AND is_active = true) OR
        (created_at < NOW() - INTERVAL '12 hours' AND is_active = true);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Update statistics
  ANALYZE user_sessions;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to detect concurrent sessions
CREATE OR REPLACE FUNCTION check_concurrent_sessions(p_user_id UUID, p_max_sessions INTEGER DEFAULT 5) 
RETURNS TABLE(session_id TEXT, last_activity TIMESTAMPTZ, should_terminate BOOLEAN) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    us.id,
    us.last_activity,
    (ROW_NUMBER() OVER (ORDER BY us.last_activity DESC) > p_max_sessions) as should_terminate
  FROM user_sessions us
  WHERE us.user_id = p_user_id 
    AND us.is_active = true
    AND us.expires_at > NOW()
  ORDER BY us.last_activity DESC;
END;
$$ LANGUAGE plpgsql;

-- Create view for session analytics
CREATE OR REPLACE VIEW session_analytics AS
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as sessions_created,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(*) FILTER (WHERE device_info->>'device' = 'mobile') as mobile_sessions,
  COUNT(*) FILTER (WHERE device_info->>'device' = 'desktop') as desktop_sessions,
  COUNT(*) FILTER (WHERE security_flags IS NOT NULL AND array_length(security_flags, 1) > 0) as suspicious_sessions
FROM user_sessions
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour DESC;

-- Create view for active sessions summary
CREATE OR REPLACE VIEW active_sessions_summary AS
SELECT 
  u.id as user_id,
  u.username,
  COUNT(us.id) as active_sessions,
  MAX(us.last_activity) as latest_activity,
  COUNT(*) FILTER (WHERE us.security_flags IS NOT NULL) as suspicious_sessions,
  array_agg(DISTINCT us.ip_address) as ip_addresses
FROM users u
LEFT JOIN user_sessions us ON u.id = us.user_id AND us.is_active = true AND us.expires_at > NOW()
GROUP BY u.id, u.username
HAVING COUNT(us.id) > 0
ORDER BY active_sessions DESC, latest_activity DESC;

-- Add constraints
ALTER TABLE user_sessions ADD CONSTRAINT chk_session_id_length CHECK (length(id) >= 32);
ALTER TABLE user_sessions ADD CONSTRAINT chk_user_agent_not_empty CHECK (length(trim(user_agent)) > 0);

-- Comments for documentation
COMMENT ON TABLE user_sessions IS 'Enhanced session tracking with security features and device fingerprinting';
COMMENT ON COLUMN user_sessions.fingerprint IS 'Device fingerprint for security analysis';
COMMENT ON COLUMN user_sessions.security_flags IS 'Array of security flags (ip_change, user_agent_change, etc.)';
COMMENT ON FUNCTION cleanup_expired_sessions IS 'Removes expired and inactive sessions';
COMMENT ON FUNCTION check_concurrent_sessions IS 'Identifies sessions that exceed concurrent limit';
COMMENT ON VIEW session_analytics IS 'Hourly session creation statistics with device breakdown';
COMMENT ON VIEW active_sessions_summary IS 'Summary of active sessions per user with security indicators';