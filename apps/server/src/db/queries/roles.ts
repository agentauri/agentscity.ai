/**
 * Agent Roles and Retaliation Chains queries
 * Phase 2: Role crystallization and conflict tracking
 */

import { eq, sql, and, desc } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { db, agents, events, agentRoles, retaliationChains } from '../index';
import type { AgentRole, NewAgentRole, RetaliationChain, NewRetaliationChain } from '../schema';

// =============================================================================
// Agent Roles - Role Crystallization
// =============================================================================

export type RoleType = 'gatherer' | 'trader' | 'worker' | 'explorer' | 'enforcer' | 'predator' | 'victim' | 'unknown';

export interface RoleClassification {
  agentId: string;
  role: RoleType;
  confidence: number;
  actionBreakdown: Record<string, number>;
}

/**
 * Classify an agent's role based on their action history
 */
export async function classifyAgentRole(agentId: string, lookbackTicks: number = 100): Promise<RoleClassification> {
  // Get action counts for this agent in the lookback window
  const actionData = await db.execute<{ event_type: string; count: number }>(sql`
    SELECT event_type, COUNT(*) as count
    FROM events
    WHERE agent_id = ${agentId}
      AND event_type LIKE 'agent_%'
      AND event_type NOT IN ('agent_died', 'agent_spawned')
      AND tick >= (SELECT COALESCE(MAX(tick), 0) - ${lookbackTicks} FROM events)
    GROUP BY event_type
  `);

  const actionRows: { event_type: string; count: number }[] = Array.isArray(actionData)
    ? actionData
    : (actionData as any).rows || [];

  const actionBreakdown: Record<string, number> = {};
  let totalActions = 0;

  for (const row of actionRows) {
    actionBreakdown[row.event_type] = Number(row.count);
    totalActions += Number(row.count);
  }

  if (totalActions === 0) {
    return { agentId, role: 'unknown', confidence: 0, actionBreakdown };
  }

  // Calculate ratios
  const gatherCount = actionBreakdown['agent_gathered'] || 0;
  const tradeCount = actionBreakdown['agent_traded'] || 0;
  const workCount = actionBreakdown['agent_worked'] || 0;
  const moveCount = actionBreakdown['agent_moved'] || 0;
  const harmCount = actionBreakdown['agent_harmed'] || 0;
  const stealCount = actionBreakdown['agent_stole'] || 0;
  const shareCount = actionBreakdown['agent_shared_info'] || 0;

  // Calculate role scores
  const scores: { role: RoleType; score: number }[] = [
    { role: 'gatherer', score: gatherCount / totalActions },
    { role: 'trader', score: tradeCount / totalActions },
    { role: 'worker', score: workCount / totalActions },
    { role: 'explorer', score: moveCount / totalActions * 0.8 }, // Discount movement
    { role: 'predator', score: (harmCount + stealCount) / totalActions },
    { role: 'enforcer', score: 0 }, // Will be calculated separately
  ];

  // Check if agent is an enforcer (attacks aggressors, not victims)
  const enforcerData = await db.execute<{ intervention_count: number }>(sql`
    WITH attacker_list AS (
      SELECT DISTINCT agent_id as attacker
      FROM events
      WHERE event_type IN ('agent_harmed', 'agent_stole')
    )
    SELECT COUNT(*) as intervention_count
    FROM events e
    JOIN attacker_list a ON (e.payload->>'targetAgentId')::uuid = a.attacker::uuid
    WHERE e.agent_id = ${agentId}
      AND e.event_type IN ('agent_harmed', 'agent_stole')
  `);
  const enforcerRows: { intervention_count: number }[] = Array.isArray(enforcerData)
    ? enforcerData
    : (enforcerData as any).rows || [];

  const interventionCount = Number(enforcerRows[0]?.intervention_count) || 0;
  if (interventionCount > 0 && harmCount > 0) {
    const enforcerScore = interventionCount / harmCount;
    scores.find(s => s.role === 'enforcer')!.score = enforcerScore * 0.5;
  }

  // Check if agent is a victim
  const victimData = await db.execute<{ victim_count: number }>(sql`
    SELECT COUNT(*) as victim_count
    FROM events
    WHERE event_type IN ('agent_harmed', 'agent_stole')
      AND payload->>'targetAgentId' = ${agentId}
  `);
  const victimRows: { victim_count: number }[] = Array.isArray(victimData)
    ? victimData
    : (victimData as any).rows || [];

  const victimCount = Number(victimRows[0]?.victim_count) || 0;
  if (victimCount > totalActions * 0.1) {
    scores.push({ role: 'victim', score: victimCount / totalActions });
  }

  // Find dominant role
  scores.sort((a, b) => b.score - a.score);
  const topRole = scores[0];

  // Confidence is based on how dominant the role is
  const confidence = topRole.score > 0.3 ? Math.min(1, topRole.score * 1.5) : topRole.score;

  return {
    agentId,
    role: topRole.score > 0.1 ? topRole.role : 'unknown',
    confidence,
    actionBreakdown,
  };
}

/**
 * Get persisted role for an agent
 */
export async function getAgentRole(agentId: string): Promise<AgentRole | null> {
  const result = await db
    .select()
    .from(agentRoles)
    .where(eq(agentRoles.agentId, agentId))
    .limit(1);

  return result[0] || null;
}

/**
 * Update or create agent role in database
 */
export async function updateAgentRole(
  agentId: string,
  role: RoleType,
  confidence: number,
  tick: number
): Promise<AgentRole> {
  // Upsert role
  const result = await db
    .insert(agentRoles)
    .values({
      agentId,
      role,
      confidence,
      detectedAtTick: tick,
    })
    .onConflictDoUpdate({
      target: [agentRoles.agentId],
      set: {
        role,
        confidence,
        detectedAtTick: tick,
        updatedAt: new Date(),
      },
    })
    .returning();

  return result[0];
}

/**
 * Update roles for all alive agents
 */
export async function updateAllAgentRoles(tick: number): Promise<number> {
  const aliveAgents = await db
    .select({ id: agents.id })
    .from(agents)
    .where(sql`${agents.state} != 'dead'`);

  let updatedCount = 0;

  for (const agent of aliveAgents) {
    const classification = await classifyAgentRole(agent.id);
    if (classification.role !== 'unknown' && classification.confidence > 0.2) {
      await updateAgentRole(agent.id, classification.role, classification.confidence, tick);
      updatedCount++;
    }
  }

  return updatedCount;
}

/**
 * Get all current agent roles
 */
export async function getAllAgentRoles(): Promise<AgentRole[]> {
  return db.select().from(agentRoles);
}

/**
 * Get role distribution
 */
export async function getRoleDistribution(): Promise<{ role: string; count: number }[]> {
  const result = await db
    .select({
      role: agentRoles.role,
      count: sql<number>`COUNT(*)`,
    })
    .from(agentRoles)
    .groupBy(agentRoles.role)
    .orderBy(desc(sql`COUNT(*)`));

  return result.map(r => ({
    role: r.role,
    count: Number(r.count),
  }));
}

// =============================================================================
// Retaliation Chains - Conflict Tracking
// =============================================================================

/**
 * Check if an attack is retaliation for a previous attack
 */
export async function checkIsRetaliation(
  attackerId: string,
  victimId: string
): Promise<{ isRetaliation: boolean; existingChainId: string | null; depth: number }> {
  // Check if attacker was previously attacked by victim
  const previousAttack = await db.execute<{ chain_id: string; max_depth: number }>(sql`
    SELECT chain_id, MAX(depth) as max_depth
    FROM retaliation_chains
    WHERE victim_id = ${attackerId}
      AND attacker_id = ${victimId}
    GROUP BY chain_id
    ORDER BY max_depth DESC
    LIMIT 1
  `);

  const rows: { chain_id: string; max_depth: number }[] = Array.isArray(previousAttack)
    ? previousAttack
    : (previousAttack as any).rows || [];

  if (rows.length > 0) {
    return {
      isRetaliation: true,
      existingChainId: rows[0].chain_id,
      depth: Number(rows[0].max_depth) + 1,
    };
  }

  // Also check if there's any previous attack (not in chains table yet)
  const previousEvent = await db.execute<{ count: number }>(sql`
    SELECT COUNT(*) as count
    FROM events
    WHERE event_type IN ('agent_harmed', 'agent_stole')
      AND agent_id = ${victimId}
      AND (payload->>'victimId' = ${attackerId} OR payload->>'targetAgentId' = ${attackerId})
  `);

  const eventRows: { count: number }[] = Array.isArray(previousEvent)
    ? previousEvent
    : (previousEvent as any).rows || [];

  if (Number(eventRows[0]?.count) > 0) {
    return {
      isRetaliation: true,
      existingChainId: null, // New chain will be created
      depth: 1,
    };
  }

  return { isRetaliation: false, existingChainId: null, depth: 0 };
}

/**
 * Record a retaliation chain entry
 */
export async function recordRetaliationChain(
  attackerId: string,
  victimId: string,
  actionType: 'harm' | 'steal',
  tick: number,
  existingChainId?: string | null,
  depth: number = 0
): Promise<RetaliationChain> {
  const chainId = existingChainId || uuid();

  const result = await db
    .insert(retaliationChains)
    .values({
      chainId,
      attackerId,
      victimId,
      actionType,
      depth,
      tick,
    })
    .returning();

  return result[0];
}

/**
 * Get all active retaliation chains
 */
export async function getActiveRetaliationChains(): Promise<{
  chainId: string;
  participants: string[];
  depth: number;
  lastTick: number;
}[]> {
  const result = await db.execute<{
    chain_id: string;
    participants: string;
    max_depth: number;
    last_tick: number;
  }>(sql`
    SELECT
      chain_id,
      STRING_AGG(DISTINCT attacker_id::text, ',') || ',' || STRING_AGG(DISTINCT victim_id::text, ',') as participants,
      MAX(depth) as max_depth,
      MAX(tick) as last_tick
    FROM retaliation_chains
    GROUP BY chain_id
    ORDER BY last_tick DESC
  `);

  const rows: { chain_id: string; participants: string; max_depth: number; last_tick: number }[] =
    Array.isArray(result) ? result : (result as any).rows || [];

  return rows.map(r => ({
    chainId: r.chain_id,
    participants: [...new Set(r.participants.split(',').filter(Boolean))],
    depth: Number(r.max_depth),
    lastTick: Number(r.last_tick),
  }));
}

/**
 * Get retaliation chain statistics
 */
export async function getRetaliationStats(): Promise<{
  totalChains: number;
  activeChains: number;
  avgChainDepth: number;
  maxChainDepth: number;
  involvedAgents: number;
}> {
  const result = await db.execute<{
    total_chains: number;
    active_chains: number;
    avg_depth: number;
    max_depth: number;
    involved_agents: number;
  }>(sql`
    WITH chain_stats AS (
      SELECT
        chain_id,
        MAX(depth) as max_depth,
        MAX(tick) as last_tick
      FROM retaliation_chains
      GROUP BY chain_id
    ),
    current_tick AS (
      SELECT COALESCE(MAX(tick), 0) as tick FROM events
    )
    SELECT
      COUNT(DISTINCT chain_id) as total_chains,
      COUNT(DISTINCT chain_id) FILTER (WHERE last_tick >= (SELECT tick FROM current_tick) - 50) as active_chains,
      COALESCE(AVG(max_depth), 0) as avg_depth,
      COALESCE(MAX(max_depth), 0) as max_depth,
      (
        SELECT COUNT(DISTINCT agent_id) FROM (
          SELECT attacker_id as agent_id FROM retaliation_chains
          UNION
          SELECT victim_id as agent_id FROM retaliation_chains
        ) sub
      ) as involved_agents
    FROM chain_stats
  `);

  const rows = Array.isArray(result) ? result : (result as any).rows || [];

  return {
    totalChains: Number(rows[0]?.total_chains) || 0,
    activeChains: Number(rows[0]?.active_chains) || 0,
    avgChainDepth: Number(rows[0]?.avg_depth) || 0,
    maxChainDepth: Number(rows[0]?.max_depth) || 0,
    involvedAgents: Number(rows[0]?.involved_agents) || 0,
  };
}
