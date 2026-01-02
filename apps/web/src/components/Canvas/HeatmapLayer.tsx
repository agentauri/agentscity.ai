/**
 * Heatmap Layer Component
 *
 * Renders a semi-transparent heatmap overlay on top of the grid canvas.
 * Supports multiple metrics:
 * - agent_density: Where agents are concentrated
 * - resource_density: Where resources are concentrated
 * - activity: Where actions are happening (based on recent events)
 * - trust: Areas of high trust interactions
 * - conflict: Areas of conflict (harm, steal)
 */

import { useEffect, useRef, useMemo } from 'react';
import { useAgents, useResourceSpawns, useEvents } from '../../stores/world';
import { useHeatmapSettings, type HeatmapMetric } from '../../stores/visualization';

// Grid configuration (must match ScientificCanvas)
const TILE_SIZE = 12;
const GRID_SIZE = 100;

// Heatmap color scales (from cool to hot)
const COLOR_SCALES: Record<HeatmapMetric, string[]> = {
  none: [],
  agent_density: ['#0a0a2e', '#1e3a8a', '#3b82f6', '#60a5fa', '#93c5fd'],
  resource_density: ['#0a0a2e', '#166534', '#22c55e', '#86efac', '#bbf7d0'],
  activity: ['#0a0a2e', '#78350f', '#f59e0b', '#fbbf24', '#fef08a'],
  trust: ['#0a0a2e', '#155e75', '#06b6d4', '#22d3ee', '#a5f3fc'],
  conflict: ['#0a0a2e', '#7f1d1d', '#dc2626', '#ef4444', '#fca5a5'],
};

interface HeatmapLayerProps {
  camera: { x: number; y: number };
  zoom: number;
  width: number;
  height: number;
}

export function HeatmapLayer({ camera, zoom, width, height }: HeatmapLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { metric, opacity, enabled } = useHeatmapSettings();
  const agents = useAgents();
  const resourceSpawns = useResourceSpawns();
  const events = useEvents();

  // Compute heatmap data based on metric
  const heatmapData = useMemo(() => {
    if (!enabled || metric === 'none') return null;

    // Initialize grid with zeros
    const grid: number[][] = Array.from({ length: GRID_SIZE }, () =>
      Array(GRID_SIZE).fill(0)
    );

    switch (metric) {
      case 'agent_density':
        // Count agents at each position
        for (const agent of agents) {
          if (agent.state !== 'dead') {
            const x = Math.min(GRID_SIZE - 1, Math.max(0, Math.floor(agent.x)));
            const y = Math.min(GRID_SIZE - 1, Math.max(0, Math.floor(agent.y)));
            grid[y][x] += 1;
            // Add blur to neighbors for smoother visualization
            for (let dx = -2; dx <= 2; dx++) {
              for (let dy = -2; dy <= 2; dy++) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
                  const dist = Math.sqrt(dx * dx + dy * dy);
                  if (dist > 0 && dist <= 2) {
                    grid[ny][nx] += 0.3 / dist;
                  }
                }
              }
            }
          }
        }
        break;

      case 'resource_density':
        // Sum resource amounts at each position
        for (const spawn of resourceSpawns) {
          const x = Math.min(GRID_SIZE - 1, Math.max(0, Math.floor(spawn.x)));
          const y = Math.min(GRID_SIZE - 1, Math.max(0, Math.floor(spawn.y)));
          grid[y][x] += spawn.currentAmount / spawn.maxAmount;
          // Add blur to neighbors
          for (let dx = -3; dx <= 3; dx++) {
            for (let dy = -3; dy <= 3; dy++) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 0 && dist <= 3) {
                  grid[ny][nx] += (spawn.currentAmount / spawn.maxAmount) * (0.5 / dist);
                }
              }
            }
          }
        }
        break;

      case 'activity':
        // Count recent events at each position
        const recentEvents = events.slice(0, 50);
        for (const event of recentEvents) {
          if (event.agentId) {
            const agent = agents.find((a) => a.id === event.agentId);
            if (agent) {
              const x = Math.min(GRID_SIZE - 1, Math.max(0, Math.floor(agent.x)));
              const y = Math.min(GRID_SIZE - 1, Math.max(0, Math.floor(agent.y)));
              grid[y][x] += 0.5;
              // Blur
              for (let dx = -2; dx <= 2; dx++) {
                for (let dy = -2; dy <= 2; dy++) {
                  const nx = x + dx;
                  const ny = y + dy;
                  if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist > 0 && dist <= 2) {
                      grid[ny][nx] += 0.2 / dist;
                    }
                  }
                }
              }
            }
          }
        }
        break;

      case 'trust':
      case 'conflict':
        // Filter events by type
        const targetTypes =
          metric === 'trust'
            ? ['agent_trade', 'agent_traded', 'agent_share_info']
            : ['agent_harm', 'agent_harmed', 'agent_steal', 'agent_stole'];

        const filteredEvents = events.filter((e) => targetTypes.includes(e.type)).slice(0, 30);

        for (const event of filteredEvents) {
          if (event.agentId) {
            const agent = agents.find((a) => a.id === event.agentId);
            if (agent) {
              const x = Math.min(GRID_SIZE - 1, Math.max(0, Math.floor(agent.x)));
              const y = Math.min(GRID_SIZE - 1, Math.max(0, Math.floor(agent.y)));
              grid[y][x] += 1;
              // Blur
              for (let dx = -3; dx <= 3; dx++) {
                for (let dy = -3; dy <= 3; dy++) {
                  const nx = x + dx;
                  const ny = y + dy;
                  if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist > 0 && dist <= 3) {
                      grid[ny][nx] += 0.4 / dist;
                    }
                  }
                }
              }
            }
          }
        }
        break;
    }

    // Normalize grid values
    let maxVal = 0;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        maxVal = Math.max(maxVal, grid[y][x]);
      }
    }

    if (maxVal > 0) {
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          grid[y][x] /= maxVal;
        }
      }
    }

    return grid;
  }, [metric, enabled, agents, resourceSpawns, events]);

  // Draw heatmap
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !heatmapData || !enabled) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Apply camera transform
    ctx.save();
    ctx.translate(camera.x + width / 2, camera.y + height / 2);
    ctx.scale(zoom, zoom);

    const colorScale = COLOR_SCALES[metric];

    // Draw heatmap cells
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const value = heatmapData[y][x];
        if (value > 0.05) {
          // Only draw visible cells
          // Map value to color
          const colorIndex = Math.min(
            colorScale.length - 1,
            Math.floor(value * (colorScale.length - 1))
          );
          const color = colorScale[colorIndex];

          ctx.fillStyle = color;
          ctx.globalAlpha = opacity * value;
          ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }, [heatmapData, camera, zoom, width, height, metric, opacity, enabled]);

  if (!enabled || metric === 'none') return null;

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 5 }}
    />
  );
}

/**
 * Heatmap Controls Component
 * UI for selecting heatmap metric and adjusting opacity
 */
export function HeatmapControls() {
  const {
    setHeatmapMetric,
    setHeatmapOpacity,
    toggleHeatmap,
    heatmapMetric,
    heatmapOpacity,
    heatmapEnabled,
  } = useVisualizationStore();

  const metrics: { value: HeatmapMetric; label: string; icon: string }[] = [
    { value: 'none', label: 'Off', icon: '⚫' },
    { value: 'agent_density', label: 'Agents', icon: '👥' },
    { value: 'resource_density', label: 'Resources', icon: '📦' },
    { value: 'activity', label: 'Activity', icon: '⚡' },
    { value: 'trust', label: 'Trust', icon: '🤝' },
    { value: 'conflict', label: 'Conflict', icon: '⚔️' },
  ];

  return (
    <div className="bg-city-surface/95 backdrop-blur-sm rounded-lg border border-city-border p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-city-text">Heatmap</span>
        <button
          onClick={toggleHeatmap}
          className={`w-8 h-4 rounded-full transition-colors ${
            heatmapEnabled ? 'bg-city-accent' : 'bg-city-border'
          }`}
        >
          <div
            className={`w-3 h-3 rounded-full bg-white transition-transform ${
              heatmapEnabled ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {heatmapEnabled && (
        <>
          <div className="grid grid-cols-3 gap-1 mb-2">
            {metrics.map((m) => (
              <button
                key={m.value}
                onClick={() => setHeatmapMetric(m.value)}
                className={`px-2 py-1 rounded text-[10px] transition-colors ${
                  heatmapMetric === m.value
                    ? 'bg-city-accent text-white'
                    : 'bg-city-bg text-city-text-muted hover:bg-city-border'
                }`}
              >
                <span className="mr-1">{m.icon}</span>
                {m.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-city-text-muted">Opacity</span>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.1"
              value={heatmapOpacity}
              onChange={(e) => setHeatmapOpacity(Number(e.target.value))}
              className="flex-1 h-1 bg-city-border rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-[10px] text-city-text-muted w-6">
              {Math.round(heatmapOpacity * 100)}%
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// Import for HeatmapControls
import { useVisualizationStore } from '../../stores/visualization';
