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

// Action handler registry
const handlers: Map<ActionType, ActionHandler> = new Map();

// Register default handlers
handlers.set('move', handleMove as ActionHandler);
handlers.set('buy', handleBuy as ActionHandler);
handlers.set('consume', handleConsume as ActionHandler);
handlers.set('sleep', handleSleep as ActionHandler);
handlers.set('work', handleWork as ActionHandler);

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
