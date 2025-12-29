/**
 * Naming Queries - Phase 1: Emergent Naming Conventions
 *
 * Manages emergent location names created by agents.
 * Multiple agents can propose different names for the same location.
 * The most used name becomes the "consensus" name.
 */

import { v4 as uuid } from 'uuid';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db, locationNames } from '../index';
import type { LocationName, NewLocationName } from '../schema';

// =============================================================================
// Types
// =============================================================================

export interface CreateNameInput {
  x: number;
  y: number;
  name: string;
  namedByAgentId: string;
  tick: number;
}

export interface LocationNameInfo {
  name: string;
  namedBy: string;
  usageCount: number;
  namedAtTick: number;
  isConsensus: boolean;
}

// =============================================================================
// Naming Operations
// =============================================================================

/**
 * Propose a name for a location (or increase usage if name exists)
 */
export async function proposeLocationName(input: CreateNameInput): Promise<LocationName> {
  // Check if this exact name already exists for this position
  const existing = await getNameAtPosition(input.x, input.y, input.name);

  if (existing) {
    // Increment usage count
    const [updated] = await db
      .update(locationNames)
      .set({
        usageCount: existing.usageCount + 1,
        updatedAt: new Date(),
      })
      .where(eq(locationNames.id, existing.id))
      .returning();

    return updated;
  }

  // Create new name entry
  const newName: NewLocationName = {
    id: uuid(),
    x: input.x,
    y: input.y,
    name: input.name,
    namedByAgentId: input.namedByAgentId,
    usageCount: 1,
    namedAtTick: input.tick,
  };

  const [inserted] = await db.insert(locationNames).values(newName).returning();
  return inserted;
}

/**
 * Get a specific name at a position
 */
export async function getNameAtPosition(
  x: number,
  y: number,
  name: string
): Promise<LocationName | null> {
  const [result] = await db
    .select()
    .from(locationNames)
    .where(
      and(
        eq(locationNames.x, x),
        eq(locationNames.y, y),
        eq(locationNames.name, name)
      )
    )
    .limit(1);

  return result ?? null;
}

/**
 * Get all names for a location, ordered by usage
 */
export async function getNamesForLocation(x: number, y: number): Promise<LocationName[]> {
  return db
    .select()
    .from(locationNames)
    .where(and(eq(locationNames.x, x), eq(locationNames.y, y)))
    .orderBy(desc(locationNames.usageCount));
}

/**
 * Get the consensus name (most used) for a location
 */
export async function getConsensusName(x: number, y: number): Promise<LocationName | null> {
  const [name] = await getNamesForLocation(x, y);
  return name ?? null;
}

/**
 * Get all names proposed by an agent
 */
export async function getNamesProposedBy(agentId: string): Promise<LocationName[]> {
  return db
    .select()
    .from(locationNames)
    .where(eq(locationNames.namedByAgentId, agentId))
    .orderBy(desc(locationNames.usageCount));
}

/**
 * Increment usage count for a name (when agent uses it)
 */
export async function incrementNameUsage(nameId: string): Promise<LocationName> {
  const [updated] = await db
    .update(locationNames)
    .set({
      usageCount: sql`${locationNames.usageCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(locationNames.id, nameId))
    .returning();

  return updated;
}

/**
 * Record that an agent used a name (finds or creates usage record)
 */
export async function recordNameUsage(
  x: number,
  y: number,
  name: string,
  usedByAgentId: string,
  tick: number
): Promise<LocationName> {
  const existing = await getNameAtPosition(x, y, name);

  if (existing) {
    return incrementNameUsage(existing.id);
  }

  // Name doesn't exist, create it
  return proposeLocationName({
    x,
    y,
    name,
    namedByAgentId: usedByAgentId,
    tick,
  });
}

/**
 * Get all named locations (for map display)
 */
export async function getAllNamedLocations(): Promise<
  { x: number; y: number; consensusName: string; usageCount: number }[]
> {
  // Get the highest usage name for each position
  const result = await db
    .select({
      x: locationNames.x,
      y: locationNames.y,
      name: locationNames.name,
      usageCount: locationNames.usageCount,
    })
    .from(locationNames)
    .orderBy(desc(locationNames.usageCount));

  // Group by position and take the top name
  const byPosition = new Map<string, { x: number; y: number; consensusName: string; usageCount: number }>();

  for (const row of result) {
    const key = `${row.x},${row.y}`;
    if (!byPosition.has(key)) {
      byPosition.set(key, {
        x: row.x,
        y: row.y,
        consensusName: row.name,
        usageCount: row.usageCount,
      });
    }
  }

  return Array.from(byPosition.values());
}

// =============================================================================
// Observer/Prompt Helpers
// =============================================================================

/**
 * Get formatted location names for a position (for observer/prompt)
 */
export async function getLocationNamesForObserver(
  x: number,
  y: number
): Promise<LocationNameInfo[]> {
  const names = await getNamesForLocation(x, y);

  if (names.length === 0) return [];

  const maxUsage = names[0].usageCount;

  return names.map((n) => ({
    name: n.name,
    namedBy: n.namedByAgentId,
    usageCount: n.usageCount,
    namedAtTick: n.namedAtTick,
    isConsensus: n.usageCount === maxUsage,
  }));
}

/**
 * Get nearby named locations (for context in prompts)
 */
export async function getNearbyNamedLocations(
  x: number,
  y: number,
  radius: number = 5
): Promise<{ x: number; y: number; name: string; usageCount: number }[]> {
  const result = await db
    .select({
      x: locationNames.x,
      y: locationNames.y,
      name: locationNames.name,
      usageCount: locationNames.usageCount,
    })
    .from(locationNames)
    .where(
      and(
        sql`${locationNames.x} BETWEEN ${x - radius} AND ${x + radius}`,
        sql`${locationNames.y} BETWEEN ${y - radius} AND ${y + radius}`
      )
    )
    .orderBy(desc(locationNames.usageCount));

  // Deduplicate by position (keep highest usage)
  const byPosition = new Map<string, { x: number; y: number; name: string; usageCount: number }>();

  for (const row of result) {
    const key = `${row.x},${row.y}`;
    if (!byPosition.has(key)) {
      byPosition.set(key, row);
    }
  }

  return Array.from(byPosition.values());
}

/**
 * Get naming summary (for analytics)
 */
export async function getNamingSummary(): Promise<{
  totalNamedLocations: number;
  totalNames: number;
  avgNamesPerLocation: number;
  topNamingAgents: { agentId: string; count: number }[];
}> {
  // Total unique named locations
  const locationsResult = await db
    .selectDistinct({ x: locationNames.x, y: locationNames.y })
    .from(locationNames);

  const totalNamedLocations = locationsResult.length;

  // Total names
  const [{ count: totalNames }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(locationNames);

  // Top naming agents
  const agentCounts = await db
    .select({
      agentId: locationNames.namedByAgentId,
      count: sql<number>`count(*)`,
    })
    .from(locationNames)
    .groupBy(locationNames.namedByAgentId)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  return {
    totalNamedLocations,
    totalNames: Number(totalNames),
    avgNamesPerLocation: totalNamedLocations > 0 ? Number(totalNames) / totalNamedLocations : 0,
    topNamingAgents: agentCounts.map((a) => ({
      agentId: a.agentId,
      count: Number(a.count),
    })),
  };
}
