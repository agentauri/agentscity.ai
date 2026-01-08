import React, { useState, useCallback, useMemo, memo, type ReactNode } from 'react';
import { useAgents, useEvents, useWorldStore, type WorldEvent } from '../stores/world';
import { useDraggablePanel } from '../hooks/useDraggablePanel';
import { clampPercent, isValidLlmType, sanitizeText } from '../utils/security';

// =============================================================================
// Constants
// =============================================================================

/** LLM types that are always visible in the table */
const ALWAYS_VISIBLE_LLMS = ['claude', 'codex', 'gemini'];

/** Initial panel position */
const INITIAL_POSITION = { x: 20, y: 72 };

/** Minimum panel width */
const MIN_PANEL_WIDTH = 480;

// =============================================================================
// Strategy Icons (defined outside component to prevent recreation)
// =============================================================================

/** Personality trait colors matching the config panel */
const PERSONALITY_COLORS: Record<string, string> = {
  aggressive: '#ef4444', // red
  cooperative: '#22c55e', // green
  cautious: '#eab308',   // yellow
  explorer: '#3b82f6',   // blue
  social: '#a855f7',     // purple
  neutral: '#6b7280',    // gray
};

const STRATEGY_ICONS: Record<string, ReactNode> = {
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

/** Memoized strategy icon component */
const StrategyIcon = memo(({ type }: { type: string }) => {
  return <>{STRATEGY_ICONS[type] || STRATEGY_ICONS.idle}</>;
});

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
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());

  // Use draggable panel hook (replaces manual drag logic)
  const { position, handlers } = useDraggablePanel({
    initialPosition: INITIAL_POSITION,
    clampToViewport: true,
  });

  // Toggle agent expansion
  const toggleAgentExpand = useCallback((agentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
      }
      return next;
    });
  }, []);

  // Pre-compute set of agent IDs with recent activity (O(1) lookup instead of O(n))
  const activeAgentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const event of events) {
      if (event.agentId) {
        ids.add(event.agentId);
      }
    }
    return ids;
  }, [events]);

  // Filter agents: show always visible LLMs + active agents (exclude dead)
  const visibleAgents = useMemo(() => {
    return agents.filter((agent) => {
      // Check state field for death, not health (dead agents may have health > 0)
      if (agent.state === 'dead') return false;

      // Validate llmType
      const llmTypeLower = agent.llmType.toLowerCase();
      if (!isValidLlmType(llmTypeLower)) return false;

      // Always show Claude, Codex, Gemini
      if (ALWAYS_VISIBLE_LLMS.includes(llmTypeLower)) {
        return true;
      }

      // Show all if toggle is on
      if (showAll) return true;

      // Otherwise, only show if agent has recent activity (O(1) lookup)
      return activeAgentIds.has(agent.id);
    });
  }, [agents, activeAgentIds, showAll]);

  // Calculate strategies for visible agents
  const agentStrategies = useMemo(() => {
    const strategies: Record<string, { type: string; label: string }> = {};
    for (const agent of visibleAgents) {
      strategies[agent.id] = calculateStrategy(agent.id, events);
    }
    return strategies;
  }, [visibleAgents, events]);

  // Calculate personality distribution (only for living agents with personalities)
  const personalityDistribution = useMemo(() => {
    const dist: Record<string, number> = {};
    let hasAnyPersonality = false;
    for (const agent of visibleAgents) {
      if (agent.personality) {
        dist[agent.personality] = (dist[agent.personality] || 0) + 1;
        hasAnyPersonality = true;
      }
    }
    return hasAnyPersonality ? dist : null;
  }, [visibleAgents]);

  // Memoized select handler to avoid inline function in render
  const handleSelectAgent = useCallback((agentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    selectAgent(agentId);
  }, [selectAgent]);

  // Sort by balance (richest first)
  const sortedAgents = [...visibleAgents].sort((a, b) => b.balance - a.balance);

  return (
    <div
      className="floating-panel fixed"
      style={{
        left: position.x,
        top: position.y,
        zIndex: 100,
        minWidth: isCollapsed ? 'auto' : `${MIN_PANEL_WIDTH}px`,
      }}
    >
      {/* Header - Draggable */}
      <div
        className="panel-header cursor-move select-none"
        onMouseDown={handlers.onDragStart}
        onPointerDown={handlers.onDragStart}
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

      {/* Personality Distribution Bar */}
      {!isCollapsed && personalityDistribution && (
        <div className="px-3 pt-2 pb-1 border-b border-city-border/30">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] text-city-text-muted uppercase tracking-wider">Personalities</span>
          </div>
          <div className="flex h-2 rounded overflow-hidden bg-city-bg">
            {Object.entries(personalityDistribution).map(([trait, count]) => {
              const total = Object.values(personalityDistribution).reduce((a, b) => a + b, 0);
              const percentage = (count / total) * 100;
              return (
                <div
                  key={trait}
                  className="h-full transition-all duration-300"
                  style={{
                    width: `${percentage}%`,
                    backgroundColor: PERSONALITY_COLORS[trait] || '#6b7280',
                  }}
                  title={`${trait}: ${count} (${Math.round(percentage)}%)`}
                />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
            {Object.entries(personalityDistribution).map(([trait, count]) => (
              <div key={trait} className="flex items-center gap-1">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: PERSONALITY_COLORS[trait] || '#6b7280' }}
                />
                <span className="text-[10px] text-city-text-muted capitalize">{trait}: {count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      {!isCollapsed && (
        <div className="p-3">
          <table className="w-full">
            <thead>
              <tr className="text-city-text-muted text-[10px] uppercase tracking-wider">
                <th className="text-left pb-2 font-medium">Agent</th>
                <th className="text-center pb-2 font-medium">HP</th>
                <th className="text-center pb-2 font-medium">HUN</th>
                <th className="text-center pb-2 font-medium">NRG</th>
                <th className="text-right pb-2 font-medium">Balance</th>
                <th className="text-left pb-2 pl-4 font-medium">Strategy</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {sortedAgents.map((agent) => {
                const strategy = agentStrategies[agent.id];
                const isExpanded = expandedAgents.has(agent.id);
                const displayName = sanitizeText(agent.llmType, 20);
                return (
                  <React.Fragment key={agent.id}>
                    <tr
                      className="group hover:bg-city-surface-hover/50 transition-colors cursor-pointer"
                      onClick={(e) => handleSelectAgent(agent.id, e)}
                    >
                      <td className="py-1.5 rounded-l">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2.5 h-2.5 rounded-full ring-1 ring-white/10"
                            style={{ backgroundColor: agent.color }}
                          />
                          <span className="text-city-text capitalize text-xs font-medium">
                            {displayName}
                          </span>
                        </div>
                      </td>
                      <td className="text-center py-1.5">
                        <span className={`font-mono text-xs font-medium ${agent.health < 30 ? 'text-status-error' : agent.health < 60 ? 'text-status-warning' : 'text-status-success'}`}>
                          {Math.round(agent.health)}
                        </span>
                      </td>
                      <td className="text-center py-1.5">
                        <span className={`font-mono text-xs font-medium ${agent.hunger < 20 ? 'text-status-error' : agent.hunger < 40 ? 'text-status-warning' : 'text-city-text'}`}>
                          {Math.round(agent.hunger)}
                        </span>
                      </td>
                      <td className="text-center py-1.5">
                        <span className={`font-mono text-xs font-medium ${agent.energy < 20 ? 'text-status-error' : agent.energy < 40 ? 'text-status-warning' : 'text-city-text'}`}>
                          {Math.round(agent.energy)}
                        </span>
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
                    {/* Expanded details */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={6} className="pb-2">
                          <div className="ml-6 pl-3 border-l-2 border-city-border/30 py-2 space-y-2">
                            {/* Position */}
                            <div className="flex items-center gap-4 text-xs">
                              <span className="text-city-text-muted">Position:</span>
                              <span className="font-mono text-city-text">({agent.x}, {agent.y})</span>
                              <span className="text-city-text-muted">State:</span>
                              <span className={`capitalize ${agent.state === 'dead' ? 'text-status-error' : 'text-city-text'}`}>
                                {agent.state}
                              </span>
                            </div>
                            {/* Vitals */}
                            <div className="grid grid-cols-3 gap-3">
                              <div className="space-y-1">
                                <div className="flex justify-between text-[10px]">
                                  <span className="text-city-text-muted">Health</span>
                                  <span className={agent.health < 30 ? 'text-status-error' : 'text-city-text'}>{Math.round(clampPercent(agent.health))}</span>
                                </div>
                                <div className="h-1 bg-city-bg rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${agent.health < 30 ? 'bg-status-error' : 'bg-status-success'}`}
                                    style={{ width: `${clampPercent(agent.health)}%` }}
                                  />
                                </div>
                              </div>
                              <div className="space-y-1">
                                <div className="flex justify-between text-[10px]">
                                  <span className="text-city-text-muted">Hunger</span>
                                  <span className={agent.hunger < 20 ? 'text-status-error' : 'text-city-text'}>{Math.round(clampPercent(agent.hunger))}</span>
                                </div>
                                <div className="h-1 bg-city-bg rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${agent.hunger < 20 ? 'bg-status-error' : 'bg-status-warning'}`}
                                    style={{ width: `${clampPercent(agent.hunger)}%` }}
                                  />
                                </div>
                              </div>
                              <div className="space-y-1">
                                <div className="flex justify-between text-[10px]">
                                  <span className="text-city-text-muted">Energy</span>
                                  <span className={agent.energy < 20 ? 'text-status-error' : 'text-city-text'}>{Math.round(clampPercent(agent.energy))}</span>
                                </div>
                                <div className="h-1 bg-city-bg rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${agent.energy < 20 ? 'bg-status-error' : 'bg-status-info'}`}
                                    style={{ width: `${clampPercent(agent.energy)}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                            {/* Select button */}
                            <button
                              onClick={(e) => handleSelectAgent(agent.id, e)}
                              className="text-[10px] text-city-accent hover:text-city-accent/80 transition-colors"
                            >
                              View on map →
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {sortedAgents.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-city-text-muted py-6 text-xs">
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
