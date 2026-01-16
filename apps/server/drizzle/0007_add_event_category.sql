-- Migration: Add event category for separating infrastructure vs emergent events
-- This separation is critical for scientific analysis
-- Phase 2: Event Stream Separation

-- Step 1: Create the event_category enum type
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_category') THEN
        CREATE TYPE event_category AS ENUM ('infrastructure', 'emergent', 'puzzle', 'observation');
    END IF;
END$$;

-- Step 2: Add category column with default 'emergent'
-- Using 'emergent' as default so existing events are treated conservatively
ALTER TABLE events ADD COLUMN IF NOT EXISTS category event_category NOT NULL DEFAULT 'emergent';

-- Step 3: Backfill existing infrastructure events
-- Identify and categorize system-imposed events
UPDATE events SET category = 'infrastructure'
WHERE event_type IN (
    'tick_start',
    'tick_end',
    'agent_spawned',
    'agent_died',
    'agent_born',
    'needs_decay',
    'hunger_decay',
    'energy_decay',
    'health_decay',
    'resource_regenerated',
    'shock_resource',
    'shock_health'
)
AND category = 'emergent';

-- Step 4: Backfill puzzle events
UPDATE events SET category = 'puzzle'
WHERE event_type IN (
    'puzzle_created',
    'puzzle_started',
    'puzzle_completed',
    'puzzle_failed',
    'puzzle_expired',
    'agent_joined_puzzle',
    'agent_left_puzzle',
    'agent_received_fragment',
    'agent_shared_fragment',
    'agent_formed_team',
    'agent_joined_team',
    'agent_submitted_solution'
)
AND category = 'emergent';

-- Step 5: Backfill observation events
UPDATE events SET category = 'observation'
WHERE event_type IN (
    'metrics_snapshot',
    'world_snapshot',
    'experiment_started',
    'experiment_ended'
)
AND category = 'emergent';

-- Step 6: Add indexes for efficient category-based queries
CREATE INDEX IF NOT EXISTS events_category_idx ON events(category);
CREATE INDEX IF NOT EXISTS events_category_tick_idx ON events(category, tick);

-- Step 7: Add composite index for scientific analysis queries
CREATE INDEX IF NOT EXISTS events_category_type_tick_idx ON events(category, event_type, tick);

-- Verify migration
DO $$
DECLARE
    category_count INT;
BEGIN
    SELECT COUNT(DISTINCT category) INTO category_count FROM events;
    RAISE NOTICE 'Event categories after migration: %', category_count;
END$$;
