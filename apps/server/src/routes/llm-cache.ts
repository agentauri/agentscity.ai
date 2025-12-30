/**
 * LLM Cache Routes
 *
 * API endpoints for managing the LLM response cache.
 */

import type { FastifyInstance } from 'fastify';
import {
  getLLMCacheStats,
  getLLMCacheConfig,
  setLLMCacheEnabled,
  setLLMCacheTTL,
  clearLLMCache,
  resetLLMCacheStats,
  getLLMCacheSize,
} from '../cache/llm-cache';

/**
 * Register LLM cache routes
 */
export async function registerLLMCacheRoutes(server: FastifyInstance): Promise<void> {
  // Get cache stats
  server.get('/api/llm-cache/stats', {
    schema: {
      description: 'Get LLM response cache statistics including hit rate, hits, misses, and configuration',
      tags: ['Health'],
      response: {
        200: {
          type: 'object',
          properties: {
            hits: { type: 'number', description: 'Number of cache hits' },
            misses: { type: 'number', description: 'Number of cache misses' },
            writes: { type: 'number', description: 'Number of cache writes' },
            errors: { type: 'number', description: 'Number of cache errors' },
            hitRate: { type: 'number', description: 'Cache hit rate (0-1)' },
            lastReset: { type: 'number', description: 'Timestamp of last stats reset' },
            size: { type: 'number', description: 'Number of cached entries' },
            config: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean' },
                ttlSeconds: { type: 'number' },
                keyPrefix: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async () => {
    const stats = getLLMCacheStats();
    const size = await getLLMCacheSize();
    return { ...stats, size };
  });

  // Get cache configuration
  server.get('/api/llm-cache/config', {
    schema: {
      description: 'Get current LLM cache configuration',
      tags: ['Health'],
      response: {
        200: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean', description: 'Whether caching is enabled' },
            ttlSeconds: { type: 'number', description: 'Cache TTL in seconds' },
            keyPrefix: { type: 'string', description: 'Redis key prefix' },
          },
        },
      },
    },
  }, async () => {
    return getLLMCacheConfig();
  });

  // Enable/disable cache
  server.post<{ Body: { enabled: boolean } }>('/api/llm-cache/enabled', {
    schema: {
      description: 'Enable or disable LLM response caching at runtime',
      tags: ['Health'],
      body: {
        type: 'object',
        required: ['enabled'],
        properties: {
          enabled: { type: 'boolean', description: 'Enable or disable caching' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request) => {
    const { enabled } = request.body;
    setLLMCacheEnabled(enabled);
    return {
      enabled,
      message: `LLM cache ${enabled ? 'enabled' : 'disabled'}`,
    };
  });

  // Set TTL
  server.post<{ Body: { ttlSeconds: number } }>('/api/llm-cache/ttl', {
    schema: {
      description: 'Set the TTL (time-to-live) for cached LLM responses',
      tags: ['Health'],
      body: {
        type: 'object',
        required: ['ttlSeconds'],
        properties: {
          ttlSeconds: { type: 'number', minimum: 1, maximum: 86400, description: 'TTL in seconds (1-86400)' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            ttlSeconds: { type: 'number' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request) => {
    const { ttlSeconds } = request.body;
    const clampedTTL = Math.max(1, Math.min(86400, ttlSeconds));
    setLLMCacheTTL(clampedTTL);
    return {
      ttlSeconds: clampedTTL,
      message: `LLM cache TTL set to ${clampedTTL} seconds`,
    };
  });

  // Clear cache
  server.post('/api/llm-cache/clear', {
    schema: {
      description: 'Clear all cached LLM responses',
      tags: ['Health'],
      response: {
        200: {
          type: 'object',
          properties: {
            clearedCount: { type: 'number', description: 'Number of entries cleared' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async () => {
    const clearedCount = await clearLLMCache();
    return {
      clearedCount,
      message: `Cleared ${clearedCount} cached LLM responses`,
    };
  });

  // Reset statistics
  server.post('/api/llm-cache/stats/reset', {
    schema: {
      description: 'Reset LLM cache statistics (hits, misses, etc.)',
      tags: ['Health'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async () => {
    resetLLMCacheStats();
    return {
      success: true,
      message: 'LLM cache statistics reset',
    };
  });
}
