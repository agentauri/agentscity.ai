/**
 * Response Parser - Parse LLM responses into structured decisions
 */

import type { AgentDecision } from './types';
import type { ActionType } from '../actions/types';

const VALID_ACTIONS: ActionType[] = ['move', 'buy', 'consume', 'sleep', 'work'];

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
      if (typeof params.locationId !== 'string') {
        return { valid: false, error: 'work requires locationId string' };
      }
      if (params.duration !== undefined) {
        if (typeof params.duration !== 'number' || params.duration < 1 || params.duration > 5) {
          return { valid: false, error: 'work duration must be 1-5' };
        }
      }
      break;
  }

  return { valid: true };
}

/**
 * Generate fallback decision when LLM fails
 * Prioritizes survival: eat if hungry, rest if tired, work if poor
 */
export function getFallbackDecision(
  hunger: number,
  energy: number,
  balance: number
): AgentDecision {
  // Priority 1: Eat if critically hungry
  if (hunger < 30 && balance >= 10) {
    return {
      action: 'buy',
      params: { itemType: 'food', quantity: 1 },
      reasoning: 'Fallback: critically hungry, buying food',
    };
  }

  // Priority 2: Consume food if hungry and presumably have some
  if (hunger < 50) {
    return {
      action: 'consume',
      params: { itemType: 'food' },
      reasoning: 'Fallback: hungry, consuming food',
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

  // Priority 4: Work if poor
  if (balance < 50 && energy >= 20) {
    return {
      action: 'work',
      params: { locationId: 'default', duration: 2 },
      reasoning: 'Fallback: low funds, working',
    };
  }

  // Default: rest
  return {
    action: 'sleep',
    params: { duration: 1 },
    reasoning: 'Fallback: no urgent needs, resting',
  };
}
