/**
 * Baseline Agent Registry
 *
 * Factory and utility functions for creating and identifying baseline agents.
 * Baseline agents are non-LLM agents used for scientific comparison to measure
 * whether emergent behaviors are due to LLM reasoning or simulation mechanics.
 *
 * Four baseline types:
 * - random: Pure random action selection (null hypothesis)
 * - rule-based: Simple if-then-else heuristics (reactive intelligence)
 * - sugarscape: Classic Sugarscape agent behavior (resource competition baseline)
 * - qlearning: Reinforcement learning baseline (learned intelligence)
 */

import type { BaselineAgent, BaselineAgentType, BaselineLLMType, BaselineAgentConfig } from './types';
import type { AgentObservation, AgentDecision } from '../../llm/types';
import { RandomAgent } from './random-agent';
import { RuleBasedAgent } from './rule-based-agent';
import { SugarscapeAgent } from './sugarscape-agent';
import { QLearningAgent, getQLearningStats, resetQLearningState, exportQTable } from './qlearning-agent';

// Re-export types
export type { BaselineAgent, BaselineAgentType, BaselineLLMType, BaselineAgentConfig } from './types';

// Re-export agent classes
export { RandomAgent } from './random-agent';
export { RuleBasedAgent } from './rule-based-agent';
export { SugarscapeAgent } from './sugarscape-agent';
export { QLearningAgent, getQLearningStats, resetQLearningState, exportQTable } from './qlearning-agent';

// =============================================================================
// LLM Type Mapping
// =============================================================================

/**
 * All baseline LLM type strings.
 */
export const BASELINE_LLM_TYPES: BaselineLLMType[] = [
  'baseline_random',
  'baseline_rule',
  'baseline_sugarscape',
  'baseline_qlearning',
];

/**
 * Map from LLM type string to baseline agent type.
 */
const LLM_TYPE_TO_BASELINE: Record<BaselineLLMType, BaselineAgentType> = {
  baseline_random: 'random',
  baseline_rule: 'rule-based',
  baseline_sugarscape: 'sugarscape',
  baseline_qlearning: 'qlearning',
};

/**
 * Map from baseline agent type to LLM type string.
 */
const BASELINE_TO_LLM_TYPE: Record<BaselineAgentType, BaselineLLMType> = {
  'random': 'baseline_random',
  'rule-based': 'baseline_rule',
  'sugarscape': 'baseline_sugarscape',
  'qlearning': 'baseline_qlearning',
};

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a baseline agent instance by type.
 *
 * @param type - The baseline agent type
 * @param config - Optional configuration overrides
 * @returns A new baseline agent instance
 */
export function createBaselineAgent(
  type: BaselineAgentType,
  config?: BaselineAgentConfig
): BaselineAgent {
  switch (type) {
    case 'random':
      return new RandomAgent();
    case 'rule-based':
      return new RuleBasedAgent(config);
    case 'sugarscape':
      return new SugarscapeAgent(config);
    case 'qlearning':
      return new QLearningAgent(config);
    default:
      throw new Error(`Unknown baseline agent type: ${type}`);
  }
}

/**
 * Create a baseline agent from an LLM type string.
 *
 * @param llmType - The LLM type string (e.g., 'baseline_random')
 * @param config - Optional configuration overrides
 * @returns A new baseline agent instance, or undefined if not a baseline type
 */
export function createBaselineAgentFromLLMType(
  llmType: string,
  config?: BaselineAgentConfig
): BaselineAgent | undefined {
  if (!isBaselineAgent(llmType)) {
    return undefined;
  }

  const baselineType = LLM_TYPE_TO_BASELINE[llmType as BaselineLLMType];
  return createBaselineAgent(baselineType, config);
}

// =============================================================================
// Type Guards and Utilities
// =============================================================================

/**
 * Check if an LLM type string is a baseline agent type.
 *
 * @param llmType - The LLM type string to check
 * @returns True if this is a baseline agent type
 */
export function isBaselineAgent(llmType: string): llmType is BaselineLLMType {
  return BASELINE_LLM_TYPES.includes(llmType as BaselineLLMType);
}

/**
 * Get the baseline agent type from an LLM type string.
 *
 * @param llmType - The LLM type string
 * @returns The baseline agent type, or undefined if not a baseline
 */
export function getBaselineType(llmType: string): BaselineAgentType | undefined {
  if (!isBaselineAgent(llmType)) {
    return undefined;
  }
  return LLM_TYPE_TO_BASELINE[llmType as BaselineLLMType];
}

/**
 * Get the LLM type string for a baseline agent type.
 *
 * @param type - The baseline agent type
 * @returns The corresponding LLM type string
 */
export function getLLMTypeForBaseline(type: BaselineAgentType): BaselineLLMType {
  return BASELINE_TO_LLM_TYPE[type];
}

// =============================================================================
// Singleton Instance Cache
// =============================================================================

/**
 * Cache of baseline agent instances to avoid recreating on each tick.
 * Note: Q-learning agents maintain exploration rate state which decays over time.
 * Other baseline agents (random, rule-based, sugarscape) are stateless.
 */
const agentCache: Map<BaselineLLMType, BaselineAgent> = new Map();

/**
 * Get or create a cached baseline agent instance.
 * Instances are cached for efficiency. Note that Q-learning agents maintain
 * internal state (exploration rate), so cached instances preserve learning progress.
 *
 * @param llmType - The LLM type string
 * @param config - Optional configuration (only used on first creation)
 * @returns A baseline agent instance, or undefined if not a baseline type
 */
export function getOrCreateBaselineAgent(
  llmType: string,
  config?: BaselineAgentConfig
): BaselineAgent | undefined {
  if (!isBaselineAgent(llmType)) {
    return undefined;
  }

  const key = llmType as BaselineLLMType;
  let agent = agentCache.get(key);

  if (!agent) {
    agent = createBaselineAgentFromLLMType(llmType, config);
    if (agent) {
      agentCache.set(key, agent);
    }
  }

  return agent;
}

/**
 * Clear the agent cache (useful for testing or configuration changes).
 */
export function clearBaselineAgentCache(): void {
  agentCache.clear();
}

// =============================================================================
// Direct Decision Function
// =============================================================================

/**
 * Get a baseline decision directly without creating an instance.
 * Useful for integration with existing decision pipeline.
 *
 * @param llmType - The LLM type string
 * @param observation - The agent observation
 * @param config - Optional configuration
 * @returns The decision, or undefined if not a baseline type
 */
export function getBaselineDecision(
  llmType: string,
  observation: AgentObservation,
  config?: BaselineAgentConfig
): AgentDecision | undefined {
  const agent = getOrCreateBaselineAgent(llmType, config);
  if (!agent) {
    return undefined;
  }
  return agent.decide(observation);
}

// =============================================================================
// Statistics and Logging
// =============================================================================

/** Counters for tracking baseline agent usage */
let decisionCounts: Record<BaselineLLMType, number> = {
  baseline_random: 0,
  baseline_rule: 0,
  baseline_sugarscape: 0,
  baseline_qlearning: 0,
};

/**
 * Record a baseline decision for statistics.
 */
export function recordBaselineDecision(llmType: string): void {
  if (isBaselineAgent(llmType)) {
    decisionCounts[llmType as BaselineLLMType]++;
  }
}

/**
 * Get baseline decision statistics.
 */
export function getBaselineStats(): {
  total: number;
  byType: Record<BaselineLLMType, number>;
} {
  const total = Object.values(decisionCounts).reduce((a, b) => a + b, 0);
  return {
    total,
    byType: { ...decisionCounts },
  };
}

/**
 * Reset baseline decision statistics.
 */
export function resetBaselineStats(): void {
  decisionCounts = {
    baseline_random: 0,
    baseline_rule: 0,
    baseline_sugarscape: 0,
    baseline_qlearning: 0,
  };
}
