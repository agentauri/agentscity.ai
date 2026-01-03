/**
 * Memory Queries - Phase 1: Emergence Observation
 *
 * Manages agent episodic memories and relationships.
 * These are stored locally (not emergent) but contribute to emergent behavior.
 *
 * RAG-lite Memory System (Phase 5):
 * - Contextual memory retrieval based on nearby agents, location, and importance
 * - Enables long-term reputation/vendetta formation
 */

import { v4 as uuid } from 'uuid';
import { eq, and, desc, sql, gte, lte, or } from 'drizzle-orm';
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
// RAG-lite Memory Queries (Phase 5)
// =============================================================================

/**
 * Get memories about a specific agent (for when encountering them)
 * Retrieves memories where the target agent was involved, ordered by importance and recency.
 * Enables vendetta/reputation tracking across time.
 */
export async function getMemoriesAboutAgent(
  agentId: string,
  aboutAgentId: string,
  limit: number = 5
): Promise<AgentMemory[]> {
  return db
    .select()
    .from(agentMemories)
    .where(
      and(
        eq(agentMemories.agentId, agentId),
        sql`${agentMemories.involvedAgentIds} @> ${JSON.stringify([aboutAgentId])}`
      )
    )
    .orderBy(desc(agentMemories.importance), desc(agentMemories.tick))
    .limit(limit);
}

/**
 * Get memories at/near a specific location
 * Retrieves memories that occurred within a radius of the given position.
 * Helps agents remember what happened at locations they visit.
 */
export async function getMemoriesAtLocation(
  agentId: string,
  x: number,
  y: number,
  radius: number = 3,
  limit: number = 5
): Promise<AgentMemory[]> {
  // Query for memories within the bounding box
  return db
    .select()
    .from(agentMemories)
    .where(
      and(
        eq(agentMemories.agentId, agentId),
        sql`${agentMemories.x} IS NOT NULL`,
        sql`${agentMemories.y} IS NOT NULL`,
        gte(agentMemories.x, x - radius),
        lte(agentMemories.x, x + radius),
        gte(agentMemories.y, y - radius),
        lte(agentMemories.y, y + radius)
      )
    )
    .orderBy(desc(agentMemories.importance), desc(agentMemories.tick))
    .limit(limit);
}

/**
 * Get most important memories (regardless of recency)
 * Retrieves the highest-importance memories for an agent.
 * Enables long-term significant events to persist in agent memory.
 */
export async function getMostImportantMemories(
  agentId: string,
  limit: number = 5
): Promise<AgentMemory[]> {
  return db
    .select()
    .from(agentMemories)
    .where(eq(agentMemories.agentId, agentId))
    .orderBy(desc(agentMemories.importance), desc(agentMemories.tick))
    .limit(limit);
}

/**
 * Get memories by emotional valence (positive or negative experiences)
 * Retrieves memories above or below a valence threshold.
 * Enables agents to recall traumatic or positive experiences.
 *
 * @param valenceThreshold - Positive value (e.g., 0.5) for positive memories,
 *                          negative value (e.g., -0.5) for negative memories
 */
export async function getEmotionalMemories(
  agentId: string,
  valenceThreshold: number,
  limit: number = 5
): Promise<AgentMemory[]> {
  const condition = valenceThreshold >= 0
    ? gte(agentMemories.emotionalValence, valenceThreshold)
    : lte(agentMemories.emotionalValence, valenceThreshold);

  return db
    .select()
    .from(agentMemories)
    .where(
      and(
        eq(agentMemories.agentId, agentId),
        condition
      )
    )
    .orderBy(
      // Sort by absolute emotional intensity first, then recency
      valenceThreshold >= 0
        ? desc(agentMemories.emotionalValence)
        : agentMemories.emotionalValence,
      desc(agentMemories.tick)
    )
    .limit(limit);
}

/**
 * Get memories about multiple agents at once (batch query for efficiency)
 * Used when multiple agents are nearby and we need memories about all of them.
 */
export async function getMemoriesAboutAgents(
  agentId: string,
  aboutAgentIds: string[],
  limitPerAgent: number = 3
): Promise<Map<string, AgentMemory[]>> {
  if (aboutAgentIds.length === 0) {
    return new Map();
  }

  // Query all memories involving any of the target agents
  const allMemories = await db
    .select()
    .from(agentMemories)
    .where(
      and(
        eq(agentMemories.agentId, agentId),
        or(
          ...aboutAgentIds.map(targetId =>
            sql`${agentMemories.involvedAgentIds} @> ${JSON.stringify([targetId])}`
          )
        )
      )
    )
    .orderBy(desc(agentMemories.importance), desc(agentMemories.tick))
    .limit(aboutAgentIds.length * limitPerAgent * 2); // Fetch extra to ensure coverage

  // Group memories by involved agent
  const memoriesByAgent = new Map<string, AgentMemory[]>();

  for (const targetId of aboutAgentIds) {
    memoriesByAgent.set(targetId, []);
  }

  for (const memory of allMemories) {
    const involvedIds = memory.involvedAgentIds as string[];
    for (const targetId of aboutAgentIds) {
      if (involvedIds.includes(targetId)) {
        const existing = memoriesByAgent.get(targetId) || [];
        if (existing.length < limitPerAgent) {
          existing.push(memory);
          memoriesByAgent.set(targetId, existing);
        }
      }
    }
  }

  return memoriesByAgent;
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
