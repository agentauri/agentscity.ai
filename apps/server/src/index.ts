/**
 * Agents City Server
 * Main entry point with tick engine, SSE, and API routes
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
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
import { getAnalyticsSnapshot, getSurvivalMetrics, getEconomyMetrics, getBehaviorMetrics, getTemporalMetrics } from './db/queries/analytics';
import { clearCache } from './cache/projections';

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
// Health & Status Routes
// =============================================================================

server.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

server.get('/api/status', async () => {
  const [queueStats, worldState] = await Promise.all([
    getQueueStats(),
    getWorldState(),
  ]);

  return {
    tick: worldState?.currentTick ?? 0,
    queue: queueStats,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  };
});

// =============================================================================
// World State Routes
// =============================================================================

server.get('/api/world/state', async () => {
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
server.post('/api/world/pause', async () => {
  await pauseWorld();
  console.log('[Server] Simulation paused');
  return { success: true, isPaused: true };
});

// Resume simulation
server.post('/api/world/resume', async () => {
  await resumeWorld();
  console.log('[Server] Simulation resumed');
  return { success: true, isPaused: false };
});

// Reset simulation (full database wipe)
server.post('/api/world/reset', async () => {
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
server.post('/api/world/start', async () => {
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

server.get('/api/agents', async () => {
  const agents = await getAllAgents();
  return { agents };
});

server.get('/api/agents/:id', async (request) => {
  const { id } = request.params as { id: string };
  const agents = await getAllAgents();
  const agent = agents.find((a) => a.id === id);

  if (!agent) {
    return { error: 'Agent not found' };
  }

  return { agent };
});

// Resource spawns endpoint
server.get('/api/resources', async () => {
  const resourceSpawns = await getAllResourceSpawns();
  return { resourceSpawns };
});

// Shelters endpoint
server.get('/api/shelters', async () => {
  const shelters = await getAllShelters();
  return { shelters };
});

// Get recent events (for loading history on page refresh)
server.get<{ Querystring: { limit?: string } }>('/api/events/recent', async (request) => {
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
server.get('/api/analytics/snapshot', async () => {
  return getAnalyticsSnapshot();
});

// Get survival metrics only
server.get('/api/analytics/survival', async () => {
  return getSurvivalMetrics();
});

// Get economy metrics only
server.get('/api/analytics/economy', async () => {
  return getEconomyMetrics();
});

// Get behavior metrics only
server.get('/api/analytics/behavior', async () => {
  return getBehaviorMetrics();
});

// Get temporal metrics only
server.get<{ Querystring: { limit?: string } }>('/api/analytics/temporal', async (request) => {
  const limit = Math.min(parseInt(request.query.limit || '50', 10), 100);
  return getTemporalMetrics(limit);
});

// =============================================================================
// SSE Endpoint for Real-Time Updates
// =============================================================================

server.get('/api/events', async (request, reply) => {
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
