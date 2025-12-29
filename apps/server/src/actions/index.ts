/**
 * Action Registry and Dispatcher
 */

import type { Agent } from '../db/schema';
import type { ActionType, ActionParams, ActionIntent, ActionResult, ActionHandler } from './types';
import { handleMove } from './handlers/move';
import { handleBuy } from './handlers/buy';
import { handleConsume } from './handlers/consume';
import { handleSleep } from './handlers/sleep';
import { handleWork } from './handlers/work';
import { handleGather } from './handlers/gather';
import { handleTrade } from './handlers/trade';
// Phase 1: Emergence Observation
import { handleClaim } from './handlers/claim';
import { handleNameLocation } from './handlers/name-location';
// Phase 2: Conflict Actions
import { handleHarm } from './handlers/harm';
import { handleSteal } from './handlers/steal';
import { handleDeceive } from './handlers/deceive';
// Phase 2: Social Discovery
import { handleShareInfo } from './handlers/share-info';

// Action handler registry
const handlers: Map<ActionType, ActionHandler> = new Map();

// Register default handlers
handlers.set('move', handleMove as ActionHandler);
handlers.set('buy', handleBuy as ActionHandler);
handlers.set('consume', handleConsume as ActionHandler);
handlers.set('sleep', handleSleep as ActionHandler);
handlers.set('work', handleWork as ActionHandler);
handlers.set('gather', handleGather as ActionHandler);
handlers.set('trade', handleTrade as ActionHandler);
// Phase 1: Emergence Observation
handlers.set('claim', handleClaim as ActionHandler);
handlers.set('name_location', handleNameLocation as ActionHandler);
// Phase 2: Conflict Actions
handlers.set('harm', handleHarm as ActionHandler);
handlers.set('steal', handleSteal as ActionHandler);
handlers.set('deceive', handleDeceive as ActionHandler);
// Phase 2: Social Discovery
handlers.set('share_info', handleShareInfo as ActionHandler);

/**
 * Register a custom action handler
 */
export function registerHandler(actionType: ActionType, handler: ActionHandler): void {
  handlers.set(actionType, handler);
}

/**
 * Get handler for action type
 */
export function getHandler(actionType: ActionType): ActionHandler | undefined {
  return handlers.get(actionType);
}

/**
 * Execute an action
 */
export async function executeAction(
  intent: ActionIntent,
  agent: Agent
): Promise<ActionResult> {
  const handler = handlers.get(intent.type);

  if (!handler) {
    return {
      success: false,
      error: `Unknown action type: ${intent.type}`,
    };
  }

  // Check if agent is alive
  if (agent.state === 'dead') {
    return {
      success: false,
      error: 'Agent is dead',
    };
  }

  try {
    return await handler(intent, agent);
  } catch (error) {
    console.error(`Action ${intent.type} failed:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Create action intent
 */
export function createIntent<T extends ActionParams>(
  agentId: string,
  type: ActionType,
  params: T,
  tick: number
): ActionIntent<T> {
  return {
    agentId,
    type,
    params,
    tick,
    timestamp: Date.now(),
  };
}

// Export types
export * from './types';
