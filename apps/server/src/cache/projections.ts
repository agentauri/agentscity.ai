/**
 * Cached world state projections
 * Redis is used for fast reads of current world state
 */

import { redis } from './index';
import type { Agent, Location } from '../db/schema';

const KEYS = {
  WORLD_STATE: 'world:state',
  AGENTS: 'world:agents',
  AGENT: (id: string) => `agent:${id}`,
  LOCATIONS: 'world:locations',
  LOCATION: (id: string) => `location:${id}`,
  TICK: 'world:tick',
} as const;

const TTL = 3600; // 1 hour cache TTL

// World State
export interface CachedWorldState {
  tick: number;
  timestamp: number;
  agentCount: number;
  isPaused: boolean;
}

export async function setCachedWorldState(state: CachedWorldState): Promise<void> {
  await redis.setex(KEYS.WORLD_STATE, TTL, JSON.stringify(state));
}

export async function getCachedWorldState(): Promise<CachedWorldState | null> {
  const data = await redis.get(KEYS.WORLD_STATE);
  return data ? JSON.parse(data) : null;
}

// Current Tick
export async function setCachedTick(tick: number): Promise<void> {
  await redis.set(KEYS.TICK, tick.toString());
}

export async function getCachedTick(): Promise<number> {
  const tick = await redis.get(KEYS.TICK);
  return tick ? parseInt(tick, 10) : 0;
}

// Agents
export async function setCachedAgent(agent: Agent): Promise<void> {
  await redis.hset(KEYS.AGENTS, agent.id, JSON.stringify(agent));
  await redis.setex(KEYS.AGENT(agent.id), TTL, JSON.stringify(agent));
}

export async function getCachedAgent(id: string): Promise<Agent | null> {
  const data = await redis.hget(KEYS.AGENTS, id);
  return data ? JSON.parse(data) : null;
}

export async function getAllCachedAgents(): Promise<Agent[]> {
  const data = await redis.hgetall(KEYS.AGENTS);
  return Object.values(data).map((json) => JSON.parse(json));
}

export async function removeCachedAgent(id: string): Promise<void> {
  await redis.hdel(KEYS.AGENTS, id);
  await redis.del(KEYS.AGENT(id));
}

// Locations
export async function setCachedLocation(location: Location): Promise<void> {
  await redis.hset(KEYS.LOCATIONS, location.id, JSON.stringify(location));
}

export async function getCachedLocation(id: string): Promise<Location | null> {
  const data = await redis.hget(KEYS.LOCATIONS, id);
  return data ? JSON.parse(data) : null;
}

export async function getAllCachedLocations(): Promise<Location[]> {
  const data = await redis.hgetall(KEYS.LOCATIONS);
  return Object.values(data).map((json) => JSON.parse(json));
}

// Bulk operations
export async function setCachedAgents(agents: Agent[]): Promise<void> {
  if (agents.length === 0) return;
  const pipeline = redis.pipeline();
  for (const agent of agents) {
    pipeline.hset(KEYS.AGENTS, agent.id, JSON.stringify(agent));
  }
  await pipeline.exec();
}

export async function setCachedLocations(locations: Location[]): Promise<void> {
  if (locations.length === 0) return;
  const pipeline = redis.pipeline();
  for (const location of locations) {
    pipeline.hset(KEYS.LOCATIONS, location.id, JSON.stringify(location));
  }
  await pipeline.exec();
}

// Clear cache
export async function clearCache(): Promise<void> {
  const keys = await redis.keys('world:*');
  const agentKeys = await redis.keys('agent:*');
  const locationKeys = await redis.keys('location:*');
  const allKeys = [...keys, ...agentKeys, ...locationKeys];
  if (allKeys.length > 0) {
    await redis.del(...allKeys);
  }
}
