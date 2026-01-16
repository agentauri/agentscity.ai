/**
 * Event store queries
 *
 * Uses database-level atomic version numbering to prevent race conditions.
 * The version is generated using a subquery that gets MAX(version)+1 atomically.
 *
 * Event categories (for scientific analysis):
 * - infrastructure: System-imposed events (tick, decay, death)
 * - emergent: Agent-created events (trade, harm, signal)
 * - puzzle: Puzzle game system events
 * - observation: Metric snapshots
 */

import { eq, desc, and, gte, lte, sql, inArray } from 'drizzle-orm';
import { db, events, type Event, type NewEvent } from '../index';
import { getEventCategory, type EventCategory } from '../../events/event-types';

/**
 * Append an event with atomic version numbering.
 * Uses database-level MAX(version)+1 to prevent race conditions.
 * Automatically determines the event category based on the event type.
 */
export async function appendEvent(event: Omit<NewEvent, 'version'>): Promise<Event | null> {
  try {
    // Determine event category from registry
    const category = getEventCategory(event.eventType);

    // Use a raw SQL query to atomically get next version and insert
    // This prevents race conditions that could occur with a separate SELECT + INSERT
    const result = await db.execute(sql`
      INSERT INTO events (
        event_type, tick, agent_id, payload, category, version
      )
      SELECT
        ${event.eventType},
        ${event.tick},
        ${event.agentId ?? null},
        ${JSON.stringify(event.payload ?? {})},
        ${category}::event_category,
        COALESCE((SELECT MAX(version) FROM events), 0) + 1
      RETURNING *
    `) as unknown as { rows: Record<string, unknown>[] };

    // Convert raw result to Event type
    if (result.rows && result.rows.length > 0) {
      const row = result.rows[0];
      return {
        id: Number(row.id),
        tenantId: row.tenant_id as string | null,
        eventType: row.event_type as string,
        tick: Number(row.tick),
        agentId: row.agent_id as string | null,
        payload: row.payload as Record<string, unknown>,
        category: row.category as EventCategory,
        version: Number(row.version),
        createdAt: new Date(row.created_at as string),
      };
    }
    return null;
  } catch (error: unknown) {
    // Handle duplicate key error gracefully (can happen on server restart with pending jobs)
    const errorString = String(error);
    if (errorString.includes('duplicate key') || errorString.includes('unique constraint')) {
      return null;
    }
    throw error;
  }
}

export async function getEventsByAgent(agentId: string, limit = 100): Promise<Event[]> {
  return db
    .select()
    .from(events)
    .where(eq(events.agentId, agentId))
    .orderBy(desc(events.id))
    .limit(limit);
}

export async function getEventsByTick(tick: number): Promise<Event[]> {
  return db
    .select()
    .from(events)
    .where(eq(events.tick, tick))
    .orderBy(events.id);
}

export async function getEventsByTickRange(fromTick: number, toTick: number): Promise<Event[]> {
  return db
    .select()
    .from(events)
    .where(and(gte(events.tick, fromTick), lte(events.tick, toTick)))
    .orderBy(events.tick, events.id);
}

export async function getEventsByType(eventType: string, limit = 100): Promise<Event[]> {
  return db
    .select()
    .from(events)
    .where(eq(events.eventType, eventType))
    .orderBy(desc(events.id))
    .limit(limit);
}

export async function getRecentSignals(tick: number): Promise<Event[]> {
  // Get signals from this tick and the previous one (to ensure propagation)
  return db
    .select()
    .from(events)
    .where(and(
      eq(events.eventType, 'agent_signaled'),
      gte(events.tick, tick - 1)
    ));
}

export async function getRecentEvents(limit = 50): Promise<Event[]> {
  return db
    .select()
    .from(events)
    .orderBy(desc(events.id))
    .limit(limit);
}

export async function getEventCount(): Promise<number> {
  const result = await db.select({ count: sql<number>`count(*)` }).from(events);
  return result[0]?.count ?? 0;
}

/**
 * @deprecated No longer needed - version is now generated atomically in the database.
 * Kept for backwards compatibility but does nothing.
 */
export async function initGlobalVersion(): Promise<void> {
  // Version is now generated atomically in appendEvent using MAX(version)+1
  // This function is kept for backwards compatibility but does nothing
}

// =============================================================================
// Category-Based Queries (Scientific Analysis)
// =============================================================================

/**
 * Get infrastructure events for a specific tick.
 * Infrastructure events are system-imposed (tick, decay, death, birth).
 */
export async function getInfrastructureEvents(tick: number): Promise<Event[]> {
  return db
    .select()
    .from(events)
    .where(and(
      eq(events.tick, tick),
      eq(events.category, 'infrastructure')
    ))
    .orderBy(events.id);
}

/**
 * Get emergent events for a specific tick.
 * Emergent events are agent-created (trade, harm, signal, share).
 * These are the events that should count toward emergence metrics.
 */
export async function getEmergentEvents(tick: number): Promise<Event[]> {
  return db
    .select()
    .from(events)
    .where(and(
      eq(events.tick, tick),
      eq(events.category, 'emergent')
    ))
    .orderBy(events.id);
}

/**
 * Get puzzle events for a specific tick.
 */
export async function getPuzzleEvents(tick: number): Promise<Event[]> {
  return db
    .select()
    .from(events)
    .where(and(
      eq(events.tick, tick),
      eq(events.category, 'puzzle')
    ))
    .orderBy(events.id);
}

/**
 * Get events by category for a tick range.
 */
export async function getEventsByCategoryRange(
  category: EventCategory,
  fromTick: number,
  toTick: number
): Promise<Event[]> {
  return db
    .select()
    .from(events)
    .where(and(
      eq(events.category, category),
      gte(events.tick, fromTick),
      lte(events.tick, toTick)
    ))
    .orderBy(events.tick, events.id);
}

/**
 * Get event counts by category for a tick range.
 * Useful for scientific analysis comparing infrastructure vs emergent activity.
 */
export async function getEventCountsByCategory(
  fromTick: number,
  toTick: number
): Promise<Record<EventCategory, number>> {
  const result = await db.execute<{ category: string; count: number }>(sql`
    SELECT category, COUNT(*) as count
    FROM events
    WHERE tick >= ${fromTick} AND tick <= ${toTick}
    GROUP BY category
  `);

  const rows = Array.isArray(result) ? result : (result as { rows: Array<{ category: string; count: number }> }).rows || [];

  const counts: Record<EventCategory, number> = {
    infrastructure: 0,
    emergent: 0,
    puzzle: 0,
    observation: 0,
  };

  for (const row of rows) {
    const cat = row.category as EventCategory;
    if (cat in counts) {
      counts[cat] = Number(row.count);
    }
  }

  return counts;
}

/**
 * Get emergence metrics by category for scientific analysis.
 * Only counts emergent events for cooperation/conflict calculations.
 */
export async function getEmergenceMetricsByCategory(
  startTick: number,
  endTick: number
): Promise<{
  emergentEventCount: number;
  cooperativeEventCount: number;
  conflictEventCount: number;
  cooperationRatio: number;
}> {
  const result = await db.execute<{
    emergent_count: number;
    cooperative_count: number;
    conflict_count: number;
  }>(sql`
    SELECT
      COUNT(*) FILTER (WHERE category = 'emergent') as emergent_count,
      COUNT(*) FILTER (WHERE category = 'emergent' AND event_type IN ('agent_traded', 'agent_shared_info', 'agent_offered_job', 'agent_accepted_job', 'agent_paid_worker')) as cooperative_count,
      COUNT(*) FILTER (WHERE category = 'emergent' AND event_type IN ('agent_harmed', 'agent_stole', 'agent_deceived')) as conflict_count
    FROM events
    WHERE tick >= ${startTick} AND tick <= ${endTick}
  `);

  const rows = Array.isArray(result) ? result : (result as { rows: Array<{ emergent_count: number; cooperative_count: number; conflict_count: number }> }).rows || [];
  const data = rows[0] || { emergent_count: 0, cooperative_count: 0, conflict_count: 0 };

  const emergentEventCount = Number(data.emergent_count);
  const cooperativeEventCount = Number(data.cooperative_count);
  const conflictEventCount = Number(data.conflict_count);

  const interactionCount = cooperativeEventCount + conflictEventCount;
  const cooperationRatio = interactionCount > 0
    ? cooperativeEventCount / interactionCount
    : 0;

  return {
    emergentEventCount,
    cooperativeEventCount,
    conflictEventCount,
    cooperationRatio,
  };
}
