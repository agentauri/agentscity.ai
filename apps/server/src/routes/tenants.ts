/**
 * Tenant Management API Routes
 *
 * Provides endpoints for creating, managing, and monitoring tenants.
 * Admin endpoints require an admin API key (ADMIN_API_KEY env var).
 */

import type { FastifyInstance } from 'fastify';
import {
  createTenant,
  getTenant,
  listTenants,
  updateTenant,
  deactivateTenant,
  deleteTenant,
  regenerateTenantApiKey,
  getTenantStats,
  getTenantUsageHistory,
  getTenantCurrentTick,
  type CreateTenantInput,
} from '../db/queries/tenants';
import {
  requireTenant,
  getTenantContext,
} from '../middleware/tenant';
import { requireAdmin } from '../middleware/auth';
import { tenantEngineManager } from '../simulation/tenant-tick-engine';
import { clearTenantCache } from '../cache/tenant-projections';
import { publishTenantLifecycleEvent } from '../cache/tenant-pubsub';
import { subscribeToTenantEvents, type TenantWorldEvent } from '../cache/tenant-pubsub';

// =============================================================================
// Route Registration
// =============================================================================

export async function registerTenantRoutes(server: FastifyInstance): Promise<void> {
  // ==========================================================================
  // Admin Routes (require admin API key)
  // ==========================================================================

  // Create a new tenant
  server.post<{
    Body: CreateTenantInput;
  }>('/api/tenants', {
    preHandler: [requireAdmin],
    schema: {
      description: 'Create a new tenant (admin only)',
      tags: ['Tenants'],
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, description: 'Tenant name' },
          description: { type: 'string', description: 'Tenant description' },
          ownerEmail: { type: 'string', format: 'email', description: 'Owner email' },
          maxAgents: { type: 'number', default: 20, description: 'Maximum agents allowed' },
          maxTicksPerDay: { type: 'number', default: 1000, description: 'Maximum ticks per day' },
          maxEventsStored: { type: 'number', default: 100000, description: 'Maximum events stored' },
          tickIntervalMs: { type: 'number', default: 60000, description: 'Tick interval in milliseconds' },
          gridWidth: { type: 'number', default: 100, description: 'Grid width' },
          gridHeight: { type: 'number', default: 100, description: 'Grid height' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            tenant: { type: 'object' },
            apiKey: { type: 'string', description: 'Tenant API key - save this, shown only once!' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const result = await createTenant(request.body);

    // Publish lifecycle event
    await publishTenantLifecycleEvent({
      type: 'tenant_created',
      tenantId: result.tenant.id,
      tenantName: result.tenant.name,
      timestamp: Date.now(),
    });

    return reply.code(201).send({
      success: true,
      tenant: {
        id: result.tenant.id,
        name: result.tenant.name,
        description: result.tenant.description,
        ownerEmail: result.tenant.ownerEmail,
        maxAgents: result.tenant.maxAgents,
        maxTicksPerDay: result.tenant.maxTicksPerDay,
        tickIntervalMs: result.tenant.tickIntervalMs,
        gridWidth: result.tenant.gridWidth,
        gridHeight: result.tenant.gridHeight,
        isActive: result.tenant.isActive,
        createdAt: result.tenant.createdAt,
      },
      apiKey: result.apiKey,
    });
  });

  // List all tenants
  server.get<{
    Querystring: { activeOnly?: string; limit?: string; offset?: string };
  }>('/api/tenants', {
    preHandler: [requireAdmin],
    schema: {
      description: 'List all tenants (admin only)',
      tags: ['Tenants'],
      querystring: {
        type: 'object',
        properties: {
          activeOnly: { type: 'string', enum: ['true', 'false'] },
          limit: { type: 'string' },
          offset: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            tenants: { type: 'array' },
            total: { type: 'number' },
          },
        },
      },
    },
  }, async (request) => {
    const { activeOnly, limit, offset } = request.query;

    return listTenants({
      activeOnly: activeOnly === 'true',
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  });

  // Get tenant by ID (admin)
  server.get<{
    Params: { id: string };
  }>('/api/tenants/:id', {
    preHandler: [requireAdmin],
    schema: {
      description: 'Get tenant details (admin only)',
      tags: ['Tenants'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            tenant: { type: 'object' },
            stats: { type: 'object' },
            engineStatus: { type: 'object', nullable: true },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    const [stats, engineStatus] = await Promise.all([
      getTenantStats(id),
      tenantEngineManager.getEngineStatus(id),
    ]);

    if (!stats) {
      return reply.code(404).send({ error: 'Tenant not found' });
    }

    return {
      tenant: stats,
      stats: {
        todayTicks: stats.todayTicks,
        todayEvents: stats.todayEvents,
        todayLlmCalls: stats.todayLlmCalls,
      },
      engineStatus,
    };
  });

  // Update tenant
  server.patch<{
    Params: { id: string };
    Body: Partial<CreateTenantInput & { isActive: boolean; isPaused: boolean }>;
  }>('/api/tenants/:id', {
    preHandler: [requireAdmin],
    schema: {
      description: 'Update tenant settings (admin only)',
      tags: ['Tenants'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          ownerEmail: { type: 'string' },
          maxAgents: { type: 'number' },
          maxTicksPerDay: { type: 'number' },
          maxEventsStored: { type: 'number' },
          tickIntervalMs: { type: 'number' },
          gridWidth: { type: 'number' },
          gridHeight: { type: 'number' },
          isActive: { type: 'boolean' },
          isPaused: { type: 'boolean' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    const tenant = await updateTenant(id, request.body);

    if (!tenant) {
      return reply.code(404).send({ error: 'Tenant not found' });
    }

    return { success: true, tenant };
  });

  // Regenerate tenant API key
  server.post<{
    Params: { id: string };
  }>('/api/tenants/:id/regenerate-key', {
    preHandler: [requireAdmin],
    schema: {
      description: 'Regenerate tenant API key (admin only)',
      tags: ['Tenants'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    const apiKey = await regenerateTenantApiKey(id);

    if (!apiKey) {
      return reply.code(404).send({ error: 'Tenant not found' });
    }

    return {
      success: true,
      apiKey,
      message: 'Save this API key - it will not be shown again',
    };
  });

  // Deactivate tenant
  server.post<{
    Params: { id: string };
  }>('/api/tenants/:id/deactivate', {
    preHandler: [requireAdmin],
    schema: {
      description: 'Deactivate a tenant (soft delete)',
      tags: ['Tenants'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    // Stop engine if running
    tenantEngineManager.stopEngine(id);

    const success = await deactivateTenant(id);

    if (!success) {
      return reply.code(404).send({ error: 'Tenant not found' });
    }

    // Publish lifecycle event
    const tenant = await getTenant(id);
    if (tenant) {
      await publishTenantLifecycleEvent({
        type: 'tenant_stopped',
        tenantId: id,
        tenantName: tenant.name,
        timestamp: Date.now(),
      });
    }

    return { success: true };
  });

  // Delete tenant (hard delete)
  server.delete<{
    Params: { id: string };
  }>('/api/tenants/:id', {
    preHandler: [requireAdmin],
    schema: {
      description: 'Delete a tenant permanently (admin only)',
      tags: ['Tenants'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    // Get tenant name before deletion
    const tenant = await getTenant(id);
    const tenantName = tenant?.name || 'Unknown';

    // Stop and remove engine
    tenantEngineManager.removeEngine(id);

    // Clear cache
    await clearTenantCache(id);

    // Delete from database
    const success = await deleteTenant(id);

    if (!success) {
      return reply.code(404).send({ error: 'Tenant not found' });
    }

    // Publish lifecycle event
    await publishTenantLifecycleEvent({
      type: 'tenant_deleted',
      tenantId: id,
      tenantName,
      timestamp: Date.now(),
    });

    return { success: true };
  });

  // Get tenant usage history
  server.get<{
    Params: { id: string };
    Querystring: { days?: string };
  }>('/api/tenants/:id/usage', {
    preHandler: [requireAdmin],
    schema: {
      description: 'Get tenant usage history (admin only)',
      tags: ['Tenants'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
        },
        required: ['id'],
      },
      querystring: {
        type: 'object',
        properties: {
          days: { type: 'string', default: '30' },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const days = parseInt(request.query.days || '30', 10);

    const tenant = await getTenant(id);
    if (!tenant) {
      return reply.code(404).send({ error: 'Tenant not found' });
    }

    const history = await getTenantUsageHistory(id, days);

    return { tenantId: id, days, usage: history };
  });

  // ==========================================================================
  // Tenant-Scoped Routes (require tenant API key)
  // ==========================================================================

  // Get own tenant info
  server.get('/api/t/me', {
    preHandler: [requireTenant],
    schema: {
      description: 'Get current tenant info',
      tags: ['Tenants'],
      security: [{ tenantKey: [] }],
    },
  }, async (request) => {
    const context = getTenantContext(request)!;
    const stats = await getTenantStats(context.tenantId);
    const engineStatus = await tenantEngineManager.getEngineStatus(context.tenantId);

    return {
      tenant: stats,
      engineStatus,
    };
  });

  // Start tenant simulation
  server.post('/api/t/me/start', {
    preHandler: [requireTenant],
    schema: {
      description: 'Start tenant simulation',
      tags: ['Tenants'],
      security: [{ tenantKey: [] }],
    },
  }, async (request) => {
    const context = getTenantContext(request)!;

    await tenantEngineManager.startEngine(context.tenantId);

    // Publish lifecycle event
    await publishTenantLifecycleEvent({
      type: 'tenant_started',
      tenantId: context.tenantId,
      tenantName: context.tenant.name,
      timestamp: Date.now(),
    });

    const status = await tenantEngineManager.getEngineStatus(context.tenantId);

    return { success: true, status };
  });

  // Stop tenant simulation
  server.post('/api/t/me/stop', {
    preHandler: [requireTenant],
    schema: {
      description: 'Stop tenant simulation',
      tags: ['Tenants'],
      security: [{ tenantKey: [] }],
    },
  }, async (request) => {
    const context = getTenantContext(request)!;

    tenantEngineManager.stopEngine(context.tenantId);

    // Publish lifecycle event
    await publishTenantLifecycleEvent({
      type: 'tenant_stopped',
      tenantId: context.tenantId,
      tenantName: context.tenant.name,
      timestamp: Date.now(),
    });

    return { success: true };
  });

  // Pause/resume tenant simulation
  server.post<{
    Body: { paused: boolean };
  }>('/api/t/me/pause', {
    preHandler: [requireTenant],
    schema: {
      description: 'Pause or resume tenant simulation',
      tags: ['Tenants'],
      security: [{ tenantKey: [] }],
      body: {
        type: 'object',
        required: ['paused'],
        properties: {
          paused: { type: 'boolean' },
        },
      },
    },
  }, async (request) => {
    const context = getTenantContext(request)!;
    const { paused } = request.body;

    await updateTenant(context.tenantId, { isPaused: paused });

    return { success: true, isPaused: paused };
  });

  // Get own usage
  server.get<{
    Querystring: { days?: string };
  }>('/api/t/me/usage', {
    preHandler: [requireTenant],
    schema: {
      description: 'Get own usage history',
      tags: ['Tenants'],
      security: [{ tenantKey: [] }],
    },
  }, async (request) => {
    const context = getTenantContext(request)!;
    const days = parseInt(request.query.days || '30', 10);

    const history = await getTenantUsageHistory(context.tenantId, days);

    return { tenantId: context.tenantId, days, usage: history };
  });

  // ==========================================================================
  // Tenant SSE Endpoint
  // ==========================================================================

  server.get('/api/t/me/events', {
    preHandler: [requireTenant],
    schema: {
      description: 'Server-Sent Events stream for tenant simulation updates',
      tags: ['Tenants'],
      security: [{ tenantKey: [] }],
    },
  }, async (request, reply) => {
    const context = getTenantContext(request)!;
    const tenantId = context.tenantId;

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');

    const sendEvent = (type: string, data: unknown) => {
      reply.raw.write(`event: ${type}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Send initial connection event
    const tick = await getTenantCurrentTick(tenantId);
    sendEvent('connected', { type: 'connected', tenantId, tick, timestamp: Date.now() });

    // Subscribe to tenant events
    const unsubscribe = await subscribeToTenantEvents(tenantId, (event: TenantWorldEvent) => {
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
}
