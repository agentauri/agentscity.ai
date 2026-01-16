/**
 * Decision Cache with Semantic Hashing
 *
 * Phase 3: Async Architecture Scale
 *
 * Caches LLM decisions based on semantic features of observations,
 * enabling faster responses for similar situations without full LLM calls.
 *
 * Key Features:
 * - Semantic hashing: Similar observations map to same cache key
 * - Bucketing: Quantizes continuous values into discrete buckets
 * - Provider-aware: Separate caches per LLM provider
 * - TTL-based expiry: Prevents stale decisions
 */

import { createHash } from 'crypto';
import type { LLMType, AgentObservation, AgentDecision } from '../llm/types';
import { CONFIG } from '../config';

// Re-export redis client lazily to avoid circular imports
let redis: typeof import('ioredis').default.prototype | null = null;

async function getRedis() {
  if (!redis) {
    const Redis = (await import('ioredis')).default;
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }
  return redis;
}

// =============================================================================
// Types
// =============================================================================

interface SemanticFeatures {
  // Health bucket (0-100 in 20-point buckets: 0-5)
  healthBucket: number;
  // Hunger bucket (0-100 in 20-point buckets: 0-5)
  hungerBucket: number;
  // Energy bucket (0-100 in 20-point buckets: 0-5)
  energyBucket: number;
  // At resource (boolean - are we on a resource spawn?)
  atResource: boolean;
  // At shelter (boolean - are we on a shelter?)
  atShelter: boolean;
  // Has food (boolean - do we have food in inventory?)
  hasFood: boolean;
  // Has money (boolean - do we have significant balance?)
  hasMoney: boolean;
  // Nearby agent count (0, 1, 2-3, 4+)
  nearbyAgentBucket: number;
  // Threat level (none, low, high based on nearby aggressive agents)
  threatLevel: number;
  // Opportunity level (none, low, high based on nearby resources)
  opportunityLevel: number;
}

interface CacheEntry {
  decision: AgentDecision;
  features: SemanticFeatures;
  timestamp: number;
  hitCount: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  entriesCount: number;
}

// =============================================================================
// Cache Configuration
// =============================================================================

const CACHE_PREFIX = 'decision-cache:';
const STATS_KEY = 'decision-cache:stats';
const DEFAULT_TTL_SECONDS = 300; // 5 minutes

// Bucket sizes for quantization
const BUCKET_SIZE = 20; // 0-100 divided into 5 buckets

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Quantize a value (0-100) into a bucket index.
 */
function toBucket(value: number): number {
  return Math.floor(value / BUCKET_SIZE);
}

/**
 * Check if agent is at a specific position.
 */
function isAtPosition(agentX: number, agentY: number, targetX: number, targetY: number): boolean {
  return agentX === targetX && agentY === targetY;
}

/**
 * Convert nearby agent count to bucket (0, 1, 2-3, 4+).
 */
function getNearbyAgentBucket(count: number): number {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  return 3;
}

/**
 * Convert resource count to opportunity level (none=0, low=1, high=2).
 */
function getOpportunityLevel(resourceCount: number): number {
  if (resourceCount === 0) return 0;
  if (resourceCount <= 2) return 1;
  return 2;
}

// =============================================================================
// Semantic Hashing
// =============================================================================

/**
 * Extract semantic features from an observation.
 * These features capture the "essence" of a situation for caching purposes.
 */
export function extractSemanticFeatures(obs: AgentObservation): SemanticFeatures {
  const self = obs.self;

  // Quantize continuous values into buckets
  const healthBucket = toBucket(self.health);
  const hungerBucket = toBucket(self.hunger);
  const energyBucket = toBucket(self.energy);

  // Boolean features
  const atResource = (obs.nearbyResourceSpawns ?? []).some(
    r => isAtPosition(self.x, self.y, r.x, r.y) && r.currentAmount > 0
  );

  const atShelter = (obs.nearbyShelters ?? []).some(
    s => isAtPosition(self.x, self.y, s.x, s.y)
  );

  const hasFood = obs.inventory.some(i => i.type === 'food' && i.quantity > 0);
  const hasMoney = self.balance > 50;

  // Nearby agents bucket (0, 1, 2-3, 4+)
  const nearbyCount = obs.nearbyAgents.length;
  const nearbyAgentBucket = getNearbyAgentBucket(nearbyCount);

  // Threat level (simplified - based on nearby agents in aggressive state)
  // In a real implementation, this could consider relationships, health differential, etc.
  const threatLevel = 0; // No aggression detection for now

  // Opportunity level (based on nearby resources with amount)
  const resourcesWithAmount = (obs.nearbyResourceSpawns ?? []).filter(r => r.currentAmount > 0);
  const opportunityLevel = getOpportunityLevel(resourcesWithAmount.length);

  return {
    healthBucket,
    hungerBucket,
    energyBucket,
    atResource,
    atShelter,
    hasFood,
    hasMoney,
    nearbyAgentBucket,
    threatLevel,
    opportunityLevel,
  };
}

/**
 * Hash semantic features into a cache key.
 * Similar observations will produce the same hash.
 */
export function hashSemanticFeatures(features: SemanticFeatures): string {
  const featureString = JSON.stringify({
    h: features.healthBucket,
    hu: features.hungerBucket,
    e: features.energyBucket,
    ar: features.atResource ? 1 : 0,
    as: features.atShelter ? 1 : 0,
    hf: features.hasFood ? 1 : 0,
    hm: features.hasMoney ? 1 : 0,
    na: features.nearbyAgentBucket,
    t: features.threatLevel,
    o: features.opportunityLevel,
  });

  return createHash('sha256')
    .update(featureString)
    .digest('hex')
    .slice(0, 16);
}

/**
 * Create a complete observation hash including LLM type.
 */
export function hashObservation(llmType: LLMType, obs: AgentObservation): string {
  const features = extractSemanticFeatures(obs);
  const featureHash = hashSemanticFeatures(features);
  return `${llmType}:${featureHash}`;
}

// =============================================================================
// Cache Operations
// =============================================================================

/**
 * Get a cached decision for an observation.
 * Returns null if not found or expired.
 */
export async function getCachedDecision(
  llmType: LLMType,
  obs: AgentObservation
): Promise<AgentDecision | null> {
  try {
    const redisClient = await getRedis();
    const hash = hashObservation(llmType, obs);
    const key = `${CACHE_PREFIX}${hash}`;

    const cached = await redisClient.get(key);
    if (!cached) {
      await incrementCacheStats('miss');
      return null;
    }

    const entry: CacheEntry = JSON.parse(cached);

    // Update hit count
    entry.hitCount++;
    await redisClient.set(key, JSON.stringify(entry), 'EX', DEFAULT_TTL_SECONDS);
    await incrementCacheStats('hit');

    return entry.decision;
  } catch (error) {
    console.error('[DecisionCache] Error getting cached decision:', error);
    return null;
  }
}

/**
 * Cache a decision for an observation.
 */
export async function cacheDecision(
  llmType: LLMType,
  obs: AgentObservation,
  decision: AgentDecision,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<void> {
  try {
    const redisClient = await getRedis();
    const hash = hashObservation(llmType, obs);
    const key = `${CACHE_PREFIX}${hash}`;
    const features = extractSemanticFeatures(obs);

    const entry: CacheEntry = {
      decision,
      features,
      timestamp: Date.now(),
      hitCount: 0,
    };

    await redisClient.set(key, JSON.stringify(entry), 'EX', ttlSeconds);
  } catch (error) {
    console.error('[DecisionCache] Error caching decision:', error);
  }
}

/**
 * Invalidate cache for a specific LLM type.
 * Useful when agent strategies change significantly.
 */
export async function invalidateCacheForType(llmType: LLMType): Promise<number> {
  try {
    const redisClient = await getRedis();
    const pattern = `${CACHE_PREFIX}${llmType}:*`;
    const keys = await redisClient.keys(pattern);

    if (keys.length > 0) {
      await redisClient.del(...keys);
    }

    return keys.length;
  } catch (error) {
    console.error('[DecisionCache] Error invalidating cache:', error);
    return 0;
  }
}

/**
 * Clear all decision cache entries.
 */
export async function clearDecisionCache(): Promise<void> {
  try {
    const redisClient = await getRedis();
    const keys = await redisClient.keys(`${CACHE_PREFIX}*`);

    if (keys.length > 0) {
      await redisClient.del(...keys);
    }

    // Reset stats
    await redisClient.del(STATS_KEY);
  } catch (error) {
    console.error('[DecisionCache] Error clearing cache:', error);
  }
}

// =============================================================================
// Stats Tracking
// =============================================================================

async function incrementCacheStats(type: 'hit' | 'miss'): Promise<void> {
  try {
    const redisClient = await getRedis();
    await redisClient.hincrby(STATS_KEY, type === 'hit' ? 'hits' : 'misses', 1);
  } catch (error) {
    // Non-critical error, just log
    console.warn('[DecisionCache] Error updating stats:', error);
  }
}

/**
 * Get cache statistics.
 */
export async function getCacheStats(): Promise<CacheStats> {
  try {
    const redisClient = await getRedis();
    const stats = await redisClient.hgetall(STATS_KEY);
    const hits = parseInt(stats.hits || '0', 10);
    const misses = parseInt(stats.misses || '0', 10);
    const total = hits + misses;

    // Count cache entries
    const keys = await redisClient.keys(`${CACHE_PREFIX}*`);
    const entriesCount = keys.filter(k => k !== STATS_KEY).length;

    return {
      hits,
      misses,
      hitRate: total > 0 ? hits / total : 0,
      entriesCount,
    };
  } catch (error) {
    console.error('[DecisionCache] Error getting stats:', error);
    return { hits: 0, misses: 0, hitRate: 0, entriesCount: 0 };
  }
}

// =============================================================================
// Feature Similarity (for debugging and analysis)
// =============================================================================

/**
 * Compare two observations and return similarity score (0-1).
 * Useful for debugging cache behavior.
 */
export function compareObservations(obs1: AgentObservation, obs2: AgentObservation): number {
  const f1 = extractSemanticFeatures(obs1);
  const f2 = extractSemanticFeatures(obs2);

  let matches = 0;
  const total = 10; // Number of features

  if (f1.healthBucket === f2.healthBucket) matches++;
  if (f1.hungerBucket === f2.hungerBucket) matches++;
  if (f1.energyBucket === f2.energyBucket) matches++;
  if (f1.atResource === f2.atResource) matches++;
  if (f1.atShelter === f2.atShelter) matches++;
  if (f1.hasFood === f2.hasFood) matches++;
  if (f1.hasMoney === f2.hasMoney) matches++;
  if (f1.nearbyAgentBucket === f2.nearbyAgentBucket) matches++;
  if (f1.threatLevel === f2.threatLevel) matches++;
  if (f1.opportunityLevel === f2.opportunityLevel) matches++;

  return matches / total;
}
