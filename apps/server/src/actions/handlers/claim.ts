/**
 * Claim Action Handler
 *
 * Allows agents to claim locations for various purposes:
 * - territory: General ownership claim
 * - home: Personal residence
 * - resource: Resource gathering spot
 * - danger: Mark dangerous area
 * - meeting_point: Social gathering spot
 *
 * Claims have strength that decays without reinforcement.
 * Multiple agents can claim the same location (contested territories).
 */

import { v4 as uuid } from 'uuid';
import type { ActionIntent, ActionResult, ClaimParams } from '../types';
import type { Agent } from '../../db/schema';
import { createOrReinforceClaim, getClaimsAtPosition, type ClaimType } from '../../db/queries/claims';
import { storeMemory } from '../../db/queries/memories';

export async function handleClaim(
  intent: ActionIntent<ClaimParams>,
  agent: Agent
): Promise<ActionResult> {
  const { claimType, description, x, y } = intent.params;

  // Use provided position or current position
  const claimX = x ?? agent.x;
  const claimY = y ?? agent.y;

  // Can only claim current position or adjacent cells
  const distance = Math.abs(claimX - agent.x) + Math.abs(claimY - agent.y);
  if (distance > 1) {
    return {
      success: false,
      error: `Cannot claim distant location (${claimX}, ${claimY}). Must be at or adjacent to the location.`,
    };
  }

  // Validate claim type
  const validClaimTypes: ClaimType[] = ['territory', 'home', 'resource', 'danger', 'meeting_point'];
  if (!validClaimTypes.includes(claimType as ClaimType)) {
    return {
      success: false,
      error: `Invalid claim type: ${claimType}. Valid types: ${validClaimTypes.join(', ')}`,
    };
  }

  // Check existing claims at this location
  const existingClaims = await getClaimsAtPosition(claimX, claimY);
  const ownClaim = existingClaims.find(
    (c) => c.agentId === agent.id && c.claimType === claimType
  );
  const isReinforcing = ownClaim !== undefined;

  // Create or reinforce the claim
  const claim = await createOrReinforceClaim({
    agentId: agent.id,
    x: claimX,
    y: claimY,
    claimType: claimType as ClaimType,
    description,
    tick: intent.tick,
  });

  // Check if contested
  const otherClaims = existingClaims.filter(
    (c) => c.agentId !== agent.id && c.claimType === claimType
  );
  const isContested = otherClaims.length > 0;

  // Store memory of the claim
  await storeMemory({
    agentId: agent.id,
    type: 'action',
    content: isReinforcing
      ? `Reinforced my ${claimType} claim at (${claimX}, ${claimY})${description ? `: ${description}` : ''}`
      : `Claimed (${claimX}, ${claimY}) as ${claimType}${description ? `: ${description}` : ''}`,
    importance: claimType === 'home' ? 8 : 5,
    emotionalValence: isContested ? -0.2 : 0.3,
    x: claimX,
    y: claimY,
    tick: intent.tick,
  });

  // Build event payload
  const eventPayload: Record<string, unknown> = {
    claimId: claim.id,
    claimType,
    position: { x: claimX, y: claimY },
    description,
    strength: claim.strength,
    isReinforcing,
    isContested,
  };

  if (isContested) {
    eventPayload.contestedBy = otherClaims.map((c) => ({
      agentId: c.agentId,
      strength: c.strength,
    }));
  }

  return {
    success: true,
    events: [
      {
        id: uuid(),
        type: isReinforcing ? 'claim_reinforced' : 'location_claimed',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: eventPayload,
      },
    ],
  };
}
