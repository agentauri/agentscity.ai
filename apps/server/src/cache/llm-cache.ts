/**
 * LLM Response Cache
 *
 * Caches LLM responses based on observation hash to reduce API costs.
 * Uses Redis as the backend with configurable TTL.
 */

import { redis } from './index';
import type { AgentObservation, AgentDecision } from '../llm/types';
import { createHash } from 'crypto';

// =============================================================================
// Configuration
// =============================================================================

export interface LLMCacheConfig {
  /** Enable/disable caching */
  enabled: boolean;
  /** Time-to-live in seconds (default: 300 = 5 minutes) */
  ttlSeconds: number;
  /** Redis key prefix */
  keyPrefix: string;
}

const DEFAULT_CONFIG: LLMCacheConfig = {
  enabled: true,
  ttlSeconds: 300,
  keyPrefix: 'llm-cache:',
};

let config: LLMCacheConfig = { ...DEFAULT_CONFIG };

// =============================================================================
// Cache Statistics
// =============================================================================

interface CacheStats {
  hits: number;
  misses: number;
  writes: number;
  errors: number;
  lastReset: number;
}

const stats: CacheStats = {
  hits: 0,
  misses: 0,
  writes: 0,
  errors: 0,
  lastReset: Date.now(),
};

// =============================================================================
// Observation Hashing
// =============================================================================

/**
 * Extract cache-relevant fields from observation.
 * We hash a subset of the observation to balance cache hit rate with freshness.
 *
 * Included in hash:
 * - Agent state (hunger, energy, health, balance) - rounded to reduce variance
 * - Agent position (x, y)
 * - Nearby entities (sorted for consistency)
 * - Inventory
 *
 * Excluded from hash:
 * - Tick number (changes every tick)
 * - Timestamp (changes constantly)
 * - Recent events (too variable)
 * - Agent ID (we want cache sharing across agents in similar situations)
 */
function extractCacheableObservation(obs: AgentObservation): object {
  // Round numeric values to reduce variance (e.g., 73.5 -> 70, 76.2 -> 75)
  const roundToFive = (n: number) => Math.round(n / 5) * 5;

  return {
    // Self state (rounded for cache efficiency)
    self: {
      x: obs.self.x,
      y: obs.self.y,
      hunger: roundToFive(obs.self.hunger),
      energy: roundToFive(obs.self.energy),
      health: roundToFive(obs.self.health),
      balance: roundToFive(obs.self.balance),
      state: obs.self.state,
    },

    // Nearby agents (sorted by ID for consistency)
    nearbyAgents: obs.nearbyAgents
      .map((a) => ({
        x: a.x,
        y: a.y,
        state: a.state,
      }))
      .sort((a, b) => `${a.x},${a.y}`.localeCompare(`${b.x},${b.y}`)),

    // Nearby resource spawns (sorted)
    nearbyResourceSpawns: (obs.nearbyResourceSpawns || [])
      .map((r) => ({
        x: r.x,
        y: r.y,
        resourceType: r.resourceType,
        hasResources: r.currentAmount > 0,
      }))
      .sort((a, b) => `${a.x},${a.y}`.localeCompare(`${b.x},${b.y}`)),

    // Nearby shelters (sorted)
    nearbyShelters: (obs.nearbyShelters || [])
      .map((s) => ({
        x: s.x,
        y: s.y,
        canSleep: s.canSleep,
      }))
      .sort((a, b) => `${a.x},${a.y}`.localeCompare(`${b.x},${b.y}`)),

    // Inventory (sorted by type)
    inventory: (obs.inventory || [])
      .map((i) => ({
        type: i.type,
        quantity: i.quantity > 0 ? Math.min(i.quantity, 10) : 0, // Cap quantity for cache
      }))
      .sort((a, b) => a.type.localeCompare(b.type)),
  };
}

/**
 * Generate a hash key for an observation.
 * The hash is deterministic and based on cache-relevant fields only.
 */
export function hashObservation(obs: AgentObservation): string {
  const cacheable = extractCacheableObservation(obs);
  const json = JSON.stringify(cacheable);
  return createHash('sha256').update(json).digest('hex').substring(0, 16);
}

/**
 * Generate the full Redis key for a cache entry.
 */
function getCacheKey(observationHash: string, llmType: string): string {
  return `${config.keyPrefix}${llmType}:${observationHash}`;
}

// =============================================================================
// Cache Operations
// =============================================================================

/**
 * Check if a cached response exists for the given observation.
 * Returns the cached decision if found, null otherwise.
 */
export async function getCachedResponse(
  obs: AgentObservation,
  llmType: string
): Promise<AgentDecision | null> {
  if (!config.enabled) {
    return null;
  }

  try {
    const hash = hashObservation(obs);
    const key = getCacheKey(hash, llmType);
    const cached = await redis.get(key);

    if (cached) {
      stats.hits++;
      console.log(`[LLM-Cache] HIT for ${llmType} (hash: ${hash.substring(0, 8)})`);
      return JSON.parse(cached) as AgentDecision;
    }

    stats.misses++;
    console.log(`[LLM-Cache] MISS for ${llmType} (hash: ${hash.substring(0, 8)})`);
    return null;
  } catch (error) {
    stats.errors++;
    console.error('[LLM-Cache] Error reading cache:', error);
    return null;
  }
}

/**
 * Store a response in the cache.
 */
export async function cacheResponse(
  obs: AgentObservation,
  llmType: string,
  decision: AgentDecision
): Promise<void> {
  if (!config.enabled) {
    return;
  }

  try {
    const hash = hashObservation(obs);
    const key = getCacheKey(hash, llmType);
    const value = JSON.stringify(decision);

    await redis.setex(key, config.ttlSeconds, value);
    stats.writes++;
    console.log(`[LLM-Cache] STORED for ${llmType} (hash: ${hash.substring(0, 8)}, TTL: ${config.ttlSeconds}s)`);
  } catch (error) {
    stats.errors++;
    console.error('[LLM-Cache] Error writing cache:', error);
  }
}

// =============================================================================
// Configuration Management
// =============================================================================

/**
 * Update cache configuration at runtime.
 */
export function setLLMCacheConfig(newConfig: Partial<LLMCacheConfig>): void {
  config = { ...config, ...newConfig };
  console.log('[LLM-Cache] Configuration updated:', config);
}

/**
 * Get current cache configuration.
 */
export function getLLMCacheConfig(): LLMCacheConfig {
  return { ...config };
}

/**
 * Enable or disable the cache.
 */
export function setLLMCacheEnabled(enabled: boolean): void {
  config.enabled = enabled;
  console.log(`[LLM-Cache] Cache ${enabled ? 'ENABLED' : 'DISABLED'}`);
}

/**
 * Set the TTL for cached entries.
 */
export function setLLMCacheTTL(ttlSeconds: number): void {
  config.ttlSeconds = ttlSeconds;
  console.log(`[LLM-Cache] TTL set to ${ttlSeconds}s`);
}

// =============================================================================
// Statistics
// =============================================================================

/**
 * Get cache statistics.
 */
export function getLLMCacheStats(): CacheStats & { hitRate: number; config: LLMCacheConfig } {
  const total = stats.hits + stats.misses;
  const hitRate = total > 0 ? stats.hits / total : 0;

  return {
    ...stats,
    hitRate,
    config,
  };
}

/**
 * Reset cache statistics.
 */
export function resetLLMCacheStats(): void {
  stats.hits = 0;
  stats.misses = 0;
  stats.writes = 0;
  stats.errors = 0;
  stats.lastReset = Date.now();
  console.log('[LLM-Cache] Statistics reset');
}

/**
 * Clear all cached LLM responses.
 */
export async function clearLLMCache(): Promise<number> {
  try {
    const pattern = `${config.keyPrefix}*`;
    const keys = await redis.keys(pattern);

    if (keys.length > 0) {
      await redis.del(...keys);
    }

    console.log(`[LLM-Cache] Cleared ${keys.length} cached entries`);
    return keys.length;
  } catch (error) {
    console.error('[LLM-Cache] Error clearing cache:', error);
    return 0;
  }
}

/**
 * Get the number of cached entries.
 */
export async function getLLMCacheSize(): Promise<number> {
  try {
    const pattern = `${config.keyPrefix}*`;
    const keys = await redis.keys(pattern);
    return keys.length;
  } catch (error) {
    console.error('[LLM-Cache] Error getting cache size:', error);
    return 0;
  }
}

// =============================================================================
// Initialization
// =============================================================================

/**
 * Initialize the LLM cache from environment variables.
 */
export function initLLMCacheFromEnv(): void {
  const enabled = process.env.LLM_CACHE_ENABLED !== 'false';
  const ttl = parseInt(process.env.LLM_CACHE_TTL_SECONDS || '300', 10);

  config = {
    enabled,
    ttlSeconds: isNaN(ttl) ? 300 : ttl,
    keyPrefix: process.env.LLM_CACHE_PREFIX || 'llm-cache:',
  };

  console.log('[LLM-Cache] Initialized from environment:', config);
}

// Initialize on module load
initLLMCacheFromEnv();
