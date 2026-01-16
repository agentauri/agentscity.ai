/**
 * Information Beliefs Queries - Phase 4: Information Cascade Experiments
 *
 * Query functions for tracking and analyzing information beliefs
 * as they spread through agent networks.
 */

import { eq, and, isNull, sql, desc, count } from 'drizzle-orm';
import { db } from '..';
import { informationBeliefs, agents } from '../schema';
import type { InformationBelief, NewInformationBelief } from '../schema';

// =============================================================================
// Core CRUD Operations
// =============================================================================

/**
 * Insert a new belief record.
 */
export async function insertBelief(
  belief: NewInformationBelief
): Promise<InformationBelief> {
  const [inserted] = await db
    .insert(informationBeliefs)
    .values(belief)
    .returning();
  return inserted;
}

/**
 * Get all beliefs held by an agent.
 */
export async function getAgentBeliefs(
  agentId: string
): Promise<InformationBelief[]> {
  return db
    .select()
    .from(informationBeliefs)
    .where(eq(informationBeliefs.agentId, agentId))
    .orderBy(desc(informationBeliefs.receivedTick));
}

/**
 * Get a specific belief by agent and info hash.
 */
export async function getAgentBelief(
  agentId: string,
  infoHash: string
): Promise<InformationBelief | null> {
  const [belief] = await db
    .select()
    .from(informationBeliefs)
    .where(
      and(
        eq(informationBeliefs.agentId, agentId),
        eq(informationBeliefs.infoHash, infoHash)
      )
    )
    .limit(1);
  return belief ?? null;
}

/**
 * Check if an agent holds a specific belief.
 */
export async function agentHasBelief(
  agentId: string,
  infoHash: string
): Promise<boolean> {
  const belief = await getAgentBelief(agentId, infoHash);
  return belief !== null;
}

// =============================================================================
// Belief Lifecycle Tracking
// =============================================================================

/**
 * Record that an agent spread a belief to another agent.
 */
export async function recordBeliefSpread(
  sourceAgentId: string,
  targetAgentId: string,
  infoHash: string,
  claimType: string,
  claimContent: Record<string, unknown>,
  isTrue: boolean | null,
  tick: number,
  tenantId?: string
): Promise<InformationBelief> {
  // Increment spread count for source agent
  await db
    .update(informationBeliefs)
    .set({
      spreadCount: sql`${informationBeliefs.spreadCount} + 1`,
    })
    .where(
      and(
        eq(informationBeliefs.agentId, sourceAgentId),
        eq(informationBeliefs.infoHash, infoHash)
      )
    );

  // Insert belief for target agent (if they don't already have it)
  const existingBelief = await getAgentBelief(targetAgentId, infoHash);
  if (existingBelief) {
    return existingBelief;
  }

  return insertBelief({
    tenantId: tenantId ?? null,
    agentId: targetAgentId,
    infoHash,
    claimType,
    claimContent,
    isTrue,
    sourceAgentId,
    receivedTick: tick,
    spreadCount: 0,
  });
}

/**
 * Mark a belief as acted upon.
 */
export async function markBeliefActedOn(
  agentId: string,
  infoHash: string,
  tick: number
): Promise<void> {
  await db
    .update(informationBeliefs)
    .set({ actedOnTick: tick })
    .where(
      and(
        eq(informationBeliefs.agentId, agentId),
        eq(informationBeliefs.infoHash, infoHash),
        isNull(informationBeliefs.actedOnTick)
      )
    );
}

/**
 * Mark a belief as corrected (agent learned it was false).
 */
export async function markBeliefCorrected(
  agentId: string,
  infoHash: string,
  correctionSourceId: string | null,
  tick: number
): Promise<void> {
  await db
    .update(informationBeliefs)
    .set({
      correctedTick: tick,
      correctionSourceId,
    })
    .where(
      and(
        eq(informationBeliefs.agentId, agentId),
        eq(informationBeliefs.infoHash, infoHash),
        isNull(informationBeliefs.correctedTick)
      )
    );
}

// =============================================================================
// Analytics Queries
// =============================================================================

/**
 * Get information penetration statistics for a specific claim.
 */
export async function getBeliefPenetration(
  infoHash: string,
  tenantId?: string
): Promise<{
  totalHolders: number;
  actedOnCount: number;
  correctedCount: number;
  activeCount: number; // Holders who haven't been corrected
}> {
  const conditions = tenantId
    ? and(eq(informationBeliefs.infoHash, infoHash), eq(informationBeliefs.tenantId, tenantId))
    : eq(informationBeliefs.infoHash, infoHash);

  const stats = await db
    .select({
      totalHolders: count(),
      actedOnCount: sql<number>`COUNT(*) FILTER (WHERE ${informationBeliefs.actedOnTick} IS NOT NULL)`,
      correctedCount: sql<number>`COUNT(*) FILTER (WHERE ${informationBeliefs.correctedTick} IS NOT NULL)`,
    })
    .from(informationBeliefs)
    .where(conditions);

  const result = stats[0] ?? { totalHolders: 0, actedOnCount: 0, correctedCount: 0 };

  return {
    totalHolders: Number(result.totalHolders),
    actedOnCount: Number(result.actedOnCount),
    correctedCount: Number(result.correctedCount),
    activeCount: Number(result.totalHolders) - Number(result.correctedCount),
  };
}

/**
 * Get spread velocity (new belief holders per tick range).
 */
export async function getSpreadVelocity(
  infoHash: string,
  startTick: number,
  endTick: number
): Promise<number> {
  const [result] = await db
    .select({ count: count() })
    .from(informationBeliefs)
    .where(
      and(
        eq(informationBeliefs.infoHash, infoHash),
        sql`${informationBeliefs.receivedTick} >= ${startTick}`,
        sql`${informationBeliefs.receivedTick} <= ${endTick}`
      )
    );

  const tickRange = endTick - startTick;
  if (tickRange <= 0) return 0;

  return Number(result?.count ?? 0) / tickRange;
}

/**
 * Get all false beliefs (misinformation) in the system.
 */
export async function getMisinformationBeliefs(
  tenantId?: string
): Promise<InformationBelief[]> {
  const conditions = tenantId
    ? and(eq(informationBeliefs.isTrue, false), eq(informationBeliefs.tenantId, tenantId))
    : eq(informationBeliefs.isTrue, false);

  return db
    .select()
    .from(informationBeliefs)
    .where(conditions)
    .orderBy(desc(informationBeliefs.receivedTick));
}

/**
 * Get top influencers (agents who spread beliefs the most).
 */
export async function getTopSpreaders(
  limit: number = 10,
  tenantId?: string
): Promise<Array<{ agentId: string; totalSpread: number; uniqueBeliefs: number }>> {
  const conditions = tenantId
    ? eq(informationBeliefs.tenantId, tenantId)
    : undefined;

  const results = await db
    .select({
      agentId: informationBeliefs.agentId,
      totalSpread: sql<number>`SUM(${informationBeliefs.spreadCount})`,
      uniqueBeliefs: sql<number>`COUNT(DISTINCT ${informationBeliefs.infoHash})`,
    })
    .from(informationBeliefs)
    .where(conditions)
    .groupBy(informationBeliefs.agentId)
    .orderBy(desc(sql`SUM(${informationBeliefs.spreadCount})`))
    .limit(limit);

  return results.map(r => ({
    agentId: r.agentId,
    totalSpread: Number(r.totalSpread),
    uniqueBeliefs: Number(r.uniqueBeliefs),
  }));
}

/**
 * Get belief chain depth (how many hops from source).
 */
export async function getBeliefChainDepth(
  infoHash: string
): Promise<Map<string, number>> {
  // Get all beliefs with this hash
  const beliefs = await db
    .select({
      agentId: informationBeliefs.agentId,
      sourceAgentId: informationBeliefs.sourceAgentId,
    })
    .from(informationBeliefs)
    .where(eq(informationBeliefs.infoHash, infoHash));

  // Build depth map using BFS
  const depthMap = new Map<string, number>();
  const queue: Array<{ agentId: string; depth: number }> = [];

  // Find root nodes (no source = injected)
  for (const belief of beliefs) {
    if (belief.sourceAgentId === null) {
      depthMap.set(belief.agentId, 0);
      queue.push({ agentId: belief.agentId, depth: 0 });
    }
  }

  // Build source -> targets map
  const propagationMap = new Map<string, string[]>();
  for (const belief of beliefs) {
    if (belief.sourceAgentId) {
      const targets = propagationMap.get(belief.sourceAgentId) ?? [];
      targets.push(belief.agentId);
      propagationMap.set(belief.sourceAgentId, targets);
    }
  }

  // BFS to calculate depths
  while (queue.length > 0) {
    const current = queue.shift()!;
    const targets = propagationMap.get(current.agentId) ?? [];

    for (const targetId of targets) {
      if (!depthMap.has(targetId)) {
        depthMap.set(targetId, current.depth + 1);
        queue.push({ agentId: targetId, depth: current.depth + 1 });
      }
    }
  }

  return depthMap;
}

/**
 * Get correction latency statistics.
 */
export async function getCorrectionStats(
  infoHash: string
): Promise<{
  avgLatencyTicks: number;
  minLatencyTicks: number;
  maxLatencyTicks: number;
  correctedCount: number;
}> {
  const [result] = await db
    .select({
      avgLatency: sql<number>`AVG(${informationBeliefs.correctedTick} - ${informationBeliefs.receivedTick})`,
      minLatency: sql<number>`MIN(${informationBeliefs.correctedTick} - ${informationBeliefs.receivedTick})`,
      maxLatency: sql<number>`MAX(${informationBeliefs.correctedTick} - ${informationBeliefs.receivedTick})`,
      correctedCount: sql<number>`COUNT(*) FILTER (WHERE ${informationBeliefs.correctedTick} IS NOT NULL)`,
    })
    .from(informationBeliefs)
    .where(eq(informationBeliefs.infoHash, infoHash));

  return {
    avgLatencyTicks: Number(result?.avgLatency ?? 0),
    minLatencyTicks: Number(result?.minLatency ?? 0),
    maxLatencyTicks: Number(result?.maxLatency ?? 0),
    correctedCount: Number(result?.correctedCount ?? 0),
  };
}

/**
 * Get belief diversity (unique claim types and hashes per agent).
 */
export async function getBeliefDiversity(
  tenantId?: string
): Promise<{
  totalUniqueBeliefs: number;
  avgBeliefsPerAgent: number;
  beliefsByType: Record<string, number>;
}> {
  const conditions = tenantId
    ? eq(informationBeliefs.tenantId, tenantId)
    : undefined;

  const [stats] = await db
    .select({
      totalUnique: sql<number>`COUNT(DISTINCT ${informationBeliefs.infoHash})`,
      totalAgents: sql<number>`COUNT(DISTINCT ${informationBeliefs.agentId})`,
      totalBeliefs: count(),
    })
    .from(informationBeliefs)
    .where(conditions);

  const byType = await db
    .select({
      claimType: informationBeliefs.claimType,
      count: count(),
    })
    .from(informationBeliefs)
    .where(conditions)
    .groupBy(informationBeliefs.claimType);

  const totalAgents = Number(stats?.totalAgents ?? 1);

  return {
    totalUniqueBeliefs: Number(stats?.totalUnique ?? 0),
    avgBeliefsPerAgent: totalAgents > 0 ? Number(stats?.totalBeliefs ?? 0) / totalAgents : 0,
    beliefsByType: Object.fromEntries(
      byType.map(r => [r.claimType, Number(r.count)])
    ),
  };
}
