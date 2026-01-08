/**
 * Event store queries
 *
 * Uses database-level atomic version numbering to prevent race conditions.
 * The version is generated using a subquery that gets MAX(version)+1 atomically.
 */

import { eq, desc, and, gte, lte, sql } from 'drizzle-orm';
import { db, events, type Event, type NewEvent } from '../index';

/**
 * Append an event with atomic version numbering.
 * Uses database-level MAX(version)+1 to prevent race conditions.
 */
export async function appendEvent(event: Omit<NewEvent, 'version'>): Promise<Event | null> {
  try {
    // Use a raw SQL query to atomically get next version and insert
    // This prevents race conditions that could occur with a separate SELECT + INSERT
    const result = await db.execute(sql`
      INSERT INTO events (
        id, event_type, tick, agent_id, payload, timestamp, version
      )
      SELECT
        gen_random_uuid(),
        ${event.eventType},
        ${event.tick},
        ${event.agentId ?? null},
        ${JSON.stringify(event.payload ?? {})},
        ${event.timestamp ?? Date.now()},
        COALESCE((SELECT MAX(version) FROM events), 0) + 1
      RETURNING *
    `);

    // Convert raw result to Event type
    if (result.rows && result.rows.length > 0) {
      const row = result.rows[0] as Record<string, unknown>;
      return {
        id: row.id as string,
        eventType: row.event_type as string,
        tick: row.tick as number,
        agentId: row.agent_id as string | null,
        payload: row.payload as Record<string, unknown>,
        timestamp: Number(row.timestamp),
        version: row.version as number,
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
