/**
 * Scientific Canvas - Simple grid visualization for the scientific model
 *
 * Shows:
 * - Agents as colored circles
 * - Resource spawns as colored squares (food=green, energy=yellow, material=brown)
 * - Shelters as gray squares
 * - Grid lines for reference
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useWorldStore, useAgents, useResourceSpawns, useShelters } from '../../stores/world';

// Grid configuration
const TILE_SIZE = 12; // Pixels per tile
const GRID_SIZE = 100; // 100x100 grid
const AGENT_RADIUS = 5;

// Colors
const COLORS = {
  background: '#1a1a2e',
  grid: '#2a2a4e',
  gridMajor: '#3a3a5e',
  food: '#22c55e', // Green
  energy: '#eab308', // Yellow
  material: '#a16207', // Brown
  shelter: '#6b7280', // Gray
};

export function ScientificCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Camera state
  const [camera, setCamera] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [cameraStart, setCameraStart] = useState({ x: 0, y: 0 });

  // World state
  const agents = useAgents();
  const resourceSpawns = useResourceSpawns();
  const shelters = useShelters();
  const tick = useWorldStore((s) => s.tick);
  const selectedAgentId = useWorldStore((s) => s.selectedAgentId);
  const selectAgent = useWorldStore((s) => s.selectAgent);

  // Draw the canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;

    // Clear
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, width, height);

    // Save context for camera transform
    ctx.save();
    ctx.translate(camera.x + width / 2, camera.y + height / 2);
    ctx.scale(zoom, zoom);

    // Draw grid
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= GRID_SIZE; x++) {
      const isMajor = x % 10 === 0;
      ctx.strokeStyle = isMajor ? COLORS.gridMajor : COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(x * TILE_SIZE, 0);
      ctx.lineTo(x * TILE_SIZE, GRID_SIZE * TILE_SIZE);
      ctx.stroke();
    }
    for (let y = 0; y <= GRID_SIZE; y++) {
      const isMajor = y % 10 === 0;
      ctx.strokeStyle = isMajor ? COLORS.gridMajor : COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(0, y * TILE_SIZE);
      ctx.lineTo(GRID_SIZE * TILE_SIZE, y * TILE_SIZE);
      ctx.stroke();
    }

    // Draw shelters (gray squares)
    for (const shelter of shelters) {
      ctx.fillStyle = COLORS.shelter;
      ctx.fillRect(
        shelter.x * TILE_SIZE + 2,
        shelter.y * TILE_SIZE + 2,
        TILE_SIZE - 4,
        TILE_SIZE - 4
      );
    }

    // Draw resource spawns
    for (const spawn of resourceSpawns) {
      const color = spawn.resourceType === 'food' ? COLORS.food :
                    spawn.resourceType === 'energy' ? COLORS.energy :
                    COLORS.material;

      // Size based on current amount
      const sizeFactor = spawn.currentAmount / spawn.maxAmount;
      const size = (TILE_SIZE - 2) * Math.max(0.3, sizeFactor);

      ctx.fillStyle = color;
      ctx.globalAlpha = 0.3 + 0.7 * sizeFactor;
      ctx.fillRect(
        spawn.x * TILE_SIZE + (TILE_SIZE - size) / 2,
        spawn.y * TILE_SIZE + (TILE_SIZE - size) / 2,
        size,
        size
      );
      ctx.globalAlpha = 1;

      // Border
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(
        spawn.x * TILE_SIZE + 1,
        spawn.y * TILE_SIZE + 1,
        TILE_SIZE - 2,
        TILE_SIZE - 2
      );
    }

    // Draw agents
    for (const agent of agents) {
      const centerX = agent.x * TILE_SIZE + TILE_SIZE / 2;
      const centerY = agent.y * TILE_SIZE + TILE_SIZE / 2;

      // Selection ring
      if (agent.id === selectedAgentId) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, AGENT_RADIUS + 3, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Agent circle
      ctx.fillStyle = agent.state === 'dead' ? '#444444' : agent.color;
      ctx.beginPath();
      ctx.arc(centerX, centerY, AGENT_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      // Health indicator (red border if low)
      if (agent.health < 30 && agent.state !== 'dead') {
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, AGENT_RADIUS, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Agent label
      ctx.fillStyle = '#ffffff';
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(agent.llmType.slice(0, 1).toUpperCase(), centerX, centerY + 3);
    }

    ctx.restore();

    // Draw legend
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Tick: ${tick}`, 10, 20);
    ctx.fillText(`Agents: ${agents.length}`, 10, 35);
    ctx.fillText(`Resources: ${resourceSpawns.length}`, 10, 50);

    // Resource type legend
    ctx.fillStyle = COLORS.food;
    ctx.fillRect(10, 60, 10, 10);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Food', 25, 70);

    ctx.fillStyle = COLORS.energy;
    ctx.fillRect(70, 60, 10, 10);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Energy', 85, 70);

    ctx.fillStyle = COLORS.material;
    ctx.fillRect(140, 60, 10, 10);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Material', 155, 70);

  }, [agents, resourceSpawns, shelters, tick, selectedAgentId, camera, zoom]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current || !canvasRef.current) return;
      const { width, height } = containerRef.current.getBoundingClientRect();
      canvasRef.current.width = width;
      canvasRef.current.height = height;
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((z) => Math.max(0.5, Math.min(3, z + delta)));
  }, []);

  // Handle pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      setCameraStart({ ...camera });
    }
  }, [camera]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setCamera({
      x: cameraStart.x + (e.clientX - dragStart.x),
      y: cameraStart.y + (e.clientY - dragStart.y),
    });
  }, [isDragging, dragStart, cameraStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Handle click to select agent
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Convert to world coordinates
    const worldX = (mouseX - canvasRef.current.width / 2 - camera.x) / zoom;
    const worldY = (mouseY - canvasRef.current.height / 2 - camera.y) / zoom;

    // Check if any agent was clicked
    for (const agent of agents) {
      const centerX = agent.x * TILE_SIZE + TILE_SIZE / 2;
      const centerY = agent.y * TILE_SIZE + TILE_SIZE / 2;
      const dist = Math.sqrt((worldX - centerX) ** 2 + (worldY - centerY) ** 2);

      if (dist < AGENT_RADIUS + 5) {
        selectAgent(agent.id === selectedAgentId ? null : agent.id);
        return;
      }
    }

    // Clicked empty space - deselect
    selectAgent(null);
  }, [agents, camera, zoom, selectedAgentId, selectAgent]);

  // Reset camera
  const resetCamera = useCallback(() => {
    setCamera({ x: 0, y: 0 });
    setZoom(1);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-[#1a1a2e]"
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
      />

      {/* Controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-2" style={{ zIndex: 10 }}>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
          className="w-10 h-10 bg-city-surface border border-city-border rounded-lg text-white hover:bg-city-accent transition-colors font-bold text-lg shadow-lg"
          title="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))}
          className="w-10 h-10 bg-city-surface border border-city-border rounded-lg text-white hover:bg-city-accent transition-colors font-bold text-lg shadow-lg"
          title="Zoom out"
        >
          -
        </button>
        <button
          type="button"
          onClick={resetCamera}
          className="w-10 h-10 bg-city-surface border border-city-border rounded-lg text-white hover:bg-city-accent transition-colors text-sm font-medium shadow-lg"
          title="Reset camera"
        >
          R
        </button>
      </div>

      {/* Help text */}
      <div
        className="absolute bottom-4 left-4 text-xs text-gray-400 bg-black/40 px-3 py-2 rounded-lg"
        style={{ zIndex: 10 }}
      >
        Drag to pan | Scroll to zoom | Click agent to select
      </div>
    </div>
  );
}
