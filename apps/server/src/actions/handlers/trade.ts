/**
 * Trade Action Handler - Phase 1: Emergence Observation
 *
 * Direct agent-to-agent item exchange.
 * Trade is immediate (synchronous) - if both parties have the items, trade executes.
 *
 * This implementation represents a "direct barter" system.
 * More complex systems (proposals, negotiations) can emerge from agent behavior.
 *
 * Cost: None (just item exchange)
 * Effect: Items transferred between inventories, trust updated
 */

import { v4 as uuid } from 'uuid';
import type { ActionIntent, ActionResult } from '../types';
import type { Agent } from '../../db/schema';
import { getAgentById } from '../../db/queries/agents';
import { getInventoryItem, addToInventory, removeFromInventory } from '../../db/queries/inventory';
import { updateRelationshipTrust, storeMemory } from '../../db/queries/memories';
import { getDistance } from '../../world/grid';
import { CONFIG } from '../../config';

export interface TradeParams {
  targetAgentId: string;
  offeringItemType: string;
  offeringQuantity: number;
  requestingItemType: string;
  requestingQuantity: number;
}

export async function handleTrade(
  intent: ActionIntent<TradeParams>,
  agent: Agent
): Promise<ActionResult> {
  const {
    targetAgentId,
    offeringItemType,
    offeringQuantity,
    requestingItemType,
    requestingQuantity,
  } = intent.params;

  // Validate quantities
  if (offeringQuantity < 1 || requestingQuantity < 1) {
    return {
      success: false,
      error: 'Trade quantities must be at least 1',
    };
  }

  // Cannot trade with self
  if (targetAgentId === agent.id) {
    return {
      success: false,
      error: 'Cannot trade with yourself',
    };
  }

  // Get target agent
  const targetAgent = await getAgentById(targetAgentId);
  if (!targetAgent) {
    return {
      success: false,
      error: 'Target agent not found',
    };
  }

  // Check target agent is alive
  if (targetAgent.state === 'dead') {
    return {
      success: false,
      error: 'Cannot trade with a dead agent',
    };
  }

  // Check distance (agents must be nearby to trade)
  const distance = getDistance(
    { x: agent.x, y: agent.y },
    { x: targetAgent.x, y: targetAgent.y }
  );
  if (distance > CONFIG.actions.trade.maxDistance) {
    return {
      success: false,
      error: `Target agent is too far (distance: ${distance}, max: ${CONFIG.actions.trade.maxDistance})`,
    };
  }

  // Check initiator has the offering items
  const initiatorItem = await getInventoryItem(agent.id, offeringItemType);
  if (!initiatorItem || initiatorItem.quantity < offeringQuantity) {
    return {
      success: false,
      error: `Not enough ${offeringItemType} to offer (have: ${initiatorItem?.quantity ?? 0}, need: ${offeringQuantity})`,
    };
  }

  // Check target has the requested items
  const targetItem = await getInventoryItem(targetAgentId, requestingItemType);
  if (!targetItem || targetItem.quantity < requestingQuantity) {
    // Trade rejected - target doesn't have items
    // Store memory and update trust (slight negative for failed attempt)
    await storeMemory({
      agentId: agent.id,
      type: 'interaction',
      content: `Attempted to trade ${offeringQuantity}x ${offeringItemType} for ${requestingQuantity}x ${requestingItemType} with another agent, but they didn't have enough items.`,
      importance: 3,
      emotionalValence: -0.2,
      involvedAgentIds: [targetAgentId],
      x: agent.x,
      y: agent.y,
      tick: intent.tick,
    });

    return {
      success: false,
      error: `Target agent doesn't have enough ${requestingItemType} (have: ${targetItem?.quantity ?? 0}, need: ${requestingQuantity})`,
    };
  }

  // Execute trade atomically
  // Remove items from initiator
  const removeResult1 = await removeFromInventory(agent.id, offeringItemType, offeringQuantity);
  if (removeResult1 < 0) {
    return {
      success: false,
      error: 'Failed to remove offering items from inventory',
    };
  }

  // Remove items from target
  const removeResult2 = await removeFromInventory(targetAgentId, requestingItemType, requestingQuantity);
  if (removeResult2 < 0) {
    // Rollback - add items back to initiator
    await addToInventory(agent.id, offeringItemType, offeringQuantity);
    return {
      success: false,
      error: 'Failed to remove items from target inventory',
    };
  }

  // Add items to respective inventories
  await addToInventory(agent.id, requestingItemType, requestingQuantity);
  await addToInventory(targetAgentId, offeringItemType, offeringQuantity);

  // Update trust for both agents (symmetric positive relationship)
  await updateRelationshipTrust(
    agent.id,
    targetAgentId,
    CONFIG.actions.trade.trustGainOnSuccess,
    intent.tick,
    `Traded ${offeringQuantity}x ${offeringItemType} for ${requestingQuantity}x ${requestingItemType}`
  );
  await updateRelationshipTrust(
    targetAgentId,
    agent.id,
    CONFIG.actions.trade.trustGainOnSuccess,
    intent.tick,
    `Traded ${requestingQuantity}x ${requestingItemType} for ${offeringQuantity}x ${offeringItemType}`
  );

  // Store memories for both agents
  await storeMemory({
    agentId: agent.id,
    type: 'interaction',
    content: `Successfully traded ${offeringQuantity}x ${offeringItemType} for ${requestingQuantity}x ${requestingItemType} with another agent.`,
    importance: 6,
    emotionalValence: 0.5,
    involvedAgentIds: [targetAgentId],
    x: agent.x,
    y: agent.y,
    tick: intent.tick,
  });

  await storeMemory({
    agentId: targetAgentId,
    type: 'interaction',
    content: `Another agent traded ${requestingQuantity}x ${requestingItemType} for ${offeringQuantity}x ${offeringItemType} with me.`,
    importance: 5,
    emotionalValence: 0.4,
    involvedAgentIds: [agent.id],
    x: targetAgent.x,
    y: targetAgent.y,
    tick: intent.tick,
  });

  // Success
  return {
    success: true,
    events: [
      {
        id: uuid(),
        type: 'agent_traded',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          initiatorId: agent.id,
          targetId: targetAgentId,
          position: { x: agent.x, y: agent.y },
          offered: { itemType: offeringItemType, quantity: offeringQuantity },
          received: { itemType: requestingItemType, quantity: requestingQuantity },
        },
      },
      // Also emit event for the target (for UI tracking)
      {
        id: uuid(),
        type: 'agent_received_trade',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: targetAgentId,
        payload: {
          initiatorId: agent.id,
          targetId: targetAgentId,
          position: { x: targetAgent.x, y: targetAgent.y },
          offered: { itemType: requestingItemType, quantity: requestingQuantity },
          received: { itemType: offeringItemType, quantity: offeringQuantity },
        },
      },
    ],
  };
}
