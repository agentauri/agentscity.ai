/**
 * Deceive Action Handler - Phase 2: Conflict Actions
 *
 * Communicate false information to another agent.
 * This is UNIQUE because success is not immediate - it plants false information
 * that may or may not be discovered later by the target through experience.
 *
 * System imposes:
 * - Communication range
 * - Energy cost
 * - Memory creation with deception flag
 *
 * EMERGENT: Lie detection, credibility assessment, social verification.
 * The deceived agent stores the claim as a "received_claim" memory.
 * If they later discover the truth, trust is impacted retroactively.
 */

import { v4 as uuid } from 'uuid';
import type { ActionIntent, ActionResult, DeceiveParams } from '../types';
import type { Agent } from '../../db/schema';
import { getAgentById } from '../../db/queries/agents';
import { storeMemory, getRelationship } from '../../db/queries/memories';
import { getDistance } from '../../world/grid';
import { CONFIG } from '../../config';

const VALID_CLAIM_TYPES = ['resource_location', 'agent_reputation', 'danger_warning', 'trade_offer', 'other'];

export async function handleDeceive(
  intent: ActionIntent<DeceiveParams>,
  agent: Agent
): Promise<ActionResult> {
  const { targetAgentId, claim, claimType } = intent.params;

  // Validate claim length
  if (!claim || claim.length < 5 || claim.length > 500) {
    return { success: false, error: 'Claim must be 5-500 characters' };
  }

  // Validate claim type
  if (!VALID_CLAIM_TYPES.includes(claimType)) {
    return { success: false, error: `Invalid claim type. Must be one of: ${VALID_CLAIM_TYPES.join(', ')}` };
  }

  // Cannot deceive self
  if (targetAgentId === agent.id) {
    return { success: false, error: 'Cannot deceive yourself' };
  }

  // Get target agent
  const targetAgent = await getAgentById(targetAgentId);
  if (!targetAgent) {
    return { success: false, error: 'Target agent not found' };
  }

  if (targetAgent.state === 'dead') {
    return { success: false, error: 'Cannot communicate with dead agent' };
  }

  // Check communication range
  const distance = getDistance(
    { x: agent.x, y: agent.y },
    { x: targetAgent.x, y: targetAgent.y }
  );
  if (distance > CONFIG.actions.deceive.maxDistance) {
    return {
      success: false,
      error: `Target too far for communication (distance: ${distance}, max: ${CONFIG.actions.deceive.maxDistance})`,
    };
  }

  // Check energy
  const energyCost = CONFIG.actions.deceive.energyCost;
  if (agent.energy < energyCost) {
    return {
      success: false,
      error: `Not enough energy (have: ${agent.energy}, need: ${energyCost})`,
    };
  }

  const newEnergy = Math.max(0, agent.energy - energyCost);

  // Get current trust relationship (affects how claim is received)
  const relationship = await getRelationship(targetAgentId, agent.id);
  const trustScore = relationship?.trustScore ?? 0;

  // Calculate initial credibility based on trust
  // High trust = claim more likely to be believed
  // Low/negative trust = claim more likely to be doubted
  const credibility = Math.max(0.1, Math.min(0.9, 0.5 + trustScore / 200));

  // Store deceiver's memory (knows it's a lie)
  await storeMemory({
    agentId: agent.id,
    type: 'action',
    content: `Told a lie to another agent: "${truncateClaim(claim)}" (${claimType})`,
    importance: 5,
    emotionalValence: 0, // Neutral - no moral judgment
    involvedAgentIds: [targetAgentId],
    x: agent.x,
    y: agent.y,
    tick: intent.tick,
  });

  // Store target's memory - they receive the claim (may or may not believe it)
  // This is stored as a special "received_claim" that they can later verify
  await storeMemory({
    agentId: targetAgentId,
    type: 'interaction',
    content: `Another agent told me: "${truncateClaim(claim)}" (claim type: ${claimType})`,
    importance: 4 + Math.floor(credibility * 3), // Higher importance if more credible
    emotionalValence: 0.1, // Slightly positive - received information
    involvedAgentIds: [agent.id],
    x: targetAgent.x,
    y: targetAgent.y,
    tick: intent.tick,
  });

  // Deception always "succeeds" in the sense that the message is delivered
  // Whether the target believes it and whether they discover the truth is emergent
  return {
    success: true,
    changes: { energy: newEnergy },
    events: [
      {
        id: uuid(),
        type: 'agent_deceived',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          deceiverId: agent.id,
          targetId: targetAgentId,
          claimType,
          claimHash: hashClaim(claim), // Don't store full claim in events for privacy
          credibilityScore: credibility,
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
  const MAX_LEN = 100;
  return claim.length > MAX_LEN ? claim.slice(0, MAX_LEN) + '...' : claim;
}

/**
 * Simple hash for claim content (for analytics without exposing full content)
 */
function hashClaim(claim: string): string {
  let hash = 0;
  for (let i = 0; i < claim.length; i++) {
    const char = claim.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}
