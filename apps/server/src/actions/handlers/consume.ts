/**
 * Consume Action Handler
 *
 * Consume items to restore needs.
 */

import { v4 as uuid } from 'uuid';
import type { ActionIntent, ActionResult, ConsumeParams } from '../types';
import type { Agent } from '../../db/schema';
import { ITEM_EFFECTS } from './buy';

export async function handleConsume(
  intent: ActionIntent<ConsumeParams>,
  agent: Agent
): Promise<ActionResult> {
  const { itemType } = intent.params;

  // Validate item type has effects
  const effects = ITEM_EFFECTS[itemType];
  if (!effects) {
    return {
      success: false,
      error: `Item ${itemType} cannot be consumed or has no effects`,
    };
  }

  // TODO: Check if agent has the item in inventory
  // For MVP, we assume agent has the item if they bought it

  // Calculate new needs values
  const changes: Partial<Agent> = {};

  if (effects.hunger !== undefined) {
    changes.hunger = Math.min(100, agent.hunger + effects.hunger);
  }
  if (effects.energy !== undefined) {
    changes.energy = Math.min(100, agent.energy + effects.energy);
  }
  if (effects.health !== undefined) {
    changes.health = Math.min(100, agent.health + effects.health);
  }

  // Success - return changes and events
  return {
    success: true,
    changes,
    events: [
      {
        id: uuid(),
        type: 'agent_consumed',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          itemType,
          effects,
          previousState: {
            hunger: agent.hunger,
            energy: agent.energy,
            health: agent.health,
          },
          newState: {
            hunger: changes.hunger ?? agent.hunger,
            energy: changes.energy ?? agent.energy,
            health: changes.health ?? agent.health,
          },
        },
      },
    ],
  };
}
