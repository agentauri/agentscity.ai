import { useCallback, useRef, useState } from 'react';
import { useWorldStore, type WorldEvent, type AgentBubble } from '../stores/world';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

// Map event types to bubble content (using LLM reasoning when available)
function getBubbleContent(event: WorldEvent): { emoji: string; text: string } | null {
  const reasoning = event.payload?.reasoning as string | undefined;

  switch (event.type) {
    // Tick-engine decision events (present tense - have reasoning)
    case 'agent_move':
      return { emoji: '🚶', text: reasoning || 'Moving...' };
    case 'agent_work':
      return { emoji: '🏭', text: reasoning || 'Working...' };
    case 'agent_sleep':
      return { emoji: '💤', text: reasoning || 'Sleeping...' };
    case 'agent_buy':
      return { emoji: '🛒', text: reasoning || 'Buying...' };
    case 'agent_consume':
      return { emoji: '🍔', text: reasoning || 'Eating...' };
    // Action handler events (past tense)
    case 'agent_moved':
      return { emoji: '🚶', text: reasoning || 'Moved!' };
    case 'agent_worked':
      return { emoji: '🏭', text: reasoning || 'Worked!' };
    case 'agent_sleeping':
      return { emoji: '💤', text: reasoning || 'Sleeping...' };
    case 'agent_woke':
      return { emoji: '☀️', text: reasoning || 'Awake!' };
    case 'agent_bought':
      return { emoji: '🛒', text: reasoning || 'Bought!' };
    case 'agent_consumed':
      return { emoji: '🍔', text: reasoning || 'Ate!' };
    case 'balance_changed': {
      const delta = (event.payload.newBalance as number) - (event.payload.oldBalance as number || 0);
      if (delta > 0) return { emoji: '💰', text: `+${delta} CITY` };
      if (delta < 0) return { emoji: '💸', text: `${delta} CITY` };
      return null;
    }
    case 'agent_died':
      return { emoji: '💀', text: 'Died!' };
    default:
      return null;
  }
}

export function useSSE() {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const { updateWorldState, setTick, updateAgent, addEvent, addBubble } = useWorldStore();

  const handleEvent = useCallback(
    (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as WorldEvent;

        // Add to event feed
        addEvent(data);

        // Create bubble for agent if applicable
        if (data.agentId) {
          const bubbleContent = getBubbleContent(data);
          if (bubbleContent) {
            addBubble({
              agentId: data.agentId,
              text: bubbleContent.text,
              emoji: bubbleContent.emoji,
              timestamp: Date.now(),
            });
          }
        }

        // Handle specific event types
        switch (data.type) {
          case 'connected':
          case 'ping':
            // Connection and keep-alive events, no action needed
            break;

          case 'tick_start':
            setTick(data.tick);
            break;

          case 'tick_end':
            setTick(data.tick);
            break;

          case 'agent_move':
            // Tick-engine decision event - update position from params
            if (data.agentId && data.payload.params) {
              const params = data.payload.params as { toX: number; toY: number };
              updateAgent(data.agentId, { x: params.toX, y: params.toY, state: 'walking' });
            }
            break;

          case 'agent_moved':
            // Action handler confirmation - update position from to
            if (data.agentId && data.payload.to) {
              const to = data.payload.to as { x: number; y: number };
              updateAgent(data.agentId, { x: to.x, y: to.y, state: 'idle' });
            }
            break;

          case 'agent_work':
            // Tick-engine decision event - set working state
            if (data.agentId) {
              updateAgent(data.agentId, { state: 'working' });
            }
            break;

          case 'agent_worked':
            // Action handler confirmation
            if (data.agentId) {
              updateAgent(data.agentId, { state: 'working' });
            }
            break;

          case 'agent_sleep':
            // Tick-engine decision event - set sleeping state
            if (data.agentId) {
              updateAgent(data.agentId, { state: 'sleeping' });
            }
            break;

          case 'agent_sleeping':
            // Action handler confirmation
            if (data.agentId) {
              updateAgent(data.agentId, { state: 'sleeping' });
            }
            break;

          case 'agent_woke':
            if (data.agentId) {
              updateAgent(data.agentId, { state: 'idle' });
            }
            break;

          case 'needs_updated':
            if (data.agentId && data.payload) {
              const { hunger, energy, health } = data.payload as {
                hunger?: number;
                energy?: number;
                health?: number;
              };
              updateAgent(data.agentId, {
                ...(hunger !== undefined && { hunger }),
                ...(energy !== undefined && { energy }),
                ...(health !== undefined && { health }),
              });
            }
            break;

          case 'balance_changed':
            if (data.agentId && data.payload.newBalance !== undefined) {
              updateAgent(data.agentId, {
                balance: data.payload.newBalance as number,
              });
            }
            break;

          case 'agent_died':
            if (data.agentId) {
              updateAgent(data.agentId, { health: 0, state: 'dead' });
            }
            break;

          default:
            console.log('[SSE] Unhandled event type:', data.type);
        }
      } catch (error) {
        console.error('[SSE] Failed to parse event:', error);
      }
    },
    [addEvent, addBubble, setTick, updateAgent]
  );

  const connect = useCallback(async () => {
    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Clear any pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setStatus('connecting');

    // Fetch initial world state (preserving events)
    try {
      const response = await fetch('/api/world/state');
      const data = await response.json();
      updateWorldState(data);
    } catch (error) {
      console.error('[SSE] Failed to fetch initial state:', error);
    }

    // Connect to SSE
    const eventSource = new EventSource('/api/events');
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setStatus('connected');
      console.log('[SSE] Connection established');
    };

    eventSource.onmessage = handleEvent;

    // Handle named events
    eventSource.addEventListener('connected', handleEvent);
    eventSource.addEventListener('tick_start', handleEvent);
    eventSource.addEventListener('tick_end', handleEvent);
    // Action handler events (past tense)
    eventSource.addEventListener('agent_moved', handleEvent);
    eventSource.addEventListener('agent_worked', handleEvent);
    eventSource.addEventListener('agent_sleeping', handleEvent);
    eventSource.addEventListener('agent_woke', handleEvent);
    eventSource.addEventListener('agent_died', handleEvent);
    eventSource.addEventListener('agent_bought', handleEvent);
    eventSource.addEventListener('agent_consumed', handleEvent);
    // Tick-engine decision events (present tense - contain reasoning)
    eventSource.addEventListener('agent_move', handleEvent);
    eventSource.addEventListener('agent_work', handleEvent);
    eventSource.addEventListener('agent_sleep', handleEvent);
    eventSource.addEventListener('agent_buy', handleEvent);
    eventSource.addEventListener('agent_consume', handleEvent);
    // Other events
    eventSource.addEventListener('needs_updated', handleEvent);
    eventSource.addEventListener('balance_changed', handleEvent);
    eventSource.addEventListener('ping', () => {
      // Keep-alive, no action needed
    });

    eventSource.onerror = () => {
      setStatus('disconnected');
      console.log('[SSE] Connection lost, reconnecting in 3s...');
      eventSource.close();

      // Reconnect after 3 seconds
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect();
      }, 3000);
    };
  }, [handleEvent, updateWorldState]);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setStatus('disconnected');
  }, []);

  return { status, connect, disconnect };
}
