/**
 * LLM Adapter Types
 */

import type { Agent, Location } from '../db/schema';
import type { ActionType, ActionParams } from '../actions/types';

// =============================================================================
// LLM Types
// =============================================================================

export type LLMType = 'claude' | 'codex' | 'gemini' | 'deepseek' | 'qwen' | 'glm';
export type LLMMethod = 'cli' | 'api';

// =============================================================================
// Agent Observation (what the agent sees)
// =============================================================================

export interface AgentObservation {
  tick: number;
  timestamp: number;

  // Self
  self: {
    id: string;
    x: number;
    y: number;
    hunger: number;
    energy: number;
    health: number;
    balance: number;
    state: string;
  };

  // What's around
  nearbyAgents: NearbyAgent[];
  nearbyLocations: NearbyLocation[];

  // What can be done
  availableActions: AvailableAction[];

  // Recent history
  recentEvents: RecentEvent[];
}

export interface NearbyAgent {
  id: string;
  x: number;
  y: number;
  state: string;
  // Note: no needs/balance visible - agents must infer or ask
}

export interface NearbyLocation {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
}

export interface AvailableAction {
  type: ActionType;
  description: string;
  requirements?: string;
  cost?: {
    energy?: number;
    money?: number;
  };
}

export interface RecentEvent {
  type: string;
  tick: number;
  description: string;
}

// =============================================================================
// Agent Decision (what the agent chooses to do)
// =============================================================================

export interface AgentDecision {
  action: ActionType;
  params: ActionParams;
  reasoning?: string; // Optional explanation for logging
}

// =============================================================================
// LLM Adapter Interface
// =============================================================================

export interface LLMAdapter {
  readonly type: LLMType;
  readonly method: LLMMethod;
  readonly name: string;

  /**
   * Check if adapter is available (CLI installed, API key set, etc.)
   */
  isAvailable(): Promise<boolean>;

  /**
   * Make a decision based on observation
   */
  decide(observation: AgentObservation): Promise<AgentDecision>;
}

// =============================================================================
// Adapter Configuration
// =============================================================================

export interface CLIAdapterConfig {
  command: string;
  args: string[];
  timeout: number; // ms
}

export interface APIAdapterConfig {
  endpoint: string;
  model: string;
  apiKeyEnvVar: string;
  timeout: number; // ms
}

// =============================================================================
// Cost Tracking
// =============================================================================

export interface LLMCost {
  inputPer1M: number;  // $ per 1M input tokens
  outputPer1M: number; // $ per 1M output tokens
}

export const LLM_COSTS: Record<LLMType, LLMCost> = {
  claude: { inputPer1M: 3.00, outputPer1M: 15.00 },
  codex: { inputPer1M: 0.25, outputPer1M: 1.00 },
  gemini: { inputPer1M: 2.00, outputPer1M: 12.00 },
  deepseek: { inputPer1M: 0.28, outputPer1M: 0.42 },
  qwen: { inputPer1M: 0.46, outputPer1M: 1.84 },
  glm: { inputPer1M: 0.60, outputPer1M: 2.20 },
};
