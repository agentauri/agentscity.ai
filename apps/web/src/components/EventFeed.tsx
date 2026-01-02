import { useMemo } from 'react';
import { useEvents, useAgents, type WorldEvent, type Agent } from '../stores/world';
import { useEventFilters, type EventTypeFilter } from '../stores/visualization';

// Format event type for display
function formatEventType(type: string | undefined): string {
  if (!type) return 'Unknown';
  return type
    .replace('agent_', '')
    .replace(/_/g, ' ')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Get agent by ID
function getAgent(agents: Agent[], agentId?: string): Agent | undefined {
  if (!agentId) return undefined;
  return agents.find((a) => a.id === agentId);
}

// Event item component
function EventItem({ event, agents }: { event: WorldEvent; agents: Agent[] }) {
  const agent = getAgent(agents, event.agentId);
  const reasoning = event.payload?.reasoning as string | undefined;

  return (
    <div className="px-4 py-3 border-b border-city-border/20 hover:bg-city-surface-hover/30 transition-colors">
      <div className="flex items-center gap-2 mb-1">
        {/* Tick badge */}
        <span className="text-[10px] text-city-text-muted font-mono bg-city-bg/50 px-1.5 py-0.5 rounded">
          T{event.tick}
        </span>

        {/* Agent indicator */}
        {agent && (
          <div className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full ring-1 ring-white/10"
              style={{ backgroundColor: agent.color }}
            />
            <span className="text-city-text text-xs font-medium capitalize">
              {agent.llmType}
            </span>
          </div>
        )}
      </div>

      {/* Event type */}
      <div className="text-city-accent text-xs font-medium">
        {formatEventType(event.type)}
      </div>

      {/* Reasoning if present */}
      {reasoning && (
        <div className="mt-1 text-[11px] text-city-text-muted/70 italic line-clamp-2">
          {reasoning}
        </div>
      )}
    </div>
  );
}

// Map event types to filter types
function eventTypeToFilterType(eventType: string): EventTypeFilter | null {
  const mapping: Record<string, EventTypeFilter> = {
    agent_move: 'move',
    agent_gather: 'gather',
    agent_consume: 'consume',
    agent_sleep: 'sleep',
    agent_work: 'work',
    agent_buy: 'buy',
    agent_trade: 'trade',
    agent_traded: 'trade',
    agent_harm: 'harm',
    agent_harmed: 'harm',
    agent_steal: 'steal',
    agent_stole: 'steal',
    agent_deceive: 'deceive',
    agent_deceived: 'deceive',
    agent_share_info: 'share_info',
    agent_died: 'death',
  };
  return mapping[eventType] || null;
}

export function EventFeed() {
  const events = useEvents();
  const agents = useAgents();
  const { visibleTypes, enabled: filterEnabled } = useEventFilters();

  // Show recent events (last 30), filter out malformed events and apply type filter
  const recentEvents = useMemo(() => {
    return events
      .filter((e) => {
        if (!e || !e.id || !e.type) return false;

        // If filtering is enabled, check if this event type is visible
        if (filterEnabled) {
          const filterType = eventTypeToFilterType(e.type);
          if (filterType && !visibleTypes.has(filterType)) {
            return false;
          }
        }

        return true;
      })
      .slice(0, 30);
  }, [events, visibleTypes, filterEnabled]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2.5 border-b border-city-border/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-city-accent">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <h4 className="text-xs font-medium text-city-text uppercase tracking-wider">
            Events
          </h4>
          {recentEvents.length > 0 && (
            <span className="text-xs text-city-text-muted">({recentEvents.length})</span>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {recentEvents.length === 0 ? (
          <div className="p-4 text-city-text-muted text-xs text-center">
            No events yet...
          </div>
        ) : (
          recentEvents.map((event) => (
            <EventItem key={event.id} event={event} agents={agents} />
          ))
        )}
      </div>
    </div>
  );
}
