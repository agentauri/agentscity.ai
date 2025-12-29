/**
 * Agent Orchestrator - Manages agent decision loop
 *
 * Scientific Model: uses resource spawns and shelters instead of typed locations
 */

import { getAliveAgents, updateAgent } from '../db/queries/agents';
import { getAllResourceSpawns, getAllShelters } from '../db/queries/world';
import { getEventsByAgent, appendEvent } from '../db/queries/events';
import type { Agent } from '../db/schema';
import type { LLMType, AgentDecision } from '../llm/types';
import { queueDecisions, waitForDecisions, type DecisionJobResult } from '../queue';
import { buildObservation, formatEvent } from './observer';
import { executeAction, createIntent } from '../actions';
import type { ActionResult } from '../actions/types';

export interface AgentTickResult {
  agentId: string;
  llmType: string;
  decision: AgentDecision | null;
  actionResult: ActionResult | null;
  processingTimeMs: number;
  usedFallback: boolean;
  error?: string;
}

/**
 * Process all agents for a tick
 */
export async function processAgentsTick(tick: number): Promise<AgentTickResult[]> {
  // Get alive agents and world state
  const [agents, resourceSpawns, shelters] = await Promise.all([
    getAliveAgents(),
    getAllResourceSpawns(),
    getAllShelters(),
  ]);

  if (agents.length === 0) {
    console.log('[Orchestrator] No alive agents');
    return [];
  }

  console.log(`[Orchestrator] Processing ${agents.length} agents for tick ${tick}`);

  // Build observations and queue decisions
  const jobs = await Promise.all(
    agents.map(async (agent) => {
      // Get recent events for this agent
      const recentDbEvents = await getEventsByAgent(agent.id, 10);
      const recentEvents = recentDbEvents.map((e) =>
        formatEvent({
          type: e.eventType,
          tick: e.tick,
          payload: e.payload as Record<string, unknown>,
        })
      );

      const observation = await buildObservation(agent, tick, agents, resourceSpawns, shelters, recentEvents);

      return {
        agentId: agent.id,
        llmType: agent.llmType as LLMType,
        tick,
        observation,
      };
    })
  );

  // Queue all decisions
  const queuedJobs = await queueDecisions(jobs);

  // Wait for all decisions (with 30s timeout per job, uses fallback on timeout)
  const decisionResults = await waitForDecisions(queuedJobs, 30000);

  // Execute actions for each decision
  const results: AgentTickResult[] = [];

  for (const result of decisionResults) {
    // Skip null/undefined results (can happen on timeout)
    if (!result || !result.agentId || !result.decision) {
      console.warn('[Orchestrator] Skipping invalid decision result:', result);
      continue;
    }

    const agent = agents.find((a) => a.id === result.agentId);
    if (!agent) continue;

    let actionResult: ActionResult | null = null;
    let error: string | undefined;

    try {
      // Create action intent
      const intent = createIntent(
        result.agentId,
        result.decision.action,
        result.decision.params,
        tick
      );

      // Execute action
      actionResult = await executeAction(intent, agent);

      // Log and store failed actions so agent can learn from them
      if (!actionResult.success) {
        console.warn(`[Orchestrator] Action ${result.decision.action} failed for ${agent.llmType}:`, actionResult.error);

        // Store action_failed event so agent sees it in next tick
        await appendEvent({
          eventType: 'action_failed',
          tick,
          agentId: agent.id,
          payload: {
            action: result.decision.action,
            params: result.decision.params,
            error: actionResult.error,
          },
        });
      }

      // Apply changes if successful
      if (actionResult.success && actionResult.changes) {
        await updateAgent(result.agentId, actionResult.changes);
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unknown error';
      console.error(`[Orchestrator] Error executing action for ${result.agentId}:`, error);
    }

    results.push({
      agentId: result.agentId,
      llmType: agent.llmType,
      decision: result.decision,
      actionResult,
      processingTimeMs: result.processingTimeMs,
      usedFallback: result.usedFallback,
      error,
    });
  }

  // Log summary
  const successful = results.filter((r) => r.actionResult?.success).length;
  const fallbacks = results.filter((r) => r.usedFallback).length;
  console.log(`[Orchestrator] Tick ${tick}: ${successful}/${results.length} successful, ${fallbacks} fallbacks`);

  return results;
}

/**
 * Get agent by ID from current state
 */
export async function getAgentState(agentId: string): Promise<Agent | undefined> {
  const agents = await getAliveAgents();
  return agents.find((a) => a.id === agentId);
}
