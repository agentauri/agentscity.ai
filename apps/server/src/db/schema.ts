/**
 * Database schema for Agents City
 * Using Drizzle ORM with PostgreSQL
 *
 * Multi-tenancy: Tables that support tenant isolation have a tenant_id column.
 * The tenant_id is nullable to support backward compatibility with the
 * single-tenant "default" world. New tenant-scoped data MUST have tenant_id set.
 */

import {
  pgTable,
  uuid,
  varchar,
  integer,
  bigint,
  real,
  timestamp,
  jsonb,
  text,
  boolean,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';

// =============================================================================
// TENANTS (Multi-tenancy support)
// =============================================================================

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),

  // Authentication
  apiKeyHash: varchar('api_key_hash', { length: 128 }).notNull().unique(),

  // Resource limits
  maxAgents: integer('max_agents').notNull().default(20),
  maxTicksPerDay: integer('max_ticks_per_day').notNull().default(1000),
  maxEventsStored: integer('max_events_stored').notNull().default(100000),

  // Simulation settings
  tickIntervalMs: integer('tick_interval_ms').notNull().default(60000),
  gridWidth: integer('grid_width').notNull().default(100),
  gridHeight: integer('grid_height').notNull().default(100),

  // Status
  isActive: boolean('is_active').notNull().default(true),
  isPaused: boolean('is_paused').notNull().default(false),

  // Metadata
  description: varchar('description', { length: 1000 }),
  ownerEmail: varchar('owner_email', { length: 255 }),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
}, (table) => [
  index('tenants_api_key_hash_idx').on(table.apiKeyHash),
  index('tenants_is_active_idx').on(table.isActive),
]);

// =============================================================================
// TENANT USAGE TRACKING
// =============================================================================

export const tenantUsage = pgTable('tenant_usage', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),

  // Usage date (for daily aggregation)
  usageDate: timestamp('usage_date', { withTimezone: true }).notNull(),

  // Counters
  ticksProcessed: integer('ticks_processed').notNull().default(0),
  eventsGenerated: integer('events_generated').notNull().default(0),
  llmCallsMade: integer('llm_calls_made').notNull().default(0),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('tenant_usage_tenant_idx').on(table.tenantId),
  index('tenant_usage_date_idx').on(table.usageDate),
  uniqueIndex('tenant_usage_tenant_date_idx').on(table.tenantId, table.usageDate),
]);

// =============================================================================
// TENANT WORLD STATE
// =============================================================================

export const tenantWorldState = pgTable('tenant_world_state', {
  tenantId: uuid('tenant_id').primaryKey().references(() => tenants.id, { onDelete: 'cascade' }),

  // Simulation state
  currentTick: bigint('current_tick', { mode: 'number' }).notNull().default(0),

  // Timestamps
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  lastTickAt: timestamp('last_tick_at', { withTimezone: true }),
});

// =============================================================================
// WORLD STATE (Legacy - for default/single-tenant mode)
// =============================================================================

export const worldState = pgTable('world_state', {
  id: integer('id').primaryKey().default(1),
  currentTick: bigint('current_tick', { mode: 'number' }).notNull().default(0),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  lastTickAt: timestamp('last_tick_at', { withTimezone: true }),
  isPaused: boolean('is_paused').notNull().default(false),
});

// =============================================================================
// AGENTS
// =============================================================================

export const agents = pgTable('agents', {
  id: uuid('id').primaryKey(),

  // Multi-tenancy: null = default/legacy world
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),

  llmType: varchar('llm_type', { length: 20 }).notNull(), // claude, codex, gemini, deepseek, qwen, glm

  // Position
  x: integer('x').notNull().default(0),
  y: integer('y').notNull().default(0),

  // Needs (0-100)
  hunger: real('hunger').notNull().default(100),
  energy: real('energy').notNull().default(100),
  health: real('health').notNull().default(100),

  // Economy
  balance: real('balance').notNull().default(100),

  // State
  state: varchar('state', { length: 20 }).notNull().default('idle'), // idle, walking, working, sleeping, dead
  color: varchar('color', { length: 7 }).notNull().default('#888888'),

  // Personality (Phase 5: Personality Diversification)
  // Nullable for backward compatibility - null means 'neutral'
  personality: text('personality'), // aggressive, cooperative, cautious, explorer, social, neutral

  // Metadata
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  diedAt: timestamp('died_at', { withTimezone: true }),
}, (table) => [
  index('agents_tenant_idx').on(table.tenantId),
  index('agents_state_idx').on(table.state),
  index('agents_position_idx').on(table.x, table.y),
  index('agents_tenant_state_idx').on(table.tenantId, table.state),
  index('agents_personality_idx').on(table.personality),
]);

// =============================================================================
// SHELTERS (Generic structures - no predefined function!)
// =============================================================================

export const shelters = pgTable('shelters', {
  id: uuid('id').primaryKey(),

  // Multi-tenancy
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),

  // Position
  x: integer('x').notNull(),
  y: integer('y').notNull(),

  // Physical properties only - NO functional type!
  canSleep: boolean('can_sleep').notNull().default(true), // Agents can rest here

  // Owner (optional - emergent property rights)
  ownerAgentId: uuid('owner_agent_id').references(() => agents.id),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('shelters_tenant_idx').on(table.tenantId),
  index('shelters_position_idx').on(table.x, table.y),
  index('shelters_tenant_position_idx').on(table.tenantId, table.x, table.y),
]);

// =============================================================================
// RESOURCE SPAWNS (Geographical resource distribution - like Sugarscape)
// =============================================================================

export const resourceSpawns = pgTable('resource_spawns', {
  id: uuid('id').primaryKey(),

  // Multi-tenancy
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),

  // Position
  x: integer('x').notNull(),
  y: integer('y').notNull(),

  // Biome (affects regeneration rates and resource distribution)
  // forest: high food, medium energy | desert: low all, high material
  // tundra: low food, high energy | plains: balanced
  biome: varchar('biome', { length: 20 }).notNull().default('plains'),

  // Resource properties
  resourceType: varchar('resource_type', { length: 20 }).notNull(), // 'food' | 'energy' | 'material'
  maxAmount: integer('max_amount').notNull().default(10),
  currentAmount: integer('current_amount').notNull().default(10),
  regenRate: real('regen_rate').notNull().default(0.5), // Amount regenerated per tick

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('resource_spawns_tenant_idx').on(table.tenantId),
  index('resource_spawns_position_idx').on(table.x, table.y),
  index('resource_spawns_type_idx').on(table.resourceType),
  index('resource_spawns_biome_idx').on(table.biome),
  index('resource_spawns_tenant_type_idx').on(table.tenantId, table.resourceType),
]);

// =============================================================================
// INVENTORY
// =============================================================================

export const inventory = pgTable('inventory', {
  id: uuid('id').primaryKey(),

  // Multi-tenancy
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),

  agentId: uuid('agent_id').notNull().references(() => agents.id),
  itemType: varchar('item_type', { length: 50 }).notNull(), // food, tool, resource
  quantity: integer('quantity').notNull().default(1),
  properties: jsonb('properties').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('inventory_tenant_idx').on(table.tenantId),
  index('inventory_agent_idx').on(table.agentId),
  uniqueIndex('inventory_agent_item_idx').on(table.agentId, table.itemType),
]);

// =============================================================================
// LEDGER (Double-entry accounting)
// =============================================================================

export const ledger = pgTable('ledger', {
  id: uuid('id').primaryKey(),

  // Multi-tenancy
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),

  txId: uuid('tx_id').notNull(), // Groups debit/credit pair
  tick: bigint('tick', { mode: 'number' }).notNull(),

  // Accounts (null = system/treasury)
  fromAgentId: uuid('from_agent_id').references(() => agents.id),
  toAgentId: uuid('to_agent_id').references(() => agents.id),

  // Amount
  amount: real('amount').notNull(),

  // Classification
  category: varchar('category', { length: 20 }).notNull(), // salary, purchase, consumption, tax, welfare
  description: text('description'),

  // Metadata
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('ledger_tenant_idx').on(table.tenantId),
  index('ledger_tick_idx').on(table.tick),
  index('ledger_from_idx').on(table.fromAgentId),
  index('ledger_to_idx').on(table.toAgentId),
  index('ledger_tx_idx').on(table.txId),
]);

// =============================================================================
// EVENTS (Event Store - append-only)
// =============================================================================

export const events = pgTable('events', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),

  // Multi-tenancy
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),

  tick: bigint('tick', { mode: 'number' }).notNull(),

  // Event source
  agentId: uuid('agent_id').references(() => agents.id),

  // Event data
  eventType: varchar('event_type', { length: 50 }).notNull(),
  payload: jsonb('payload').notNull(),

  // Ordering
  version: bigint('version', { mode: 'number' }).notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('events_tenant_idx').on(table.tenantId),
  index('events_tick_idx').on(table.tick),
  index('events_agent_idx').on(table.agentId),
  index('events_type_idx').on(table.eventType),
  uniqueIndex('events_agent_version_idx').on(table.agentId, table.version),
  // Composite indexes for tenant-scoped queries
  index('events_tenant_tick_idx').on(table.tenantId, table.tick),
  index('events_type_tick_idx').on(table.eventType, table.tick),
]);

// =============================================================================
// AGENT MEMORIES (Phase 1: Emergence Observation)
// =============================================================================

export const agentMemories = pgTable('agent_memories', {
  id: uuid('id').primaryKey(),

  // Multi-tenancy
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),

  agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),

  // Memory classification
  type: varchar('type', { length: 20 }).notNull(), // 'observation' | 'action' | 'interaction' | 'reflection'

  // Content
  content: text('content').notNull(),

  // Importance scoring (for retrieval prioritization)
  importance: real('importance').notNull().default(5), // 1-10 scale

  // Emotional valence (-1 negative to +1 positive)
  emotionalValence: real('emotional_valence').notNull().default(0),

  // Other agents involved (for relationship tracking)
  involvedAgentIds: jsonb('involved_agent_ids').notNull().default([]),

  // Location context
  x: integer('x'),
  y: integer('y'),

  // Timing
  tick: bigint('tick', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('agent_memories_tenant_idx').on(table.tenantId),
  index('agent_memories_agent_idx').on(table.agentId),
  index('agent_memories_tick_idx').on(table.tick),
  index('agent_memories_type_idx').on(table.type),
  index('agent_memories_importance_idx').on(table.importance),
]);

// =============================================================================
// AGENT RELATIONSHIPS (Phase 1: Emergence Observation)
// =============================================================================

export const agentRelationships = pgTable('agent_relationships', {
  id: uuid('id').primaryKey(),

  // Multi-tenancy
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),

  agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  otherAgentId: uuid('other_agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),

  // Trust score (-100 to +100)
  trustScore: real('trust_score').notNull().default(0),

  // Interaction history
  interactionCount: integer('interaction_count').notNull().default(0),
  lastInteractionTick: bigint('last_interaction_tick', { mode: 'number' }),

  // Agent's notes about the other (LLM-generated)
  notes: text('notes'),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('agent_relationships_tenant_idx').on(table.tenantId),
  index('agent_relationships_agent_idx').on(table.agentId),
  index('agent_relationships_other_idx').on(table.otherAgentId),
  uniqueIndex('agent_relationships_pair_idx').on(table.agentId, table.otherAgentId),
  index('agent_relationships_trust_idx').on(table.trustScore),
]);

// =============================================================================
// AGENT KNOWLEDGE (Phase 2: Social Discovery)
// =============================================================================

export const agentKnowledge = pgTable('agent_knowledge', {
  id: uuid('id').primaryKey(),

  // Multi-tenancy
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),

  agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  knownAgentId: uuid('known_agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),

  // Discovery method
  discoveryType: varchar('discovery_type', { length: 20 }).notNull(), // 'direct' | 'referral'
  referredById: uuid('referred_by_id').references(() => agents.id, { onDelete: 'set null' }),
  referralDepth: integer('referral_depth').notNull().default(0), // 0 = direct, 1+ = referral chain length

  // Information about the known agent (may be stale or false)
  sharedInfo: jsonb('shared_info').notNull().default({}),

  // When the information was received (tick)
  informationAge: bigint('information_age', { mode: 'number' }).notNull(),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('agent_knowledge_tenant_idx').on(table.tenantId),
  index('agent_knowledge_agent_idx').on(table.agentId),
  index('agent_knowledge_known_idx').on(table.knownAgentId),
  uniqueIndex('agent_knowledge_pair_idx').on(table.agentId, table.knownAgentId),
  index('agent_knowledge_discovery_idx').on(table.discoveryType),
]);

// =============================================================================
// AGENT CLAIMS (Phase 1: Location Claiming - Emergent Territory)
// =============================================================================

export const agentClaims = pgTable('agent_claims', {
  id: uuid('id').primaryKey(),

  // Multi-tenancy
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),

  agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),

  // Claimed position
  x: integer('x').notNull(),
  y: integer('y').notNull(),

  // Claim type (emergent - agents decide what "claim" means)
  claimType: varchar('claim_type', { length: 30 }).notNull(), // 'territory' | 'home' | 'resource' | 'danger' | 'meeting_point'

  // Optional description (LLM-generated)
  description: text('description'),

  // Claim strength (can be contested)
  strength: real('strength').notNull().default(1), // 0-10, decays over time without reinforcement

  // Timing
  claimedAtTick: bigint('claimed_at_tick', { mode: 'number' }).notNull(),
  lastReinforcedTick: bigint('last_reinforced_tick', { mode: 'number' }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('agent_claims_tenant_idx').on(table.tenantId),
  index('agent_claims_agent_idx').on(table.agentId),
  index('agent_claims_position_idx').on(table.x, table.y),
  index('agent_claims_type_idx').on(table.claimType),
]);

// =============================================================================
// LOCATION NAMES (Phase 1: Emergent Naming Conventions)
// =============================================================================

export const locationNames = pgTable('location_names', {
  id: uuid('id').primaryKey(),

  // Multi-tenancy
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),

  // Location being named
  x: integer('x').notNull(),
  y: integer('y').notNull(),

  // The name given
  name: varchar('name', { length: 50 }).notNull(),

  // Who proposed this name
  namedByAgentId: uuid('named_by_agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),

  // Consensus tracking (how many agents use this name)
  usageCount: integer('usage_count').notNull().default(1),

  // When first named
  namedAtTick: bigint('named_at_tick', { mode: 'number' }).notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('location_names_tenant_idx').on(table.tenantId),
  index('location_names_position_idx').on(table.x, table.y),
  index('location_names_name_idx').on(table.name),
  uniqueIndex('location_names_position_name_idx').on(table.x, table.y, table.name),
]);

// =============================================================================
// SNAPSHOTS (for efficient replay)
// =============================================================================

export const snapshots = pgTable('snapshots', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),

  // Multi-tenancy
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),

  agentId: uuid('agent_id').notNull().references(() => agents.id),
  state: jsonb('state').notNull(),
  eventVersion: bigint('event_version', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('snapshots_tenant_idx').on(table.tenantId),
  uniqueIndex('snapshots_agent_version_idx').on(table.agentId, table.eventVersion),
]);

// =============================================================================
// EXPERIMENTS (A/B Testing Framework)
// =============================================================================

export const experiments = pgTable('experiments', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Multi-tenancy
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),

  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  status: varchar('status', { length: 50 }).notNull().default('planning'), // planning, running, completed, cancelled
  hypothesis: text('hypothesis'),
  metrics: jsonb('metrics').$type<string[]>(), // Which metrics to track
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [
  index('experiments_tenant_idx').on(table.tenantId),
  index('experiments_status_idx').on(table.status),
]);

export const experimentVariants = pgTable('experiment_variants', {
  id: uuid('id').primaryKey().defaultRandom(),
  experimentId: uuid('experiment_id').notNull().references(() => experiments.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  configOverrides: jsonb('config_overrides').$type<Record<string, unknown>>(), // Override CONFIG values
  agentConfigs: jsonb('agent_configs').$type<Array<{
    llmType: string;
    name: string;
    color: string;
    startX: number;
    startY: number;
  }>>(),
  worldSeed: integer('world_seed'), // For reproducibility
  status: varchar('status', { length: 50 }).notNull().default('pending'), // pending, running, completed, failed
  startTick: bigint('start_tick', { mode: 'number' }),
  endTick: bigint('end_tick', { mode: 'number' }),
  durationTicks: integer('duration_ticks').default(100), // How many ticks to run
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [
  index('experiment_variants_experiment_idx').on(table.experimentId),
  index('experiment_variants_status_idx').on(table.status),
]);

export const variantSnapshots = pgTable('variant_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  variantId: uuid('variant_id').notNull().references(() => experimentVariants.id, { onDelete: 'cascade' }),
  tick: bigint('tick', { mode: 'number' }).notNull(),
  metricsSnapshot: jsonb('metrics_snapshot').$type<{
    giniCoefficient?: number;
    cooperationIndex?: number;
    avgWealth?: number;
    avgHealth?: number;
    avgHunger?: number;
    avgEnergy?: number;
    aliveAgents?: number;
    totalEvents?: number;
    tradeCount?: number;
    conflictCount?: number;
    clusteringCoefficient?: number;
  }>(),
  agentStates: jsonb('agent_states').$type<Array<{
    id: string;
    llmType: string;
    x: number;
    y: number;
    hunger: number;
    energy: number;
    health: number;
    balance: number;
    state: string;
  }>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('variant_snapshots_variant_idx').on(table.variantId),
  index('variant_snapshots_tick_idx').on(table.tick),
]);

// =============================================================================
// AGENT ROLES (Phase 2: Role Crystallization)
// =============================================================================

export const agentRoles = pgTable('agent_roles', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Multi-tenancy
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),

  agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 50 }).notNull(), // gatherer, trader, worker, enforcer, predator, explorer
  confidence: real('confidence').notNull().default(0), // 0-1 confidence score
  detectedAtTick: bigint('detected_at_tick', { mode: 'number' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('agent_roles_tenant_idx').on(table.tenantId),
  uniqueIndex('agent_roles_agent_idx').on(table.agentId),
  index('agent_roles_role_idx').on(table.role),
]);

// =============================================================================
// RETALIATION CHAINS (Phase 2: Conflict Tracking)
// =============================================================================

export const retaliationChains = pgTable('retaliation_chains', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Multi-tenancy
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),

  chainId: uuid('chain_id').notNull(), // Groups related retaliations
  attackerId: uuid('attacker_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  victimId: uuid('victim_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  actionType: varchar('action_type', { length: 50 }).notNull(), // harm, steal
  depth: integer('depth').notNull().default(0), // 0 = initial attack, 1+ = retaliations
  tick: bigint('tick', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('retaliation_chains_tenant_idx').on(table.tenantId),
  index('retaliation_chains_chain_idx').on(table.chainId),
  index('retaliation_chains_attacker_idx').on(table.attackerId),
  index('retaliation_chains_victim_idx').on(table.victimId),
]);

// =============================================================================
// EXTERNAL AGENTS (Phase 3: A2A Protocol)
// =============================================================================

export const externalAgents = pgTable('external_agents', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Multi-tenancy
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),

  agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  apiKeyHash: varchar('api_key_hash', { length: 128 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  endpoint: varchar('endpoint', { length: 500 }), // Webhook URL for push mode
  ownerEmail: varchar('owner_email', { length: 255 }),
  rateLimitPerTick: integer('rate_limit_per_tick').notNull().default(1),
  rateLimitPerMinute: integer('rate_limit_per_minute').notNull().default(60),
  isActive: boolean('is_active').notNull().default(true),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('external_agents_tenant_idx').on(table.tenantId),
  uniqueIndex('external_agents_agent_idx').on(table.agentId),
  index('external_agents_api_key_hash_idx').on(table.apiKeyHash),
]);

export const apiUsage = pgTable('api_usage', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  externalAgentId: uuid('external_agent_id').notNull().references(() => externalAgents.id, { onDelete: 'cascade' }),
  tick: bigint('tick', { mode: 'number' }).notNull(),
  actionCount: integer('action_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('api_usage_agent_tick_idx').on(table.externalAgentId, table.tick),
]);

// =============================================================================
// VERIFIABLE CREDENTIALS (Phase 4: §34)
// =============================================================================

export const agentCredentials = pgTable('agent_credentials', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Multi-tenancy
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),

  // Timing
  tick: bigint('tick', { mode: 'number' }).notNull(),

  // Parties
  issuerId: uuid('issuer_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  issuerSignature: varchar('issuer_signature', { length: 256 }).notNull(),

  subjectId: uuid('subject_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),

  // Claim details
  claimType: varchar('claim_type', { length: 50 }).notNull(), // skill, experience, membership, character, custom
  claimDescription: text('claim_description').notNull(),
  claimEvidence: text('claim_evidence'),
  claimLevel: integer('claim_level'), // 1-10 proficiency (optional)

  // Validity
  expiresAtTick: bigint('expires_at_tick', { mode: 'number' }),
  revoked: boolean('revoked').notNull().default(false),
  revokedAtTick: bigint('revoked_at_tick', { mode: 'number' }),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('agent_credentials_tenant_idx').on(table.tenantId),
  index('agent_credentials_issuer_idx').on(table.issuerId),
  index('agent_credentials_subject_idx').on(table.subjectId),
  index('agent_credentials_claim_type_idx').on(table.claimType),
  index('agent_credentials_tick_idx').on(table.tick),
]);

// =============================================================================
// GOSSIP EVENTS (Phase 4: §35 - Analytics only)
// =============================================================================

export const gossipEvents = pgTable('gossip_events', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),

  // Multi-tenancy
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),

  tick: bigint('tick', { mode: 'number' }).notNull(),

  sourceAgentId: uuid('source_agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  targetAgentId: uuid('target_agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  subjectAgentId: uuid('subject_agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),

  topic: varchar('topic', { length: 50 }).notNull(), // skill, behavior, transaction, warning, recommendation
  claim: text('claim').notNull(),
  sentiment: integer('sentiment').notNull(), // -100 to +100

  // Evidence linking
  evidenceEventId: bigint('evidence_event_id', { mode: 'number' }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('gossip_events_tenant_tick_idx').on(table.tenantId, table.tick),
  index('gossip_events_subject_idx').on(table.subjectAgentId),
  index('gossip_events_source_idx').on(table.sourceAgentId),
]);

// =============================================================================
// AGENT LINEAGES (Phase 4: §36 - Reproduction)
// =============================================================================

export const agentLineages = pgTable('agent_lineages', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Multi-tenancy
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),

  // Agent
  agentId: uuid('agent_id').notNull().unique().references(() => agents.id, { onDelete: 'cascade' }),

  // Lineage
  generation: integer('generation').notNull().default(0),
  parentIds: jsonb('parent_ids').notNull().default([]), // Array of parent UUIDs
  spawnedAtTick: bigint('spawned_at_tick', { mode: 'number' }).notNull(),
  spawnedByParentId: uuid('spawned_by_parent_id').references(() => agents.id),

  // Traits
  systemPromptBase: text('system_prompt_base'),
  mutations: jsonb('mutations').notNull().default([]),

  // Initial state
  initialBalance: real('initial_balance'),
  initialEnergy: real('initial_energy'),
  initialSpawnX: integer('initial_spawn_x'),
  initialSpawnY: integer('initial_spawn_y'),

  // Inherited relationships
  inheritedRelationships: jsonb('inherited_relationships').notNull().default([]),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('agent_lineages_tenant_idx').on(table.tenantId),
  index('agent_lineages_generation_idx').on(table.generation),
  index('agent_lineages_spawned_by_idx').on(table.spawnedByParentId),
]);

export const reproductionStates = pgTable('reproduction_states', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Multi-tenancy
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),

  parentAgentId: uuid('parent_agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  partnerAgentId: uuid('partner_agent_id').references(() => agents.id),

  gestationStartTick: bigint('gestation_start_tick', { mode: 'number' }).notNull(),
  gestationDurationTicks: integer('gestation_duration_ticks').notNull(),

  offspringAgentId: uuid('offspring_agent_id').references(() => agents.id),
  status: varchar('status', { length: 50 }).notNull(), // gestating, completed, failed
  failureReason: text('failure_reason'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [
  index('reproduction_states_parent_idx').on(table.parentAgentId),
  index('reproduction_states_status_idx').on(table.status),
]);

// =============================================================================
// LLM METRICS (Phase 4: §37 - Performance Monitoring)
// =============================================================================

export const llmMetrics = pgTable('llm_metrics', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),

  // Multi-tenancy
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),

  agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  modelId: varchar('model_id', { length: 100 }).notNull(),

  tick: bigint('tick', { mode: 'number' }).notNull(),

  // Performance
  latencyMs: integer('latency_ms').notNull(),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  costUsd: real('cost_usd'),

  // Quality
  success: boolean('success').notNull().default(true),
  usedFallback: boolean('used_fallback').notNull().default(false),
  errorType: varchar('error_type', { length: 100 }),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('llm_metrics_tenant_tick_idx').on(table.tenantId, table.tick),
  index('llm_metrics_agent_idx').on(table.agentId),
  index('llm_metrics_model_idx').on(table.modelId),
]);

export const tokenBudgets = pgTable('token_budgets', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Multi-tenancy
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),

  agentId: uuid('agent_id').unique().references(() => agents.id, { onDelete: 'cascade' }), // NULL for tenant-wide default

  maxInputTokens: integer('max_input_tokens').notNull().default(2000),
  maxOutputTokens: integer('max_output_tokens').notNull().default(256),
  maxTokensPerTick: integer('max_tokens_per_tick').notNull().default(15000),
  maxLatencyMs: integer('max_latency_ms').notNull().default(30000),

  thinkingRatioWarn: real('thinking_ratio_warn').notNull().default(3.0),
  thinkingRatioCritical: real('thinking_ratio_critical').notNull().default(5.0),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('token_budgets_tenant_idx').on(table.tenantId),
]);

// =============================================================================
// Type exports
// =============================================================================

// Tenants
export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type TenantUsage = typeof tenantUsage.$inferSelect;
export type NewTenantUsage = typeof tenantUsage.$inferInsert;
export type TenantWorldState = typeof tenantWorldState.$inferSelect;
export type NewTenantWorldState = typeof tenantWorldState.$inferInsert;

// Core types
export type WorldState = typeof worldState.$inferSelect;
export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type Shelter = typeof shelters.$inferSelect;
export type NewShelter = typeof shelters.$inferInsert;
export type ResourceSpawn = typeof resourceSpawns.$inferSelect;
export type NewResourceSpawn = typeof resourceSpawns.$inferInsert;
export type InventoryItem = typeof inventory.$inferSelect;
export type LedgerEntry = typeof ledger.$inferSelect;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Snapshot = typeof snapshots.$inferSelect;

// Phase 1: Memory types
export type AgentMemory = typeof agentMemories.$inferSelect;
export type NewAgentMemory = typeof agentMemories.$inferInsert;
export type AgentRelationship = typeof agentRelationships.$inferSelect;
export type NewAgentRelationship = typeof agentRelationships.$inferInsert;

// Phase 2: Knowledge types
export type AgentKnowledge = typeof agentKnowledge.$inferSelect;
export type NewAgentKnowledge = typeof agentKnowledge.$inferInsert;

// Phase 1: Claims and Naming types
export type AgentClaim = typeof agentClaims.$inferSelect;
export type NewAgentClaim = typeof agentClaims.$inferInsert;
export type LocationName = typeof locationNames.$inferSelect;
export type NewLocationName = typeof locationNames.$inferInsert;

// Experiments types (A/B Testing)
export type Experiment = typeof experiments.$inferSelect;
export type NewExperiment = typeof experiments.$inferInsert;
export type ExperimentVariant = typeof experimentVariants.$inferSelect;
export type NewExperimentVariant = typeof experimentVariants.$inferInsert;
export type VariantSnapshot = typeof variantSnapshots.$inferSelect;
export type NewVariantSnapshot = typeof variantSnapshots.$inferInsert;

// Phase 2: Role and Conflict types
export type AgentRole = typeof agentRoles.$inferSelect;
export type NewAgentRole = typeof agentRoles.$inferInsert;
export type RetaliationChain = typeof retaliationChains.$inferSelect;
export type NewRetaliationChain = typeof retaliationChains.$inferInsert;

// Phase 3: External Agents types
export type ExternalAgent = typeof externalAgents.$inferSelect;
export type NewExternalAgent = typeof externalAgents.$inferInsert;
export type ApiUsage = typeof apiUsage.$inferSelect;
export type NewApiUsage = typeof apiUsage.$inferInsert;

// Phase 4: Verifiable Credentials types (§34)
export type AgentCredential = typeof agentCredentials.$inferSelect;
export type NewAgentCredential = typeof agentCredentials.$inferInsert;

// Phase 4: Gossip Events types (§35)
export type GossipEvent = typeof gossipEvents.$inferSelect;
export type NewGossipEvent = typeof gossipEvents.$inferInsert;

// Phase 4: Reproduction types (§36)
export type AgentLineage = typeof agentLineages.$inferSelect;
export type NewAgentLineage = typeof agentLineages.$inferInsert;
export type ReproductionState = typeof reproductionStates.$inferSelect;
export type NewReproductionState = typeof reproductionStates.$inferInsert;

// Phase 4: LLM Performance types (§37)
export type LLMMetric = typeof llmMetrics.$inferSelect;
export type NewLLMMetric = typeof llmMetrics.$inferInsert;
export type TokenBudget = typeof tokenBudgets.$inferSelect;
export type NewTokenBudget = typeof tokenBudgets.$inferInsert;

// Backwards compatibility alias (for migration period)
export type Location = Shelter;
export type NewLocation = NewShelter;
