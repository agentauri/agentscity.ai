/**
 * Random Walk Decision Generator
 *
 * Provides purely random movement decisions for scientific baseline experiments.
 * Used as a "null hypothesis" to compare against LLM-based decision making.
 *
 * The random walk agent:
 * - Moves in random cardinal directions (N/S/E/W)
 * - Occasionally performs survival actions when critically low on needs
 * - Does not use any strategic reasoning
 */

import type { AgentObservation, AgentDecision } from './types';
import { CONFIG } from '../config';

/**
 * Cardinal directions for random movement
 */
const DIRECTIONS = [
  { dx: 0, dy: -1, name: 'north' },
  { dx: 0, dy: 1, name: 'south' },
  { dx: 1, dy: 0, name: 'east' },
  { dx: -1, dy: 0, name: 'west' },
];

/**
 * Generate a purely random walk decision
 *
 * The random walk mode prioritizes movement but includes basic survival
 * actions when the agent is in critical condition to prevent immediate death.
 */
export function getRandomWalkDecision(observation: AgentObservation): AgentDecision {
  const { self } = observation;

  // Critical survival override (prevent immediate death)
  // Only trigger when absolutely critical (health < 10 or needs near zero)
  if (self.health < 10) {
    // Try to survive
    if (self.hunger < 10 && observation.inventory.some((i) => i.type === 'food')) {
      return {
        action: 'consume',
        params: { itemType: 'food' },
        reasoning: '[Random Walk] Critical survival: consuming food',
      };
    }
    if (self.energy < 10) {
      return {
        action: 'sleep',
        params: { duration: 1 },
        reasoning: '[Random Walk] Critical survival: resting',
      };
    }
  }

  // Default behavior: random movement
  const direction = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
  const gridSize = CONFIG.simulation.gridSize;

  // Calculate new position with boundary clamping
  const newX = Math.max(0, Math.min(gridSize - 1, self.x + direction.dx));
  const newY = Math.max(0, Math.min(gridSize - 1, self.y + direction.dy));

  return {
    action: 'move',
    params: { toX: newX, toY: newY },
    reasoning: `[Random Walk] Moving ${direction.name} randomly`,
  };
}

/**
 * Variant of random walk that includes random resource gathering
 * More exploratory than pure random walk
 */
export function getRandomExplorerDecision(observation: AgentObservation): AgentDecision {
  const { self, nearbyResourceSpawns } = observation;

  // Critical survival (same as random walk)
  if (self.health < 10 || self.energy < 5) {
    return getRandomWalkDecision(observation);
  }

  // 30% chance to gather if at a resource spawn
  if (nearbyResourceSpawns && nearbyResourceSpawns.length > 0) {
    const atSpawn = nearbyResourceSpawns.find(
      (s) => s.x === self.x && s.y === self.y && s.currentAmount > 0
    );

    if (atSpawn && Math.random() < 0.3) {
      return {
        action: 'gather',
        params: { resourceType: atSpawn.resourceType, quantity: 1 },
        reasoning: `[Random Explorer] Randomly gathering ${atSpawn.resourceType}`,
      };
    }
  }

  // Default to random walk
  return getRandomWalkDecision(observation);
}
