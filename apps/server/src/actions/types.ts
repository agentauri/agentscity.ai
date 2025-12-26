/**
 * Action type definitions
 */

import type { Agent } from '../db/schema';
import type { WorldEvent } from '../cache/pubsub';

// =============================================================================
// Action Types
// =============================================================================

export type ActionType = 'move' | 'buy' | 'consume' | 'sleep' | 'work';

// =============================================================================
// Action Parameters
// =============================================================================

export interface MoveParams {
  toX: number;
  toY: number;
}

export interface BuyParams {
  itemType: string;
  quantity: number;
  locationId?: string;
}

export interface ConsumeParams {
  itemType: string;
  quantity?: number;
}

export interface SleepParams {
  duration: number; // in ticks
}

export interface WorkParams {
  locationId: string;
  duration?: number; // in ticks
}

export type ActionParams = MoveParams | BuyParams | ConsumeParams | SleepParams | WorkParams;

// =============================================================================
// Action Intent
// =============================================================================

export interface ActionIntent<T extends ActionParams = ActionParams> {
  agentId: string;
  type: ActionType;
  params: T;
  tick: number;
  timestamp: number;
}

// =============================================================================
// Validation
// =============================================================================

export interface ActionValidation {
  valid: boolean;
  reason?: string;
  estimatedCost?: {
    energy: number;
    money: number;
    time: number; // ticks
  };
}

// =============================================================================
// Execution Result
// =============================================================================

export interface ActionResult {
  success: boolean;
  changes?: Partial<Agent>;
  events?: WorldEvent[];
  error?: string;
}

// =============================================================================
// Action Handler
// =============================================================================

export type ActionHandler<T extends ActionParams = ActionParams> = (
  intent: ActionIntent<T>,
  agent: Agent
) => Promise<ActionResult>;
