/**
 * Knowledge Queries - Phase 2: Social Discovery
 *
 * Manages agent knowledge about other agents through:
 * - Direct discovery (met in person)
 * - Referral chains (heard about through others)
 *
 * This enables word-of-mouth information spread and social networks.
 */

import { v4 as uuid } from 'uuid';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db, agentKnowledge } from '../index';
import type { AgentKnowledge, NewAgentKnowledge } from '../schema';

// =============================================================================
// Types
// =============================================================================

export type DiscoveryType = 'direct' | 'referral';

export interface SharedInfo {
  lastKnownPosition?: { x: number; y: number };
  reputationClaim?: { sentiment: number; claim: string };
  dangerWarning?: string;
  tradeInfo?: string;
  skills?: string[];
  lastSeenTick?: number;
}

export interface CreateKnowledgeInput {
  agentId: string;
  knownAgentId: string;
  discoveryType: DiscoveryType;
  referredById?: string;
  referralDepth?: number;
  sharedInfo?: SharedInfo;
  informationAge: number; // tick when information was received
}

export interface KnownAgentInfo {
  id: string;
  discoveryType: DiscoveryType;
  referredBy?: string;
  referralDepth: number;
  sharedInfo: SharedInfo;
  informationAge: number;
}

// =============================================================================
// Knowledge Operations
// =============================================================================

/**
 * Record that an agent now knows about another agent
 * Updates existing knowledge if already known, or creates new entry
 */
export async function recordKnowledge(input: CreateKnowledgeInput): Promise<AgentKnowledge> {
  // Check if knowledge already exists
  const existing = await getKnowledge(input.agentId, input.knownAgentId);

  if (existing) {
    // Update existing knowledge with new/merged info
    const mergedInfo = mergeSharedInfo(existing.sharedInfo as SharedInfo, input.sharedInfo ?? {});

    const [updated] = await db
      .update(agentKnowledge)
      .set({
        // Keep the shorter referral chain
        discoveryType: input.referralDepth !== undefined && input.referralDepth < existing.referralDepth
          ? input.discoveryType
          : existing.discoveryType,
        referredById: input.referralDepth !== undefined && input.referralDepth < existing.referralDepth
          ? input.referredById
          : existing.referredById,
        referralDepth: Math.min(existing.referralDepth, input.referralDepth ?? existing.referralDepth),
        sharedInfo: mergedInfo,
        informationAge: input.informationAge, // Always update to latest
        updatedAt: new Date(),
      })
      .where(eq(agentKnowledge.id, existing.id))
      .returning();

    return updated;
  }

  // Create new knowledge entry
  const knowledge: NewAgentKnowledge = {
    id: uuid(),
    agentId: input.agentId,
    knownAgentId: input.knownAgentId,
    discoveryType: input.discoveryType,
    referredById: input.referredById,
    referralDepth: input.referralDepth ?? (input.discoveryType === 'direct' ? 0 : 1),
    sharedInfo: input.sharedInfo ?? {},
    informationAge: input.informationAge,
  };

  const [inserted] = await db.insert(agentKnowledge).values(knowledge).returning();
  return inserted;
}

/**
 * Record direct discovery when two agents meet
 */
export async function recordDirectDiscovery(
  agentId: string,
  discoveredAgentId: string,
  position: { x: number; y: number },
  tick: number
): Promise<AgentKnowledge> {
  return recordKnowledge({
    agentId,
    knownAgentId: discoveredAgentId,
    discoveryType: 'direct',
    referralDepth: 0,
    sharedInfo: {
      lastKnownPosition: position,
      lastSeenTick: tick,
    },
    informationAge: tick,
  });
}

/**
 * Record knowledge received through referral (word of mouth)
 */
export async function recordReferral(
  agentId: string,
  knownAgentId: string,
  referredById: string,
  sharedInfo: SharedInfo,
  tick: number
): Promise<AgentKnowledge> {
  // Get the referrer's knowledge to determine depth
  const referrerKnowledge = await getKnowledge(referredById, knownAgentId);
  const newDepth = (referrerKnowledge?.referralDepth ?? 0) + 1;

  return recordKnowledge({
    agentId,
    knownAgentId,
    discoveryType: 'referral',
    referredById,
    referralDepth: newDepth,
    sharedInfo,
    informationAge: tick,
  });
}

/**
 * Get an agent's knowledge about a specific other agent
 */
export async function getKnowledge(
  agentId: string,
  knownAgentId: string
): Promise<AgentKnowledge | null> {
  const [knowledge] = await db
    .select()
    .from(agentKnowledge)
    .where(
      and(
        eq(agentKnowledge.agentId, agentId),
        eq(agentKnowledge.knownAgentId, knownAgentId)
      )
    )
    .limit(1);

  return knowledge ?? null;
}

/**
 * Get all agents that a given agent knows about
 */
export async function getKnownAgents(
  agentId: string,
  limit: number = 50
): Promise<AgentKnowledge[]> {
  return db
    .select()
    .from(agentKnowledge)
    .where(eq(agentKnowledge.agentId, agentId))
    .orderBy(desc(agentKnowledge.informationAge))
    .limit(limit);
}

/**
 * Get all agents known through direct contact only
 */
export async function getDirectlyKnownAgents(
  agentId: string
): Promise<AgentKnowledge[]> {
  return db
    .select()
    .from(agentKnowledge)
    .where(
      and(
        eq(agentKnowledge.agentId, agentId),
        eq(agentKnowledge.discoveryType, 'direct')
      )
    )
    .orderBy(desc(agentKnowledge.informationAge));
}

/**
 * Get all agents known through referral only
 */
export async function getReferredAgents(
  agentId: string
): Promise<AgentKnowledge[]> {
  return db
    .select()
    .from(agentKnowledge)
    .where(
      and(
        eq(agentKnowledge.agentId, agentId),
        eq(agentKnowledge.discoveryType, 'referral')
      )
    )
    .orderBy(desc(agentKnowledge.informationAge));
}

/**
 * Check if agent knows about another agent
 */
export async function knowsAbout(
  agentId: string,
  otherAgentId: string
): Promise<boolean> {
  const knowledge = await getKnowledge(agentId, otherAgentId);
  return knowledge !== null;
}

/**
 * Update shared info about a known agent
 */
export async function updateSharedInfo(
  agentId: string,
  knownAgentId: string,
  newInfo: Partial<SharedInfo>,
  tick: number
): Promise<AgentKnowledge | null> {
  const existing = await getKnowledge(agentId, knownAgentId);
  if (!existing) return null;

  const mergedInfo = mergeSharedInfo(existing.sharedInfo as SharedInfo, newInfo);

  const [updated] = await db
    .update(agentKnowledge)
    .set({
      sharedInfo: mergedInfo,
      informationAge: tick,
      updatedAt: new Date(),
    })
    .where(eq(agentKnowledge.id, existing.id))
    .returning();

  return updated;
}

/**
 * Get knowledge summary for an agent (for LLM context)
 */
export async function getKnowledgeSummary(
  agentId: string
): Promise<{ directlyKnown: number; throughReferral: number; avgReferralDepth: number }> {
  const allKnowledge = await getKnownAgents(agentId, 100);

  const direct = allKnowledge.filter((k) => k.discoveryType === 'direct');
  const referral = allKnowledge.filter((k) => k.discoveryType === 'referral');

  const avgDepth = referral.length > 0
    ? referral.reduce((sum, k) => sum + k.referralDepth, 0) / referral.length
    : 0;

  return {
    directlyKnown: direct.length,
    throughReferral: referral.length,
    avgReferralDepth: avgDepth,
  };
}

/**
 * Get formatted known agents info for observer/prompt
 */
export async function getKnownAgentsForObserver(
  agentId: string,
  currentTick: number,
  limit: number = 10
): Promise<KnownAgentInfo[]> {
  const knowledge = await getKnownAgents(agentId, limit);

  return knowledge.map((k) => ({
    id: k.knownAgentId,
    discoveryType: k.discoveryType as DiscoveryType,
    referredBy: k.referredById ?? undefined,
    referralDepth: k.referralDepth,
    sharedInfo: k.sharedInfo as SharedInfo,
    informationAge: currentTick - k.informationAge,
  }));
}

/**
 * Delete stale knowledge (information too old to be reliable)
 */
export async function pruneStaleKnowledge(
  agentId: string,
  currentTick: number,
  maxAge: number = 1000 // ticks
): Promise<number> {
  const staleThreshold = currentTick - maxAge;

  const result = await db
    .delete(agentKnowledge)
    .where(
      and(
        eq(agentKnowledge.agentId, agentId),
        sql`${agentKnowledge.informationAge} < ${staleThreshold}`
      )
    )
    .returning({ id: agentKnowledge.id });

  return result.length;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Merge shared info, preferring newer values
 */
function mergeSharedInfo(existing: SharedInfo, newer: SharedInfo): SharedInfo {
  return {
    lastKnownPosition: newer.lastKnownPosition ?? existing.lastKnownPosition,
    reputationClaim: newer.reputationClaim ?? existing.reputationClaim,
    dangerWarning: newer.dangerWarning ?? existing.dangerWarning,
    tradeInfo: newer.tradeInfo ?? existing.tradeInfo,
    skills: newer.skills ?? existing.skills,
    lastSeenTick: newer.lastSeenTick ?? existing.lastSeenTick,
  };
}
