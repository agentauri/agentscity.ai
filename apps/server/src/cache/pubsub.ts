/**
 * Redis Pub/Sub for real-time event broadcasting
 */

import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Separate connections for pub and sub (Redis requirement)
const publisher = new Redis(redisUrl);
const subscriber = new Redis(redisUrl);

const CHANNELS = {
  WORLD_EVENTS: 'events:world',
  AGENT_EVENTS: (agentId: string) => `events:agent:${agentId}`,
  TICK_EVENTS: 'events:tick',
} as const;

export interface WorldEvent {
  id: string;
  type: string;
  tick: number;
  timestamp: number;
  agentId?: string;
  payload: Record<string, unknown>;
}

type EventHandler = (event: WorldEvent) => void;

const handlers: Map<string, Set<EventHandler>> = new Map();

// Initialize subscriber
subscriber.on('message', (channel: string, message: string) => {
  const channelHandlers = handlers.get(channel);
  if (channelHandlers) {
    const event: WorldEvent = JSON.parse(message);
    channelHandlers.forEach((handler) => handler(event));
  }
});

// Publish event
export async function publishEvent(event: WorldEvent): Promise<void> {
  const message = JSON.stringify(event);

  // Publish to world events channel
  await publisher.publish(CHANNELS.WORLD_EVENTS, message);

  // Publish to agent-specific channel if applicable
  if (event.agentId) {
    await publisher.publish(CHANNELS.AGENT_EVENTS(event.agentId), message);
  }

  // Publish tick events
  if (event.type === 'tick_start' || event.type === 'tick_end') {
    await publisher.publish(CHANNELS.TICK_EVENTS, message);
  }
}

// Subscribe to world events
export async function subscribeToWorldEvents(handler: EventHandler): Promise<() => void> {
  const channel = CHANNELS.WORLD_EVENTS;

  if (!handlers.has(channel)) {
    handlers.set(channel, new Set());
    await subscriber.subscribe(channel);
  }

  handlers.get(channel)!.add(handler);

  // Return unsubscribe function
  return () => {
    handlers.get(channel)?.delete(handler);
    if (handlers.get(channel)?.size === 0) {
      subscriber.unsubscribe(channel);
      handlers.delete(channel);
    }
  };
}

// Subscribe to agent-specific events
export async function subscribeToAgentEvents(
  agentId: string,
  handler: EventHandler
): Promise<() => void> {
  const channel = CHANNELS.AGENT_EVENTS(agentId);

  if (!handlers.has(channel)) {
    handlers.set(channel, new Set());
    await subscriber.subscribe(channel);
  }

  handlers.get(channel)!.add(handler);

  return () => {
    handlers.get(channel)?.delete(handler);
    if (handlers.get(channel)?.size === 0) {
      subscriber.unsubscribe(channel);
      handlers.delete(channel);
    }
  };
}

// Cleanup
export async function closePubSub(): Promise<void> {
  await publisher.quit();
  await subscriber.quit();
}
