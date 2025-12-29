/**
 * Claims Queries - Phase 1: Location Claiming
 *
 * Manages agent territorial claims on map positions.
 * Agents can claim locations for various purposes (home, territory, resource, etc.)
 * Claims have strength that decays over time without reinforcement.
 */

import { v4 as uuid } from 'uuid';
import { eq, and, desc, sql, between } from 'drizzle-orm';
import { db, agentClaims } from '../index';
import type { AgentClaim, NewAgentClaim } from '../schema';

// =============================================================================
// Types
// =============================================================================

export type ClaimType = 'territory' | 'home' | 'resource' | 'danger' | 'meeting_point';

export interface CreateClaimInput {
  agentId: string;
  x: number;
  y: number;
  claimType: ClaimType;
  description?: string;
  strength?: number;
  tick: number;
}

export interface ClaimInfo {
  id: string;
  agentId: string;
  x: number;
  y: number;
  claimType: ClaimType;
  description?: string;
  strength: number;
  claimedAtTick: number;
  ticksSinceReinforced: number;
}

// =============================================================================
// Claim Configuration
// =============================================================================

const CONFIG = {
  maxStrength: 10,
  minStrength: 0,
  defaultStrength: 1,
  reinforceAmount: 1, // Amount to add when reinforcing
  decayRate: 0.1, // Decay per tick without reinforcement
  contestedThreshold: 0.5, // Below this, claim is weak and contestable
} as const;

// =============================================================================
// Claim Operations
// =============================================================================

/**
 * Create a new claim or reinforce an existing one
 */
export async function createOrReinforceClaim(input: CreateClaimInput): Promise<AgentClaim> {
  // Check if agent already has a claim at this position with this type
  const existing = await getClaimByAgentAndPosition(input.agentId, input.x, input.y, input.claimType);

  if (existing) {
    // Reinforce existing claim
    return reinforceClaim(existing.id, input.tick, input.description);
  }

  // Create new claim
  const claim: NewAgentClaim = {
    id: uuid(),
    agentId: input.agentId,
    x: input.x,
    y: input.y,
    claimType: input.claimType,
    description: input.description,
    strength: Math.min(input.strength ?? CONFIG.defaultStrength, CONFIG.maxStrength),
    claimedAtTick: input.tick,
    lastReinforcedTick: input.tick,
  };

  const [inserted] = await db.insert(agentClaims).values(claim).returning();
  return inserted;
}

/**
 * Reinforce an existing claim (increase strength)
 */
export async function reinforceClaim(
  claimId: string,
  tick: number,
  newDescription?: string
): Promise<AgentClaim> {
  const [updated] = await db
    .update(agentClaims)
    .set({
      strength: sql`LEAST(${CONFIG.maxStrength}, ${agentClaims.strength} + ${CONFIG.reinforceAmount})`,
      lastReinforcedTick: tick,
      description: newDescription !== undefined ? newDescription : agentClaims.description,
      updatedAt: new Date(),
    })
    .where(eq(agentClaims.id, claimId))
    .returning();

  return updated;
}

/**
 * Get a specific claim by agent, position, and type
 */
export async function getClaimByAgentAndPosition(
  agentId: string,
  x: number,
  y: number,
  claimType: ClaimType
): Promise<AgentClaim | null> {
  const [claim] = await db
    .select()
    .from(agentClaims)
    .where(
      and(
        eq(agentClaims.agentId, agentId),
        eq(agentClaims.x, x),
        eq(agentClaims.y, y),
        eq(agentClaims.claimType, claimType)
      )
    )
    .limit(1);

  return claim ?? null;
}

/**
 * Get all claims at a specific position
 */
export async function getClaimsAtPosition(x: number, y: number): Promise<AgentClaim[]> {
  return db
    .select()
    .from(agentClaims)
    .where(and(eq(agentClaims.x, x), eq(agentClaims.y, y)))
    .orderBy(desc(agentClaims.strength));
}

/**
 * Get all claims by an agent
 */
export async function getAgentClaims(agentId: string): Promise<AgentClaim[]> {
  return db
    .select()
    .from(agentClaims)
    .where(eq(agentClaims.agentId, agentId))
    .orderBy(desc(agentClaims.strength));
}

/**
 * Get claims within a rectangular area (for nearby claims)
 */
export async function getClaimsInArea(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number
): Promise<AgentClaim[]> {
  return db
    .select()
    .from(agentClaims)
    .where(
      and(
        between(agentClaims.x, minX, maxX),
        between(agentClaims.y, minY, maxY)
      )
    )
    .orderBy(desc(agentClaims.strength));
}

/**
 * Get nearby claims around a position (within radius)
 */
export async function getNearbyClaims(
  x: number,
  y: number,
  radius: number = 5
): Promise<AgentClaim[]> {
  return getClaimsInArea(x - radius, x + radius, y - radius, y + radius);
}

/**
 * Get the strongest claim at a position (dominant claimer)
 */
export async function getDominantClaim(x: number, y: number): Promise<AgentClaim | null> {
  const claims = await getClaimsAtPosition(x, y);
  return claims.length > 0 ? claims[0] : null;
}

/**
 * Check if a position is contested (multiple strong claims)
 */
export async function isPositionContested(x: number, y: number): Promise<boolean> {
  const claims = await getClaimsAtPosition(x, y);
  const strongClaims = claims.filter((c) => c.strength > CONFIG.contestedThreshold);
  return strongClaims.length > 1;
}

/**
 * Remove a claim
 */
export async function removeClaim(claimId: string): Promise<void> {
  await db.delete(agentClaims).where(eq(agentClaims.id, claimId));
}

/**
 * Remove all claims by an agent
 */
export async function removeAgentClaims(agentId: string): Promise<number> {
  const result = await db
    .delete(agentClaims)
    .where(eq(agentClaims.agentId, agentId))
    .returning({ id: agentClaims.id });

  return result.length;
}

/**
 * Decay all claims that haven't been reinforced recently
 * Called periodically (e.g., every tick or every N ticks)
 */
export async function decayAllClaims(currentTick: number): Promise<number> {
  // Decay claims not reinforced in the last tick
  const result = await db
    .update(agentClaims)
    .set({
      strength: sql`GREATEST(${CONFIG.minStrength}, ${agentClaims.strength} - ${CONFIG.decayRate})`,
      updatedAt: new Date(),
    })
    .where(sql`${agentClaims.lastReinforcedTick} < ${currentTick}`)
    .returning({ id: agentClaims.id });

  return result.length;
}

/**
 * Remove claims with zero or negative strength
 */
export async function pruneWeakClaims(): Promise<number> {
  const result = await db
    .delete(agentClaims)
    .where(sql`${agentClaims.strength} <= ${CONFIG.minStrength}`)
    .returning({ id: agentClaims.id });

  return result.length;
}

// =============================================================================
// Observer/Prompt Helpers
// =============================================================================

/**
 * Get formatted nearby claims for observer/prompt
 */
export async function getNearbyClaimsForObserver(
  x: number,
  y: number,
  currentTick: number,
  radius: number = 5
): Promise<ClaimInfo[]> {
  const claims = await getNearbyClaims(x, y, radius);

  return claims.map((c) => ({
    id: c.id,
    agentId: c.agentId,
    x: c.x,
    y: c.y,
    claimType: c.claimType as ClaimType,
    description: c.description ?? undefined,
    strength: c.strength,
    claimedAtTick: c.claimedAtTick,
    ticksSinceReinforced: currentTick - (c.lastReinforcedTick ?? c.claimedAtTick),
  }));
}

/**
 * Get claims summary for an agent (for LLM context)
 */
export async function getClaimsSummary(
  agentId: string
): Promise<{ totalClaims: number; byType: Record<ClaimType, number>; avgStrength: number }> {
  const claims = await getAgentClaims(agentId);

  const byType: Record<ClaimType, number> = {
    territory: 0,
    home: 0,
    resource: 0,
    danger: 0,
    meeting_point: 0,
  };

  for (const claim of claims) {
    const type = claim.claimType as ClaimType;
    byType[type] = (byType[type] || 0) + 1;
  }

  const avgStrength = claims.length > 0
    ? claims.reduce((sum, c) => sum + c.strength, 0) / claims.length
    : 0;

  return {
    totalClaims: claims.length,
    byType,
    avgStrength,
  };
}

/**
 * Get agent's home claim (if any)
 */
export async function getAgentHome(agentId: string): Promise<AgentClaim | null> {
  const [home] = await db
    .select()
    .from(agentClaims)
    .where(
      and(
        eq(agentClaims.agentId, agentId),
        eq(agentClaims.claimType, 'home')
      )
    )
    .orderBy(desc(agentClaims.strength))
    .limit(1);

  return home ?? null;
}

/**
 * Check if agent has claimed a specific position
 */
export async function hasAgentClaimedPosition(
  agentId: string,
  x: number,
  y: number
): Promise<boolean> {
  const [claim] = await db
    .select({ id: agentClaims.id })
    .from(agentClaims)
    .where(
      and(
        eq(agentClaims.agentId, agentId),
        eq(agentClaims.x, x),
        eq(agentClaims.y, y)
      )
    )
    .limit(1);

  return claim !== undefined;
}
