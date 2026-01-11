/**
 * Agent Orchestrator - Manages agent decision loop
 *
 * Scientific Model: uses resource spawns and shelters instead of typed locations
 * Phase 3: External agents with webhooks are handled directly, not through BullMQ
 */

import { getAliveAgents, updateAgent } from '../db/queries/agents';
import { getAllResourceSpawns, getAllShelters } from '../db/queries/world';
import { getEventsByAgent, appendEvent } from '../db/queries/events';
import { getExternalAgentByAgentId } from '../db/queries/external-agents';
import type { Agent } from '../db/schema';
import type { LLMType, AgentDecision, AgentObservation } from '../llm/types';
import {
  createExternalAgentAdapter,
  getFallbackDecision,
  getRandomWalkDecision,
} from '../llm';
import {
  isBaselineAgent,
  getBaselineDecision,
  recordBaselineDecision,
} from './baselines';
import { queueDecisions, waitForDecisions, type DecisionJobResult, type DecisionJobData } from '../queue';
import { tickEngine } from '../simulation/tick-engine';
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
 * Create fallback decision for external agents
 * Includes social context for employment and trading decisions
 */
function createFallbackDecision(observation: AgentObservation): AgentDecision {
  return getFallbackDecision(
    observation.self.hunger,
    observation.self.energy,
    observation.self.balance,
    observation.self.x,
    observation.self.y,
    observation.inventory,
    observation.nearbyResourceSpawns,
    observation.nearbyShelters,
    // Social context (Phase 1.2)
    observation.nearbyJobOffers,
    observation.activeEmployments,
    observation.nearbyAgents
  );
}

/**
 * Process external agents with webhooks directly (Phase 3: A2A Protocol)
 * These bypass the BullMQ queue for lower latency
 */
async function processExternalAgents(
  externalAgents: Array<{ agent: Agent; observation: AgentObservation; endpoint: string }>,
  tick: number
): Promise<DecisionJobResult[]> {
  if (externalAgents.length === 0) return [];

  console.log(`[Orchestrator] Processing ${externalAgents.length} external agents with webhooks`);

  // Process all external agents in parallel
  const results = await Promise.all(
    externalAgents.map(async ({ agent, observation, endpoint }) => {
      const startTime = Date.now();

      try {
        // Create adapter for this agent's endpoint
        const adapter = createExternalAgentAdapter(endpoint);

        // Get decision from external agent
        const decision = await adapter.decide(observation);

        return {
          agentId: agent.id,
          tick,
          decision,
          processingTimeMs: Date.now() - startTime,
          usedFallback: false,
        };
      } catch (error) {
        console.error(`[Orchestrator] External agent ${agent.id} error:`, error);

        // Use fallback decision on error
        return {
          agentId: agent.id,
          tick,
          decision: createFallbackDecision(observation),
          processingTimeMs: Date.now() - startTime,
          usedFallback: true,
        };
      }
    })
  );

  return results;
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

  // Build observations for all agents
  const agentObservations = await Promise.all(
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

      return { agent, observation };
    })
  );

  // Separate agents into categories: external with webhooks, baseline, and regular LLM
  const externalWithWebhooks: Array<{ agent: Agent; observation: AgentObservation; endpoint: string }> = [];
  const baselineAgents: Array<{ agent: Agent; observation: AgentObservation }> = [];
  const regularAgents: Array<{ agent: Agent; observation: AgentObservation }> = [];

  for (const { agent, observation } of agentObservations) {
    if (agent.llmType === 'external') {
      // Check if this external agent has a webhook endpoint
      const externalAgent = await getExternalAgentByAgentId(agent.id);
      if (externalAgent?.endpoint && externalAgent.isActive) {
        externalWithWebhooks.push({ agent, observation, endpoint: externalAgent.endpoint });
      } else {
        // External agent without webhook (poll mode) - skip, they submit via API
        console.log(`[Orchestrator] External agent ${agent.id} in poll mode, skipping`);
      }
    } else if (isBaselineAgent(agent.llmType)) {
      // Baseline agents use heuristic decisions, not LLM
      baselineAgents.push({ agent, observation });
    } else {
      regularAgents.push({ agent, observation });
    }
  }

  // Process external agents with webhooks directly (parallel)
  const externalDecisions = await processExternalAgents(externalWithWebhooks, tick);

  // Process baseline agents (no LLM calls, instant decisions)
  const baselineDecisions: DecisionJobResult[] = baselineAgents.map(({ agent, observation }) => {
    const startTime = Date.now();
    const decision = getBaselineDecision(agent.llmType, observation);

    // Record for statistics
    recordBaselineDecision(agent.llmType);

    if (!decision) {
      // Fallback if baseline agent somehow fails
      console.warn(`[Orchestrator] Baseline agent ${agent.llmType} failed to generate decision, using fallback`);
      return {
        agentId: agent.id,
        tick,
        decision: createFallbackDecision(observation),
        processingTimeMs: Date.now() - startTime,
        usedFallback: true,
      };
    }

    console.log(`[Orchestrator] Baseline ${agent.llmType} decision: ${decision.action}`);
    return {
      agentId: agent.id,
      tick,
      decision,
      processingTimeMs: Date.now() - startTime,
      usedFallback: false, // Not a fallback - this is the expected behavior
    };
  });

  if (baselineAgents.length > 0) {
    console.log(`[Orchestrator] Processed ${baselineAgents.length} baseline agents`);
  }

  // Check for experiment mode overrides
  const experimentContext = tickEngine.getExperimentContext();
  const useRandomWalk = experimentContext?.variantConfig?.useRandomWalk;
  const useOnlyFallback = experimentContext?.variantConfig?.useOnlyFallback;

  let queuedDecisionResults: DecisionJobResult[];

  if (useRandomWalk) {
    // RANDOM WALK MODE: Use random movement decisions (null hypothesis experiment)
    console.log(`[Orchestrator] EXPERIMENT: Random walk mode for ${regularAgents.length} agents`);
    queuedDecisionResults = regularAgents.map(({ agent, observation }) => ({
      agentId: agent.id,
      tick,
      decision: getRandomWalkDecision(observation),
      processingTimeMs: 0,
      usedFallback: true, // Mark as fallback for tracking
    }));
  } else if (useOnlyFallback) {
    // FALLBACK-ONLY MODE: Use rule-based decisions (baseline experiment)
    console.log(`[Orchestrator] EXPERIMENT: Fallback-only mode for ${regularAgents.length} agents`);
    queuedDecisionResults = regularAgents.map(({ agent, observation }) => ({
      agentId: agent.id,
      tick,
      decision: createFallbackDecision(observation),
      processingTimeMs: 0,
      usedFallback: true,
    }));
  } else {
    // NORMAL MODE: All agents use LLM for decisions (Radical Emergence)
    // Decision caching in the queue worker still provides performance optimization
    const jobs = regularAgents.map(({ agent, observation }) => ({
      agentId: agent.id,
      llmType: agent.llmType as LLMType,
      tick,
      observation,
    }));

    const queuedJobs = await queueDecisions(jobs);
    queuedDecisionResults = await waitForDecisions(queuedJobs, 30000);
  }

  // Combine all decision results (external, baseline, and regular LLM)
  const decisionResults = [...externalDecisions, ...baselineDecisions, ...queuedDecisionResults];

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
