/**
 * AgentsCity - Scientific Mode
 *
 * Simplified interface for the scientific experiment:
 * - No city editor (resources/shelters are spawned automatically)
 * - Grid visualization shows agents, resources, shelters
 * - Focus on observing emergent behavior
 */

import { useEffect, useCallback, useState } from 'react';
import { useSSE } from './hooks/useSSE';
import { useWorldStore } from './stores/world';
import { useEditorStore, useAppMode, useIsAnalyticsMode, useIsPaused } from './stores/editor';
import { useWorldControl } from './hooks/useWorldControl';
import { Layout } from './components/Layout';
import { ScientificCanvas } from './components/Canvas/ScientificCanvas';
import { EventFeed } from './components/EventFeed';
import { AgentProfile } from './components/AgentProfile';
import { WorldStats } from './components/WorldStats';
import { AgentSummaryTable } from './components/AgentSummaryTable';
import { DecisionLog } from './components/DecisionLog';
import { ModeControls } from './components/Controls';
import { AnalyticsPage } from './pages/AnalyticsPage';

export default function App() {
  const { status, connect, disconnect } = useSSE();
  const selectedAgentId = useWorldStore((s) => s.selectedAgentId);
  const { resetWorld, setWorldState, setEvents, updateWorldState } = useWorldStore();
  const { setMode, setPaused } = useEditorStore();
  const mode = useAppMode();
  const isAnalyticsMode = useIsAnalyticsMode();
  const isPaused = useIsPaused();
  const [hasSynced, setHasSynced] = useState(false);

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

  // Header content
  const headerContent = (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-4">
        {/* Logo/Title */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-city-accent rounded-md flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
              <path d="M2 12h20" />
            </svg>
          </div>
          <h1 className="text-base font-semibold text-city-text">Agents City</h1>
          <span className="text-xs text-city-text-muted">Scientific Mode</span>
        </div>

        {/* World stats (only in simulation mode) */}
        {mode === 'simulation' && (
          <WorldStats connectionStatus={status} />
        )}
      </div>

      {/* Mode controls */}
      <ModeControls
        onStartSimulation={handleStartSimulation}
        onReset={handleReset}
        onPause={handlePause}
        onResume={handleResume}
      />
    </div>
  );

  // Analytics mode - render full-screen analytics page
  if (isAnalyticsMode) {
    return <AnalyticsPage />;
  }

  // Ready mode (before simulation starts)
  const isReadyMode = mode === 'editor';

  return (
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
          <AgentProfile agentId={selectedAgentId} />
        ) : (
          <div className="p-4 text-gray-400 text-sm">
            Click an agent on the grid to view details
          </div>
        )
      }
      feed={<EventFeed />}
    >
      <ScientificCanvas />
      {!isReadyMode && (
        <>
          <AgentSummaryTable />
          <DecisionLog />
        </>
      )}
    </Layout>
  );
}
