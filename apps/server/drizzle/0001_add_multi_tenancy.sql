-- Multi-tenancy migration for Agents City
-- Adds tenant_id columns to all relevant tables for isolated simulation environments

-- =============================================================================
-- Step 1: Create tenants table and related tables
-- =============================================================================

CREATE TABLE IF NOT EXISTS "tenants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(255) NOT NULL,
  "api_key_hash" varchar(128) NOT NULL UNIQUE,
  "max_agents" integer NOT NULL DEFAULT 20,
  "max_ticks_per_day" integer NOT NULL DEFAULT 1000,
  "max_events_stored" integer NOT NULL DEFAULT 100000,
  "tick_interval_ms" integer NOT NULL DEFAULT 60000,
  "grid_width" integer NOT NULL DEFAULT 100,
  "grid_height" integer NOT NULL DEFAULT 100,
  "is_active" boolean NOT NULL DEFAULT true,
  "is_paused" boolean NOT NULL DEFAULT false,
  "description" varchar(1000),
  "owner_email" varchar(255),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "last_active_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "tenants_api_key_hash_idx" ON "tenants" ("api_key_hash");
CREATE INDEX IF NOT EXISTS "tenants_is_active_idx" ON "tenants" ("is_active");

CREATE TABLE IF NOT EXISTS "tenant_usage" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "usage_date" timestamp with time zone NOT NULL,
  "ticks_processed" integer NOT NULL DEFAULT 0,
  "events_generated" integer NOT NULL DEFAULT 0,
  "llm_calls_made" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "tenant_usage_tenant_idx" ON "tenant_usage" ("tenant_id");
CREATE INDEX IF NOT EXISTS "tenant_usage_date_idx" ON "tenant_usage" ("usage_date");
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_usage_tenant_date_idx" ON "tenant_usage" ("tenant_id", "usage_date");

CREATE TABLE IF NOT EXISTS "tenant_world_state" (
  "tenant_id" uuid PRIMARY KEY REFERENCES "tenants"("id") ON DELETE CASCADE,
  "current_tick" bigint NOT NULL DEFAULT 0,
  "started_at" timestamp with time zone NOT NULL DEFAULT now(),
  "last_tick_at" timestamp with time zone
);

-- =============================================================================
-- Step 2: Add tenant_id to existing tables (nullable for backward compatibility)
-- =============================================================================

-- Agents
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "agents_tenant_idx" ON "agents" ("tenant_id");
CREATE INDEX IF NOT EXISTS "agents_tenant_state_idx" ON "agents" ("tenant_id", "state");

-- Shelters
ALTER TABLE "shelters" ADD COLUMN IF NOT EXISTS "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "shelters_tenant_idx" ON "shelters" ("tenant_id");
CREATE INDEX IF NOT EXISTS "shelters_tenant_position_idx" ON "shelters" ("tenant_id", "x", "y");

-- Resource Spawns
ALTER TABLE "resource_spawns" ADD COLUMN IF NOT EXISTS "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "resource_spawns_tenant_idx" ON "resource_spawns" ("tenant_id");
CREATE INDEX IF NOT EXISTS "resource_spawns_tenant_type_idx" ON "resource_spawns" ("tenant_id", "resource_type");

-- Inventory
ALTER TABLE "inventory" ADD COLUMN IF NOT EXISTS "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "inventory_tenant_idx" ON "inventory" ("tenant_id");

-- Ledger
ALTER TABLE "ledger" ADD COLUMN IF NOT EXISTS "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "ledger_tenant_idx" ON "ledger" ("tenant_id");

-- Events
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "events_tenant_idx" ON "events" ("tenant_id");
CREATE INDEX IF NOT EXISTS "events_tenant_tick_idx" ON "events" ("tenant_id", "tick");

-- Agent Memories
ALTER TABLE "agent_memories" ADD COLUMN IF NOT EXISTS "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "agent_memories_tenant_idx" ON "agent_memories" ("tenant_id");

-- Agent Relationships
ALTER TABLE "agent_relationships" ADD COLUMN IF NOT EXISTS "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "agent_relationships_tenant_idx" ON "agent_relationships" ("tenant_id");

-- Agent Knowledge
ALTER TABLE "agent_knowledge" ADD COLUMN IF NOT EXISTS "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "agent_knowledge_tenant_idx" ON "agent_knowledge" ("tenant_id");

-- Agent Claims
ALTER TABLE "agent_claims" ADD COLUMN IF NOT EXISTS "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "agent_claims_tenant_idx" ON "agent_claims" ("tenant_id");

-- Location Names
ALTER TABLE "location_names" ADD COLUMN IF NOT EXISTS "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "location_names_tenant_idx" ON "location_names" ("tenant_id");

-- Snapshots
ALTER TABLE "snapshots" ADD COLUMN IF NOT EXISTS "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "snapshots_tenant_idx" ON "snapshots" ("tenant_id");

-- Experiments
ALTER TABLE "experiments" ADD COLUMN IF NOT EXISTS "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "experiments_tenant_idx" ON "experiments" ("tenant_id");

-- Agent Roles
ALTER TABLE "agent_roles" ADD COLUMN IF NOT EXISTS "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "agent_roles_tenant_idx" ON "agent_roles" ("tenant_id");

-- Retaliation Chains
ALTER TABLE "retaliation_chains" ADD COLUMN IF NOT EXISTS "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "retaliation_chains_tenant_idx" ON "retaliation_chains" ("tenant_id");

-- External Agents
ALTER TABLE "external_agents" ADD COLUMN IF NOT EXISTS "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "external_agents_tenant_idx" ON "external_agents" ("tenant_id");

-- =============================================================================
-- Step 3: Add comments for documentation
-- =============================================================================

COMMENT ON TABLE "tenants" IS 'Multi-tenant isolation: Each tenant represents an isolated simulation environment for a researcher';
COMMENT ON COLUMN "tenants"."api_key_hash" IS 'SHA-256 hash of the tenant API key (format: act_<64 hex chars>)';
COMMENT ON COLUMN "tenants"."max_agents" IS 'Maximum number of agents allowed in this tenant world';
COMMENT ON COLUMN "tenants"."max_ticks_per_day" IS 'Rate limit: maximum ticks processed per day';
COMMENT ON COLUMN "tenants"."max_events_stored" IS 'Maximum events to store before pruning old events';

COMMENT ON TABLE "tenant_usage" IS 'Daily usage tracking for rate limiting and billing';
COMMENT ON TABLE "tenant_world_state" IS 'Per-tenant simulation state (tick counter, timestamps)';

COMMENT ON COLUMN "agents"."tenant_id" IS 'NULL = default/legacy world, UUID = tenant-scoped';
