-- OAuth2 Support Migration
-- Add OAuth2 provider support to existing users table and create OAuth2 client/authorization tables

-- Add OAuth2 provider fields to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'local',
ADD COLUMN IF NOT EXISTS provider_id TEXT,
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;

-- Make password_hash nullable for OAuth2 users
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Create OAuth2 clients table
CREATE TABLE IF NOT EXISTS oauth2_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT UNIQUE NOT NULL,
  client_secret TEXT NOT NULL,
  name TEXT NOT NULL,
  redirect_uris TEXT[] NOT NULL,
  grant_types TEXT[] NOT NULL DEFAULT ARRAY['authorization_code', 'refresh_token'],
  scope TEXT DEFAULT 'read write',
  trusted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create OAuth2 authorization codes table
CREATE TABLE IF NOT EXISTS oauth2_authorization_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  authorization_code TEXT UNIQUE NOT NULL,
  client_id TEXT NOT NULL REFERENCES oauth2_clients(client_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  scope TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create OAuth2 access tokens table
CREATE TABLE IF NOT EXISTS oauth2_access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token TEXT UNIQUE NOT NULL,
  client_id TEXT NOT NULL REFERENCES oauth2_clients(client_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create OAuth2 refresh tokens table (separate from existing refresh_tokens)
CREATE TABLE IF NOT EXISTS oauth2_refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  refresh_token TEXT UNIQUE NOT NULL,
  client_id TEXT NOT NULL REFERENCES oauth2_clients(client_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for OAuth2 tables
CREATE INDEX IF NOT EXISTS idx_oauth2_auth_codes_code ON oauth2_authorization_codes(authorization_code);
CREATE INDEX IF NOT EXISTS idx_oauth2_auth_codes_client ON oauth2_authorization_codes(client_id);
CREATE INDEX IF NOT EXISTS idx_oauth2_auth_codes_user ON oauth2_authorization_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth2_access_tokens_token ON oauth2_access_tokens(access_token);
CREATE INDEX IF NOT EXISTS idx_oauth2_access_tokens_client ON oauth2_access_tokens(client_id);
CREATE INDEX IF NOT EXISTS idx_oauth2_access_tokens_user ON oauth2_access_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth2_refresh_tokens_token ON oauth2_refresh_tokens(refresh_token);
CREATE INDEX IF NOT EXISTS idx_oauth2_refresh_tokens_client ON oauth2_refresh_tokens(client_id);
CREATE INDEX IF NOT EXISTS idx_oauth2_refresh_tokens_user ON oauth2_refresh_tokens(user_id);

-- Add unique constraint for provider users
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_provider_unique ON users(provider, provider_id) WHERE provider != 'local';

-- Insert default OAuth2 client for the application
INSERT INTO oauth2_clients (client_id, client_secret, name, redirect_uris, grant_types, scope, trusted)
VALUES (
  'stremio-trakt-app',
  gen_random_uuid()::text,
  'Stremio Trakt Multi-User App',
  ARRAY['http://localhost:8080/auth/callback', 'https://yourdomain.com/auth/callback'],
  ARRAY['authorization_code', 'refresh_token', 'client_credentials'],
  'read write admin',
  true
) ON CONFLICT (client_id) DO NOTHING;