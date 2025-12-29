import { useState, useCallback, useRef, useEffect, useMemo, type ReactNode } from 'react';
import { useEvents, useAgents, type WorldEvent, type Agent } from '../stores/world';

// Format action type for display
function formatAction(event: WorldEvent): string {
  const action = (event.payload?.action as string) || event.type;
  return action
    .replace('agent_', '')
    .replace(/_/g, ' ')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Get action icon
function ActionIcon({ type }: { type: string }) {
  // Map tick-engine types to handler types for icon lookup
  const typeMap: Record<string, string> = {
    agent_move: 'agent_moved',
    agent_work: 'agent_worked',
    agent_sleep: 'agent_sleeping',
    agent_buy: 'agent_bought',
    agent_consume: 'agent_consumed',
  };
  const mappedType = typeMap[type] || type;

  const icons: Record<string, ReactNode> = {
    agent_moved: (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-status-info">
        <circle cx="12" cy="12" r="10" />
        <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
      </svg>
    ),
    agent_worked: (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-status-warning">
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </svg>
    ),
    agent_sleeping: (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-status-info">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    ),
    agent_woke: (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-status-warning">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
    ),
    agent_died: (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-status-error">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
    agent_bought: (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-status-success">
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      </svg>
    ),
    agent_consumed: (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-status-success">
        <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
        <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
        <line x1="6" y1="1" x2="6" y2="4" />
        <line x1="10" y1="1" x2="10" y2="4" />
        <line x1="14" y1="1" x2="14" y2="4" />
      </svg>
    ),
    balance_changed: (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-city-accent">
        <circle cx="12" cy="12" r="10" />
        <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
        <path d="M12 18V6" />
      </svg>
    ),
  };

  return <>{icons[mappedType] || icons.agent_moved}</>;
}

// Get agent by ID
function getAgent(agents: Agent[], agentId?: string): Agent | undefined {
  if (!agentId) return undefined;
  return agents.find((a) => a.id === agentId);
}

// Balance delta component
function BalanceDelta({ payload }: { payload: Record<string, unknown> }) {
  const newBal = (payload?.newBalance as number) || 0;
  const oldBal = (payload?.oldBalance as number) || 0;
  const delta = newBal - oldBal;

  return (
    <span className={`text-xs font-mono font-medium ${delta > 0 ? 'text-status-success' : 'text-status-error'}`}>
      {delta > 0 ? '+' : ''}{delta}
    </span>
  );
}

export function DecisionLog() {
  const events = useEvents();
  const agents = useAgents();
  const [position, setPosition] = useState({ x: 20, y: 320 });
  const [isDragging, setIsDragging] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [filterAgent, setFilterAgent] = useState<string | null>(null);
  const dragRef = useRef({ startX: 0, startY: 0, startPosX: 0, startPosY: 0 });

  // Filter and format events
  const decisionEvents = useMemo(() => {
    // Show ONLY tick-engine decision events (present tense - contain reasoning)
    // Handler events (agent_moved, etc.) are just confirmations without decision context
    const actionTypes = [
      'agent_move',
      'agent_work',
      'agent_sleep',
      'agent_buy',
      'agent_consume',
    ];

    return events
      .filter((e) => actionTypes.includes(e.type))
      .filter((e) => !filterAgent || e.agentId === filterAgent)
      .slice(0, 25);
  }, [events, filterAgent]);

  // All alive agents for filter dropdown
  const aliveAgents = useMemo(() => {
    return agents.filter((a) => a.health > 0);
  }, [agents]);

  // Drag handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startPosX: position.x,
        startPosY: position.y,
      };
    },
    [position]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setPosition({
        x: dragRef.current.startPosX + dx,
        y: dragRef.current.startPosY + dy,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div
      className="floating-panel fixed"
      style={{
        left: position.x,
        top: position.y,
        zIndex: 99,
        minWidth: isCollapsed ? 'auto' : '380px',
        maxWidth: '420px',
        maxHeight: isCollapsed ? 'auto' : '320px',
      }}
    >
      {/* Header - Draggable */}
      <div
        className="panel-header cursor-move select-none"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-city-accent">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span className="font-medium text-city-text text-sm">Decisions</span>
          <span className="text-xs text-city-text-muted">({decisionEvents.length})</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Agent filter */}
          <select
            value={filterAgent || ''}
            onChange={(e) => setFilterAgent(e.target.value || null)}
            className="text-xs bg-city-bg border border-city-border/50 rounded px-2 py-1 text-city-text focus:border-city-accent focus:outline-none"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <option value="">All</option>
            {aliveAgents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.llmType}
              </option>
            ))}
          </select>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="w-6 h-6 rounded flex items-center justify-center text-city-text-muted hover:text-city-accent hover:bg-city-surface-hover transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${isCollapsed ? 'rotate-180' : ''}`}>
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Decision list */}
      {!isCollapsed && (
        <div className="overflow-y-auto" style={{ maxHeight: '260px' }}>
          {decisionEvents.length === 0 ? (
            <div className="p-6 text-center text-city-text-muted text-xs">
              No decisions yet
            </div>
          ) : (
            <div className="divide-y divide-city-border/30">
              {decisionEvents.map((event) => {
                const agent = getAgent(agents, event.agentId);
                const usedFallback = event.payload?.usedFallback as boolean;
                const reasoning = event.payload?.reasoning as string;
                const processingTime = event.payload?.processingTimeMs as number;

                return (
                  <div
                    key={event.id}
                    className={`px-4 py-3 hover:bg-city-surface-hover/30 transition-colors ${
                      usedFallback ? 'bg-status-warning/5' : ''
                    }`}
                  >
                    {/* Header line */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-city-text-muted font-mono bg-city-bg/50 px-1.5 py-0.5 rounded">
                          {event.tick}
                        </span>
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
                        {usedFallback && (
                          <span
                            className="text-[10px] text-status-warning bg-status-warning/10 px-1.5 py-0.5 rounded"
                            title="Fallback action used"
                          >
                            Fallback
                          </span>
                        )}
                      </div>
                      {processingTime !== undefined && (
                        <span className="text-[10px] text-city-text-muted font-mono">
                          {processingTime}ms
                        </span>
                      )}
                    </div>

                    {/* Action */}
                    <div className="flex items-center gap-2">
                      <ActionIcon type={event.type} />
                      <span className="text-city-accent font-medium text-sm">
                        {formatAction(event)}
                      </span>
                      {/* Position info for move events */}
                      {event.type === 'agent_moved' && event.payload?.to != null && (
                        <span className="text-city-text-muted text-xs font-mono">
                          ({String((event.payload.to as { x: number }).x)},{' '}
                          {String((event.payload.to as { y: number }).y)})
                        </span>
                      )}
                      {/* Balance change info */}
                      {event.type === 'balance_changed' && (
                        <BalanceDelta payload={event.payload} />
                      )}
                    </div>

                    {/* Reasoning */}
                    {reasoning && (
                      <div className="mt-2 text-xs text-city-text-muted/80 italic pl-6 border-l-2 border-city-border/30">
                        {reasoning}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
