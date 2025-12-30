/**
 * AgentsCity - Scientific Mode
 *
 * Simplified interface for the scientific experiment:
 * - No city editor (resources/shelters are spawned automatically)
 * - Grid visualization shows agents, resources, shelters
 * - Focus on observing emergent behavior
 * - Toggle between 2D and Isometric views
 * - Mobile-responsive with bottom navigation on small screens
 */

import { useEffect, useCallback, useState } from 'react';
import { useSSE } from './hooks/useSSE';
import { useWorldStore, useAgents, useEvents } from './stores/world';
import { useEditorStore, useAppMode, useIsAnalyticsMode, useIsReplayMode, useIsPaused, useViewMode } from './stores/editor';
import { useWorldControl } from './hooks/useWorldControl';
import { Layout } from './components/Layout';
import { ScientificCanvas } from './components/Canvas/ScientificCanvas';
import { ScientificIsometricCanvas } from './components/Canvas/ScientificIsometricCanvas';
import { EventFeed } from './components/EventFeed';
import { AgentProfile } from './components/AgentProfile';
import { WorldStats } from './components/WorldStats';
import { AgentSummaryTable } from './components/AgentSummaryTable';
import { DecisionLog } from './components/DecisionLog';
import { ModeControls, ViewToggle } from './components/Controls';
import { MobileNav, type MobileView } from './components/MobileNav';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { ReplayPage } from './pages/ReplayPage';
import { useReplayStore } from './stores/replay';
import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  const { status, connect, disconnect } = useSSE();
  const selectedAgentId = useWorldStore((s) => s.selectedAgentId);
  const { resetWorld, setWorldState, setEvents, updateWorldState } = useWorldStore();
  const { setMode, setPaused } = useEditorStore();
  const mode = useAppMode();
  const viewMode = useViewMode();
  const isAnalyticsMode = useIsAnalyticsMode();
  const isReplayMode = useIsReplayMode();
  const isPaused = useIsPaused();
  const { enterReplayMode, exitReplayMode } = useReplayStore();
  const [hasSynced, setHasSynced] = useState(false);

  // Mobile navigation state
  const [mobileView, setMobileView] = useState<MobileView>('canvas');
  const agents = useAgents();
  const events = useEvents();
  const aliveAgents = agents.filter(a => a.health > 0);

  // World control hook for BE API
  const { fetchState, start, pause, resume, reset, fetchRecentEvents } = useWorldControl();

  // Sync with backend on mount (restore running simulation)
  useEffect(() => {
    if (hasSynced) return;

    const syncWithBackend = async () => {
      const state = await fetchState();
      if (state && state.isRunning) {
        console.log('[App] Restoring simulation state from backend:', state);

        // Set world state with scientific model data
        setWorldState({
          tick: state.tick,
          agents: state.agents || [],
          resourceSpawns: state.resourceSpawns || [],
          shelters: state.shelters || [],
        });

        // Fetch and set recent events BEFORE switching mode
        const recentEvents = await fetchRecentEvents(100);
        if (recentEvents.length > 0) {
          console.log('[App] Loaded', recentEvents.length, 'recent events');
          setEvents(recentEvents);
        }

        // Switch to simulation mode
        setPaused(state.isPaused);
        setMode('simulation');
      }
      setHasSynced(true);
    };

    syncWithBackend();
  }, [hasSynced, fetchState, fetchRecentEvents, setMode, setPaused, setWorldState, setEvents]);

  // Connect/disconnect SSE based on mode
  useEffect(() => {
    if (mode === 'simulation' && !isPaused) {
      connect();
    } else {
      disconnect();
    }
    return () => disconnect();
  }, [mode, isPaused, connect, disconnect]);

  // Handle start simulation - scientific mode (no city layout needed)
  const handleStartSimulation = useCallback(async () => {
    // Call backend to start simulation (spawns resources, shelters, agents automatically)
    const result = await start();
    if (!result.success) {
      alert(result.error || 'Failed to start simulation. Is the server running?');
      return;
    }

    // Update store with spawned entities
    setWorldState({
      tick: result.tick ?? 1,
      agents: result.agents ?? [],
      resourceSpawns: result.resourceSpawns ?? [],
      shelters: result.shelters ?? [],
    });

    // Switch to simulation mode
    setMode('simulation');

    // Connect SSE after setting state
    connect();
  }, [setMode, start, setWorldState, connect]);

  // Handle reset - calls BE to reset DB
  const handleReset = useCallback(async () => {
    disconnect();
    await reset();
    resetWorld();
    setMode('editor'); // Back to "ready" state
  }, [disconnect, reset, resetWorld, setMode]);

  // Handle pause - calls BE
  const handlePause = useCallback(async () => {
    await pause();
    disconnect();
  }, [pause, disconnect]);

  // Handle resume - calls BE
  const handleResume = useCallback(async () => {
    await resume();
    connect();
  }, [resume, connect]);

  // Handle enter replay mode
  const handleEnterReplay = useCallback(() => {
    disconnect(); // Disconnect SSE
    setMode('replay');
    enterReplayMode();
  }, [disconnect, setMode, enterReplayMode]);

  // Handle exit replay mode
  const handleExitReplay = useCallback(() => {
    exitReplayMode();
    setMode('simulation');
    connect(); // Reconnect SSE
  }, [exitReplayMode, setMode, connect]);

  // Error handler for logging/reporting
  const handleError = useCallback((error: Error, errorInfo: React.ErrorInfo) => {
    // Future: Send to error reporting service (Sentry, LogRocket, etc.)
    console.error('[App] Component error caught:', {
      error: error.message,
      componentStack: errorInfo.componentStack,
    });
  }, []);

  // Switch to profile view when agent is selected (mobile)
  useEffect(() => {
    if (selectedAgentId && window.innerWidth < 768) {
      setMobileView('profile');
    }
  }, [selectedAgentId]);

  // Render the appropriate canvas based on view mode
  const renderCanvas = () => {
    if (viewMode === 'isometric') {
      return <ScientificIsometricCanvas />;
    }
    return <ScientificCanvas />;
  };

  // Header content - responsive
  const headerContent = (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
        {/* Logo/Title - hide on very small screens when in simulation */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-6 h-6 sm:w-7 sm:h-7 bg-city-accent rounded-md flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white sm:w-4 sm:h-4">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
              <path d="M2 12h20" />
            </svg>
          </div>
          <h1 className="text-sm sm:text-base font-semibold text-city-text hidden xs:block">Agents City</h1>
          <span className="text-[10px] sm:text-xs text-city-text-muted hidden md:inline">Scientific Mode</span>
        </div>

        {/* World stats (only in simulation mode) - compact on mobile */}
        {mode === 'simulation' && (
          <div className="hidden sm:block">
            <WorldStats connectionStatus={status} />
          </div>
        )}

        {/* Mobile-only compact stats */}
        {mode === 'simulation' && (
          <div className="flex sm:hidden items-center gap-2 text-[10px]">
            <span className="text-city-text-muted">T:</span>
            <span className="font-mono text-city-text">{useWorldStore.getState().tick}</span>
            <span className={`w-1.5 h-1.5 rounded-full ${status === 'connected' ? 'bg-status-success' : 'bg-status-error'}`} />
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        {/* View Toggle - desktop only (hidden on mobile for space) */}
        <div className="hidden lg:block">
          <ViewToggle />
        </div>

        {/* Replay button (only in simulation mode) - icon only on mobile */}
        {mode === 'simulation' && (
          <button
            onClick={handleEnterReplay}
            className="px-2 py-1.5 sm:px-3 rounded bg-city-surface border border-city-border hover:bg-city-border text-city-text text-xs sm:text-sm flex items-center gap-1 sm:gap-2"
            title="Time Travel Replay"
          >
            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="hidden sm:inline">Replay</span>
          </button>
        )}

        {/* Mode controls - responsive */}
        <ModeControls
          onStartSimulation={handleStartSimulation}
          onReset={handleReset}
          onPause={handlePause}
          onResume={handleResume}
        />
      </div>
    </div>
  );

  // Analytics mode - render full-screen analytics page with error boundary
  if (isAnalyticsMode) {
    return (
      <ErrorBoundary sectionName="Analytics" onError={handleError}>
        <AnalyticsPage />
      </ErrorBoundary>
    );
  }

  // Replay mode - render full-screen replay page with error boundary
  if (isReplayMode) {
    return (
      <ErrorBoundary sectionName="Replay" onError={handleError}>
        <ReplayPage />
      </ErrorBoundary>
    );
  }

  // Ready mode (before simulation starts)
  const isReadyMode = mode === 'editor';

  // Mobile view content
  const renderMobileContent = () => {
    switch (mobileView) {
      case 'agents':
        return (
          <div className="h-full overflow-y-auto bg-city-bg pb-20">
            <ErrorBoundary sectionName="Agent Summary" onError={handleError} compact>
              <MobileAgentList />
            </ErrorBoundary>
          </div>
        );
      case 'events':
        return (
          <div className="h-full overflow-y-auto bg-city-bg pb-20">
            <ErrorBoundary sectionName="Event Feed" onError={handleError} compact>
              <EventFeed />
            </ErrorBoundary>
          </div>
        );
      case 'decisions':
        return (
          <div className="h-full overflow-y-auto bg-city-bg pb-20">
            <ErrorBoundary sectionName="Decision Log" onError={handleError} compact>
              <MobileDecisionLog />
            </ErrorBoundary>
          </div>
        );
      case 'profile':
        return (
          <div className="h-full overflow-y-auto bg-city-bg pb-20">
            {selectedAgentId ? (
              <ErrorBoundary sectionName="Agent Profile" onError={handleError} compact>
                <AgentProfile agentId={selectedAgentId} />
              </ErrorBoundary>
            ) : (
              <div className="p-4 text-city-text-muted text-sm text-center">
                <p>No agent selected</p>
                <p className="mt-2 text-xs">Tap an agent on the map to view details</p>
              </div>
            )}
          </div>
        );
      case 'canvas':
      default:
        return (
          <div className="h-full pb-16">
            <ErrorBoundary sectionName="Canvas" onError={handleError}>
              {renderCanvas()}
            </ErrorBoundary>
          </div>
        );
    }
  };

  return (
    <>
      {/* Desktop layout */}
      <div className="hidden md:block h-screen">
        <Layout
          header={headerContent}
          sidebar={
            isReadyMode ? (
              <div className="p-4">
                <h3 className="text-sm font-semibold text-city-text mb-2">Scientific Mode</h3>
                <p className="text-xs text-city-text-muted mb-4">
                  This experiment observes emergent behavior in an AI agent population.
                </p>
                <div className="space-y-3 text-xs text-city-text-muted">
                  <div>
                    <h4 className="font-medium text-city-text mb-1">What's Imposed:</h4>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li>Grid world (100x100)</li>
                      <li>Survival needs (hunger, energy, health)</li>
                      <li>Resource distribution</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium text-city-text mb-1">What Emerges:</h4>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li>Movement patterns</li>
                      <li>Resource gathering strategies</li>
                      <li>Social behaviors</li>
                    </ul>
                  </div>
                  <div className="pt-2 border-t border-city-border/30">
                    <p className="italic">Click "Start Simulation" to begin the experiment.</p>
                  </div>
                </div>
              </div>
            ) : selectedAgentId ? (
              <ErrorBoundary sectionName="Agent Profile" onError={handleError} compact>
                <AgentProfile agentId={selectedAgentId} />
              </ErrorBoundary>
            ) : (
              <div className="p-4 text-gray-400 text-sm">
                Click an agent on the grid to view details
              </div>
            )
          }
          feed={
            <ErrorBoundary sectionName="Event Feed" onError={handleError} compact>
              <EventFeed />
            </ErrorBoundary>
          }
        >
          {/* Canvas with error boundary - switches based on view mode */}
          <ErrorBoundary sectionName="Canvas" onError={handleError}>
            {renderCanvas()}
          </ErrorBoundary>

          {/* Floating panels with error boundaries - desktop only */}
          {!isReadyMode && (
            <>
              <ErrorBoundary sectionName="Agent Summary" onError={handleError} compact>
                <AgentSummaryTable />
              </ErrorBoundary>
              <ErrorBoundary sectionName="Decision Log" onError={handleError} compact>
                <DecisionLog />
              </ErrorBoundary>
            </>
          )}
        </Layout>
      </div>

      {/* Mobile layout */}
      <div className="md:hidden h-screen flex flex-col bg-city-bg">
        {/* Mobile header */}
        <header className="h-12 px-2 bg-city-surface/80 backdrop-blur-md border-b border-city-border/50 flex items-center justify-between shrink-0 z-20">
          {headerContent}
        </header>

        {/* Mobile content area */}
        <main className="flex-1 overflow-hidden relative">
          {isReadyMode ? (
            <div className="h-full overflow-y-auto p-4">
              <h3 className="text-base font-semibold text-city-text mb-3">Scientific Mode</h3>
              <p className="text-sm text-city-text-muted mb-4">
                This experiment observes emergent behavior in an AI agent population.
              </p>
              <div className="space-y-4 text-sm text-city-text-muted">
                <div>
                  <h4 className="font-medium text-city-text mb-2">What's Imposed:</h4>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Grid world (100x100)</li>
                    <li>Survival needs (hunger, energy, health)</li>
                    <li>Resource distribution</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium text-city-text mb-2">What Emerges:</h4>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Movement patterns</li>
                    <li>Resource gathering strategies</li>
                    <li>Social behaviors</li>
                  </ul>
                </div>
                <div className="pt-4 border-t border-city-border/30">
                  <p className="italic text-center">Tap "Start Simulation" above to begin</p>
                </div>
              </div>
            </div>
          ) : (
            renderMobileContent()
          )}
        </main>

        {/* Mobile navigation - only show when simulation is running */}
        {!isReadyMode && (
          <MobileNav
            currentView={mobileView}
            onViewChange={setMobileView}
            hasSelectedAgent={!!selectedAgentId}
            agentCount={aliveAgents.length}
            eventCount={events.length}
          />
        )}
      </div>
    </>
  );
}

/**
 * Mobile Agent List - Full-screen version of agent summary for mobile
 */
function MobileAgentList() {
  const agents = useAgents();
  const events = useEvents();
  const selectAgent = useWorldStore((s) => s.selectAgent);

  const aliveAgents = agents.filter(a => a.state !== 'dead');
  const sortedAgents = [...aliveAgents].sort((a, b) => b.balance - a.balance);

  return (
    <div className="p-4">
      <h3 className="text-sm font-semibold text-city-text mb-3 flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-city-accent">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        Agents ({sortedAgents.length})
      </h3>

      <div className="space-y-2">
        {sortedAgents.map((agent) => (
          <button
            key={agent.id}
            onClick={() => selectAgent(agent.id)}
            className="w-full p-3 bg-city-surface rounded-lg border border-city-border/50 flex items-center justify-between hover:bg-city-surface-hover active:bg-city-surface-hover transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                style={{ backgroundColor: agent.color }}
              >
                {agent.llmType.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="text-city-text font-medium capitalize text-sm">
                  {agent.llmType}
                </div>
                <div className="text-city-text-muted text-xs">
                  HP: {Math.round(agent.health)} | E: {Math.round(agent.energy)} | H: {Math.round(agent.hunger)}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-city-accent font-mono font-medium">
                {agent.balance}
              </div>
              <div className="text-city-text-muted text-[10px]">CITY</div>
            </div>
          </button>
        ))}

        {sortedAgents.length === 0 && (
          <div className="text-center text-city-text-muted py-8 text-sm">
            No active agents
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Mobile Decision Log - Full-screen version for mobile
 */
function MobileDecisionLog() {
  const events = useEvents();
  const agents = useAgents();

  // Filter decision events
  const actionTypes = ['agent_move', 'agent_work', 'agent_sleep', 'agent_buy', 'agent_consume'];
  const decisionEvents = events
    .filter((e) => actionTypes.includes(e.type))
    .slice(0, 50);

  return (
    <div className="p-4">
      <h3 className="text-sm font-semibold text-city-text mb-3 flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-city-accent">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Decisions ({decisionEvents.length})
      </h3>

      <div className="space-y-2">
        {decisionEvents.map((event) => {
          const agent = agents.find(a => a.id === event.agentId);
          const reasoning = event.payload?.reasoning as string;
          const action = (event.payload?.action as string) || event.type.replace('agent_', '');

          return (
            <div
              key={event.id}
              className="p-3 bg-city-surface rounded-lg border border-city-border/50"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-city-text-muted font-mono bg-city-bg px-1.5 py-0.5 rounded">
                    T{event.tick}
                  </span>
                  {agent && (
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: agent.color }}
                      />
                      <span className="text-city-text text-xs font-medium capitalize">
                        {agent.llmType}
                      </span>
                    </div>
                  )}
                </div>
                <span className="text-city-accent font-medium text-xs capitalize">
                  {action}
                </span>
              </div>
              {reasoning && (
                <p className="text-[11px] text-city-text-muted/80 italic line-clamp-3">
                  {reasoning}
                </p>
              )}
            </div>
          );
        })}

        {decisionEvents.length === 0 && (
          <div className="text-center text-city-text-muted py-8 text-sm">
            No decisions yet
          </div>
        )}
      </div>
    </div>
  );
}
