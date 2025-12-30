/**
 * Reproduction Queries - Phase 4: Agent Reproduction (§36)
 */

import { db } from '../index';
import {
  agentLineages,
  reproductionStates,
  type NewAgentLineage,
  type AgentLineage,
  type NewReproductionState,
  type ReproductionState,
} from '../schema';
import { eq, and, desc } from 'drizzle-orm';

// =============================================================================
// Reproduction States
// =============================================================================

/**
 * Create a reproduction state (start gestation)
 */
export async function createReproductionState(state: NewReproductionState): Promise<ReproductionState> {
  const [result] = await db.insert(reproductionStates).values(state).returning();
  return result;
}

/**
 * Get active reproduction for an agent
 */
export async function getActiveReproduction(agentId: string): Promise<ReproductionState | undefined> {
  const [result] = await db
    .select()
    .from(reproductionStates)
    .where(
      and(
        eq(reproductionStates.parentAgentId, agentId),
        eq(reproductionStates.status, 'gestating')
      )
    )
    .limit(1);
  return result;
}

/**
 * Get all gestating reproduction states
 */
export async function getGestatingStates(): Promise<ReproductionState[]> {
  return db
    .select()
    .from(reproductionStates)
    .where(eq(reproductionStates.status, 'gestating'));
}

/**
 * Complete reproduction (when gestation ends)
 */
export async function completeReproduction(
  reproductionId: string,
  offspringAgentId: string
): Promise<void> {
  await db
    .update(reproductionStates)
    .set({
      offspringAgentId,
      status: 'completed',
      completedAt: new Date(),
    })
    .where(eq(reproductionStates.id, reproductionId));
}

/**
 * Fail reproduction
 */
export async function failReproduction(
  reproductionId: string,
  reason: string
): Promise<void> {
  await db
    .update(reproductionStates)
    .set({
      status: 'failed',
      failureReason: reason,
      completedAt: new Date(),
    })
    .where(eq(reproductionStates.id, reproductionId));
}

/**
 * Get reproduction history for an agent
 */
export async function getReproductionHistory(agentId: string): Promise<ReproductionState[]> {
  return db
    .select()
    .from(reproductionStates)
    .where(eq(reproductionStates.parentAgentId, agentId))
    .orderBy(desc(reproductionStates.gestationStartTick));
}

// =============================================================================
// Agent Lineages
// =============================================================================

/**
 * Create lineage record for new offspring
 */
export async function createLineage(lineage: NewAgentLineage): Promise<AgentLineage> {
  const [result] = await db.insert(agentLineages).values(lineage).returning();
  return result;
}

/**
 * Get lineage for an agent
 */
export async function getLineage(agentId: string): Promise<AgentLineage | undefined> {
  const [result] = await db
    .select()
    .from(agentLineages)
    .where(eq(agentLineages.agentId, agentId))
    .limit(1);
  return result;
}

/**
 * Get all offspring of an agent
 */
export async function getOffspring(parentId: string): Promise<AgentLineage[]> {
  return db
    .select()
    .from(agentLineages)
    .where(eq(agentLineages.spawnedByParentId, parentId))
    .orderBy(desc(agentLineages.spawnedAtTick));
}

/**
 * Get generation statistics
 */
export async function getGenerationStats(): Promise<{
  generations: Map<number, number>;
  totalAgents: number;
  maxGeneration: number;
}> {
  const lineages = await db.select().from(agentLineages);

  const generations = new Map<number, number>();
  let maxGeneration = 0;

  for (const lineage of lineages) {
    const gen = lineage.generation;
    generations.set(gen, (generations.get(gen) || 0) + 1);
    if (gen > maxGeneration) maxGeneration = gen;
  }

  return {
    generations,
    totalAgents: lineages.length,
    maxGeneration,
  };
}

/**
 * Get lineage tree for an agent (ancestors + descendants)
 */
export async function getLineageTree(
  agentId: string,
  depth: number = 3
): Promise<{
  agent: AgentLineage | undefined;
  parents: AgentLineage[];
  children: AgentLineage[];
  siblings: AgentLineage[];
}> {
  const agent = await getLineage(agentId);
  const children = await getOffspring(agentId);

  let parents: AgentLineage[] = [];
  let siblings: AgentLineage[] = [];

  if (agent && agent.parentIds && Array.isArray(agent.parentIds)) {
    const parentIds = agent.parentIds as string[];

    // Get parent lineages
    for (const parentId of parentIds) {
      const parentLineage = await getLineage(parentId);
      if (parentLineage) {
        parents.push(parentLineage);

        // Get siblings (other children of same parents)
        const parentChildren = await getOffspring(parentId);
        siblings = siblings.concat(
          parentChildren.filter(c => c.agentId !== agentId)
        );
      }
    }

    // Deduplicate siblings
    const seen = new Set<string>();
    siblings = siblings.filter(s => {
      if (seen.has(s.agentId)) return false;
      seen.add(s.agentId);
      return true;
    });
  }

  return {
    agent,
    parents,
    children,
    siblings,
  };
}

/**
 * Calculate mutation rate across population
 */
export async function getMutationStats(): Promise<{
  avgMutationsPerAgent: number;
  totalMutations: number;
}> {
  const lineages = await db.select().from(agentLineages);

  let totalMutations = 0;

  for (const lineage of lineages) {
    if (Array.isArray(lineage.mutations)) {
      totalMutations += lineage.mutations.length;
    }
  }

  return {
    avgMutationsPerAgent: lineages.length > 0 ? totalMutations / lineages.length : 0,
    totalMutations,
  };
}
