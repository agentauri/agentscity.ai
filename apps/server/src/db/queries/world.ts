/**
 * World state queries
 */

import { eq, and, sql } from 'drizzle-orm';
import {
  db,
  worldState,
  shelters,
  resourceSpawns,
  agents,
  events,
  inventory,
  ledger,
  type WorldState,
  type Shelter,
  type NewShelter,
  type ResourceSpawn,
  type NewResourceSpawn,
} from '../index';

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

// =============================================================================
// SHELTERS (Generic structures)
// =============================================================================

export async function getAllShelters(): Promise<Shelter[]> {
  return db.select().from(shelters);
}

export async function getShelterById(id: string): Promise<Shelter | undefined> {
  const result = await db.select().from(shelters).where(eq(shelters.id, id)).limit(1);
  return result[0];
}

export async function getSheltersAtPosition(x: number, y: number): Promise<Shelter[]> {
  return db.select().from(shelters).where(and(eq(shelters.x, x), eq(shelters.y, y)));
}

export async function createShelter(shelter: NewShelter): Promise<Shelter> {
  const result = await db.insert(shelters).values(shelter).returning();
  return result[0];
}

// Backwards compatibility aliases
export const getAllLocations = getAllShelters;
export const getLocationById = getShelterById;
export const getLocationsAtPosition = getSheltersAtPosition;
export const createLocation = createShelter;

// =============================================================================
// RESOURCE SPAWNS (Sugarscape-style resources)
// =============================================================================

export async function getAllResourceSpawns(): Promise<ResourceSpawn[]> {
  return db.select().from(resourceSpawns);
}

export async function getResourceSpawnsAtPosition(x: number, y: number): Promise<ResourceSpawn[]> {
  return db.select().from(resourceSpawns).where(and(eq(resourceSpawns.x, x), eq(resourceSpawns.y, y)));
}

export async function getResourceSpawnsByType(resourceType: string): Promise<ResourceSpawn[]> {
  return db.select().from(resourceSpawns).where(eq(resourceSpawns.resourceType, resourceType));
}

export async function createResourceSpawn(spawn: NewResourceSpawn): Promise<ResourceSpawn> {
  const result = await db.insert(resourceSpawns).values(spawn).returning();
  return result[0];
}

/**
 * Harvest resource from spawn point
 * Returns the amount actually harvested (may be less if not enough available)
 */
export async function harvestResource(spawnId: string, amount: number): Promise<number> {
  const spawn = await db.select().from(resourceSpawns).where(eq(resourceSpawns.id, spawnId)).limit(1);
  if (!spawn[0] || spawn[0].currentAmount <= 0) return 0;

  const actualAmount = Math.min(amount, spawn[0].currentAmount);
  await db
    .update(resourceSpawns)
    .set({ currentAmount: spawn[0].currentAmount - actualAmount })
    .where(eq(resourceSpawns.id, spawnId));

  return actualAmount;
}

/**
 * Regenerate resources at all spawn points (called each tick)
 */
export async function regenerateResources(): Promise<void> {
  await db.execute(sql`
    UPDATE resource_spawns
    SET current_amount = LEAST(current_amount + regen_rate, max_amount)
    WHERE current_amount < max_amount
  `);
}

// =============================================================================
// RESET
// =============================================================================

/**
 * Delete all shelters
 */
export async function deleteAllShelters(): Promise<void> {
  await db.delete(shelters);
}

/**
 * Delete all resource spawns
 */
export async function deleteAllResourceSpawns(): Promise<void> {
  await db.delete(resourceSpawns);
}

/**
 * Reset tick counter to 0
 */
export async function resetTickCounter(): Promise<void> {
  await db
    .update(worldState)
    .set({ currentTick: 0, startedAt: new Date(), lastTickAt: null })
    .where(eq(worldState.id, WORLD_STATE_ID));
}

/**
 * Reset all world data (for full simulation reset)
 */
export async function resetWorldData(): Promise<void> {
  // Delete in order to respect foreign key constraints
  await db.delete(inventory);
  await db.delete(events);
  await db.delete(ledger);
  await db.delete(agents);
  await db.delete(shelters);
  await db.delete(resourceSpawns);
  await db.delete(worldState);
}
