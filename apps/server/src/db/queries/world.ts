/**
 * World state queries
 */

import { eq, and, sql } from 'drizzle-orm';
import { db, worldState, locations, type WorldState, type Location, type NewLocation } from '../index';

const WORLD_STATE_ID = 1;

export async function getWorldState(): Promise<WorldState | undefined> {
  const result = await db.select().from(worldState).where(eq(worldState.id, WORLD_STATE_ID)).limit(1);
  return result[0];
}

export async function initWorldState(): Promise<WorldState> {
  const existing = await getWorldState();
  if (existing) return existing;

  const result = await db
    .insert(worldState)
    .values({ id: WORLD_STATE_ID, currentTick: 0 })
    .returning();
  return result[0];
}

export async function incrementTick(): Promise<WorldState> {
  const result = await db
    .update(worldState)
    .set({
      currentTick: sql`${worldState.currentTick} + 1`,
      lastTickAt: new Date(),
    })
    .where(eq(worldState.id, WORLD_STATE_ID))
    .returning();
  return result[0];
}

export async function getCurrentTick(): Promise<number> {
  const state = await getWorldState();
  return state?.currentTick ?? 0;
}

export async function pauseWorld(): Promise<void> {
  await db.update(worldState).set({ isPaused: true }).where(eq(worldState.id, WORLD_STATE_ID));
}

export async function resumeWorld(): Promise<void> {
  await db.update(worldState).set({ isPaused: false }).where(eq(worldState.id, WORLD_STATE_ID));
}

// Locations
export async function getAllLocations(): Promise<Location[]> {
  return db.select().from(locations);
}

export async function getLocationById(id: string): Promise<Location | undefined> {
  const result = await db.select().from(locations).where(eq(locations.id, id)).limit(1);
  return result[0];
}

export async function getLocationsAtPosition(x: number, y: number): Promise<Location[]> {
  return db.select().from(locations).where(and(eq(locations.x, x), eq(locations.y, y)));
}

export async function createLocation(location: NewLocation): Promise<Location> {
  const result = await db.insert(locations).values(location).returning();
  return result[0];
}
