/**
 * Rule-Based Agent - Priority-Based Heuristic Decision Making
 *
 * This baseline agent uses the existing Lizard Brain heuristics ALWAYS,
 * not just in survival mode. Simple if-then-else logic with fixed priorities.
 *
 * Used to measure: "What happens with basic reactive intelligence?"
 *
 * Scientific purpose:
 * - Measures emergent behavior from simple reactive rules
 * - Provides comparison between "reactive" and "reasoning" intelligence
 * - If LLM agents show more complex patterns, that's evidence of
 *   higher-order reasoning contributing to emergence
 *
 * Priority order:
 * 1. Critical hunger + has food -> consume
 * 2. Critical energy -> sleep
 * 3. At resource spawn with low hunger/resources -> gather
 * 4. Has money + hungry -> buy food
 * 5. Low money -> work
 * 6. Otherwise -> move toward nearest valuable resource
 */

import type { AgentObservation, AgentDecision, NearbyResourceSpawn } from '../../llm/types';
import type { BaselineAgent, BaselineAgentConfig } from './types';
import { randomChoice } from '../../utils/random';
import { CONFIG } from '../../config';

// =============================================================================
// Configuration Thresholds
// =============================================================================

interface RuleBasedThresholds {
  /** Critical hunger level - must eat immediately */
  criticalHunger: number;
  /** Low hunger level - should seek food */
  lowHunger: number;
  /** Critical energy level - must rest */
  criticalEnergy: number;
  /** Low energy level - should consider resting */
  lowEnergy: number;
  /** Low balance level - should work */
  lowBalance: number;
  /** Minimum energy to move */
  minEnergyToMove: number;
  /** Minimum energy to work */
  minEnergyToWork: number;
}

const DEFAULT_THRESHOLDS: RuleBasedThresholds = {
  criticalHunger: 20,
  lowHunger: 50,
  criticalEnergy: 20,
  lowEnergy: 40,
  lowBalance: 50,
  minEnergyToMove: 5,
  minEnergyToWork: 15,
};

// =============================================================================
// Rule-Based Agent Implementation
// =============================================================================

export class RuleBasedAgent implements BaselineAgent {
  readonly type = 'rule-based' as const;
  readonly name = 'Rule-Based Baseline';

  private thresholds: RuleBasedThresholds;

  constructor(config?: Partial<BaselineAgentConfig>) {
    this.thresholds = {
      ...DEFAULT_THRESHOLDS,
      lowHunger: config?.ruleBasedHungerThreshold ?? DEFAULT_THRESHOLDS.lowHunger,
      criticalEnergy: config?.ruleBasedEnergyThreshold ?? DEFAULT_THRESHOLDS.criticalEnergy,
      lowBalance: config?.ruleBasedBalanceThreshold ?? DEFAULT_THRESHOLDS.lowBalance,
    };
  }

  /**
   * Make a decision using priority-based heuristics.
   *
   * The rule-based agent follows a strict priority order:
   * 1. Critical survival needs (hunger, energy)
   * 2. Resource gathering when at spawns
   * 3. Economic needs (balance)
   * 4. Exploration when no urgent needs
   */
  decide(observation: AgentObservation): AgentDecision {
    const { self, inventory, nearbyResourceSpawns, nearbyShelters } = observation;

    // =======================================================================
    // Priority 1: CRITICAL HUNGER - Must eat to survive
    // =======================================================================
    if (self.hunger < this.thresholds.criticalHunger) {
      // 1a: If has food, consume it immediately
      const hasFood = inventory.some((i) => i.type === 'food' && i.quantity > 0);
      if (hasFood) {
        return {
          action: 'consume',
          params: { itemType: 'food' },
          reasoning: '[Rule-Based] Priority 1a: Critical hunger, consuming food',
        };
      }

      // 1b: If at food spawn, gather food
      const foodSpawnHere = this.getSpawnAtLocation(nearbyResourceSpawns, self.x, self.y, 'food');
      if (foodSpawnHere && foodSpawnHere.currentAmount > 0) {
        return {
          action: 'gather',
          params: { resourceType: 'food', quantity: Math.min(3, foodSpawnHere.currentAmount) },
          reasoning: '[Rule-Based] Priority 1b: Critical hunger, gathering food at spawn',
        };
      }

      // 1c: If has money, try to buy food
      if (self.balance >= CONFIG.actions.buy.prices.food) {
        return {
          action: 'buy',
          params: { itemType: 'food', quantity: 1 },
          reasoning: '[Rule-Based] Priority 1c: Critical hunger, buying food',
        };
      }

      // 1d: Move toward nearest food spawn
      const nearestFoodSpawn = this.findNearestSpawnOfType(nearbyResourceSpawns, self.x, self.y, 'food');
      if (nearestFoodSpawn) {
        return this.moveToward(self.x, self.y, nearestFoodSpawn.x, nearestFoodSpawn.y,
          '[Rule-Based] Priority 1d: Critical hunger, moving toward food spawn');
      }
    }

    // =======================================================================
    // Priority 2: CRITICAL ENERGY - Must rest to survive
    // =======================================================================
    if (self.energy < this.thresholds.criticalEnergy) {
      // Calculate sleep duration based on how tired we are
      const duration = self.energy < 10 ? 5 : 3;
      return {
        action: 'sleep',
        params: { duration },
        reasoning: `[Rule-Based] Priority 2: Critical energy (${self.energy}), sleeping for ${duration} ticks`,
      };
    }

    // =======================================================================
    // Priority 3: LOW HUNGER - Should seek food
    // =======================================================================
    if (self.hunger < this.thresholds.lowHunger) {
      // 3a: If has food, consume it
      const hasFood = inventory.some((i) => i.type === 'food' && i.quantity > 0);
      if (hasFood) {
        return {
          action: 'consume',
          params: { itemType: 'food' },
          reasoning: '[Rule-Based] Priority 3a: Low hunger, consuming food',
        };
      }

      // 3b: If at food spawn, gather food
      const foodSpawnHere = this.getSpawnAtLocation(nearbyResourceSpawns, self.x, self.y, 'food');
      if (foodSpawnHere && foodSpawnHere.currentAmount > 0) {
        return {
          action: 'gather',
          params: { resourceType: 'food', quantity: Math.min(2, foodSpawnHere.currentAmount) },
          reasoning: '[Rule-Based] Priority 3b: Low hunger, gathering food at spawn',
        };
      }

      // 3c: Move toward nearest food spawn
      const nearestFoodSpawn = this.findNearestSpawnOfType(nearbyResourceSpawns, self.x, self.y, 'food');
      if (nearestFoodSpawn) {
        const distance = Math.abs(nearestFoodSpawn.x - self.x) + Math.abs(nearestFoodSpawn.y - self.y);
        if (distance <= 10) { // Only move toward food if within reasonable distance
          return this.moveToward(self.x, self.y, nearestFoodSpawn.x, nearestFoodSpawn.y,
            '[Rule-Based] Priority 3c: Low hunger, moving toward food spawn');
        }
      }
    }

    // =======================================================================
    // Priority 4: LOW ENERGY - Should rest
    // =======================================================================
    if (self.energy < this.thresholds.lowEnergy) {
      // Check if at shelter for better rest
      const atShelter = nearbyShelters?.some((s) => s.x === self.x && s.y === self.y);
      const duration = atShelter ? 2 : 3;
      return {
        action: 'sleep',
        params: { duration },
        reasoning: `[Rule-Based] Priority 4: Low energy (${self.energy}), sleeping ${atShelter ? 'at shelter' : ''}`,
      };
    }

    // =======================================================================
    // Priority 5: AT RESOURCE SPAWN - Opportunistic gathering
    // =======================================================================
    const anySpawnHere = nearbyResourceSpawns?.find(
      (s) => s.x === self.x && s.y === self.y && s.currentAmount > 0
    );
    if (anySpawnHere && self.energy >= this.thresholds.minEnergyToMove) {
      return {
        action: 'gather',
        params: {
          resourceType: anySpawnHere.resourceType,
          quantity: Math.min(2, anySpawnHere.currentAmount),
        },
        reasoning: `[Rule-Based] Priority 5: At ${anySpawnHere.resourceType} spawn, gathering opportunistically`,
      };
    }

    // =======================================================================
    // Priority 6: LOW BALANCE - Need to work
    // =======================================================================
    if (self.balance < this.thresholds.lowBalance && self.energy >= this.thresholds.minEnergyToWork) {
      return {
        action: 'work',
        params: { duration: 2 },
        reasoning: `[Rule-Based] Priority 6: Low balance (${self.balance}), working`,
      };
    }

    // =======================================================================
    // Priority 7: EXPLORATION - No urgent needs, explore
    // =======================================================================
    if (self.energy >= this.thresholds.minEnergyToMove) {
      // Try to move toward nearest resource spawn we haven't fully gathered
      const nearestValueableSpawn = this.findNearestValueableSpawn(
        nearbyResourceSpawns,
        self.x,
        self.y
      );
      if (nearestValueableSpawn) {
        return this.moveToward(
          self.x,
          self.y,
          nearestValueableSpawn.x,
          nearestValueableSpawn.y,
          `[Rule-Based] Priority 7: Exploring toward ${nearestValueableSpawn.resourceType} spawn`
        );
      }

      // Random exploration if no specific target
      return this.randomMove(self.x, self.y, '[Rule-Based] Priority 7: Random exploration');
    }

    // =======================================================================
    // Default: REST
    // =======================================================================
    return {
      action: 'sleep',
      params: { duration: 1 },
      reasoning: '[Rule-Based] Default: No urgent needs, low energy, resting',
    };
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  /**
   * Get a resource spawn at the given location of a specific type.
   */
  private getSpawnAtLocation(
    spawns: NearbyResourceSpawn[] | undefined,
    x: number,
    y: number,
    resourceType: string
  ): NearbyResourceSpawn | undefined {
    return spawns?.find(
      (s) => s.x === x && s.y === y && s.resourceType === resourceType
    );
  }

  /**
   * Find the nearest spawn of a specific resource type.
   */
  private findNearestSpawnOfType(
    spawns: NearbyResourceSpawn[] | undefined,
    x: number,
    y: number,
    resourceType: string
  ): NearbyResourceSpawn | undefined {
    if (!spawns || spawns.length === 0) return undefined;

    const filtered = spawns.filter(
      (s) => s.resourceType === resourceType && s.currentAmount > 0
    );

    if (filtered.length === 0) return undefined;

    return filtered.reduce((closest, spawn) => {
      const distCurrent = Math.abs(spawn.x - x) + Math.abs(spawn.y - y);
      const distClosest = Math.abs(closest.x - x) + Math.abs(closest.y - y);
      return distCurrent < distClosest ? spawn : closest;
    });
  }

  /**
   * Find the nearest valuable (has resources) spawn.
   */
  private findNearestValueableSpawn(
    spawns: NearbyResourceSpawn[] | undefined,
    x: number,
    y: number
  ): NearbyResourceSpawn | undefined {
    if (!spawns || spawns.length === 0) return undefined;

    const valuable = spawns.filter((s) => s.currentAmount > 0);
    if (valuable.length === 0) return undefined;

    return valuable.reduce((closest, spawn) => {
      const distCurrent = Math.abs(spawn.x - x) + Math.abs(spawn.y - y);
      const distClosest = Math.abs(closest.x - x) + Math.abs(closest.y - y);
      return distCurrent < distClosest ? spawn : closest;
    });
  }

  /**
   * Create a move decision toward a target location.
   */
  private moveToward(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    reasoning: string
  ): AgentDecision {
    const gridSize = CONFIG.simulation.gridSize;
    const dx = Math.sign(toX - fromX);
    const dy = Math.sign(toY - fromY);

    // Move one step toward target (prefer X direction, then Y)
    let newX = fromX;
    let newY = fromY;

    if (dx !== 0) {
      newX = Math.max(0, Math.min(gridSize - 1, fromX + dx));
    } else if (dy !== 0) {
      newY = Math.max(0, Math.min(gridSize - 1, fromY + dy));
    }

    return {
      action: 'move',
      params: { toX: newX, toY: newY },
      reasoning,
    };
  }

  /**
   * Create a random move decision.
   */
  private randomMove(x: number, y: number, reasoning: string): AgentDecision {
    const gridSize = CONFIG.simulation.gridSize;
    const directions = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
    ];
    const dir = randomChoice(directions) ?? directions[0];
    const newX = Math.max(0, Math.min(gridSize - 1, x + dir.dx));
    const newY = Math.max(0, Math.min(gridSize - 1, y + dir.dy));

    return {
      action: 'move',
      params: { toX: newX, toY: newY },
      reasoning,
    };
  }
}
