/**
 * Random Agent - Completely Random Action Selection
 *
 * This baseline agent picks a completely random valid action each tick.
 * Used to measure: "What happens with zero intelligence?"
 *
 * Scientific purpose:
 * - Null hypothesis for emergent behavior studies
 * - Any patterns that emerge are due purely to simulation mechanics
 * - If LLM agents show significantly different patterns, that's evidence
 *   of LLM reasoning contributing to emergence
 *
 * Behavior:
 * - Selects uniformly at random from all valid actions
 * - Parameters are also randomized within valid ranges
 * - No consideration of state, needs, or goals
 * - Only critical survival overrides (to prevent instant death)
 */

import type { AgentObservation, AgentDecision, NearbyAgent } from '../../llm/types';
import type { ActionType } from '../../actions/types';
import type { BaselineAgent } from './types';
import { random, randomChoice, randomInt } from '../../utils/random';
import { CONFIG } from '../../config';

// =============================================================================
// Valid Actions for Random Selection
// =============================================================================

/**
 * All possible action types a random agent can select.
 * Excludes actions that require specific targets or complex setup.
 */
const SOLO_ACTIONS: ActionType[] = [
  'move',
  'consume',
  'sleep',
  'work',
  'gather',
];

/**
 * Social actions that require nearby agents.
 */
const SOCIAL_ACTIONS: ActionType[] = [
  'trade',
  'harm',
  'steal',
  'share_info',
];

// =============================================================================
// Random Agent Implementation
// =============================================================================

export class RandomAgent implements BaselineAgent {
  readonly type = 'random' as const;
  readonly name = 'Random Baseline';

  /**
   * Generate a completely random valid action.
   *
   * The random agent selects actions uniformly at random from the set of
   * valid actions, with parameters also randomized. Only critical survival
   * situations (imminent death) trigger override behavior.
   */
  decide(observation: AgentObservation): AgentDecision {
    const { self } = observation;

    // CRITICAL SURVIVAL OVERRIDE (prevent instant death)
    // Only trigger when absolutely critical (health < 10)
    if (self.health < 10) {
      const survivalDecision = this.getCriticalSurvivalDecision(observation);
      if (survivalDecision) {
        return survivalDecision;
      }
    }

    // Get all valid actions for current state
    const validActions = this.getValidActions(observation);

    // Select random action
    const selectedAction = randomChoice(validActions);
    if (!selectedAction) {
      // Fallback to sleep if no valid actions (should not happen)
      return {
        action: 'sleep',
        params: { duration: 1 },
        reasoning: '[Random Agent] No valid actions, sleeping',
      };
    }

    // Build decision with random valid parameters
    return this.buildDecision(selectedAction, observation);
  }

  /**
   * Get critical survival decision when near death.
   * Only used to prevent instant death from starvation or exhaustion.
   */
  private getCriticalSurvivalDecision(observation: AgentObservation): AgentDecision | null {
    const { self, inventory } = observation;

    // If critically hungry and has food, eat
    if (self.hunger < 10 && inventory.some((i) => i.type === 'food' && i.quantity > 0)) {
      return {
        action: 'consume',
        params: { itemType: 'food' },
        reasoning: '[Random Agent] Critical survival: consuming food',
      };
    }

    // If critically exhausted, rest
    if (self.energy < 10) {
      return {
        action: 'sleep',
        params: { duration: 1 },
        reasoning: '[Random Agent] Critical survival: resting',
      };
    }

    return null;
  }

  /**
   * Get list of valid actions based on current observation.
   */
  private getValidActions(observation: AgentObservation): ActionType[] {
    const validActions: ActionType[] = [];
    const { self, inventory, nearbyAgents, nearbyResourceSpawns, nearbyShelters } = observation;

    // Move is always valid
    validActions.push('move');

    // Consume is valid if we have consumable items
    const hasConsumable = inventory.some(
      (i) => ['food', 'water', 'medicine', 'battery'].includes(i.type) && i.quantity > 0
    );
    if (hasConsumable) {
      validActions.push('consume');
    }

    // Sleep is always valid (but more effective at shelters)
    validActions.push('sleep');

    // Work is valid if we have enough energy
    if (self.energy >= CONFIG.actions.work.energyCostPerTick) {
      validActions.push('work');
    }

    // Gather is valid if at a resource spawn with resources
    if (nearbyResourceSpawns) {
      const atSpawnWithResources = nearbyResourceSpawns.some(
        (s) => s.x === self.x && s.y === self.y && s.currentAmount > 0
      );
      if (atSpawnWithResources) {
        validActions.push('gather');
      }
    }

    // Social actions require nearby agents within distance 1-3
    const nearbyForSocial = nearbyAgents.filter((agent) => {
      const distance = Math.abs(agent.x - self.x) + Math.abs(agent.y - self.y);
      return distance >= 1 && distance <= 3;
    });

    if (nearbyForSocial.length > 0) {
      // Trade requires having items to trade
      if (inventory.some((i) => i.quantity > 0)) {
        validActions.push('trade');
      }

      // Harm is always valid with nearby agent
      validActions.push('harm');

      // Share info is always valid with nearby agent
      validActions.push('share_info');

      // Steal requires target within distance 1
      const adjacentAgents = nearbyAgents.filter((agent) => {
        const distance = Math.abs(agent.x - self.x) + Math.abs(agent.y - self.y);
        return distance === 1;
      });
      if (adjacentAgents.length > 0) {
        validActions.push('steal');
      }
    }

    return validActions;
  }

  /**
   * Build a decision with random valid parameters for the given action.
   */
  private buildDecision(action: ActionType, observation: AgentObservation): AgentDecision {
    const { self, inventory, nearbyAgents, nearbyResourceSpawns } = observation;

    switch (action) {
      case 'move': {
        // Random movement in cardinal direction
        const directions = [
          { dx: 0, dy: -1, name: 'north' },
          { dx: 0, dy: 1, name: 'south' },
          { dx: 1, dy: 0, name: 'east' },
          { dx: -1, dy: 0, name: 'west' },
        ];
        const dir = randomChoice(directions) ?? directions[0];
        const gridSize = CONFIG.simulation.gridSize;
        const newX = Math.max(0, Math.min(gridSize - 1, self.x + dir.dx));
        const newY = Math.max(0, Math.min(gridSize - 1, self.y + dir.dy));
        return {
          action: 'move',
          params: { toX: newX, toY: newY },
          reasoning: `[Random Agent] Random move ${dir.name}`,
        };
      }

      case 'consume': {
        // Pick random consumable item
        const consumables = inventory.filter(
          (i) => ['food', 'water', 'medicine', 'battery'].includes(i.type) && i.quantity > 0
        );
        const item = randomChoice(consumables);
        return {
          action: 'consume',
          params: { itemType: item?.type ?? 'food' },
          reasoning: `[Random Agent] Random consume ${item?.type}`,
        };
      }

      case 'sleep': {
        // Random sleep duration 1-5 ticks
        const duration = randomInt(1, 6);
        return {
          action: 'sleep',
          params: { duration },
          reasoning: `[Random Agent] Random sleep for ${duration} ticks`,
        };
      }

      case 'work': {
        // Random work duration 1-3 ticks
        const duration = randomInt(1, 4);
        return {
          action: 'work',
          params: { duration },
          reasoning: `[Random Agent] Random work for ${duration} ticks`,
        };
      }

      case 'gather': {
        // Gather from current location's spawn
        const spawnsHere = nearbyResourceSpawns?.filter(
          (s) => s.x === self.x && s.y === self.y && s.currentAmount > 0
        );
        const spawn = randomChoice(spawnsHere ?? []);
        const quantity = randomInt(1, Math.min(4, (spawn?.currentAmount ?? 1) + 1));
        return {
          action: 'gather',
          params: {
            resourceType: spawn?.resourceType ?? 'food',
            quantity,
          },
          reasoning: `[Random Agent] Random gather ${spawn?.resourceType}`,
        };
      }

      case 'trade': {
        // Pick random nearby agent and random items
        const targetAgent = this.getRandomNearbyAgent(observation, 3);
        const offerItem = randomChoice(inventory.filter((i) => i.quantity > 0));
        const requestTypes = ['food', 'energy', 'material', 'money'];
        const requestType = randomChoice(requestTypes) ?? 'food';
        return {
          action: 'trade',
          params: {
            targetAgentId: targetAgent?.id ?? '',
            offeringItemType: offerItem?.type ?? 'food',
            offeringQuantity: Math.min(offerItem?.quantity ?? 1, randomInt(1, 3)),
            requestingItemType: requestType,
            requestingQuantity: randomInt(1, 3),
          },
          reasoning: `[Random Agent] Random trade offer`,
        };
      }

      case 'harm': {
        const targetAgent = this.getRandomNearbyAgent(observation, 1);
        const intensities = ['light', 'moderate', 'severe'] as const;
        const intensity = randomChoice([...intensities]) ?? 'light';
        return {
          action: 'harm',
          params: {
            targetAgentId: targetAgent?.id ?? '',
            intensity,
          },
          reasoning: `[Random Agent] Random harm (${intensity})`,
        };
      }

      case 'steal': {
        const targetAgent = this.getRandomNearbyAgent(observation, 1);
        const itemTypes = ['food', 'energy', 'material', 'money'];
        const targetItem = randomChoice(itemTypes) ?? 'food';
        return {
          action: 'steal',
          params: {
            targetAgentId: targetAgent?.id ?? '',
            targetItemType: targetItem,
            quantity: randomInt(1, 3),
          },
          reasoning: `[Random Agent] Random steal attempt`,
        };
      }

      case 'share_info': {
        const targetAgent = this.getRandomNearbyAgent(observation, 3);
        const subjectAgent = randomChoice(nearbyAgents) ?? targetAgent;
        const infoTypes = ['location', 'reputation', 'warning', 'recommendation'] as const;
        const infoType = randomChoice([...infoTypes]) ?? 'location';
        return {
          action: 'share_info',
          params: {
            targetAgentId: targetAgent?.id ?? '',
            subjectAgentId: subjectAgent?.id ?? targetAgent?.id ?? '',
            infoType,
            sentiment: randomInt(-100, 101),
          },
          reasoning: `[Random Agent] Random share info`,
        };
      }

      default:
        // Fallback to move
        return {
          action: 'move',
          params: { toX: self.x, toY: self.y },
          reasoning: '[Random Agent] Unknown action, staying put',
        };
    }
  }

  /**
   * Get a random nearby agent within the given distance.
   */
  private getRandomNearbyAgent(observation: AgentObservation, maxDistance: number): NearbyAgent | undefined {
    const { self, nearbyAgents } = observation;
    const nearby = nearbyAgents.filter((agent) => {
      const distance = Math.abs(agent.x - self.x) + Math.abs(agent.y - self.y);
      return distance >= 1 && distance <= maxDistance;
    });
    return randomChoice(nearby);
  }
}
