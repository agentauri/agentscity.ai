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

// =============================================================================
// Agent Configurations
// =============================================================================

export interface AgentConfig {
  llmType: LLMType;
  name: string;
  color: string;
  startX: number;
  startY: number;
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
// Resource Spawn Configurations (Sugarscape-style)
// =============================================================================

export interface ResourceSpawnConfig {
  resourceType: 'food' | 'energy' | 'material';
  x: number;
  y: number;
  maxAmount: number;
  regenRate: number;
}

// Resources distributed geographically - no functional labels
// This creates "resource mountains" like Sugarscape
const RESOURCE_SPAWN_CONFIGS: ResourceSpawnConfig[] = [
  // Food cluster (northwest area)
  { resourceType: 'food', x: 20, y: 15, maxAmount: 20, regenRate: 1.0 },
  { resourceType: 'food', x: 22, y: 16, maxAmount: 15, regenRate: 0.8 },
  { resourceType: 'food', x: 18, y: 18, maxAmount: 15, regenRate: 0.8 },
  { resourceType: 'food', x: 24, y: 14, maxAmount: 10, regenRate: 0.5 },

  // Food cluster (southeast area)
  { resourceType: 'food', x: 45, y: 40, maxAmount: 20, regenRate: 1.0 },
  { resourceType: 'food', x: 47, y: 42, maxAmount: 15, regenRate: 0.8 },
  { resourceType: 'food', x: 43, y: 38, maxAmount: 10, regenRate: 0.5 },

  // Energy cluster (northeast area)
  { resourceType: 'energy', x: 50, y: 10, maxAmount: 15, regenRate: 0.6 },
  { resourceType: 'energy', x: 52, y: 12, maxAmount: 12, regenRate: 0.5 },
  { resourceType: 'energy', x: 48, y: 8, maxAmount: 10, regenRate: 0.4 },

  // Energy cluster (southwest area)
  { resourceType: 'energy', x: 10, y: 45, maxAmount: 15, regenRate: 0.6 },
  { resourceType: 'energy', x: 12, y: 47, maxAmount: 12, regenRate: 0.5 },

  // Material cluster (center)
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

  console.log('[Spawner] Spawning resource spawns...');

  for (const config of RESOURCE_SPAWN_CONFIGS) {
    const spawn: NewResourceSpawn = {
      id: uuid(),
      x: config.x,
      y: config.y,
      resourceType: config.resourceType,
      maxAmount: config.maxAmount,
      currentAmount: config.maxAmount, // Start full
      regenRate: config.regenRate,
    };

    await createResourceSpawn(spawn);

    const emoji = config.resourceType === 'food' ? '🍎' : config.resourceType === 'energy' ? '⚡' : '🪵';
    console.log(`  ${emoji} ${config.resourceType} spawn at (${config.x}, ${config.y}) - max ${config.maxAmount}`);
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

  console.log('[Spawner] Spawning 7 MVP agents...');

  // Scarcity mode: reduced starting resources to encourage emergent behavior
  const startingFood = 1; // Reduced from 3 to create urgency

  for (const agentConfig of AGENT_CONFIGS) {
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
    };

    await createAgent(agent);

    // Give starting inventory (reduced for scarcity)
    await addToInventory(agent.id, 'food', startingFood);

    console.log(`  ✅ ${agentConfig.name} (${agentConfig.llmType}) spawned at (${agentConfig.startX}, ${agentConfig.startY}) with ${startingFood} food`);
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
  };
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
  const agents = config?.agents ?? AGENT_CONFIGS;
  const resourceSpawns = config?.resourceSpawns ?? RESOURCE_SPAWN_CONFIGS;
  const shelters = config?.shelters ?? SHELTER_CONFIGS;
  const startingFood = config?.startingFood ?? 1;

  console.log(`[Spawner] Spawning world with custom config: ${agents.length} agents, ${resourceSpawns.length} resources, ${shelters.length} shelters`);

  // Spawn resource spawns
  for (const rsConfig of resourceSpawns) {
    const spawn: NewResourceSpawn = {
      id: uuid(),
      x: rsConfig.x,
      y: rsConfig.y,
      resourceType: rsConfig.resourceType,
      maxAmount: rsConfig.maxAmount,
      currentAmount: rsConfig.maxAmount,
      regenRate: rsConfig.regenRate,
    };
    await createResourceSpawn(spawn);
  }
  console.log(`  ✅ ${resourceSpawns.length} resource spawns created`);

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

  // Spawn agents
  for (const agentConfig of agents) {
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
    };

    await createAgent(agent);
    await addToInventory(agent.id, 'food', startingFood);

    console.log(`  ✅ ${agentConfig.name} (${agentConfig.llmType}) spawned`);
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
