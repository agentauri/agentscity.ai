/**
 * Action type definitions
 */

import type { Agent } from '../db/schema';
import type { WorldEvent } from '../cache/pubsub';

// =============================================================================
// Action Types
// =============================================================================

export type ActionType =
  | 'move'
  | 'buy'
  | 'consume'
  | 'sleep'
  | 'work'
  | 'gather'
  | 'trade'
  // Phase 1: Emergence Observation
  | 'claim'
  | 'name_location'
  // Phase 2: Conflict Actions
  | 'harm'
  | 'steal'
  | 'deceive'
  // Phase 2: Social Discovery
  | 'share_info';

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
  locationId?: string; // Optional - work can happen anywhere
  duration?: number; // in ticks
}

export interface GatherParams {
  resourceType?: string; // Optional - if not specified, gather any available
  quantity?: number; // How much to try to gather (default: 1)
}

export interface TradeParams {
  targetAgentId: string; // Agent to trade with
  offeringItemType: string; // What we're offering
  offeringQuantity: number; // How much we're offering
  requestingItemType: string; // What we want in return
  requestingQuantity: number; // How much we want
}

// Phase 2: Conflict Action Parameters

export interface HarmParams {
  targetAgentId: string; // Agent to attack
  intensity: 'light' | 'moderate' | 'severe'; // Damage level
}

export interface StealParams {
  targetAgentId: string; // Agent to steal from
  targetItemType: string; // What to steal
  quantity: number; // How much to steal
}

export interface DeceiveParams {
  targetAgentId: string; // Agent to deceive
  claim: string; // The false information
  claimType: 'resource_location' | 'agent_reputation' | 'danger_warning' | 'trade_offer' | 'other';
}

// Phase 2: Social Discovery Parameters

export interface ShareInfoParams {
  targetAgentId: string; // Who we're talking to
  subjectAgentId: string; // Who we're talking about
  infoType: 'location' | 'reputation' | 'warning' | 'recommendation';
  claim?: string; // Optional description/claim
  sentiment?: number; // -100 to +100, opinion of the subject
  position?: { x: number; y: number }; // Optional last known position
}

// Phase 1: Emergence Observation Parameters

export interface ClaimParams {
  claimType: 'territory' | 'home' | 'resource' | 'danger' | 'meeting_point';
  description?: string; // Optional reason/description for the claim
  x?: number; // Position to claim (default: current position)
  y?: number;
}

export interface NameLocationParams {
  name: string; // The name to give
  x?: number; // Position to name (default: current position)
  y?: number;
}

export type ActionParams =
  | MoveParams
  | BuyParams
  | ConsumeParams
  | SleepParams
  | WorkParams
  | GatherParams
  | TradeParams
  | ClaimParams
  | NameLocationParams
  | HarmParams
  | StealParams
  | DeceiveParams
  | ShareInfoParams;

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
