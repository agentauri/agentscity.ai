/**
 * World Spawner - Initialize agents, resource spawns, and shelters
 *
 * Scientific Model:
 * - No predefined location types (commercial, residential, etc.)
 * - Resources are geographically distributed (Sugarscape-style)
 * - Shelters are generic structures (agents decide function)
 *
 * A/B Testing Support:
 * - Parametric spawning with custom agent/resource configurations
 * - Reproducible worlds via optional seed
 *
 * Phase 5: Personality Diversification
 * - Agents can be assigned personality traits (aggressive, cooperative, etc.)
 * - 40% neutral (control group) for scientific comparison
 */

import { v4 as uuid } from 'uuid';
import { createAgent, getAllAgents, deleteAllAgents } from '../db/queries/agents';
import {
  getAllShelters,
  createShelter,
  getAllResourceSpawns,
  createResourceSpawn,
  deleteAllShelters,
  deleteAllResourceSpawns,
} from '../db/queries/world';
import { addToInventory, deleteAllInventory } from '../db/queries/inventory';
import type { NewAgent, NewShelter, NewResourceSpawn } from '../db/schema';
import type { LLMType } from '../llm/types';
import { CONFIG } from '../config';
import {
  selectRandomPersonality,
  getPersonalityConfig,
  isPersonalityEnabled,
  type PersonalityTrait,
} from './personalities';
import {
  type GenesisConfig,
  type GenesisResult,
  type ChildSpecification,
  DEFAULT_GENESIS_CONFIG,
} from './genesis-types';
import {
  generateChildrenFromAllMothers,
  generateChildrenFromAllMothersCached,
  type LLMInvoker,
} from './genesis';
import { createProductionInvoker, createDiverseMockInvoker } from './genesis-llm-invoker';

// =============================================================================
// Agent Configurations
// =============================================================================

export interface AgentConfig {
  llmType: LLMType;
  name: string;
  color: string;
  startX: number;
  startY: number;
  /** Optional personality override (if not set, assigned randomly when enabled) */
  personality?: PersonalityTrait;
}

const AGENT_CONFIGS: AgentConfig[] = [
  { llmType: 'claude', name: 'Claude', color: '#ef4444', startX: 28, startY: 20 },
  { llmType: 'codex', name: 'Codex', color: '#3b82f6', startX: 30, startY: 20 },
  { llmType: 'gemini', name: 'Gemini', color: '#10b981', startX: 32, startY: 20 },
  { llmType: 'deepseek', name: 'DeepSeek', color: '#f59e0b', startX: 28, startY: 22 },
  { llmType: 'qwen', name: 'Qwen', color: '#8b5cf6', startX: 30, startY: 22 },
  { llmType: 'glm', name: 'GLM', color: '#ec4899', startX: 32, startY: 22 },
  { llmType: 'grok', name: 'Grok', color: '#1d4ed8', startX: 30, startY: 24 },
];

// =============================================================================
// Baseline Agent Configurations (Scientific Comparison)
// =============================================================================

/**
 * Baseline agents for scientific comparison experiments.
 * These agents do not use LLM calls - they use heuristic or random decisions.
 *
 * - baseline_random: Pure random action selection (null hypothesis)
 * - baseline_rule: Simple if-then-else heuristics (reactive intelligence)
 * - baseline_sugarscape: Classic Sugarscape agent behavior (resource competition)
 *
 * Gray color scheme to visually distinguish from LLM agents.
 */
const BASELINE_AGENT_CONFIGS: AgentConfig[] = [
  { llmType: 'baseline_random', name: 'Random-1', color: '#9ca3af', startX: 40, startY: 20 },
  { llmType: 'baseline_rule', name: 'Rule-1', color: '#6b7280', startX: 40, startY: 22 },
  { llmType: 'baseline_sugarscape', name: 'Sugar-1', color: '#4b5563', startX: 40, startY: 24 },
];

// =============================================================================
// Biome Configurations
// =============================================================================

export type BiomeType = 'forest' | 'desert' | 'tundra' | 'plains';

export interface BiomeConfig {
  type: BiomeType;
  color: string;
  emoji: string;
  // Regeneration multipliers per resource type
  regenMultipliers: {
    food: number;
    energy: number;
    material: number;
  };
}

export const BIOME_CONFIGS: Record<BiomeType, BiomeConfig> = {
  forest: {
    type: 'forest',
    color: '#22c55e', // Green
    emoji: '🌲',
    regenMultipliers: { food: 1.5, energy: 1.0, material: 0.5 },
  },
  desert: {
    type: 'desert',
    color: '#f59e0b', // Orange
    emoji: '🏜️',
    regenMultipliers: { food: 0.3, energy: 0.5, material: 1.5 },
  },
  tundra: {
    type: 'tundra',
    color: '#38bdf8', // Light blue
    emoji: '❄️',
    regenMultipliers: { food: 0.5, energy: 1.5, material: 0.8 },
  },
  plains: {
    type: 'plains',
    color: '#a3e635', // Lime
    emoji: '🌾',
    regenMultipliers: { food: 1.0, energy: 1.0, material: 1.0 },
  },
};

/**
 * Determine biome based on position (quadrant system)
 * - NW (x < 50, y < 50): forest - lush with food
 * - NE (x >= 50, y < 50): tundra - cold with energy
 * - SW (x < 50, y >= 50): desert - scarce but materials
 * - SE (x >= 50, y >= 50): plains - balanced
 */
export function getBiomeForPosition(x: number, y: number): BiomeType {
  const midX = 50;
  const midY = 50;

  if (x < midX && y < midY) return 'forest';
  if (x >= midX && y < midY) return 'tundra';
  if (x < midX && y >= midY) return 'desert';
  return 'plains';
}

// =============================================================================
// Resource Spawn Configurations (Sugarscape-style)
// =============================================================================

export interface ResourceSpawnConfig {
  resourceType: 'food' | 'energy' | 'material';
  x: number;
  y: number;
  maxAmount: number;
  regenRate: number;
  biome?: BiomeType; // Will be auto-assigned if not specified
}

// Resources distributed geographically - more dense and accessible to encourage gathering
// Increased spawn count and placed closer to central shelters (around 30,20)
const RESOURCE_SPAWN_CONFIGS: ResourceSpawnConfig[] = [
  // CENTRAL FOOD CLUSTER (near starting shelters - high priority!)
  { resourceType: 'food', x: 28, y: 18, maxAmount: 20, regenRate: 1.2 },
  { resourceType: 'food', x: 32, y: 18, maxAmount: 20, regenRate: 1.2 },
  { resourceType: 'food', x: 30, y: 22, maxAmount: 15, regenRate: 1.0 },
  { resourceType: 'food', x: 26, y: 20, maxAmount: 15, regenRate: 1.0 },
  { resourceType: 'food', x: 34, y: 20, maxAmount: 15, regenRate: 1.0 },

  // Food cluster (northwest area)
  { resourceType: 'food', x: 20, y: 15, maxAmount: 20, regenRate: 1.0 },
  { resourceType: 'food', x: 22, y: 16, maxAmount: 15, regenRate: 0.8 },
  { resourceType: 'food', x: 18, y: 18, maxAmount: 15, regenRate: 0.8 },
  { resourceType: 'food', x: 24, y: 14, maxAmount: 10, regenRate: 0.5 },

  // Food cluster (southeast area)
  { resourceType: 'food', x: 45, y: 40, maxAmount: 20, regenRate: 1.0 },
  { resourceType: 'food', x: 47, y: 42, maxAmount: 15, regenRate: 0.8 },
  { resourceType: 'food', x: 43, y: 38, maxAmount: 10, regenRate: 0.5 },

  // CENTRAL ENERGY CLUSTER (near starting shelters)
  { resourceType: 'energy', x: 30, y: 16, maxAmount: 15, regenRate: 0.8 },
  { resourceType: 'energy', x: 32, y: 22, maxAmount: 12, regenRate: 0.6 },
  { resourceType: 'energy', x: 26, y: 18, maxAmount: 12, regenRate: 0.6 },

  // Energy cluster (northeast area)
  { resourceType: 'energy', x: 50, y: 10, maxAmount: 15, regenRate: 0.6 },
  { resourceType: 'energy', x: 52, y: 12, maxAmount: 12, regenRate: 0.5 },
  { resourceType: 'energy', x: 48, y: 8, maxAmount: 10, regenRate: 0.4 },

  // Energy cluster (southwest area)
  { resourceType: 'energy', x: 10, y: 45, maxAmount: 15, regenRate: 0.6 },
  { resourceType: 'energy', x: 12, y: 47, maxAmount: 12, regenRate: 0.5 },

  // CENTRAL MATERIAL CLUSTER (near starting shelters)
  { resourceType: 'material', x: 28, y: 24, maxAmount: 20, regenRate: 0.4 },
  { resourceType: 'material', x: 34, y: 22, maxAmount: 15, regenRate: 0.3 },

  // Material cluster (center-south)
  { resourceType: 'material', x: 30, y: 30, maxAmount: 25, regenRate: 0.3 },
  { resourceType: 'material', x: 32, y: 32, maxAmount: 20, regenRate: 0.3 },
  { resourceType: 'material', x: 28, y: 28, maxAmount: 15, regenRate: 0.2 },
];

// =============================================================================
// Shelter Configurations
// =============================================================================

export interface ShelterConfig {
  x: number;
  y: number;
  canSleep: boolean;
}

// Generic shelters - agents decide their function
const SHELTER_CONFIGS: ShelterConfig[] = [
  // Central cluster
  { x: 30, y: 20, canSleep: true },
  { x: 32, y: 20, canSleep: true },
  { x: 28, y: 22, canSleep: true },

  // Northwest cluster
  { x: 20, y: 18, canSleep: true },
  { x: 22, y: 20, canSleep: true },

  // Southeast cluster
  { x: 45, y: 38, canSleep: true },
  { x: 47, y: 40, canSleep: true },

  // Scattered
  { x: 50, y: 15, canSleep: true },
  { x: 15, y: 45, canSleep: true },
  { x: 35, y: 35, canSleep: true },
];

// =============================================================================
// Personality Assignment
// =============================================================================

/**
 * Assign a personality to an agent.
 * Uses explicit personality from config if provided, otherwise randomly selects.
 * Returns null if personalities are disabled.
 */
function assignPersonality(agentConfig: AgentConfig, agentIndex: number): PersonalityTrait | null {
  // Check if personalities are enabled
  if (!isPersonalityEnabled()) {
    return null;
  }

  // Use explicit personality if provided in config
  if (agentConfig.personality) {
    return agentConfig.personality;
  }

  // Use agent index as seed for reproducibility within a spawn run
  // This ensures the same agents get the same personalities when respawning
  const seed = CONFIG.simulation.randomSeed + agentIndex;
  return selectRandomPersonality(seed);
}

// =============================================================================
// Spawning Functions
// =============================================================================

/**
 * Spawn initial resource spawns (if not already present)
 */
export async function spawnInitialResourceSpawns(): Promise<void> {
  const existing = await getAllResourceSpawns();

  if (existing.length > 0) {
    console.log(`[Spawner] ${existing.length} resource spawns already exist, skipping`);
    return;
  }

  console.log('[Spawner] Spawning resource spawns with biomes...');

  for (const config of RESOURCE_SPAWN_CONFIGS) {
    // Auto-assign biome based on position if not specified
    const biome = config.biome ?? getBiomeForPosition(config.x, config.y);
    const biomeConfig = BIOME_CONFIGS[biome];

    // Apply biome multiplier to regen rate
    const resourceType = config.resourceType as 'food' | 'energy' | 'material';
    const biomeRegenRate = config.regenRate * biomeConfig.regenMultipliers[resourceType];

    const spawn: NewResourceSpawn = {
      id: uuid(),
      x: config.x,
      y: config.y,
      resourceType: config.resourceType,
      maxAmount: config.maxAmount,
      currentAmount: config.maxAmount, // Start full
      regenRate: biomeRegenRate,
      biome,
    };

    await createResourceSpawn(spawn);

    const emoji = config.resourceType === 'food' ? '🍎' : config.resourceType === 'energy' ? '⚡' : '🪵';
    console.log(`  ${biomeConfig.emoji} ${emoji} ${config.resourceType} in ${biome} at (${config.x}, ${config.y}) - regen ${biomeRegenRate.toFixed(2)}`);
  }

  console.log('[Spawner] All resource spawns created');
}

/**
 * Spawn initial shelters (if not already present)
 */
export async function spawnInitialShelters(): Promise<void> {
  const existing = await getAllShelters();

  if (existing.length > 0) {
    console.log(`[Spawner] ${existing.length} shelters already exist, skipping`);
    return;
  }

  console.log('[Spawner] Spawning shelters...');

  for (const config of SHELTER_CONFIGS) {
    const shelter: NewShelter = {
      id: uuid(),
      x: config.x,
      y: config.y,
      canSleep: config.canSleep,
    };

    await createShelter(shelter);
    console.log(`  🏠 Shelter at (${config.x}, ${config.y})`);
  }

  console.log('[Spawner] All shelters created');
}

/**
 * Spawn initial agents (if not already present)
 */
export async function spawnInitialAgents(): Promise<void> {
  const existingAgents = await getAllAgents();

  if (existingAgents.length > 0) {
    console.log(`[Spawner] ${existingAgents.length} agents already exist, skipping spawn`);
    return;
  }

  // Scarcity mode: reduced starting resources to encourage emergent behavior
  const startingFood = 1; // Reduced from 3 to create urgency

  // Determine which agents to spawn
  const agentsToSpawn: AgentConfig[] = [...AGENT_CONFIGS];

  // Conditionally include baseline agents based on configuration
  if (CONFIG.experiment.includeBaselineAgents) {
    const count = CONFIG.experiment.baselineAgentCount;
    console.log(`[Spawner] Including ${count} of each baseline agent type for scientific comparison`);

    // Add the configured number of each baseline type
    for (let i = 0; i < count; i++) {
      for (const baselineConfig of BASELINE_AGENT_CONFIGS) {
        // Offset position slightly for multiple instances
        agentsToSpawn.push({
          ...baselineConfig,
          name: count > 1 ? `${baselineConfig.name.split('-')[0]}-${i + 1}` : baselineConfig.name,
          startX: baselineConfig.startX + i * 2,
          startY: baselineConfig.startY,
        });
      }
    }
  }

  // Log personality distribution if enabled
  if (isPersonalityEnabled()) {
    console.log('[Spawner] Personality diversification ENABLED');
  }

  console.log(`[Spawner] Spawning ${agentsToSpawn.length} agents (${AGENT_CONFIGS.length} LLM + ${agentsToSpawn.length - AGENT_CONFIGS.length} baseline)...`);

  // Track personality distribution for logging
  const personalityCounts: Record<string, number> = {};

  for (let i = 0; i < agentsToSpawn.length; i++) {
    const agentConfig = agentsToSpawn[i];

    // Assign personality
    const personality = assignPersonality(agentConfig, i);
    if (personality) {
      personalityCounts[personality] = (personalityCounts[personality] || 0) + 1;
    }

    const agent: NewAgent = {
      id: uuid(),
      llmType: agentConfig.llmType,
      x: agentConfig.startX,
      y: agentConfig.startY,
      hunger: CONFIG.agent.startingHunger,
      energy: CONFIG.agent.startingEnergy,
      health: CONFIG.agent.startingHealth,
      balance: CONFIG.agent.startingBalance,
      state: 'idle',
      color: agentConfig.color,
      personality: personality,
    };

    await createAgent(agent);

    // Give starting inventory (reduced for scarcity)
    await addToInventory(agent.id, 'food', startingFood);

    const isBaseline = agentConfig.llmType.startsWith('baseline_');
    const icon = isBaseline ? '  [B]' : '  ✅';
    const personalityLabel = personality ? ` [${personality}]` : '';
    console.log(`${icon} ${agentConfig.name} (${agentConfig.llmType})${personalityLabel} spawned at (${agentConfig.startX}, ${agentConfig.startY}) with ${startingFood} food`);
  }

  // Log personality distribution summary
  if (Object.keys(personalityCounts).length > 0) {
    console.log('[Spawner] Personality distribution:', personalityCounts);
  }

  console.log('[Spawner] All agents spawned');
}

/**
 * Spawn all initial entities
 */
export async function spawnWorld(): Promise<void> {
  await spawnInitialResourceSpawns();
  await spawnInitialShelters();
  await spawnInitialAgents();
}

/**
 * Reset world (delete all agents and resources, respawn)
 */
export async function resetWorld(): Promise<void> {
  console.log('[Spawner] Resetting world...');
  await spawnWorld();
}

// =============================================================================
// Legacy compatibility (during migration period)
// =============================================================================

/**
 * @deprecated Use spawnInitialShelters instead
 */
export async function spawnInitialLocations(): Promise<void> {
  console.log('[Spawner] WARNING: spawnInitialLocations is deprecated, using spawnInitialShelters');
  await spawnInitialShelters();
}

/**
 * @deprecated Not supported in scientific model
 */
export async function spawnLocationsFromGrid(): Promise<void> {
  console.log('[Spawner] WARNING: spawnLocationsFromGrid is deprecated in scientific model');
}

/**
 * @deprecated Use spawnInitialAgents instead
 */
export async function spawnAgentsAtLocations(): Promise<void> {
  console.log('[Spawner] WARNING: spawnAgentsAtLocations is deprecated, using spawnInitialAgents');
  await spawnInitialAgents();
}

// =============================================================================
// Parametric Spawning (A/B Testing Support)
// =============================================================================

export interface SpawnConfiguration {
  agents?: AgentConfig[];
  resourceSpawns?: ResourceSpawnConfig[];
  shelters?: ShelterConfig[];
  seed?: number;
  startingFood?: number;
  /** Include baseline agents (overrides CONFIG.experiment.includeBaselineAgents) */
  includeBaselineAgents?: boolean;
  /** Number of each baseline type (overrides CONFIG.experiment.baselineAgentCount) */
  baselineAgentCount?: number;
  /** Enable personalities for this spawn (overrides CONFIG.experiment.enablePersonalities) */
  enablePersonalities?: boolean;
}

/**
 * Get default configurations (for reference/modification)
 */
export function getDefaultConfigurations(): SpawnConfiguration {
  return {
    agents: [...AGENT_CONFIGS],
    resourceSpawns: [...RESOURCE_SPAWN_CONFIGS],
    shelters: [...SHELTER_CONFIGS],
    startingFood: 1,
    includeBaselineAgents: CONFIG.experiment.includeBaselineAgents,
    baselineAgentCount: CONFIG.experiment.baselineAgentCount,
    enablePersonalities: CONFIG.experiment.enablePersonalities,
  };
}

/**
 * Get baseline agent configurations.
 * Useful for A/B testing to manually include baseline agents.
 */
export function getBaselineAgentConfigs(): AgentConfig[] {
  return [...BASELINE_AGENT_CONFIGS];
}

/**
 * Clear all world entities (agents, resources, shelters)
 * Used before spawning a new variant
 */
export async function clearWorld(): Promise<void> {
  console.log('[Spawner] Clearing world...');

  // Delete in order: inventory -> agents -> shelters -> resources
  await deleteAllInventory();
  await deleteAllAgents();
  await deleteAllShelters();
  await deleteAllResourceSpawns();

  console.log('[Spawner] World cleared');
}

/**
 * Spawn world with custom configuration (for A/B testing)
 */
export async function spawnWorldWithConfig(config?: SpawnConfiguration): Promise<void> {
  let agents = config?.agents ?? AGENT_CONFIGS;
  const resourceSpawns = config?.resourceSpawns ?? RESOURCE_SPAWN_CONFIGS;
  const shelters = config?.shelters ?? SHELTER_CONFIGS;
  const startingFood = config?.startingFood ?? 1;

  // Handle baseline agents
  const includeBaseline = config?.includeBaselineAgents ?? CONFIG.experiment.includeBaselineAgents;
  const baselineCount = config?.baselineAgentCount ?? CONFIG.experiment.baselineAgentCount;

  // Handle personality override
  const enablePersonalities = config?.enablePersonalities ?? isPersonalityEnabled();

  if (includeBaseline) {
    // Add baseline agents to the spawn list
    const baselineAgentsToAdd: AgentConfig[] = [];
    for (let i = 0; i < baselineCount; i++) {
      for (const baselineConfig of BASELINE_AGENT_CONFIGS) {
        baselineAgentsToAdd.push({
          ...baselineConfig,
          name: baselineCount > 1 ? `${baselineConfig.name.split('-')[0]}-${i + 1}` : baselineConfig.name,
          startX: baselineConfig.startX + i * 2,
          startY: baselineConfig.startY,
        });
      }
    }
    agents = [...agents, ...baselineAgentsToAdd];
    console.log(`[Spawner] Including ${baselineAgentsToAdd.length} baseline agents`);
  }

  if (enablePersonalities) {
    console.log('[Spawner] Personality diversification ENABLED for this spawn');
  }

  console.log(`[Spawner] Spawning world with custom config: ${agents.length} agents, ${resourceSpawns.length} resources, ${shelters.length} shelters`);

  // Spawn resource spawns with biome support
  for (const rsConfig of resourceSpawns) {
    // Auto-assign biome based on position if not specified
    const biome = rsConfig.biome ?? getBiomeForPosition(rsConfig.x, rsConfig.y);
    const biomeConfig = BIOME_CONFIGS[biome];

    // Apply biome multiplier to regen rate
    const resourceType = rsConfig.resourceType as 'food' | 'energy' | 'material';
    const biomeRegenRate = rsConfig.regenRate * biomeConfig.regenMultipliers[resourceType];

    const spawn: NewResourceSpawn = {
      id: uuid(),
      x: rsConfig.x,
      y: rsConfig.y,
      resourceType: rsConfig.resourceType,
      maxAmount: rsConfig.maxAmount,
      currentAmount: rsConfig.maxAmount,
      regenRate: biomeRegenRate,
      biome,
    };
    await createResourceSpawn(spawn);
  }
  console.log(`  ✅ ${resourceSpawns.length} resource spawns created with biomes`);

  // Spawn shelters
  for (const shelterConfig of shelters) {
    const shelter: NewShelter = {
      id: uuid(),
      x: shelterConfig.x,
      y: shelterConfig.y,
      canSleep: shelterConfig.canSleep,
    };
    await createShelter(shelter);
  }
  console.log(`  ✅ ${shelters.length} shelters created`);

  // Track personality distribution for logging
  const personalityCounts: Record<string, number> = {};

  // Spawn agents
  for (let i = 0; i < agents.length; i++) {
    const agentConfig = agents[i];

    // Assign personality if enabled (for this spawn)
    let personality: PersonalityTrait | null = null;
    if (enablePersonalities) {
      if (agentConfig.personality) {
        personality = agentConfig.personality;
      } else {
        const seed = (config?.seed ?? CONFIG.simulation.randomSeed) + i;
        personality = selectRandomPersonality(seed);
      }
      if (personality) {
        personalityCounts[personality] = (personalityCounts[personality] || 0) + 1;
      }
    }

    const agent: NewAgent = {
      id: uuid(),
      llmType: agentConfig.llmType,
      x: agentConfig.startX,
      y: agentConfig.startY,
      hunger: CONFIG.agent.startingHunger,
      energy: CONFIG.agent.startingEnergy,
      health: CONFIG.agent.startingHealth,
      balance: CONFIG.agent.startingBalance,
      state: 'idle',
      color: agentConfig.color,
      personality: personality,
    };

    await createAgent(agent);
    await addToInventory(agent.id, 'food', startingFood);

    const isBaseline = agentConfig.llmType.startsWith('baseline_');
    const icon = isBaseline ? '  [B]' : '  ✅';
    const personalityLabel = personality ? ` [${personality}]` : '';
    console.log(`${icon} ${agentConfig.name} (${agentConfig.llmType})${personalityLabel} spawned`);
  }

  // Log personality distribution summary
  if (Object.keys(personalityCounts).length > 0) {
    console.log('[Spawner] Personality distribution:', personalityCounts);
  }

  console.log('[Spawner] World spawned with custom configuration');
}

/**
 * Reset world with custom configuration (clear + spawn)
 */
export async function resetWorldWithConfig(config?: SpawnConfiguration): Promise<void> {
  await clearWorld();
  await spawnWorldWithConfig(config);
}

// =============================================================================
// Genesis Spawning (Meta-Generation)
// =============================================================================

/**
 * Extended spawn configuration with genesis support.
 */
export interface GenesisSpawnConfiguration extends SpawnConfiguration {
  /** Genesis configuration for LLM meta-generation */
  genesis?: GenesisConfig;
  /** Use mock LLM invoker for testing */
  useMockGenesis?: boolean;
  /** Enable Redis caching for genesis results (default: true) */
  useGenesisCache?: boolean;
}

/**
 * Convert a genesis child specification to an agent config.
 *
 * @param child - Child specification from genesis
 * @param motherType - LLM type that generated this child
 * @param index - Index for positioning
 * @param useConfiguredPersonalities - Override with user-configured weights
 * @returns AgentConfig ready for spawning
 */
function childToAgentConfig(
  child: ChildSpecification,
  motherType: LLMType,
  index: number,
  useConfiguredPersonalities?: boolean
): AgentConfig {
  // Generate color based on mother type
  const colorMap: Partial<Record<LLMType, string>> = {
    claude: '#ef4444',   // Red
    codex: '#3b82f6',    // Blue
    gemini: '#10b981',   // Green
    deepseek: '#f59e0b', // Orange
    qwen: '#8b5cf6',     // Purple
    glm: '#ec4899',      // Pink
    grok: '#1d4ed8',     // Dark blue
  };

  const baseColor = colorMap[motherType] ?? '#6b7280';

  // Position agents in a grid pattern based on mother
  const motherIndex = ['claude', 'codex', 'gemini', 'deepseek', 'qwen', 'glm', 'grok'].indexOf(motherType);
  const startX = 20 + (motherIndex % 4) * 15;
  const startY = 15 + Math.floor(motherIndex / 4) * 20;
  const offsetX = (index % 10) * 2;
  const offsetY = Math.floor(index / 10) * 2;

  // Determine personality: use configured weights or LLM-generated
  let personality: PersonalityTrait = child.personality;
  if (useConfiguredPersonalities) {
    // Use global index to ensure different seeds for different agents across all mothers
    const seed = CONFIG.simulation.randomSeed + index;
    personality = selectRandomPersonality(seed);
  }

  return {
    llmType: motherType,
    name: child.name,
    color: baseColor,
    startX: startX + offsetX,
    startY: startY + offsetY,
    personality,
  };
}

/**
 * Spawn world with genesis meta-generation.
 * LLM mothers generate child agents before simulation begins.
 *
 * @param config - Genesis spawn configuration
 * @returns Genesis results for analytics
 */
export async function spawnWorldWithGenesis(
  config: GenesisSpawnConfiguration
): Promise<{
  genesisResults: GenesisResult[];
  totalAgents: number;
}> {
  const genesisConfig = config.genesis ?? DEFAULT_GENESIS_CONFIG;

  if (!genesisConfig.enabled) {
    console.log('[Spawner] Genesis disabled, using standard spawn');
    await spawnWorldWithConfig(config);
    return { genesisResults: [], totalAgents: 0 };
  }

  console.log('[Spawner] Starting Genesis Phase...');
  console.log(`[Spawner] Mothers: ${genesisConfig.mothers.join(', ')}`);
  console.log(`[Spawner] Children per mother: ${genesisConfig.childrenPerMother}`);

  // Choose invoker (mock for testing, production for real)
  const invoker: LLMInvoker = config.useMockGenesis
    ? createDiverseMockInvoker()
    : createProductionInvoker();

  // Generate children from all mothers (with or without cache)
  const useCache = config.useGenesisCache !== false; // Default to true
  const genesisResults = useCache
    ? await generateChildrenFromAllMothersCached(genesisConfig, invoker)
    : await generateChildrenFromAllMothers(genesisConfig, invoker);

  if (genesisResults.length === 0) {
    console.error('[Spawner] Genesis failed - no results from mothers');
    throw new Error('Genesis generation failed for all mothers');
  }

  // Convert genesis results to agent configs
  const agentConfigs: AgentConfig[] = [];
  let globalIndex = 0; // Track global index for unique personality seeds

  for (const result of genesisResults) {
    console.log(`[Spawner] ${result.motherType}: ${result.children.length} children generated`);

    for (let i = 0; i < result.children.length; i++) {
      const child = result.children[i];
      const agentConfig = childToAgentConfig(
        child,
        result.motherType,
        globalIndex,
        genesisConfig.useConfiguredPersonalities
      );

      // Store additional genesis metadata in agent (via extended backstory)
      agentConfigs.push(agentConfig);
      globalIndex++;
    }
  }

  console.log(`[Spawner] Total agents from genesis: ${agentConfigs.length}`);

  // Spawn world with generated agents
  const spawnConfig: SpawnConfiguration = {
    ...config,
    agents: agentConfigs,
    enablePersonalities: true, // Genesis children have personalities
    includeBaselineAgents: config.includeBaselineAgents ?? false,
  };

  await spawnWorldWithConfig(spawnConfig);

  // Log genesis summary
  console.log('[Spawner] Genesis Phase Complete');
  for (const result of genesisResults) {
    console.log(`  ${result.motherType}:`);
    console.log(`    Children: ${result.children.length}`);
    console.log(`    Diversity: ${result.metadata.diversityScore.toFixed(2)}`);
    console.log(`    Latency: ${result.metadata.latencyMs}ms`);
  }

  return {
    genesisResults,
    totalAgents: agentConfigs.length,
  };
}

/**
 * Reset world with genesis configuration.
 */
export async function resetWorldWithGenesis(
  config: GenesisSpawnConfiguration
): Promise<{
  genesisResults: GenesisResult[];
  totalAgents: number;
}> {
  await clearWorld();
  return spawnWorldWithGenesis(config);
}
