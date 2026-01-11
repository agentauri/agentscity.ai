/**
 * SimAgents - Scientific Mode
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
import { useEditorStore, useAppMode, useIsAnalyticsMode, useIsReplayMode, useIsPromptsMode, useIsPaused, useViewMode } from './stores/editor';
import { useWorldControl } from './hooks/useWorldControl';
import { Layout } from './components/Layout';
import { ScientificCanvas } from './components/Canvas/ScientificCanvas';
import { ScientificIsometricCanvas } from './components/Canvas/ScientificIsometricCanvas';
import { EventFeed } from './components/EventFeed';
import { AgentProfile } from './components/AgentProfile';
import { WorldStats } from './components/WorldStats';
import { AgentSummaryTable } from './components/AgentSummaryTable';
import { DecisionLog } from './components/DecisionLog';
import { ModeControls, ViewToggle, EventFilters } from './components/Controls';
import { MobileNav, type MobileView } from './components/MobileNav';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { ReplayPage } from './pages/ReplayPage';
import { PromptsPage } from './pages/PromptsPage';
import { useReplayStore } from './stores/replay';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SocialGraphView, SocialGraphButton } from './components/SocialGraph';
import { MobileAgentList, MobileDecisionLog } from './components/Mobile';
import { ConfigPanel } from './components/ConfigPanel';

export default function App() {
  const { status, connect, disconnect } = useSSE();
  const selectedAgentId = useWorldStore((s) => s.selectedAgentId);
  const { resetWorld, setWorldState, setEvents, updateWorldState } = useWorldStore();
  const { setMode, setPaused } = useEditorStore();
  const mode = useAppMode();
  const viewMode = useViewMode();
  const isAnalyticsMode = useIsAnalyticsMode();
  const isReplayMode = useIsReplayMode();
  const isPromptsMode = useIsPromptsMode();
  const isPaused = useIsPaused();
  const { enterReplayMode, exitReplayMode } = useReplayStore();
  const [hasSynced, setHasSynced] = useState(false);

  // Mobile navigation state
  const [mobileView, setMobileView] = useState<MobileView>('canvas');
  // Config panel state
  const [showConfigPanel, setShowConfigPanel] = useState(false);
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
    <div className="flex items-center justify-between w-full gap-4">
      {/* Left: Logo + Title */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-7 h-7 bg-city-accent rounded-lg flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
            <path d="M2 12h20" />
          </svg>
        </div>
        <div className="hidden sm:block">
          <h1 className="text-sm font-semibold text-city-text leading-none">Sim Agents</h1>
          <span className="text-[10px] text-city-text-muted">Scientific Mode</span>
        </div>
      </div>

      {/* Stats (only in simulation mode) - aligned left after logo */}
      {mode === 'simulation' && (
        <WorldStats connectionStatus={status} />
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right: Controls */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Config button */}
        <button
          onClick={() => setShowConfigPanel(!showConfigPanel)}
          className={`p-2 rounded-lg border transition-colors ${
            showConfigPanel
              ? 'bg-blue-600 border-blue-500 text-white'
              : 'bg-city-surface border-city-border hover:bg-city-border text-city-text'
          }`}
          title="Configuration"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        {/* View Toggle - desktop only */}
        <div className="hidden lg:block">
          <ViewToggle />
        </div>

        {/* Social Graph button (only in simulation mode) */}
        {mode === 'simulation' && (
          <SocialGraphButton />
        )}

        {/* Prompts Gallery button */}
        <button
          onClick={() => setMode('prompts')}
          className="p-2 rounded-lg bg-city-surface border border-city-border hover:bg-city-border text-city-text transition-colors"
          title="Prompt Gallery"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </button>

        {/* Replay button (only in simulation mode) */}
        {mode === 'simulation' && (
          <button
            onClick={handleEnterReplay}
            className="p-2 rounded-lg bg-city-surface border border-city-border hover:bg-city-border text-city-text transition-colors"
            title="Time Travel Replay"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        )}

        {/* Mode controls */}
        <ModeControls
          onStartSimulation={handleStartSimulation}
          onReset={handleReset}
          onPause={handlePause}
          onResume={handleResume}
          onOpenConfig={() => setShowConfigPanel(true)}
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

  // Prompts mode - render full-screen prompt gallery with error boundary
  if (isPromptsMode) {
    return (
      <ErrorBoundary sectionName="Prompts" onError={handleError}>
        <PromptsPage />
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
      {/* Social Graph Overlay */}
      <SocialGraphView />

      {/* Config Panel */}
      {showConfigPanel && (
        <ConfigPanel onClose={() => setShowConfigPanel(false)} />
      )}

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
            <div className="flex flex-col h-full">
              {/* Event Filters */}
              <div className="shrink-0 p-2 border-b border-city-border/50">
                <EventFilters />
              </div>
              {/* Event Feed */}
              <div className="flex-1 overflow-hidden">
                <ErrorBoundary sectionName="Event Feed" onError={handleError} compact>
                  <EventFeed />
                </ErrorBoundary>
              </div>
            </div>
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
