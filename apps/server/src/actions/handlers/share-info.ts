/**
 * Share Info Action Handler - Phase 2: Social Discovery
 *
 * Share information about a third party agent with another agent.
 * This enables word-of-mouth spread of reputation, location, and warnings.
 *
 * System imposes:
 * - Communication range
 * - Energy cost
 * - Knowledge transfer
 *
 * EMERGENT: Gossip networks, reputation spread, social proof.
 */

import { v4 as uuid } from 'uuid';
import type { ActionIntent, ActionResult, ShareInfoParams } from '../types';
import type { Agent } from '../../db/schema';
import { getAgentById } from '../../db/queries/agents';
import { storeMemory, updateRelationshipTrust } from '../../db/queries/memories';
import {
  recordReferral,
  knowsAbout,
  getKnowledge,
  type SharedInfo,
} from '../../db/queries/knowledge';
import { getDistance } from '../../world/grid';
import { CONFIG } from '../../config';

const VALID_INFO_TYPES = ['location', 'reputation', 'warning', 'recommendation'];

export async function handleShareInfo(
  intent: ActionIntent<ShareInfoParams>,
  agent: Agent
): Promise<ActionResult> {
  const { targetAgentId, subjectAgentId, infoType, claim, sentiment, position } = intent.params;

  // Validate info type
  if (!VALID_INFO_TYPES.includes(infoType)) {
    return { success: false, error: `Invalid info type. Must be one of: ${VALID_INFO_TYPES.join(', ')}` };
  }

  // Cannot share with self
  if (targetAgentId === agent.id) {
    return { success: false, error: 'Cannot share info with yourself' };
  }

  // Cannot share about self
  if (subjectAgentId === agent.id) {
    return { success: false, error: 'Cannot share info about yourself' };
  }

  // Cannot share about the person you're talking to
  if (subjectAgentId === targetAgentId) {
    return { success: false, error: 'Cannot share info about someone to themselves' };
  }

  // Validate sentiment range
  if (sentiment !== undefined && (sentiment < -100 || sentiment > 100)) {
    return { success: false, error: 'Sentiment must be between -100 and 100' };
  }

  // Get target agent
  const targetAgent = await getAgentById(targetAgentId);
  if (!targetAgent) {
    return { success: false, error: 'Target agent not found' };
  }

  if (targetAgent.state === 'dead') {
    return { success: false, error: 'Cannot communicate with dead agent' };
  }

  // Get subject agent (verify they exist)
  const subjectAgent = await getAgentById(subjectAgentId);
  if (!subjectAgent) {
    return { success: false, error: 'Subject agent not found' };
  }

  // Check communication range
  const distance = getDistance(
    { x: agent.x, y: agent.y },
    { x: targetAgent.x, y: targetAgent.y }
  );
  if (distance > CONFIG.actions.shareInfo.maxDistance) {
    return {
      success: false,
      error: `Target too far for communication (distance: ${distance}, max: ${CONFIG.actions.shareInfo.maxDistance})`,
    };
  }

  // Check energy
  const energyCost = CONFIG.actions.shareInfo.energyCost;
  if (agent.energy < energyCost) {
    return {
      success: false,
      error: `Not enough energy (have: ${agent.energy}, need: ${energyCost})`,
    };
  }

  // Check if sharer knows about the subject (must have knowledge to share)
  const sharerKnowledge = await getKnowledge(agent.id, subjectAgentId);
  if (!sharerKnowledge) {
    return { success: false, error: 'You do not know this agent and cannot share information about them' };
  }

  const newEnergy = Math.max(0, agent.energy - energyCost);

  // Build shared info
  const sharedInfo: SharedInfo = {
    lastSeenTick: intent.tick,
  };

  if (position) {
    sharedInfo.lastKnownPosition = position;
  } else if (sharerKnowledge.sharedInfo && (sharerKnowledge.sharedInfo as SharedInfo).lastKnownPosition) {
    // Pass along previously known position
    sharedInfo.lastKnownPosition = (sharerKnowledge.sharedInfo as SharedInfo).lastKnownPosition;
  }

  if (infoType === 'reputation' && sentiment !== undefined) {
    sharedInfo.reputationClaim = {
      sentiment,
      claim: claim ?? `Shared opinion (${sentiment > 0 ? 'positive' : sentiment < 0 ? 'negative' : 'neutral'})`,
    };
  }

  if (infoType === 'warning') {
    sharedInfo.dangerWarning = claim ?? 'Be careful around this agent';
  }

  if (infoType === 'recommendation' || infoType === 'location') {
    // For recommendations and location info, include trade info if relevant
    if (claim) {
      sharedInfo.tradeInfo = claim;
    }
  }

  // Record the referral - target now knows about subject through agent
  await recordReferral(targetAgentId, subjectAgentId, agent.id, sharedInfo, intent.tick);

  // Update trust based on sentiment of shared info
  const isPositiveInfo = sentiment !== undefined && sentiment > 0;
  const isNegativeInfo = sentiment !== undefined && sentiment < 0;

  if (isPositiveInfo) {
    // Sharing positive info slightly increases trust with target
    await updateRelationshipTrust(
      targetAgentId,
      agent.id,
      CONFIG.actions.shareInfo.trustGainPositive,
      intent.tick,
      `Shared positive info about another agent`
    );
  } else if (isNegativeInfo) {
    // Sharing negative info (gossip) may slightly decrease trust
    await updateRelationshipTrust(
      targetAgentId,
      agent.id,
      CONFIG.actions.shareInfo.trustPenaltyNegative,
      intent.tick,
      `Shared negative info about another agent`
    );
  }

  // Store sharer's memory
  await storeMemory({
    agentId: agent.id,
    type: 'action',
    content: `Shared ${infoType} about another agent with someone (${claim ? `"${truncateClaim(claim)}"` : 'no details'})`,
    importance: 4,
    emotionalValence: isPositiveInfo ? 0.2 : isNegativeInfo ? -0.1 : 0,
    involvedAgentIds: [targetAgentId, subjectAgentId],
    x: agent.x,
    y: agent.y,
    tick: intent.tick,
  });

  // Store target's memory - they received information about subject
  await storeMemory({
    agentId: targetAgentId,
    type: 'interaction',
    content: `Was told ${infoType} about another agent${claim ? `: "${truncateClaim(claim)}"` : ''}`,
    importance: 5,
    emotionalValence: isPositiveInfo ? 0.1 : isNegativeInfo ? -0.1 : 0,
    involvedAgentIds: [agent.id, subjectAgentId],
    x: targetAgent.x,
    y: targetAgent.y,
    tick: intent.tick,
  });

  return {
    success: true,
    changes: { energy: newEnergy },
    events: [
      {
        id: uuid(),
        type: 'agent_shared_info',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          sharerId: agent.id,
          targetId: targetAgentId,
          subjectId: subjectAgentId,
          infoType,
          sentiment: sentiment ?? 0,
          hasPosition: !!position || !!(sharedInfo.lastKnownPosition),
          position: { x: agent.x, y: agent.y },
        },
      },
    ],
  };
}

/**
 * Truncate claim for memory storage
 */
function truncateClaim(claim: string): string {
  const MAX_LEN = 80;
  return claim.length > MAX_LEN ? claim.slice(0, MAX_LEN) + '...' : claim;
}
