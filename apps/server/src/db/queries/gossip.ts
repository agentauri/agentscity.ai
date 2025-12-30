/**
 * Gossip Queries - Phase 4: Gossip Protocol (§35)
 */

import { db } from '../index';
import { gossipEvents, type NewGossipEvent, type GossipEvent } from '../schema';
import { eq, desc, and, gte, lte, sql } from 'drizzle-orm';

/**
 * Record a gossip event
 */
export async function recordGossipEvent(gossip: NewGossipEvent): Promise<GossipEvent> {
  const [result] = await db.insert(gossipEvents).values(gossip).returning();
  return result;
}

/**
 * Get gossip about a specific agent
 */
export async function getGossipAbout(subjectAgentId: string): Promise<GossipEvent[]> {
  return db
    .select()
    .from(gossipEvents)
    .where(eq(gossipEvents.subjectAgentId, subjectAgentId))
    .orderBy(desc(gossipEvents.tick));
}

/**
 * Get gossip spread by an agent
 */
export async function getGossipSpreadBy(sourceAgentId: string): Promise<GossipEvent[]> {
  return db
    .select()
    .from(gossipEvents)
    .where(eq(gossipEvents.sourceAgentId, sourceAgentId))
    .orderBy(desc(gossipEvents.tick));
}

/**
 * Get gossip received by an agent
 */
export async function getGossipReceivedBy(targetAgentId: string): Promise<GossipEvent[]> {
  return db
    .select()
    .from(gossipEvents)
    .where(eq(gossipEvents.targetAgentId, targetAgentId))
    .orderBy(desc(gossipEvents.tick));
}

/**
 * Get gossip in a tick range
 */
export async function getGossipInRange(
  startTick: number,
  endTick: number
): Promise<GossipEvent[]> {
  return db
    .select()
    .from(gossipEvents)
    .where(
      and(
        gte(gossipEvents.tick, startTick),
        lte(gossipEvents.tick, endTick)
      )
    )
    .orderBy(desc(gossipEvents.tick));
}

/**
 * Get reputation summary for an agent based on gossip
 */
export async function getReputationSummary(subjectAgentId: string): Promise<{
  averageSentiment: number;
  gossipCount: number;
  topicBreakdown: Record<string, number>;
}> {
  const gossip = await getGossipAbout(subjectAgentId);

  if (gossip.length === 0) {
    return {
      averageSentiment: 0,
      gossipCount: 0,
      topicBreakdown: {},
    };
  }

  const totalSentiment = gossip.reduce((sum, g) => sum + g.sentiment, 0);
  const topicBreakdown: Record<string, number> = {};

  for (const g of gossip) {
    topicBreakdown[g.topic] = (topicBreakdown[g.topic] || 0) + 1;
  }

  return {
    averageSentiment: totalSentiment / gossip.length,
    gossipCount: gossip.length,
    topicBreakdown,
  };
}

/**
 * Get gossip network statistics
 */
export async function getGossipNetworkStats(tick: number): Promise<{
  totalGossipEvents: number;
  uniqueSpreaders: number;
  uniqueSubjects: number;
  averageSentiment: number;
}> {
  const allGossip = await db
    .select()
    .from(gossipEvents)
    .where(lte(gossipEvents.tick, tick));

  const spreaders = new Set(allGossip.map(g => g.sourceAgentId));
  const subjects = new Set(allGossip.map(g => g.subjectAgentId));
  const totalSentiment = allGossip.reduce((sum, g) => sum + g.sentiment, 0);

  return {
    totalGossipEvents: allGossip.length,
    uniqueSpreaders: spreaders.size,
    uniqueSubjects: subjects.size,
    averageSentiment: allGossip.length > 0 ? totalSentiment / allGossip.length : 0,
  };
}

/**
 * Calculate polarization index (how split opinions are)
 */
export async function getPolarizationIndex(subjectAgentId: string): Promise<number> {
  const gossip = await getGossipAbout(subjectAgentId);

  if (gossip.length < 2) return 0;

  const sentiments = gossip.map(g => g.sentiment);
  const mean = sentiments.reduce((a, b) => a + b, 0) / sentiments.length;
  const variance = sentiments.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / sentiments.length;

  // Normalize to 0-1 scale (max variance is 10000 for -100 to 100 range)
  return Math.sqrt(variance) / 100;
}
