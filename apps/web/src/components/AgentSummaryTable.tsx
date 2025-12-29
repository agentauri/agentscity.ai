import { useState, useCallback, useRef, useEffect, useMemo, type ReactNode } from 'react';
import { useAgents, useEvents, useWorldStore, type Agent, type WorldEvent } from '../stores/world';

// LLM types that are always visible
const ALWAYS_VISIBLE_LLMS = ['claude', 'codex', 'gemini'];

// Strategy icons as SVG components
const StrategyIcon = ({ type }: { type: string }) => {
  const icons: Record<string, ReactNode> = {
    worker: (
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-status-warning">
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </svg>
    ),
    explorer: (
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-status-info">
        <circle cx="12" cy="12" r="10" />
        <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
      </svg>
    ),
    sleeper: (
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-city-text-muted">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    ),
    consumer: (
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-status-success">
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      </svg>
    ),
    gatherer: (
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-400">
        <path d="M12 2a10 10 0 1 0 10 10" />
        <path d="M12 12V2" />
        <path d="M12 12l7-7" />
      </svg>
    ),
    idle: (
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-city-text-muted">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),
    undecided: (
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-city-text-muted">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  };

  return <>{icons[type] || icons.idle}</>;
};

// Strategy calculation based on recent events
function calculateStrategy(agentId: string, events: WorldEvent[]): { type: string; label: string } {
  // Only count actual action events (filter out decay notifications, tick events, etc.)
  const actionEvents = events
    .filter((e) => e.agentId === agentId && e.type.startsWith('agent_'))
    .slice(0, 20);

  if (actionEvents.length === 0) {
    return { type: 'idle', label: 'Idle' };
  }

  // Check if last action was fallback
  const lastEvent = actionEvents[0];
  if (lastEvent?.payload?.usedFallback) {
    return { type: 'idle', label: 'Fallback' };
  }

  // Count action types
  const actionCounts: Record<string, number> = {};
  for (const event of actionEvents) {
    const action = (event.payload?.action as string) || event.type;
    actionCounts[action] = (actionCounts[action] || 0) + 1;
  }

  const total = actionEvents.length;
  const workCount = (actionCounts['work'] || 0) + (actionCounts['agent_worked'] || 0);
  const moveCount = (actionCounts['move'] || 0) + (actionCounts['agent_move'] || 0);
  const sleepCount = (actionCounts['sleep'] || 0) + (actionCounts['agent_sleep'] || 0);
  const gatherCount = (actionCounts['gather'] || 0) + (actionCounts['agent_gather'] || 0);
  const consumeCount = (actionCounts['buy'] || 0) + (actionCounts['consume'] || 0);

  // Determine dominant strategy based on most frequent action
  const strategies = [
    { type: 'worker', label: 'Worker', count: workCount },
    { type: 'explorer', label: 'Explorer', count: moveCount },
    { type: 'sleeper', label: 'Sleeper', count: sleepCount },
    { type: 'gatherer', label: 'Gatherer', count: gatherCount },
    { type: 'consumer', label: 'Consumer', count: consumeCount },
  ];

  const dominant = strategies.reduce((a, b) => (b.count > a.count ? b : a));

  // Need at least 2 actions of this type to show a strategy
  if (dominant.count >= 2) {
    return { type: dominant.type, label: dominant.label };
  }

  return { type: 'undecided', label: 'Undecided' };
}

export function AgentSummaryTable() {
  const agents = useAgents();
  const events = useEvents();
  const selectAgent = useWorldStore((s) => s.selectAgent);
  const [position, setPosition] = useState({ x: 20, y: 72 });
  const [isDragging, setIsDragging] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, startPosX: 0, startPosY: 0 });

  // Filter agents: show always visible LLMs + active agents (exclude dead)
  const visibleAgents = useMemo(() => {
    return agents.filter((agent) => {
      // Check state field for death, not health (dead agents may have health > 0)
      if (agent.state === 'dead') return false;

      // Always show Claude, Codex, Gemini
      if (ALWAYS_VISIBLE_LLMS.includes(agent.llmType.toLowerCase())) {
        return true;
      }

      // Show all if toggle is on
      if (showAll) return true;

      // Otherwise, only show if agent has recent activity
      const recentEvents = events.filter((e) => e.agentId === agent.id).slice(0, 10);
      return recentEvents.length > 0;
    });
  }, [agents, events, showAll]);

  // Calculate strategies for visible agents
  const agentStrategies = useMemo(() => {
    const strategies: Record<string, { type: string; label: string }> = {};
    for (const agent of visibleAgents) {
      strategies[agent.id] = calculateStrategy(agent.id, events);
    }
    return strategies;
  }, [visibleAgents, events]);

  // Drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: position.x,
      startPosY: position.y,
    };
  }, [position]);

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

  // Sort by balance (richest first)
  const sortedAgents = [...visibleAgents].sort((a, b) => b.balance - a.balance);

  return (
    <div
      className="floating-panel fixed"
      style={{
        left: position.x,
        top: position.y,
        zIndex: 100,
        minWidth: isCollapsed ? 'auto' : '340px',
      }}
    >
      {/* Header - Draggable */}
      <div
        className="panel-header cursor-move select-none"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-city-accent">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span className="font-medium text-city-text text-sm">Agents</span>
          <span className="text-xs text-city-text-muted">({sortedAgents.length})</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowAll(!showAll)}
            className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
              showAll
                ? 'bg-city-accent/20 text-city-accent'
                : 'text-city-text-muted hover:text-city-accent hover:bg-city-surface-hover'
            }`}
            title={showAll ? 'Show active only' : 'Show all agents'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
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

      {/* Table */}
      {!isCollapsed && (
        <div className="p-3">
          <table className="w-full">
            <thead>
              <tr className="text-city-text-muted text-[10px] uppercase tracking-wider">
                <th className="text-left pb-2 font-medium">Agent</th>
                <th className="text-right pb-2 font-medium">Balance</th>
                <th className="text-left pb-2 pl-4 font-medium">Strategy</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {sortedAgents.map((agent, index) => {
                const strategy = agentStrategies[agent.id];
                return (
                  <tr
                    key={agent.id}
                    className="group hover:bg-city-surface-hover/50 transition-colors cursor-pointer"
                    onClick={() => selectAgent(agent.id)}
                  >
                    <td className="py-1.5 rounded-l">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2.5 h-2.5 rounded-full ring-1 ring-white/10"
                          style={{ backgroundColor: agent.color }}
                        />
                        <span className="text-city-text capitalize text-xs font-medium">
                          {agent.llmType}
                        </span>
                      </div>
                    </td>
                    <td className="text-right py-1.5">
                      <span className="font-mono text-xs">
                        <span className="text-city-accent font-medium">{agent.balance}</span>
                        <span className="text-city-text-muted ml-1">CITY</span>
                      </span>
                    </td>
                    <td className="pl-4 py-1.5 rounded-r">
                      <div className="flex items-center gap-1.5">
                        <StrategyIcon type={strategy?.type || 'idle'} />
                        <span className="text-city-text-muted text-xs">
                          {strategy?.label}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {sortedAgents.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center text-city-text-muted py-6 text-xs">
                    No active agents
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
