/**
 * Tenant-Scoped Redis Pub/Sub for Real-Time Event Broadcasting
 *
 * Provides isolated event channels per tenant for multi-tenant
 * real-time updates via SSE.
 */

import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Separate connections for pub and sub (Redis requirement)
const publisher = new Redis(redisUrl);
const subscriber = new Redis(redisUrl);

// =============================================================================
// Channel Names (Tenant-Scoped)
// =============================================================================

const CHANNELS = {
  TENANT_WORLD: (tenantId: string) => `tenant:${tenantId}:events:world`,
  TENANT_AGENT: (tenantId: string, agentId: string) => `tenant:${tenantId}:events:agent:${agentId}`,
  TENANT_TICK: (tenantId: string) => `tenant:${tenantId}:events:tick`,
  // Global channels (for admin/monitoring)
  GLOBAL_TENANTS: 'events:tenants',
} as const;

// =============================================================================
// Event Types
// =============================================================================

export interface TenantWorldEvent {
  id: string;
  tenantId: string;
  type: string;
  tick: number;
  timestamp: number;
  agentId?: string;
  payload: Record<string, unknown>;
}

export interface TenantLifecycleEvent {
  type: 'tenant_created' | 'tenant_started' | 'tenant_stopped' | 'tenant_deleted';
  tenantId: string;
  tenantName: string;
  timestamp: number;
  payload?: Record<string, unknown>;
}

type TenantEventHandler = (event: TenantWorldEvent) => void;
type TenantLifecycleHandler = (event: TenantLifecycleEvent) => void;

// =============================================================================
// Handler Registry
// =============================================================================

const tenantHandlers: Map<string, Set<TenantEventHandler>> = new Map();
const lifecycleHandlers: Set<TenantLifecycleHandler> = new Set();

// Initialize subscriber message handler
subscriber.on('message', (channel: string, message: string) => {
  try {
    // Check if it's a tenant lifecycle event
    if (channel === CHANNELS.GLOBAL_TENANTS) {
      const event: TenantLifecycleEvent = JSON.parse(message);
      lifecycleHandlers.forEach((handler) => handler(event));
      return;
    }

    // Otherwise it's a tenant-scoped event
    const channelHandlers = tenantHandlers.get(channel);
    if (channelHandlers) {
      const event: TenantWorldEvent = JSON.parse(message);
      channelHandlers.forEach((handler) => handler(event));
    }
  } catch (error) {
    console.error('[TenantPubSub] Error parsing message:', error);
  }
});

// =============================================================================
// Publish Functions
// =============================================================================

/**
 * Publish tenant world event
 */
export async function publishTenantEvent(event: TenantWorldEvent): Promise<void> {
  const message = JSON.stringify(event);

  // Publish to tenant's world events channel
  await publisher.publish(CHANNELS.TENANT_WORLD(event.tenantId), message);

  // Publish to agent-specific channel if applicable
  if (event.agentId) {
    await publisher.publish(
      CHANNELS.TENANT_AGENT(event.tenantId, event.agentId),
      message
    );
  }

  // Publish tick events to tick channel
  if (event.type === 'tick_start' || event.type === 'tick_end') {
    await publisher.publish(CHANNELS.TENANT_TICK(event.tenantId), message);
  }
}

/**
 * Publish tenant lifecycle event (global)
 */
export async function publishTenantLifecycleEvent(
  event: TenantLifecycleEvent
): Promise<void> {
  const message = JSON.stringify(event);
  await publisher.publish(CHANNELS.GLOBAL_TENANTS, message);
}

// =============================================================================
// Subscribe Functions
// =============================================================================

/**
 * Subscribe to tenant world events
 */
export async function subscribeToTenantEvents(
  tenantId: string,
  handler: TenantEventHandler
): Promise<() => void> {
  const channel = CHANNELS.TENANT_WORLD(tenantId);

  if (!tenantHandlers.has(channel)) {
    tenantHandlers.set(channel, new Set());
    await subscriber.subscribe(channel);
  }

  tenantHandlers.get(channel)!.add(handler);

  // Return unsubscribe function
  return () => {
    tenantHandlers.get(channel)?.delete(handler);
    if (tenantHandlers.get(channel)?.size === 0) {
      subscriber.unsubscribe(channel);
      tenantHandlers.delete(channel);
    }
  };
}

/**
 * Subscribe to tenant agent events
 */
export async function subscribeToTenantAgentEvents(
  tenantId: string,
  agentId: string,
  handler: TenantEventHandler
): Promise<() => void> {
  const channel = CHANNELS.TENANT_AGENT(tenantId, agentId);

  if (!tenantHandlers.has(channel)) {
    tenantHandlers.set(channel, new Set());
    await subscriber.subscribe(channel);
  }

  tenantHandlers.get(channel)!.add(handler);

  return () => {
    tenantHandlers.get(channel)?.delete(handler);
    if (tenantHandlers.get(channel)?.size === 0) {
      subscriber.unsubscribe(channel);
      tenantHandlers.delete(channel);
    }
  };
}

/**
 * Subscribe to tenant tick events
 */
export async function subscribeToTenantTickEvents(
  tenantId: string,
  handler: TenantEventHandler
): Promise<() => void> {
  const channel = CHANNELS.TENANT_TICK(tenantId);

  if (!tenantHandlers.has(channel)) {
    tenantHandlers.set(channel, new Set());
    await subscriber.subscribe(channel);
  }

  tenantHandlers.get(channel)!.add(handler);

  return () => {
    tenantHandlers.get(channel)?.delete(handler);
    if (tenantHandlers.get(channel)?.size === 0) {
      subscriber.unsubscribe(channel);
      tenantHandlers.delete(channel);
    }
  };
}

/**
 * Subscribe to tenant lifecycle events (global)
 */
export async function subscribeToTenantLifecycle(
  handler: TenantLifecycleHandler
): Promise<() => void> {
  if (lifecycleHandlers.size === 0) {
    await subscriber.subscribe(CHANNELS.GLOBAL_TENANTS);
  }

  lifecycleHandlers.add(handler);

  return () => {
    lifecycleHandlers.delete(handler);
    if (lifecycleHandlers.size === 0) {
      subscriber.unsubscribe(CHANNELS.GLOBAL_TENANTS);
    }
  };
}

// =============================================================================
// Unsubscribe All (For Tenant Cleanup)
// =============================================================================

/**
 * Unsubscribe from all channels for a tenant
 */
export async function unsubscribeFromTenant(tenantId: string): Promise<void> {
  const patterns = [
    CHANNELS.TENANT_WORLD(tenantId),
    CHANNELS.TENANT_TICK(tenantId),
  ];

  for (const pattern of patterns) {
    if (tenantHandlers.has(pattern)) {
      await subscriber.unsubscribe(pattern);
      tenantHandlers.delete(pattern);
    }
  }

  // Unsubscribe from all agent channels for this tenant
  const agentChannelPrefix = `tenant:${tenantId}:events:agent:`;
  for (const channel of tenantHandlers.keys()) {
    if (channel.startsWith(agentChannelPrefix)) {
      await subscriber.unsubscribe(channel);
      tenantHandlers.delete(channel);
    }
  }
}

// =============================================================================
// Cleanup
// =============================================================================

/**
 * Close all pub/sub connections
 */
export async function closeTenantPubSub(): Promise<void> {
  tenantHandlers.clear();
  lifecycleHandlers.clear();
  await publisher.quit();
  await subscriber.quit();
}

// =============================================================================
// Statistics
// =============================================================================

export interface TenantPubSubStats {
  activeChannels: number;
  channelsByTenant: Map<string, number>;
}

export function getTenantPubSubStats(): TenantPubSubStats {
  const channelsByTenant = new Map<string, number>();

  for (const channel of tenantHandlers.keys()) {
    const match = channel.match(/^tenant:([^:]+):/);
    if (match) {
      const tenantId = match[1];
      channelsByTenant.set(tenantId, (channelsByTenant.get(tenantId) || 0) + 1);
    }
  }

  return {
    activeChannels: tenantHandlers.size,
    channelsByTenant,
  };
}
