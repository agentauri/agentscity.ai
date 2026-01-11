/**
 * Response Parser - Parse LLM responses into structured decisions
 */

import type { AgentDecision } from './types';
import type { ActionType } from '../actions/types';
import { randomChoice } from '../utils/random';

const VALID_ACTIONS: ActionType[] = [
  // Core survival actions
  'move', 'buy', 'consume', 'sleep', 'work', 'gather', 'trade',
  // Survival fallbacks (always available)
  'forage', 'public_work',
  // Long-range communication
  'signal',
  // Phase 1: Emergence Observation
  'claim', 'name_location',
  // Phase 2: Conflict Actions
  'harm', 'steal', 'deceive',
  // Phase 2: Social Discovery
  'share_info',
  // Phase 4: Verifiable Credentials
  'issue_credential', 'revoke_credential',
  // Phase 4: Gossip Protocol
  'spread_gossip',
  // Phase 4: Reproduction
  'spawn_offspring',
  // Employment System
  'offer_job', 'accept_job', 'pay_worker', 'claim_escrow', 'quit_job', 'fire_worker', 'cancel_job_offer',
];

/**
 * Parse LLM response into AgentDecision
 */
export function parseResponse(response: string): AgentDecision | null {
  try {
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('No JSON found in response:', response.slice(0, 200));
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate action
    if (!parsed.action || !VALID_ACTIONS.includes(parsed.action)) {
      console.warn('Invalid action:', parsed.action);
      return null;
    }

    // Validate params
    if (!parsed.params || typeof parsed.params !== 'object') {
      console.warn('Invalid params:', parsed.params);
      return null;
    }

    // Validate specific action params
    const validationResult = validateActionParams(parsed.action, parsed.params);
    if (!validationResult.valid) {
      console.warn('Invalid action params:', validationResult.error);
      return null;
    }

    return {
      action: parsed.action as ActionType,
      params: parsed.params,
      reasoning: parsed.reasoning || undefined,
    };
  } catch (error) {
    console.error('Failed to parse LLM response:', error);
    return null;
  }
}

/**
 * Validate action-specific parameters
 */
function validateActionParams(
  action: ActionType,
  params: Record<string, unknown>
): { valid: boolean; error?: string } {
  switch (action) {
    case 'move':
      if (typeof params.toX !== 'number' || typeof params.toY !== 'number') {
        return { valid: false, error: 'move requires toX and toY numbers' };
      }
      break;

    case 'buy':
      if (typeof params.itemType !== 'string') {
        return { valid: false, error: 'buy requires itemType string' };
      }
      if (params.quantity !== undefined && typeof params.quantity !== 'number') {
        return { valid: false, error: 'buy quantity must be a number' };
      }
      break;

    case 'consume':
      if (typeof params.itemType !== 'string') {
        return { valid: false, error: 'consume requires itemType string' };
      }
      break;

    case 'sleep':
      if (typeof params.duration !== 'number') {
        return { valid: false, error: 'sleep requires duration number' };
      }
      if (params.duration < 1 || params.duration > 10) {
        return { valid: false, error: 'sleep duration must be 1-10' };
      }
      break;

    case 'work':
      // locationId is optional in scientific model
      if (params.duration !== undefined) {
        if (typeof params.duration !== 'number' || params.duration < 1 || params.duration > 5) {
          return { valid: false, error: 'work duration must be 1-5' };
        }
      }
      break;

    case 'gather':
      // resourceType is optional (gather any available)
      if (params.resourceType !== undefined && typeof params.resourceType !== 'string') {
        return { valid: false, error: 'gather resourceType must be a string' };
      }
      if (params.quantity !== undefined) {
        if (typeof params.quantity !== 'number' || params.quantity < 1 || params.quantity > 5) {
          return { valid: false, error: 'gather quantity must be 1-5' };
        }
      }
      break;

    case 'forage':
      // No params required - forage at current location
      break;

    case 'public_work':
      // taskType is optional
      if (params.taskType !== undefined) {
        if (!['road_maintenance', 'resource_survey', 'shelter_cleanup'].includes(params.taskType as string)) {
          return { valid: false, error: 'public_work taskType must be road_maintenance, resource_survey, or shelter_cleanup' };
        }
      }
      break;

    case 'signal':
      if (typeof params.message !== 'string' || params.message.length < 1 || params.message.length > 200) {
        return { valid: false, error: 'signal message must be 1-200 characters' };
      }
      if (typeof params.intensity !== 'number' || params.intensity < 1 || params.intensity > 5) {
        return { valid: false, error: 'signal intensity must be 1-5' };
      }
      break;

    case 'trade':
      if (typeof params.targetAgentId !== 'string') {
        return { valid: false, error: 'trade requires targetAgentId string' };
      }
      if (typeof params.offeringItemType !== 'string') {
        return { valid: false, error: 'trade requires offeringItemType string' };
      }
      if (typeof params.offeringQuantity !== 'number' || params.offeringQuantity < 1) {
        return { valid: false, error: 'trade offeringQuantity must be at least 1' };
      }
      if (typeof params.requestingItemType !== 'string') {
        return { valid: false, error: 'trade requires requestingItemType string' };
      }
      if (typeof params.requestingQuantity !== 'number' || params.requestingQuantity < 1) {
        return { valid: false, error: 'trade requestingQuantity must be at least 1' };
      }
      break;

    // Phase 2: Conflict Actions
    case 'harm':
      if (typeof params.targetAgentId !== 'string') {
        return { valid: false, error: 'harm requires targetAgentId string' };
      }
      if (!['light', 'moderate', 'severe'].includes(params.intensity as string)) {
        return { valid: false, error: 'harm intensity must be light, moderate, or severe' };
      }
      break;

    case 'steal':
      if (typeof params.targetAgentId !== 'string') {
        return { valid: false, error: 'steal requires targetAgentId string' };
      }
      if (typeof params.targetItemType !== 'string') {
        return { valid: false, error: 'steal requires targetItemType string' };
      }
      if (typeof params.quantity !== 'number' || params.quantity < 1) {
        return { valid: false, error: 'steal quantity must be at least 1' };
      }
      break;

    case 'deceive':
      if (typeof params.targetAgentId !== 'string') {
        return { valid: false, error: 'deceive requires targetAgentId string' };
      }
      if (typeof params.claim !== 'string' || params.claim.length < 5 || params.claim.length > 500) {
        return { valid: false, error: 'deceive claim must be 5-500 characters' };
      }
      if (!['resource_location', 'agent_reputation', 'danger_warning', 'trade_offer', 'other'].includes(params.claimType as string)) {
        return { valid: false, error: 'deceive claimType must be resource_location, agent_reputation, danger_warning, trade_offer, or other' };
      }
      break;

    // Phase 2: Social Discovery
    case 'share_info':
      if (typeof params.targetAgentId !== 'string') {
        return { valid: false, error: 'share_info requires targetAgentId string' };
      }
      if (typeof params.subjectAgentId !== 'string') {
        return { valid: false, error: 'share_info requires subjectAgentId string' };
      }
      if (!['location', 'reputation', 'warning', 'recommendation'].includes(params.infoType as string)) {
        return { valid: false, error: 'share_info infoType must be location, reputation, warning, or recommendation' };
      }
      if (params.sentiment !== undefined) {
        if (typeof params.sentiment !== 'number' || params.sentiment < -100 || params.sentiment > 100) {
          return { valid: false, error: 'share_info sentiment must be between -100 and 100' };
        }
      }
      break;

    // Phase 1: Emergence Observation
    case 'claim':
      if (!['territory', 'home', 'resource', 'danger', 'meeting_point'].includes(params.claimType as string)) {
        return { valid: false, error: 'claim claimType must be territory, home, resource, danger, or meeting_point' };
      }
      break;

    case 'name_location':
      if (typeof params.name !== 'string' || params.name.length < 1 || params.name.length > 50) {
        return { valid: false, error: 'name_location name must be 1-50 characters' };
      }
      break;

    // Phase 4: Verifiable Credentials
    case 'issue_credential':
      if (typeof params.subjectAgentId !== 'string') {
        return { valid: false, error: 'issue_credential requires subjectAgentId string' };
      }
      if (!['skill', 'experience', 'membership', 'character', 'custom'].includes(params.claimType as string)) {
        return { valid: false, error: 'issue_credential claimType must be skill, experience, membership, character, or custom' };
      }
      if (typeof params.description !== 'string' || params.description.length < 1) {
        return { valid: false, error: 'issue_credential requires description string' };
      }
      break;

    case 'revoke_credential':
      if (typeof params.credentialId !== 'string') {
        return { valid: false, error: 'revoke_credential requires credentialId string' };
      }
      break;

    // Phase 4: Gossip Protocol
    case 'spread_gossip':
      if (typeof params.targetAgentId !== 'string') {
        return { valid: false, error: 'spread_gossip requires targetAgentId string' };
      }
      if (typeof params.subjectAgentId !== 'string') {
        return { valid: false, error: 'spread_gossip requires subjectAgentId string' };
      }
      if (!['skill', 'behavior', 'transaction', 'warning', 'recommendation'].includes(params.topic as string)) {
        return { valid: false, error: 'spread_gossip topic must be skill, behavior, transaction, warning, or recommendation' };
      }
      if (typeof params.claim !== 'string') {
        return { valid: false, error: 'spread_gossip requires claim string' };
      }
      if (typeof params.sentiment !== 'number' || params.sentiment < -100 || params.sentiment > 100) {
        return { valid: false, error: 'spread_gossip sentiment must be between -100 and 100' };
      }
      break;

    // Phase 4: Reproduction
    case 'spawn_offspring':
      // Most params are optional
      if (params.partnerId !== undefined && typeof params.partnerId !== 'string') {
        return { valid: false, error: 'spawn_offspring partnerId must be a string' };
      }
      if (params.mutationIntensity !== undefined) {
        if (typeof params.mutationIntensity !== 'number' || params.mutationIntensity < 0 || params.mutationIntensity > 1) {
          return { valid: false, error: 'spawn_offspring mutationIntensity must be 0-1' };
        }
      }
      break;

    // Employment System
    case 'offer_job':
      if (typeof params.salary !== 'number' || params.salary < 1) {
        return { valid: false, error: 'offer_job salary must be at least 1' };
      }
      if (typeof params.duration !== 'number' || params.duration < 1) {
        return { valid: false, error: 'offer_job duration must be at least 1' };
      }
      if (!['upfront', 'on_completion', 'per_tick'].includes(params.paymentType as string)) {
        return { valid: false, error: 'offer_job paymentType must be upfront, on_completion, or per_tick' };
      }
      break;

    case 'accept_job':
      if (typeof params.jobOfferId !== 'string') {
        return { valid: false, error: 'accept_job requires jobOfferId string' };
      }
      break;

    case 'pay_worker':
      if (typeof params.employmentId !== 'string') {
        return { valid: false, error: 'pay_worker requires employmentId string' };
      }
      break;

    case 'claim_escrow':
      if (typeof params.employmentId !== 'string') {
        return { valid: false, error: 'claim_escrow requires employmentId string' };
      }
      break;

    case 'quit_job':
      if (typeof params.employmentId !== 'string') {
        return { valid: false, error: 'quit_job requires employmentId string' };
      }
      break;

    case 'fire_worker':
      if (typeof params.employmentId !== 'string') {
        return { valid: false, error: 'fire_worker requires employmentId string' };
      }
      break;

    case 'cancel_job_offer':
      if (typeof params.jobOfferId !== 'string') {
        return { valid: false, error: 'cancel_job_offer requires jobOfferId string' };
      }
      break;
  }

  return { valid: true };
}

/**
 * Generate fallback decision when LLM fails
 * Prioritizes survival: eat if hungry, rest if tired, work if poor
 *
 * Scientific model: no location restrictions
 * - Buy/work function anywhere
 * - Movement is random exploration
 */
export function getFallbackDecision(
  hunger: number,
  energy: number,
  balance: number,
  agentX?: number,
  agentY?: number,
  inventory?: Array<{ type: string; quantity: number }>,
  nearbyResourceSpawns?: Array<{ x: number; y: number; resourceType: string; currentAmount: number }>,
  nearbyShelters?: Array<{ x: number; y: number }>,
  // Social context (Phase 1.2: Enable social fallbacks)
  nearbyJobOffers?: Array<{ id: string; salary: number; employerId: string }>,
  activeEmployments?: Array<{ id: string; role: 'worker' | 'employer'; ticksWorked: number; ticksRequired: number }>,
  nearbyAgents?: Array<{ id: string }>
): AgentDecision {
  const hasFood = inventory?.some((i) => i.type === 'food' && i.quantity > 0) ?? false;
  const foodQuantity = inventory?.find((i) => i.type === 'food')?.quantity ?? 0;
  const currentX = agentX ?? 50;
  const currentY = agentY ?? 50;
  const atShelter = nearbyShelters?.some((s) => s.x === currentX && s.y === currentY) ?? false;

  // Social context helpers
  const hasActiveWorkerJob = activeEmployments?.some((e) => e.role === 'worker' && e.ticksWorked < e.ticksRequired) ?? false;
  const activeWorkerJob = activeEmployments?.find((e) => e.role === 'worker' && e.ticksWorked < e.ticksRequired);
  const hasNearbyAgents = (nearbyAgents?.length ?? 0) > 0;

  // Priority 1: Consume food if hungry AND have food
  if (hunger < 50 && hasFood) {
    return {
      action: 'consume',
      params: { itemType: 'food' },
      reasoning: 'Fallback: hungry, consuming food from inventory',
    };
  }

  // Priority 2: If critically hungry, at shelter, and have money, buy food
  if (hunger < 30 && balance >= 10 && atShelter) {
    return {
      action: 'buy',
      params: { itemType: 'food', quantity: 1 },
      reasoning: 'Fallback: critically hungry, buying food at shelter',
    };
  }

  // Priority 3: If hungry and at a food spawn, gather food
  if (hunger < 50 && nearbyResourceSpawns) {
    const foodSpawnHere = nearbyResourceSpawns.find(
      (s) => s.x === currentX && s.y === currentY && s.resourceType === 'food' && s.currentAmount > 0
    );
    if (foodSpawnHere) {
      return {
        action: 'gather',
        params: { resourceType: 'food', quantity: 1 },
        reasoning: 'Fallback: hungry, gathering food at current location',
      };
    }
  }

  // Priority 4: If hungry and no food spawns nearby, FORAGE (always works anywhere!)
  if (hunger < 40 && !hasFood) {
    // Check if there's a food spawn here first
    const foodSpawnHere = nearbyResourceSpawns?.find(
      (s) => s.x === currentX && s.y === currentY && s.resourceType === 'food' && s.currentAmount > 0
    );
    if (!foodSpawnHere) {
      // No food spawn here - try foraging (60% success, but always available!)
      return {
        action: 'forage',
        params: {},
        reasoning: 'Fallback: hungry with no food spawn nearby, foraging',
      };
    }
  }

  // Priority 5: If hungry, move towards nearest food spawn
  if (hunger < 40 && nearbyResourceSpawns) {
    const foodSpawns = nearbyResourceSpawns.filter((s) => s.resourceType === 'food' && s.currentAmount > 0);
    if (foodSpawns.length > 0) {
      // Find closest food spawn
      const closest = foodSpawns.reduce((a, b) => {
        const distA = Math.abs(a.x - currentX) + Math.abs(a.y - currentY);
        const distB = Math.abs(b.x - currentX) + Math.abs(b.y - currentY);
        return distA < distB ? a : b;
      });
      // Move one step towards it
      const dx = Math.sign(closest.x - currentX);
      const dy = Math.sign(closest.y - currentY);
      return {
        action: 'move',
        params: { toX: currentX + (dx || dy ? dx : 0), toY: currentY + (dx ? 0 : dy) },
        reasoning: 'Fallback: hungry, moving towards food spawn',
      };
    }
  }

  // ===== SOCIAL ACTIONS (Phase 1.2) =====

  // Priority 5.5: Work if have active employment (SOCIAL - steady income)
  if (hasActiveWorkerJob && energy >= 15 && activeWorkerJob) {
    return {
      action: 'work',
      params: {},
      reasoning: `Fallback: working on employment contract (${activeWorkerJob.ticksWorked}/${activeWorkerJob.ticksRequired} ticks)`,
    };
  }

  // Priority 5.6: Accept best job offer if poor and offers available (SOCIAL)
  if (balance < 30 && nearbyJobOffers && nearbyJobOffers.length > 0 && energy >= 20) {
    // Pick the best salary job offer
    const bestOffer = nearbyJobOffers.reduce((a, b) => (a.salary > b.salary ? a : b));
    return {
      action: 'accept_job',
      params: { jobOfferId: bestOffer.id },
      reasoning: `Fallback: poor, accepting job offer for ${bestOffer.salary} CITY`,
    };
  }

  // Priority 5.7: Trade surplus food if have 3+ and nearby agents (SOCIAL)
  if (foodQuantity >= 3 && hasNearbyAgents && nearbyAgents && nearbyAgents.length > 0) {
    const targetAgent = nearbyAgents[0]; // Pick first nearby agent
    return {
      action: 'trade',
      params: {
        targetAgentId: targetAgent.id,
        offeringItemType: 'food',
        offeringQuantity: 1,
        requestingItemType: 'CITY',
        requestingQuantity: 8, // Fair price for food
      },
      reasoning: 'Fallback: surplus food, trading with nearby agent',
    };
  }

  // ===== END SOCIAL ACTIONS =====

  // Priority 6: Rest if exhausted
  if (energy < 30) {
    return {
      action: 'sleep',
      params: { duration: 3 },
      reasoning: 'Fallback: exhausted, resting',
    };
  }

  // Priority 7: Public work if poor AND at shelter (earns 15 CITY, always available!)
  if (balance < 50 && energy >= 20 && atShelter) {
    return {
      action: 'public_work',
      params: {},
      reasoning: 'Fallback: low funds at shelter, doing public work',
    };
  }

  // Priority 8: If poor but not at shelter, try foraging for food to sell
  if (balance < 30 && energy >= 10 && !atShelter) {
    return {
      action: 'forage',
      params: {},
      reasoning: 'Fallback: poor and not at shelter, foraging for resources',
    };
  }

  // Priority 9: Random exploration if healthy
  if (energy >= 10) {
    // Random direction
    const directions = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ];
    const dir = randomChoice(directions) ?? directions[0];
    return {
      action: 'move',
      params: { toX: currentX + dir.dx, toY: currentY + dir.dy },
      reasoning: 'Fallback: exploring',
    };
  }

  // Default: rest
  return {
    action: 'sleep',
    params: { duration: 1 },
    reasoning: 'Fallback: no urgent needs, resting',
  };
}
