-- Information Beliefs Tracking for Phase 4: Information Cascade Experiments
--
-- Tracks what information agents believe and how it spreads through the network.
-- Enables research on misinformation, information cascades, and belief correction.

-- Create the information_beliefs table
CREATE TABLE IF NOT EXISTS information_beliefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  info_hash VARCHAR(32) NOT NULL,  -- Hash of the claim for deduplication
  claim_type VARCHAR(50) NOT NULL,  -- 'resource_location', 'danger_warning', 'trade_offer', etc.
  claim_content JSONB NOT NULL,  -- The actual claim content
  is_true BOOLEAN,  -- NULL if unknown, true/false if verifiable
  source_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,  -- Who told them (NULL if injected)
  received_tick BIGINT NOT NULL,  -- When they received this info
  acted_on_tick BIGINT,  -- When they acted on this info (if ever)
  corrected_tick BIGINT,  -- When they learned it was false
  correction_source_id UUID REFERENCES agents(id) ON DELETE SET NULL,  -- Who corrected them
  spread_count INT DEFAULT 0,  -- How many agents this agent spread the info to
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX beliefs_agent_idx ON information_beliefs(agent_id);
CREATE INDEX beliefs_info_hash_idx ON information_beliefs(info_hash);
CREATE INDEX beliefs_tick_idx ON information_beliefs(received_tick);
CREATE INDEX beliefs_claim_type_idx ON information_beliefs(claim_type);
CREATE INDEX beliefs_is_true_idx ON information_beliefs(is_true) WHERE is_true IS NOT NULL;
CREATE INDEX beliefs_source_agent_idx ON information_beliefs(source_agent_id) WHERE source_agent_id IS NOT NULL;

-- Composite indexes for common queries
CREATE INDEX beliefs_agent_hash_idx ON information_beliefs(agent_id, info_hash);
CREATE INDEX beliefs_type_tick_idx ON information_beliefs(claim_type, received_tick);

-- Add comment explaining the table purpose
COMMENT ON TABLE information_beliefs IS 'Tracks information/beliefs held by agents for cascade experiments';
COMMENT ON COLUMN information_beliefs.info_hash IS 'SHA256 hash (first 32 chars) of claim for deduplication';
COMMENT ON COLUMN information_beliefs.is_true IS 'NULL if unverifiable, TRUE/FALSE for verifiable claims';
COMMENT ON COLUMN information_beliefs.source_agent_id IS 'NULL if experimentally injected, otherwise the agent who shared it';
COMMENT ON COLUMN information_beliefs.spread_count IS 'Number of times this agent shared this belief with others';
