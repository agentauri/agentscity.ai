-- Migration: Add User Authentication & API Key Storage
-- Description: Creates users, sessions, and user_llm_keys tables for secure API key management

-- =============================================================================
-- USERS TABLE
-- Stores user accounts with email/password or OAuth authentication
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255), -- Nullable for OAuth-only users

  -- OAuth fields
  oauth_provider VARCHAR(20), -- 'google', 'github', etc.
  oauth_id VARCHAR(255),

  -- Profile
  display_name VARCHAR(100),
  avatar_url TEXT,

  -- Status
  is_verified BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for users
CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);
CREATE UNIQUE INDEX IF NOT EXISTS users_oauth_idx ON users(oauth_provider, oauth_id)
  WHERE oauth_provider IS NOT NULL AND oauth_id IS NOT NULL;

-- =============================================================================
-- SESSIONS TABLE
-- Stores JWT refresh token hashes for session management
-- =============================================================================

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash VARCHAR(128) NOT NULL,

  -- Session metadata
  user_agent TEXT,
  ip_address VARCHAR(45), -- IPv6 compatible

  -- Expiration
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for sessions
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_token_hash_idx ON sessions(refresh_token_hash);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);

-- =============================================================================
-- USER LLM KEYS TABLE
-- Stores encrypted API keys for LLM providers
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_llm_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL, -- 'anthropic', 'openai', 'google', etc.

  -- Encrypted key data (AES-256-GCM with envelope encryption)
  encrypted_key JSONB NOT NULL, -- {ciphertext, iv, authTag, salt, version}

  -- Metadata (not encrypted)
  key_prefix VARCHAR(20), -- 'sk-a...xyz' for display
  last_used TIMESTAMP WITH TIME ZONE,
  last_validated TIMESTAMP WITH TIME ZONE,
  is_valid BOOLEAN DEFAULT TRUE,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for user_llm_keys
CREATE UNIQUE INDEX IF NOT EXISTS user_llm_keys_user_provider_idx ON user_llm_keys(user_id, provider);
CREATE INDEX IF NOT EXISTS user_llm_keys_user_id_idx ON user_llm_keys(user_id);

-- =============================================================================
-- HELPER FUNCTION: Update updated_at on row modification
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for user_llm_keys
CREATE TRIGGER update_user_llm_keys_updated_at
  BEFORE UPDATE ON user_llm_keys
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
