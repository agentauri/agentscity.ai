import { useRecentEvents } from '../stores/world';

const EVENT_ICONS: Record<string, string> = {
  tick_start: '🕐',
  tick_end: '✅',
  agent_moved: '🚶',
  agent_worked: '💼',
  agent_bought: '🛒',
  agent_consumed: '🍔',
  agent_sleeping: '😴',
  agent_woke: '☀️',
  agent_died: '💀',
  needs_updated: '📊',
  balance_changed: '💰',
  connected: '🔗',
  ping: '📡',
};

function formatEventDescription(event: {
  type: string;
  agentId?: string;
  payload: Record<string, unknown>;
}): string {
  switch (event.type) {
    case 'agent_moved': {
      const to = event.payload.to as { x?: number; y?: number } | undefined;
      return `moved to (${to?.x}, ${to?.y})`;
    }
    case 'agent_worked':
      return `worked for ${event.payload.duration || 1} tick(s)`;
    case 'agent_bought':
      return `bought ${event.payload.quantity}x ${event.payload.itemType}`;
    case 'agent_consumed':
      return `consumed ${event.payload.itemType}`;
    case 'agent_sleeping':
      return 'started sleeping';
    case 'agent_woke':
      return 'woke up';
    case 'agent_died':
      return `died (${event.payload.cause || 'unknown'})`;
    case 'balance_changed': {
      const change = event.payload.change as number;
      return `balance: ${change >= 0 ? '+' : ''}${change} CITY`;
    }
    case 'tick_start':
      return `Tick ${event.payload.tick || 'started'}`;
    case 'tick_end':
      return `completed in ${event.payload.duration}ms`;
    default:
      return event.type;
  }
}

export function EventFeed() {
  const events = useRecentEvents(30);

  if (events.length === 0) {
    return (
      <div className="p-4 text-gray-400 text-sm text-center">
        No events yet...
      </div>
    );
  }

  // Filter out pings before rendering
  const visibleEvents = events.filter((e) => e.type !== 'ping');

  return (
    <div className="p-2 space-y-1">
      <h4 className="px-2 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
        Event Feed
      </h4>
      <div className="space-y-1">
        {visibleEvents.map((event) => {
          const icon = EVENT_ICONS[event.type] || '📌';
          const description = formatEventDescription(event);
          const isAgentEvent = !!event.agentId;

          return (
            <div
              key={`${event.tick}-${event.type}-${event.timestamp}`}
              className={`px-2 py-1.5 rounded text-xs ${
                event.type === 'agent_died'
                  ? 'bg-red-900/30 border border-red-800/50'
                  : 'bg-city-bg/50'
              }`}
            >
              <div className="flex items-start gap-2">
                <span className="shrink-0">{icon}</span>
                <div className="flex-1 min-w-0">
                  {isAgentEvent && (
                    <span className="font-medium text-gray-300">
                      Agent {event.agentId?.slice(0, 6)}...{' '}
                    </span>
                  )}
                  <span className="text-gray-400">{description}</span>
                </div>
                <span className="text-gray-500 shrink-0">t{event.tick}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
