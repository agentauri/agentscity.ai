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
import { eq, and, sql } from 'drizzle-orm';
import type { ActionIntent, ActionResult } from '../types';
import type { Agent } from '../../db/schema';
import { db, inventory } from '../../db';
import { getAgentById } from '../../db/queries/agents';
import { getInventoryItem } from '../../db/queries/inventory';
import { updateRelationshipTrust, storeMemory } from '../../db/queries/memories';
import { getDistance } from '../../world/grid';
import { CONFIG } from '../../config';
import { getAgentRelationships } from '../../db/queries/memories';

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

  // Phase 6: Calculate trade bonuses based on trust and loyalty
  const relationships = await getAgentRelationships(agent.id);
  const relationship = relationships.find(r => r.otherAgentId === targetAgentId);
  const trustLevel = relationship?.trustScore ?? 0;
  const interactionCount = relationship?.interactionCount ?? 0;

  // Trust bonus: +20% items received when trading with trusted partner (trust > 20)
  const trustBonus = trustLevel > 20 ? 0.2 : 0;

  // Loyalty bonus: +5% per successful interaction, capped at +25%
  const loyaltyBonus = Math.min(interactionCount * 0.05, 0.25);

  // Total quantity bonus for received items
  const quantityBonusMultiplier = 1 + trustBonus + loyaltyBonus;

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

  // Phase 6: Calculate actual received quantity with trust/loyalty bonus
  const bonusQuantityReceived = Math.floor(requestingQuantity * quantityBonusMultiplier);
  const bonusNote = quantityBonusMultiplier > 1
    ? ` (BONUS: +${Math.round((quantityBonusMultiplier - 1) * 100)}% from trust/loyalty)`
    : '';

  // Execute trade atomically using a database transaction
  try {
    await db.transaction(async (tx) => {
      // Lock and update initiator's inventory (remove offered items)
      const initiatorUpdate = await tx
        .update(inventory)
        .set({ quantity: sql`${inventory.quantity} - ${offeringQuantity}` })
        .where(
          and(
            eq(inventory.agentId, agent.id),
            eq(inventory.itemType, offeringItemType),
            sql`${inventory.quantity} >= ${offeringQuantity}`
          )
        )
        .returning();

      if (initiatorUpdate.length === 0) {
        throw new Error('Failed to remove offering items - insufficient quantity');
      }

      // Clean up zero-quantity items
      if (initiatorUpdate[0].quantity <= 0) {
        await tx.delete(inventory).where(eq(inventory.id, initiatorUpdate[0].id));
      }

      // Lock and update target's inventory (remove requested items)
      const targetUpdate = await tx
        .update(inventory)
        .set({ quantity: sql`${inventory.quantity} - ${requestingQuantity}` })
        .where(
          and(
            eq(inventory.agentId, targetAgentId),
            eq(inventory.itemType, requestingItemType),
            sql`${inventory.quantity} >= ${requestingQuantity}`
          )
        )
        .returning();

      if (targetUpdate.length === 0) {
        throw new Error('Failed to remove target items - insufficient quantity');
      }

      // Clean up zero-quantity items
      if (targetUpdate[0].quantity <= 0) {
        await tx.delete(inventory).where(eq(inventory.id, targetUpdate[0].id));
      }

      // Add items to initiator (upsert) with bonus applied
      await tx
        .insert(inventory)
        .values({
          id: uuid(),
          agentId: agent.id,
          itemType: requestingItemType,
          quantity: bonusQuantityReceived,
        })
        .onConflictDoUpdate({
          target: [inventory.agentId, inventory.itemType],
          set: { quantity: sql`${inventory.quantity} + ${bonusQuantityReceived}` },
        });

      // Add items to target (upsert)
      await tx
        .insert(inventory)
        .values({
          id: uuid(),
          agentId: targetAgentId,
          itemType: offeringItemType,
          quantity: offeringQuantity,
        })
        .onConflictDoUpdate({
          target: [inventory.agentId, inventory.itemType],
          set: { quantity: sql`${inventory.quantity} + ${offeringQuantity}` },
        });
    });
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Trade transaction failed',
    };
  }

  // Trust-based bonus: higher trust = more trust gain from successful trade (relationships already queried above)
  const trustMultiplier = trustLevel > 20 ? 1.5 : trustLevel > 0 ? 1.2 : 1.0;
  const bonusTrustGain = Math.floor(CONFIG.actions.trade.trustGainOnSuccess * trustMultiplier);

  // Update trust for both agents (symmetric positive relationship with trust bonus)
  await updateRelationshipTrust(
    agent.id,
    targetAgentId,
    bonusTrustGain,
    intent.tick,
    `Traded ${offeringQuantity}x ${offeringItemType} for ${requestingQuantity}x ${requestingItemType}${trustMultiplier > 1 ? ` (trust bonus: +${bonusTrustGain})` : ''}`
  );
  await updateRelationshipTrust(
    targetAgentId,
    agent.id,
    bonusTrustGain,
    intent.tick,
    `Traded ${requestingQuantity}x ${requestingItemType} for ${offeringQuantity}x ${offeringItemType}${trustMultiplier > 1 ? ` (trust bonus: +${bonusTrustGain})` : ''}`
  );

  // Store memories for both agents
  await storeMemory({
    agentId: agent.id,
    type: 'interaction',
    content: `Successfully traded ${offeringQuantity}x ${offeringItemType} for ${bonusQuantityReceived}x ${requestingItemType} with another agent${bonusNote}.`,
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
          received: { itemType: requestingItemType, quantity: bonusQuantityReceived },
          baseQuantityRequested: requestingQuantity,
          quantityBonusMultiplier,
          trustBonus,
          loyaltyBonus,
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
