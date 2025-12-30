/**
 * LLM Metrics Queries - Phase 4: Performance Monitoring (§37)
 */

import { db } from '../index';
import {
  llmMetrics,
  tokenBudgets,
  type NewLLMMetric,
  type LLMMetric,
  type NewTokenBudget,
  type TokenBudget,
} from '../schema';
import { eq, and, desc, gte, lte, sql, avg, count } from 'drizzle-orm';

// =============================================================================
// LLM Metrics
// =============================================================================

/**
 * Record an LLM metric
 */
export async function recordLLMMetric(metric: NewLLMMetric): Promise<LLMMetric> {
  const [result] = await db.insert(llmMetrics).values(metric).returning();
  return result;
}

/**
 * Get metrics for an agent
 */
export async function getAgentMetrics(agentId: string, limit: number = 100): Promise<LLMMetric[]> {
  return db
    .select()
    .from(llmMetrics)
    .where(eq(llmMetrics.agentId, agentId))
    .orderBy(desc(llmMetrics.tick))
    .limit(limit);
}

/**
 * Get metrics by model
 */
export async function getModelMetrics(modelId: string, limit: number = 100): Promise<LLMMetric[]> {
  return db
    .select()
    .from(llmMetrics)
    .where(eq(llmMetrics.modelId, modelId))
    .orderBy(desc(llmMetrics.tick))
    .limit(limit);
}

/**
 * Get metrics in tick range
 */
export async function getMetricsInRange(
  startTick: number,
  endTick: number
): Promise<LLMMetric[]> {
  return db
    .select()
    .from(llmMetrics)
    .where(
      and(
        gte(llmMetrics.tick, startTick),
        lte(llmMetrics.tick, endTick)
      )
    )
    .orderBy(desc(llmMetrics.tick));
}

/**
 * Calculate average metrics for an agent
 */
export async function getAgentAvgMetrics(agentId: string): Promise<{
  avgLatencyMs: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  avgCostUsd: number;
  successRate: number;
  fallbackRate: number;
  totalCalls: number;
}> {
  const metrics = await getAgentMetrics(agentId, 1000);

  if (metrics.length === 0) {
    return {
      avgLatencyMs: 0,
      avgInputTokens: 0,
      avgOutputTokens: 0,
      avgCostUsd: 0,
      successRate: 1,
      fallbackRate: 0,
      totalCalls: 0,
    };
  }

  const totalLatency = metrics.reduce((sum, m) => sum + m.latencyMs, 0);
  const totalInputTokens = metrics.reduce((sum, m) => sum + (m.inputTokens || 0), 0);
  const totalOutputTokens = metrics.reduce((sum, m) => sum + (m.outputTokens || 0), 0);
  const totalCost = metrics.reduce((sum, m) => sum + (m.costUsd || 0), 0);
  const successCount = metrics.filter(m => m.success).length;
  const fallbackCount = metrics.filter(m => m.usedFallback).length;

  return {
    avgLatencyMs: totalLatency / metrics.length,
    avgInputTokens: totalInputTokens / metrics.length,
    avgOutputTokens: totalOutputTokens / metrics.length,
    avgCostUsd: totalCost / metrics.length,
    successRate: successCount / metrics.length,
    fallbackRate: fallbackCount / metrics.length,
    totalCalls: metrics.length,
  };
}

/**
 * Calculate model comparison metrics
 */
export async function getModelComparison(): Promise<Map<string, {
  avgLatency: number;
  successRate: number;
  avgCost: number;
  totalCalls: number;
}>> {
  const allMetrics = await db.select().from(llmMetrics);

  const modelStats = new Map<string, {
    totalLatency: number;
    totalCost: number;
    successCount: number;
    count: number;
  }>();

  for (const m of allMetrics) {
    const existing = modelStats.get(m.modelId) || {
      totalLatency: 0,
      totalCost: 0,
      successCount: 0,
      count: 0,
    };

    existing.totalLatency += m.latencyMs;
    existing.totalCost += m.costUsd || 0;
    if (m.success) existing.successCount++;
    existing.count++;

    modelStats.set(m.modelId, existing);
  }

  const result = new Map<string, {
    avgLatency: number;
    successRate: number;
    avgCost: number;
    totalCalls: number;
  }>();

  for (const [modelId, stats] of modelStats) {
    result.set(modelId, {
      avgLatency: stats.count > 0 ? stats.totalLatency / stats.count : 0,
      successRate: stats.count > 0 ? stats.successCount / stats.count : 0,
      avgCost: stats.count > 0 ? stats.totalCost / stats.count : 0,
      totalCalls: stats.count,
    });
  }

  return result;
}

/**
 * Calculate overthinking score (ratio of output to useful action tokens)
 */
export async function getOverthinkingScore(agentId: string): Promise<number> {
  const metrics = await getAgentMetrics(agentId, 50);

  if (metrics.length === 0) return 0;

  // Average output tokens - lower is better (more concise)
  const avgOutput = metrics.reduce((sum, m) => sum + (m.outputTokens || 0), 0) / metrics.length;

  // Normalize to 0-1 scale (256 tokens is baseline)
  // Higher score = more overthinking
  return Math.min(1, avgOutput / 256);
}

/**
 * Get system-wide health metrics
 */
export async function getSystemHealth(): Promise<{
  tickCompletionRate: number;
  llmAvailability: number;
  avgTickLatency: number;
  costPerHour: number;
}> {
  const recentMetrics = await db
    .select()
    .from(llmMetrics)
    .orderBy(desc(llmMetrics.tick))
    .limit(1000);

  if (recentMetrics.length === 0) {
    return {
      tickCompletionRate: 1,
      llmAvailability: 1,
      avgTickLatency: 0,
      costPerHour: 0,
    };
  }

  const successCount = recentMetrics.filter(m => m.success).length;
  const fallbackCount = recentMetrics.filter(m => m.usedFallback).length;
  const totalLatency = recentMetrics.reduce((sum, m) => sum + m.latencyMs, 0);
  const totalCost = recentMetrics.reduce((sum, m) => sum + (m.costUsd || 0), 0);

  // Estimate cost per hour based on recent data
  const uniqueTicks = new Set(recentMetrics.map(m => m.tick)).size;
  const costPerTick = uniqueTicks > 0 ? totalCost / uniqueTicks : 0;
  const costPerHour = costPerTick * 6; // Assuming 10-min ticks = 6 per hour

  return {
    tickCompletionRate: successCount / recentMetrics.length,
    llmAvailability: 1 - (fallbackCount / recentMetrics.length),
    avgTickLatency: totalLatency / recentMetrics.length,
    costPerHour,
  };
}

// =============================================================================
// Token Budgets
// =============================================================================

/**
 * Get or create token budget for agent (falls back to tenant default)
 */
export async function getTokenBudget(agentId: string, tenantId?: string): Promise<TokenBudget | null> {
  // First try agent-specific budget
  const [agentBudget] = await db
    .select()
    .from(tokenBudgets)
    .where(eq(tokenBudgets.agentId, agentId))
    .limit(1);

  if (agentBudget) return agentBudget;

  // Fall back to tenant default (agentId is null)
  if (tenantId) {
    const [tenantBudget] = await db
      .select()
      .from(tokenBudgets)
      .where(
        and(
          eq(tokenBudgets.tenantId, tenantId),
          sql`${tokenBudgets.agentId} IS NULL`
        )
      )
      .limit(1);

    return tenantBudget || null;
  }

  return null;
}

/**
 * Set token budget for agent
 */
export async function setTokenBudget(budget: NewTokenBudget): Promise<TokenBudget> {
  // Upsert - update if exists, insert if not
  const existing = budget.agentId
    ? await db.select().from(tokenBudgets).where(eq(tokenBudgets.agentId, budget.agentId)).limit(1)
    : [];

  if (existing.length > 0) {
    const [updated] = await db
      .update(tokenBudgets)
      .set({
        ...budget,
        updatedAt: new Date(),
      })
      .where(eq(tokenBudgets.id, existing[0].id))
      .returning();
    return updated;
  }

  const [created] = await db.insert(tokenBudgets).values(budget).returning();
  return created;
}

/**
 * Check if metric exceeds budget
 */
export function checkBudgetViolation(
  metric: { inputTokens?: number; outputTokens?: number; latencyMs: number },
  budget: TokenBudget
): {
  exceeded: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  if (metric.inputTokens && metric.inputTokens > budget.maxInputTokens) {
    violations.push(`Input tokens exceeded: ${metric.inputTokens} > ${budget.maxInputTokens}`);
  }

  if (metric.outputTokens && metric.outputTokens > budget.maxOutputTokens) {
    violations.push(`Output tokens exceeded: ${metric.outputTokens} > ${budget.maxOutputTokens}`);
  }

  if (metric.latencyMs > budget.maxLatencyMs) {
    violations.push(`Latency exceeded: ${metric.latencyMs}ms > ${budget.maxLatencyMs}ms`);
  }

  // Check thinking ratio
  if (metric.outputTokens && metric.outputTokens > 50) {
    const estimatedActionTokens = 50; // Approximate tokens for just action + params
    const ratio = metric.outputTokens / estimatedActionTokens;

    if (ratio >= budget.thinkingRatioCritical) {
      violations.push(`Critical overthinking: ratio ${ratio.toFixed(1)}x >= ${budget.thinkingRatioCritical}x`);
    } else if (ratio >= budget.thinkingRatioWarn) {
      violations.push(`Warning: overthinking ratio ${ratio.toFixed(1)}x >= ${budget.thinkingRatioWarn}x`);
    }
  }

  return {
    exceeded: violations.length > 0,
    violations,
  };
}
