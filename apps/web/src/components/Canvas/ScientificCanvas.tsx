/**
 * Scientific Canvas - Simple grid visualization for the scientific model
 *
 * Shows:
 * - Agents as colored circles
 * - Resource spawns as colored squares (food=green, energy=yellow, material=brown)
 * - Shelters as gray squares
 * - Grid lines for reference
 *
 * Touch support:
 * - Single finger drag to pan
 * - Pinch to zoom
 * - Tap to select agent
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useWorldStore, useAgents, useResourceSpawns, useShelters, type BiomeType, BIOME_COLORS } from '../../stores/world';
import { HeatmapLayer, HeatmapControls } from './HeatmapLayer';

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

// Touch point type (minimal interface we need)
interface TouchPoint {
  clientX: number;
  clientY: number;
}

// Helper to get distance between two touch points
function getTouchDistance(touch1: TouchPoint, touch2: TouchPoint): number {
  const dx = touch1.clientX - touch2.clientX;
  const dy = touch1.clientY - touch2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

// Helper to get center point between two touches
function getTouchCenter(touch1: TouchPoint, touch2: TouchPoint): { x: number; y: number } {
  return {
    x: (touch1.clientX + touch2.clientX) / 2,
    y: (touch1.clientY + touch2.clientY) / 2,
  };
}

export function ScientificCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Camera state
  const [camera, setCamera] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [cameraStart, setCameraStart] = useState({ x: 0, y: 0 });

  // Touch state for pinch zoom
  const touchRef = useRef<{
    lastDistance: number;
    lastCenter: { x: number; y: number };
    startZoom: number;
  } | null>(null);

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

    // Draw biome backgrounds (quadrant-based)
    const midX = 50;
    const midY = 50;
    const biomeAlpha = 0.15; // Subtle background tint

    // NW: Forest (green)
    ctx.fillStyle = BIOME_COLORS.forest;
    ctx.globalAlpha = biomeAlpha;
    ctx.fillRect(0, 0, midX * TILE_SIZE, midY * TILE_SIZE);

    // NE: Tundra (blue)
    ctx.fillStyle = BIOME_COLORS.tundra;
    ctx.fillRect(midX * TILE_SIZE, 0, midX * TILE_SIZE, midY * TILE_SIZE);

    // SW: Desert (orange)
    ctx.fillStyle = BIOME_COLORS.desert;
    ctx.fillRect(0, midY * TILE_SIZE, midX * TILE_SIZE, midY * TILE_SIZE);

    // SE: Plains (lime)
    ctx.fillStyle = BIOME_COLORS.plains;
    ctx.fillRect(midX * TILE_SIZE, midY * TILE_SIZE, midX * TILE_SIZE, midY * TILE_SIZE);

    ctx.globalAlpha = 1;

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

    // Group agents by position to handle overlapping
    const agentsByPosition = new Map<string, typeof agents>();
    for (const agent of agents) {
      const key = `${agent.x},${agent.y}`;
      if (!agentsByPosition.has(key)) {
        agentsByPosition.set(key, []);
      }
      agentsByPosition.get(key)!.push(agent);
    }

    // Draw agents with offset for overlapping ones
    for (const agent of agents) {
      const key = `${agent.x},${agent.y}`;
      const agentsAtPosition = agentsByPosition.get(key) || [];
      const indexAtPosition = agentsAtPosition.indexOf(agent);
      const countAtPosition = agentsAtPosition.length;

      // Calculate offset for overlapping agents (arrange in a circle pattern)
      let offsetX = 0;
      let offsetY = 0;
      if (countAtPosition > 1) {
        const angle = (indexAtPosition / countAtPosition) * Math.PI * 2;
        const offsetRadius = AGENT_RADIUS * 0.8;
        offsetX = Math.cos(angle) * offsetRadius;
        offsetY = Math.sin(angle) * offsetRadius;
      }

      const centerX = agent.x * TILE_SIZE + TILE_SIZE / 2 + offsetX;
      const centerY = agent.y * TILE_SIZE + TILE_SIZE / 2 + offsetY;

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

    // Draw overlap count badges
    for (const [key, agentsAtPos] of agentsByPosition) {
      if (agentsAtPos.length > 1) {
        const [x, y] = key.split(',').map(Number);
        const badgeX = x * TILE_SIZE + TILE_SIZE - 2;
        const badgeY = y * TILE_SIZE + 4;

        // Badge background
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(badgeX, badgeY, 6, 0, Math.PI * 2);
        ctx.fill();

        // Badge text
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 7px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(String(agentsAtPos.length), badgeX, badgeY + 2.5);
      }
    }

    ctx.restore();

    // Draw legend (responsive positioning)
    const isMobile = width < 500;
    const legendX = 10;
    const legendY = isMobile ? 12 : 20;
    const lineHeight = isMobile ? 12 : 15;
    const fontSize = isMobile ? 10 : 12;

    ctx.fillStyle = '#ffffff';
    ctx.font = `${fontSize}px monospace`;
    ctx.textAlign = 'left';
    ctx.fillText(`Tick: ${tick}`, legendX, legendY);
    ctx.fillText(`Agents: ${agents.length}`, legendX, legendY + lineHeight);

    // Resource type legend (hide on very small screens)
    if (width >= 320) {
      const resourceY = legendY + lineHeight * 2 + 5;
      const resourceSize = isMobile ? 8 : 10;
      const resourceSpacing = isMobile ? 50 : 60;

      ctx.fillStyle = COLORS.food;
      ctx.fillRect(legendX, resourceY, resourceSize, resourceSize);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('Food', legendX + resourceSize + 5, resourceY + resourceSize - 1);

      ctx.fillStyle = COLORS.energy;
      ctx.fillRect(legendX + resourceSpacing, resourceY, resourceSize, resourceSize);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('Energy', legendX + resourceSpacing + resourceSize + 5, resourceY + resourceSize - 1);

      if (width >= 400) {
        ctx.fillStyle = COLORS.material;
        ctx.fillRect(legendX + resourceSpacing * 2 + 10, resourceY, resourceSize, resourceSize);
        ctx.fillStyle = '#ffffff';
        ctx.fillText('Material', legendX + resourceSpacing * 2 + resourceSize + 15, resourceY + resourceSize - 1);
      }
    }

    // Biome legend (top right)
    if (width >= 400) {
      const biomeY = legendY;
      const biomeX = width - 180;
      const biomeSize = isMobile ? 8 : 10;

      ctx.font = `bold ${fontSize}px monospace`;
      ctx.fillStyle = '#888888';
      ctx.textAlign = 'right';
      ctx.fillText('Biomes:', biomeX - 5, biomeY);

      ctx.textAlign = 'left';
      const biomes: [BiomeType, string][] = [
        ['forest', 'Forest'],
        ['tundra', 'Tundra'],
        ['desert', 'Desert'],
        ['plains', 'Plains'],
      ];

      biomes.forEach(([biome, label], i) => {
        const bx = biomeX + (i % 2) * 70;
        const by = biomeY + Math.floor(i / 2) * lineHeight;
        ctx.fillStyle = BIOME_COLORS[biome];
        ctx.globalAlpha = 0.8;
        ctx.fillRect(bx, by - biomeSize + 2, biomeSize, biomeSize);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff';
        ctx.font = `${fontSize - 2}px monospace`;
        ctx.fillText(label, bx + biomeSize + 3, by);
      });
    }

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

  // Handle mouse pan
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

  // Handle touch start
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault();

    if (e.touches.length === 1) {
      // Single finger - start drag
      const touch = e.touches[0];
      setIsDragging(true);
      setDragStart({ x: touch.clientX, y: touch.clientY });
      setCameraStart({ ...camera });
      touchRef.current = null;
    } else if (e.touches.length === 2) {
      // Two fingers - start pinch zoom
      const touch1: TouchPoint = { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
      const touch2: TouchPoint = { clientX: e.touches[1].clientX, clientY: e.touches[1].clientY };
      const distance = getTouchDistance(touch1, touch2);
      const center = getTouchCenter(touch1, touch2);
      touchRef.current = {
        lastDistance: distance,
        lastCenter: center,
        startZoom: zoom,
      };
      setIsDragging(false);
    }
  }, [camera, zoom]);

  // Handle touch move
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();

    if (e.touches.length === 1 && isDragging) {
      // Single finger drag
      const touch = e.touches[0];
      setCamera({
        x: cameraStart.x + (touch.clientX - dragStart.x),
        y: cameraStart.y + (touch.clientY - dragStart.y),
      });
    } else if (e.touches.length === 2 && touchRef.current) {
      // Pinch zoom
      const touch1: TouchPoint = { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
      const touch2: TouchPoint = { clientX: e.touches[1].clientX, clientY: e.touches[1].clientY };
      const distance = getTouchDistance(touch1, touch2);
      const center = getTouchCenter(touch1, touch2);

      // Calculate zoom change
      const scale = distance / touchRef.current.lastDistance;
      const newZoom = Math.max(0.5, Math.min(3, touchRef.current.startZoom * scale));
      setZoom(newZoom);

      // Pan to keep zoom centered
      const dx = center.x - touchRef.current.lastCenter.x;
      const dy = center.y - touchRef.current.lastCenter.y;
      setCamera((c) => ({
        x: c.x + dx,
        y: c.y + dy,
      }));

      touchRef.current.lastCenter = center;
    }
  }, [isDragging, dragStart, cameraStart]);

  // Handle touch end
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      setIsDragging(false);
      touchRef.current = null;
    } else if (e.touches.length === 1) {
      // Transition from pinch to drag
      const touch = e.touches[0];
      setIsDragging(true);
      setDragStart({ x: touch.clientX, y: touch.clientY });
      setCameraStart({ ...camera });
      touchRef.current = null;
    }
  }, [camera]);

  // Convert screen coordinates to world coordinates
  const screenToWorld = useCallback((screenX: number, screenY: number) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = screenX - rect.left;
    const mouseY = screenY - rect.top;

    const worldX = (mouseX - canvasRef.current.width / 2 - camera.x) / zoom;
    const worldY = (mouseY - canvasRef.current.height / 2 - camera.y) / zoom;

    return { x: worldX, y: worldY };
  }, [camera, zoom]);

  // Handle click to select agent
  const handleClick = useCallback((e: React.MouseEvent) => {
    const { x: worldX, y: worldY } = screenToWorld(e.clientX, e.clientY);

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
  }, [agents, screenToWorld, selectedAgentId, selectAgent]);

  // Handle tap to select agent (touch)
  const handleTap = useCallback((e: React.TouchEvent) => {
    // Only handle single tap (not part of a gesture)
    if (e.changedTouches.length !== 1) return;

    const touch = e.changedTouches[0];
    const { x: worldX, y: worldY } = screenToWorld(touch.clientX, touch.clientY);

    // Check if any agent was tapped
    for (const agent of agents) {
      const centerX = agent.x * TILE_SIZE + TILE_SIZE / 2;
      const centerY = agent.y * TILE_SIZE + TILE_SIZE / 2;
      const dist = Math.sqrt((worldX - centerX) ** 2 + (worldY - centerY) ** 2);

      // Larger hit area for touch
      if (dist < AGENT_RADIUS + 10) {
        selectAgent(agent.id === selectedAgentId ? null : agent.id);
        return;
      }
    }

    // Tapped empty space - deselect
    selectAgent(null);
  }, [agents, screenToWorld, selectedAgentId, selectAgent]);

  // Track if touch moved (to distinguish tap from drag)
  const touchMovedRef = useRef(false);

  const handleTouchStartWithTap = useCallback((e: React.TouchEvent) => {
    touchMovedRef.current = false;
    handleTouchStart(e);
  }, [handleTouchStart]);

  const handleTouchMoveWithTap = useCallback((e: React.TouchEvent) => {
    touchMovedRef.current = true;
    handleTouchMove(e);
  }, [handleTouchMove]);

  const handleTouchEndWithTap = useCallback((e: React.TouchEvent) => {
    handleTouchEnd(e);
    // If touch didn't move much, treat as tap
    if (!touchMovedRef.current && e.changedTouches.length === 1) {
      handleTap(e);
    }
  }, [handleTouchEnd, handleTap]);

  // Reset camera
  const resetCamera = useCallback(() => {
    setCamera({ x: 0, y: 0 });
    setZoom(1);
  }, []);

  // Track canvas dimensions for heatmap
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (canvasRef.current) {
      setCanvasDimensions({
        width: canvasRef.current.width,
        height: canvasRef.current.height,
      });
    }
  }, [canvasRef.current?.width, canvasRef.current?.height]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-[#1a1a2e] touch-none"
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
        onTouchStart={handleTouchStartWithTap}
        onTouchMove={handleTouchMoveWithTap}
        onTouchEnd={handleTouchEndWithTap}
        onTouchCancel={handleTouchEnd}
      />

      {/* Heatmap overlay layer */}
      <HeatmapLayer
        camera={camera}
        zoom={zoom}
        width={canvasDimensions.width}
        height={canvasDimensions.height}
      />

      {/* Heatmap controls - top left */}
      <div className="absolute top-4 left-4 hidden md:block" style={{ zIndex: 15 }}>
        <HeatmapControls />
      </div>

      {/* Controls - responsive positioning and sizing */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-2 md:bottom-4 md:right-4" style={{ zIndex: 10 }}>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
          className="w-10 h-10 md:w-10 md:h-10 bg-city-surface border border-city-border rounded-lg text-white hover:bg-city-accent active:bg-city-accent transition-colors font-bold text-lg shadow-lg"
          title="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))}
          className="w-10 h-10 md:w-10 md:h-10 bg-city-surface border border-city-border rounded-lg text-white hover:bg-city-accent active:bg-city-accent transition-colors font-bold text-lg shadow-lg"
          title="Zoom out"
        >
          -
        </button>
        <button
          type="button"
          onClick={resetCamera}
          className="w-10 h-10 md:w-10 md:h-10 bg-city-surface border border-city-border rounded-lg text-white hover:bg-city-accent active:bg-city-accent transition-colors text-sm font-medium shadow-lg"
          title="Reset camera"
        >
          R
        </button>
      </div>

      {/* Help text - responsive, hide on very small screens */}
      <div
        className="absolute bottom-4 left-4 text-[10px] sm:text-xs text-gray-400 bg-black/40 px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg hidden sm:block"
        style={{ zIndex: 10 }}
      >
        <span className="hidden md:inline">Drag to pan | Scroll to zoom | </span>
        <span className="md:hidden">Pinch to zoom | </span>
        <span className="hidden sm:inline">Tap agent to select</span>
      </div>
    </div>
  );
}
