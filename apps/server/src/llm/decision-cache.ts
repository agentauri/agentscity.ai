/**
 * Decision Cache - Cache LLM decisions based on observation hash
 *
 * Uses SHA-256 hash of normalized observation to cache decisions.
 * Reduces redundant LLM calls when agents face similar situations.
 *
 * Normalization strategy:
 * - Round numeric values to reduce cache misses (hunger 45 == hunger 47)
 * - Sort arrays for consistent hashing
 * - Exclude timestamps and IDs that change each tick
 */

import { createHash } from 'crypto';
import Redis from 'ioredis';
import type { AgentDecision, AgentObservation } from './types';

// =============================================================================
// Configuration
// =============================================================================

/** Cache TTL in seconds (default: 5 minutes) */
const CACHE_TTL_SECONDS = parseInt(process.env.LLM_CACHE_TTL_SECONDS || '300', 10);

/** Enable/disable cache */
const CACHE_ENABLED = process.env.LLM_CACHE_ENABLED !== 'false';

/** Redis key prefix */
const CACHE_PREFIX = 'decision:';

/** Bucket size for numeric normalization (e.g., 10 means 45 and 47 hash to same value) */
const NUMERIC_BUCKET_SIZE = 10;

// =============================================================================
// Redis Connection
// =============================================================================

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }
  return redis;
}

// =============================================================================
// Observation Normalization
// =============================================================================

/**
 * Normalize a numeric value to reduce cache misses
 * Values within the same bucket will hash identically
 */
function normalizeNumber(value: number, bucketSize = NUMERIC_BUCKET_SIZE): number {
  return Math.floor(value / bucketSize) * bucketSize;
}

/**
 * Create a normalized version of the observation for hashing
 * This reduces minor variations that shouldn't affect the decision
 */
function normalizeObservation(obs: AgentObservation): Record<string, unknown> {
  return {
    // Self state (normalized)
    self: {
      hunger: normalizeNumber(obs.self.hunger),
      energy: normalizeNumber(obs.self.energy),
      health: normalizeNumber(obs.self.health),
      balance: normalizeNumber(obs.self.balance, 20), // Larger bucket for balance
      // Position matters for decisions
      x: obs.self.x,
      y: obs.self.y,
      state: obs.self.state,
      // Phase 5: Include personality in cache key
      personality: obs.self.personality ?? null,
    },

    // Inventory (sorted by type)
    inventory: obs.inventory
      ?.map((item) => ({
        type: item.type,
        quantity: normalizeNumber(item.quantity, 5),
      }))
      .sort((a, b) => a.type.localeCompare(b.type)) ?? [],

    // Nearby resources (sorted, limited to 5 closest)
    nearbyResources: obs.nearbyResourceSpawns
      ?.slice(0, 5)
      .map((r) => ({
        dx: r.x - obs.self.x,
        dy: r.y - obs.self.y,
        type: r.resourceType,
        hasAmount: r.currentAmount > 0,
      }))
      .sort((a, b) => Math.abs(a.dx) + Math.abs(a.dy) - (Math.abs(b.dx) + Math.abs(b.dy))) ?? [],

    // Nearby shelters (sorted, limited to 3 closest)
    nearbyShelters: obs.nearbyShelters
      ?.slice(0, 3)
      .map((s) => ({
        dx: s.x - obs.self.x,
        dy: s.y - obs.self.y,
      }))
      .sort((a, b) => Math.abs(a.dx) + Math.abs(a.dy) - (Math.abs(b.dx) + Math.abs(b.dy))) ?? [],

    // Nearby agents (count and closest, not full details)
    nearbyAgentCount: obs.nearbyAgents?.length ?? 0,
    hasAdjacentAgent: obs.nearbyAgents?.some((a) => {
      const dist = Math.abs(a.x - obs.self.x) + Math.abs(a.y - obs.self.y);
      return dist <= 1;
    }) ?? false,
  };
}

/**
 * Generate SHA-256 hash of normalized observation
 */
function hashObservation(obs: AgentObservation): string {
  const normalized = normalizeObservation(obs);
  const json = JSON.stringify(normalized);
  return createHash('sha256').update(json).digest('hex').slice(0, 16); // Use first 16 chars
}

// =============================================================================
// Cache Operations
// =============================================================================

/**
 * Get cached decision for observation
 * Returns null if not found or cache disabled
 */
export async function getCachedDecision(obs: AgentObservation): Promise<AgentDecision | null> {
  if (!CACHE_ENABLED) return null;

  try {
    const hash = hashObservation(obs);
    const key = `${CACHE_PREFIX}${hash}`;
    const cached = await getRedis().get(key);

    if (cached) {
      cacheHits++;
      return JSON.parse(cached) as AgentDecision;
    }

    cacheMisses++;
    return null;
  } catch (error) {
    console.error('[DecisionCache] Error getting cached decision:', error);
    return null;
  }
}

/**
 * Cache a decision for an observation
 */
export async function cacheDecision(obs: AgentObservation, decision: AgentDecision): Promise<void> {
  if (!CACHE_ENABLED) return;

  try {
    const hash = hashObservation(obs);
    const key = `${CACHE_PREFIX}${hash}`;
    await getRedis().setex(key, CACHE_TTL_SECONDS, JSON.stringify(decision));
  } catch (error) {
    console.error('[DecisionCache] Error caching decision:', error);
  }
}

/**
 * Clear all cached decisions
 */
export async function clearCache(): Promise<void> {
  try {
    const keys = await getRedis().keys(`${CACHE_PREFIX}*`);
    if (keys.length > 0) {
      await getRedis().del(...keys);
    }
    console.log(`[DecisionCache] Cleared ${keys.length} cached decisions`);
  } catch (error) {
    console.error('[DecisionCache] Error clearing cache:', error);
  }
}

// =============================================================================
// Statistics
// =============================================================================

let cacheHits = 0;
let cacheMisses = 0;

export function getCacheStats(): {
  hits: number;
  misses: number;
  hitRate: number;
  enabled: boolean;
  ttlSeconds: number;
} {
  const total = cacheHits + cacheMisses;
  return {
    hits: cacheHits,
    misses: cacheMisses,
    hitRate: total > 0 ? cacheHits / total : 0,
    enabled: CACHE_ENABLED,
    ttlSeconds: CACHE_TTL_SECONDS,
  };
}

export function resetCacheStats(): void {
  cacheHits = 0;
  cacheMisses = 0;
}

/**
 * Check if cache is enabled
 */
export function isCacheEnabled(): boolean {
  return CACHE_ENABLED;
}
