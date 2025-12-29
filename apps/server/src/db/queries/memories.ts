/**
 * Memory Queries - Phase 1: Emergence Observation
 *
 * Manages agent episodic memories and relationships.
 * These are stored locally (not emergent) but contribute to emergent behavior.
 */

import { v4 as uuid } from 'uuid';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db, agentMemories, agentRelationships } from '../index';
import type { AgentMemory, NewAgentMemory, AgentRelationship } from '../schema';
import { CONFIG } from '../../config';

// =============================================================================
// Memory Types
// =============================================================================

export type MemoryType = 'observation' | 'action' | 'interaction' | 'reflection';

export interface CreateMemoryInput {
  agentId: string;
  type: MemoryType;
  content: string;
  importance?: number;
  emotionalValence?: number;
  involvedAgentIds?: string[];
  x?: number;
  y?: number;
  tick: number;
}

// =============================================================================
// Memory Operations
// =============================================================================

/**
 * Store a new memory for an agent
 */
export async function storeMemory(input: CreateMemoryInput): Promise<AgentMemory> {
  const memory: NewAgentMemory = {
    id: uuid(),
    agentId: input.agentId,
    type: input.type,
    content: input.content,
    importance: input.importance ?? 5,
    emotionalValence: input.emotionalValence ?? 0,
    involvedAgentIds: input.involvedAgentIds ?? [],
    x: input.x,
    y: input.y,
    tick: input.tick,
  };

  const [inserted] = await db.insert(agentMemories).values(memory).returning();
  return inserted;
}

/**
 * Get recent memories for an agent, ordered by recency and importance
 */
export async function getRecentMemories(
  agentId: string,
  limit: number = CONFIG.memory.recentCount
): Promise<AgentMemory[]> {
  return db
    .select()
    .from(agentMemories)
    .where(eq(agentMemories.agentId, agentId))
    .orderBy(desc(agentMemories.tick), desc(agentMemories.importance))
    .limit(limit);
}

/**
 * Get memories involving a specific other agent
 */
export async function getMemoriesInvolving(
  agentId: string,
  otherAgentId: string,
  limit: number = 10
): Promise<AgentMemory[]> {
  return db
    .select()
    .from(agentMemories)
    .where(
      and(
        eq(agentMemories.agentId, agentId),
        sql`${agentMemories.involvedAgentIds} @> ${JSON.stringify([otherAgentId])}`
      )
    )
    .orderBy(desc(agentMemories.tick))
    .limit(limit);
}

/**
 * Get memories of a specific type
 */
export async function getMemoriesByType(
  agentId: string,
  type: MemoryType,
  limit: number = 10
): Promise<AgentMemory[]> {
  return db
    .select()
    .from(agentMemories)
    .where(
      and(
        eq(agentMemories.agentId, agentId),
        eq(agentMemories.type, type)
      )
    )
    .orderBy(desc(agentMemories.tick))
    .limit(limit);
}

/**
 * Delete old memories to keep within limit
 */
export async function pruneOldMemories(
  agentId: string,
  maxMemories: number = CONFIG.memory.maxPerAgent
): Promise<number> {
  // Get total count
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(agentMemories)
    .where(eq(agentMemories.agentId, agentId));

  if (count <= maxMemories) return 0;

  // Delete oldest low-importance memories
  const toDelete = count - maxMemories;

  // Get IDs of memories to delete (oldest and lowest importance first)
  const memoriestoDelete = await db
    .select({ id: agentMemories.id })
    .from(agentMemories)
    .where(eq(agentMemories.agentId, agentId))
    .orderBy(agentMemories.importance, agentMemories.tick)
    .limit(toDelete);

  if (memoriestoDelete.length > 0) {
    const ids = memoriestoDelete.map((m) => m.id);
    await db.delete(agentMemories).where(sql`${agentMemories.id} = ANY(${ids})`);
  }

  return memoriestoDelete.length;
}

// =============================================================================
// Relationship Operations
// =============================================================================

/**
 * Get or create a relationship between two agents
 */
export async function getOrCreateRelationship(
  agentId: string,
  otherAgentId: string
): Promise<AgentRelationship> {
  // Try to get existing
  const existing = await db
    .select()
    .from(agentRelationships)
    .where(
      and(
        eq(agentRelationships.agentId, agentId),
        eq(agentRelationships.otherAgentId, otherAgentId)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  // Create new relationship
  const [created] = await db
    .insert(agentRelationships)
    .values({
      id: uuid(),
      agentId,
      otherAgentId,
      trustScore: 0,
      interactionCount: 0,
    })
    .returning();

  return created;
}

/**
 * Get relationship between two agents (returns null if none exists)
 */
export async function getRelationship(
  agentId: string,
  otherAgentId: string
): Promise<AgentRelationship | null> {
  const [relationship] = await db
    .select()
    .from(agentRelationships)
    .where(
      and(
        eq(agentRelationships.agentId, agentId),
        eq(agentRelationships.otherAgentId, otherAgentId)
      )
    )
    .limit(1);

  return relationship ?? null;
}

/**
 * Get all relationships for an agent
 */
export async function getAgentRelationships(
  agentId: string
): Promise<AgentRelationship[]> {
  return db
    .select()
    .from(agentRelationships)
    .where(eq(agentRelationships.agentId, agentId))
    .orderBy(desc(agentRelationships.trustScore));
}

/**
 * Update relationship trust score
 */
export async function updateRelationshipTrust(
  agentId: string,
  otherAgentId: string,
  trustDelta: number,
  tick: number,
  notes?: string
): Promise<AgentRelationship> {
  // Get or create the relationship
  const relationship = await getOrCreateRelationship(agentId, otherAgentId);

  // Calculate new trust score (clamped to -100 to +100)
  const newTrustScore = Math.max(-100, Math.min(100, relationship.trustScore + trustDelta));

  // Update
  const [updated] = await db
    .update(agentRelationships)
    .set({
      trustScore: newTrustScore,
      interactionCount: relationship.interactionCount + 1,
      lastInteractionTick: tick,
      notes: notes ?? relationship.notes,
      updatedAt: new Date(),
    })
    .where(eq(agentRelationships.id, relationship.id))
    .returning();

  return updated;
}

/**
 * Decay trust for all relationships that haven't been updated recently
 * Called periodically (e.g., every N ticks)
 */
export async function decayStaleRelationships(
  currentTick: number,
  ticksSinceLastInteraction: number = 100
): Promise<number> {
  const decayRate = CONFIG.memory.trustDecayPerTick;
  const staleThreshold = currentTick - ticksSinceLastInteraction;

  const result = await db
    .update(agentRelationships)
    .set({
      trustScore: sql`GREATEST(-100, LEAST(100, ${agentRelationships.trustScore} - ${decayRate}))`,
      updatedAt: new Date(),
    })
    .where(
      and(
        sql`${agentRelationships.lastInteractionTick} < ${staleThreshold}`,
        sql`ABS(${agentRelationships.trustScore}) > 1` // Don't decay near-zero values
      )
    )
    .returning({ id: agentRelationships.id });

  return result.length;
}

/**
 * Get relationship summary for an agent (for LLM context)
 */
export async function getRelationshipSummary(
  agentId: string
): Promise<{ positive: number; negative: number; neutral: number; totalInteractions: number }> {
  const relationships = await getAgentRelationships(agentId);

  return {
    positive: relationships.filter((r) => r.trustScore > 10).length,
    negative: relationships.filter((r) => r.trustScore < -10).length,
    neutral: relationships.filter((r) => r.trustScore >= -10 && r.trustScore <= 10).length,
    totalInteractions: relationships.reduce((sum, r) => sum + r.interactionCount, 0),
  };
}
