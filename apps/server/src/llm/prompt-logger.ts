/**
 * Prompt Logger - Logs prompts and decisions for the Live Inspector
 *
 * Phase 2: Live Inspector
 * - Captures full prompts sent to LLMs
 * - Records decisions and raw responses
 * - Stores performance metrics
 * - Supports per-agent retrieval for debugging
 */

import { db } from '../db';
import { promptLogs, type NewPromptLog, type PromptLog } from '../db/schema';
import { eq, and, desc, lt, sql } from 'drizzle-orm';
import { CONFIG, isEmergentPromptEnabled } from '../config';
import { buildSystemPrompt, buildObservationPrompt } from './prompt-builder';
import type { AgentObservation, AgentDecision } from './types';
import type { PersonalityTrait } from '../agents/personalities';

// =============================================================================
// Types
// =============================================================================

export interface PromptLogEntry {
  agentId: string;
  tick: number;
  observation: AgentObservation;
  personality?: PersonalityTrait | null;
  llmType: string;
  fullPrompt: string;
  decision?: AgentDecision | null;
  rawResponse?: string;
  inputTokens?: number;
  outputTokens?: number;
  processingTimeMs?: number;
  usedFallback?: boolean;
  usedCache?: boolean;
}

export interface PromptLogSummary {
  id: number;
  agentId: string;
  tick: number;
  llmType: string;
  action: string | null;
  processingTimeMs: number | null;
  usedFallback: boolean;
  usedCache: boolean;
  createdAt: Date;
}

// =============================================================================
// Configuration Check
// =============================================================================

/**
 * Check if prompt logging is enabled
 */
export function isPromptLoggingEnabled(): boolean {
  return CONFIG.promptInspector.enabled;
}

// =============================================================================
// Logging Functions
// =============================================================================

/**
 * Log a prompt and decision to the database
 */
export async function logPrompt(entry: PromptLogEntry): Promise<void> {
  if (!isPromptLoggingEnabled()) {
    return;
  }

  try {
    // Build system and observation prompts separately for inspection
    const systemPrompt = buildSystemPrompt(entry.personality);
    const observationPrompt = buildObservationPrompt(entry.observation);

    const newLog: NewPromptLog = {
      agentId: entry.agentId,
      tick: entry.tick,
      systemPrompt,
      observationPrompt,
      fullPrompt: entry.fullPrompt,
      decision: entry.decision ? {
        action: entry.decision.action,
        params: entry.decision.params as Record<string, unknown> | undefined,
        reasoning: entry.decision.reasoning,
      } : undefined,
      rawResponse: entry.rawResponse ?? null,
      llmType: entry.llmType,
      personality: entry.personality ?? null,
      promptMode: isEmergentPromptEnabled() ? 'emergent' : 'prescriptive',
      safetyLevel: CONFIG.experiment.safetyLevel,
      inputTokens: entry.inputTokens ?? null,
      outputTokens: entry.outputTokens ?? null,
      processingTimeMs: entry.processingTimeMs ?? null,
      usedFallback: entry.usedFallback ?? false,
      usedCache: entry.usedCache ?? false,
    };

    await db.insert(promptLogs).values(newLog);

    // Clean up old logs if we exceed the limit
    await cleanupOldLogs(entry.agentId);
  } catch (error) {
    // Don't let logging failures affect the main flow
    console.error('[PromptLogger] Error logging prompt:', error);
  }
}

/**
 * Clean up old logs for an agent if they exceed the limit
 */
async function cleanupOldLogs(agentId: string): Promise<void> {
  const maxLogs = CONFIG.promptInspector.maxLogsPerAgent;

  try {
    // Count current logs for this agent
    const countResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(promptLogs)
      .where(eq(promptLogs.agentId, agentId));

    const count = countResult[0]?.count ?? 0;

    if (count > maxLogs) {
      // Delete oldest logs beyond the limit
      const toDelete = count - maxLogs;

      // Get IDs of oldest logs
      const oldestLogs = await db
        .select({ id: promptLogs.id })
        .from(promptLogs)
        .where(eq(promptLogs.agentId, agentId))
        .orderBy(promptLogs.createdAt)
        .limit(toDelete);

      if (oldestLogs.length > 0) {
        const idsToDelete = oldestLogs.map((l) => l.id);
        await db
          .delete(promptLogs)
          .where(sql`${promptLogs.id} = ANY(${idsToDelete})`);
      }
    }
  } catch (error) {
    console.error('[PromptLogger] Error cleaning up old logs:', error);
  }
}

// =============================================================================
// Retrieval Functions
// =============================================================================

/**
 * Get prompt logs for an agent
 */
export async function getPromptLogs(
  agentId: string,
  limit = 50,
  offset = 0
): Promise<PromptLog[]> {
  return db
    .select()
    .from(promptLogs)
    .where(eq(promptLogs.agentId, agentId))
    .orderBy(desc(promptLogs.tick))
    .limit(limit)
    .offset(offset);
}

/**
 * Get a specific prompt log by agent and tick
 */
export async function getPromptLogByTick(
  agentId: string,
  tick: number
): Promise<PromptLog | null> {
  const results = await db
    .select()
    .from(promptLogs)
    .where(and(eq(promptLogs.agentId, agentId), eq(promptLogs.tick, tick)))
    .limit(1);

  return results[0] ?? null;
}

/**
 * Get the most recent prompt log for an agent
 */
export async function getCurrentPromptLog(agentId: string): Promise<PromptLog | null> {
  const results = await db
    .select()
    .from(promptLogs)
    .where(eq(promptLogs.agentId, agentId))
    .orderBy(desc(promptLogs.tick))
    .limit(1);

  return results[0] ?? null;
}

/**
 * Get prompt log summaries for an agent (lighter weight for timeline view)
 */
export async function getPromptLogSummaries(
  agentId: string,
  limit = 50
): Promise<PromptLogSummary[]> {
  const results = await db
    .select({
      id: promptLogs.id,
      agentId: promptLogs.agentId,
      tick: promptLogs.tick,
      llmType: promptLogs.llmType,
      decision: promptLogs.decision,
      processingTimeMs: promptLogs.processingTimeMs,
      usedFallback: promptLogs.usedFallback,
      usedCache: promptLogs.usedCache,
      createdAt: promptLogs.createdAt,
    })
    .from(promptLogs)
    .where(eq(promptLogs.agentId, agentId))
    .orderBy(desc(promptLogs.tick))
    .limit(limit);

  return results.map((r) => ({
    id: r.id,
    agentId: r.agentId,
    tick: r.tick,
    llmType: r.llmType,
    action: (r.decision as { action?: string } | null)?.action ?? null,
    processingTimeMs: r.processingTimeMs,
    usedFallback: r.usedFallback,
    usedCache: r.usedCache,
    createdAt: r.createdAt,
  }));
}

/**
 * Get prompt logs for a specific tick (all agents)
 */
export async function getPromptLogsByTick(tick: number): Promise<PromptLog[]> {
  return db
    .select()
    .from(promptLogs)
    .where(eq(promptLogs.tick, tick))
    .orderBy(promptLogs.agentId);
}

/**
 * Clean up logs older than the retention period
 */
export async function cleanupStalePromptLogs(currentTick: number): Promise<number> {
  const retentionTicks = CONFIG.promptInspector.retentionTicks;
  const cutoffTick = currentTick - retentionTicks;

  if (cutoffTick <= 0) {
    return 0;
  }

  try {
    const result = await db
      .delete(promptLogs)
      .where(lt(promptLogs.tick, cutoffTick))
      .returning({ id: promptLogs.id });

    return result.length;
  } catch (error) {
    console.error('[PromptLogger] Error cleaning up stale logs:', error);
    return 0;
  }
}

/**
 * Get total count of prompt logs for an agent
 */
export async function getPromptLogCount(agentId: string): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(promptLogs)
    .where(eq(promptLogs.agentId, agentId));

  return result[0]?.count ?? 0;
}

/**
 * Check if there are any prompt logs (useful for UI to know if inspector has data)
 */
export async function hasAnyPromptLogs(): Promise<boolean> {
  const result = await db
    .select({ id: promptLogs.id })
    .from(promptLogs)
    .limit(1);

  return result.length > 0;
}
