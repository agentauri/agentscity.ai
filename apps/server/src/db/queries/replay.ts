/**
 * Replay Queries (Phase 3: Time Travel)
 *
 * Provides queries for reconstructing world state at any tick.
 * Uses event sourcing to replay agent actions and state changes.
 */

import { eq, sql, desc, and, gte, lte, asc } from 'drizzle-orm';
import { db, events, agents, resourceSpawns, shelters, worldState } from '../index';
import type { Agent, ResourceSpawn, Shelter, Event } from '../schema';

// =============================================================================
// Tick Range
// =============================================================================

export interface TickRange {
  minTick: number;
  maxTick: number;
  currentTick: number;
  totalEvents: number;
}

/**
 * Get the range of available ticks for replay
 */
export async function getTickRange(): Promise<TickRange> {
  const [tickStats, world] = await Promise.all([
    db.execute<{ min_tick: number; max_tick: number; total: number }>(sql`
      SELECT
        COALESCE(MIN(tick), 0) as min_tick,
        COALESCE(MAX(tick), 0) as max_tick,
        COUNT(*) as total
      FROM events
    `),
    db.select().from(worldState).limit(1),
  ]);

  const rows = Array.isArray(tickStats) ? tickStats : (tickStats as any).rows || [];
  const stats = rows[0] || { min_tick: 0, max_tick: 0, total: 0 };

  return {
    minTick: Number(stats.min_tick) || 0,
    maxTick: Number(stats.max_tick) || 0,
    currentTick: Number(world[0]?.currentTick) || 0,
    totalEvents: Number(stats.total) || 0,
  };
}

// =============================================================================
// Events in Range
// =============================================================================

export interface ReplayEvent {
  id: number;
  eventType: string;
  tick: number;
  agentId: string | null;
  payload: Record<string, unknown>;
  createdAt: Date;
}

/**
 * Get events in a tick range
 */
export async function getEventsInRange(
  fromTick: number,
  toTick: number,
  limit = 1000
): Promise<ReplayEvent[]> {
  const result = await db
    .select({
      id: events.id,
      eventType: events.eventType,
      tick: events.tick,
      agentId: events.agentId,
      payload: events.payload,
      createdAt: events.createdAt,
    })
    .from(events)
    .where(and(gte(events.tick, fromTick), lte(events.tick, toTick)))
    .orderBy(asc(events.tick), asc(events.id))
    .limit(limit);

  return result.map((e) => ({
    ...e,
    payload: e.payload as Record<string, unknown>,
  }));
}

/**
 * Get events at a specific tick
 */
export async function getEventsAtTick(tick: number): Promise<ReplayEvent[]> {
  return getEventsInRange(tick, tick, 500);
}

// =============================================================================
// Agent State History
// =============================================================================

export interface AgentStateAtTick {
  id: string;
  llmType: string;
  x: number;
  y: number;
  hunger: number;
  energy: number;
  health: number;
  balance: number;
  state: string;
  tick: number;
}

/**
 * Get all agents' state at a specific tick
 * Reconstructs state by finding the last state change before or at the tick
 */
export async function getAgentStatesAtTick(tick: number): Promise<AgentStateAtTick[]> {
  // Get all agents (including dead ones for historical replay)
  const allAgents = await db.select().from(agents);

  // For each agent, reconstruct their state at the given tick
  const states: AgentStateAtTick[] = [];

  for (const agent of allAgents) {
    // Get the last move event before or at this tick to find position
    const lastMoveEvent = await db
      .select()
      .from(events)
      .where(
        and(
          eq(events.agentId, agent.id),
          eq(events.eventType, 'agent_move'),
          lte(events.tick, tick)
        )
      )
      .orderBy(desc(events.tick), desc(events.id))
      .limit(1);

    // Get the last needs_updated event to find needs
    const lastNeedsEvent = await db
      .select()
      .from(events)
      .where(
        and(
          eq(events.agentId, agent.id),
          eq(events.eventType, 'needs_updated'),
          lte(events.tick, tick)
        )
      )
      .orderBy(desc(events.tick), desc(events.id))
      .limit(1);

    // Reconstruct state from events, falling back to current state
    let x = agent.x;
    let y = agent.y;
    let hunger = agent.hunger;
    let energy = agent.energy;
    let health = agent.health;
    let balance = agent.balance;

    if (lastMoveEvent[0]) {
      const payload = lastMoveEvent[0].payload as Record<string, unknown>;
      x = Number(payload.toX ?? x);
      y = Number(payload.toY ?? y);
    }

    if (lastNeedsEvent[0]) {
      const payload = lastNeedsEvent[0].payload as Record<string, unknown>;
      hunger = Number(payload.hunger ?? hunger);
      energy = Number(payload.energy ?? energy);
      health = Number(payload.health ?? health);
      balance = Number(payload.balance ?? balance);
    }

    // Only include agents that existed at this tick (check if they were born before)
    // For now, include all agents as we don't track birth tick
    states.push({
      id: agent.id,
      llmType: agent.llmType,
      x,
      y,
      hunger,
      energy,
      health,
      balance,
      state: agent.state,
      tick,
    });
  }

  return states;
}

/**
 * Get an agent's state history over a range of ticks
 */
export async function getAgentHistory(
  agentId: string,
  fromTick: number,
  toTick: number
): Promise<AgentStateAtTick[]> {
  // Get all events for this agent in the range
  const agentEvents = await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.agentId, agentId),
        gte(events.tick, fromTick),
        lte(events.tick, toTick)
      )
    )
    .orderBy(asc(events.tick), asc(events.id));

  // Get the agent's base info
  const agent = await db
    .select()
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  if (!agent[0]) return [];

  // Build state history from events
  const history: AgentStateAtTick[] = [];
  let currentState = {
    x: agent[0].x,
    y: agent[0].y,
    hunger: agent[0].hunger,
    energy: agent[0].energy,
    health: agent[0].health,
    balance: agent[0].balance,
  };

  // Track which ticks we've seen
  const ticksSeen = new Set<number>();

  for (const event of agentEvents) {
    const payload = event.payload as Record<string, unknown>;

    // Update state based on event type
    if (event.eventType === 'agent_move') {
      currentState.x = Number(payload.toX ?? currentState.x);
      currentState.y = Number(payload.toY ?? currentState.y);
    } else if (event.eventType === 'needs_updated') {
      currentState.hunger = Number(payload.hunger ?? currentState.hunger);
      currentState.energy = Number(payload.energy ?? currentState.energy);
      currentState.health = Number(payload.health ?? currentState.health);
      currentState.balance = Number(payload.balance ?? currentState.balance);
    }

    // Add state snapshot for this tick if not already added
    if (!ticksSeen.has(event.tick)) {
      ticksSeen.add(event.tick);
      history.push({
        id: agentId,
        llmType: agent[0].llmType,
        ...currentState,
        state: agent[0].state,
        tick: event.tick,
      });
    }
  }

  return history;
}

// =============================================================================
// World State Snapshot
// =============================================================================

export interface WorldSnapshot {
  tick: number;
  agents: AgentStateAtTick[];
  resourceSpawns: ResourceSpawn[];
  shelters: Shelter[];
  events: ReplayEvent[];
}

/**
 * Get full world snapshot at a specific tick
 */
export async function getWorldSnapshotAtTick(tick: number): Promise<WorldSnapshot> {
  const [agentStates, spawns, allShelters, tickEvents] = await Promise.all([
    getAgentStatesAtTick(tick),
    db.select().from(resourceSpawns),
    db.select().from(shelters),
    getEventsAtTick(tick),
  ]);

  // Note: Resource spawns and shelters don't change over time in current model
  // If they did, we'd need to reconstruct their state too

  return {
    tick,
    agents: agentStates,
    resourceSpawns: spawns,
    shelters: allShelters,
    events: tickEvents,
  };
}

// =============================================================================
// Tick Summary
// =============================================================================

export interface TickSummary {
  tick: number;
  eventCount: number;
  eventTypes: Record<string, number>;
  activeAgents: number;
}

/**
 * Get summary for each tick in a range
 */
export async function getTickSummaries(
  fromTick: number,
  toTick: number
): Promise<TickSummary[]> {
  const result = await db.execute<{
    tick: number;
    event_count: number;
    event_types: string;
    agent_count: number;
  }>(sql`
    SELECT
      tick,
      COUNT(*) as event_count,
      jsonb_object_agg(event_type, type_count) as event_types,
      COUNT(DISTINCT agent_id) FILTER (WHERE agent_id IS NOT NULL) as agent_count
    FROM (
      SELECT
        tick,
        event_type,
        agent_id,
        COUNT(*) as type_count
      FROM events
      WHERE tick >= ${fromTick} AND tick <= ${toTick}
      GROUP BY tick, event_type, agent_id
    ) sub
    GROUP BY tick
    ORDER BY tick
  `);

  const rows = Array.isArray(result) ? result : (result as any).rows || [];

  return rows.map((row) => ({
    tick: Number(row.tick),
    eventCount: Number(row.event_count),
    eventTypes: typeof row.event_types === 'string'
      ? JSON.parse(row.event_types)
      : row.event_types || {},
    activeAgents: Number(row.agent_count),
  }));
}

// =============================================================================
// Agent Timeline
// =============================================================================

export interface AgentTimelineEntry {
  tick: number;
  eventType: string;
  action?: string;
  success?: boolean;
  description: string;
}

/**
 * Get timeline of events for a specific agent
 */
export async function getAgentTimeline(
  agentId: string,
  limit = 100
): Promise<AgentTimelineEntry[]> {
  const agentEvents = await db
    .select()
    .from(events)
    .where(eq(events.agentId, agentId))
    .orderBy(desc(events.tick), desc(events.id))
    .limit(limit);

  return agentEvents.map((event) => {
    const payload = event.payload as Record<string, unknown>;

    let description = '';
    let action: string | undefined;
    let success: boolean | undefined;

    switch (event.eventType) {
      case 'agent_move':
        action = 'move';
        description = `Moved to (${payload.toX}, ${payload.toY})`;
        success = true;
        break;
      case 'agent_work':
        action = 'work';
        description = `Worked and earned ${payload.earned} CITY`;
        success = true;
        break;
      case 'agent_buy':
        action = 'buy';
        description = `Bought ${payload.quantity}x ${payload.itemType} for ${payload.cost} CITY`;
        success = true;
        break;
      case 'agent_consume':
        action = 'consume';
        description = `Consumed ${payload.itemType}, restored ${payload.restored}`;
        success = true;
        break;
      case 'needs_updated':
        description = `Needs: H${payload.hunger} E${payload.energy} HP${payload.health}`;
        break;
      case 'action_failed':
        action = String(payload.action);
        description = `Failed: ${payload.error}`;
        success = false;
        break;
      default:
        description = JSON.stringify(payload).slice(0, 100);
    }

    return {
      tick: event.tick,
      eventType: event.eventType,
      action,
      success,
      description,
    };
  });
}
