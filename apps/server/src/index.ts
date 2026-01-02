/**
 * Agents City Server
 * Main entry point with tick engine, SSE, and API routes
 */

// IMPORTANT: Initialize telemetry FIRST before any other imports
// This ensures all modules are properly instrumented
import { initTelemetry, getTraceId } from './telemetry';
initTelemetry();

import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { db } from './db';
import { redis, closeRedisConnection } from './cache';
import { subscribeToWorldEvents, closePubSub } from './cache/pubsub';
import { tickEngine } from './simulation/tick-engine';
import { startWorker, stopWorker, getQueueStats } from './queue';
import { spawnWorld } from './agents/spawner';
import { logAdapterStatus } from './llm';
import { getAllAgents } from './db/queries/agents';
import { getAllShelters, getAllResourceSpawns, getWorldState, getCurrentTick, initWorldState, pauseWorld, resumeWorld, resetWorldData } from './db/queries/world';
import { getRecentEvents, initGlobalVersion } from './db/queries/events';
import {
  getAnalyticsSnapshot,
  getSurvivalMetrics,
  getEconomyMetrics,
  getBehaviorMetrics,
  getTemporalMetrics,
  getResourceEfficiencyMetrics,
  getEmergenceIndexMetrics,
  getMarketEfficiencyMetrics,
  getGovernanceMetrics,
} from './db/queries/analytics';
import {
  getCredentialsIssuedBy,
  getCredentialsReceivedBy,
  getActiveCredentials,
} from './db/queries/credentials';
import {
  getGossipAbout,
  getGossipSpreadBy,
  getReputationSummary,
} from './db/queries/gossip';
import {
  getLineageTree,
  getGenerationStats,
  getReproductionHistory,
} from './db/queries/reproduction';
import {
  recordLLMMetric,
  getAgentMetrics,
  getModelComparison,
  getSystemHealth,
} from './db/queries/llm-metrics';
import {
  createExperiment,
  getExperimentWithVariants,
  listExperiments,
  updateExperimentStatus,
  deleteExperiment,
  createVariant,
  getVariant,
  updateVariantStatus,
  getNextPendingVariant,
  getCurrentRunningVariant,
  captureVariantSnapshot,
  compareVariants,
  getExperimentSummary,
} from './db/queries/experiments';
import { resetWorldWithConfig, clearWorld, getDefaultConfigurations, type SpawnConfiguration, type AgentConfig } from './agents/spawner';
import { resetTickCounter } from './db/queries/world';
import { clearCache } from './cache/projections';

// Phase 3: A2A Protocol imports
import { requireApiKey, getExternalAgentFromRequest } from './middleware/auth';
import { enforceRateLimit, recordAndCheckRateLimit, setRateLimitHeaders } from './middleware/rate-limit';
import {
  registerExternalAgent,
  getExternalAgent,
  getExternalAgentByAgentId,
  setExternalAgentActive,
  deregisterExternalAgent,
  getExternalAgentStats,
} from './db/queries/external-agents';
import { getAgentById, updateAgent } from './db/queries/agents';
import { buildObservation } from './agents/observer';
import { executeAction } from './actions';
import type { ActionType } from './actions/types';

// Phase 3: Replay (Time Travel) imports
import {
  getTickRange,
  getEventsInRange,
  getEventsAtTick,
  getAgentStatesAtTick,
  getAgentHistory,
  getWorldSnapshotAtTick,
  getTickSummaries,
  getAgentTimeline,
} from './db/queries/replay';

// Test mode imports
import { isTestMode, setTestMode } from './config';

// LLM Cache imports
import { getLLMCacheStats, getLLMCacheSize } from './cache/llm-cache';
import { registerLLMCacheRoutes } from './routes/llm-cache';

// Scientific Experiments routes
import { registerExperimentRoutes } from './routes/experiments-api';
import { registerScenarioRoutes } from './routes/scenarios-api';

// =============================================================================
// Server Setup
// =============================================================================

const server = Fastify({
  logger: true,
});

await server.register(cors, {
  origin: true,
});

// =============================================================================
// OpenAPI / Swagger Documentation
// =============================================================================

await server.register(swagger, {
  openapi: {
    openapi: '3.0.3',
    info: {
      title: 'AgentsCity API',
      description: 'API for the AgentsCity simulation platform - a persistent world where AI agents live, interact, and evolve.',
      version: '1.0.0',
      contact: {
        name: 'AgentsCity Team',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    tags: [
      { name: 'Health', description: 'Health check and status endpoints' },
      { name: 'World', description: 'World state and simulation control' },
      { name: 'Agents', description: 'Agent information' },
      { name: 'Resources', description: 'Resource spawns' },
      { name: 'Shelters', description: 'Shelter locations' },
      { name: 'Events', description: 'Real-time events and history' },
      { name: 'Analytics', description: 'Metrics and analytics' },
      { name: 'Experiments', description: 'A/B testing and experiments' },
      { name: 'External Agents (v1)', description: 'A2A Protocol for external agent integration' },
      { name: 'Replay', description: 'Time travel and replay functionality' },
    ],
    components: {
      securitySchemes: {
        apiKey: {
          type: 'apiKey',
          name: 'X-API-Key',
          in: 'header',
          description: 'API key for external agent authentication',
        },
      },
      schemas: {
        Agent: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            llmType: { type: 'string', enum: ['claude', 'gemini', 'codex', 'deepseek', 'qwen', 'glm', 'external'] },
            x: { type: 'number' },
            y: { type: 'number' },
            hunger: { type: 'number', minimum: 0, maximum: 100 },
            energy: { type: 'number', minimum: 0, maximum: 100 },
            health: { type: 'number', minimum: 0, maximum: 100 },
            balance: { type: 'number' },
            state: { type: 'string', enum: ['idle', 'walking', 'working', 'sleeping', 'dead'] },
            color: { type: 'string' },
          },
        },
        ResourceSpawn: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            x: { type: 'number' },
            y: { type: 'number' },
            resourceType: { type: 'string', enum: ['food', 'energy', 'material'] },
            currentAmount: { type: 'number' },
            maxAmount: { type: 'number' },
          },
        },
        Shelter: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            x: { type: 'number' },
            y: { type: 'number' },
            canSleep: { type: 'boolean' },
          },
        },
        Event: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            type: { type: 'string' },
            tick: { type: 'number' },
            timestamp: { type: 'number' },
            agentId: { type: 'string', nullable: true },
            payload: { type: 'object' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  },
});

await server.register(swaggerUi, {
  routePrefix: '/api/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: true,
  },
  staticCSP: true,
});

// Register reusable schemas for Fastify's serialization
server.addSchema({
  $id: 'Agent',
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    llmType: { type: 'string', enum: ['claude', 'gemini', 'codex', 'deepseek', 'qwen', 'glm', 'grok', 'external'] },
    x: { type: 'number' },
    y: { type: 'number' },
    hunger: { type: 'number', minimum: 0, maximum: 100 },
    energy: { type: 'number', minimum: 0, maximum: 100 },
    health: { type: 'number', minimum: 0, maximum: 100 },
    balance: { type: 'number' },
    state: { type: 'string', enum: ['idle', 'walking', 'working', 'sleeping', 'dead'] },
    color: { type: 'string' },
  },
});

server.addSchema({
  $id: 'ResourceSpawn',
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    x: { type: 'number' },
    y: { type: 'number' },
    resourceType: { type: 'string', enum: ['food', 'energy', 'material'] },
    currentAmount: { type: 'number' },
    maxAmount: { type: 'number' },
  },
});

server.addSchema({
  $id: 'Shelter',
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    x: { type: 'number' },
    y: { type: 'number' },
    canSleep: { type: 'boolean' },
  },
});

server.addSchema({
  $id: 'Event',
  type: 'object',
  properties: {
    id: { oneOf: [{ type: 'string' }, { type: 'number' }] },
    type: { type: 'string' },
    eventType: { type: 'string' },
    tick: { type: 'number' },
    timestamp: { type: 'number' },
    createdAt: { type: 'string', format: 'date-time' },
    agentId: { type: 'string', nullable: true },
    payload: { type: 'object', additionalProperties: true },
  },
});

server.addSchema({
  $id: 'Error',
  type: 'object',
  properties: {
    error: { type: 'string' },
    message: { type: 'string' },
  },
});

// Register LLM Cache routes
await registerLLMCacheRoutes(server);

// Register Scientific Experiments routes (seed, start, results, export)
await registerExperimentRoutes(server);

// Register Scenario Injection routes (shock, disaster, abundance, rules)
await registerScenarioRoutes(server);

// =============================================================================
// Health & Status Routes
// =============================================================================

server.get('/health', {
  schema: {
    description: 'Basic health check endpoint',
    tags: ['Health'],
    response: {
      200: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'ok' },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
}, async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

server.get('/api/status', {
  schema: {
    description: 'Get server status including queue stats and current tick',
    tags: ['Health'],
    response: {
      200: {
        type: 'object',
        properties: {
          tick: { type: 'number', description: 'Current simulation tick' },
          queue: {
            type: 'object',
            properties: {
              waiting: { type: 'number' },
              active: { type: 'number' },
              completed: { type: 'number' },
              failed: { type: 'number' },
            },
          },
          llmCache: {
            type: 'object',
            description: 'LLM response cache statistics',
            properties: {
              enabled: { type: 'boolean' },
              hits: { type: 'number' },
              misses: { type: 'number' },
              hitRate: { type: 'number' },
              size: { type: 'number' },
              ttlSeconds: { type: 'number' },
            },
          },
          uptime: { type: 'number', description: 'Server uptime in seconds' },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
}, async () => {
  const [queueStats, worldState, llmCacheSize] = await Promise.all([
    getQueueStats(),
    getWorldState(),
    getLLMCacheSize(),
  ]);

  const llmCacheStats = getLLMCacheStats();

  return {
    tick: worldState?.currentTick ?? 0,
    queue: queueStats,
    llmCache: {
      enabled: llmCacheStats.config.enabled,
      hits: llmCacheStats.hits,
      misses: llmCacheStats.misses,
      hitRate: llmCacheStats.hitRate,
      size: llmCacheSize,
      ttlSeconds: llmCacheStats.config.ttlSeconds,
    },
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  };
});

// =============================================================================
// Test Mode Routes
// =============================================================================

// Get current test mode status
server.get('/api/test/mode', {
  schema: {
    description: 'Get current test mode status (fallback-only decisions)',
    tags: ['Health'],
    response: {
      200: {
        type: 'object',
        properties: {
          testMode: { type: 'boolean', description: 'Whether test mode is enabled' },
        },
      },
    },
  },
}, async () => {
  return { testMode: isTestMode() };
});

// Toggle test mode
server.post<{ Body: { enabled: boolean } }>('/api/test/mode', {
  schema: {
    description: 'Toggle test mode - when enabled, agents use fallback decisions instead of LLM calls',
    tags: ['Health'],
    body: {
      type: 'object',
      required: ['enabled'],
      properties: {
        enabled: { type: 'boolean', description: 'Enable or disable test mode' },
      },
    },
    response: {
      200: {
        type: 'object',
        properties: {
          testMode: { type: 'boolean' },
          message: { type: 'string' },
        },
      },
    },
  },
}, async (request) => {
  const { enabled } = request.body;
  setTestMode(enabled);
  console.log(`[Server] Test mode ${enabled ? 'ENABLED' : 'DISABLED'}`);
  return {
    testMode: enabled,
    message: `Test mode ${enabled ? 'enabled - agents will use fallback decisions' : 'disabled - agents will use LLM decisions'}`,
  };
});

// =============================================================================
// World State Routes
// =============================================================================

server.get('/api/world/state', {
  schema: {
    description: 'Get full world snapshot including all agents, resources, and shelters',
    tags: ['World'],
    response: {
      200: {
        type: 'object',
        properties: {
          tick: { type: 'number' },
          isPaused: { type: 'boolean' },
          isRunning: { type: 'boolean' },
          agentCount: { type: 'number' },
          resourceSpawnCount: { type: 'number' },
          shelterCount: { type: 'number' },
          agents: { type: 'array', items: { $ref: 'Agent#' } },
          resourceSpawns: { type: 'array', items: { $ref: 'ResourceSpawn#' } },
          shelters: { type: 'array', items: { $ref: 'Shelter#' } },
        },
      },
    },
  },
}, async () => {
  const [agents, resourceSpawns, shelters, worldStateData] = await Promise.all([
    getAllAgents(),
    getAllResourceSpawns(),
    getAllShelters(),
    getWorldState(),
  ]);

  return {
    tick: worldStateData?.currentTick ?? 0,
    isPaused: worldStateData?.isPaused ?? false,
    isRunning: agents.length > 0,
    agentCount: agents.length,
    resourceSpawnCount: resourceSpawns.length,
    shelterCount: shelters.length,
    agents: agents.map((a) => ({
      id: a.id,
      llmType: a.llmType,
      x: a.x,
      y: a.y,
      hunger: a.hunger,
      energy: a.energy,
      health: a.health,
      balance: a.balance,
      state: a.state,
      color: a.color,
    })),
    resourceSpawns: resourceSpawns.map((r) => ({
      id: r.id,
      x: r.x,
      y: r.y,
      resourceType: r.resourceType,
      currentAmount: r.currentAmount,
      maxAmount: r.maxAmount,
    })),
    shelters: shelters.map((s) => ({
      id: s.id,
      x: s.x,
      y: s.y,
      canSleep: s.canSleep,
    })),
  };
});

// Pause simulation
server.post('/api/world/pause', {
  schema: {
    description: 'Pause the simulation tick engine',
    tags: ['World'],
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          isPaused: { type: 'boolean' },
        },
      },
    },
  },
}, async () => {
  await pauseWorld();
  console.log('[Server] Simulation paused');
  return { success: true, isPaused: true };
});

// Resume simulation
server.post('/api/world/resume', {
  schema: {
    description: 'Resume the simulation tick engine',
    tags: ['World'],
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          isPaused: { type: 'boolean' },
        },
      },
    },
  },
}, async () => {
  await resumeWorld();
  console.log('[Server] Simulation resumed');
  return { success: true, isPaused: false };
});

// Reset simulation (full database wipe)
server.post('/api/world/reset', {
  schema: {
    description: 'Reset simulation - wipes all data from database and Redis cache',
    tags: ['World'],
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
        },
      },
    },
  },
}, async () => {
  console.log('[Server] Resetting simulation...');

  // Stop tick engine
  tickEngine.stop();

  // Clear all data (DB + Redis cache)
  await resetWorldData();
  await clearCache(); // FIX: Pulisci Redis cache per evitare dati stale

  // Reinitialize world state and event version counter
  await initWorldState();
  await initGlobalVersion();

  console.log('[Server] Simulation reset complete');
  return { success: true };
});

// Start simulation (scientific model - no frontend locations needed)
server.post('/api/world/start', {
  schema: {
    description: 'Start simulation - spawns world with resources, shelters, and agents',
    tags: ['World'],
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          tick: { type: 'number' },
          agents: { type: 'array', items: { $ref: 'Agent#' } },
          resourceSpawns: { type: 'array', items: { $ref: 'ResourceSpawn#' } },
          shelters: { type: 'array', items: { $ref: 'Shelter#' } },
        },
      },
    },
  },
}, async () => {
  console.log('[Server] Starting simulation (scientific model)...');

  // Spawn world with default configuration (resources + shelters + agents)
  await spawnWorld();

  // Fetch spawned entities
  const [spawnedAgents, resourceSpawns, shelters] = await Promise.all([
    getAllAgents(),
    getAllResourceSpawns(),
    getAllShelters(),
  ]);

  console.log('[Server] Simulation started');

  // Start tick engine in background with delay
  const tickIntervalMs = Number(process.env.TICK_INTERVAL_MS) || 600000;
  tickEngine.setTickInterval(tickIntervalMs);

  // Delay to give frontend time to connect SSE
  setTimeout(() => {
    console.log('[Server] Starting tick engine after delay...');
    tickEngine.start().catch(console.error);
  }, 1000);

  return {
    success: true,
    tick: 0,
    agents: spawnedAgents.map((a) => ({
      id: a.id,
      llmType: a.llmType,
      x: a.x,
      y: a.y,
      hunger: a.hunger,
      energy: a.energy,
      health: a.health,
      balance: a.balance,
      state: a.state,
      color: a.color,
    })),
    resourceSpawns: resourceSpawns.map((r) => ({
      id: r.id,
      x: r.x,
      y: r.y,
      resourceType: r.resourceType,
      currentAmount: r.currentAmount,
      maxAmount: r.maxAmount,
    })),
    shelters: shelters.map((s) => ({
      id: s.id,
      x: s.x,
      y: s.y,
      canSleep: s.canSleep,
    })),
  };
});

server.get('/api/agents', {
  schema: {
    description: 'Get all agents in the simulation',
    tags: ['Agents'],
    response: {
      200: {
        type: 'object',
        properties: {
          agents: { type: 'array', items: { $ref: 'Agent#' } },
        },
      },
    },
  },
}, async () => {
  const agents = await getAllAgents();
  return { agents };
});

server.get<{ Params: { id: string } }>('/api/agents/:id', {
  schema: {
    description: 'Get a specific agent by ID',
    tags: ['Agents'],
    params: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid', description: 'Agent ID' },
      },
      required: ['id'],
    },
    response: {
      200: {
        type: 'object',
        properties: {
          agent: { $ref: 'Agent#' },
        },
      },
      404: { $ref: 'Error#' },
    },
  },
}, async (request) => {
  const { id } = request.params;
  const agents = await getAllAgents();
  const agent = agents.find((a) => a.id === id);

  if (!agent) {
    return { error: 'Agent not found' };
  }

  return { agent };
});

// Resource spawns endpoint
server.get('/api/resources', {
  schema: {
    description: 'Get all resource spawns in the world',
    tags: ['Resources'],
    response: {
      200: {
        type: 'object',
        properties: {
          resourceSpawns: { type: 'array', items: { $ref: 'ResourceSpawn#' } },
        },
      },
    },
  },
}, async () => {
  const resourceSpawns = await getAllResourceSpawns();
  return { resourceSpawns };
});

// Shelters endpoint
server.get('/api/shelters', {
  schema: {
    description: 'Get all shelters in the world',
    tags: ['Shelters'],
    response: {
      200: {
        type: 'object',
        properties: {
          shelters: { type: 'array', items: { $ref: 'Shelter#' } },
        },
      },
    },
  },
}, async () => {
  const shelters = await getAllShelters();
  return { shelters };
});

// Get recent events (for loading history on page refresh)
server.get<{ Querystring: { limit?: string } }>('/api/events/recent', {
  schema: {
    description: 'Get recent events for reconnection/history loading',
    tags: ['Events'],
    querystring: {
      type: 'object',
      properties: {
        limit: { type: 'string', description: 'Max number of events (default 50, max 200)' },
      },
    },
    response: {
      200: {
        type: 'object',
        properties: {
          events: { type: 'array', items: { $ref: 'Event#' } },
        },
      },
    },
  },
}, async (request) => {
  const limit = Math.min(parseInt(request.query.limit || '50', 10), 200);
  const recentEvents = await getRecentEvents(limit);

  // Transform DB events to match SSE event format
  return {
    events: recentEvents.map((e) => ({
      id: String(e.id),
      type: e.eventType,
      tick: e.tick,
      timestamp: new Date(e.createdAt).getTime(),
      agentId: e.agentId,
      payload: e.payload as Record<string, unknown>,
    })),
  };
});

// =============================================================================
// Analytics Routes
// =============================================================================

// Get all analytics in one call (for dashboard initialization)
server.get('/api/analytics/snapshot', {
  schema: {
    description: 'Get all analytics metrics in one call - survival, economy, behavior, and temporal',
    tags: ['Analytics'],
    response: {
      200: {
        type: 'object',
        properties: {
          survival: { type: 'object' },
          economy: { type: 'object' },
          behavior: { type: 'object' },
          temporal: { type: 'object' },
        },
      },
    },
  },
}, async () => {
  return getAnalyticsSnapshot();
});

// Get survival metrics only
server.get('/api/analytics/survival', {
  schema: {
    description: 'Get survival metrics - agent health, deaths, survival rates by LLM type',
    tags: ['Analytics'],
    response: {
      200: {
        type: 'object',
        properties: {
          byLlmType: { type: 'array', items: { type: 'object', additionalProperties: true } },
          overall: { type: 'object', additionalProperties: true },
          deathCauses: { type: 'object', additionalProperties: true },
        },
      },
    },
  },
}, async () => {
  return getSurvivalMetrics();
});

// Get economy metrics only
server.get('/api/analytics/economy', {
  schema: {
    description: 'Get economy metrics - wealth distribution, Gini coefficient, trades',
    tags: ['Analytics'],
    response: {
      200: {
        type: 'object',
        properties: {
          moneySupply: { type: 'number' },
          giniCoefficient: { type: 'number' },
          balanceDistribution: { type: 'object', additionalProperties: true },
          byLlmType: { type: 'array', items: { type: 'object', additionalProperties: true } },
        },
      },
    },
  },
}, async () => {
  return getEconomyMetrics();
});

// Get behavior metrics only
server.get('/api/analytics/behavior', {
  schema: {
    description: 'Get behavior metrics - action counts, patterns, clustering coefficient',
    tags: ['Analytics'],
    response: {
      200: {
        type: 'object',
        properties: {
          actionFrequency: { type: 'array', items: { type: 'object', additionalProperties: true } },
          byLlmType: { type: 'array', items: { type: 'object', additionalProperties: true } },
        },
      },
    },
  },
}, async () => {
  return getBehaviorMetrics();
});

// Get temporal metrics only
server.get<{ Querystring: { limit?: string } }>('/api/analytics/temporal', {
  schema: {
    description: 'Get temporal metrics - time series data for charts',
    tags: ['Analytics'],
    querystring: {
      type: 'object',
      properties: {
        limit: { type: 'string', description: 'Number of data points (default 50, max 100)' },
      },
    },
    response: {
      200: {
        type: 'object',
        properties: {
          tickDurations: { type: 'array', items: { type: 'object', additionalProperties: true } },
          eventsByTick: { type: 'array', items: { type: 'object', additionalProperties: true } },
          currentTick: { type: 'number' },
        },
      },
    },
  },
}, async (request) => {
  const limit = Math.min(parseInt(request.query.limit || '50', 10), 100);
  return getTemporalMetrics(limit);
});

// Get resource efficiency metrics only
server.get('/api/analytics/resource-efficiency', {
  schema: {
    description: 'Get resource efficiency metrics - gather action analysis by LLM type',
    tags: ['Analytics'],
    response: {
      200: {
        type: 'object',
        properties: {
          byLlmType: { type: 'array', items: { type: 'object' } },
          overall: { type: 'object' },
        },
      },
    },
  },
}, async () => {
  return getResourceEfficiencyMetrics();
});

// Get emergence index metrics
server.get('/api/analytics/emergence-index', {
  schema: {
    description: 'Get emergence index metrics - measures how much system behavior exceeds sum of individual agent behaviors',
    tags: ['Analytics'],
    response: {
      200: {
        type: 'object',
        properties: {
          emergenceIndex: { type: 'number', description: '0-1 scale, higher = more emergence' },
          systemComplexity: { type: 'number' },
          agentComplexitySum: { type: 'number' },
          components: {
            type: 'object',
            properties: {
              behavioralDiversity: { type: 'number' },
              spatialOrganization: { type: 'number' },
              socialStructure: { type: 'number' },
              economicDifferentiation: { type: 'number' },
            },
          },
        },
      },
    },
  },
}, async () => {
  return getEmergenceIndexMetrics();
});

// Get market efficiency metrics
server.get('/api/analytics/market-efficiency', {
  schema: {
    description: 'Get market efficiency metrics - price convergence, bid-ask spread, liquidity',
    tags: ['Analytics'],
    response: {
      200: {
        type: 'object',
        properties: {
          priceConvergence: { type: 'object' },
          spreadPercentage: { type: 'object' },
          liquidity: { type: 'object' },
          marketMaturity: { type: 'string', enum: ['nascent', 'developing', 'mature', 'efficient'] },
        },
      },
    },
  },
}, async () => {
  return getMarketEfficiencyMetrics();
});

// Get governance metrics (radical emergence classifier)
server.get('/api/analytics/governance', {
  schema: {
    description: 'Get governance metrics - detect emergent social structures and leadership patterns',
    tags: ['Analytics'],
    response: {
      200: {
        type: 'object',
        properties: {
          leadershipEmergence: { type: 'object' },
          collectiveDecisions: { type: 'object' },
          normEmergence: { type: 'object' },
          dominantStructure: { type: 'string', enum: ['anarchic', 'egalitarian', 'hierarchical', 'oligarchic', 'emergent'] },
        },
      },
    },
  },
}, async () => {
  return getGovernanceMetrics();
});

// =============================================================================
// Phase 4: Credentials, Gossip, Lineage, LLM Metrics
// =============================================================================

// Get credentials issued by an agent
server.get<{ Params: { agentId: string } }>('/api/analytics/credentials/issued/:agentId', {
  schema: {
    description: 'Get verifiable credentials issued by an agent',
    tags: ['Analytics', 'Phase4'],
    params: {
      type: 'object',
      properties: {
        agentId: { type: 'string', format: 'uuid', description: 'Agent ID' },
      },
      required: ['agentId'],
    },
    response: {
      200: {
        type: 'object',
        properties: {
          credentials: { type: 'array', items: { type: 'object' } },
        },
      },
    },
  },
}, async (request) => {
  const credentials = await getCredentialsIssuedBy(request.params.agentId);
  return { credentials };
});

// Get credentials received by an agent
server.get<{ Params: { agentId: string } }>('/api/analytics/credentials/received/:agentId', {
  schema: {
    description: 'Get verifiable credentials received by an agent',
    tags: ['Analytics', 'Phase4'],
    params: {
      type: 'object',
      properties: {
        agentId: { type: 'string', format: 'uuid', description: 'Agent ID' },
      },
      required: ['agentId'],
    },
    response: {
      200: {
        type: 'object',
        properties: {
          credentials: { type: 'array', items: { type: 'object' } },
        },
      },
    },
  },
}, async (request) => {
  const credentials = await getCredentialsReceivedBy(request.params.agentId);
  return { credentials };
});

// Get active credentials for an agent
server.get<{ Params: { agentId: string }; Querystring: { tick?: string } }>('/api/analytics/credentials/active/:agentId', {
  schema: {
    description: 'Get active (non-revoked, non-expired) credentials for an agent',
    tags: ['Analytics', 'Phase4'],
    params: {
      type: 'object',
      properties: {
        agentId: { type: 'string', format: 'uuid', description: 'Agent ID' },
      },
      required: ['agentId'],
    },
    querystring: {
      type: 'object',
      properties: {
        tick: { type: 'string', description: 'Current tick for expiration check' },
      },
    },
    response: {
      200: {
        type: 'object',
        properties: {
          credentials: { type: 'array', items: { type: 'object' } },
        },
      },
    },
  },
}, async (request) => {
  const tick = request.query.tick ? parseInt(request.query.tick) : undefined;
  const credentials = await getActiveCredentials(request.params.agentId, tick);
  return { credentials };
});

// Get gossip about an agent
server.get<{ Params: { agentId: string } }>('/api/analytics/gossip/about/:agentId', {
  schema: {
    description: 'Get gossip events about an agent (what others say about them)',
    tags: ['Analytics', 'Phase4'],
    params: {
      type: 'object',
      properties: {
        agentId: { type: 'string', format: 'uuid', description: 'Agent ID' },
      },
      required: ['agentId'],
    },
    response: {
      200: {
        type: 'object',
        properties: {
          gossip: { type: 'array', items: { type: 'object' } },
        },
      },
    },
  },
}, async (request) => {
  const gossip = await getGossipAbout(request.params.agentId);
  return { gossip };
});

// Get gossip spread by an agent
server.get<{ Params: { agentId: string } }>('/api/analytics/gossip/spread/:agentId', {
  schema: {
    description: 'Get gossip events spread by an agent (what they say about others)',
    tags: ['Analytics', 'Phase4'],
    params: {
      type: 'object',
      properties: {
        agentId: { type: 'string', format: 'uuid', description: 'Agent ID' },
      },
      required: ['agentId'],
    },
    response: {
      200: {
        type: 'object',
        properties: {
          gossip: { type: 'array', items: { type: 'object' } },
        },
      },
    },
  },
}, async (request) => {
  const gossip = await getGossipSpreadBy(request.params.agentId);
  return { gossip };
});

// Get reputation summary for an agent
server.get<{ Params: { agentId: string } }>('/api/analytics/reputation/:agentId', {
  schema: {
    description: 'Get aggregated reputation summary for an agent based on gossip',
    tags: ['Analytics', 'Phase4'],
    params: {
      type: 'object',
      properties: {
        agentId: { type: 'string', format: 'uuid', description: 'Agent ID' },
      },
      required: ['agentId'],
    },
    response: {
      200: {
        type: 'object',
        properties: {
          totalGossipEvents: { type: 'number' },
          averageSentiment: { type: 'number' },
          topicBreakdown: { type: 'object' },
          recentTrend: { type: 'string', enum: ['improving', 'stable', 'declining'] },
        },
      },
    },
  },
}, async (request) => {
  return getReputationSummary(request.params.agentId);
});

// Get lineage tree for an agent
server.get<{ Params: { agentId: string }; Querystring: { depth?: string } }>('/api/analytics/lineage/:agentId', {
  schema: {
    description: 'Get family tree (parents, children, siblings) for an agent',
    tags: ['Analytics', 'Phase4'],
    params: {
      type: 'object',
      properties: {
        agentId: { type: 'string', format: 'uuid', description: 'Agent ID' },
      },
      required: ['agentId'],
    },
    querystring: {
      type: 'object',
      properties: {
        depth: { type: 'string', description: 'Max tree depth (default: 3)' },
      },
    },
    response: {
      200: {
        type: 'object',
        properties: {
          agent: { type: 'object', nullable: true },
          parents: { type: 'array', items: { type: 'object' } },
          children: { type: 'array', items: { type: 'object' } },
          siblings: { type: 'array', items: { type: 'object' } },
        },
      },
    },
  },
}, async (request) => {
  const depth = request.query.depth ? parseInt(request.query.depth) : 3;
  return getLineageTree(request.params.agentId, depth);
});

// Get generation statistics
server.get('/api/analytics/generations', {
  schema: {
    description: 'Get population statistics by generation',
    tags: ['Analytics', 'Phase4'],
    response: {
      200: {
        type: 'object',
        properties: {
          generations: { type: 'object', additionalProperties: { type: 'number' } },
          totalAgents: { type: 'number' },
          maxGeneration: { type: 'number' },
        },
      },
    },
  },
}, async () => {
  const stats = await getGenerationStats();
  // Convert Map to object for JSON serialization
  const generations: Record<number, number> = {};
  stats.generations.forEach((count, gen) => {
    generations[gen] = count;
  });
  return {
    generations,
    totalAgents: stats.totalAgents,
    maxGeneration: stats.maxGeneration,
  };
});

// Get reproduction history for an agent
server.get<{ Params: { agentId: string } }>('/api/analytics/reproduction/:agentId', {
  schema: {
    description: 'Get reproduction history for an agent',
    tags: ['Analytics', 'Phase4'],
    params: {
      type: 'object',
      properties: {
        agentId: { type: 'string', format: 'uuid', description: 'Agent ID' },
      },
      required: ['agentId'],
    },
    response: {
      200: {
        type: 'object',
        properties: {
          reproductions: { type: 'array', items: { type: 'object' } },
        },
      },
    },
  },
}, async (request) => {
  const reproductions = await getReproductionHistory(request.params.agentId);
  return { reproductions };
});

// Get LLM metrics for an agent
server.get<{ Params: { agentId: string }; Querystring: { limit?: string } }>('/api/analytics/llm-metrics/:agentId', {
  schema: {
    description: 'Get LLM performance metrics for an agent',
    tags: ['Analytics', 'Phase4'],
    params: {
      type: 'object',
      properties: {
        agentId: { type: 'string', format: 'uuid', description: 'Agent ID' },
      },
      required: ['agentId'],
    },
    querystring: {
      type: 'object',
      properties: {
        limit: { type: 'string', description: 'Max records to return (default: 100)' },
      },
    },
    response: {
      200: {
        type: 'object',
        properties: {
          metrics: { type: 'array', items: { type: 'object' } },
        },
      },
    },
  },
}, async (request) => {
  const limit = request.query.limit ? parseInt(request.query.limit) : 100;
  const metrics = await getAgentMetrics(request.params.agentId, limit);
  return { metrics };
});

// Get LLM model comparison
server.get('/api/analytics/llm-comparison', {
  schema: {
    description: 'Compare LLM performance across all models',
    tags: ['Analytics', 'Phase4'],
    response: {
      200: {
        type: 'object',
        additionalProperties: {
          type: 'object',
          properties: {
            avgLatencyMs: { type: 'number' },
            avgInputTokens: { type: 'number' },
            avgOutputTokens: { type: 'number' },
            totalCostUsd: { type: 'number' },
            successRate: { type: 'number' },
            fallbackRate: { type: 'number' },
            totalCalls: { type: 'number' },
          },
        },
      },
    },
  },
}, async () => {
  const comparison = await getModelComparison();
  // Convert Map to object for JSON serialization
  const result: Record<string, { avgLatency: number; successRate: number; avgCost: number; totalCalls: number }> = {};
  comparison.forEach((value, key) => {
    result[key] = value;
  });
  return result;
});

// Get system health metrics
server.get('/api/analytics/system-health', {
  schema: {
    description: 'Get overall system health based on LLM metrics',
    tags: ['Analytics', 'Phase4'],
    response: {
      200: {
        type: 'object',
        properties: {
          overallSuccessRate: { type: 'number' },
          overallFallbackRate: { type: 'number' },
          avgLatencyMs: { type: 'number' },
          totalCalls: { type: 'number' },
          totalCostUsd: { type: 'number' },
          status: { type: 'string', enum: ['healthy', 'degraded', 'critical'] },
        },
      },
    },
  },
}, async () => {
  return getSystemHealth();
});

// =============================================================================
// Experiments Routes (A/B Testing)
// =============================================================================

// List all experiments
server.get('/api/experiments', {
  schema: {
    description: 'List all A/B testing experiments',
    tags: ['Experiments'],
    response: {
      200: {
        type: 'object',
        properties: {
          experiments: { type: 'array', items: { type: 'object' } },
        },
      },
    },
  },
}, async () => {
  const experiments = await listExperiments();
  return { experiments };
});

// Create new experiment
server.post<{
  Body: {
    name: string;
    description?: string;
    hypothesis?: string;
    metrics?: string[];
  };
}>('/api/experiments', {
  schema: {
    description: 'Create a new A/B testing experiment',
    tags: ['Experiments'],
    body: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'Experiment name' },
        description: { type: 'string', description: 'Experiment description' },
        hypothesis: { type: 'string', description: 'Scientific hypothesis' },
        metrics: { type: 'array', items: { type: 'string' }, description: 'Metrics to track' },
      },
    },
    response: {
      200: {
        type: 'object',
        properties: {
          experiment: { type: 'object' },
        },
      },
      400: { $ref: 'Error#' },
    },
  },
}, async (request) => {
  const { name, description, hypothesis, metrics } = request.body;

  if (!name) {
    return { error: 'Name is required' };
  }

  const experiment = await createExperiment({ name, description, hypothesis, metrics });
  console.log(`[Experiments] Created experiment: ${experiment.name} (${experiment.id})`);

  return { experiment };
});

// Get experiment details with variants
server.get<{ Params: { id: string } }>('/api/experiments/:id', {
  schema: {
    description: 'Get experiment details including all variants',
    tags: ['Experiments'],
    params: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid', description: 'Experiment ID' },
      },
      required: ['id'],
    },
    response: {
      200: {
        type: 'object',
        properties: {
          experiment: { type: 'object' },
        },
      },
      404: { $ref: 'Error#' },
    },
  },
}, async (request) => {
  const experiment = await getExperimentWithVariants(request.params.id);

  if (!experiment) {
    return { error: 'Experiment not found' };
  }

  return { experiment };
});

// Delete experiment
server.delete<{ Params: { id: string } }>('/api/experiments/:id', {
  schema: {
    description: 'Delete an experiment and all its variants',
    tags: ['Experiments'],
    params: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid', description: 'Experiment ID' },
      },
      required: ['id'],
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
        },
      },
      404: { $ref: 'Error#' },
    },
  },
}, async (request) => {
  const deleted = await deleteExperiment(request.params.id);

  if (!deleted) {
    return { error: 'Experiment not found' };
  }

  return { success: true };
});

// Add variant to experiment
server.post<{
  Params: { id: string };
  Body: {
    name: string;
    description?: string;
    configOverrides?: Record<string, unknown>;
    agentConfigs?: AgentConfig[];
    worldSeed?: number;
    durationTicks?: number;
  };
}>('/api/experiments/:id/variants', {
  schema: {
    description: 'Add a variant to an experiment with custom configuration',
    tags: ['Experiments'],
    params: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid', description: 'Experiment ID' },
      },
      required: ['id'],
    },
    body: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'Variant name' },
        description: { type: 'string' },
        configOverrides: { type: 'object', description: 'Configuration overrides' },
        agentConfigs: { type: 'array', items: { type: 'object' } },
        worldSeed: { type: 'number', description: 'Random seed for reproducibility' },
        durationTicks: { type: 'number', description: 'Number of ticks to run' },
      },
    },
    response: {
      200: {
        type: 'object',
        properties: {
          variant: { type: 'object' },
        },
      },
      400: { $ref: 'Error#' },
    },
  },
}, async (request) => {
  const { id } = request.params;
  const { name, description, configOverrides, agentConfigs, worldSeed, durationTicks } = request.body;

  if (!name) {
    return { error: 'Variant name is required' };
  }

  const variant = await createVariant(id, {
    name,
    description,
    configOverrides,
    agentConfigs,
    worldSeed,
    durationTicks,
  });

  console.log(`[Experiments] Added variant: ${variant.name} to experiment ${id}`);

  return { variant };
});

// Run experiment (execute variants sequentially)
server.post<{ Params: { id: string } }>('/api/experiments/:id/run', {
  schema: {
    description: 'Run the next pending variant of an experiment',
    tags: ['Experiments'],
    params: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid', description: 'Experiment ID' },
      },
      required: ['id'],
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          experiment: { type: 'object' },
          variant: { type: 'object' },
        },
      },
      400: { $ref: 'Error#' },
      404: { $ref: 'Error#' },
    },
  },
}, async (request) => {
  const { id } = request.params;

  // Check if there's already a running variant
  const running = await getCurrentRunningVariant();
  if (running) {
    return { error: 'Another variant is already running', runningVariant: running };
  }

  // Get experiment
  const experiment = await getExperimentWithVariants(id);
  if (!experiment) {
    return { error: 'Experiment not found' };
  }

  // Get next pending variant
  const variant = await getNextPendingVariant(id);
  if (!variant) {
    return { error: 'No pending variants to run' };
  }

  // Start experiment if not already running
  if (experiment.status === 'planning') {
    await updateExperimentStatus(id, 'running');
  }

  // Stop current simulation
  tickEngine.stop();

  // Clear world and reset tick counter
  await clearWorld();
  await resetTickCounter();
  await clearCache();

  // Build spawn configuration from variant
  const defaultConfig = getDefaultConfigurations();
  const spawnConfig: SpawnConfiguration = {
    agents: variant.agentConfigs as AgentConfig[] | undefined ?? defaultConfig.agents,
    resourceSpawns: defaultConfig.resourceSpawns,
    shelters: defaultConfig.shelters,
    startingFood: 1,
  };

  // Spawn world with variant config
  await resetWorldWithConfig(spawnConfig);

  // Update variant status
  const currentTick = await getCurrentTick();
  await updateVariantStatus(variant.id, 'running', { startTick: currentTick });

  // Start tick engine
  const tickIntervalMs = Number(process.env.TICK_INTERVAL_MS) || 60000;
  tickEngine.setTickInterval(tickIntervalMs);

  // Store experiment context for tick engine
  tickEngine.setExperimentContext({
    experimentId: id,
    variantId: variant.id,
    durationTicks: variant.durationTicks || 100,
  });

  setTimeout(() => {
    console.log(`[Experiments] Starting variant: ${variant.name}`);
    tickEngine.start().catch(console.error);
  }, 1000);

  return {
    success: true,
    experiment: { id, name: experiment.name },
    variant: { id: variant.id, name: variant.name },
  };
});

// Stop experiment
server.post<{ Params: { id: string } }>('/api/experiments/:id/stop', {
  schema: {
    description: 'Stop a running experiment and mark current variant as completed',
    tags: ['Experiments'],
    params: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid', description: 'Experiment ID' },
      },
      required: ['id'],
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
        },
      },
    },
  },
}, async (request) => {
  const { id } = request.params;

  // Stop tick engine
  tickEngine.stop();
  tickEngine.clearExperimentContext();

  // Mark running variant as completed
  const running = await getCurrentRunningVariant();
  if (running && running.experimentId === id) {
    const currentTick = await getCurrentTick();
    await updateVariantStatus(running.id, 'completed', { endTick: currentTick });
  }

  // Check if all variants are done
  const experiment = await getExperimentWithVariants(id);
  if (experiment) {
    const pendingVariants = experiment.variants.filter((v) => v.status === 'pending');
    if (pendingVariants.length === 0) {
      await updateExperimentStatus(id, 'completed');
    }
  }

  console.log(`[Experiments] Stopped experiment: ${id}`);

  return { success: true };
});

// Compare variants
server.get<{ Params: { id: string } }>('/api/experiments/:id/compare', {
  schema: {
    description: 'Compare all variants of an experiment with metrics summary',
    tags: ['Experiments'],
    params: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid', description: 'Experiment ID' },
      },
      required: ['id'],
    },
    response: {
      200: {
        type: 'object',
        properties: {
          experiment: { type: 'object' },
          variants: { type: 'array', items: { type: 'object' } },
          comparison: { type: 'object' },
        },
      },
      404: { $ref: 'Error#' },
    },
  },
}, async (request) => {
  const { id } = request.params;

  const summary = await getExperimentSummary(id);
  if (!summary) {
    return { error: 'Experiment not found' };
  }

  return summary;
});

// Get default spawn configurations (for UI to show available options)
server.get('/api/experiments/defaults', {
  schema: {
    description: 'Get default spawn configurations for experiments',
    tags: ['Experiments'],
    response: {
      200: {
        type: 'object',
        properties: {
          defaults: {
            type: 'object',
            properties: {
              agents: { type: 'array' },
              resourceSpawns: { type: 'array' },
              shelters: { type: 'array' },
            },
          },
        },
      },
    },
  },
}, async () => {
  return { defaults: getDefaultConfigurations() };
});

// =============================================================================
// Phase 3: A2A Protocol - External Agent API (v1)
// =============================================================================

// Register a new external agent (no auth required)
server.post<{
  Body: {
    name: string;
    endpoint?: string;
    ownerEmail?: string;
    spawnPosition?: { x: number; y: number };
  };
}>('/api/v1/agents/register', {
  schema: {
    description: 'Register a new external agent and receive an API key',
    tags: ['External Agents (v1)'],
    body: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', minLength: 1, description: 'Agent name' },
        endpoint: { type: 'string', format: 'uri', description: 'Webhook endpoint for push mode' },
        ownerEmail: { type: 'string', format: 'email' },
        spawnPosition: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
          },
        },
      },
    },
    response: {
      201: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          agentId: { type: 'string', format: 'uuid' },
          apiKey: { type: 'string', description: 'API key - only shown once!' },
          spawnPosition: {
            type: 'object',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
            },
          },
          message: { type: 'string' },
        },
      },
      400: { $ref: 'Error#' },
      500: { $ref: 'Error#' },
    },
  },
}, async (request, reply) => {
  const { name, endpoint, ownerEmail, spawnPosition } = request.body;

  if (!name || name.length < 1) {
    return reply.code(400).send({
      error: 'Bad Request',
      message: 'name is required',
    });
  }

  try {
    const result = await registerExternalAgent({
      name,
      endpoint,
      ownerEmail,
      spawnPosition,
    });

    return reply.code(201).send({
      success: true,
      agentId: result.agent.id,
      apiKey: result.apiKey, // Only returned once!
      spawnPosition: { x: result.agent.x, y: result.agent.y },
      message: 'Save your API key securely - it will not be shown again',
    });
  } catch (error) {
    console.error('[A2A] Registration error:', error);
    return reply.code(500).send({
      error: 'Internal Server Error',
      message: 'Failed to register external agent',
    });
  }
});

// Get external agent stats (no auth)
server.get('/api/v1/agents/stats', {
  schema: {
    description: 'Get statistics about external agents in the simulation',
    tags: ['External Agents (v1)'],
    response: {
      200: {
        type: 'object',
        properties: {
          stats: {
            type: 'object',
            properties: {
              total: { type: 'number' },
              active: { type: 'number' },
              inactive: { type: 'number' },
            },
          },
        },
      },
    },
  },
}, async () => {
  const stats = await getExternalAgentStats();
  return { stats };
});

// Get current observation for an agent (requires API key)
server.get<{ Params: { id: string } }>(
  '/api/v1/agents/:id/observe',
  {
    preHandler: [requireApiKey],
    schema: {
      description: 'Get current observation for an agent (nearby resources, agents, etc.)',
      tags: ['External Agents (v1)'],
      security: [{ apiKey: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Agent ID' },
        },
        required: ['id'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            tick: { type: 'number' },
            observation: { type: 'object' },
          },
        },
        401: { $ref: 'Error#' },
        403: { $ref: 'Error#' },
        404: { $ref: 'Error#' },
        410: { $ref: 'Error#' },
      },
    },
  },
  async (request, reply) => {
    const { id } = request.params;
    const externalAgent = getExternalAgentFromRequest(request);

    if (!externalAgent) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    // Verify agent ID matches the authenticated agent
    if (externalAgent.agentId !== id) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'API key does not match requested agent',
      });
    }

    // Get the simulation agent
    const agent = await getAgentById(id);
    if (!agent) {
      return reply.code(404).send({ error: 'Agent not found' });
    }

    if (agent.state === 'dead') {
      return reply.code(410).send({
        error: 'Gone',
        message: 'Agent is dead',
      });
    }

    // Build observation
    const tick = await getCurrentTick();
    const observation = await buildObservation(agent, tick);

    return {
      tick,
      observation,
    };
  }
);

// Submit a decision/action for an agent (requires API key + rate limit)
server.post<{
  Params: { id: string };
  Body: {
    action: string;
    params: Record<string, unknown>;
    reasoning?: string;
  };
}>(
  '/api/v1/agents/:id/decide',
  {
    preHandler: [requireApiKey, enforceRateLimit],
    schema: {
      description: 'Submit a decision/action for an agent (rate limited to 1 per tick)',
      tags: ['External Agents (v1)'],
      security: [{ apiKey: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Agent ID' },
        },
        required: ['id'],
      },
      body: {
        type: 'object',
        required: ['action', 'params'],
        properties: {
          action: {
            type: 'string',
            enum: ['move', 'gather', 'buy', 'consume', 'sleep', 'work', 'trade', 'harm', 'steal', 'deceive', 'share_info', 'claim', 'name_location'],
            description: 'Action type to execute',
          },
          params: { type: 'object', description: 'Action parameters' },
          reasoning: { type: 'string', description: 'Optional reasoning for logging' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            result: { type: 'object' },
            nextObservation: { type: 'object', nullable: true },
          },
        },
        400: { $ref: 'Error#' },
        401: { $ref: 'Error#' },
        403: { $ref: 'Error#' },
        404: { $ref: 'Error#' },
        410: { $ref: 'Error#' },
        429: { $ref: 'Error#' },
      },
    },
  },
  async (request, reply) => {
    const { id } = request.params;
    const { action, params, reasoning } = request.body;
    const externalAgent = getExternalAgentFromRequest(request);

    if (!externalAgent) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    // Verify agent ID matches
    if (externalAgent.agentId !== id) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'API key does not match requested agent',
      });
    }

    // Get the simulation agent
    const agent = await getAgentById(id);
    if (!agent) {
      return reply.code(404).send({ error: 'Agent not found' });
    }

    if (agent.state === 'dead') {
      return reply.code(410).send({
        error: 'Gone',
        message: 'Agent is dead',
      });
    }

    // Validate action type
    const validActions = [
      'move', 'gather', 'buy', 'consume', 'sleep', 'work', 'trade',
      'harm', 'steal', 'deceive', 'share_info', 'claim', 'name_location',
    ];

    if (!validActions.includes(action)) {
      return reply.code(400).send({
        error: 'Bad Request',
        message: `Invalid action type. Valid actions: ${validActions.join(', ')}`,
      });
    }

    try {
      const tick = await getCurrentTick();

      // Create action intent
      const intent = {
        agentId: id,
        type: action as ActionType,
        params,
        tick,
        timestamp: Date.now(),
      };

      // Execute action
      const result = await executeAction(intent, agent);

      // Update agent state if action succeeded
      if (result.success && result.changes) {
        await updateAgent(id, result.changes);
      }

      // Get updated observation
      const updatedAgent = await getAgentById(id);
      const nextObservation = updatedAgent
        ? await buildObservation(updatedAgent, tick)
        : null;

      return {
        success: result.success,
        result: {
          changes: result.changes,
          events: result.events,
          error: result.error,
        },
        nextObservation,
      };
    } catch (error) {
      console.error('[A2A] Decision error:', error);
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to execute action',
      });
    }
  }
);

// Get agent status (requires API key)
server.get<{ Params: { id: string } }>(
  '/api/v1/agents/:id/status',
  {
    preHandler: [requireApiKey],
    schema: {
      description: 'Get status of an external agent (vitals, position, metadata)',
      tags: ['External Agents (v1)'],
      security: [{ apiKey: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Agent ID' },
        },
        required: ['id'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            agent: { $ref: 'Agent#' },
            externalAgent: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                endpoint: { type: 'string', nullable: true },
                isActive: { type: 'boolean' },
                lastSeenAt: { type: 'string', format: 'date-time', nullable: true },
                rateLimitPerTick: { type: 'number' },
              },
            },
          },
        },
        401: { $ref: 'Error#' },
        403: { $ref: 'Error#' },
        404: { $ref: 'Error#' },
      },
    },
  },
  async (request, reply) => {
    const { id } = request.params;
    const externalAgent = getExternalAgentFromRequest(request);

    if (!externalAgent) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    if (externalAgent.agentId !== id) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'API key does not match requested agent',
      });
    }

    const agent = await getAgentById(id);
    if (!agent) {
      return reply.code(404).send({ error: 'Agent not found' });
    }

    return {
      agent: {
        id: agent.id,
        x: agent.x,
        y: agent.y,
        hunger: agent.hunger,
        energy: agent.energy,
        health: agent.health,
        balance: agent.balance,
        state: agent.state,
      },
      externalAgent: {
        name: externalAgent.name,
        endpoint: externalAgent.endpoint,
        isActive: externalAgent.isActive,
        lastSeenAt: externalAgent.lastSeenAt,
        rateLimitPerTick: externalAgent.rateLimitPerTick,
      },
    };
  }
);

// Deregister an external agent (requires API key)
server.delete<{ Params: { id: string } }>(
  '/api/v1/agents/:id',
  {
    preHandler: [requireApiKey],
    schema: {
      description: 'Deregister an external agent - marks agent as dead and removes API access',
      tags: ['External Agents (v1)'],
      security: [{ apiKey: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Agent ID' },
        },
        required: ['id'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
        401: { $ref: 'Error#' },
        403: { $ref: 'Error#' },
        500: { $ref: 'Error#' },
      },
    },
  },
  async (request, reply) => {
    const { id } = request.params;
    const externalAgent = getExternalAgentFromRequest(request);

    if (!externalAgent) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    if (externalAgent.agentId !== id) {
      return reply.code(403).send({
        error: 'Forbidden',
        message: 'API key does not match requested agent',
      });
    }

    const success = await deregisterExternalAgent(externalAgent.id);

    if (!success) {
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to deregister agent',
      });
    }

    return {
      success: true,
      message: 'Agent deregistered and marked as dead',
    };
  }
);

// =============================================================================
// Phase 3: Replay (Time Travel) API
// =============================================================================

// Get available tick range for replay
server.get('/api/replay/ticks', {
  schema: {
    description: 'Get available tick range for replay (min and max tick numbers)',
    tags: ['Replay'],
    response: {
      200: {
        type: 'object',
        properties: {
          minTick: { type: 'number' },
          maxTick: { type: 'number' },
          currentTick: { type: 'number' },
          totalEvents: { type: 'number' },
        },
      },
    },
  },
}, async () => {
  return await getTickRange();
});

// Get events at a specific tick
server.get<{ Params: { tick: string } }>('/api/replay/tick/:tick/events', {
  schema: {
    description: 'Get all events that occurred at a specific tick',
    tags: ['Replay'],
    params: {
      type: 'object',
      properties: {
        tick: { type: 'string', description: 'Tick number' },
      },
      required: ['tick'],
    },
    response: {
      200: {
        type: 'object',
        properties: {
          tick: { type: 'number' },
          events: { type: 'array', items: { $ref: 'Event#' } },
        },
      },
      400: { $ref: 'Error#' },
    },
  },
}, async (request) => {
  const tick = parseInt(request.params.tick, 10);

  if (isNaN(tick) || tick < 0) {
    return { error: 'Invalid tick number' };
  }

  const events = await getEventsAtTick(tick);
  return { tick, events };
});

// Get events in a tick range
server.get<{
  Querystring: { from?: string; to?: string; limit?: string };
}>('/api/replay/events', {
  schema: {
    description: 'Get events within a tick range',
    tags: ['Replay'],
    querystring: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start tick (default 0)' },
        to: { type: 'string', description: 'End tick (default 999999)' },
        limit: { type: 'string', description: 'Max events (default 1000, max 5000)' },
      },
    },
    response: {
      200: {
        type: 'object',
        properties: {
          fromTick: { type: 'number' },
          toTick: { type: 'number' },
          events: { type: 'array', items: { $ref: 'Event#' } },
          count: { type: 'number' },
        },
      },
      400: { $ref: 'Error#' },
    },
  },
}, async (request) => {
  const fromTick = parseInt(request.query.from || '0', 10);
  const toTick = parseInt(request.query.to || '999999', 10);
  const limit = Math.min(parseInt(request.query.limit || '1000', 10), 5000);

  if (isNaN(fromTick) || isNaN(toTick) || fromTick < 0) {
    return { error: 'Invalid tick parameters' };
  }

  const events = await getEventsInRange(fromTick, toTick, limit);
  return { fromTick, toTick, events, count: events.length };
});

// Get world snapshot at a specific tick
server.get<{ Params: { tick: string } }>('/api/replay/tick/:tick', {
  schema: {
    description: 'Get complete world snapshot at a specific tick (reconstructed from events)',
    tags: ['Replay'],
    params: {
      type: 'object',
      properties: {
        tick: { type: 'string', description: 'Tick number' },
      },
      required: ['tick'],
    },
    response: {
      200: {
        type: 'object',
        properties: {
          snapshot: {
            type: 'object',
            properties: {
              tick: { type: 'number' },
              agents: { type: 'array', items: { $ref: 'Agent#' } },
              resourceSpawns: { type: 'array', items: { $ref: 'ResourceSpawn#' } },
              shelters: { type: 'array', items: { $ref: 'Shelter#' } },
            },
          },
        },
      },
      400: { $ref: 'Error#' },
    },
  },
}, async (request) => {
  const tick = parseInt(request.params.tick, 10);

  if (isNaN(tick) || tick < 0) {
    return { error: 'Invalid tick number' };
  }

  const snapshot = await getWorldSnapshotAtTick(tick);
  return { snapshot };
});

// Get agent states at a specific tick
server.get<{ Params: { tick: string } }>('/api/replay/tick/:tick/agents', {
  schema: {
    description: 'Get all agent states at a specific tick',
    tags: ['Replay'],
    params: {
      type: 'object',
      properties: {
        tick: { type: 'string', description: 'Tick number' },
      },
      required: ['tick'],
    },
    response: {
      200: {
        type: 'object',
        properties: {
          tick: { type: 'number' },
          agents: { type: 'array', items: { $ref: 'Agent#' } },
        },
      },
      400: { $ref: 'Error#' },
    },
  },
}, async (request) => {
  const tick = parseInt(request.params.tick, 10);

  if (isNaN(tick) || tick < 0) {
    return { error: 'Invalid tick number' };
  }

  const agents = await getAgentStatesAtTick(tick);
  return { tick, agents };
});

// Get agent history over a range of ticks
server.get<{
  Params: { id: string };
  Querystring: { from?: string; to?: string };
}>('/api/replay/agent/:id/history', {
  schema: {
    description: 'Get an agent\'s state history over a range of ticks',
    tags: ['Replay'],
    params: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid', description: 'Agent ID' },
      },
      required: ['id'],
    },
    querystring: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start tick (default 0)' },
        to: { type: 'string', description: 'End tick (default 999999)' },
      },
    },
    response: {
      200: {
        type: 'object',
        properties: {
          agentId: { type: 'string' },
          fromTick: { type: 'number' },
          toTick: { type: 'number' },
          history: { type: 'array' },
        },
      },
      400: { $ref: 'Error#' },
    },
  },
}, async (request) => {
  const { id } = request.params;
  const fromTick = parseInt(request.query.from || '0', 10);
  const toTick = parseInt(request.query.to || '999999', 10);

  if (isNaN(fromTick) || isNaN(toTick) || fromTick < 0) {
    return { error: 'Invalid tick parameters' };
  }

  const history = await getAgentHistory(id, fromTick, toTick);
  return { agentId: id, fromTick, toTick, history };
});

// Get agent timeline (events)
server.get<{
  Params: { id: string };
  Querystring: { limit?: string };
}>('/api/replay/agent/:id/timeline', {
  schema: {
    description: 'Get an agent\'s event timeline',
    tags: ['Replay'],
    params: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid', description: 'Agent ID' },
      },
      required: ['id'],
    },
    querystring: {
      type: 'object',
      properties: {
        limit: { type: 'string', description: 'Max events (default 100, max 500)' },
      },
    },
    response: {
      200: {
        type: 'object',
        properties: {
          agentId: { type: 'string' },
          timeline: { type: 'array', items: { $ref: 'Event#' } },
        },
      },
    },
  },
}, async (request) => {
  const { id } = request.params;
  const limit = Math.min(parseInt(request.query.limit || '100', 10), 500);

  const timeline = await getAgentTimeline(id, limit);
  return { agentId: id, timeline };
});

// Get tick summaries for overview
server.get<{
  Querystring: { from?: string; to?: string };
}>('/api/replay/summaries', {
  schema: {
    description: 'Get tick summaries for overview (event counts per tick)',
    tags: ['Replay'],
    querystring: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start tick (default 0)' },
        to: { type: 'string', description: 'End tick (default 999999)' },
      },
    },
    response: {
      200: {
        type: 'object',
        properties: {
          fromTick: { type: 'number' },
          toTick: { type: 'number' },
          summaries: { type: 'array' },
        },
      },
      400: { $ref: 'Error#' },
    },
  },
}, async (request) => {
  const fromTick = parseInt(request.query.from || '0', 10);
  const toTick = parseInt(request.query.to || '999999', 10);

  if (isNaN(fromTick) || isNaN(toTick) || fromTick < 0) {
    return { error: 'Invalid tick parameters' };
  }

  const summaries = await getTickSummaries(fromTick, toTick);
  return { fromTick, toTick, summaries };
});

// =============================================================================
// SSE Endpoint for Real-Time Updates
// =============================================================================

server.get('/api/events', {
  schema: {
    description: 'Server-Sent Events stream for real-time simulation updates. Events include: agent_update, resource_update, tick_complete, action_result, ping.',
    tags: ['Events'],
    response: {
      200: {
        description: 'SSE event stream',
        type: 'string',
        headers: {
          'Content-Type': { type: 'string', enum: ['text/event-stream'] },
          'Cache-Control': { type: 'string' },
          'Connection': { type: 'string' },
        },
      },
    },
  },
}, async (request, reply) => {
  reply.raw.setHeader('Content-Type', 'text/event-stream');
  reply.raw.setHeader('Cache-Control', 'no-cache');
  reply.raw.setHeader('Connection', 'keep-alive');

  const sendEvent = (type: string, data: unknown) => {
    reply.raw.write(`event: ${type}\n`);
    reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Send initial connection event with current state
  const tick = await getCurrentTick();
  sendEvent('connected', { type: 'connected', tick, timestamp: Date.now() });

  // Subscribe to world events for real-time updates
  const unsubscribe = await subscribeToWorldEvents((event) => {
    sendEvent(event.type, event);
  });

  // Keep connection alive
  const keepAlive = setInterval(() => {
    sendEvent('ping', { type: 'ping', timestamp: Date.now() });
  }, 30000);

  request.raw.on('close', () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
});

// =============================================================================
// Graceful Shutdown
// =============================================================================

async function shutdown(): Promise<void> {
  console.log('\n[Server] Shutting down...');

  // Stop tick engine first
  tickEngine.stop();
  console.log('[Server] Tick engine stopped');

  // Stop queue worker
  await stopWorker();
  console.log('[Server] Queue worker stopped');

  // Close pub/sub
  await closePubSub();
  console.log('[Server] Pub/sub closed');

  // Close Redis
  await closeRedisConnection();
  console.log('[Server] Redis closed');

  // Close server
  await server.close();
  console.log('[Server] HTTP server closed');

  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// =============================================================================
// Start Server
// =============================================================================

const start = async () => {
  try {
    console.log('\n🏙️  AGENTS CITY SERVER\n');

    // Log LLM adapter status
    await logAdapterStatus();

    // Initialize world state (creates empty world state if none exists)
    console.log('[Server] Initializing world state...');
    await initWorldState();

    // Initialize event version counter from database
    await initGlobalVersion();

    // Start queue worker
    console.log('[Server] Starting queue worker...');
    startWorker();

    // Check if simulation was already running (persistence on restart)
    const existingAgents = await getAllAgents();
    if (existingAgents.length > 0) {
      const worldState = await getWorldState();
      if (worldState && !worldState.isPaused) {
        console.log('[Server] Resuming existing simulation...');
        const tickIntervalMs = Number(process.env.TICK_INTERVAL_MS) || 600000;
        tickEngine.setTickInterval(tickIntervalMs);
        await tickEngine.start();
      } else {
        console.log('[Server] Existing simulation is paused, waiting for resume...');
      }
    } else {
      console.log('[Server] No agents found, waiting for /api/world/start...');
    }

    // Start HTTP server
    const port = Number(process.env.PORT) || 3000;
    await server.listen({ port, host: '0.0.0.0' });

    const tickIntervalMs = Number(process.env.TICK_INTERVAL_MS) || 600000;
    console.log(`\n✅ Server running on http://localhost:${port}`);
    console.log(`   Tick interval: ${tickIntervalMs / 1000}s`);
    console.log(`   SSE endpoint: http://localhost:${port}/api/events\n`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
