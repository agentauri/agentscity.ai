/**
 * Event store queries
 */

import { eq, desc, and, gte, lte, sql } from 'drizzle-orm';
import { db, events, type Event, type NewEvent } from '../index';

let globalVersion = 0;

export async function appendEvent(event: Omit<NewEvent, 'version'>): Promise<Event> {
  globalVersion++;
  const result = await db
    .insert(events)
    .values({ ...event, version: globalVersion })
    .returning();
  return result[0];
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

export async function initGlobalVersion(): Promise<void> {
  const result = await db
    .select({ maxVersion: sql<number>`COALESCE(MAX(version), 0)` })
    .from(events);
  globalVersion = result[0]?.maxVersion ?? 0;
}
