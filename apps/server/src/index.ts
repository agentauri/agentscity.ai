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
import { getAllLocations, getWorldState, getCurrentTick } from './db/queries/world';

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
  const [agents, locations, worldState] = await Promise.all([
    getAllAgents(),
    getAllLocations(),
    getWorldState(),
  ]);

  return {
    tick: worldState?.currentTick ?? 0,
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
    locations: locations.map((l) => ({
      id: l.id,
      name: l.name,
      type: l.type,
      x: l.x,
      y: l.y,
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

server.get('/api/locations', async () => {
  const locations = await getAllLocations();
  return { locations };
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
  sendEvent('connected', { tick, timestamp: Date.now() });

  // Subscribe to world events for real-time updates
  const unsubscribe = await subscribeToWorldEvents((event) => {
    sendEvent(event.type, event);
  });

  // Keep connection alive
  const keepAlive = setInterval(() => {
    sendEvent('ping', { timestamp: Date.now() });
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

    // Spawn world (agents + locations)
    console.log('[Server] Initializing world...');
    await spawnWorld();

    // Start queue worker
    console.log('[Server] Starting queue worker...');
    startWorker();

    // Start tick engine
    console.log('[Server] Starting tick engine...');
    const tickIntervalMs = Number(process.env.TICK_INTERVAL_MS) || 600000; // 10 min default
    tickEngine.setTickInterval(tickIntervalMs);
    await tickEngine.start();

    // Start HTTP server
    const port = Number(process.env.PORT) || 3000;
    await server.listen({ port, host: '0.0.0.0' });

    console.log(`\n✅ Server running on http://localhost:${port}`);
    console.log(`   Tick interval: ${tickIntervalMs / 1000}s`);
    console.log(`   SSE endpoint: http://localhost:${port}/api/events\n`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
