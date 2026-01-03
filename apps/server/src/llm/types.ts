/**
 * LLM Adapter Types
 */

import type { Agent, Shelter, ResourceSpawn } from '../db/schema';
import type { ActionType, ActionParams } from '../actions/types';
import type { PersonalityTrait } from '../agents/personalities';

// =============================================================================
// LLM Types
// =============================================================================

export type LLMType =
  | 'claude'
  | 'codex'
  | 'gemini'
  | 'deepseek'
  | 'qwen'
  | 'glm'
  | 'grok'
  | 'external'
  // Baseline agents for scientific comparison (non-LLM)
  | 'baseline_random'
  | 'baseline_rule'
  | 'baseline_sugarscape'
  | 'baseline_qlearning';
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
    /** Agent personality trait (Phase 5: Personality Diversification) */
    personality?: PersonalityTrait | null;
  };

  // What's around (scientific model)
  nearbyAgents: NearbyAgent[];
  nearbyResourceSpawns?: NearbyResourceSpawn[]; // New: resource spawn points
  nearbyShelters?: NearbyShelter[]; // New: shelter locations
  nearbyLocations: NearbyLocation[]; // Legacy: for backwards compatibility

  // What can be done
  availableActions: AvailableAction[];

  // Recent history
  recentEvents: RecentEvent[];

  // Inventory
  inventory: InventoryEntry[];

  // Phase 1: Memory and relationships
  recentMemories?: AgentMemoryEntry[];
  relationships?: Record<string, RelationshipInfo>; // Key is other agent ID

  // Phase 1: Emergence Observation (Claims & Naming)
  nearbyClaims?: NearbyClaim[]; // Claims in the area
  nearbyLocationNames?: Record<string, LocationNameEntry[]>; // Key is "x,y" coordinate

  // Phase 2: Social Discovery
  knownAgents?: KnownAgentEntry[]; // Agents known through direct contact or referral
}

export interface InventoryEntry {
  type: string;
  quantity: number;
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

export interface NearbyResourceSpawn {
  id: string;
  x: number;
  y: number;
  resourceType: string; // 'food' | 'energy' | 'material'
  currentAmount: number;
  maxAmount: number;
}

export interface NearbyShelter {
  id: string;
  x: number;
  y: number;
  canSleep: boolean;
  ownerId?: string;
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
// Phase 1: Memory and Relationship Types
// =============================================================================

export interface AgentMemoryEntry {
  tick: number;
  content: string;
  type: string; // 'observation' | 'action' | 'interaction' | 'reflection'
  importance: number;
  emotionalValence: number;
}

export interface RelationshipInfo {
  trustScore: number; // -100 to +100
  interactionCount: number;
  lastInteractionTick?: number;
}

// =============================================================================
// Phase 1: Emergence Observation Types (Claims & Naming)
// =============================================================================

export interface NearbyClaim {
  id: string;
  agentId: string;
  x: number;
  y: number;
  claimType: 'territory' | 'home' | 'resource' | 'danger' | 'meeting_point';
  description?: string;
  strength: number;
  claimedAtTick: number;
}

export interface LocationNameEntry {
  name: string;
  usageCount: number;
  isConsensus: boolean;
}

// =============================================================================
// Phase 2: Social Discovery Types
// =============================================================================

export interface KnownAgentEntry {
  id: string;
  discoveryType: 'direct' | 'referral';
  referredBy?: string;
  referralDepth: number;
  lastKnownPosition?: { x: number; y: number };
  reputationClaim?: { sentiment: number; claim: string };
  dangerWarning?: string;
  informationAge: number; // ticks since information was received
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
  claude: { inputPer1M: 0.80, outputPer1M: 4.00 }, // Haiku pricing
  codex: { inputPer1M: 0.15, outputPer1M: 0.60 }, // GPT-4o-mini pricing
  gemini: { inputPer1M: 0.075, outputPer1M: 0.30 }, // Gemini Flash pricing
  deepseek: { inputPer1M: 0.28, outputPer1M: 0.42 },
  qwen: { inputPer1M: 0.46, outputPer1M: 1.84 },
  glm: { inputPer1M: 0.60, outputPer1M: 2.20 },
  grok: { inputPer1M: 2.00, outputPer1M: 10.00 }, // Grok-2 pricing
  external: { inputPer1M: 0, outputPer1M: 0 }, // External agents - no platform cost
  // Baseline agents - no LLM cost (heuristic decisions)
  baseline_random: { inputPer1M: 0, outputPer1M: 0 },
  baseline_rule: { inputPer1M: 0, outputPer1M: 0 },
  baseline_sugarscape: { inputPer1M: 0, outputPer1M: 0 },
  baseline_qlearning: { inputPer1M: 0, outputPer1M: 0 },
};
