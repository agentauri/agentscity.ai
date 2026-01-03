/**
 * Q-Learning Agent - Reinforcement Learning Baseline
 *
 * This baseline agent uses tabular Q-learning to learn action values over time.
 * It starts with no knowledge and learns from experience using rewards based on
 * survival metrics (hunger, energy, health changes).
 *
 * Used to measure: "What happens with learning-based intelligence?"
 *
 * Scientific purpose:
 * - Provides comparison between "learned" and "reasoning" intelligence
 * - Measures emergent behavior from adaptive learning vs. LLM reasoning
 * - If LLM agents show different patterns, that's evidence of
 *   different decision-making processes
 *
 * Q-Learning formula:
 *   Q(s,a) = Q(s,a) + alpha * (reward + gamma * max(Q(s',a')) - Q(s,a))
 *
 * State representation:
 * - Discretized hunger level (high/medium/low/critical)
 * - Discretized energy level (high/medium/low/critical)
 * - Presence at resource spawn (yes/no)
 * - Has food in inventory (yes/no)
 *
 * Actions:
 * - move_random, gather, consume_food, sleep, work, buy_food
 */

import type { AgentObservation, AgentDecision } from '../../llm/types';
import type { BaselineAgent, BaselineAgentConfig } from './types';
import { random, randomChoice } from '../../utils/random';
import { CONFIG } from '../../config';

// =============================================================================
// Q-Table Memory Management
// =============================================================================

/** Maximum Q-table entries to prevent unbounded memory growth */
const MAX_QTABLE_STATES = 10000;

/** Maximum entries for per-agent tracking maps */
const MAX_AGENT_TRACKING = 1000;

// =============================================================================
// Q-Learning Configuration
// =============================================================================

interface QLearningConfig {
  /** Learning rate (alpha) - how much new info overrides old */
  learningRate: number;
  /** Discount factor (gamma) - importance of future rewards */
  discountFactor: number;
  /** Exploration rate (epsilon) - probability of random action */
  explorationRate: number;
  /** Exploration decay - how fast exploration decreases */
  explorationDecay: number;
  /** Minimum exploration rate */
  minExplorationRate: number;
}

const DEFAULT_QLEARNING_CONFIG: QLearningConfig = {
  learningRate: 0.1,
  discountFactor: 0.95,
  explorationRate: 0.3,
  explorationDecay: 0.999,
  minExplorationRate: 0.05,
};

// =============================================================================
// State Discretization
// =============================================================================

type DiscreteLevel = 'critical' | 'low' | 'medium' | 'high';

interface DiscreteState {
  hunger: DiscreteLevel;
  energy: DiscreteLevel;
  atResourceSpawn: boolean;
  hasFood: boolean;
  hasMoney: boolean;
  atShelter: boolean;
}

function discretizeLevel(value: number): DiscreteLevel {
  if (value < 20) return 'critical';
  if (value < 40) return 'low';
  if (value < 70) return 'medium';
  return 'high';
}

function stateToKey(state: DiscreteState): string {
  return `${state.hunger}_${state.energy}_${state.atResourceSpawn ? 1 : 0}_${state.hasFood ? 1 : 0}_${state.hasMoney ? 1 : 0}_${state.atShelter ? 1 : 0}`;
}

// =============================================================================
// Actions
// =============================================================================

type QLearningAction =
  | 'move_random'
  | 'move_to_resource'
  | 'move_to_shelter'
  | 'gather'
  | 'consume_food'
  | 'sleep'
  | 'work'
  | 'buy_food';

const ALL_ACTIONS: QLearningAction[] = [
  'move_random',
  'move_to_resource',
  'move_to_shelter',
  'gather',
  'consume_food',
  'sleep',
  'work',
  'buy_food',
];

// =============================================================================
// Reward Calculation
// =============================================================================

interface AgentVitals {
  hunger: number;
  energy: number;
  health: number;
  balance: number;
}

function calculateReward(prevVitals: AgentVitals, currVitals: AgentVitals): number {
  let reward = 0;

  // Reward for staying alive
  reward += 1.0;

  // Reward for hunger improvement
  const hungerDelta = currVitals.hunger - prevVitals.hunger;
  if (hungerDelta > 0) {
    reward += hungerDelta * 0.5; // Bonus for eating
  } else if (currVitals.hunger < 20) {
    reward -= 2.0; // Penalty for critical hunger
  }

  // Reward for energy improvement
  const energyDelta = currVitals.energy - prevVitals.energy;
  if (energyDelta > 0) {
    reward += energyDelta * 0.3; // Bonus for resting
  } else if (currVitals.energy < 20) {
    reward -= 1.0; // Penalty for critical energy
  }

  // Penalty for health loss
  const healthDelta = currVitals.health - prevVitals.health;
  if (healthDelta < 0) {
    reward += healthDelta * 2.0; // Strong penalty for health loss
  }

  // Small reward for accumulating balance
  const balanceDelta = currVitals.balance - prevVitals.balance;
  if (balanceDelta > 0) {
    reward += Math.min(balanceDelta * 0.1, 1.0);
  }

  return reward;
}

// =============================================================================
// Q-Learning Agent Implementation
// =============================================================================

/**
 * Shared Q-table across all Q-learning agent instances.
 * This allows learning to persist and accumulate across ticks.
 * Limited to MAX_QTABLE_STATES entries to prevent memory leaks.
 */
const sharedQTable: Map<string, Map<QLearningAction, number>> = new Map();

/** Track previous vitals for reward calculation (keyed by agent ID) */
const previousVitals: Map<string, AgentVitals> = new Map();

/** Track previous state-action pairs for Q-value updates */
const previousStateActions: Map<string, { stateKey: string; action: QLearningAction }> = new Map();

/**
 * Prune Q-table to prevent unbounded memory growth.
 * Removes oldest entries (FIFO) when limit is exceeded.
 */
function pruneQTableIfNeeded(): void {
  if (sharedQTable.size > MAX_QTABLE_STATES) {
    const entriesToRemove = sharedQTable.size - MAX_QTABLE_STATES;
    const keys = [...sharedQTable.keys()];
    for (let i = 0; i < entriesToRemove; i++) {
      sharedQTable.delete(keys[i]);
    }
  }
}

/**
 * Prune agent tracking maps to prevent memory leaks from dead/removed agents.
 */
function pruneAgentTrackingIfNeeded(): void {
  if (previousVitals.size > MAX_AGENT_TRACKING) {
    const entriesToRemove = previousVitals.size - MAX_AGENT_TRACKING;
    const keys = [...previousVitals.keys()];
    for (let i = 0; i < entriesToRemove; i++) {
      previousVitals.delete(keys[i]);
      previousStateActions.delete(keys[i]);
    }
  }
}

export class QLearningAgent implements BaselineAgent {
  readonly type = 'qlearning' as const;
  readonly name = 'Q-Learning Baseline';

  private config: QLearningConfig;
  private currentExplorationRate: number;

  constructor(config?: Partial<BaselineAgentConfig & QLearningConfig>) {
    this.config = {
      ...DEFAULT_QLEARNING_CONFIG,
      ...config,
    };
    this.currentExplorationRate = this.config.explorationRate;
  }

  /**
   * Make a decision using Q-learning.
   *
   * The agent:
   * 1. Updates Q-values from previous action's outcome
   * 2. Discretizes current state
   * 3. Selects action (epsilon-greedy)
   * 4. Stores state for next update
   */
  decide(observation: AgentObservation): AgentDecision {
    const agentId = observation.self.id;
    const currentState = this.observationToState(observation);
    const currentStateKey = stateToKey(currentState);
    const currentVitals = this.extractVitals(observation);

    // Step 1: Update Q-values from previous action's outcome
    const prevStateAction = previousStateActions.get(agentId);
    const prevVitals = previousVitals.get(agentId);

    if (prevStateAction && prevVitals) {
      const reward = calculateReward(prevVitals, currentVitals);
      this.updateQValue(
        prevStateAction.stateKey,
        prevStateAction.action,
        reward,
        currentStateKey
      );
    }

    // Step 2: Get valid actions for current state
    const validActions = this.getValidActions(observation, currentState);

    // Step 3: Select action (epsilon-greedy)
    let selectedAction: QLearningAction;
    if (random() < this.currentExplorationRate) {
      // Explore: random action
      selectedAction = randomChoice(validActions) ?? 'sleep';
    } else {
      // Exploit: best known action
      selectedAction = this.getBestAction(currentStateKey, validActions);
    }

    // Decay exploration rate
    this.currentExplorationRate = Math.max(
      this.config.minExplorationRate,
      this.currentExplorationRate * this.config.explorationDecay
    );

    // Step 4: Store state for next update
    previousVitals.set(agentId, currentVitals);
    previousStateActions.set(agentId, { stateKey: currentStateKey, action: selectedAction });

    // Prune agent tracking maps to prevent memory leaks
    pruneAgentTrackingIfNeeded();

    // Convert Q-learning action to agent decision
    return this.actionToDecision(selectedAction, observation);
  }

  // ===========================================================================
  // Q-Learning Core Methods
  // ===========================================================================

  /**
   * Get Q-value for a state-action pair.
   */
  private getQValue(stateKey: string, action: QLearningAction): number {
    const stateValues = sharedQTable.get(stateKey);
    if (!stateValues) return 0;
    return stateValues.get(action) ?? 0;
  }

  /**
   * Set Q-value for a state-action pair.
   */
  private setQValue(stateKey: string, action: QLearningAction, value: number): void {
    let stateValues = sharedQTable.get(stateKey);
    if (!stateValues) {
      stateValues = new Map();
      sharedQTable.set(stateKey, stateValues);
      // Prune Q-table when adding new states
      pruneQTableIfNeeded();
    }
    stateValues.set(action, value);
  }

  /**
   * Update Q-value using Q-learning formula.
   */
  private updateQValue(
    stateKey: string,
    action: QLearningAction,
    reward: number,
    nextStateKey: string
  ): void {
    const currentQ = this.getQValue(stateKey, action);
    const maxNextQ = this.getMaxQValue(nextStateKey);

    // Q(s,a) = Q(s,a) + alpha * (reward + gamma * max(Q(s',a')) - Q(s,a))
    const newQ =
      currentQ +
      this.config.learningRate * (reward + this.config.discountFactor * maxNextQ - currentQ);

    this.setQValue(stateKey, action, newQ);
  }

  /**
   * Get the maximum Q-value for a state (across all actions).
   */
  private getMaxQValue(stateKey: string): number {
    const stateValues = sharedQTable.get(stateKey);
    if (!stateValues || stateValues.size === 0) return 0;
    return Math.max(...stateValues.values());
  }

  /**
   * Get the best action for a state (highest Q-value).
   */
  private getBestAction(stateKey: string, validActions: QLearningAction[]): QLearningAction {
    // Safety check for empty array
    if (validActions.length === 0) {
      return 'sleep';
    }
    let bestAction = validActions[0];
    let bestValue = this.getQValue(stateKey, bestAction);

    for (const action of validActions) {
      const value = this.getQValue(stateKey, action);
      if (value > bestValue) {
        bestValue = value;
        bestAction = action;
      }
    }

    return bestAction;
  }

  // ===========================================================================
  // State Extraction
  // ===========================================================================

  /**
   * Convert observation to discrete state.
   */
  private observationToState(obs: AgentObservation): DiscreteState {
    const { self, inventory, nearbyResourceSpawns, nearbyShelters } = obs;

    const atResourceSpawn = nearbyResourceSpawns?.some(
      (s) => s.x === self.x && s.y === self.y && s.currentAmount > 0
    ) ?? false;

    const hasFood = inventory?.some((i) => i.type === 'food' && i.quantity > 0) ?? false;
    const hasMoney = self.balance >= CONFIG.actions.buy.prices.food;

    const atShelter = nearbyShelters?.some(
      (s) => s.x === self.x && s.y === self.y
    ) ?? false;

    return {
      hunger: discretizeLevel(self.hunger),
      energy: discretizeLevel(self.energy),
      atResourceSpawn,
      hasFood,
      hasMoney,
      atShelter,
    };
  }

  /**
   * Extract vitals from observation.
   */
  private extractVitals(obs: AgentObservation): AgentVitals {
    return {
      hunger: obs.self.hunger,
      energy: obs.self.energy,
      health: obs.self.health,
      balance: obs.self.balance,
    };
  }

  // ===========================================================================
  // Action Validation & Conversion
  // ===========================================================================

  /**
   * Get valid actions for current state.
   */
  private getValidActions(obs: AgentObservation, state: DiscreteState): QLearningAction[] {
    const valid: QLearningAction[] = [];

    // Always can try to move (if has some energy)
    if (obs.self.energy >= 1) {
      valid.push('move_random');
      if (obs.nearbyResourceSpawns && obs.nearbyResourceSpawns.length > 0) {
        valid.push('move_to_resource');
      }
      if (obs.nearbyShelters && obs.nearbyShelters.length > 0) {
        valid.push('move_to_shelter');
      }
    }

    // Gather if at resource spawn with resources
    if (state.atResourceSpawn && obs.self.energy >= 1) {
      valid.push('gather');
    }

    // Consume if has food
    if (state.hasFood) {
      valid.push('consume_food');
    }

    // Always can sleep
    valid.push('sleep');

    // Work if has energy
    if (obs.self.energy >= 10) {
      valid.push('work');
    }

    // Buy if has money
    if (state.hasMoney) {
      valid.push('buy_food');
    }

    return valid.length > 0 ? valid : ['sleep'];
  }

  /**
   * Convert Q-learning action to agent decision.
   */
  private actionToDecision(action: QLearningAction, obs: AgentObservation): AgentDecision {
    const { self, nearbyResourceSpawns, nearbyShelters, inventory } = obs;
    const gridSize = CONFIG.simulation.gridSize;

    switch (action) {
      case 'move_random': {
        const directions = [
          { dx: 0, dy: -1 },
          { dx: 0, dy: 1 },
          { dx: 1, dy: 0 },
          { dx: -1, dy: 0 },
        ];
        const dir = randomChoice(directions) ?? directions[0];
        return {
          action: 'move',
          params: {
            toX: Math.max(0, Math.min(gridSize - 1, self.x + dir.dx)),
            toY: Math.max(0, Math.min(gridSize - 1, self.y + dir.dy)),
          },
          reasoning: '[Q-Learning] Exploring randomly',
        };
      }

      case 'move_to_resource': {
        const nearest = this.findNearestSpawn(nearbyResourceSpawns, self.x, self.y);
        if (nearest) {
          const dx = Math.sign(nearest.x - self.x);
          const dy = Math.sign(nearest.y - self.y);
          return {
            action: 'move',
            params: {
              toX: Math.max(0, Math.min(gridSize - 1, self.x + (dx || dy ? dx : 0))),
              toY: Math.max(0, Math.min(gridSize - 1, self.y + (dx ? 0 : dy))),
            },
            reasoning: `[Q-Learning] Moving toward ${nearest.resourceType} spawn`,
          };
        }
        // Fall back to random move
        return this.actionToDecision('move_random', obs);
      }

      case 'move_to_shelter': {
        const nearest = nearbyShelters?.reduce((closest, shelter) => {
          const distCurrent = Math.abs(shelter.x - self.x) + Math.abs(shelter.y - self.y);
          const distClosest = Math.abs(closest.x - self.x) + Math.abs(closest.y - self.y);
          return distCurrent < distClosest ? shelter : closest;
        });
        if (nearest) {
          const dx = Math.sign(nearest.x - self.x);
          const dy = Math.sign(nearest.y - self.y);
          return {
            action: 'move',
            params: {
              toX: Math.max(0, Math.min(gridSize - 1, self.x + (dx || dy ? dx : 0))),
              toY: Math.max(0, Math.min(gridSize - 1, self.y + (dx ? 0 : dy))),
            },
            reasoning: '[Q-Learning] Moving toward shelter',
          };
        }
        return this.actionToDecision('move_random', obs);
      }

      case 'gather': {
        const spawnHere = nearbyResourceSpawns?.find(
          (s) => s.x === self.x && s.y === self.y && s.currentAmount > 0
        );
        return {
          action: 'gather',
          params: {
            resourceType: spawnHere?.resourceType ?? 'food',
            quantity: Math.min(2, spawnHere?.currentAmount ?? 1),
          },
          reasoning: `[Q-Learning] Gathering ${spawnHere?.resourceType ?? 'resources'}`,
        };
      }

      case 'consume_food': {
        return {
          action: 'consume',
          params: { itemType: 'food' },
          reasoning: '[Q-Learning] Consuming food',
        };
      }

      case 'sleep': {
        return {
          action: 'sleep',
          params: { duration: 2 },
          reasoning: '[Q-Learning] Resting',
        };
      }

      case 'work': {
        return {
          action: 'work',
          params: { duration: 2 },
          reasoning: '[Q-Learning] Working for currency',
        };
      }

      case 'buy_food': {
        return {
          action: 'buy',
          params: { itemType: 'food', quantity: 1 },
          reasoning: '[Q-Learning] Buying food',
        };
      }

      default:
        return {
          action: 'sleep',
          params: { duration: 1 },
          reasoning: '[Q-Learning] Default action',
        };
    }
  }

  /**
   * Find nearest resource spawn.
   */
  private findNearestSpawn(
    spawns: AgentObservation['nearbyResourceSpawns'],
    x: number,
    y: number
  ): AgentObservation['nearbyResourceSpawns'][0] | undefined {
    if (!spawns || spawns.length === 0) return undefined;

    const withResources = spawns.filter((s) => s.currentAmount > 0);
    if (withResources.length === 0) return undefined;

    return withResources.reduce((closest, spawn) => {
      const distCurrent = Math.abs(spawn.x - x) + Math.abs(spawn.y - y);
      const distClosest = Math.abs(closest.x - x) + Math.abs(closest.y - y);
      return distCurrent < distClosest ? spawn : closest;
    });
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get Q-table statistics for analysis.
 */
export function getQLearningStats(): {
  stateCount: number;
  totalQValues: number;
  avgQValue: number;
  exploredStates: string[];
} {
  let totalValues = 0;
  let sum = 0;
  const states: string[] = [];

  for (const [stateKey, actions] of sharedQTable.entries()) {
    states.push(stateKey);
    for (const value of actions.values()) {
      totalValues++;
      sum += value;
    }
  }

  return {
    stateCount: sharedQTable.size,
    totalQValues: totalValues,
    avgQValue: totalValues > 0 ? sum / totalValues : 0,
    exploredStates: states.slice(0, 20), // First 20 for logging
  };
}

/**
 * Reset the Q-table (useful for new experiments).
 */
export function resetQLearningState(): void {
  sharedQTable.clear();
  previousVitals.clear();
  previousStateActions.clear();
}

/**
 * Export Q-table for analysis.
 */
export function exportQTable(): Record<string, Record<QLearningAction, number>> {
  const result: Record<string, Record<QLearningAction, number>> = {};

  for (const [stateKey, actions] of sharedQTable.entries()) {
    result[stateKey] = {} as Record<QLearningAction, number>;
    for (const [action, value] of actions.entries()) {
      result[stateKey][action] = value;
    }
  }

  return result;
}
