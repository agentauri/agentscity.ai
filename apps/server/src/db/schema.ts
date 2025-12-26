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
// LOCATIONS
// =============================================================================

export const locations = pgTable('locations', {
  id: uuid('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  type: varchar('type', { length: 20 }).notNull(), // residential, commercial, industrial, civic

  // Position
  x: integer('x').notNull(),
  y: integer('y').notNull(),

  // Owner (optional)
  ownerAgentId: uuid('owner_agent_id').references(() => agents.id),

  // Properties
  properties: jsonb('properties').default({}),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('locations_position_idx').on(table.x, table.y),
  index('locations_type_idx').on(table.type),
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
export type Location = typeof locations.$inferSelect;
export type NewLocation = typeof locations.$inferInsert;
export type InventoryItem = typeof inventory.$inferSelect;
export type LedgerEntry = typeof ledger.$inferSelect;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Snapshot = typeof snapshots.$inferSelect;
