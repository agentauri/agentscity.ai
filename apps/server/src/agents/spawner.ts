/**
 * World Spawner - Initialize agents, resource spawns, and shelters
 *
 * Scientific Model:
 * - No predefined location types (commercial, residential, etc.)
 * - Resources are geographically distributed (Sugarscape-style)
 * - Shelters are generic structures (agents decide function)
 */

import { v4 as uuid } from 'uuid';
import { createAgent, getAllAgents } from '../db/queries/agents';
import {
  getAllShelters,
  createShelter,
  getAllResourceSpawns,
  createResourceSpawn,
} from '../db/queries/world';
import { addToInventory } from '../db/queries/inventory';
import type { NewAgent, NewShelter, NewResourceSpawn } from '../db/schema';
import type { LLMType } from '../llm/types';

// =============================================================================
// Agent Configurations
// =============================================================================

interface AgentConfig {
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
];

// =============================================================================
// Resource Spawn Configurations (Sugarscape-style)
// =============================================================================

interface ResourceSpawnConfig {
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

interface ShelterConfig {
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

  console.log('[Spawner] Spawning 6 MVP agents...');

  for (const config of AGENT_CONFIGS) {
    const agent: NewAgent = {
      id: uuid(),
      llmType: config.llmType,
      x: config.startX,
      y: config.startY,
      hunger: 100,
      energy: 100,
      health: 100,
      balance: 100, // Starting balance
      state: 'idle',
      color: config.color,
    };

    await createAgent(agent);

    // Give starting inventory (3 food to survive initial ticks)
    await addToInventory(agent.id, 'food', 3);

    console.log(`  ✅ ${config.name} (${config.llmType}) spawned at (${config.startX}, ${config.startY}) with 3 food`);
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
