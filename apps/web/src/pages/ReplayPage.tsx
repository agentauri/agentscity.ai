/**
 * Replay Page (Phase 3: Time Travel)
 *
 * Full-page UI for replaying simulation history.
 */

import { useEffect, useCallback, useRef } from 'react';
import {
  useReplayStore,
  useTickRange,
  useCurrentTick,
  useSnapshot,
  useIsPlaying,
  usePlaybackSpeed,
  useReplayLoading,
  useReplayError,
  useSelectedReplayAgent,
  useAgentTimeline,
  fetchTickRange,
  fetchWorldSnapshot,
  fetchAgentTimeline,
} from '../stores/replay';
import { useEditorStore } from '../stores/editor';

// =============================================================================
// Tick Slider
// =============================================================================

function TickSlider() {
  const tickRange = useTickRange();
  const currentTick = useCurrentTick();
  const isPlaying = useIsPlaying();
  const { setCurrentTick, setSnapshot, setLoading, setError } = useReplayStore();

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const tick = parseInt(e.target.value, 10);
    setCurrentTick(tick);

    // Fetch snapshot for this tick
    setLoading(true);
    try {
      const snapshot = await fetchWorldSnapshot(tick);
      setSnapshot(snapshot);
      setError(null);
    } catch (err) {
      setError('Failed to load snapshot');
    } finally {
      setLoading(false);
    }
  };

  if (!tickRange) return null;

  return (
    <div className="flex items-center gap-4 p-4 bg-city-surface border-b border-city-border">
      <span className="text-xs text-city-text-muted w-16">
        Tick {tickRange.minTick}
      </span>
      <input
        type="range"
        min={tickRange.minTick}
        max={tickRange.maxTick}
        value={currentTick}
        onChange={handleChange}
        disabled={isPlaying}
        className="flex-1 h-2 bg-city-border rounded-lg appearance-none cursor-pointer accent-city-accent"
      />
      <span className="text-xs text-city-text-muted w-16 text-right">
        Tick {tickRange.maxTick}
      </span>
      <div className="px-3 py-1 bg-city-accent text-white text-sm font-mono rounded">
        {currentTick}
      </div>
    </div>
  );
}

// =============================================================================
// Playback Controls
// =============================================================================

function PlaybackControls() {
  const isPlaying = useIsPlaying();
  const speed = usePlaybackSpeed();
  const tickRange = useTickRange();
  const currentTick = useCurrentTick();
  const { setPlaying, setPlaybackSpeed, setCurrentTick, setSnapshot, setError, exitReplayMode } = useReplayStore();
  const { setMode } = useEditorStore();

  const playIntervalRef = useRef<number | null>(null);

  // Handle play/pause
  const togglePlay = () => {
    setPlaying(!isPlaying);
  };

  // Handle speed change
  const cycleSpeed = () => {
    const speeds = [1, 2, 4, 8];
    const idx = speeds.indexOf(speed);
    const nextIdx = (idx + 1) % speeds.length;
    setPlaybackSpeed(speeds[nextIdx]);
  };

  // Step forward/backward
  const step = async (direction: 1 | -1) => {
    if (!tickRange) return;

    const newTick = Math.max(
      tickRange.minTick,
      Math.min(tickRange.maxTick, currentTick + direction)
    );

    if (newTick !== currentTick) {
      setCurrentTick(newTick);
      try {
        const snapshot = await fetchWorldSnapshot(newTick);
        setSnapshot(snapshot);
      } catch {
        setError('Failed to load snapshot');
      }
    }
  };

  // Auto-play effect
  useEffect(() => {
    if (isPlaying && tickRange) {
      const interval = 1000 / speed;
      playIntervalRef.current = window.setInterval(async () => {
        const { currentTick, tickRange } = useReplayStore.getState();
        if (!tickRange || currentTick >= tickRange.maxTick) {
          setPlaying(false);
          return;
        }

        const newTick = currentTick + 1;
        setCurrentTick(newTick);
        try {
          const snapshot = await fetchWorldSnapshot(newTick);
          setSnapshot(snapshot);
        } catch {
          setPlaying(false);
        }
      }, interval);

      return () => {
        if (playIntervalRef.current) {
          clearInterval(playIntervalRef.current);
        }
      };
    }
  }, [isPlaying, speed, setPlaying, setCurrentTick, setSnapshot, tickRange]);

  return (
    <div className="flex items-center gap-2 p-4 bg-city-surface border-b border-city-border">
      {/* Step backward */}
      <button
        onClick={() => step(-1)}
        disabled={isPlaying}
        className="p-2 rounded hover:bg-city-border disabled:opacity-50"
        title="Previous tick"
      >
        <svg className="w-5 h-5 text-city-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Play/Pause */}
      <button
        onClick={togglePlay}
        className="p-2 rounded bg-city-accent hover:bg-city-accent/80 text-white"
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          </svg>
        )}
      </button>

      {/* Step forward */}
      <button
        onClick={() => step(1)}
        disabled={isPlaying}
        className="p-2 rounded hover:bg-city-border disabled:opacity-50"
        title="Next tick"
      >
        <svg className="w-5 h-5 text-city-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Speed control */}
      <button
        onClick={cycleSpeed}
        className="px-3 py-1 rounded bg-city-border hover:bg-city-border/80 text-city-text text-sm font-mono"
        title="Change playback speed"
      >
        {speed}x
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Exit replay */}
      <button
        onClick={() => {
          exitReplayMode();
          setMode('simulation');
        }}
        className="px-3 py-1.5 rounded bg-city-surface border border-city-border hover:bg-city-border text-city-text text-sm"
      >
        Exit Replay
      </button>
    </div>
  );
}

// =============================================================================
// Replay Canvas (Simple Grid)
// =============================================================================

function ReplayCanvas() {
  const snapshot = useSnapshot();
  const selectedAgentId = useReplayStore((s) => s.selectedAgentId);
  const { selectAgent, setAgentTimeline } = useReplayStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleAgentClick = async (agentId: string) => {
    selectAgent(agentId);
    try {
      const timeline = await fetchAgentTimeline(agentId, 50);
      setAgentTimeline(timeline);
    } catch {
      // Ignore errors
    }
  };

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !snapshot) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const gridSize = 100;
    const cellSize = Math.min(width, height) / gridSize;

    // Clear
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);

    // Draw grid lines (faint)
    ctx.strokeStyle = '#2a2a4e';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= gridSize; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cellSize, 0);
      ctx.lineTo(i * cellSize, height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * cellSize);
      ctx.lineTo(width, i * cellSize);
      ctx.stroke();
    }

    // Draw resource spawns
    for (const spawn of snapshot.resourceSpawns) {
      const x = spawn.x * cellSize + cellSize / 2;
      const y = spawn.y * cellSize + cellSize / 2;
      const fillPercent = spawn.currentAmount / spawn.maxAmount;

      let color = '#22c55e'; // green for food
      if (spawn.resourceType === 'energy') color = '#eab308'; // yellow
      if (spawn.resourceType === 'material') color = '#8b5cf6'; // purple

      ctx.beginPath();
      ctx.arc(x, y, cellSize * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.3 + fillPercent * 0.7;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Draw shelters
    for (const shelter of snapshot.shelters) {
      const x = shelter.x * cellSize;
      const y = shelter.y * cellSize;

      ctx.fillStyle = '#3b82f6';
      ctx.globalAlpha = 0.5;
      ctx.fillRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
      ctx.globalAlpha = 1;
    }

    // Draw agents
    for (const agent of snapshot.agents) {
      const x = agent.x * cellSize + cellSize / 2;
      const y = agent.y * cellSize + cellSize / 2;
      const isSelected = agent.id === selectedAgentId;

      // Agent circle
      ctx.beginPath();
      ctx.arc(x, y, cellSize * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = getLLMColor(agent.llmType);
      ctx.fill();

      // Selection ring
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(x, y, cellSize * 0.45, 0, Math.PI * 2);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Health bar
      const healthPercent = agent.health / 100;
      ctx.fillStyle = healthPercent > 0.5 ? '#22c55e' : healthPercent > 0.25 ? '#eab308' : '#ef4444';
      ctx.fillRect(x - cellSize * 0.3, y + cellSize * 0.4, cellSize * 0.6 * healthPercent, 3);
    }
  }, [snapshot, selectedAgentId]);

  // Handle click on canvas
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !snapshot) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const gridSize = 100;
    const cellSize = Math.min(canvas.width, canvas.height) / gridSize;

    const gridX = Math.floor(x / cellSize);
    const gridY = Math.floor(y / cellSize);

    // Find agent at this position
    const agent = snapshot.agents.find(
      (a) => Math.round(a.x) === gridX && Math.round(a.y) === gridY
    );

    if (agent) {
      handleAgentClick(agent.id);
    } else {
      selectAgent(null);
    }
  };

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={600}
      onClick={handleClick}
      className="border border-city-border rounded cursor-pointer"
    />
  );
}

function getLLMColor(llmType: string): string {
  const colors: Record<string, string> = {
    claude: '#ff6b35',
    gemini: '#4285f4',
    codex: '#10a37f',
    deepseek: '#00d4aa',
    qwen: '#7c3aed',
    glm: '#f59e0b',
    grok: '#1da1f2',
    external: '#ec4899',
  };
  return colors[llmType] || '#6b7280';
}

// =============================================================================
// Event Timeline
// =============================================================================

function EventTimeline() {
  const snapshot = useSnapshot();
  const events = snapshot?.events ?? [];

  if (events.length === 0) {
    return (
      <div className="p-4 text-city-text-muted text-sm">
        No events at this tick
      </div>
    );
  }

  return (
    <div className="p-4 space-y-2 max-h-[300px] overflow-y-auto">
      <h3 className="text-sm font-semibold text-city-text mb-2">
        Events at Tick {snapshot?.tick}
      </h3>
      {events.map((event) => (
        <div
          key={event.id}
          className="p-2 bg-city-border/30 rounded text-xs"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium text-city-text">
              {event.eventType}
            </span>
            {event.agentId && (
              <span className="text-city-text-muted">
                {event.agentId.slice(0, 8)}...
              </span>
            )}
          </div>
          <pre className="text-city-text-muted text-xs overflow-x-auto">
            {JSON.stringify(event.payload, null, 2).slice(0, 100)}
          </pre>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Agent State Panel
// =============================================================================

function AgentStatePanel() {
  const agent = useSelectedReplayAgent();
  const timeline = useAgentTimeline();
  const { selectAgent } = useReplayStore();

  if (!agent) {
    return (
      <div className="p-4 text-city-text-muted text-sm">
        Click an agent on the grid to view details
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: getLLMColor(agent.llmType) }}
          />
          <h3 className="font-semibold text-city-text">{agent.llmType}</h3>
        </div>
        <button
          onClick={() => selectAgent(null)}
          className="text-city-text-muted hover:text-city-text"
        >
          x
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="p-2 bg-city-border/30 rounded">
          <div className="text-city-text-muted">Position</div>
          <div className="text-city-text font-mono">({agent.x}, {agent.y})</div>
        </div>
        <div className="p-2 bg-city-border/30 rounded">
          <div className="text-city-text-muted">State</div>
          <div className="text-city-text">{agent.state}</div>
        </div>
        <div className="p-2 bg-city-border/30 rounded">
          <div className="text-city-text-muted">Health</div>
          <div className="text-city-text">{agent.health}%</div>
        </div>
        <div className="p-2 bg-city-border/30 rounded">
          <div className="text-city-text-muted">Energy</div>
          <div className="text-city-text">{agent.energy}%</div>
        </div>
        <div className="p-2 bg-city-border/30 rounded">
          <div className="text-city-text-muted">Hunger</div>
          <div className="text-city-text">{agent.hunger}%</div>
        </div>
        <div className="p-2 bg-city-border/30 rounded">
          <div className="text-city-text-muted">Balance</div>
          <div className="text-city-text">{agent.balance} CITY</div>
        </div>
      </div>

      {/* Timeline */}
      {timeline.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-city-text">Recent Actions</h4>
          <div className="max-h-[200px] overflow-y-auto space-y-1">
            {timeline.slice(0, 20).map((entry, i) => (
              <div
                key={i}
                className={`p-2 rounded text-xs ${
                  entry.success === false
                    ? 'bg-red-500/10 border border-red-500/30'
                    : 'bg-city-border/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-city-text">Tick {entry.tick}</span>
                  {entry.action && (
                    <span className="text-city-accent">{entry.action}</span>
                  )}
                </div>
                <div className="text-city-text-muted">{entry.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Main Page
// =============================================================================

export function ReplayPage() {
  const isLoading = useReplayLoading();
  const error = useReplayError();
  const { setTickRange, setSnapshot, setCurrentTick, setLoading, setError } = useReplayStore();

  // Load initial data
  const loadInitialData = useCallback(async () => {
    setLoading(true);
    try {
      const range = await fetchTickRange();
      setTickRange(range);

      // Load snapshot at max tick
      if (range.maxTick > 0) {
        const snapshot = await fetchWorldSnapshot(range.maxTick);
        setSnapshot(snapshot);
        setCurrentTick(range.maxTick);
      }

      setError(null);
    } catch (err) {
      setError('Failed to load replay data');
    } finally {
      setLoading(false);
    }
  }, [setTickRange, setSnapshot, setCurrentTick, setLoading, setError]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  if (isLoading && !useSnapshot()) {
    return (
      <div className="min-h-screen bg-city-bg flex items-center justify-center">
        <div className="text-city-text">Loading replay data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-city-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 mb-4">{error}</div>
          <button
            onClick={loadInitialData}
            className="px-4 py-2 bg-city-accent text-white rounded hover:bg-city-accent/80"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-city-bg flex flex-col">
      {/* Header */}
      <div className="bg-city-surface border-b border-city-border p-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-city-accent rounded-md flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-base font-semibold text-city-text">Agents City</h1>
          <span className="text-xs text-city-text-muted">Time Travel Replay</span>
        </div>
      </div>

      {/* Controls */}
      <PlaybackControls />
      <TickSlider />

      {/* Main content */}
      <div className="flex-1 flex p-4 gap-4">
        {/* Left: Canvas */}
        <div className="flex-shrink-0">
          <ReplayCanvas />
        </div>

        {/* Right: Sidebar */}
        <div className="flex-1 flex flex-col gap-4 min-w-[300px]">
          {/* Agent panel */}
          <div className="bg-city-surface border border-city-border rounded-lg flex-1 overflow-hidden">
            <AgentStatePanel />
          </div>

          {/* Event timeline */}
          <div className="bg-city-surface border border-city-border rounded-lg max-h-[300px] overflow-hidden">
            <EventTimeline />
          </div>
        </div>
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center">
          <div className="bg-city-surface p-4 rounded-lg shadow-lg">
            <div className="text-city-text">Loading...</div>
          </div>
        </div>
      )}
    </div>
  );
}
