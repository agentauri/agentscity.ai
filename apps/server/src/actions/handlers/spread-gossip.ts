/**
 * Spread Gossip Action Handler - Phase 4: Gossip Protocol (§35)
 *
 * Enables agents to share subjective information about other agents,
 * creating decentralized reputation dynamics.
 *
 * Unlike share_info (which is factual), gossip is explicitly subjective
 * and can include opinions, warnings, and recommendations.
 *
 * System imposes:
 * - Proximity requirement
 * - Energy cost
 * - Event logging for analytics
 *
 * EMERGENT: Reputation networks, trust chains, misinformation dynamics.
 */

import { v4 as uuid } from 'uuid';
import type { ActionIntent, ActionResult, SpreadGossipParams } from '../types';
import type { Agent } from '../../db/schema';
import { getAgentById } from '../../db/queries/agents';
import { storeMemory, updateRelationshipTrust } from '../../db/queries/memories';
import { recordGossipEvent } from '../../db/queries/gossip';
import { getDistance } from '../../world/grid';
import { CONFIG } from '../../config';

const VALID_TOPICS = ['skill', 'behavior', 'transaction', 'warning', 'recommendation'];

export async function handleSpreadGossip(
  intent: ActionIntent<SpreadGossipParams>,
  agent: Agent
): Promise<ActionResult> {
  const { targetAgentId, subjectAgentId, topic, claim, sentiment, evidenceEventId } = intent.params;

  // Validate topic
  if (!VALID_TOPICS.includes(topic)) {
    return {
      success: false,
      error: `Invalid topic. Must be one of: ${VALID_TOPICS.join(', ')}`,
    };
  }

  // Validate sentiment
  if (sentiment < -100 || sentiment > 100) {
    return {
      success: false,
      error: 'Sentiment must be between -100 and 100',
    };
  }

  // Validate claim length
  if (claim.length < 5 || claim.length > 500) {
    return {
      success: false,
      error: 'Claim must be between 5 and 500 characters',
    };
  }

  // Cannot gossip with self
  if (targetAgentId === agent.id) {
    return {
      success: false,
      error: 'Cannot spread gossip to yourself',
    };
  }

  // Cannot gossip about self
  if (subjectAgentId === agent.id) {
    return {
      success: false,
      error: 'Cannot spread gossip about yourself',
    };
  }

  // Cannot gossip about the person you're talking to
  if (subjectAgentId === targetAgentId) {
    return {
      success: false,
      error: 'Cannot spread gossip about someone to themselves',
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

  if (targetAgent.state === 'dead') {
    return {
      success: false,
      error: 'Cannot communicate with dead agent',
    };
  }

  // Get subject agent (verify they exist)
  const subjectAgent = await getAgentById(subjectAgentId);
  if (!subjectAgent) {
    return {
      success: false,
      error: 'Subject agent not found',
    };
  }

  // Check proximity
  const distance = getDistance(
    { x: agent.x, y: agent.y },
    { x: targetAgent.x, y: targetAgent.y }
  );
  if (distance > CONFIG.actions.spreadGossip.maxDistance) {
    return {
      success: false,
      error: `Target too far for communication (distance: ${distance}, max: ${CONFIG.actions.spreadGossip.maxDistance})`,
    };
  }

  // Check energy
  const energyCost = CONFIG.actions.spreadGossip.energyCost;
  if (agent.energy < energyCost) {
    return {
      success: false,
      error: `Not enough energy (have: ${agent.energy}, need: ${energyCost})`,
    };
  }

  const newEnergy = Math.max(0, agent.energy - energyCost);

  // Record the gossip event for analytics
  await recordGossipEvent({
    tick: intent.tick,
    sourceAgentId: agent.id,
    targetAgentId,
    subjectAgentId,
    topic,
    claim,
    sentiment,
    evidenceEventId,
  });

  // Update trust based on gossip sentiment
  const isPositive = sentiment > 20;
  const isNegative = sentiment < -20;
  const isNeutral = !isPositive && !isNegative;

  if (isPositive) {
    // Sharing positive gossip slightly increases trust
    await updateRelationshipTrust(
      targetAgentId,
      agent.id,
      CONFIG.actions.spreadGossip.trustGainPositive,
      intent.tick,
      `Shared positive gossip about another agent`
    );
  } else if (isNegative) {
    // Sharing negative gossip may slightly decrease trust (seen as gossipy)
    await updateRelationshipTrust(
      targetAgentId,
      agent.id,
      CONFIG.actions.spreadGossip.trustPenaltyNegative,
      intent.tick,
      `Spread negative gossip about another agent`
    );
  }

  // Store gossip in target agent's memory
  const gossipMemory = isPositive
    ? `Heard positive gossip about another agent: "${truncate(claim, 80)}" (sentiment: ${sentiment})`
    : isNegative
    ? `Heard negative gossip about another agent: "${truncate(claim, 80)}" (sentiment: ${sentiment})`
    : `Heard neutral info about another agent: "${truncate(claim, 80)}"`;

  await storeMemory({
    agentId: targetAgentId,
    type: 'interaction',
    content: gossipMemory,
    importance: isNegative ? 7 : isPositive ? 5 : 4, // Negative gossip is more memorable
    emotionalValence: sentiment / 200, // Normalize to -0.5 to 0.5
    involvedAgentIds: [agent.id, subjectAgentId],
    x: targetAgent.x,
    y: targetAgent.y,
    tick: intent.tick,
  });

  // Store memory for gossiper
  await storeMemory({
    agentId: agent.id,
    type: 'action',
    content: `Spread ${isPositive ? 'positive' : isNegative ? 'negative' : 'neutral'} gossip about another agent`,
    importance: 3,
    emotionalValence: isNegative ? -0.1 : 0.1,
    involvedAgentIds: [targetAgentId, subjectAgentId],
    x: agent.x,
    y: agent.y,
    tick: intent.tick,
  });

  return {
    success: true,
    changes: { energy: newEnergy },
    events: [
      {
        id: uuid(),
        type: 'gossip_spread',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          sourceId: agent.id,
          targetId: targetAgentId,
          subjectId: subjectAgentId,
          topic,
          sentiment,
          hasEvidence: !!evidenceEventId,
          position: { x: agent.x, y: agent.y },
        },
      },
    ],
  };
}

/**
 * Truncate string for storage
 */
function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
}
