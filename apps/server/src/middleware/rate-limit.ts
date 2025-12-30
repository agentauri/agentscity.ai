/**
 * Rate Limiting Middleware for External Agents (Phase 3: A2A Protocol)
 *
 * Enforces per-agent rate limits on API actions.
 * Limits are tracked per tick and per minute.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, sql } from 'drizzle-orm';
import { db, apiUsage, externalAgents } from '../db';
import { getCurrentTick } from '../db/queries/world';
import type { ExternalAgent } from '../db/schema';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: number; // Unix timestamp
}

/**
 * Check if an external agent is within their rate limit for the current tick
 */
export async function checkRateLimit(
  externalAgentId: string,
  tick: number
): Promise<RateLimitResult> {
  // Get agent's rate limit
  const agentResult = await db
    .select({
      rateLimitPerTick: externalAgents.rateLimitPerTick,
    })
    .from(externalAgents)
    .where(eq(externalAgents.id, externalAgentId))
    .limit(1);

  const limit = agentResult[0]?.rateLimitPerTick ?? 1;

  // Get current usage for this tick
  const usageResult = await db
    .select({
      actionCount: apiUsage.actionCount,
    })
    .from(apiUsage)
    .where(
      and(
        eq(apiUsage.externalAgentId, externalAgentId),
        eq(apiUsage.tick, tick)
      )
    )
    .limit(1);

  const currentUsage = usageResult[0]?.actionCount ?? 0;
  const remaining = Math.max(0, limit - currentUsage);

  return {
    allowed: currentUsage < limit,
    remaining,
    limit,
    resetAt: Date.now() + 10000, // Next tick (approximately)
  };
}

/**
 * Increment the usage counter for an external agent
 */
export async function incrementUsage(
  externalAgentId: string,
  tick: number
): Promise<void> {
  // Try to increment existing record, or insert new one
  await db.execute(sql`
    INSERT INTO api_usage (external_agent_id, tick, action_count, created_at)
    VALUES (${externalAgentId}, ${tick}, 1, NOW())
    ON CONFLICT (external_agent_id, tick)
    DO UPDATE SET action_count = api_usage.action_count + 1
  `).catch(async () => {
    // If upsert fails (no unique constraint), do manual upsert
    const existing = await db
      .select()
      .from(apiUsage)
      .where(
        and(
          eq(apiUsage.externalAgentId, externalAgentId),
          eq(apiUsage.tick, tick)
        )
      )
      .limit(1);

    if (existing[0]) {
      await db
        .update(apiUsage)
        .set({ actionCount: existing[0].actionCount + 1 })
        .where(eq(apiUsage.id, existing[0].id));
    } else {
      await db.insert(apiUsage).values({
        externalAgentId,
        tick,
        actionCount: 1,
      });
    }
  });
}

/**
 * Set rate limit headers on response
 */
export function setRateLimitHeaders(
  reply: FastifyReply,
  result: RateLimitResult
): void {
  reply.header('X-RateLimit-Limit', result.limit.toString());
  reply.header('X-RateLimit-Remaining', result.remaining.toString());
  reply.header('X-RateLimit-Reset', result.resetAt.toString());
}

/**
 * Fastify preHandler hook for rate limiting
 * Must be used after requireApiKey middleware
 */
export async function enforceRateLimit(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const externalAgent = (request as any).externalAgent as ExternalAgent | undefined;

  if (!externalAgent) {
    // No external agent attached - auth middleware should have caught this
    reply.code(401).send({
      error: 'Unauthorized',
      message: 'No authenticated agent',
    });
    return;
  }

  const tick = await getCurrentTick();
  const result = await checkRateLimit(externalAgent.id, tick);

  // Always set rate limit headers
  setRateLimitHeaders(reply, result);

  if (!result.allowed) {
    reply.code(429).send({
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Limit: ${result.limit} actions per tick`,
      retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
    });
    return;
  }
}

/**
 * Record an action and check rate limit in one operation
 * Returns the updated rate limit result
 */
export async function recordAndCheckRateLimit(
  externalAgentId: string
): Promise<RateLimitResult> {
  const tick = await getCurrentTick();

  // First check if within limit
  const result = await checkRateLimit(externalAgentId, tick);

  if (result.allowed) {
    // Increment usage
    await incrementUsage(externalAgentId, tick);
    // Return updated remaining
    return {
      ...result,
      remaining: result.remaining - 1,
    };
  }

  return result;
}

/**
 * Clean up old usage records (older than 1 hour)
 * Should be called periodically
 */
export async function cleanupOldUsageRecords(): Promise<number> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const result = await db.execute(sql`
    DELETE FROM api_usage
    WHERE created_at < ${oneHourAgo}
  `);

  return (result as any).rowCount || 0;
}
