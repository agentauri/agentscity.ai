/**
 * Buy Action Handler
 *
 * Purchase items from locations.
 * Cost: CITY currency
 */

import { v4 as uuid } from 'uuid';
import type { ActionIntent, ActionResult, BuyParams } from '../types';
import type { Agent } from '../../db/schema';

// Item prices (MVP: simple fixed prices)
const ITEM_PRICES: Record<string, number> = {
  food: 10,
  water: 5,
  medicine: 20,
  tool: 30,
};

// Item effects on needs
export const ITEM_EFFECTS: Record<string, { hunger?: number; energy?: number; health?: number }> = {
  food: { hunger: 30 },
  water: { energy: 10 },
  medicine: { health: 30 },
};

export async function handleBuy(
  intent: ActionIntent<BuyParams>,
  agent: Agent
): Promise<ActionResult> {
  const { itemType, quantity = 1 } = intent.params;

  // Validate item type
  const price = ITEM_PRICES[itemType];
  if (price === undefined) {
    return {
      success: false,
      error: `Unknown item type: ${itemType}`,
    };
  }

  // Calculate total cost
  const totalCost = price * quantity;

  // Check if agent has enough money
  if (agent.balance < totalCost) {
    return {
      success: false,
      error: `Not enough money: need ${totalCost} CITY, have ${agent.balance}`,
    };
  }

  // TODO: Check if item is available at agent's current location
  // For MVP, items are always available

  // Success - return changes and events
  return {
    success: true,
    changes: {
      balance: agent.balance - totalCost,
    },
    events: [
      {
        id: uuid(),
        type: 'agent_bought',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          itemType,
          quantity,
          unitPrice: price,
          totalCost,
          newBalance: agent.balance - totalCost,
        },
      },
      // Also emit balance_changed event
      {
        id: uuid(),
        type: 'balance_changed',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          previousBalance: agent.balance,
          newBalance: agent.balance - totalCost,
          change: -totalCost,
          reason: `Bought ${quantity}x ${itemType}`,
        },
      },
    ],
  };
}
