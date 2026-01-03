/**
 * Sugarscape Agent - Classic Sugarscape Behavior
 *
 * Implements the classic Sugarscape agent behavior as described by Epstein & Axtell:
 * "Look around as far as you can; find the spot with the most sugar; go there and eat"
 *
 * Used to measure: "What's the baseline emergent economy from simple resource competition?"
 *
 * Scientific purpose:
 * - Recreates the foundational ABM model for comparison
 * - Measures economic emergence from pure resource-seeking behavior
 * - NO social actions (trade, harm, steal) - purely individual optimization
 * - Provides benchmark for comparing LLM social behavior emergence
 *
 * Classic Sugarscape Rules (Epstein & Axtell, 1996):
 * 1. Look at all cells within vision radius
 * 2. Find the cell with the most sugar (resources)
 * 3. Move to that cell
 * 4. Gather/consume the resource
 * 5. Metabolize (hunger/energy decay handled by simulation)
 *
 * This implementation extends the classic model with:
 * - Multiple resource types (food, energy, material)
 * - Energy costs for movement
 * - Health management through consumption
 */

import type { AgentObservation, AgentDecision, NearbyResourceSpawn } from '../../llm/types';
import type { BaselineAgent, BaselineAgentConfig } from './types';
import { random, randomChoice } from '../../utils/random';
import { CONFIG } from '../../config';

// =============================================================================
// Sugarscape Configuration
// =============================================================================

interface SugarscapeConfig {
  /** How far the agent can see (Manhattan distance) */
  vision: number;
  /** Metabolic rate - resources needed per tick (affects decision urgency) */
  metabolism: number;
  /** Minimum energy before forced rest */
  minEnergyToMove: number;
  /** Critical hunger threshold */
  criticalHunger: number;
  /** Critical energy threshold */
  criticalEnergy: number;
}

const DEFAULT_SUGARSCAPE_CONFIG: SugarscapeConfig = {
  vision: 4,
  metabolism: 1,
  minEnergyToMove: 5,
  criticalHunger: 20,
  criticalEnergy: 15,
};

// =============================================================================
// Sugarscape Agent Implementation
// =============================================================================

export class SugarscapeAgent implements BaselineAgent {
  readonly type = 'sugarscape' as const;
  readonly name = 'Sugarscape Baseline';

  private config: SugarscapeConfig;

  constructor(agentConfig?: Partial<BaselineAgentConfig>) {
    this.config = {
      ...DEFAULT_SUGARSCAPE_CONFIG,
      vision: agentConfig?.sugarscapeVision ?? DEFAULT_SUGARSCAPE_CONFIG.vision,
      metabolism: agentConfig?.sugarscapeMetabolism ?? DEFAULT_SUGARSCAPE_CONFIG.metabolism,
    };
  }

  /**
   * Classic Sugarscape decision algorithm:
   * 1. If at resource, gather it
   * 2. Otherwise, look around and find richest resource cell
   * 3. Move toward it
   *
   * Extended with survival overrides for energy management.
   */
  decide(observation: AgentObservation): AgentDecision {
    const { self, inventory, nearbyResourceSpawns, nearbyShelters } = observation;

    // =======================================================================
    // Survival Override: Critical State Management
    // =======================================================================

    // If critically hungry and has food, consume
    if (self.hunger < this.config.criticalHunger) {
      const hasFood = inventory.some((i) => i.type === 'food' && i.quantity > 0);
      if (hasFood) {
        return {
          action: 'consume',
          params: { itemType: 'food' },
          reasoning: '[Sugarscape] Survival: Critical hunger, consuming food',
        };
      }
    }

    // If critically low energy, rest
    if (self.energy < this.config.criticalEnergy) {
      return {
        action: 'sleep',
        params: { duration: 2 },
        reasoning: `[Sugarscape] Survival: Critical energy (${self.energy}), resting`,
      };
    }

    // =======================================================================
    // Classic Sugarscape Rule 1: At Resource? Gather It
    // =======================================================================
    const spawnHere = nearbyResourceSpawns?.find(
      (s) => s.x === self.x && s.y === self.y && s.currentAmount > 0
    );

    if (spawnHere) {
      // Prioritize food if hungry, otherwise gather whatever is here
      const preferFood = self.hunger < 50;
      const foodHere = nearbyResourceSpawns?.find(
        (s) => s.x === self.x && s.y === self.y && s.resourceType === 'food' && s.currentAmount > 0
      );

      const targetSpawn = (preferFood && foodHere) ? foodHere : spawnHere;
      const gatherAmount = Math.min(3, targetSpawn.currentAmount);

      return {
        action: 'gather',
        params: {
          resourceType: targetSpawn.resourceType,
          quantity: gatherAmount,
        },
        reasoning: `[Sugarscape] At ${targetSpawn.resourceType} spawn (${targetSpawn.currentAmount}), gathering ${gatherAmount}`,
      };
    }

    // =======================================================================
    // Classic Sugarscape Rule 2: Find Richest Cell Within Vision
    // =======================================================================
    if (self.energy >= this.config.minEnergyToMove) {
      const bestSpawn = this.findBestSpawnInVision(
        nearbyResourceSpawns,
        self.x,
        self.y,
        self.hunger
      );

      if (bestSpawn) {
        // Move toward the richest resource spawn
        return this.moveToward(
          self.x,
          self.y,
          bestSpawn.x,
          bestSpawn.y,
          `[Sugarscape] Moving toward ${bestSpawn.resourceType} (${bestSpawn.currentAmount}) at (${bestSpawn.x},${bestSpawn.y})`
        );
      }

      // No visible resources - random exploration
      return this.randomMove(
        self.x,
        self.y,
        '[Sugarscape] No resources in vision, random exploration'
      );
    }

    // =======================================================================
    // Low Energy: Rest
    // =======================================================================
    return {
      action: 'sleep',
      params: { duration: 2 },
      reasoning: `[Sugarscape] Low energy (${self.energy}), resting before continuing search`,
    };
  }

  // ===========================================================================
  // Sugarscape-Specific Helper Methods
  // ===========================================================================

  /**
   * Find the best (richest) resource spawn within vision.
   *
   * Classic Sugarscape selection criteria:
   * 1. Most resources at the location
   * 2. Tie-breaker: closest distance
   * 3. Tie-breaker: random selection
   *
   * Modified for multi-resource world: prioritizes food when hungry.
   */
  private findBestSpawnInVision(
    spawns: NearbyResourceSpawn[] | undefined,
    x: number,
    y: number,
    hunger: number
  ): NearbyResourceSpawn | undefined {
    if (!spawns || spawns.length === 0) return undefined;

    // Filter to spawns within vision that have resources
    const inVision = spawns.filter((spawn) => {
      const distance = Math.abs(spawn.x - x) + Math.abs(spawn.y - y);
      return distance <= this.config.vision && spawn.currentAmount > 0;
    });

    if (inVision.length === 0) return undefined;

    // If hungry, prioritize food spawns
    const preferFood = hunger < 50;
    let candidates = inVision;

    if (preferFood) {
      const foodSpawns = inVision.filter((s) => s.resourceType === 'food');
      if (foodSpawns.length > 0) {
        candidates = foodSpawns;
      }
    }

    // Find the spawn with the most resources (classic Sugarscape)
    // Score = currentAmount - distance (prefer closer when amounts are similar)
    const scored = candidates.map((spawn) => {
      const distance = Math.abs(spawn.x - x) + Math.abs(spawn.y - y);
      // Score prioritizes amount, with distance as tie-breaker
      // Multiply amount by 10 to weight it more heavily than distance
      const score = spawn.currentAmount * 10 - distance;
      return { spawn, score, distance };
    });

    // Sort by score (highest first)
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Tie-breaker: random selection
      return random() - 0.5;
    });

    return scored[0]?.spawn;
  }

  /**
   * Create a move decision toward a target location.
   * Uses Manhattan distance movement (one step at a time).
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

    // Classic Sugarscape: move one step toward target
    // Prefer the axis with greater distance
    let newX = fromX;
    let newY = fromY;

    const distX = Math.abs(toX - fromX);
    const distY = Math.abs(toY - fromY);

    if (distX > distY) {
      // Move along X axis first
      newX = Math.max(0, Math.min(gridSize - 1, fromX + dx));
    } else if (distY > 0) {
      // Move along Y axis
      newY = Math.max(0, Math.min(gridSize - 1, fromY + dy));
    } else if (dx !== 0) {
      // Equal distance, prefer X
      newX = Math.max(0, Math.min(gridSize - 1, fromX + dx));
    }

    return {
      action: 'move',
      params: { toX: newX, toY: newY },
      reasoning,
    };
  }

  /**
   * Create a random move decision for exploration.
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
