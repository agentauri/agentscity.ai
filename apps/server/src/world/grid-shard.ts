/**
 * Grid Sharding for Large Worlds
 *
 * Phase 3: Async Architecture Scale
 *
 * Partitions the world grid into shards for parallel processing.
 * Agents in different shards can be processed concurrently without
 * conflicts, as long as they don't interact across shard boundaries.
 *
 * Key Features:
 * - Spatial partitioning into N x N shards
 * - Agent grouping by shard
 * - Parallel shard processing
 * - Boundary agent handling
 */

import type { Agent } from '../db/schema';
import { CONFIG } from '../config';

// =============================================================================
// Types
// =============================================================================

export interface ShardConfig {
  gridWidth: number;
  gridHeight: number;
  shardCount: number; // Number of shards per dimension (e.g., 2 = 4 total shards)
}

export interface Shard {
  id: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface ShardedAgents {
  shard: Shard;
  agents: Array<{ id: string; x: number; y: number; llmType: string }>;
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_SHARD_COUNT = 2; // 2x2 = 4 shards for 100x100 grid

// =============================================================================
// Internal Helpers
// =============================================================================

interface ResolvedShardConfig {
  gridWidth: number;
  gridHeight: number;
  shardCount: number;
  shardWidth: number;
  shardHeight: number;
}

/**
 * Resolve shard config with defaults and compute derived values.
 */
function resolveConfig(config?: Partial<ShardConfig>): ResolvedShardConfig {
  const gridWidth = config?.gridWidth ?? CONFIG.simulation.gridSize;
  const gridHeight = config?.gridHeight ?? CONFIG.simulation.gridSize;
  const shardCount = config?.shardCount ?? DEFAULT_SHARD_COUNT;
  const shardWidth = Math.ceil(gridWidth / shardCount);
  const shardHeight = Math.ceil(gridHeight / shardCount);

  return { gridWidth, gridHeight, shardCount, shardWidth, shardHeight };
}

// =============================================================================
// Shard Utilities
// =============================================================================

/**
 * Calculate which shard a position belongs to.
 *
 * Grid is divided into shardCount x shardCount shards.
 * For a 100x100 grid with shardCount=2:
 * - Shard 0: (0,0) to (49,49)   [NW]
 * - Shard 1: (50,0) to (99,49)  [NE]
 * - Shard 2: (0,50) to (49,99)  [SW]
 * - Shard 3: (50,50) to (99,99) [SE]
 */
export function getShardForPosition(
  x: number,
  y: number,
  config?: Partial<ShardConfig>
): number {
  const { shardCount, shardWidth, shardHeight } = resolveConfig(config);

  const shardX = Math.min(shardCount - 1, Math.floor(x / shardWidth));
  const shardY = Math.min(shardCount - 1, Math.floor(y / shardHeight));

  return shardY * shardCount + shardX;
}

/**
 * Get all shards for a given configuration.
 */
export function getAllShards(config?: Partial<ShardConfig>): Shard[] {
  const { gridWidth, gridHeight, shardCount, shardWidth, shardHeight } = resolveConfig(config);
  const shards: Shard[] = [];

  for (let sy = 0; sy < shardCount; sy++) {
    for (let sx = 0; sx < shardCount; sx++) {
      const id = sy * shardCount + sx;
      shards.push({
        id,
        minX: sx * shardWidth,
        maxX: Math.min((sx + 1) * shardWidth - 1, gridWidth - 1),
        minY: sy * shardHeight,
        maxY: Math.min((sy + 1) * shardHeight - 1, gridHeight - 1),
      });
    }
  }

  return shards;
}

/**
 * Group agents by their shard.
 */
export function groupAgentsByShard<T extends { x: number; y: number }>(
  agents: T[],
  config?: Partial<ShardConfig>
): Map<number, T[]> {
  const grouped = new Map<number, T[]>();

  for (const agent of agents) {
    const shardId = getShardForPosition(agent.x, agent.y, config);

    if (!grouped.has(shardId)) {
      grouped.set(shardId, []);
    }
    grouped.get(shardId)!.push(agent);
  }

  return grouped;
}

/**
 * Get agents for a specific shard.
 */
export function getAgentsInShard<T extends { x: number; y: number }>(
  agents: T[],
  shardId: number,
  config?: Partial<ShardConfig>
): T[] {
  return agents.filter(a => getShardForPosition(a.x, a.y, config) === shardId);
}

/**
 * Check if an agent is near a shard boundary.
 * Boundary agents may interact with agents in neighboring shards.
 */
export function isNearShardBoundary(
  x: number,
  y: number,
  boundaryWidth: number = 3,
  config?: Partial<ShardConfig>
): boolean {
  const { shardCount, shardWidth, shardHeight } = resolveConfig(config);

  // Check if near vertical or horizontal boundaries
  for (let i = 1; i < shardCount; i++) {
    if (Math.abs(x - i * shardWidth) < boundaryWidth) return true;
    if (Math.abs(y - i * shardHeight) < boundaryWidth) return true;
  }

  return false;
}

/**
 * Get neighboring shard IDs for a given shard.
 */
export function getNeighboringShards(
  shardId: number,
  config?: Partial<ShardConfig>
): number[] {
  const { shardCount } = resolveConfig(config);
  const shardX = shardId % shardCount;
  const shardY = Math.floor(shardId / shardCount);
  const neighbors: number[] = [];

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;

      const nx = shardX + dx;
      const ny = shardY + dy;

      if (nx >= 0 && nx < shardCount && ny >= 0 && ny < shardCount) {
        neighbors.push(ny * shardCount + nx);
      }
    }
  }

  return neighbors;
}

// =============================================================================
// Parallel Processing
// =============================================================================

/**
 * Process agents by shard in parallel.
 *
 * This function groups agents by shard and processes each shard concurrently.
 * Results are collected and returned.
 *
 * @param agents - Agents to process
 * @param processor - Function to process agents in a shard
 * @param config - Shard configuration
 * @returns Combined results from all shards
 */
export async function processAgentsByShard<T extends { id: string; x: number; y: number }, R>(
  agents: T[],
  processor: (shardAgents: T[], shardId: number) => Promise<R[]>,
  config?: Partial<ShardConfig>
): Promise<R[]> {
  const byShardAgents = groupAgentsByShard(agents, config);

  // Process shards in parallel
  const shardResults = await Promise.all(
    Array.from(byShardAgents.entries()).map(async ([shardId, shardAgents]) => {
      return processor(shardAgents, shardId);
    })
  );

  // Flatten results
  return shardResults.flat();
}

/**
 * Process shards with rate limiting to prevent overwhelming LLM providers.
 *
 * @param agents - Agents to process
 * @param processor - Function to process agents in a shard
 * @param config - Shard configuration
 * @param delayBetweenShards - Delay in ms between processing shards
 * @returns Combined results from all shards
 */
export async function processAgentsByShardWithDelay<T extends { id: string; x: number; y: number }, R>(
  agents: T[],
  processor: (shardAgents: T[], shardId: number) => Promise<R[]>,
  config?: Partial<ShardConfig>,
  delayBetweenShards: number = 100
): Promise<R[]> {
  const byShardAgents = groupAgentsByShard(agents, config);
  const results: R[] = [];

  for (const [shardId, shardAgents] of byShardAgents.entries()) {
    const shardResults = await processor(shardAgents, shardId);
    results.push(...shardResults);

    // Delay between shards (except for last shard)
    if (delayBetweenShards > 0) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenShards));
    }
  }

  return results;
}

// =============================================================================
// Shard Statistics
// =============================================================================

export interface ShardStats {
  shardId: number;
  agentCount: number;
  boundaryAgentCount: number;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

/**
 * Get statistics for each shard.
 */
export function getShardStats<T extends { x: number; y: number }>(
  agents: T[],
  config?: Partial<ShardConfig>
): ShardStats[] {
  const shards = getAllShards(config);
  const grouped = groupAgentsByShard(agents, config);

  return shards.map(shard => {
    const shardAgents = grouped.get(shard.id) || [];
    const boundaryAgents = shardAgents.filter(a =>
      isNearShardBoundary(a.x, a.y, 3, config)
    );

    return {
      shardId: shard.id,
      agentCount: shardAgents.length,
      boundaryAgentCount: boundaryAgents.length,
      bounds: {
        minX: shard.minX,
        maxX: shard.maxX,
        minY: shard.minY,
        maxY: shard.maxY,
      },
    };
  });
}
