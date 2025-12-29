/**
 * Database schema for Agents City
 * Using Drizzle ORM with PostgreSQL
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
// WORLD STATE
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

  // Metadata
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  diedAt: timestamp('died_at', { withTimezone: true }),
}, (table) => [
  index('agents_state_idx').on(table.state),
  index('agents_position_idx').on(table.x, table.y),
]);

// =============================================================================
// SHELTERS (Generic structures - no predefined function!)
// =============================================================================

export const shelters = pgTable('shelters', {
  id: uuid('id').primaryKey(),

  // Position
  x: integer('x').notNull(),
  y: integer('y').notNull(),

  // Physical properties only - NO functional type!
  canSleep: boolean('can_sleep').notNull().default(true), // Agents can rest here

  // Owner (optional - emergent property rights)
  ownerAgentId: uuid('owner_agent_id').references(() => agents.id),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('shelters_position_idx').on(table.x, table.y),
]);

// =============================================================================
// RESOURCE SPAWNS (Geographical resource distribution - like Sugarscape)
// =============================================================================

export const resourceSpawns = pgTable('resource_spawns', {
  id: uuid('id').primaryKey(),

  // Position
  x: integer('x').notNull(),
  y: integer('y').notNull(),

  // Resource properties
  resourceType: varchar('resource_type', { length: 20 }).notNull(), // 'food' | 'energy' | 'material'
  maxAmount: integer('max_amount').notNull().default(10),
  currentAmount: integer('current_amount').notNull().default(10),
  regenRate: real('regen_rate').notNull().default(0.5), // Amount regenerated per tick

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('resource_spawns_position_idx').on(table.x, table.y),
  index('resource_spawns_type_idx').on(table.resourceType),
]);

// =============================================================================
// INVENTORY
// =============================================================================

export const inventory = pgTable('inventory', {
  id: uuid('id').primaryKey(),
  agentId: uuid('agent_id').notNull().references(() => agents.id),
  itemType: varchar('item_type', { length: 50 }).notNull(), // food, tool, resource
  quantity: integer('quantity').notNull().default(1),
  properties: jsonb('properties').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('inventory_agent_idx').on(table.agentId),
  uniqueIndex('inventory_agent_item_idx').on(table.agentId, table.itemType),
]);

// =============================================================================
// LEDGER (Double-entry accounting)
// =============================================================================

export const ledger = pgTable('ledger', {
  id: uuid('id').primaryKey(),
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
  index('events_tick_idx').on(table.tick),
  index('events_agent_idx').on(table.agentId),
  index('events_type_idx').on(table.eventType),
  uniqueIndex('events_agent_version_idx').on(table.agentId, table.version),
  // Phase 2: Composite index for analytics queries
  index('events_type_tick_idx').on(table.eventType, table.tick),
]);

// =============================================================================
// AGENT MEMORIES (Phase 1: Emergence Observation)
// =============================================================================

export const agentMemories = pgTable('agent_memories', {
  id: uuid('id').primaryKey(),
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
  index('agent_relationships_agent_idx').on(table.agentId),
  index('agent_relationships_other_idx').on(table.otherAgentId),
  uniqueIndex('agent_relationships_pair_idx').on(table.agentId, table.otherAgentId),
  // Phase 2: Index for community detection queries
  index('agent_relationships_trust_idx').on(table.trustScore),
]);

// =============================================================================
// AGENT KNOWLEDGE (Phase 2: Social Discovery)
// =============================================================================

export const agentKnowledge = pgTable('agent_knowledge', {
  id: uuid('id').primaryKey(),
  agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  knownAgentId: uuid('known_agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),

  // Discovery method
  discoveryType: varchar('discovery_type', { length: 20 }).notNull(), // 'direct' | 'referral'
  referredById: uuid('referred_by_id').references(() => agents.id, { onDelete: 'set null' }),
  referralDepth: integer('referral_depth').notNull().default(0), // 0 = direct, 1+ = referral chain length

  // Information about the known agent (may be stale or false)
  sharedInfo: jsonb('shared_info').notNull().default({}),
  // Example: { lastKnownPosition: {x, y}, reputationClaim: {sentiment, claim}, skills: [] }

  // When the information was received (tick)
  informationAge: bigint('information_age', { mode: 'number' }).notNull(),

  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('agent_knowledge_agent_idx').on(table.agentId),
  index('agent_knowledge_known_idx').on(table.knownAgentId),
  uniqueIndex('agent_knowledge_pair_idx').on(table.agentId, table.knownAgentId),
  // Phase 2: Index for referral chain analytics
  index('agent_knowledge_discovery_idx').on(table.discoveryType),
]);

// =============================================================================
// AGENT CLAIMS (Phase 1: Location Claiming - Emergent Territory)
// =============================================================================

export const agentClaims = pgTable('agent_claims', {
  id: uuid('id').primaryKey(),
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
  index('agent_claims_agent_idx').on(table.agentId),
  index('agent_claims_position_idx').on(table.x, table.y),
  index('agent_claims_type_idx').on(table.claimType),
  // Allow multiple claims per position (contested territories)
]);

// =============================================================================
// LOCATION NAMES (Phase 1: Emergent Naming Conventions)
// =============================================================================

export const locationNames = pgTable('location_names', {
  id: uuid('id').primaryKey(),

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
  index('location_names_position_idx').on(table.x, table.y),
  index('location_names_name_idx').on(table.name),
  uniqueIndex('location_names_position_name_idx').on(table.x, table.y, table.name),
]);

// =============================================================================
// SNAPSHOTS (for efficient replay)
// =============================================================================

export const snapshots = pgTable('snapshots', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  agentId: uuid('agent_id').notNull().references(() => agents.id),
  state: jsonb('state').notNull(),
  eventVersion: bigint('event_version', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('snapshots_agent_version_idx').on(table.agentId, table.eventVersion),
]);

// =============================================================================
// Type exports
// =============================================================================

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

// Backwards compatibility alias (for migration period)
export type Location = Shelter;
export type NewLocation = NewShelter;
