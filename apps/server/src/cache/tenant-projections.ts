/**
 * Tenant-Scoped Cached World State Projections
 *
 * Redis is used for fast reads of current world state.
 * All keys are prefixed with tenant ID for isolation.
 */

import { redis } from './index';
import type { Agent, Shelter, ResourceSpawn } from '../db/schema';

// =============================================================================
// Key Generators (Tenant-Scoped)
// =============================================================================

const KEYS = {
  WORLD_STATE: (tenantId: string) => `tenant:${tenantId}:world:state`,
  AGENTS: (tenantId: string) => `tenant:${tenantId}:world:agents`,
  AGENT: (tenantId: string, agentId: string) => `tenant:${tenantId}:agent:${agentId}`,
  SHELTERS: (tenantId: string) => `tenant:${tenantId}:world:shelters`,
  SHELTER: (tenantId: string, shelterId: string) => `tenant:${tenantId}:shelter:${shelterId}`,
  RESOURCES: (tenantId: string) => `tenant:${tenantId}:world:resources`,
  RESOURCE: (tenantId: string, resourceId: string) => `tenant:${tenantId}:resource:${resourceId}`,
  TICK: (tenantId: string) => `tenant:${tenantId}:world:tick`,
} as const;

const TTL = 3600; // 1 hour cache TTL

// =============================================================================
// Tenant World State
// =============================================================================

export interface CachedTenantWorldState {
  tick: number;
  timestamp: number;
  agentCount: number;
  isPaused: boolean;
}

export async function setCachedTenantWorldState(
  tenantId: string,
  state: CachedTenantWorldState
): Promise<void> {
  await redis.setex(KEYS.WORLD_STATE(tenantId), TTL, JSON.stringify(state));
}

export async function getCachedTenantWorldState(
  tenantId: string
): Promise<CachedTenantWorldState | null> {
  const data = await redis.get(KEYS.WORLD_STATE(tenantId));
  return data ? JSON.parse(data) : null;
}

// =============================================================================
// Tenant Tick
// =============================================================================

export async function setCachedTenantTick(tenantId: string, tick: number): Promise<void> {
  await redis.set(KEYS.TICK(tenantId), tick.toString());
}

export async function getCachedTenantTick(tenantId: string): Promise<number> {
  const tick = await redis.get(KEYS.TICK(tenantId));
  return tick ? parseInt(tick, 10) : 0;
}

// =============================================================================
// Tenant Agents
// =============================================================================

export async function setCachedTenantAgent(
  tenantId: string,
  agent: Agent
): Promise<void> {
  await redis.hset(KEYS.AGENTS(tenantId), agent.id, JSON.stringify(agent));
  await redis.setex(KEYS.AGENT(tenantId, agent.id), TTL, JSON.stringify(agent));
}

export async function getCachedTenantAgent(
  tenantId: string,
  agentId: string
): Promise<Agent | null> {
  const data = await redis.hget(KEYS.AGENTS(tenantId), agentId);
  return data ? JSON.parse(data) : null;
}

export async function getAllCachedTenantAgents(tenantId: string): Promise<Agent[]> {
  const data = await redis.hgetall(KEYS.AGENTS(tenantId));
  return Object.values(data).map((json) => JSON.parse(json));
}

export async function removeCachedTenantAgent(
  tenantId: string,
  agentId: string
): Promise<void> {
  await redis.hdel(KEYS.AGENTS(tenantId), agentId);
  await redis.del(KEYS.AGENT(tenantId, agentId));
}

export async function setCachedTenantAgents(
  tenantId: string,
  agents: Agent[]
): Promise<void> {
  if (agents.length === 0) {
    // Clear existing agents
    await redis.del(KEYS.AGENTS(tenantId));
    return;
  }

  const pipeline = redis.pipeline();

  // Clear existing agents first
  pipeline.del(KEYS.AGENTS(tenantId));

  // Add all agents
  for (const agent of agents) {
    pipeline.hset(KEYS.AGENTS(tenantId), agent.id, JSON.stringify(agent));
  }

  await pipeline.exec();
}

// =============================================================================
// Tenant Shelters
// =============================================================================

export async function setCachedTenantShelter(
  tenantId: string,
  shelter: Shelter
): Promise<void> {
  await redis.hset(KEYS.SHELTERS(tenantId), shelter.id, JSON.stringify(shelter));
}

export async function getCachedTenantShelter(
  tenantId: string,
  shelterId: string
): Promise<Shelter | null> {
  const data = await redis.hget(KEYS.SHELTERS(tenantId), shelterId);
  return data ? JSON.parse(data) : null;
}

export async function getAllCachedTenantShelters(tenantId: string): Promise<Shelter[]> {
  const data = await redis.hgetall(KEYS.SHELTERS(tenantId));
  return Object.values(data).map((json) => JSON.parse(json));
}

export async function setCachedTenantShelters(
  tenantId: string,
  shelters: Shelter[]
): Promise<void> {
  if (shelters.length === 0) {
    await redis.del(KEYS.SHELTERS(tenantId));
    return;
  }

  const pipeline = redis.pipeline();
  pipeline.del(KEYS.SHELTERS(tenantId));

  for (const shelter of shelters) {
    pipeline.hset(KEYS.SHELTERS(tenantId), shelter.id, JSON.stringify(shelter));
  }

  await pipeline.exec();
}

// =============================================================================
// Tenant Resources
// =============================================================================

export async function setCachedTenantResource(
  tenantId: string,
  resource: ResourceSpawn
): Promise<void> {
  await redis.hset(KEYS.RESOURCES(tenantId), resource.id, JSON.stringify(resource));
}

export async function getCachedTenantResource(
  tenantId: string,
  resourceId: string
): Promise<ResourceSpawn | null> {
  const data = await redis.hget(KEYS.RESOURCES(tenantId), resourceId);
  return data ? JSON.parse(data) : null;
}

export async function getAllCachedTenantResources(tenantId: string): Promise<ResourceSpawn[]> {
  const data = await redis.hgetall(KEYS.RESOURCES(tenantId));
  return Object.values(data).map((json) => JSON.parse(json));
}

export async function setCachedTenantResources(
  tenantId: string,
  resources: ResourceSpawn[]
): Promise<void> {
  if (resources.length === 0) {
    await redis.del(KEYS.RESOURCES(tenantId));
    return;
  }

  const pipeline = redis.pipeline();
  pipeline.del(KEYS.RESOURCES(tenantId));

  for (const resource of resources) {
    pipeline.hset(KEYS.RESOURCES(tenantId), resource.id, JSON.stringify(resource));
  }

  await pipeline.exec();
}

// =============================================================================
// Clear Tenant Cache
// =============================================================================

/**
 * Clear all cache for a specific tenant
 */
export async function clearTenantCache(tenantId: string): Promise<void> {
  const pattern = `tenant:${tenantId}:*`;
  const keys = await redis.keys(pattern);

  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

/**
 * Clear all tenant caches (for full system reset)
 */
export async function clearAllTenantCaches(): Promise<void> {
  const keys = await redis.keys('tenant:*');

  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

// =============================================================================
// Cache Statistics
// =============================================================================

export interface TenantCacheStats {
  tenantId: string;
  agentCount: number;
  shelterCount: number;
  resourceCount: number;
  currentTick: number;
  hasWorldState: boolean;
}

export async function getTenantCacheStats(tenantId: string): Promise<TenantCacheStats> {
  const [agentCount, shelterCount, resourceCount, tick, worldState] = await Promise.all([
    redis.hlen(KEYS.AGENTS(tenantId)),
    redis.hlen(KEYS.SHELTERS(tenantId)),
    redis.hlen(KEYS.RESOURCES(tenantId)),
    getCachedTenantTick(tenantId),
    redis.exists(KEYS.WORLD_STATE(tenantId)),
  ]);

  return {
    tenantId,
    agentCount,
    shelterCount,
    resourceCount,
    currentTick: tick,
    hasWorldState: worldState === 1,
  };
}
