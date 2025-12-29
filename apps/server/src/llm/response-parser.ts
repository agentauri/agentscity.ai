/**
 * Response Parser - Parse LLM responses into structured decisions
 */

import type { AgentDecision } from './types';
import type { ActionType } from '../actions/types';

const VALID_ACTIONS: ActionType[] = [
  'move', 'buy', 'consume', 'sleep', 'work', 'gather', 'trade',
  // Phase 2: Conflict Actions
  'harm', 'steal', 'deceive',
  // Phase 2: Social Discovery
  'share_info',
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
  agentY?: number
): AgentDecision {
  // Priority 1: If critically hungry and have money, buy food
  if (hunger < 30 && balance >= 10) {
    return {
      action: 'buy',
      params: { itemType: 'food', quantity: 1 },
      reasoning: 'Fallback: critically hungry, buying food',
    };
  }

  // Priority 2: Consume food if hungry (assume might have some)
  if (hunger < 50) {
    return {
      action: 'consume',
      params: { itemType: 'food' },
      reasoning: 'Fallback: hungry, attempting to consume food',
    };
  }

  // Priority 3: Rest if exhausted
  if (energy < 30) {
    return {
      action: 'sleep',
      params: { duration: 3 },
      reasoning: 'Fallback: exhausted, resting',
    };
  }

  // Priority 4: Work if poor (no location required)
  if (balance < 50 && energy >= 20) {
    return {
      action: 'work',
      params: { duration: 2 },
      reasoning: 'Fallback: low funds, working',
    };
  }

  // Priority 5: Random exploration if healthy
  if (energy >= 10) {
    const currentX = agentX ?? 50;
    const currentY = agentY ?? 50;
    // Random direction
    const directions = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ];
    const dir = directions[Math.floor(Math.random() * directions.length)];
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
