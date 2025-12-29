/**
 * Gather Action Handler
 *
 * Collect resources from resource spawns (Sugarscape-style).
 * Agent must be at a location with a resource spawn.
 *
 * Cost: Energy
 * Reward: Resources added to inventory
 */

import { v4 as uuid } from 'uuid';
import type { ActionIntent, ActionResult } from '../types';
import type { Agent } from '../../db/schema';
import { getResourceSpawnsAtPosition, harvestResource } from '../../db/queries/world';
import { addToInventory } from '../../db/queries/inventory';

// Gather configuration
const CONFIG = {
  energyCostPerUnit: 1, // Energy cost per resource unit gathered
  maxGatherPerAction: 5, // Maximum units that can be gathered at once
} as const;

// Map resource types to inventory item types
const RESOURCE_TO_ITEM: Record<string, string> = {
  food: 'food',
  energy: 'battery', // Energy resource becomes battery item
  material: 'material',
};

export interface GatherParams {
  resourceType?: string; // Optional - if not specified, gather any available
  quantity?: number; // How much to try to gather (default: 1)
}

export async function handleGather(
  intent: ActionIntent<GatherParams>,
  agent: Agent
): Promise<ActionResult> {
  const { resourceType, quantity = 1 } = intent.params;

  // Validate quantity
  if (quantity < 1 || quantity > CONFIG.maxGatherPerAction) {
    return {
      success: false,
      error: `Invalid quantity: must be between 1 and ${CONFIG.maxGatherPerAction}`,
    };
  }

  // Calculate energy cost
  const energyCost = CONFIG.energyCostPerUnit * quantity;

  // Check if agent has enough energy
  if (agent.energy < energyCost) {
    return {
      success: false,
      error: `Not enough energy: need ${energyCost}, have ${agent.energy}`,
    };
  }

  // Get resource spawns at agent's position
  const spawns = await getResourceSpawnsAtPosition(agent.x, agent.y);

  if (spawns.length === 0) {
    return {
      success: false,
      error: `No resources at position (${agent.x}, ${agent.y})`,
    };
  }

  // Find matching spawn (if resourceType specified) or first available
  let targetSpawn = spawns[0];
  if (resourceType) {
    const matching = spawns.find((s) => s.resourceType === resourceType);
    if (!matching) {
      return {
        success: false,
        error: `No ${resourceType} resource at position (${agent.x}, ${agent.y})`,
      };
    }
    targetSpawn = matching;
  }

  // Check if spawn has resources available
  if (targetSpawn.currentAmount <= 0) {
    return {
      success: false,
      error: `Resource spawn is depleted (will regenerate over time)`,
    };
  }

  // Harvest the resource
  const actualGathered = await harvestResource(targetSpawn.id, quantity);

  if (actualGathered === 0) {
    return {
      success: false,
      error: 'Failed to gather resources',
    };
  }

  // Convert resource type to inventory item type
  const itemType = RESOURCE_TO_ITEM[targetSpawn.resourceType] || targetSpawn.resourceType;

  // Add to inventory
  await addToInventory(agent.id, itemType, actualGathered);

  // Calculate actual energy cost (based on what was actually gathered)
  const actualEnergyCost = CONFIG.energyCostPerUnit * actualGathered;
  const newEnergy = agent.energy - actualEnergyCost;

  return {
    success: true,
    changes: {
      energy: newEnergy,
    },
    events: [
      {
        id: uuid(),
        type: 'agent_gathered',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          position: { x: agent.x, y: agent.y },
          resourceType: targetSpawn.resourceType,
          itemType,
          amountRequested: quantity,
          amountGathered: actualGathered,
          spawnRemainingAmount: targetSpawn.currentAmount - actualGathered,
          energyCost: actualEnergyCost,
          newEnergy,
        },
      },
    ],
  };
}
