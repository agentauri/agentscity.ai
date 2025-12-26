/**
 * Agent Spawner - Initialize the 6 MVP agents
 */

import { v4 as uuid } from 'uuid';
import { createAgent, getAllAgents } from '../db/queries/agents';
import { createLocation, getAllLocations } from '../db/queries/world';
import type { NewAgent, NewLocation } from '../db/schema';
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
  { llmType: 'claude', name: 'Claude', color: '#ef4444', startX: 10, startY: 10 },
  { llmType: 'codex', name: 'Codex', color: '#3b82f6', startX: 20, startY: 10 },
  { llmType: 'gemini', name: 'Gemini', color: '#10b981', startX: 30, startY: 10 },
  { llmType: 'deepseek', name: 'DeepSeek', color: '#f59e0b', startX: 40, startY: 10 },
  { llmType: 'qwen', name: 'Qwen', color: '#8b5cf6', startX: 50, startY: 10 },
  { llmType: 'glm', name: 'GLM', color: '#ec4899', startX: 60, startY: 10 },
];

// =============================================================================
// Location Configurations
// =============================================================================

interface LocationConfig {
  name: string;
  type: 'residential' | 'commercial' | 'industrial' | 'civic';
  x: number;
  y: number;
}

const LOCATION_CONFIGS: LocationConfig[] = [
  // Central civic area
  { name: 'City Hall', type: 'civic', x: 50, y: 50 },
  { name: 'Town Square', type: 'civic', x: 50, y: 48 },

  // Commercial district
  { name: 'Food Market', type: 'commercial', x: 45, y: 45 },
  { name: 'General Store', type: 'commercial', x: 55, y: 45 },
  { name: 'Medicine Shop', type: 'commercial', x: 50, y: 42 },

  // Industrial zone
  { name: 'Factory A', type: 'industrial', x: 30, y: 30 },
  { name: 'Factory B', type: 'industrial', x: 35, y: 30 },
  { name: 'Workshop', type: 'industrial', x: 70, y: 30 },

  // Residential areas
  { name: 'North Housing', type: 'residential', x: 50, y: 20 },
  { name: 'East Housing', type: 'residential', x: 70, y: 50 },
  { name: 'West Housing', type: 'residential', x: 30, y: 50 },
  { name: 'South Housing', type: 'residential', x: 50, y: 80 },
];

// =============================================================================
// Spawning Functions
// =============================================================================

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
    console.log(`  ✅ ${config.name} (${config.llmType}) spawned at (${config.startX}, ${config.startY})`);
  }

  console.log('[Spawner] All agents spawned');
}

/**
 * Spawn initial locations (if not already present)
 */
export async function spawnInitialLocations(): Promise<void> {
  const existingLocations = await getAllLocations();

  if (existingLocations.length > 0) {
    console.log(`[Spawner] ${existingLocations.length} locations already exist, skipping spawn`);
    return;
  }

  console.log('[Spawner] Spawning locations...');

  for (const config of LOCATION_CONFIGS) {
    const location: NewLocation = {
      id: uuid(),
      name: config.name,
      type: config.type,
      x: config.x,
      y: config.y,
    };

    await createLocation(location);
    console.log(`  📍 ${config.name} (${config.type}) at (${config.x}, ${config.y})`);
  }

  console.log('[Spawner] All locations spawned');
}

/**
 * Spawn all initial entities
 */
export async function spawnWorld(): Promise<void> {
  await spawnInitialLocations();
  await spawnInitialAgents();
}

/**
 * Reset world (delete all agents and locations, respawn)
 */
export async function resetWorld(): Promise<void> {
  console.log('[Spawner] Resetting world...');

  // Note: In production, you'd want to handle this more carefully
  // For MVP, we just rely on fresh database

  await spawnWorld();
}
