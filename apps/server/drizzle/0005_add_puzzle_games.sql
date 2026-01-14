-- Fragment Chase: Collaborative Puzzle Game
-- Migration: Add puzzle games, fragments, participants, teams, and attempts tables

-- =============================================================================
-- PUZZLE GAMES (Main game instances)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "puzzle_games" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE CASCADE,
    "game_type" varchar(50) NOT NULL, -- 'coordinates', 'password', 'map', 'logic'
    "status" varchar(20) NOT NULL DEFAULT 'open', -- 'open', 'active', 'completed', 'expired'
    "solution" text NOT NULL, -- Correct solution (encrypted)
    "solution_hash" varchar(128), -- For verification
    "prize_pool" real NOT NULL DEFAULT 0,
    "entry_stake" real NOT NULL DEFAULT 5, -- CITY required to join
    "max_participants" integer NOT NULL DEFAULT 10,
    "min_participants" integer NOT NULL DEFAULT 2,
    "fragment_count" integer NOT NULL DEFAULT 5, -- Number of fragments needed
    "created_at_tick" bigint NOT NULL,
    "starts_at_tick" bigint,
    "ends_at_tick" bigint,
    "winner_id" uuid, -- Winning team or agent
    "created_at" timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "puzzle_games_tenant_idx" ON "puzzle_games"("tenant_id");
CREATE INDEX IF NOT EXISTS "puzzle_games_status_idx" ON "puzzle_games"("status");
CREATE INDEX IF NOT EXISTS "puzzle_games_tick_idx" ON "puzzle_games"("created_at_tick");

-- =============================================================================
-- PUZZLE TEAMS (Team formation for collaboration)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "puzzle_teams" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "game_id" uuid NOT NULL REFERENCES "puzzle_games"("id") ON DELETE CASCADE,
    "leader_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
    "name" varchar(100),
    "total_stake" real NOT NULL DEFAULT 0,
    "status" varchar(20) NOT NULL DEFAULT 'forming', -- 'forming', 'active', 'won', 'lost'
    "created_at_tick" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "puzzle_teams_game_idx" ON "puzzle_teams"("game_id");
CREATE INDEX IF NOT EXISTS "puzzle_teams_leader_idx" ON "puzzle_teams"("leader_id");
CREATE INDEX IF NOT EXISTS "puzzle_teams_status_idx" ON "puzzle_teams"("status");

-- =============================================================================
-- PUZZLE FRAGMENTS (Distributed information pieces)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "puzzle_fragments" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "game_id" uuid NOT NULL REFERENCES "puzzle_games"("id") ON DELETE CASCADE,
    "fragment_index" integer NOT NULL,
    "content" text NOT NULL, -- Fragment content (encrypted per owner)
    "hint" varchar(255), -- Non-revealing hint about fragment
    "owner_id" uuid REFERENCES "agents"("id") ON DELETE SET NULL, -- Current owner
    "original_owner_id" uuid REFERENCES "agents"("id") ON DELETE SET NULL, -- For tracking
    "shared_with" jsonb NOT NULL DEFAULT '[]', -- Array of agentIds who received this
    "created_at" timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "puzzle_fragments_game_idx" ON "puzzle_fragments"("game_id");
CREATE INDEX IF NOT EXISTS "puzzle_fragments_owner_idx" ON "puzzle_fragments"("owner_id");
CREATE INDEX IF NOT EXISTS "puzzle_fragments_original_owner_idx" ON "puzzle_fragments"("original_owner_id");
CREATE UNIQUE INDEX IF NOT EXISTS "puzzle_fragments_game_index_idx" ON "puzzle_fragments"("game_id", "fragment_index");

-- =============================================================================
-- PUZZLE PARTICIPANTS (Agents in a game)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "puzzle_participants" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "game_id" uuid NOT NULL REFERENCES "puzzle_games"("id") ON DELETE CASCADE,
    "agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
    "team_id" uuid REFERENCES "puzzle_teams"("id") ON DELETE SET NULL,
    "staked_amount" real NOT NULL DEFAULT 0,
    "contribution_score" real NOT NULL DEFAULT 0, -- For reward distribution
    "fragments_received" integer NOT NULL DEFAULT 0, -- Initially assigned
    "fragments_shared" integer NOT NULL DEFAULT 0, -- Shared with others
    "attempts_made" integer NOT NULL DEFAULT 0,
    "joined_at_tick" bigint NOT NULL,
    "status" varchar(20) NOT NULL DEFAULT 'active', -- 'active', 'left', 'banned'
    "created_at" timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "puzzle_participants_game_idx" ON "puzzle_participants"("game_id");
CREATE INDEX IF NOT EXISTS "puzzle_participants_agent_idx" ON "puzzle_participants"("agent_id");
CREATE INDEX IF NOT EXISTS "puzzle_participants_team_idx" ON "puzzle_participants"("team_id");
CREATE INDEX IF NOT EXISTS "puzzle_participants_status_idx" ON "puzzle_participants"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "puzzle_participants_game_agent_idx" ON "puzzle_participants"("game_id", "agent_id");

-- =============================================================================
-- PUZZLE ATTEMPTS (Solution submission history)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "puzzle_attempts" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "game_id" uuid NOT NULL REFERENCES "puzzle_games"("id") ON DELETE CASCADE,
    "submitter_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
    "team_id" uuid REFERENCES "puzzle_teams"("id") ON DELETE SET NULL,
    "attempted_solution" text NOT NULL,
    "is_correct" boolean NOT NULL DEFAULT false,
    "submitted_at_tick" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "puzzle_attempts_game_idx" ON "puzzle_attempts"("game_id");
CREATE INDEX IF NOT EXISTS "puzzle_attempts_submitter_idx" ON "puzzle_attempts"("submitter_id");
CREATE INDEX IF NOT EXISTS "puzzle_attempts_team_idx" ON "puzzle_attempts"("team_id");
CREATE INDEX IF NOT EXISTS "puzzle_attempts_tick_idx" ON "puzzle_attempts"("submitted_at_tick");
