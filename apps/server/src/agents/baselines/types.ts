/**
 * Baseline Agent Types
 *
 * Defines the interface for non-LLM baseline agents used in scientific
 * comparison experiments. These agents provide control groups to measure
 * whether emergent behaviors are due to LLM reasoning or simulation mechanics.
 *
 * Three baseline types:
 * - random: Pure random action selection (null hypothesis)
 * - rule-based: Simple if-then-else heuristics (reactive intelligence)
 * - sugarscape: Classic Sugarscape agent behavior (resource competition baseline)
 */

import type { AgentObservation, AgentDecision } from '../../llm/types';

// =============================================================================
// Baseline Agent Type
// =============================================================================

/**
 * Types of baseline agents for scientific comparison.
 *
 * - random: Completely random valid actions (measures "zero intelligence")
 * - rule-based: Priority-based heuristics (measures "reactive intelligence")
 * - sugarscape: Classic Sugarscape behavior (measures "baseline emergence")
 * - qlearning: Reinforcement learning baseline (measures "learned intelligence")
 */
export type BaselineAgentType = 'random' | 'rule-based' | 'sugarscape' | 'qlearning';

/**
 * LLM type strings for baseline agents.
 * These are used in the LLMType union to identify baseline agents.
 */
export type BaselineLLMType =
  | 'baseline_random'
  | 'baseline_rule'
  | 'baseline_sugarscape'
  | 'baseline_qlearning';

// =============================================================================
// Baseline Agent Interface
// =============================================================================

/**
 * Interface for all baseline agent implementations.
 * Each baseline agent must provide a decide() method that takes an observation
 * and returns a decision synchronously (no LLM calls).
 */
export interface BaselineAgent {
  /** The type of baseline agent */
  readonly type: BaselineAgentType;

  /** Human-readable name for logging */
  readonly name: string;

  /**
   * Make a decision based on the current observation.
   * This is synchronous since no LLM calls are made.
   *
   * @param observation - The agent's current view of the world
   * @returns The decision to execute
   */
  decide(observation: AgentObservation): AgentDecision;
}

// =============================================================================
// Configuration
// =============================================================================

/**
 * Configuration options for baseline agents.
 */
export interface BaselineAgentConfig {
  /** Sugarscape agent vision range (cells in each direction) */
  sugarscapeVision?: number;

  /** Sugarscape agent metabolism (resources consumed per tick) */
  sugarscapeMetabolism?: number;

  /** Rule-based agent hunger threshold for consuming food */
  ruleBasedHungerThreshold?: number;

  /** Rule-based agent energy threshold for sleeping */
  ruleBasedEnergyThreshold?: number;

  /** Rule-based agent balance threshold for working */
  ruleBasedBalanceThreshold?: number;

  /** Q-learning agent learning rate (alpha) */
  qlearningLearningRate?: number;

  /** Q-learning agent discount factor (gamma) */
  qlearningDiscountFactor?: number;

  /** Q-learning agent exploration rate (epsilon) */
  qlearningExplorationRate?: number;

  /** Q-learning agent exploration decay rate */
  qlearningExplorationDecay?: number;

  /** Q-learning agent minimum exploration rate */
  qlearningMinExplorationRate?: number;
}

/**
 * Default configuration values.
 */
export const DEFAULT_BASELINE_CONFIG: Required<BaselineAgentConfig> = {
  sugarscapeVision: 4,
  sugarscapeMetabolism: 1,
  ruleBasedHungerThreshold: 50,
  ruleBasedEnergyThreshold: 30,
  ruleBasedBalanceThreshold: 50,
  qlearningLearningRate: 0.1,
  qlearningDiscountFactor: 0.95,
  qlearningExplorationRate: 0.3,
  qlearningExplorationDecay: 0.999,
  qlearningMinExplorationRate: 0.05,
};
